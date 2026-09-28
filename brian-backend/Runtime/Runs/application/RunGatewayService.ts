import type { RelationDBAccess, Logger, Metrics, Report } from '@brian-agent/base';
import {
  IdGenerator,
  Operator,
  newRecord,
  newPatch,
  ConfigService,
  BusinessEvent,
  ValidationError,

  formatContextCategories,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import { ContextInfoInput, ContextInfoOutput, InfoCoreContext } from '@brian-agent/core';
import { LaneSemaphore } from '../infrastructure/LaneSemaphore';
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
  AddMessageInput,
  AddMessageOutput,
  MessageRole,
  SessionContext,
  RUNTIME_MESSAGE_TABLE,
  RUNTIME_MESSAGE_PART_TABLE,
} from '../../Session';
import {
  MatchAgentDefInput,
  MatchAgentDefOutput,
  SoAgentSnapshotInput,
  SoAgentSnapshotOutput,
  AgentDefContext,
  KillErroredAgentInput,
  KillErroredAgentOutput,
  AgentMatchLayer,
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
  WaitUserAnswerInput,
  WaitUserAnswerOutput,
  AnswerUserAskInput,
  AnswerUserAskOutput,
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
import { LEGACY_TOOL_TO_SKILL_ID } from '../../SkillRuntime';

export interface OutputEvaluator {
  evalWorkAgent(input: {
    work_id: string;
    run_id: string;
    agent_id: string;
    task_content: string;
    agent_output: string;
  }, output: unknown, ctx: unknown, metrics?: Metrics, report?: Report): Promise<boolean>;
}

export interface OutputWriter {
  execWrite(input: {
    work_id: string;
    run_id: string;
    user_query: string;
    agent_results: Array<{ agent_id: string; task_content?: string; result?: string; answer?: string }>;
  }, output: { response?: string; response_format?: string; blocks?: unknown[] }, ctx: unknown, metrics?: Metrics, report?: Report): Promise<boolean>;
}

export class RunGatewayService {
  private enabled = true;
  private readonly config: ConfigService;

  private static readonly PERMISSION_WAIT_DEFAULT_MS = 120_000;

  private readonly lanes = new Map<string, SessionLane>();

  private readonly laneRunning = new Map<string, number>();

  private readonly waiters = new Map<string, Waiter>();

  private readonly childRuns = new Map<string, string[]>();

  private static readonly SUB_JOIN_TIMEOUT_MS = 180_000;

  private static readonly SUB_JOIN_POLL_MS = 500;

  private static readonly EVAL_ASYNC_DEFAULT = true;

  private static readonly EVAL_SKIP_LOW_RISK_DEFAULT = true;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly session: SessionAccess,
    private readonly agents: AgentDefAccess,
    private readonly loop: LoopAccess,
    private readonly logger?: Logger,
    private readonly evaluator?: OutputEvaluator,
    private readonly writer?: OutputWriter,

    private readonly infoCore?: InfoCoreAccess,
  ) {
    this.config = new ConfigService(relationDb, RUNTIME_RUNS_CONFIG_TABLE);
  }

  private async buildStaticMemory(
    runId: string,
    input: SubmitRunInput,
    metrics?: Metrics,
    report?: Report,
  ): Promise<{ memory: string; categories: string[] }> {
    if (!this.infoCore) return { memory: '', categories: [] };
    try {
      const ctxIn = new ContextInfoInput();
      ctxIn.session_id = input.session_key;
      ctxIn.work_id = runId;
      ctxIn.info = input.user_message;
      ctxIn.selected_msg_ids = input.selected_msg_ids;
      ctxIn.pinned_msg_ids = input.pinned_msg_ids;
      ctxIn.enable_cross_session = true;

      const ctxOut = new ContextInfoOutput();
      await this.infoCore.context(ctxIn, ctxOut, new InfoCoreContext(), metrics, report);
      const staticMemory = formatContextCategories(ctxOut);
      const categories = Object.entries(ctxOut.categories ?? {})
        .filter(([, v]) => Array.isArray(v) && v.length > 0)
        .map(([k]) => k);
      this.logger?.debug?.('主 Loop 静态记忆召回完成（前置构建）', { run_id: runId, categories });
      report?.pushBusinessEvent(BusinessEvent.ContextBuilt, {
        round: 0,
        base: true,
        message_count: 0,
        memory_categories: categories,
      });
      return { memory: staticMemory, categories };
    } catch (err) {
      this.logger?.warn?.('主 Loop 静态记忆召回失败（回退空记忆，不阻塞执行）', { run_id: runId, error: err instanceof Error ? err.message : String(err) });
      return { memory: '', categories: [] };
    }
  }

  private composeSystemWithMemory(baseSystem: string, memory: string): string {
    if (!memory) return baseSystem;
    return baseSystem ? `${baseSystem}\n\n${memory}` : memory;
  }

  async initialize(): Promise<void> {
    const enabledRow = await this.config.getString('enabled', 'true');
    this.enabled = enabledRow !== 'false';
    await this.convergeOrphanRuns();
    this.logger?.debug?.('RunGatewayService 初始化完成');
  }

  private async convergeOrphanRuns(): Promise<void> {
    try {
      const rows = await this.relationDb.select(RUNTIME_RUN_TABLE, {
        conditions: [
          { field: 'status', operator: Operator.IN, value: ['running', 'queued'] },
        ],
      });
      for (const row of rows ?? []) {
        const runId = String(row.id ?? '');
        if (!runId) {
          continue;
        }
        await this.relationDb.update(RUNTIME_RUN_TABLE, newPatch({
          status: RunStatus.Aborted,
          stop_reason: AbortReason.ServiceRestart,
          settled_at: IdGenerator.now(),
        }), [{ field: 'id', operator: Operator.EQ, value: runId }]);
      }
      if (rows?.length) {
        this.logger?.info?.(`[startup] 遗留 run 收敛为 aborted（count=${rows.length}）`, { log_source: 'SYSTEM' });
      }
    } catch (err) {
      this.logger?.warn?.('遗留 run 收敛失败（best effort）', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new ValidationError('Runs 组件未启用，请先通过 configRuns 启用');
    }
  }

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
    let runId: string;
    if (lane.activeRunId) {
      const queued = await this.enqueueByQueueMode(lane, input, runtimeSessionId, parent);
      runId = queued.runId;
      output.run_id = queued.runId;
      output.queued = queued.queued;
      output.steered = queued.steered;
    } else {
      runId = await this.startRun(input, runtimeSessionId, parent);
      output.run_id = runId;
      output.queued = false;
      output.steered = false;
      await this.publishRunAccepted(input.session_key, runId, report, metrics);
    }

    if (!output.steered) {
      this.registerDelegation(input, runId);
    }
    return true;
  }

  private registerDelegation(input: SubmitRunInput, runId: string): void {
    if (!input.parent_run_id) {
      return;
    }
    const siblings = this.childRuns.get(input.parent_run_id) ?? [];
    siblings.push(runId);
    this.childRuns.set(input.parent_run_id, siblings);
  }

  private async publishRunAccepted(sessionKey: string, runId: string, report?: Report, _metrics?: Metrics): Promise<void> {
    report?.pushBusinessEvent(BusinessEvent.RunAccepted, { run_id: runId });
  }

  private soLaneKey(input: SubmitRunInput): string {
    return `${input.lane_kind ?? LaneKind.Session}:${input.session_key}`;
  }

  private soLane(laneKey: string): SessionLane {
    let lane = this.lanes.get(laneKey);
    if (!lane) {
      lane = { activeRunId: undefined, pending: [], steering: [] };
      this.lanes.set(laneKey, lane);
    }
    return lane;
  }

  private isLaneBusy(laneKey: string): boolean {
    const kind = laneKey.split(':')[0] as LaneKind;
    if (kind === LaneKind.Session) {
      return false;
    }
    return (this.laneRunning.get(laneKey) ?? 0) >= LANE_CONCURRENCY[kind];
  }

  private async enqueueByQueueMode(
    lane: SessionLane,
    input: SubmitRunInput,
    runtimeSessionId: string,
    parent: { metrics?: Metrics; report?: Report },
  ): Promise<{ runId: string; queued: boolean; steered: boolean }> {
    const mode = input.queue_mode ?? QueueMode.Steer;
    if (mode === QueueMode.Steer && lane.acceptingSteer) {
      lane.steering.push(input.user_message);
      return { runId: lane.activeRunId!, queued: false, steered: true };
    }
    if (mode === QueueMode.Collect) {
      throw new ValidationError('collect 队列模式阶段4 落地（Runs-PRD §4.2）');
    }

    const runId = await this.insertQueuedRun(input, mode, runtimeSessionId, parent);
    lane.pending.push({ runId, input, parent });
    if (mode === QueueMode.Interrupt) {
      const activeRunId = lane.activeRunId!;
      await this.abortRun(this.prepareAbortInput(activeRunId), new AbortRunOutput(), new RunGatewayContext());
    }

    await this.maybeDrainLane(`${input.lane_kind ?? LaneKind.Session}:${input.session_key}`);
    return { runId, queued: true, steered: false };
  }

  private prepareAbortInput(runId: string): AbortRunInput {
    const input = new AbortRunInput();
    input.run_id = runId;
    input.reason = AbortReason.Superseded;
    return input;
  }

  private soRunTraceId(_input: SubmitRunInput, parent?: { metrics?: Metrics; report?: Report }): string {
    return parent?.metrics?.trace_id || '';
  }

  private async insertQueuedRun(input: SubmitRunInput, mode: QueueMode, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }): Promise<string> {
    const record = newRecord({
      session_key: input.session_key,
      session_id: runtimeSessionId,
      lane: input.lane_kind ?? 'session',
      status: RunStatus.Queued,
      queue_mode: mode,
      budget_total: input.budget_total ?? DEFAULT_BUDGET_TOTAL,
      accepted_at: IdGenerator.now(),
      trace_id: this.soRunTraceId(input, parent),
    });
    await this.relationDb.insert(RUNTIME_RUN_TABLE, record);
    return String(record[0].value);
  }

  private async startRun(input: SubmitRunInput, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }, runId?: string): Promise<string> {
    const activeRunId = runId ?? IdGenerator.generate();
    const laneKind = input.lane_kind ?? LaneKind.Session;
    const laneKey = `${laneKind}:${input.session_key}`;
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
        lane: laneKind,
        status: RunStatus.Running,
        budget_total: input.budget_total ?? DEFAULT_BUDGET_TOTAL,
        accepted_at: IdGenerator.now(),
        started_at: IdGenerator.now(),
        trace_id: this.soRunTraceId(input, parent),
      });
      await this.relationDb.insert(RUNTIME_RUN_TABLE, record);
    }

    void this.executeRun(activeRunId, input, runtimeSessionId, parent);
    return activeRunId;
  }

  private async executeRun(runId: string, input: SubmitRunInput, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }): Promise<void> {
    let matchOut: MatchAgentDefOutput | undefined;
    const steerLane = this.soLane(`${input.lane_kind ?? LaneKind.Session}:${input.session_key}`);
    steerLane.acceptingSteer = true;
    try {
      const sessionId = await this.soRunSessionId(runId, input, runtimeSessionId);
      const baseCtx = await this.buildStaticMemory(runId, input, parent?.metrics, parent?.report);
      matchOut = await this.matchAgent(runId, input, parent?.metrics, parent?.report);
      parent?.report?.pushBusinessEvent(BusinessEvent.AgentSelected, {
        def_id: matchOut.def_id,
        agent_name: matchOut.def.name,
        matched_by: matchOut.matched_by,
      });
      const snapshot = await this.soSnapshot(matchOut.def_id, runId, input, parent?.metrics, parent?.report);
      const { systemSkillCount, boundSkillCount, mcpCount } = this.publishAgentComponents(matchOut, snapshot, parent?.report);

      const loopInput = this.prepareLoopInput(runId, input, sessionId, snapshot);
      const thoughtMode = this.decideThoughtMode(loopInput.skills ?? [], boundSkillCount, mcpCount);
      this.publishThoughtModeSelected(thoughtMode, systemSkillCount + boundSkillCount, mcpCount, parent?.report);
      this.prepareLoopContext(loopInput, snapshot, baseCtx.memory, thoughtMode.mode);
      const loopOutput = new ExecAgentLoopOutput();
      try {
        await this.loop.execAgentLoop(loopInput, loopOutput, new RunGatewayContext(), parent?.metrics, parent?.report);
      } finally {
        steerLane.acceptingSteer = false;
      }
      await this.finishRunByLane(runId, input, runtimeSessionId, matchOut, loopInput, loopOutput, parent);
      await this.settleRun(runId, loopOutput.stop_reason, loopOutput.iterations, matchOut.def_id, matchOut.def.agent_ref, input.user_message, parent?.metrics, parent?.report, loopOutput.error);
      await this.recordRunOutcome(runId, input, matchOut, loopOutput, parent);
    } catch (err) {
      steerLane.acceptingSteer = false;
      await this.settleRunFailure(runId, input, matchOut, err, parent);
    }
  }

  private async soRunSessionId(runId: string, input: SubmitRunInput, runtimeSessionId: string): Promise<string> {
    if ((input.lane_kind ?? LaneKind.Session) !== LaneKind.Subagent) {
      return runtimeSessionId;
    }
    return this.soRuntimeSessionId(this.soSubSessionKey(input.session_key, runId));
  }

  private soSubSessionKey(sessionKey: string, runId: string): string {
    return `${sessionKey}::sub:${runId}`;
  }

  private async finishRunByLane(
    runId: string,
    input: SubmitRunInput,
    runtimeSessionId: string,
    matchOut: MatchAgentDefOutput,
    loopInput: ExecAgentLoopInput,
    loopOutput: ExecAgentLoopOutput,
    parent?: { metrics?: Metrics; report?: Report },
  ): Promise<void> {
    if (loopOutput.stop_reason !== LoopStopReason.Stop || !loopOutput.result) {
      return;
    }
    if ((input.lane_kind ?? LaneKind.Session) !== LaneKind.Session) {
      return;
    }
    const childResults = await this.joinChildRuns(runId);
    const collected = await this.collectChildResults(runtimeSessionId, runId, childResults);
    await this.updateDelegatePartOutputs(runId, collected);
    await this.executeRunEvaluation(runId, input, matchOut, loopOutput, parent);
    await this.executeRunWriting(runId, input, matchOut, loopOutput, parent, collected);
    if (loopInput.defer_final_reply) {
      parent?.report?.pushBusinessEvent(BusinessEvent.RunFinished, { stop_reason: loopOutput.stop_reason });
    }
  }

  private async joinChildRuns(runId: string): Promise<string[]> {
    const childIds = this.childRuns.get(runId) ?? [];
    if (!childIds.length) {
      return [];
    }
    const deadline = Date.now() + RunGatewayService.SUB_JOIN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const rows = await Promise.all(childIds.map((id) => this.soRunRow(id)));
      const allSettled = rows.every((row) => row && this.isSettledStatus(String(row.status)));
      if (allSettled) {
        return childIds;
      }
      await new Promise((resolve) => setTimeout(resolve, RunGatewayService.SUB_JOIN_POLL_MS));
    }
    this.logger?.warn?.('子 run join 超时（放弃等待，未完成子任务如实标注进写作）', { run_id: runId, child_count: childIds.length });
    return childIds;
  }

  private async collectChildResults(runtimeSessionId: string, runId: string, childIds: string[]): Promise<Map<string, { agent_id: string; task_content: string; result: string }>> {
    const collected = new Map<string, { agent_id: string; task_content: string; result: string }>();
    for (const childId of childIds) {
      const outcome = await this.soChildOutcome(runtimeSessionId, childId);
      if (outcome) {
        collected.set(childId, outcome);
      }
    }
    this.childRuns.delete(runId);
    return collected;
  }

  private async soChildOutcome(runtimeSessionId: string, childId: string): Promise<{ agent_id: string; task_content: string; result: string } | null> {
    void runtimeSessionId;
    const row = await this.soRunRow(childId);
    if (!row) {
      return null;
    }
    const subSessionId = await this.soRuntimeSessionId(this.soSubSessionKey(String(row.session_key), childId));
    const messages = this.relationDb.queryRaw<{ role: string; content: string }>(
      `SELECT "role", "content" FROM "runtime_message" WHERE "session_id" = ? ORDER BY "seq"`,
      [subSessionId],
    ) ?? [];
    const task = messages.find((m) => m.role === 'user')?.content ?? '';
    const result = [...messages].reverse().find((m) => m.role === 'assistant' && m.content && m.content.trim())?.content ?? '';
    const settled = this.isSettledStatus(String(row.status));
    const agentName = this.soComponentName(String(row.agent_def_id ?? ''), 'runtime_agent_def', 'name') || '子代理';
    return {
      agent_id: agentName,
      task_content: task,
      result: settled ? (result || `（子任务 ${childId} 无输出）`) : `（子任务 ${childId} 超时未完成，状态：${String(row.status)}）`,
    };
  }

  private async updateDelegatePartOutputs(runId: string, collected: Map<string, { agent_id: string; task_content: string; result: string }>): Promise<void> {
    if (!collected.size) {
      return;
    }
    const parts = this.relationDb.queryRaw<{ id: string; output_json: string }>(
      `SELECT "id", "output_json" FROM "runtime_message_part" WHERE "run_id" = ? AND "part_type" = 'tool' AND "tool_id" = 'skill_builtin-delegate'`,
      [runId],
    ) ?? [];
    for (const part of parts) {
      const childId = this.parseRunIdFromReceipt(part.output_json);
      const outcome = childId ? collected.get(childId) : undefined;
      if (!outcome) {
        continue;
      }
      await this.relationDb.update(RUNTIME_MESSAGE_PART_TABLE, newPatch({
        output_json: `子任务完成（run_id=${childId}，Agent=${outcome.agent_id}）：${outcome.result.slice(0, 500)}`,
      }), [{ field: 'id', operator: Operator.EQ, value: part.id }]);
    }
  }

  private parseRunIdFromReceipt(outputJson?: string): string | null {
    const matched = /run_id=([A-Za-z0-9_-]+)/.exec(outputJson ?? '');
    return matched ? matched[1] : null;
  }

  private publishAgentComponents(
    matchOut: MatchAgentDefOutput,
    snapshot: SoAgentSnapshotOutput['snapshot'],
    report?: Report,
  ): { systemSkillCount: number; boundSkillCount: number; mcpCount: number } {
    const soulId = matchOut.def.soul_id ?? '';
    const promptId = matchOut.def.prompt_template_id ?? '';
    const llmId = snapshot.llm_id ?? '';
    const skillEntries = (snapshot.tools ?? [])
      .filter((t) => t.kind === 'skill')
      .map((t) => ({ id: t.id, brief: t.brief || this.soSkillName(t.id), system: t.system === true }));
    const mcpEntries = (snapshot.tools ?? [])
      .filter((t) => t.kind === 'mcp')
      .map((t) => ({ id: t.id, brief: t.brief || this.soComponentName(t.id, 'mcp_install', 'mcp_title') }));
    report?.pushBusinessEvent(BusinessEvent.AgentComponents, {
      agent_name: snapshot.name,
      soul_id: soulId,
      soul_name: this.soComponentName(soulId, 'soul', 'soul_brief'),
      prompt_template_id: promptId,
      prompt_name: this.soComponentName(promptId, 'prompt_template', 'prompt_template_title'),
      llm_id: llmId,
      llm_name: this.soComponentName(llmId, 'llm_available', 'llm_title'),
      skills: skillEntries,
      mcps: mcpEntries,
    });

    if (matchOut.matched_by !== AgentMatchLayer.Built) {
      report?.pushBusinessEvent(BusinessEvent.SkillSelected, {
        source: 'match',
        skills: skillEntries,
        reason: `命中既有 Agent（${matchOut.matched_by}），Skill 选举结果=绑定事实源：系统级恒选中 ${skillEntries.filter((s) => s.system).length} 项 + 沉淀绑定 ${skillEntries.filter((s) => !s.system).length} 项`,
        skills_count: skillEntries.length,
        system_skills_count: skillEntries.filter((s) => s.system).length,
      });
      report?.pushBusinessEvent(BusinessEvent.McpSelected, {
        source: 'match',
        mcps: mcpEntries,
        reason: mcpEntries.length > 0
          ? `命中既有 Agent（${matchOut.matched_by}），MCP 选举结果=绑定事实源：${mcpEntries.length} 个`
          : `命中既有 Agent（${matchOut.matched_by}），MCP 选举结果=无绑定`,
        mcps_count: mcpEntries.length,
      });
      if (soulId) {
        report?.pushBusinessEvent(BusinessEvent.SoulSelected, {
          soul_id: soulId,
          brief: this.soComponentName(soulId, 'soul', 'soul_brief'),
          stage: 'match',
          reason: `命中既有 Agent（${matchOut.matched_by}），人格选举结果=绑定事实源（命中复用）`,
        });
      }
    }
    return {
      systemSkillCount: skillEntries.filter((s) => s.system).length,
      boundSkillCount: skillEntries.filter((s) => !s.system).length,
      mcpCount: mcpEntries.length,
    };
  }

  private publishThoughtModeSelected(
    thoughtMode: { mode: 'CoT' | 'ReAct'; reason: string },
    skillCount: number,
    mcpCount: number,
    report?: Report,
  ): void {
    report?.pushBusinessEvent(BusinessEvent.ThoughtModeSelected, {
      thought_mode: thoughtMode.mode,
      reason: thoughtMode.reason,
      skills_count: skillCount,
      mcps_count: mcpCount,
    });
  }

  private prepareLoopContext(
    loopInput: ExecAgentLoopInput,
    snapshot: SoAgentSnapshotOutput['snapshot'],
    memory: string,
    thoughtMode: 'CoT' | 'ReAct',
  ): void {
    loopInput.system = this.composeSystemWithMemory(snapshot.system ?? '', memory);
    loopInput.thought_mode = thoughtMode;
    if (this.writer) {
      loopInput.defer_final_reply = true;
    }
  }

  private async executeRunEvaluation(
    runId: string,
    input: SubmitRunInput,
    matchOut: MatchAgentDefOutput,
    loopOutput: ExecAgentLoopOutput,
    parent?: { metrics?: Metrics; report?: Report },
  ): Promise<void> {
    if (!this.evaluator) return;
    const evalAsync = await this.soEvalAsync();
    const skipLowRisk = await this.soEvalSkipLowRisk();
    const lowRisk = loopOutput.iterations <= 1;
    if (skipLowRisk && lowRisk) {
      this.logger?.debug?.('评估 Agent 跳过（低风险：单轮直答，eval_skip_low_risk=true）', { run_id: runId, iterations: loopOutput.iterations });
      return;
    }
    const evalWorkId = IdGenerator.generate();
    parent?.report?.pushBusinessEvent(BusinessEvent.EvaluationStarted, { work_id: evalWorkId, mode: evalAsync ? 'async' : 'sync' });

    if (evalAsync) {
      this.scheduleCurator(runId, input, matchOut, loopOutput, evalWorkId, parent);
      return;
    }
    await this.runWorkEvaluation(runId, input, matchOut, loopOutput, evalWorkId, parent);
  }

  private async executeRunWriting(
    runId: string,
    input: SubmitRunInput,
    matchOut: MatchAgentDefOutput,
    loopOutput: ExecAgentLoopOutput,
    parent?: { metrics?: Metrics; report?: Report },
    childResults?: Map<string, { agent_id: string; task_content: string; result: string }>,
  ): Promise<void> {
    if (!this.writer) return;
    try {
      const writeWorkId = IdGenerator.generate();
      parent?.report?.pushBusinessEvent(BusinessEvent.WriterStarted, { work_id: writeWorkId });
      const writeOut: { response?: string; response_format?: string; blocks?: unknown[] } = { response: '', blocks: [] };
      const writeCtx: Record<string, unknown> = { session_id: input.session_key, work_id: writeWorkId, run_id: runId };
      const agentResults = [
        { agent_id: matchOut.def.name, task_content: input.user_message, result: loopOutput.result },
        ...(childResults?.size ? [...childResults.values()] : []),
      ];
      const writeOk = await this.writer.execWrite({
        work_id: writeWorkId,
        run_id: runId,
        user_query: input.user_message,
        agent_results: agentResults,
      }, writeOut, writeCtx, parent?.metrics, parent?.report);
      if (writeOk && writeOut.response) {
        await this.applyWriterResult(writeOut.response, writeOut, loopOutput, parent);
      } else {
        parent?.report?.pushBusinessEvent(BusinessEvent.ReplyDelta, { delta: loopOutput.result });
      }
    } catch (err) {
      this.logger?.warn?.('写作 Agent 执行失败（降级为原始输出）', { error: err instanceof Error ? err.message : String(err) });
      parent?.report?.pushBusinessEvent(BusinessEvent.ReplyDelta, { delta: loopOutput.result });
    }
  }

  private async applyWriterResult(
    finalResult: string,
    writeOut: { response?: string; response_format?: string; blocks?: unknown[] },
    loopOutput: ExecAgentLoopOutput,
    parent?: { metrics?: Metrics; report?: Report },
  ): Promise<void> {
    parent?.report?.pushBusinessEvent(BusinessEvent.WriterCompleted, {
      format: writeOut.response_format || 'MARKDOWN',
      length: finalResult.length,
      has_mermaid: finalResult.includes('```mermaid'),
    });
    parent?.report?.pushBusinessEvent(BusinessEvent.ReplyDelta, { delta: finalResult });
    if (loopOutput.msg_id) {
      await this.updateAssistantMessageContent(loopOutput.msg_id, finalResult);
    }
  }

  private async recordRunOutcome(
    runId: string,
    input: SubmitRunInput,
    matchOut: MatchAgentDefOutput,
    loopOutput: ExecAgentLoopOutput,
    parent?: { metrics?: Metrics; report?: Report },
  ): Promise<void> {
    if (loopOutput.stop_reason === LoopStopReason.Error) {
      this.logger?.error?.('run 执行失败', {
        run_id: runId,
        session_key: input.session_key,
        stop_reason: loopOutput.stop_reason,
        error: loopOutput.error,
        iterations: loopOutput.iterations,
      });
      await this.killErroredAgent(runId, matchOut, input, parent?.metrics, parent?.report, loopOutput.error ?? '');
    } else if (loopOutput.stop_reason === LoopStopReason.Aborted) {
      this.logger?.warn?.('run 执行中止（外部信号取消/超时）', {
        run_id: runId,
        session_key: input.session_key,
        stop_reason: loopOutput.stop_reason,
        iterations: loopOutput.iterations,
      });
    }
  }

  private async settleRunFailure(
    runId: string,
    input: SubmitRunInput,
    matchOut: MatchAgentDefOutput | undefined,
    err: unknown,
    parent?: { metrics?: Metrics; report?: Report },
  ): Promise<void> {
    const errMessage = err instanceof Error ? err.message : String(err);
    this.logger?.error?.('run 执行异常（未捕获错误）', { run_id: runId, session_key: input.session_key, error: errMessage });
    parent?.metrics?.error?.('run 执行失败（结算为 error）', { run_id: runId, error: errMessage });
    await this.settleRun(runId, LoopStopReason.Error, 0, '', matchOut?.def?.agent_ref ?? '', input.user_message, parent?.metrics, parent?.report, errMessage);
    if (matchOut?.def?.agent_ref) {
      await this.killErroredAgent(runId, matchOut, input, parent?.metrics, parent?.report, errMessage);
    }
  }

  private async killErroredAgent(
    runId: string,
    matchOut: MatchAgentDefOutput,
    input: SubmitRunInput,
    metrics?: Metrics,
    report?: Report,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.agents.killErroredAgent(
        Object.assign(new KillErroredAgentInput(), {
          agent_ref: matchOut.def.agent_ref,
          work_id: runId,
          run_id: runId,
          trace_id: metrics?.trace_id ?? '',
          task_content: input.user_message,
          error: errorMessage ?? '',
        }),
        new KillErroredAgentOutput(),
        new AgentDefContext(),
        metrics,
        report,
      );
    } catch (err) {
      report?.pushBusinessEvent(BusinessEvent.ErrorOccurred, { run_id: runId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async runWorkEvaluation(
    runId: string,
    input: SubmitRunInput,
    matchOut: MatchAgentDefOutput,
    loopOutput: ExecAgentLoopOutput,
    evalWorkId: string,
    parent?: { metrics?: Metrics; report?: Report },
  ): Promise<void> {
    try {
      const evalOut: Record<string, unknown> = {};
      const evalCtx: Record<string, unknown> = { session_id: input.session_key, work_id: evalWorkId, run_id: runId };
      await this.evaluator!.evalWorkAgent({
        work_id: evalWorkId,
        run_id: runId,
        agent_id: matchOut.def.agent_ref || matchOut.def_id,
        task_content: input.user_message,
        agent_output: loopOutput.result,
      }, evalOut, evalCtx, parent?.metrics, parent?.report);
    } catch (err) {
      this.logger?.warn?.('评估 Agent 执行失败（不阻断主流程）', { error: err instanceof Error ? err.message : String(err), run_id: runId });
    }
  }

  private async soEvalAsync(): Promise<boolean> {
    const value = await this.config.getString('eval_async', String(RunGatewayService.EVAL_ASYNC_DEFAULT));
    return value !== 'false';
  }

  private async soEvalSkipLowRisk(): Promise<boolean> {
    const value = await this.config.getString('eval_skip_low_risk', String(RunGatewayService.EVAL_SKIP_LOW_RISK_DEFAULT));
    return value !== 'false';
  }

  private async updateAssistantMessageContent(messageId: string, content: string): Promise<void> {    try {
      await this.relationDb.update(RUNTIME_MESSAGE_TABLE, newPatch({
        content,
      }), [{ field: 'id', operator: Operator.EQ, value: messageId }]);
      await this.relationDb.update(RUNTIME_MESSAGE_PART_TABLE, newPatch({
        content,
      }), [
        { field: 'msg_id', operator: Operator.EQ, value: messageId },
        { field: 'part_type', operator: Operator.EQ, value: 'text' },
      ]);
    } catch (err) {
      this.logger?.warn?.('更新 assistant 消息内容失败（best-effort）', {
        msg_id: messageId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async soRuntimeSessionId(sessionKey: string, metrics?: Metrics): Promise<string> {
    const addIn = new AddSessionInput();
    addIn.session_key = sessionKey;
    const addOut = new AddSessionOutput();
    await this.session.addSession(addIn, addOut, new SessionContext(), metrics);
    return addOut.session_id;
  }

  private async matchAgent(runId: string, input: SubmitRunInput, metrics?: Metrics, report?: Report): Promise<MatchAgentDefOutput> {
    const matchInput = new MatchAgentDefInput();
    matchInput.task_content = input.user_message;
    matchInput.session_id = input.session_key;
    matchInput.run_id = runId;
    matchInput.work_id = IdGenerator.generate();
    matchInput.context_id = input.context_id ?? '';
    matchInput.agent_ref = input.agent_ref ?? '';
    const matchOutput = new MatchAgentDefOutput();
    await this.agents.matchAgentDef(matchInput, matchOutput, new AgentDefContext(), metrics, report);
    return matchOutput;
  }

  private async soSnapshot(
    defId: string,
    runId: string,
    input: SubmitRunInput,
    metrics?: Metrics,
    report?: Report,
  ): Promise<SoAgentSnapshotOutput['snapshot']> {
    const snapInput = new SoAgentSnapshotInput();
    snapInput.def_id = defId;
    snapInput.task_content = input.user_message;
    snapInput.user_message = input.user_message;
    snapInput.run_id = runId;
    snapInput.context_id = input.context_id ?? '';
    const snapOutput = new SoAgentSnapshotOutput();
    await this.agents.soAgentSnapshot(snapInput, snapOutput, new AgentDefContext(), metrics, report);
    return snapOutput.snapshot;
  }

  private static readonly OBSERVABLE_SKILL_IDS = new Set(['skill_builtin-exec', 'skill_builtin-browser', 'mcp_exec']);
  private static readonly ORCHESTRATION_SKILL_IDS = new Set(['skill_builtin-plan', 'skill_builtin-ask-user']);

  private static isObservableSkill(skillId: string): boolean {
    if (RunGatewayService.OBSERVABLE_SKILL_IDS.has(skillId)) {
      return true;
    }
    return skillId.startsWith('skill_') && !RunGatewayService.ORCHESTRATION_SKILL_IDS.has(skillId);
  }

  private decideThoughtMode(skillIds: string[], _skillCount: number, mcpCount: number): { mode: 'CoT' | 'ReAct'; reason: string } {
    const observableCount = skillIds.filter((id) => RunGatewayService.isObservableSkill(id)).length;
    if (observableCount > 0 || mcpCount > 0) {
      return {
        mode: 'ReAct',
        reason: `执行需「行动→观察→再决策」的外部交互闭环：技能面含 ${observableCount} 个可执行/可观察技能（系统级 + 绑定沉淀）${mcpCount > 0 ? ` 与 MCP 通道 ${mcpCount} 个` : ''}，选用 ReAct`,
      };
    }
    return {
      mode: 'CoT',
      reason: '技能面无外部观察/执行技能且无 MCP 通道（仅编排类技能或空），ReAct 的 Act 环节退化，选用 CoT 一步链式推理',
    };
  }

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
    loopInput.run_id = runId;
    loopInput.work_id = IdGenerator.generate();
    loopInput.user_message = input.user_message;
    loopInput.system = snapshot.system;
    loopInput.llm_id = snapshot.llm_id;
    loopInput.temperature = snapshot.temperature;
    loopInput.budget = { total: input.budget_total ?? snapshot.budget_total };

    const boundSkills = (snapshot.tools ?? [])
      .filter((t) => t.kind === 'skill' && !t.system && !t.id.startsWith('skill_builtin-'))
      .map((t) => t.id);
    const boundMcps = (snapshot.tools ?? []).filter((t) => t.kind === 'mcp').map((t) => t.id);

    const isSubagent = (input.lane_kind ?? LaneKind.Session) === LaneKind.Subagent;
    loopInput.skills = ['skill_builtin-exec', 'skill_builtin-browser', 'skill_builtin-plan', 'skill_builtin-ask-user'];
    if (!isSubagent) {
      loopInput.skills.push('skill_builtin-delegate');
    }
    for (const skillId of boundSkills) {
      loopInput.skills.push(`skill_${skillId}`);
    }
    if (boundMcps.length) {
      loopInput.skills.push('mcp_exec');
    }
    loopInput.component_scope = { skills: boundSkills, mcps: boundMcps };
    return loopInput;
  }

  private async settleRun(
    runId: string,
    stopReason: string,
    budgetUsed: number,
    agentDefId: string,
    agentRef?: string,
    _taskContent?: string,
    metrics?: Metrics,
    report?: Report,
    errorMessage?: string,
  ): Promise<void> {
    const status: RunStatus = stopReason === 'stop' || stopReason === 'budget' ? RunStatus.Finished : (stopReason as RunStatus);

    const now = IdGenerator.now();

    await this.relationDb.update(RUNTIME_RUN_TABLE, newPatch({
      status,
      stop_reason: stopReason,
      settled_at: now,
      budget_used: budgetUsed,
      agent_def_id: agentDefId,
    }), [{ field: 'id', operator: Operator.EQ, value: runId }]);

    const waiter = this.waiters.get(runId);
    this.waiters.delete(runId);
    waiter?.resolve({ status, stop_reason: stopReason });
    if (agentRef && errorMessage) {
      report?.pushBusinessEvent(BusinessEvent.ErrorOccurred, { run_id: runId, agent_id: agentRef, error: errorMessage.slice(0, 300) });
    }
    await this.drainFollowups(runId);
  }

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
    await this.drainResidualSteering(laneKey, lane, settled);
    await this.maybeDrainLane(laneKey);
  }

  /** run 结算时 loop 已退出，遗留的 steering 消息若不接管将永久丢失；此处以残留消息拉起后续 run。 */
  private async drainResidualSteering(laneKey: string, lane: SessionLane, settledRow: Record<string, unknown>): Promise<void> {
    if (lane.activeRunId || this.isLaneBusy(laneKey)) {
      return;
    }
    const residual = lane.steering.splice(0, lane.steering.length);
    if (residual.length === 0) {
      return;
    }
    const input = new SubmitRunInput();
    input.session_key = String(settledRow.session_key ?? '');
    input.user_message = residual.join('\n\n');
    input.lane_kind = String(settledRow.lane ?? LaneKind.Session) as LaneKind;
    this.logger?.info?.('run 结算后仍有 steering 消息残留，自动拉起后续 run', {
      lane: laneKey,
      settled_run_id: String(settledRow.id ?? ''),
      count: residual.length,
    });
    await this.startRun(input, String(settledRow.session_id ?? ''), undefined);
  }

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

  private soLaneKeyOf(row: Record<string, unknown>): string {
    return `${String(row.lane ?? 'session')}:${String(row.session_key)}`;
  }

  private async soRunRow(runId: string): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(RUNTIME_RUN_TABLE, [
      { field: 'id', operator: Operator.EQ, value: runId },
    ]);
  }

  async waitRun(input: WaitRunInput, output: WaitRunOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const settled = await this.soRunRow(input.run_id);
    if (!settled) {

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

  private isSettledStatus(status: string): boolean {
    return status === RunStatus.Finished || status === RunStatus.Error || status === RunStatus.Aborted;
  }

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

  async steerRun(input: SteerRunInput, output: SteerRunOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const lane = this.soLane(input.session_key);
    lane.steering.push(input.message);
    output.run_id = lane.activeRunId ?? '';
    output.enqueued = true;
    return true;
  }

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

  async soRunStatus(input: SoRunStatusInput, output: SoRunStatusOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const row = await this.soRunRow(input.run_id);
    output.run = row ? this.toRunRecord(row) : undefined;
    return true;
  }

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

  private readonly permissionWaiters = new Map<string, { resolve: (r: { approved: boolean; autoApproved?: boolean }) => void; answered: boolean; tool_id?: string }>();

  private trustedTools: Set<string> | null = null;

  private async soTrustedTools(): Promise<Set<string>> {
    if (this.trustedTools) return this.trustedTools;
    try {
      const raw = await this.config.getString('trusted_tools', '[]');
      const parsed: unknown = JSON.parse(String(raw ?? '[]'));
      this.trustedTools = new Set(Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []);
    } catch {
      this.trustedTools = new Set();
    }
    return this.trustedTools;
  }

  private async persistTrustedTools(): Promise<void> {
    if (!this.trustedTools) return;
    try {
      await this.config.set('trusted_tools', JSON.stringify([...this.trustedTools]), 'STRING', '永久批准的信任工具表（tool_id 数组）');
    } catch (err) {
      this.logger?.warn?.('persistTrustedTools: 信任表持久化失败（内存态仍生效）', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async waitPermission(input: WaitPermissionInput, output: WaitPermissionOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.permission_id) {
      throw new ValidationError('permission_id 不能为空');
    }

    if (input.tool_id) {
      const trusted = await this.soTrustedTools();
      const legacyId = Object.entries(LEGACY_TOOL_TO_SKILL_ID).find(([, newId]) => newId === input.tool_id)?.[0];
      if (trusted.has(input.tool_id) || (legacyId && trusted.has(legacyId))) {
        output.approved = true;
        output.answered = true;
        output.auto_approved = true;
        return true;
      }
    }
    const timeoutRef = { value: RunGatewayService.PERMISSION_WAIT_DEFAULT_MS };
    try {
      timeoutRef.value = await this.soPermissionWaitTimeout();
    } catch {  }
    const result = await new Promise<{ approved: boolean; autoApproved?: boolean }>((resolve) => {
      this.permissionWaiters.set(input.permission_id, { resolve, answered: false, tool_id: input.tool_id });
      const timer = setTimeout(
        () => {
          if (this.permissionWaiters.get(input.permission_id)?.resolve === resolve) {
            this.permissionWaiters.delete(input.permission_id);
            resolve({ approved: false });
          }
        },
        timeoutRef.value,
      );

      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });

    this.permissionWaiters.delete(input.permission_id);
    output.approved = result.approved;
    output.answered = true;
    output.auto_approved = result.autoApproved === true;
    return true;
  }

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

    if (input.approved && input.remember && waiter.tool_id) {
      const trusted = await this.soTrustedTools();
      if (!trusted.has(waiter.tool_id)) {
        trusted.add(waiter.tool_id);
        await this.persistTrustedTools();
      }
    }
    waiter.resolve({ approved: input.approved });
    output.answered = true;
    return true;
  }

  private readonly userAskWaiters = new Map<string, { resolve: (r: { answer: string; answered: boolean }) => void; run_id: string; session_key: string }>();

  async waitUserAnswer(input: WaitUserAnswerInput, output: WaitUserAnswerOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.ask_id || !input.run_id || !input.session_key) {
      throw new ValidationError('ask_id/run_id/session_key 不能为空');
    }
    let timeoutMs = RunGatewayService.PERMISSION_WAIT_DEFAULT_MS;
    try {
      timeoutMs = await this.soPermissionWaitTimeout();
    } catch {  }
    const result = await new Promise<{ answer: string; answered: boolean }>((resolve) => {
      this.userAskWaiters.set(input.ask_id, { resolve, run_id: input.run_id, session_key: input.session_key });
      const timer = setTimeout(() => {
        if (this.userAskWaiters.get(input.ask_id)?.resolve === resolve) {
          this.userAskWaiters.delete(input.ask_id);
          resolve({ answer: '', answered: false });
        }
      }, timeoutMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });
    output.answer = result.answer;
    output.answered = result.answered;
    return true;
  }

  async answerUserAsk(input: AnswerUserAskInput, output: AnswerUserAskOutput, _context: RunGatewayContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.ask_id || typeof input.answer !== 'string' || !input.answer.trim()) {
      throw new ValidationError('ask_id/answer 不能为空');
    }
    const waiter = this.userAskWaiters.get(input.ask_id);
    if (!waiter) {
      output.answered = false;
      return true;
    }
    this.userAskWaiters.delete(input.ask_id);
    await this.persistUserAnswer(waiter.session_key, waiter.run_id, input.answer.trim(), metrics);
    waiter.resolve({ answer: input.answer.trim(), answered: true });
    output.answered = true;
    return true;
  }

  private async persistUserAnswer(sessionKey: string, runId: string, answer: string, metrics?: Metrics): Promise<void> {
    const row = await this.soRunRow(runId);
    const lane = String(row?.lane ?? LaneKind.Session);
    const targetKey = lane === LaneKind.Subagent ? this.soSubSessionKey(sessionKey, runId) : sessionKey;
    const sessionId = await this.soRuntimeSessionId(targetKey, metrics);
    const add = new AddMessageInput();
    add.session_id = sessionId;
    add.role = MessageRole.User;
    add.content = answer;
    add.run_id = runId;
    await this.session.addMessage(add, new AddMessageOutput(), new SessionContext(), metrics);
  }

  private readonly backgroundLane = new LaneSemaphore(LANE_CONCURRENCY[LaneKind.Background]);

  private scheduleCurator(
    runId: string,
    input: SubmitRunInput,
    matchOut: MatchAgentDefOutput,
    loopOutput: ExecAgentLoopOutput,
    evalWorkId: string,
    parent?: { metrics?: Metrics; report?: Report },
  ): void {
    void this.backgroundLane.acquire().then(async () => {
      try {
        await this.runWorkEvaluation(runId, input, matchOut, loopOutput, evalWorkId, parent);
      } finally {
        this.backgroundLane.release();
      }
    });
  }

  async configRuns(input: ConfigRunsInput, output: ConfigRunsOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.enabled !== undefined) {
      this.enabled = input.enabled;
      await this.config.set('enabled', input.enabled ? 'true' : 'false', 'BOOLEAN');
    }

    if (input.permission_wait_timeout_ms !== undefined) {
      if (input.permission_wait_timeout_ms < 0) {
        throw new ValidationError('permission_wait_timeout_ms 不能为负');
      }
      await this.config.set('permission_wait_timeout_ms', String(input.permission_wait_timeout_ms), 'NUMBER');
    }

    if (input.trusted_tools !== undefined) {
      const next = new Set(input.trusted_tools.filter((t): t is string => typeof t === 'string' && t.length > 0));
      this.trustedTools = next;
      await this.persistTrustedTools();
    }

    if (input.eval_async !== undefined) {
      await this.config.set('eval_async', input.eval_async ? 'true' : 'false', 'BOOLEAN');
    }
    if (input.eval_skip_low_risk !== undefined) {
      await this.config.set('eval_skip_low_risk', input.eval_skip_low_risk ? 'true' : 'false', 'BOOLEAN');
    }
    output.permission_wait_timeout_ms = await this.soPermissionWaitTimeout();
    output.trusted_tools = [...(await this.soTrustedTools())];
    output.eval_async = await this.soEvalAsync();
    output.eval_skip_low_risk = await this.soEvalSkipLowRisk();
    return true;
  }

  private async soPermissionWaitTimeout(): Promise<number> {
    const value = await this.config.getInt('permission_wait_timeout_ms', RunGatewayService.PERMISSION_WAIT_DEFAULT_MS);
    return value > 0 ? value : RunGatewayService.PERMISSION_WAIT_DEFAULT_MS;
  }

  private soComponentName(id: string, table: string, nameCol: string): string {
    if (!id) return '';
    try {
      const rows = this.relationDb.queryRaw<Record<string, unknown>>(
        `SELECT "${nameCol}" AS "n" FROM "${table}" WHERE "id" = ? LIMIT 1`,
        [id],
      );
      const raw = rows?.[0]?.n;
      return raw != null ? String(raw).trim() : '';
    } catch {
      return '';
    }
  }

  private soSkillName(id: string): string {
    return this.soComponentName(id, 'skill', 'name') || this.soComponentName(id, 'skill', 'skill_brief');
  }

  drainSteeringFor(sessionKey: string): string[] {
    const lane = this.lanes.get(`${LaneKind.Session}:${sessionKey}`);
    return lane ? lane.steering.splice(0, lane.steering.length) : [];
  }

  takeFollowupFor(sessionKey: string): string[] {
    const lane = this.lanes.get(`${LaneKind.Session}:${sessionKey}`);
    if (!lane || lane.activeRunId) {
      return [];
    }
    return lane.pending.splice(0, lane.pending.length).map((p) => p.input.user_message);
  }
}
