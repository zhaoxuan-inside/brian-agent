/**
 * @fileoverview RunGatewayService —— 两段式运行网关（Runtime v2 · 阶段3/4 前置 · 最小可用版）。
 *
 * 依据 `Runs/Runs-PRD.md` §4：
 * - submitRun 立即 ack `{run_id, accepted_at, queued/steered}`；结果经 Report→StreamProvider 事件流与 waitRun 承载；
 * - session lane（并发 1）：活动 run 未结算时按队列模式入队（steer 注入活动 run 边界 /
 *   followup 排队 / interrupt 中止后排队；collect 阶段4 落地）；
 * - 编排即代码：matchAgentDef（确定性）→ soAgentSnapshot（组件按任务重解析）→ execAgentLoop；
 * - settleRun 落账 + 唤醒 waiter + 排水 followup（queued run 复用原 run_id，见 §4.1）；
 * - 排水竞态防护（PRD §4.3）：interrupt 先入队后 abort，且入队/结算双方经
 *   maybeDrainLane 兜底复核，活动位已空即排水。
 *
 * 每 5 参方法 ≤40 行；逻辑控制（I/O 编排）与数据处理（纯加工）拆分。
 */

import type { RelationDBAccess, Logger, Metrics, Report } from '@brian-agent/base';
import {
  IdGenerator,
  Operator,
  newRecord,
  newPatch,
  ConfigService,
  BusinessEvent,
  ValidationError,
} from '@brian-agent/base';
import type { SessionAccess } from '../../Session';
import type { LoopAccess } from '../../Loop';
import type { AgentDefAccess } from '../../Agents';
import {
  ExecAgentLoopInput,
  ExecAgentLoopOutput,
  AbortLoopTurnInput,
  AbortLoopTurnOutput,
  AbortReason,
  LoopStopReason,
  DEFAULT_BUDGET_TOTAL,
} from '../../Loop';
import {
  AddSessionInput,
  AddSessionOutput,
  SessionContext,
} from '../../Session';
import {
  MatchAgentDefInput,
  MatchAgentDefOutput,
  SoAgentSnapshotInput,
  SoAgentSnapshotOutput,
  AgentDefContext,
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
  WaitPermissionInput,
  WaitPermissionOutput,
  AnswerPermissionInput,
  AnswerPermissionOutput,
  RunRecord,
  RunStatus,
  QueueMode,
  LaneKind,
  LANE_CONCURRENCY,
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

  /** 会话 lane 注册表：`${laneKind}:${session_key}` → lane（活动 run / 排队 / steering 队列） */
  private readonly lanes = new Map<string, SessionLane>();
  /** 每 lane 并发计数（main/subagent/background 并发上限控制；session 由 activeRunId 承担） */
  private readonly laneRunning = new Map<string, number>();

  /** 结算 waiter 注册表：run_id → waiter（HTTP 流式端点 await 结算） */
  private readonly waiters = new Map<string, Waiter>();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly session: SessionAccess,
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

  /** 提交运行（逻辑控制；立即 ack；统一解析 runtime_session.id 落账） */
  async submitRun(input: SubmitRunInput, output: SubmitRunOutput, _context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.session_key || !input.user_message) {
      throw new ValidationError('session_key/user_message 不能为空');
    }
    const runtimeSessionId = await this.soRuntimeSessionId(input.session_key);
    const laneKey = this.soLaneKey(input);
    const lane = this.soLane(laneKey);
    output.accepted_at = IdGenerator.now();
    const parent = { metrics, report };
    if (lane.activeRunId) {
      const queued = await this.enqueueByQueueMode(lane, input, runtimeSessionId, parent);
      output.run_id = queued.runId;
      output.queued = queued.queued;
      output.steered = queued.steered;
      return true;
    }
    const runId = await this.startRun(input, runtimeSessionId, parent);
    output.run_id = runId;
    output.queued = false;
    output.steered = false;
    await this.publishRunAccepted(input.session_key, runId, report);
    return true;
  }

  /** 发布 run.accepted（逻辑控制；两段式受理回执，经 Report→StreamProvider 保存/投递） */
  private async publishRunAccepted(sessionKey: string, runId: string, report?: Report): Promise<void> {
    report?.pushBusinessEvent(BusinessEvent.RunAccepted, { run_id: runId });
  }

  /** lane 键（数据处理）：`${laneKind}:${session_key}` */
  private soLaneKey(input: SubmitRunInput): string {
    return `${input.lane_kind ?? LaneKind.Session}:${input.session_key}`;
  }

  /** lane 获取（数据处理；无则建） */
  private soLane(laneKey: string): SessionLane {
    let lane = this.lanes.get(laneKey);
    if (!lane) {
      lane = { activeRunId: undefined, pending: [], steering: [] };
      this.lanes.set(laneKey, lane);
    }
    return lane;
  }

  /** 非 session lane 的并发判定（数据处理；达上限则排队） */
  private isLaneBusy(laneKey: string): boolean {
    const kind = laneKey.split(':')[0] as LaneKind;
    if (kind === LaneKind.Session) {
      return false;
    }
    return (this.laneRunning.get(laneKey) ?? 0) >= LANE_CONCURRENCY[kind];
  }

  /** 会话忙时按队列模式入队（逻辑控制） */
  private async enqueueByQueueMode(
    lane: SessionLane,
    input: SubmitRunInput,
    runtimeSessionId: string,
    parent: { metrics?: Metrics; report?: Report },
  ): Promise<{ runId: string; queued: boolean; steered: boolean }> {
    const mode = input.queue_mode ?? QueueMode.Steer;
    if (mode === QueueMode.Steer) {
      lane.steering.push(input.user_message);
      return { runId: lane.activeRunId!, queued: false, steered: true };
    }
    if (mode === QueueMode.Collect) {
      throw new ValidationError('collect 队列模式阶段4 落地（Runs-PRD §4.2）');
    }
    // PRD §4.3 排水竞态防护：先入队后 abort —— abort 触发的 settle→排水必然能看到本条
    const runId = await this.insertQueuedRun(input, mode, runtimeSessionId);
    lane.pending.push({ runId, input, parent });
    if (mode === QueueMode.Interrupt) {
      const activeRunId = lane.activeRunId!;
      await this.abortRun(this.prepareAbortInput(activeRunId), new AbortRunOutput(), new RunGatewayContext());
    }
    // 兜底复核：活动 run 可能恰在入队窗口内自行结算（排水已跑完），此处立即排水
    await this.maybeDrainLane(`${input.lane_kind ?? LaneKind.Session}:${input.session_key}`);
    return { runId, queued: true, steered: false };
  }

  /** 中止入参组装（数据处理） */
  private prepareAbortInput(runId: string): AbortRunInput {
    const input = new AbortRunInput();
    input.run_id = runId;
    input.reason = AbortReason.Superseded;
    return input;
  }

  /** 插入排队 run 记录（逻辑控制；结算后复用同一 run_id 转 running，见 §4.1） */
  private async insertQueuedRun(input: SubmitRunInput, mode: QueueMode, runtimeSessionId: string): Promise<string> {
    const record = newRecord({
      session_key: input.session_key,
      session_id: runtimeSessionId,
      lane: 'session',
      status: RunStatus.Queued,
      queue_mode: mode,
      budget_total: input.budget_total ?? DEFAULT_BUDGET_TOTAL,
      accepted_at: IdGenerator.now(),
    });
    await this.relationDb.insert(RUNTIME_RUN_TABLE, record);
    return String(record[0].value);
  }

  /** 启动运行（逻辑控制；fire-and-forget，结算内部保证；runId 复用排队记录时走 patch） */
  private async startRun(input: SubmitRunInput, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }, runId?: string): Promise<string> {
    const activeRunId = runId ?? IdGenerator.generate();
    const laneKey = `${input.lane_kind ?? LaneKind.Session}:${input.session_key}`;
    const lane = this.soLane(laneKey);
    lane.activeRunId = activeRunId;
    this.laneRunning.set(laneKey, (this.laneRunning.get(laneKey) ?? 0) + 1);
    if (runId) {
      await this.relationDb.update(RUNTIME_RUN_TABLE, newPatch({
        status: RunStatus.Running,
        started_at: IdGenerator.now(),
      }), [{ field: 'id', operator: Operator.EQ, value: runId }]);
    } else {
      const record = newRecord({
        id: activeRunId,
        session_key: input.session_key,
        session_id: runtimeSessionId,
        lane: 'session',
        status: RunStatus.Running,
        budget_total: input.budget_total ?? DEFAULT_BUDGET_TOTAL,
        accepted_at: IdGenerator.now(),
        started_at: IdGenerator.now(),
      });
      await this.relationDb.insert(RUNTIME_RUN_TABLE, record);
    }
    void this.executeRun(activeRunId, input, runtimeSessionId, parent);
    return activeRunId;
  }

  /** 执行运行（逻辑控制）：匹配 → 快照 → 循环 → 结算；异常必收敛 */
  private async executeRun(runId: string, input: SubmitRunInput, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }): Promise<void> {
    try {
      const matchOut = await this.matchAgent(input, parent?.report);
      const snapshot = await this.soSnapshot(matchOut.def_id, input, parent?.report);
      // 过程可观测：Agent 选择与组件选定清单（Soul/Skill/MCP/Prompt/LLM）
      parent?.report?.pushBusinessEvent(BusinessEvent.AgentSelected, {
        def_id: matchOut.def_id,
        agent_name: snapshot.name,
        matched_by: matchOut.matched_by,
      });
      parent?.report?.pushBusinessEvent(BusinessEvent.AgentComponents, {
        agent_name: snapshot.name,
        soul_id: matchOut.def.soul_id,
        prompt_template_id: matchOut.def.prompt_template_id,
        llm_id: snapshot.llm_id,
        skills: (snapshot.tools ?? []).filter((t) => t.kind === 'skill'),
        mcps: (snapshot.tools ?? []).filter((t) => t.kind === 'mcp'),
      });
      const loopInput = this.prepareLoopInput(runId, input, runtimeSessionId, snapshot);
      const loopOutput = new ExecAgentLoopOutput();
      await this.loop.execAgentLoop(loopInput, loopOutput, new RunGatewayContext(), parent?.metrics, parent?.report);
      await this.settleRun(runId, loopOutput.stop_reason, loopOutput.iterations, matchOut.def_id);
    } catch (err) {
      parent?.metrics?.error?.('run 执行失败（结算为 error）', { run_id: runId, error: err instanceof Error ? err.message : String(err) });
      await this.settleRun(runId, LoopStopReason.Error, 0, '');
    }
  }

  /** 外部会话键 → runtime 会话 ID（逻辑控制；幂等） */
  private async soRuntimeSessionId(sessionKey: string): Promise<string> {
    const addIn = new AddSessionInput();
    addIn.session_key = sessionKey;
    const addOut = new AddSessionOutput();
    await this.session.addSession(addIn, addOut, new SessionContext());
    return addOut.session_id;
  }

  /** 确定性匹配（逻辑控制） */
  private async matchAgent(input: SubmitRunInput, report?: Report): Promise<MatchAgentDefOutput> {
    const matchInput = new MatchAgentDefInput();
    matchInput.task_content = input.user_message;
    matchInput.interact_id = input.interact_id ?? '';
    matchInput.context_id = input.context_id ?? '';
    const matchOutput = new MatchAgentDefOutput();
    await this.agents.matchAgentDef(matchInput, matchOutput, new AgentDefContext(), undefined, report);
    return matchOutput;
  }

  /** 组件快照（逻辑控制） */
  private async soSnapshot(defId: string, input: SubmitRunInput, report?: Report): Promise<SoAgentSnapshotOutput['snapshot']> {
    const snapInput = new SoAgentSnapshotInput();
    snapInput.def_id = defId;
    snapInput.task_content = input.user_message;
    snapInput.user_message = input.user_message;
    snapInput.interact_id = input.interact_id ?? '';
    snapInput.context_id = input.context_id ?? '';
    const snapOutput = new SoAgentSnapshotOutput();
    await this.agents.soAgentSnapshot(snapInput, snapOutput, new AgentDefContext(), undefined, report);
    return snapOutput.snapshot;
  }

  /** Loop 入参组装（数据处理） */
  private prepareLoopInput(
    runId: string,
    input: SubmitRunInput,
    runtimeSessionId: string,
    snapshot: SoAgentSnapshotOutput['snapshot'],
  ): ExecAgentLoopInput {
    const loopInput = new ExecAgentLoopInput();
    loopInput.run_id = runId;
    loopInput.session_key = input.session_key;
    loopInput.session_id = runtimeSessionId;
    loopInput.user_message = input.user_message;
    loopInput.system = snapshot.system;
    loopInput.llm_id = snapshot.llm_id;
    loopInput.temperature = snapshot.temperature;
    loopInput.budget = { total: input.budget_total ?? snapshot.budget_total };
    return loopInput;
  }

  /** 结算落账（逻辑控制）：状态 + waiter 唤醒 + followup 排水 */
  private async settleRun(runId: string, stopReason: string, budgetUsed: number, agentDefId: string): Promise<void> {
    const status: RunStatus = stopReason === 'stop' || stopReason === 'budget' ? RunStatus.Finished : (stopReason as RunStatus);
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

  /** followup 排水（逻辑控制；释放活动位后依序启动排队 run，复用 queued run_id） */
  private async drainFollowups(settledRunId: string): Promise<void> {
    const settled = await this.soRunRow(settledRunId);
    if (!settled) {
      return;
    }
    const laneKey = this.soLaneKeyOf(settled);
    const lane = this.soLane(laneKey);
    if (lane.activeRunId === settledRunId) {
      lane.activeRunId = undefined;
    }
    this.laneRunning.set(laneKey, Math.max(0, (this.laneRunning.get(laneKey) ?? 1) - 1));
    await this.maybeDrainLane(laneKey);
  }

  /** 活动位空闲且并发未满时启动下一条排队 run（逻辑控制；入队/结算双方共用的排水兜底） */
  private async maybeDrainLane(laneKey: string): Promise<void> {
    const lane = this.soLane(laneKey);
    if (lane.activeRunId || this.isLaneBusy(laneKey)) {
      return;
    }
    const next = lane.pending.shift();
    if (!next) {
      return;
    }
    const runtimeSessionId = await this.soRuntimeSessionId(next.input.session_key);
    await this.startRun(next.input, runtimeSessionId, next.parent, next.runId);
  }

  /** run 行 → lane 键（数据处理） */
  private soLaneKeyOf(row: Record<string, unknown>): string {
    return `${String(row.lane ?? 'session')}:${String(row.session_key)}`;
  }

  /** 查询 run 行（逻辑控制） */
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
      output.status = RunStatus.Running;
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
    return status === RunStatus.Finished || status === RunStatus.Error || status === RunStatus.Aborted;
  }

  /** 注册 waiter（逻辑控制；超时毫秒 >0 时定时兜底返回当前状态） */
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
          resolve({ status: String(row?.status ?? RunStatus.Running) as RunStatus, stop_reason: String(row?.stop_reason ?? '') });
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
  /** 权限等待注册表：permission_id → waiter（Deferred；waitRun 同模式） */
  private readonly permissionWaiters = new Map<string, { resolve: (r: { approved: boolean }) => void; answered: boolean }>();

  /**
   * 权限等待挂起（逻辑控制；Loop 权限门调用，permission.asked 已由 Loop 经 Report 下发）。
   */
  async waitPermission(input: WaitPermissionInput, output: WaitPermissionOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.permission_id) {
      throw new ValidationError('permission_id 不能为空');
    }
    const result = await new Promise<{ approved: boolean }>((resolve) => {
      this.permissionWaiters.set(input.permission_id, { resolve, answered: false });
    });
    this.permissionWaiters.delete(input.permission_id);
    output.approved = result.approved;
    output.answered = true;
    return true;
  }

  /** 权限应答（逻辑控制；HTTP 端点调用，唤醒挂起的 Loop） */
  async answerPermission(input: AnswerPermissionInput, output: AnswerPermissionOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.permission_id) {
      throw new ValidationError('permission_id 不能为空');
    }
    const waiter = this.permissionWaiters.get(input.permission_id);
    if (!waiter) {
      output.answered = false;
      return true;
    }
    this.permissionWaiters.delete(input.permission_id);
    waiter.resolve({ approved: input.approved });
    output.answered = true;
    return true;
  }

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

  /** Loop 边界抽干 steering 队列（session lane 专用；键与 soLaneKey 一致） */
  drainSteeringFor(sessionKey: string): string[] {
    const lane = this.lanes.get(`${LaneKind.Session}:${sessionKey}`);
    return lane ? lane.steering.splice(0, lane.steering.length) : [];
  }

  /** Loop 外层 followup 取队列（session lane 专用） */
  takeFollowupFor(sessionKey: string): string[] {
    const lane = this.lanes.get(`${LaneKind.Session}:${sessionKey}`);
    if (!lane || lane.activeRunId) {
      return [];
    }
    return lane.pending.splice(0, lane.pending.length).map((p) => p.input.user_message);
  }
}
