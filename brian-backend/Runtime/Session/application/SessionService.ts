/**
 * @fileoverview Session 模块应用服务层（Runtime v2 · 阶段1）。
 *
 * 依据 `Session/Session-PRD.md` §4/§5：
 * - 会话/消息/Part 三级模型是循环唯一状态载体；
 * - 每 5 参方法 ≤40 行，逻辑控制（I/O 编排）与数据处理（纯加工）拆分；
 * - 每会话并发控制由 Runs 模块 session lane 统一承担（去重优先，2026-09-05 起
 *   Session 不再提供忙锁，避免双机制）；
 * - 错误 fail-loud（ValidationError/NotFoundError，禁止静默吞错）。
 */

import type { Condition } from '@brian-agent/base';
import type { RelationDBAccess, Logger, Metrics, Report } from '@brian-agent/base';
import {
  Operator,
  newRecord,
  newPatch,
  ConfigService,
  ValidationError,
  NotFoundError,
} from '@brian-agent/base';
import {
  SessionContext,
  AddSessionInput,
  AddSessionOutput,
  AddMessageInput,
  AddMessageOutput,
  AddPartInput,
  AddPartOutput,
  UpdatePartInput,
  UpdatePartOutput,
  SoMessagesInput,
  SoMessagesOutput,
  ConfigSessionInput,
  ConfigSessionOutput,
  MessageRole,
  SessionStatus,
  PartStatus,
  MessageWithParts,
  PartRecord,
  RUNTIME_SESSION_TABLE,
  RUNTIME_MESSAGE_TABLE,
  RUNTIME_MESSAGE_PART_TABLE,
  RUNTIME_SESSION_CONFIG_TABLE,
} from '../domain/types';

/** 默认 soMessages 页大小 */
const DEFAULT_MESSAGE_LIMIT = 50;

/**
 * SessionService。
 */
export class SessionService {
  private enabled = true;
  private defaultLimit = DEFAULT_MESSAGE_LIMIT;
  private readonly config: ConfigService;

