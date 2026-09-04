/**
 * @fileoverview RunGatewayService —— 两段式运行网关（Runtime v2 · 阶段3/4 前置 · 最小可用版）。
 *
 * 依据 `Runs/Runs-PRD.md` §4：
 * - submitRun 立即 ack `{run_id, accepted_at, queued/steered}`；结果经 EventBus 投影与 waitRun 承载；
 * - session lane（并发 1）：活动 run 未结算时按队列模式入队（steer 注入活动 run 边界 /
 *   followup 排队 / interrupt 中止后排队）；
 * - 编排即代码：matchAgentDef（确定性）→ soAgentSnapshot（组件按任务重解析）→ execAgentLoop；
 * - settleRun 落账 + 唤醒 waiter + 排水 followup。
 *
 * 每 5 参方法 ≤40 行；逻辑控制与数据处理拆分。
 */

import type { RelationDBAccess, Logger, Metrics, Report } from '@brian-agent/base';
import {
  IdGenerator,
  Operator,
  newRecord,
  newPatch,
  ConfigService,
  ValidationError,
} from '@brian-agent/base';
import type { SessionAccess } from '../../Session';
import type { EventBusAccess } from '../../Bus';
import type { LoopAccess } from '../../Loop';
import type { AgentDefAccess } from '../../Agents';
import {
  ExecAgentLoopInput,
  ExecAgentLoopOutput,
  AbortLoopTurnInput,
  AbortLoopTurnOutput,
} from '../../Loop';
import {
  AddSessionInput,
  AddSessionOutput,
} from '../../Session';
import {
  MatchAgentDefInput,
  MatchAgentDefOutput,
  SoAgentSnapshotInput,
  SoAgentSnapshotOutput,
} from '../../Agents';
import {
  RunGatewayContext,
  SubmitRunInput,
  SubmitRunOutput,
  WaitRunInput,
  WaitRunOutput,
  SteerRunInput,
  SteerRunOutput,
  AbortRunInput,
  AbortRunOutput,
  SoRunStatusInput,
  SoRunStatusOutput,
  ConfigRunsInput,
  ConfigRunsOutput,
  RunRecord,
  RunStatus,
  SessionLane,
  Waiter,
  RUNTIME_RUN_TABLE,
  RUNTIME_RUNS_CONFIG_TABLE,
} from '../domain/types';

/**
 * RunGatewayService。
 */
export class RunGatewayService {
  private enabled = true;
  private readonly config: ConfigService;

  /** 会话 lane 注册表：session_key → lane（活动 run / 排队 / steering 队列） */
  private readonly lanes = new Map<string, SessionLane>();

