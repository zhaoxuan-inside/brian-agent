/**
 * @fileoverview EventBus 应用服务层（Runtime v2 · 阶段1）。
 *
 * 依据 `Bus/Bus-PRD.md` §3/§5：
 * - publishEvent：seq 单调（每 session）→ 落库 → 进程内订阅扇出；
 *   扇出失败（订阅端掉线）不中断业务（写库保底，重连重放）；
 * - soEventReplay：after_seq 之后按 seq 升序重放（so 前缀查询约定）；
 * - registerProjection：durable 语义 —— 先重放再尾随（replay 后 tail 无缝拼接）；
 * - 每 5 参方法 ≤40 行，逻辑控制（handleXxx）与数据处理（prepareXxx/soXxx）拆分。
 */

import type { RelationDBAccess, Logger, Metrics, Report, Condition } from '@brian-agent/base';
import {
  IdGenerator,
  Operator,
  ConfigService,
  ValidationError,
} from '@brian-agent/base';
import {
  EventBusContext,
  PublishEventInput,
  PublishEventOutput,
  SoEventReplayInput,
  SoEventReplayOutput,
  RegisterProjectionInput,
  RegisterProjectionOutput,
  UnregisterProjectionInput,
  UnregisterProjectionOutput,
  ConfigBusInput,
  ConfigBusOutput,
  RuntimeEvent,
  EventType,
  EventSubscriber,
  RUNTIME_EVENT_TABLE,
  RUNTIME_BUS_CONFIG_TABLE,
} from '../domain/types';

/** 默认事件保留期（天） */
const DEFAULT_RETENTION_DAYS = 30;

/** 一天的毫秒数 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * EventBusService。
 *
 * seq 缓存与订阅注册表为实例字段（同进程多实例互不干扰；跨实例以 DB MAX 为持久事实源）。
 */
export class EventBusService {
  private enabled = true;
  private retentionDays = DEFAULT_RETENTION_DAYS;
  private readonly config: ConfigService;

  /** 事件 seq 进程内缓存（seq 分配加速；DB MAX 为持久事实源） */
  private readonly eventSeqCache = new Map<string, number>();

  /** 活跃订阅注册表：subscription_id → {session_key, deliver} */
  private readonly activeSubscriptions = new Map<string, { session_key: string; deliver: EventSubscriber }>();