  /** 会话消息序号进程内缓存（实例字段：seq 分配加速；DB last_seq 为持久事实源） */
  private readonly sessionSeqCache = new Map<string, number>();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logger?: Logger,
  ) {
    this.config = new ConfigService(relationDb, RUNTIME_SESSION_CONFIG_TABLE);
  }

  /** 初始化组件：恢复 enabled 状态并注册配置 */
  async initialize(): Promise<void> {
    const enabledRow = await this.config.getString('enabled', 'true');
    this.enabled = enabledRow !== 'false';
    const limitRow = await this.config.getString('default_message_limit', '');
    if (limitRow) {
      this.defaultLimit = Number(limitRow) || DEFAULT_MESSAGE_LIMIT;
    }
    this.logger?.debug?.('SessionService 初始化完成');
  }

  /** 组件使能守卫 */
  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new ValidationError('Session 组件未启用，请先通过 configSession 启用');
    }
  }

  // -------------------------------------------------------------------------
  // addSession（幂等：session_key 已存在返回既有 id）
  // -------------------------------------------------------------------------

  /** 新增会话（逻辑控制；幂等） */
  async addSession(input: AddSessionInput, output: AddSessionOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.session_key) {
      throw new ValidationError('session_key 不能为空');
    }
    const existing = await this.soSessionRowByKey(input.session_key);
    if (existing) {
      output.session_id = String(existing.id);
      output.created = false;
      return true;
    }
    const record = newRecord({
      session_key: input.session_key,
      title: input.title ?? '',
      agent_def_id: input.agent_def_id ?? '',
      status: SessionStatus.Active,
      last_seq: 0,
    });
    await this.relationDb.insert(RUNTIME_SESSION_TABLE, record);
    output.session_id = String(record[0].value);
    output.created = true;
    return true;
  }

  /** 按 session_key 查询会话行（逻辑控制） */
  private async soSessionRowByKey(sessionKey: string): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(RUNTIME_SESSION_TABLE, [
      { field: 'session_key', operator: Operator.EQ, value: sessionKey },
    ]);
  }

  // -------------------------------------------------------------------------
  // addMessage（seq = last_seq + 1，严格递增）
  // -------------------------------------------------------------------------

  /** 新增消息（逻辑控制） */
  async addMessage(input: AddMessageInput, output: AddMessageOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const session = await this.soSessionRowById(input.session_id);
    if (!session) {
      throw new NotFoundError(RUNTIME_SESSION_TABLE, input.session_id);
    }
    const seq = await this.nextMessageSeq(input.session_id);
    const record = newRecord({
      session_id: input.session_id,
      run_id: input.run_id ?? '',
      role: input.role,
      content: input.content,
      seq,
      token_count: input.token_count ?? 0,
    });
    await this.relationDb.insert(RUNTIME_MESSAGE_TABLE, record);
    output.message_id = String(record[0].value);
    output.seq = seq;
    return true;
  }

  /** 按 id 查询会话行（逻辑控制） */
  private async soSessionRowById(sessionId: string): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(RUNTIME_SESSION_TABLE, [
      { field: 'id', operator: Operator.EQ, value: sessionId },
    ]);
  }

  /** 分配下一条消息 seq（逻辑控制；进程缓存 + DB last_seq 持久事实源） */
  private async nextMessageSeq(sessionId: string): Promise<number> {
    const cached = this.sessionSeqCache.get(sessionId);
    const next = cached !== undefined ? cached + 1 : await this.soNextSeqFromDb(sessionId);
    this.sessionSeqCache.set(sessionId, next);
    await this.bumpSessionLastSeq(sessionId, next);
    return next;
  }

  /** 从 DB last_seq 计算下一个 seq（逻辑控制） */
  private async soNextSeqFromDb(sessionId: string): Promise<number> {
    const session = await this.soSessionRowById(sessionId);
    return Number(session?.last_seq ?? 0) + 1;
  }

  /** 回写会话 last_seq（逻辑控制） */
  private async bumpSessionLastSeq(sessionId: string, seq: number): Promise<void> {
    await this.relationDb.update(RUNTIME_SESSION_TABLE, newPatch({ last_seq: seq }), [
      { field: 'id', operator: Operator.EQ, value: sessionId },
    ]);
  }

  // -------------------------------------------------------------------------
  // addPart / updatePart
  // -------------------------------------------------------------------------

  /** 新增 Part（逻辑控制） */
  async addPart(input: AddPartInput, output: AddPartOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const partOrder = await this.soNextPartOrder(input.message_id);
    const record = newRecord({
      message_id: input.message_id,
      run_id: input.run_id ?? '',
      part_type: input.part_type,
      part_order: partOrder,
      content: input.content ?? '',
      tool_id: input.tool_id ?? '',
      input_json: input.input_json ?? '',
      output_json: '',
      status: PartStatus.Pending,
      block_type: input.block_type ?? '',
      block_meta: input.block_meta ?? '',
      token_count: 0,
      elapsed_ms: 0,
    });
    await this.relationDb.insert(RUNTIME_MESSAGE_PART_TABLE, record);
    output.part_id = String(record[0].value);
    output.part_order = partOrder;
    return true;
  }

  /** 查询消息内下一个 Part 序号（逻辑控制） */
  private async soNextPartOrder(messageId: string): Promise<number> {
    const rows = await this.relationDb.select(RUNTIME_MESSAGE_PART_TABLE, {
      conditions: [{ field: 'message_id', operator: Operator.EQ, value: messageId }],
      order_by: [{ field: 'part_order', direction: 'DESC' }],
      page: { current: 1, size: 1 },
    });
    return rows.length ? Number(rows[0].part_order) + 1 : 1;
  }

  /** 更新 Part（逻辑控制；状态机 pending→running→completed/error/aborted） */
  async updatePart(input: UpdatePartInput, _output: UpdatePartOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const part = await this.soPartRow(input.part_id);
    if (!part) {
      throw new NotFoundError(RUNTIME_MESSAGE_PART_TABLE, input.part_id);
    }
    const patch = this.preparePartPatch(input);
    if (input.content_patch !== undefined) {
      patch.content = String(part.content ?? '') + input.content_patch;
    }
    await this.relationDb.update(RUNTIME_MESSAGE_PART_TABLE, newPatch(patch), [
      { field: 'id', operator: Operator.EQ, value: input.part_id },
    ]);
    return true;
  }

  /** 组装 Part 更新补丁（数据处理：status/output/token/elapsed 按需patch） */
  private preparePartPatch(input: UpdatePartInput): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) {
      patch.status = input.status;
    }
    if (input.output_json !== undefined) {
      patch.output_json = input.output_json;
    }
    if (input.token_count !== undefined) {
      patch.token_count = input.token_count;
    }
    if (input.elapsed_ms !== undefined) {
      patch.elapsed_ms = input.elapsed_ms;
    }
    return patch;
  }

  /** 查询 Part 行（逻辑控制） */
  private async soPartRow(partId: string): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(RUNTIME_MESSAGE_PART_TABLE, [
      { field: 'id', operator: Operator.EQ, value: partId },
    ]);
  }

  // -------------------------------------------------------------------------
  // soMessages（含 Parts，seq 倒序取页后升序返回）
  // -------------------------------------------------------------------------

  /** 查询消息（含 Parts）（逻辑控制） */
  async soMessages(input: SoMessagesInput, output: SoMessagesOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const limit = input.limit ?? this.defaultLimit;
    const rows = await this.soMessageRows(input.session_id, limit, input.before_seq);
    const partsByMessage = await this.soPartsByMessageIds(rows.map((row) => String(row.id)));
    output.messages = this.assembleMessagesWithParts(rows, partsByMessage);
    return true;
  }

  /** 查询消息行（逻辑控制；seq 倒序 SQL 分页取页） */
  private async soMessageRows(sessionId: string, limit: number, beforeSeq?: number,
  ): Promise<Array<Record<string, unknown>>> {
    const conditions: Condition[] = [{ field: 'session_id', operator: Operator.EQ, value: sessionId }];
    if (beforeSeq !== undefined) {
      conditions.push({ field: 'seq', operator: Operator.LT, value: beforeSeq });
    }
    return this.relationDb.select(RUNTIME_MESSAGE_TABLE, {
      conditions,
      order_by: [{ field: 'seq', direction: 'DESC' }],
      page: { current: 1, size: limit },
    });
  }

  /** 批量查询一页消息的全部 Parts（逻辑控制；按 message_id IN 一次取回） */
  private async soPartsByMessageIds(messageIds: string[]): Promise<Map<string, PartRecord[]>> {
    const partsByMessage = new Map<string, PartRecord[]>();
    if (!messageIds.length) {
      return partsByMessage;
    }
    const partRows = await this.relationDb.select(RUNTIME_MESSAGE_PART_TABLE, {
      conditions: [{ field: 'message_id', operator: Operator.IN, value: messageIds }],
      order_by: [{ field: 'part_order', direction: 'ASC' }],
    });
    for (const partRow of partRows) {
      const record = this.toPartRecord(partRow);
      const bucket = partsByMessage.get(record.message_id);
      if (bucket) {
        bucket.push(record);
      } else {
        partsByMessage.set(record.message_id, [record]);
      }
    }
    return partsByMessage;
  }

  /** 组装消息含 Parts（数据处理，按 seq 升序返回） */
  private assembleMessagesWithParts(
    rows: Array<Record<string, unknown>>,
    partsByMessage: Map<string, PartRecord[]>,
  ): MessageWithParts[] {
    const messages: MessageWithParts[] = [];
    for (const row of rows) {
      const messageId = String(row.id);
      messages.push({
        id: messageId,
        role: String(row.role) as MessageRole,
        content: String(row.content ?? ''),
        seq: Number(row.seq),
        run_id: String(row.run_id ?? '') || undefined,
        created: Number(row.created),
        parts: partsByMessage.get(messageId) ?? [],
      });
    }
    return messages.reverse();
  }

  /** Part 行转记录对象（数据处理） */
  private toPartRecord(p: Record<string, unknown>): PartRecord {
    return {
      id: String(p.id),
      message_id: String(p.message_id),
      run_id: String(p.run_id ?? '') || undefined,
      part_type: String(p.part_type) as PartRecord['part_type'],
      part_order: Number(p.part_order),
      content: String(p.content ?? ''),
      tool_id: String(p.tool_id ?? '') || undefined,
      input_json: String(p.input_json ?? '') || undefined,
      output_json: String(p.output_json ?? '') || undefined,
      status: String(p.status) as PartRecord['status'],
      block_type: String(p.block_type ?? '') || undefined,
      block_meta: String(p.block_meta ?? '') || undefined,
      token_count: Number(p.token_count ?? 0),
      elapsed_ms: Number(p.elapsed_ms ?? 0),
      created: Number(p.created),
      updated: Number(p.updated),
    };
  }

  // -------------------------------------------------------------------------
  // configSession
  // -------------------------------------------------------------------------

  /** 模块配置（逻辑控制） */
  async configSession(input: ConfigSessionInput, _output: ConfigSessionOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (input.enabled !== undefined) {
      this.enabled = input.enabled;
      await this.config.set('enabled', input.enabled ? 'true' : 'false', 'BOOLEAN');
    }
    if (input.default_message_limit !== undefined) {
      this.defaultLimit = input.default_message_limit;
      await this.config.set('default_message_limit', input.default_message_limit, 'INT');
    }
    return true;
  }
}
