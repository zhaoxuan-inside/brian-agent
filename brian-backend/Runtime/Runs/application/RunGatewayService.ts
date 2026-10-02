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
  analyzeTaskComplexity,
  isContinuationRequest,
  matchLayerLabel,
  soAgentDisplayName,
  createComponentTitleLookup,
  type TaskComplexityResult,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  ContextInfoInput,
  ContextInfoOutput,
  ContextInfoItem,
  InfoCoreContext,
  SaveDialogEmbeddingInput,
  SaveDialogEmbeddingOutput,
  MatchDialogTopicInput,
  MatchDialogTopicOutput,
  DIALOG_TOPIC_MATCH_SIMILARITY,
} from '@brian-agent/core';
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
  RUNTIME_SESSION_TABLE,
  RUNTIME_MESSAGE_TABLE,
  RUNTIME_MESSAGE_PART_TABLE,
} from '../../Session';
import { EXECUTE_TABLE } from '@brian-agent/base';
import {
  MatchAgentDefInput,
  MatchAgentDefOutput,
  SoAgentSnapshotInput,
  SoAgentSnapshotOutput,
  AgentDefContext,
  KillErroredAgentInput,
  KillErroredAgentOutput,
  AgentMatchLayer,
  RUNTIME_AGENT_DEF_TABLE,
  type AgentDefRecord,
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

/** 记忆来源 → 展示名（context.built.sources 用，ADR-013） */
const CONTEXT_SOURCE_LABELS: Record<string, string> = {
  TIMELINE: '时间线消息',
  SIMILARITY: '相似记忆',
  TAG_RELATIVE: '标签关联',
  KEYWORD: '关键词记忆',
  PINNED: '置顶消息',
  CITING: '引用消息',
  SELECTED: '勾选消息',
  CURRENT: '当前上下文',
  RANDOM: '随机召回',
  CUSTOM: '自定义来源',
};

/** 记忆维度条目透出限额（时间线第 0 轮 tab 展示用） */
const MEMORY_ITEMS_PER_CATEGORY = 10;
const MEMORY_ITEM_MAX_CHARS = 500;

/** 显式要求切换 Agent 的语式（命中即跳过会话亲和，重新选举） */
const EXPLICIT_SWITCH_AGENT_PATTERN = /^(切换|换一个|重置|转交|改为|使用).*(角色|专家|代理|助手|agent)/i;

/**
 * 会话亲和裁决结论（chg-059）判别联合：沿用路径 mechanism 必为非空事实源（可透传选举明细），
 * 切换/漂移路径不透传（空串或 dialog_topic_drift 仅用于观测）。
 */
type SessionAffinityDecision =
  | { reuse: true; mechanism: 'session_affinity' | 'dialog_topic_match'; label: string; reason: string }
  | { reuse: false; mechanism: '' | 'dialog_topic_drift'; label: string; reason: string };

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
      report?.emit(BusinessEvent.ContextBuilt, {
        round: 0,
        base: true,
        message_count: 0,
        memory_categories: categories,
        sources: this.soContextSources(ctxOut),
        items: this.soContextItems(ctxOut),
      });
      return { memory: staticMemory, categories };
    } catch (err) {
      this.logger?.warn?.('主 Loop 静态记忆召回失败（回退空记忆，不阻塞执行）', { run_id: runId, error: err instanceof Error ? err.message : String(err) });
      return { memory: '', categories: [] };
    }
  }


  /** ADR-013：把 InfoCore 装配结果的记忆来源分布透传进 context.built（可信度链路直读，不再离线拼装） */
  private soContextSources(ctxOut: ContextInfoOutput): Array<{ source: string; label: string; count: number; message_ids: string[] }> {
    const idMap = ctxOut.source_ids_map ?? {};
    const summary = ctxOut.sources_summary ?? {};
    return Object.entries(idMap)
      .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
      .map(([source, ids]) => ({
        source: String(source),
        label: CONTEXT_SOURCE_LABELS[String(source)] ?? String(source),
        count: Number(summary[String(source)] ?? (ids as string[]).length) || (ids as string[]).length,
        message_ids: (ids as string[]).slice(0, 50),
      }));
  }

  /** 记忆召回条目（按维度分组，供时间线第 0 轮 tab 展示；每维度限量截断） */
  private soContextItems(ctxOut: ContextInfoOutput): Array<{ source: string; label: string; entries: Array<{ id?: string; text: string }> }> {
    const cat = (ctxOut.categories ?? {}) as Record<string, ContextInfoItem[]>;
    return Object.entries(cat)
      .map(([source, items]) => ({
        source: String(source),
        label: CONTEXT_SOURCE_LABELS[String(source)] ?? String(source),
        entries: (Array.isArray(items) ? items : []).slice(0, MEMORY_ITEMS_PER_CATEGORY)
          .map((i) => ({
            id: i?.info_id ? String(i.info_id) : undefined,
            text: String(i?.info || i?.content || i?.summary || '').slice(0, MEMORY_ITEM_MAX_CHARS),
          }))
          .filter((e) => e.text),
      }))
      .filter((c) => c.entries.length > 0);
  }

  /** ADR-013：子任务汇聚结果发 run.merge（委派收口可观测化） */
  private publishRunMerge(
    runId: string,
    collected: Map<string, { agent_id: string; task_content: string; result: string }>,
    report?: Report,
  ): void {
    if (!report || collected.size === 0) return;
    report.emit(BusinessEvent.RunMerge, {
      run_id: runId,
      children: [...collected.entries()].map(([subRunId, c]) => ({
        sub_run_id: subRunId,
        agent_name: c.agent_id,
        task: c.task_content,
        output: c.result,
        status: 'ok',
      })),
    });
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
    if (report) {
      if (!report.run_id) report.run_id = runId;
      if (!report.work_id) report.work_id = runId;
    }
    report?.emit(BusinessEvent.RunAccepted, { run_id: runId });
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
    if (parent?.report) {
      if (!parent.report.run_id) parent.report.run_id = runId;
      if (!parent.report.work_id) parent.report.work_id = runId;
    }
    let matchOut: MatchAgentDefOutput | undefined;
    const steerLane = this.soLane(`${input.lane_kind ?? LaneKind.Session}:${input.session_key}`);
    steerLane.acceptingSteer = true;
    try {
      const sessionId = await this.soRunSessionId(runId, input, runtimeSessionId);
      const baseCtx = await this.buildStaticMemory(runId, input, parent?.metrics, parent?.report);
      matchOut = await this.matchAgent(runId, input, runtimeSessionId, parent?.metrics, parent?.report);
      const snapshot = await this.soSnapshot(matchOut.def_id, runId, input, parent?.metrics, parent?.report);
      const { systemSkillCount, boundSkillCount, mcpCount } = this.publishAgentComponents(matchOut, snapshot, parent?.report);

      const loopInput = this.prepareLoopInput(runId, input, sessionId, snapshot);
      const complexity = analyzeTaskComplexity({
        text: input.user_message ?? '',
        skillCount: systemSkillCount + boundSkillCount,
        mcpCount,
      });
      const thoughtMode = this.decideThoughtMode(loopInput.skills ?? [], boundSkillCount, mcpCount, complexity);
      this.publishThoughtModeSelected(thoughtMode, systemSkillCount + boundSkillCount, mcpCount, parent?.report);
      this.prepareLoopContext(loopInput, snapshot, baseCtx.memory, thoughtMode.mode, complexity.enableThinking, complexity.isComplex, input.user_message);
      const loopOutput = new ExecAgentLoopOutput();
      try {
        await this.loop.execAgentLoop(loopInput, loopOutput, new RunGatewayContext(), parent?.metrics, parent?.report);
      } finally {
        steerLane.acceptingSteer = false;
      }
      await this.finishRunByLane(runId, input, runtimeSessionId, matchOut, loopInput, loopOutput, parent);
      this.persistDialogEmbedding(runId, input, runtimeSessionId, loopOutput.stop_reason, parent?.metrics, parent?.report);
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

  /**
   * 轮次话题向量固化（chg-059）：settle 前 fire-and-forget，不阻塞结算与 SSE。
   * 仅主 session lane 且正常结束（stop/budget）的轮次固化，失败轮不污染话题向量。
   */
  private persistDialogEmbedding(
    runId: string,
    input: SubmitRunInput,
    runtimeSessionId: string,
    stopReason: string,
    metrics?: Metrics,
    report?: Report,
  ): void {
    if (!this.infoCore) return;
    if ((input.lane_kind ?? LaneKind.Session) !== LaneKind.Session) return;
    if (stopReason !== LoopStopReason.Stop && stopReason !== LoopStopReason.Budget) return;
    void this.soSaveDialogEmbedding(runId, input, runtimeSessionId, metrics, report);
  }

  private async soSaveDialogEmbedding(
    runId: string,
    input: SubmitRunInput,
    runtimeSessionId: string,
    metrics?: Metrics,
    report?: Report,
  ): Promise<void> {
    try {
      const reply = this.soRunFinalReply(runId, runtimeSessionId);
      if (!reply) return;
      const embedIn = new SaveDialogEmbeddingInput();
      embedIn.session_id = input.session_key;
      embedIn.work_id = runId;
      embedIn.text = `${(input.user_message ?? '').trim()}\n${reply.trim()}`.trim();
      const embedOut = new SaveDialogEmbeddingOutput();
      await this.infoCore!.saveDialogEmbedding(embedIn, embedOut, new InfoCoreContext(), metrics, report);
      if (embedOut.saved) {
        this.logger?.debug?.('轮次话题向量已固化', { session_id: input.session_key, work_id: runId, dimension: embedOut.dimension });
      }
    } catch (err) {
      this.logger?.warn?.('轮次话题向量固化失败（不影响主链路）', {
        run_id: runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** 该 run 最后一条非空 assistant 消息（Writer 定稿后即为最终回复） */
  private soRunFinalReply(runId: string, runtimeSessionId: string): string {
    const rows = this.relationDb.queryRaw<{ role: string; content: string }>(
      `SELECT "role", "content" FROM "runtime_message_record" WHERE "session_id" = ? AND "run_id" = ? ORDER BY "seq" DESC LIMIT 50`,
      [runtimeSessionId, runId],
    ) ?? [];
    for (const row of rows) {
      if (row.role === 'assistant' && row.content && row.content.trim()) return row.content;
    }
    return '';
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
    this.publishRunMerge(runId, collected, parent?.report);
    await this.updateDelegatePartOutputs(runId, collected);
    await this.executeRunEvaluation(runId, input, matchOut, loopOutput, parent);
    const shouldWrite = this.shouldExecuteWriter(input, loopInput, loopOutput, collected.size);
    if (shouldWrite) {
      await this.executeRunWriting(runId, input, matchOut, loopOutput, parent, collected);
    } else {
      this.logger?.debug?.('Writer 润色跳过（单轮/简单任务直出，无需二次重写）', { run_id: runId, iterations: loopOutput.iterations });
    }
    if (loopInput.defer_final_reply) {
      parent?.report?.emit(BusinessEvent.RunFinished, { stop_reason: loopOutput.stop_reason });
    }
  }

  private shouldExecuteWriter(
    input: SubmitRunInput,
    loopInput: ExecAgentLoopInput,
    loopOutput: ExecAgentLoopOutput,
    childCount: number,
  ): boolean {
    if (!this.writer) return false;
    if (childCount > 0) return true;
    const explicitReq = /排版|润色|撰写|流程图|架构图|整理成表格|输出为JSON|输出为Markdown|生成报告/i.test(input.user_message || '');
    if (explicitReq) return true;
    if (loopInput.thought_mode === 'Direct') return false;
    if (loopOutput.iterations > 1 && (loopInput.skills?.length || 0) > 0) return true;
    return false;
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
      `SELECT "role", "content" FROM "runtime_message_record" WHERE "session_id" = ? ORDER BY "seq"`,
      [subSessionId],
    ) ?? [];
    const task = messages.find((m) => m.role === 'user')?.content ?? '';
    const result = [...messages].reverse().find((m) => m.role === 'assistant' && m.content && m.content.trim())?.content ?? '';
    const settled = this.isSettledStatus(String(row.status));
    const agentName = this.soComponentName(String(row.agent_def_id ?? ''), 'runtime_agent_def_record', 'title') || '子代理';
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
    // ADR-012:tool part 不再存 output_json,回执原文经 execute_id 从 execute_record 读取
    const parts = this.relationDb.queryRaw<{ id: string; execute_id: string }>(
      `SELECT "id", "execute_id" FROM "runtime_message_part_record" WHERE "run_id" = ? AND "part_type" = 'tool' AND "tool_id" = 'skill_builtin-delegate'`,
      [runId],
    ) ?? [];
    for (const part of parts) {
      const io = await this.fetchExecuteIOById(part.execute_id);
      const childId = this.parseRunIdFromReceipt(io?.output);
      const outcome = childId ? collected.get(childId) : undefined;
      if (!outcome) {
        continue;
      }
      await this.relationDb.update(RUNTIME_MESSAGE_PART_TABLE, newPatch({
        content: `子任务完成（run_id=${childId}，Agent=${outcome.agent_id}）：${outcome.result.slice(0, 500)}`,
      }), [{ field: 'id', operator: Operator.EQ, value: part.id }]);
    }
  }

  private async fetchExecuteIOById(executeId: string): Promise<{ input: string; output: string } | null> {
    if (!executeId) return null;
    try {
      const row = await this.relationDb.selectOne(EXECUTE_TABLE, [
        { field: 'id', operator: Operator.EQ, value: executeId },
      ]);
      if (!row) return null;
      return { input: String(row.input ?? ''), output: String(row.output ?? '') };
    } catch {
      return null;
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
    const skillEntries = (snapshot.tools ?? [])
      .filter((t) => t.kind === 'skill')
      .map((t) => ({ id: t.id, name: this.soSkillName(t.id) || t.brief, system: t.system === true }));
    const mcpEntries = (snapshot.tools ?? [])
      .filter((t) => t.kind === 'mcp')
      .map((t) => ({ id: t.id, name: this.soComponentName(t.id, 'mcp_install_record', 'mcp_title') }));

    // 发射顺序：先五类组件选举明细，后装配汇总 —— 保证时间线上"组件装配完成"收尾
    if (matchOut.matched_by !== AgentMatchLayer.Built) {
      this.emitSelectionEvents(matchOut, skillEntries, mcpEntries, report);
    }
    this.emitComponentsSnapshot(matchOut, snapshot, skillEntries, mcpEntries, report);
    return {
      systemSkillCount: skillEntries.filter((s) => s.system).length,
      boundSkillCount: skillEntries.filter((s) => !s.system).length,
      mcpCount: mcpEntries.length,
    };
  }

  /** 命中既有 Agent 路径：Skill/MCP/Soul 三类选举明细事件（reason 附命中方式中文标签） */
  private emitSelectionEvents(
    matchOut: MatchAgentDefOutput,
    skillEntries: Array<{ id: string; name: string; system: boolean }>,
    mcpEntries: Array<{ id: string; name: string }>,
    report?: Report,
  ): void {
    const layerLabel = matchLayerLabel(matchOut.matched_by);
    const soulId = matchOut.def.soul_id ?? '';
    const systemCount = skillEntries.filter((s) => s.system).length;
    report?.emit(BusinessEvent.SkillSelected, {
      source: 'match',
      skills: skillEntries,
      reason: `命中既有 Agent（${layerLabel}），Skill 选举结果=绑定事实源：系统级恒选中 ${systemCount} 项 + 沉淀绑定 ${skillEntries.length - systemCount} 项`,
      skills_count: skillEntries.length,
      system_skills_count: systemCount,
    });
    report?.emit(BusinessEvent.McpSelected, {
      source: 'match',
      mcps: mcpEntries,
      reason: mcpEntries.length > 0
        ? `命中既有 Agent（${layerLabel}），MCP 选举结果=绑定事实源：${mcpEntries.length} 个`
        : `命中既有 Agent（${layerLabel}），MCP 选举结果=无绑定`,
      mcps_count: mcpEntries.length,
    });
    if (soulId) {
      report?.emit(BusinessEvent.SoulSelected, {
        soul_id: soulId,
        soul_name: this.soComponentName(soulId, 'soul_record', 'soul_title'),
        stage: 'match',
        reason: `命中既有 Agent（${layerLabel}），人格选举结果=绑定事实源（命中复用）`,
      });
    }
  }

  /** 装配汇总事件（agent.components，五类组件全量，ID 为锚 + 展示名） */
  private emitComponentsSnapshot(
    matchOut: MatchAgentDefOutput,
    snapshot: SoAgentSnapshotOutput['snapshot'],
    skillEntries: Array<{ id: string; name: string; system: boolean }>,
    mcpEntries: Array<{ id: string; name: string }>,
    report?: Report,
  ): void {
    const soulId = matchOut.def.soul_id ?? '';
    report?.emit(BusinessEvent.AgentComponents, {
      agent_id: matchOut.def_id,
      agent_name: soAgentDisplayName(snapshot.name),
      soul_id: soulId,
      soul_name: this.soComponentName(soulId, 'soul_record', 'soul_title'),
      prompt_template_id: matchOut.def.prompt_template_id ?? '',
      prompt_name: this.soComponentName(matchOut.def.prompt_template_id ?? '', 'prompt_template_record', 'title'),
      llm_id: snapshot.llm_id ?? '',
      llm_name: this.soComponentName(snapshot.llm_id ?? '', 'llm_available_record', 'llm_title'),
      skills: skillEntries,
      mcps: mcpEntries,
    });
  }

  private publishThoughtModeSelected(
    thoughtMode: { mode: 'Direct' | 'CoT' | 'ReAct'; reason: string },
    skillCount: number,
    mcpCount: number,
    report?: Report,
  ): void {
    report?.emit(BusinessEvent.ThoughtSelected, {
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
    thoughtMode: string,
    enableThinking?: boolean,
    isComplex?: boolean,
    userMessage?: string,
  ): void {
    loopInput.system = this.composeSystemWithMemory(snapshot.system ?? '', memory);
    loopInput.thought_mode = thoughtMode;
    loopInput.enable_thinking = enableThinking ?? (thoughtMode !== 'Direct');
    const explicitReq = /排版|润色|撰写|流程图|架构图|整理成表格|输出为JSON|输出为Markdown|生成报告/i.test(userMessage || '');
    if (this.shouldDeferFinalReply(thoughtMode, isComplex, explicitReq)) {
      loopInput.defer_final_reply = true;
    }
  }

  private shouldDeferFinalReply(thoughtMode: string, isComplex?: boolean, explicitFormatReq?: boolean): boolean {
    if (!this.writer) return false;
    if (explicitFormatReq) return true;
    if (thoughtMode === 'Direct' || isComplex === false) return false;
    return Boolean(isComplex);
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
    parent?.report?.emit(BusinessEvent.EvaluationStarted, { work_id: evalWorkId, mode: evalAsync ? 'async' : 'sync' });

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
      parent?.report?.emit(BusinessEvent.WriterStarted, { work_id: writeWorkId });
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
        parent?.report?.emit(BusinessEvent.ReplyDelta, { delta: loopOutput.result, replace: true });
      }
    } catch (err) {
      this.logger?.warn?.('写作 Agent 执行失败（降级为原始输出）', { error: err instanceof Error ? err.message : String(err) });
      parent?.report?.emit(BusinessEvent.ReplyDelta, { delta: loopOutput.result, replace: true });
    }
  }

  private async applyWriterResult(
    finalResult: string,
    writeOut: { response?: string; response_format?: string; blocks?: unknown[] },
    loopOutput: ExecAgentLoopOutput,
    parent?: { metrics?: Metrics; report?: Report },
  ): Promise<void> {
    parent?.report?.emit(BusinessEvent.WriterCompleted, {
      format: writeOut.response_format || 'MARKDOWN',
      length: finalResult.length,
      has_mermaid: finalResult.includes('```mermaid'),
    });
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
      report?.emit(BusinessEvent.ErrorOccurred, { run_id: runId, error: err instanceof Error ? err.message : String(err) });
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

  private async matchAgent(
    runId: string,
    input: SubmitRunInput,
    runtimeSessionId: string,
    metrics?: Metrics,
    report?: Report,
  ): Promise<MatchAgentDefOutput> {
    // 1. 若请求显式指定了 agent_ref，直接走精准匹配
    if (input.agent_ref) {
      const matchInput = new MatchAgentDefInput();
      matchInput.task_content = input.user_message;
      matchInput.session_id = input.session_key;
      matchInput.run_id = runId;
      matchInput.work_id = IdGenerator.generate();
      matchInput.context_id = input.context_id ?? '';
      matchInput.agent_ref = input.agent_ref;
      const matchOutput = new MatchAgentDefOutput();
      await this.agents.matchAgentDef(matchInput, matchOutput, new AgentDefContext(), metrics, report);
      if (matchOutput.def_id) {
        await this.persistSessionActiveAgent(runtimeSessionId, matchOutput.def_id);
      }
      return matchOutput;
    }

    // 2. 会话亲和裁决（chg-059）：显式切换 → 落全量选举；强信号续写 → 直接沿用；
    //    话题连续性匹配（dialog_embedding_record）在强信号之后、BM25/Embedding 相似度信号提取之前裁决。
    //    复用前先做组件健康校验：失效（源 Agent 孤儿/绑定悬挂）→ 停用 def，落全量选举重建并更新会话关联
    if (!input.force_new) {
      const sessionActiveDef = await this.soSessionActiveAgentDef(runtimeSessionId);
      if (sessionActiveDef && sessionActiveDef.status === 'active') {
        const health = await this.agents.validateDefHealth(sessionActiveDef, metrics);
        if (!health.healthy) {
          await this.agents.invalidateDefById(
            sessionActiveDef.id, health.issues.join('；'), new AgentDefContext(), metrics, report,
          );
        } else {
          const affinity = await this.decideSessionAffinity(input.user_message, input.session_key, metrics, report);
          if (affinity.reuse) {
            const matchOutput = new MatchAgentDefOutput();
            matchOutput.def_id = sessionActiveDef.id;
            matchOutput.matched_by = AgentMatchLayer.Exact;
            matchOutput.def = sessionActiveDef;
            matchOutput.mechanisms = [{
              mechanism: affinity.mechanism,
              adopted: true,
              label: affinity.label,
              candidates: [{ id: sessionActiveDef.id, name: sessionActiveDef.name }],
            }];
            report?.emit(BusinessEvent.AgentSelected, {
              agent_id: sessionActiveDef.id,
              agent_name: soAgentDisplayName(sessionActiveDef.name),
              matched_by: 'session_affinity',
              reason: affinity.reason,
              mechanisms: matchOutput.mechanisms,
            });
            return matchOutput;
          }
        }
      }
    }

    // 3. 全局路由与动态构建
    const matchInput = new MatchAgentDefInput();
    matchInput.task_content = input.user_message;
    matchInput.session_id = input.session_key;
    matchInput.run_id = runId;
    matchInput.work_id = IdGenerator.generate();
    matchInput.context_id = input.context_id ?? '';
    matchInput.agent_ref = '';
    const matchOutput = new MatchAgentDefOutput();
    await this.agents.matchAgentDef(matchInput, matchOutput, new AgentDefContext(), metrics, report);
    if (matchOutput.def_id) {
      await this.persistSessionActiveAgent(runtimeSessionId, matchOutput.def_id);
    }
    return matchOutput;
  }

  /**
   * 会话亲和三段裁决（chg-059）：显式切换 → 不沿用；强信号续写 → 直接沿用（0 向量开销）；
   * 其余 → 话题连续性匹配（向量模型不可用/未评估时回退沿用，保持既有会话亲和行为）。
   */
  private async decideSessionAffinity(
    userMessage: string,
    sessionKey: string,
    metrics?: Metrics,
    report?: Report,
  ): Promise<SessionAffinityDecision> {
    const text = (userMessage || '').trim();
    if (text && EXPLICIT_SWITCH_AGENT_PATTERN.test(text)) {
      return { reuse: false, mechanism: '', label: '', reason: '显式要求切换 Agent，跳过会话亲和，重新选举' };
    }
    if (isContinuationRequest(text)) {
      return {
        reuse: true,
        mechanism: 'session_affinity',
        label: '强信号续写（Continuation）',
        reason: '命中「继续」等强信号续写语式，直接沿用会话专职专家（0 向量开销）',
      };
    }
    return this.soTopicAffinity(text, sessionKey, metrics, report);
  }

  /** 话题连续性裁决：best_similarity ≥ 阈值沿用；低于阈值判话题漂移，落全量选举 */
  private async soTopicAffinity(
    text: string,
    sessionKey: string,
    metrics?: Metrics,
    report?: Report,
  ): Promise<SessionAffinityDecision> {
    const fallback: SessionAffinityDecision = {
      reuse: true,
      mechanism: 'session_affinity',
      label: '会话继承（Session Affinity）',
      reason: '会话任务延续会话专职专家职责范畴，直接沿用（0ms 开销）',
    };
    if (!this.infoCore || !text) return fallback;
    const topicIn = new MatchDialogTopicInput();
    topicIn.session_id = sessionKey;
    topicIn.query_text = text;
    const topicOut = new MatchDialogTopicOutput();
    try {
      await this.infoCore.matchDialogTopic(topicIn, topicOut, new InfoCoreContext(), metrics, report);
    } catch {
      return { ...fallback, reason: '话题匹配异常，回退沿用会话专职专家' };
    }
    if (!topicOut.evaluated) {
      return { ...fallback, reason: '向量模型不可用或无轮次向量，回退沿用会话专职专家' };
    }
    if (topicOut.best_similarity >= DIALOG_TOPIC_MATCH_SIMILARITY) {
      return {
        reuse: true,
        mechanism: 'dialog_topic_match',
        label: '话题连续（Topic Match）',
        reason: `本轮请求与会话轮次话题相似度 ${topicOut.best_similarity}≥${DIALOG_TOPIC_MATCH_SIMILARITY}，沿用会话专职专家`,
      };
    }
    return {
      reuse: false,
      mechanism: 'dialog_topic_drift',
      label: '话题漂移（Topic Drift）',
      reason: `本轮请求与会话轮次话题相似度 ${topicOut.best_similarity}<${DIALOG_TOPIC_MATCH_SIMILARITY}，判定话题漂移，重新选举 Agent`,
    };
  }

  private async soSessionActiveAgentDef(runtimeSessionId: string): Promise<AgentDefRecord | null> {
    if (!runtimeSessionId) return null;
    try {
      const sessionRow = await this.relationDb.selectOne(RUNTIME_SESSION_TABLE, [
        { field: 'id', operator: Operator.EQ, value: runtimeSessionId },
      ]);
      const activeDefId = String(sessionRow?.agent_def_id ?? '').trim();
      if (!activeDefId) return null;
      const defRows = await this.relationDb.select(RUNTIME_AGENT_DEF_TABLE, {
        conditions: [{ field: 'id', operator: Operator.EQ, value: activeDefId }],
      });
      if (defRows?.length) {
        const row = defRows[0];
        return {
          id: String(row.id),
          name: String(row.title ?? row.name ?? ''),
          mode: String(row.mode ?? 'primary') as AgentDefRecord['mode'],
          agent_ref: String(row.agent_ref ?? ''),
          task_signature: String(row.task_signature ?? ''),
          agent_purpose: String(row.agent_purpose ?? ''),
          prompt_template_id: String(row.prompt_template_id ?? ''),
          model_id: String(row.model_id ?? ''),
          soul_id: String(row.soul_id ?? ''),
          tools_json: String(row.tools_json ?? ''),
          temperature: row.temperature === null || row.temperature === undefined ? undefined : Number(row.temperature),
          budget_total: Number(row.budget_total ?? DEFAULT_BUDGET_TOTAL),
          status: String(row.status ?? 'active') as AgentDefRecord['status'],
          created: Number(row.created),
          updated: Number(row.updated),
        };
      }
    } catch {  }
    return null;
  }

  private async persistSessionActiveAgent(runtimeSessionId: string, agentDefId: string): Promise<void> {
    if (!runtimeSessionId || !agentDefId) return;
    try {
      await this.relationDb.update(RUNTIME_SESSION_TABLE, newPatch({
        agent_def_id: agentDefId,
      }), [{ field: 'id', operator: Operator.EQ, value: runtimeSessionId }]);
    } catch (err) {
      this.logger?.warn?.('更新 Session active_agent_def_id 失败', {
        session_id: runtimeSessionId,
        agent_def_id: agentDefId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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

  private decideThoughtMode(
    skillIds: string[],
    _skillCount: number,
    mcpCount: number,
    complexity?: TaskComplexityResult,
  ): { mode: 'Direct' | 'CoT' | 'ReAct'; reason: string } {
    if (complexity && !complexity.enableThinking) {
      return {
        mode: 'Direct',
        reason: `${complexity.reason}，禁用 Thinking 直出正文`,
      };
    }
    const observableCount = skillIds.filter((id) => RunGatewayService.isObservableSkill(id)).length;
    if (observableCount > 0 || mcpCount > 0) {
      return {
        mode: 'ReAct',
        reason: `执行需「行动→观察→再决策」闭环（复杂度=${complexity?.complexity ?? 50}）：含 ${observableCount} 个可执行/可观察技能${mcpCount > 0 ? ` 与 MCP 通道 ${mcpCount} 个` : ''}，选用 ReAct`,
      };
    }
    return {
      mode: 'CoT',
      reason: `复杂链式推理任务（复杂度=${complexity?.complexity ?? 50}）：${complexity?.reason ?? '无外部观察技能'}，选用 CoT 深度思考推导`,
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
      report?.emit(BusinessEvent.ErrorOccurred, { run_id: runId, agent_id: agentRef, error: errorMessage.slice(0, 300) });
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
    return createComponentTitleLookup(this.relationDb)(id, table, nameCol);
  }

  private soSkillName(id: string): string {
    return this.soComponentName(id, 'skill_record', 'title') || this.soComponentName(id, 'skill_record', 'brief');
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