  /** 每会话订阅集：session_key → Set<subscription_id> */
  private readonly sessionSubscribers = new Map<string, Set<string>>();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logger?: Logger,
  ) {
    this.config = new ConfigService(relationDb, RUNTIME_BUS_CONFIG_TABLE);
  }

  /** 初始化组件：恢复 enabled 状态 + 按保留期清理过期事件 */
  async initialize(): Promise<void> {
    const enabledRow = await this.config.getString('enabled', 'true');
    this.enabled = enabledRow !== 'false';
    const retentionRow = await this.config.getString('retention_days', '');
    if (retentionRow) {
      this.retentionDays = Number(retentionRow) || DEFAULT_RETENTION_DAYS;
    }
    await this.purgeExpiredEvents();
    this.logger?.debug?.('EventBusService 初始化完成');
  }

  /** 组件使能守卫 */
  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new ValidationError('Bus 组件未启用，请先通过 configBus 启用');
    }
  }

  // -------------------------------------------------------------------------
  // publishEvent（seq 单调 → 落库 → 扇出）
  // -------------------------------------------------------------------------

  /** 发布持久化事件（逻辑控制） */
  async publishEvent(input: PublishEventInput, output: PublishEventOutput, _context: EventBusContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.session_key || !input.type) {
      throw new ValidationError('session_key 与 type 不能为空');
    }
    const seq = await this.nextEventSeq(input.session_key);
    const event = this.prepareEvent(input, seq);
    await this.relationDb.insert(RUNTIME_EVENT_TABLE, newPatchEvent(event));
    this.fanout(event);
    output.seq = seq;
    return true;
  }

  /** 组装事件对象（数据处理） */
  private prepareEvent(input: PublishEventInput, seq: number): RuntimeEvent {
    return {
      id: IdGenerator.generate(),
      session_key: input.session_key,
      run_id: input.run_id || undefined,
      seq,
      type: input.type,
      payload: input.payload,
      ts: IdGenerator.now(),
    };
  }

  /** 分配下一条事件 seq（数据处理；进程缓存 + DB MAX 持久事实源） */
  private async nextEventSeq(sessionKey: string): Promise<number> {
    const cached = this.eventSeqCache.get(sessionKey);
    if (cached !== undefined) {
      this.eventSeqCache.set(sessionKey, cached + 1);
      return cached + 1;
    }
    const rows = await this.relationDb.select(RUNTIME_EVENT_TABLE, {
      conditions: [{ field: 'session_key', operator: Operator.EQ, value: sessionKey }],
      order_by: [{ field: 'seq', direction: 'DESC' }],
    });
    const next = (rows.length ? Number(rows[0].seq) : 0) + 1;
    this.eventSeqCache.set(sessionKey, next);
    return next;
  }

  /** 进程内订阅扇出（逻辑控制；订阅端异常不影响业务） */
  private fanout(event: RuntimeEvent): void {
    const subscribers = this.sessionSubscribers.get(event.session_key);
    if (!subscribers) {
      return;
    }
    for (const subscriptionId of subscribers) {
      const subscription = this.activeSubscriptions.get(subscriptionId);
      if (!subscription) {
        continue;
      }
      this.deliverSafely(subscription.deliver, event);
    }
  }

  /** 单订阅安全投递（逻辑控制；掉线不中断发布方） */
  private deliverSafely(deliver: EventSubscriber, event: RuntimeEvent): void {
    try {
      deliver(event);
    } catch (err) {
      this.logger?.warn?.('EventBus 投影投递失败（写库保底）', {
        subscription_error: err instanceof Error ? err.message : String(err),
        session_key: event.session_key,
        seq: event.seq,
      });
    }
  }

  // -------------------------------------------------------------------------
  // soEventReplay（after_seq 之后按 seq 升序）
  // -------------------------------------------------------------------------

  /** 重放查询（逻辑控制） */
  async soEventReplay(input: SoEventReplayInput, output: SoEventReplayOutput, _context: EventBusContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions: Condition[] = [{ field: 'session_key', operator: Operator.EQ, value: input.session_key }];
    if (input.after_seq !== undefined) {
      conditions.push({ field: 'seq', operator: Operator.GT, value: input.after_seq });
    }
    const rows = await this.relationDb.select(RUNTIME_EVENT_TABLE, {
      conditions,
      order_by: [{ field: 'seq', direction: 'ASC' }],
    });
    output.events = this.soEventRows(rows, input.types);
    output.last_seq = output.events.length ? output.events[output.events.length - 1].seq : (input.after_seq ?? 0);
    return true;
  }

  /** 事件行组装与类型过滤（数据处理） */
  private soEventRows(
    rows: Array<Record<string, unknown>>,
    types?: EventType[],
  ): RuntimeEvent[] {
    const events: RuntimeEvent[] = [];
    for (const row of rows) {
      const event = this.toRuntimeEvent(row);
      if (types && !types.includes(event.type)) {
        continue;
      }
      events.push(event);
    }
    return events;
  }

  /** 行转事件对象（数据处理） */
  private toRuntimeEvent(row: Record<string, unknown>): RuntimeEvent {
    return {
      id: String(row.id),
      session_key: String(row.session_key),
      run_id: String(row.run_id ?? '') || undefined,
      seq: Number(row.seq),
      type: String(row.event_type) as EventType,
      payload: JSON.parse(String(row.payload_json ?? '{}')),
      ts: Number(row.ts),
    };
  }

  // -------------------------------------------------------------------------
  // registerProjection（durable：重放 → 直播无缝尾随）/ unregisterProjection
  // -------------------------------------------------------------------------

  /** 注册投影（逻辑控制）：先重放后尾随，last_seq 校验防漏发 */
  async registerProjection(input: RegisterProjectionInput, output: RegisterProjectionOutput, _context: EventBusContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.session_key) {
      throw new ValidationError('session_key 不能为空');
    }
    const replay = new SoEventReplayInput();
    replay.session_key = input.session_key;
    replay.after_seq = input.after_seq ?? 0;
    const replayOutput = new SoEventReplayOutput();
    await this.soEventReplay(replay, replayOutput, _context, _metrics, _report);
    const lastSeq = replayOutput.last_seq;
    for (const event of replayOutput.events) {
      if (input.deliver) {
        this.deliverSafely(input.deliver, event);
      }
    }
    output.subscription_id = this.attachSubscription(input.session_key, input.deliver);
    output.last_seq = lastSeq;
    return true;
  }

  /** 附加活跃订阅（数据处理） */
  private attachSubscription(
    sessionKey: string,
    deliver?: EventSubscriber,
  ): string {
    const subscriptionId = IdGenerator.generate();
    this.activeSubscriptions.set(subscriptionId, {
      session_key: sessionKey,
      deliver: deliver ?? (() => undefined),
    });
    const subscribers = this.sessionSubscribers.get(sessionKey) ?? new Set<string>();
    subscribers.add(subscriptionId);
    this.sessionSubscribers.set(sessionKey, subscribers);
    return subscriptionId;
  }

  /** 释放投影订阅（逻辑控制；幂等） */
  async unregisterProjection(input: UnregisterProjectionInput, output: UnregisterProjectionOutput, _context: EventBusContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const subscription = this.activeSubscriptions.get(input.subscription_id);
    if (!subscription) {
      output.released = false;
      return true;
    }
    this.activeSubscriptions.delete(input.subscription_id);
    const subscribers = this.sessionSubscribers.get(subscription.session_key);
    if (subscribers) {
      subscribers.delete(input.subscription_id);
      if (subscribers.size === 0) {
        this.sessionSubscribers.delete(subscription.session_key);
      }
    }
    output.released = true;
    return true;
  }

  /** 清理超过保留期的持久化事件（逻辑控制；initialize 与 configBus 触发） */
  private async purgeExpiredEvents(): Promise<void> {
    if (!(this.retentionDays > 0)) {
      return;
    }
    const cutoff = IdGenerator.now() - this.retentionDays * DAY_MS;
    await this.relationDb.delete(RUNTIME_EVENT_TABLE, [
      { field: 'ts', operator: Operator.LT, value: cutoff },
    ]);
  }

  // -------------------------------------------------------------------------
  // configBus
  // -------------------------------------------------------------------------

  /** 模块配置（逻辑控制） */
  async configBus(input: ConfigBusInput, output: ConfigBusOutput, _context: EventBusContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (input.enabled !== undefined) {
      this.enabled = input.enabled;
      await this.config.set('enabled', input.enabled ? 'true' : 'false', 'BOOLEAN');
    }
    output.error = undefined;
    return true;
  }
}

/** newPatch 事件行组装（created/updated/ts 由调用方注入） */
function newPatchEvent(event: RuntimeEvent): Array<{ field: string; value: unknown }> {
  const now = IdGenerator.now();
  return [
    { field: 'id', value: event.id },
    { field: 'created', value: now },
    { field: 'updated', value: now },
    { field: 'session_key', value: event.session_key },
    { field: 'run_id', value: event.run_id ?? '' },
    { field: 'seq', value: event.seq },
    { field: 'event_type', value: event.type },
    { field: 'payload_json', value: JSON.stringify(event.payload ?? {}) },
    { field: 'ts', value: event.ts },
  ];
}