  /** 结算 waiter 注册表：run_id → waiter（HTTP 流式端点 await 结算） */
  private readonly waiters = new Map<string, Waiter>();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly session: SessionAccess,
    private readonly bus: EventBusAccess,
    private readonly agents: AgentDefAccess,
    private readonly loop: LoopAccess,
    private readonly logger?: Logger,
  ) {
    this.config = new ConfigService(relationDb, RUNTIME_RUNS_CONFIG_TABLE);
  }

  /** 初始化组件 */
  async initialize(): Promise<void> {
    const enabledRow = await this.config.getString('enabled', 'true');
    this.enabled = enabledRow !== 'false';
    this.logger?.debug?.('RunGatewayService 初始化完成');
  }

  /** 组件使能守卫 */
  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new ValidationError('Runs 组件未启用，请先通过 configRuns 启用');
    }
  }

  // -------------------------------------------------------------------------
  // submitRun（两段式）
  // -------------------------------------------------------------------------

  /** 提交运行（逻辑控制；立即 ack） */
  async submitRun(input: SubmitRunInput, output: SubmitRunOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.session_key || !input.session_id || !input.user_message) {
      throw new ValidationError('session_key/session_id/user_message 不能为空');
    }
    const lane = this.soLane(input.session_key);
    output.accepted_at = IdGenerator.now();
    if (lane.activeRunId) {
      const queued = await this.enqueueByQueueMode(lane, input);
      output.run_id = queued.runId;
      output.queued = queued.queued;
      output.steered = queued.steered;
      return true;
    }
    const runId = await this.startRun(input);
    output.run_id = runId;
    output.queued = false;
    output.steered = false;
    return true;
  }

  /** 会话 lane 获取（数据处理；无则建） */
  private soLane(sessionKey: string): SessionLane {
    let lane = this.lanes.get(sessionKey);
    if (!lane) {
      lane = { activeRunId: undefined, pending: [], steering: [] };
      this.lanes.set(sessionKey, lane);
    }
    return lane;
  }

  /** 会话忙时按队列模式入队（逻辑控制） */
  private async enqueueByQueueMode(
    lane: SessionLane,
    input: SubmitRunInput,
  ): Promise<{ runId: string; queued: boolean; steered: boolean }> {
    const mode = input.queue_mode ?? 'steer';
    if (mode === 'steer') {
      lane.steering.push(input.user_message);
      return { runId: lane.activeRunId!, queued: false, steered: true };
    }
    if (mode === 'interrupt') {
      const activeRunId = lane.activeRunId!;
      await this.abortRun(this.prepareAbortInput(activeRunId), new AbortRunOutput(), new RunGatewayContext());
    }
    const runId = await this.insertQueuedRun(input, mode);
    lane.pending.push({ runId, input });
    return { runId, queued: true, steered: false };
  }

  /** 中止入参组装（数据处理） */
  private prepareAbortInput(runId: string): AbortRunInput {
    const input = new AbortRunInput();
    input.run_id = runId;
    input.reason = 'superseded';
    return input;
  }

  /** 插入排队 run 记录（数据处理） */
  private async insertQueuedRun(input: SubmitRunInput, mode: QueueModeName): Promise<string> {
    const record = newRecord({
      session_key: input.session_key,
      session_id: input.session_id,
      lane: 'session',
      status: 'queued',
      queue_mode: mode,
      budget_total: input.budget_total ?? 60,
      accepted_at: IdGenerator.now(),
    });
    await this.relationDb.insert(RUNTIME_RUN_TABLE, record);
    return String(record[0].value);
  }

  /** 启动运行（逻辑控制；fire-and-forget，结算内部保证） */
  private async startRun(input: SubmitRunInput): Promise<string> {
    const runId = IdGenerator.generate();
    const lane = this.soLane(input.session_key);
    lane.activeRunId = runId;
    const record = newRecord({
      id: runId,
      session_key: input.session_key,
      session_id: input.session_id,
      lane: 'session',
      status: 'running',
      budget_total: input.budget_total ?? 60,
      accepted_at: IdGenerator.now(),
      started_at: IdGenerator.now(),
    });
    await this.relationDb.insert(RUNTIME_RUN_TABLE, record);
    void this.executeRun(runId, input);
    return runId;
  }

  /** 执行运行（逻辑控制）：会话解析 → 匹配 → 快照 → 循环 → 结算；异常必收敛 */
  private async executeRun(runId: string, input: SubmitRunInput): Promise<void> {
    try {
      // 外部 session_key → runtime_session.id（幂等；Loop 持久化以 runtime 会话为准）
      const runtimeSessionId = await this.soRuntimeSessionId(input.session_key);
      const matchOut = await this.matchAgent(input);
      const snapshot = await this.soSnapshot(matchOut.def_id, input);
      const loopInput = this.prepareLoopInput(runId, { ...input, session_id: runtimeSessionId }, snapshot);
      const loopOutput = new ExecAgentLoopOutput();
      await this.loop.execAgentLoop(loopInput, loopOutput, new RunGatewayContext());
      await this.settleRun(runId, loopOutput.stop_reason, loopOutput.iterations, matchOut.def_id);
    } catch (err) {
      this.logger?.error?.('run 执行失败（结算为 error）', { run_id: runId, error: err instanceof Error ? err.message : String(err) });
      await this.settleRun(runId, 'error', 0, '');
    }
  }

  /** 外部会话键 → runtime 会话 ID（数据处理；幂等） */
  private async soRuntimeSessionId(sessionKey: string): Promise<string> {
    const addIn = new AddSessionInput();
    addIn.session_key = sessionKey;
    const addOut = new AddSessionOutput();
    await this.session.addSession(addIn, addOut, new RunGatewayContext());
    return addOut.session_id;
  }

  /** 确定性匹配（数据处理） */
  private async matchAgent(input: SubmitRunInput): Promise<MatchAgentDefOutput> {
    const matchInput = new MatchAgentDefInput();
    matchInput.task_content = input.user_message;
    matchInput.interact_id = input.interact_id ?? '';
    matchInput.context_id = input.context_id ?? '';
    const matchOutput = new MatchAgentDefOutput();
    await this.agents.matchAgentDef(matchInput, matchOutput, new RunGatewayContext());
    return matchOutput;
  }

  /** 组件快照（数据处理） */
  private async soSnapshot(defId: string, input: SubmitRunInput): Promise<SoAgentSnapshotOutput['snapshot']> {
    const snapInput = new SoAgentSnapshotInput();
    snapInput.def_id = defId;
    snapInput.task_content = input.user_message;
    snapInput.user_message = input.user_message;
    snapInput.interact_id = input.interact_id ?? '';
    snapInput.context_id = input.context_id ?? '';
    const snapOutput = new SoAgentSnapshotOutput();
    await this.agents.soAgentSnapshot(snapInput, snapOutput, new RunGatewayContext());
    return snapOutput.snapshot;
  }

  /** Loop 入参组装（数据处理） */
  private prepareLoopInput(
    runId: string,
    input: SubmitRunInput,
    snapshot: SoAgentSnapshotOutput['snapshot'],
  ): ExecAgentLoopInput {
    const loopInput = new ExecAgentLoopInput();
    loopInput.run_id = runId;
    loopInput.session_key = input.session_key;
    loopInput.session_id = input.session_id;
    loopInput.user_message = input.user_message;
    loopInput.system = snapshot.system;
    loopInput.llm_id = snapshot.llm_id;
    loopInput.temperature = snapshot.temperature;
    loopInput.budget = { total: input.budget_total ?? snapshot.budget_total };
    return loopInput;
  }

  /** 结算落账（逻辑控制）：状态 + waiter 唤醒 + followup 排水 */
  private async settleRun(runId: string, stopReason: string, budgetUsed: number, agentDefId: string): Promise<void> {
    const status: RunStatus = stopReason === 'stop' ? 'finished' : stopReason === 'budget' ? 'finished' : (stopReason as RunStatus);
    await this.relationDb.update(RUNTIME_RUN_TABLE, newPatch({
      status,
      stop_reason: stopReason,
      settled_at: IdGenerator.now(),
      budget_used: budgetUsed,
      agent_def_id: agentDefId,
    }), [{ field: 'id', operator: Operator.EQ, value: runId }]);
    const waiter = this.waiters.get(runId);
    this.waiters.delete(runId);
    waiter?.resolve({ status, stop_reason: stopReason });
    await this.drainFollowups(runId);
  }

  /** followup 排水（逻辑控制；活动位已释放，依序启动排队 run） */
  private async drainFollowups(settledRunId: string): Promise<void> {
    const settled = await this.soRunRow(settledRunId);
    if (!settled) {
      return;
    }
    const lane = this.soLane(String(settled.session_key));
    if (lane.activeRunId === settledRunId) {
      lane.activeRunId = undefined;
    }
    const next = lane.pending.shift();
    if (!next) {
      return;
    }
    await this.startRun(next.input);
  }

  /** 查询 run 行（数据处理） */
  private async soRunRow(runId: string): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(RUNTIME_RUN_TABLE, [
      { field: 'id', operator: Operator.EQ, value: runId },
    ]);
  }

  // -------------------------------------------------------------------------
  // waitRun / steerRun / abortRun / soRunStatus / configRuns
  // -------------------------------------------------------------------------

  /** 等待运行结算（逻辑控制；HTTP 流式端点在订阅投影后 await） */
  async waitRun(input: WaitRunInput, output: WaitRunOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const settled = await this.soRunRow(input.run_id);
    if (!settled) {
      // 未注册 run（如历史遗留 id）立即兜底返回，避免 waiter 永久挂起
      output.status = 'running';
      return true;
    }
    if (this.isSettledStatus(String(settled.status))) {
      output.status = String(settled.status) as RunStatus;
      output.stop_reason = String(settled.stop_reason ?? '');
      return true;
    }
    const result = await this.registerWaiter(input.run_id, input.timeout_ms ?? 0);
    output.status = result.status;
    output.stop_reason = result.stop_reason;
    return true;
  }

  /** 结算态判定（数据处理） */
  private isSettledStatus(status: string): boolean {
    return status === 'finished' || status === 'error' || status === 'aborted';
  }

  /** 注册 waiter（数据处理；超时毫秒 >0 时定时兜底返回当前状态） */
  private registerWaiter(runId: string, timeoutMs: number): Promise<{ status: RunStatus; stop_reason?: string }> {
    return new Promise((resolve) => {
      const waiter: Waiter = { resolve };
      this.waiters.set(runId, waiter);
      if (timeoutMs > 0) {
        setTimeout(async () => {
          if (this.waiters.get(runId) !== waiter) {
            return;
          }
          this.waiters.delete(runId);
          const row = await this.soRunRow(runId);
          resolve({ status: String(row?.status ?? 'running') as RunStatus, stop_reason: String(row?.stop_reason ?? '') });
        }, timeoutMs);
      }
    });
  }

  /** 注入排队消息（逻辑控制；活动 run 边界抽干生效） */
  async steerRun(input: SteerRunInput, output: SteerRunOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const lane = this.soLane(input.session_key);
    lane.steering.push(input.message);
    output.run_id = lane.activeRunId ?? '';
    output.enqueued = true;
    return true;
  }

  /** 类型化取消（逻辑控制；结算由 Loop 收敛路径完成） */
  async abortRun(input: AbortRunInput, output: AbortRunOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const loopInput = new AbortLoopTurnInput();
    loopInput.run_id = input.run_id;
    loopInput.reason = input.reason;
    const loopOutput = new AbortLoopTurnOutput();
    await this.loop.abortLoopTurn(loopInput, loopOutput, new RunGatewayContext());
    output.signalled = loopOutput.signalled;
    return true;
  }

  /** 查询运行状态（逻辑控制） */
  async soRunStatus(input: SoRunStatusInput, output: SoRunStatusOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const row = await this.soRunRow(input.run_id);
    output.run = row ? this.toRunRecord(row) : undefined;
    return true;
  }

  /** 行转记录（数据处理） */
  private toRunRecord(row: Record<string, unknown>): RunRecord {
    return {
      id: String(row.id),
      session_key: String(row.session_key),
      session_id: String(row.session_id ?? ''),
      agent_def_id: String(row.agent_def_id ?? ''),
      lane: String(row.lane ?? 'session'),
      status: String(row.status) as RunStatus,
      stop_reason: String(row.stop_reason ?? '') || undefined,
      queue_mode: String(row.queue_mode ?? '') as RunRecord['queue_mode'],
      budget_total: Number(row.budget_total ?? 0),
      budget_used: Number(row.budget_used ?? 0),
      accepted_at: Number(row.accepted_at ?? 0),
      started_at: row.started_at ? Number(row.started_at) : undefined,
      settled_at: row.settled_at ? Number(row.settled_at) : undefined,
      created: Number(row.created),
      updated: Number(row.updated),
    };
  }

  /** 模块配置（逻辑控制） */
  async configRuns(input: ConfigRunsInput, _output: ConfigRunsOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.enabled !== undefined) {
      this.enabled = input.enabled;
      await this.config.set('enabled', input.enabled ? 'true' : 'false', 'BOOLEAN');
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Loop 队列接线（组合根后绑定；非业务方法，鸭子接口）
  // -------------------------------------------------------------------------

  /** Loop 边界抽干 steering 队列（活动 run 专用） */
  drainSteeringFor(sessionKey: string): string[] {
    const lane = this.lanes.get(sessionKey);
    return lane ? lane.steering.splice(0, lane.steering.length) : [];
  }

  /** Loop 外层 followup 取队列 */
  takeFollowupFor(sessionKey: string): string[] {
    const lane = this.lanes.get(sessionKey);
    if (!lane || lane.activeRunId) {
      return [];
    }
    const followups = lane.pending.splice(0, lane.pending.length).map((p) => p.input.user_message);
    return followups;
  }
}

/** 队列模式局部别名 */
type QueueModeName = 'steer' | 'followup' | 'interrupt';
