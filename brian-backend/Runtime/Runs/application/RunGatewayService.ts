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
  // ===== 新增（2026-09-15）：静态记忆格式化（<static-memory-context> 功能化注入） =====
  formatContextCategories,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import { ContextInfoInput, ContextInfoOutput, InfoCoreContext } from '@brian-agent/core';
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

/** 输出评估接口（鸭子类型，由组合根注入 Evolutor 适配器） */
export interface OutputEvaluator {
  evalWorkAgent(input: {
    work_id: string;
    run_id: string;
    agent_id: string;
    task_content: string;
    agent_output: string;
  }, output: unknown, ctx: unknown, metrics?: Metrics, report?: Report): Promise<boolean>;
}

/** 输出写作排版接口（鸭子类型，由组合根注入 Writer 适配器） */
export interface OutputWriter {
  execWrite(input: {
    work_id: string;
    run_id: string;
    user_query: string;
    agent_results: Array<{ agent_id: string; task_content?: string; result?: string; answer?: string }>;
  }, output: { response?: string; response_format?: string; blocks?: unknown[] }, ctx: unknown, metrics?: Metrics, report?: Report): Promise<boolean>;
}

/**
 * RunGatewayService。
 */
export class RunGatewayService {
  private enabled = true;
  private readonly config: ConfigService;

  // ===== 修改后（2026-09-11）：权限等待超时改读 runtime_runs_config（permission_wait_timeout_ms，默认 120000） =====
  private static readonly PERMISSION_WAIT_DEFAULT_MS = 120_000;

  /** 会话 lane 注册表：`${laneKind}:${session_key}` → lane（活动 run / 排队 / steering 队列） */
  private readonly lanes = new Map<string, SessionLane>();
  /** 每 lane 并发计数（main/subagent/background 并发上限控制；session 由 activeRunId 承担） */
  private readonly laneRunning = new Map<string, number>();

  /** 结算 waiter 注册表：run_id → waiter（HTTP 流式端点 await 结算） */
  private readonly waiters = new Map<string, Waiter>();

  // ===== 2026-09-14 新增：评估 Agent 执行策略默认值（runtime_runs_config 可调） =====
  /** 评估异步后台执行默认值（评估 LLM 实测 18-20s，不阻塞写作与结算） */
  private static readonly EVAL_ASYNC_DEFAULT = true;
  /** 低风险场景跳过评估默认值（单轮直答 stop 且仅 1 轮） */
  private static readonly EVAL_SKIP_LOW_RISK_DEFAULT = true;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly session: SessionAccess,
    private readonly agents: AgentDefAccess,
    private readonly loop: LoopAccess,
    private readonly logger?: Logger,
    private readonly evaluator?: OutputEvaluator,
    private readonly writer?: OutputWriter,
    // ===== 新增（2026-09-15）：InfoCore 访问（可选），供主 Loop 每次问答构建多层静态记忆
    //（不注入时主 Loop 保持旧行为：仅会话时间线），保证向后兼容与测试用例构造不变 =====
    private readonly infoCore?: InfoCoreAccess,
  ) {
    this.config = new ConfigService(relationDb, RUNTIME_RUNS_CONFIG_TABLE);
  }

  // ===== 原始方法（保留作为参考）=====
  // private async buildStaticMemorySystem(
  //   runId: string,
  //   input: SubmitRunInput,
  //   snapshot: SoAgentSnapshotOutput['snapshot'],
  //   metrics?: Metrics,
  //   report?: Report,
  // ): Promise<string> {
  //   const baseSystem = snapshot.system ?? '';
  //   if (!this.infoCore) return baseSystem;
  //   try {
  //     const ctxIn = new ContextInfoInput();
  //     ctxIn.session_id = input.session_key;
  //     ctxIn.work_id = runId;
  //     ctxIn.info = input.user_message;
  //     ctxIn.enable_cross_session = true;
  //     const ctxOut = new ContextInfoOutput();
  //     await this.infoCore.context(ctxIn, ctxOut, new InfoCoreContext(), metrics, report);
  //     const staticMemory = formatContextCategories(ctxOut);
  //     if (!staticMemory) return baseSystem;
  //     this.logger?.debug?.('主 Loop 静态记忆注入完成', {
  //       run_id: runId,
  //       categories: Object.entries(ctxOut.categories ?? {})
  //         .filter(([, v]) => Array.isArray(v) && v.length > 0)
  //         .map(([k]) => k),
  //     });
  //     return baseSystem ? `${baseSystem}\n\n${staticMemory}` : staticMemory;
  //   } catch (err) {
  //     this.logger?.warn?.('主 Loop 静态记忆构建失败（回退纯 soul system）', { run_id: runId, error: err instanceof Error ? err.message : String(err) });
  //     return baseSystem;
  //   }
  // }

  /**
   * ===== 修改后（2026-09-19 上下文前置）：记忆召回与 system 合成两段拆分 =====
   * 原实现把「多层静态记忆召回」与「和 soul system 拼接」耦合，只能在 Agent 选择/构建之后调用，
   * 导致意图分析与 Agent 构建阶段拿不到基本上下文。
   * 现拆为两个方法：
   * - buildStaticMemory：run 第一步先完成跨会话多层记忆召回（TAG_RELATIVE/SIMILARITY/KEYWORD/
   *   RANDOM 全局维度），产出静态记忆文本与召回类别清单，并上报 round=0 的 context.built
   *   （基础上下文 = 会话时间线 + 静态记忆多层召回）；后续意图分析/Agent 构建/Loop 皆以此为基底；
   * - composeSystemWithMemory：soul system 就绪后与静态记忆一次性拼接（不可变块，语义不变）。
   */
  /** 多层静态记忆召回（逻辑控制；失败 best-effort 返回空串；manifest 至少含召回类别） */
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
      // 多层记忆核心：跨会话召回（TAG_RELATIVE / SIMILARITY / KEYWORD / RANDOM 全局维度）
      ctxIn.enable_cross_session = true;
      // 权威快照：主 Loop 是本次问答的主上下文构建点，快照冻结在 run 开始（persist 默认 true）
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

  /** system 合成（数据处理）：soul identity system + 静态记忆不可变块 */
  private composeSystemWithMemory(baseSystem: string, memory: string): string {
    if (!memory) return baseSystem;
    return baseSystem ? `${baseSystem}\n\n${memory}` : memory;
  }

  /** 初始化组件 */
  // ===== 修改后（2026-09-11）：启动时收敛遗留 run —— restartMap 存活期外的 running/queued 行
  // 内存态已随旧进程丢失（lane 队列/waiters 均不可恢复），统一结算为 aborted，不再永久 running。
  async initialize(): Promise<void> {
    const enabledRow = await this.config.getString('enabled', 'true');
    this.enabled = enabledRow !== 'false';
    await this.convergeOrphanRuns();
    this.logger?.debug?.('RunGatewayService 初始化完成');
  }

  /** 启动时收敛遗留 run（逻辑控制）：running/queued → aborted（stop_reason=service_restart） */
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
    await this.publishRunAccepted(input.session_key, runId, report, metrics);
    return true;
  }

  /** 发布 run.accepted（逻辑控制；两段式受理回执，经 Report→StreamProvider 保存/投递；
   *  2026-09-14 Span 框架）：受理为瞬时回执，不展示子环节耗时 */
  private async publishRunAccepted(sessionKey: string, runId: string, report?: Report, _metrics?: Metrics): Promise<void> {
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
    const runId = await this.insertQueuedRun(input, mode, runtimeSessionId, parent);
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

  // ===== 原始方法（保留作为参考）=====
  // private async insertQueuedRun(input: SubmitRunInput, mode: QueueMode, runtimeSessionId: string): Promise<string> {
  //   const record = newRecord({
  //     session_key: input.session_key,
  //     session_id: runtimeSessionId,
  //     lane: 'session',
  //     status: RunStatus.Queued,
  //     queue_mode: mode,
  //     budget_total: input.budget_total ?? DEFAULT_BUDGET_TOTAL,
  //     accepted_at: IdGenerator.now(),
  //   });
  //   await this.relationDb.insert(RUNTIME_RUN_TABLE, record);
  //   return String(record[0].value);
  // }
  // private async startRun(input: SubmitRunInput, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }, runId?: string): Promise<string> {
  //   const activeRunId = runId ?? IdGenerator.generate();
  //   const laneKey = `${input.lane_kind ?? LaneKind.Session}:${input.session_key}`;
  //   const lane = this.soLane(laneKey);
  //   lane.activeRunId = activeRunId;
  //   this.laneRunning.set(laneKey, (this.laneRunning.get(laneKey) ?? 0) + 1);
  //   if (runId) {
  //     await this.relationDb.update(RUNTIME_RUN_TABLE, newPatch({
  //       status: RunStatus.Running,
  //       started_at: IdGenerator.now(),
  //     }), [{ field: 'id', operator: Operator.EQ, value: runId }]);
  //   } else {
  //     const record = newRecord({
  //       id: activeRunId,
  //       session_key: input.session_key,
  //       session_id: runtimeSessionId,
  //       lane: 'session',
  //       status: RunStatus.Running,
  //       budget_total: input.budget_total ?? DEFAULT_BUDGET_TOTAL,
  //       accepted_at: IdGenerator.now(),
  //       started_at: IdGenerator.now(),
  //     });
  //     await this.relationDb.insert(RUNTIME_RUN_TABLE, record);
  //   }
  //   void this.executeRun(activeRunId, input, runtimeSessionId, parent);
  //   return activeRunId;
  // }

  // ===== 修改后的方法（2026-09-13）：lane 字段真实反映 input.lane_kind（支持 subagent/main/background）=====
  // ===== 修改后（2026-09-14 trace 源头治理）：run 受理即持久化源头 traceId（runtime_run.trace_id），
  // 供迟到补齐/断线恢复等延后路径按 run 反查原始 trace；
  // ===== 修改后（2026-09-14 业务/可观测 ID 分离）：trace_id 属可观测体系，唯一来源 metrics.trace_id，
  // run_id 属问答业务维度（一次问答），trace_id 属可观测体系，二者独立 =====
  /** run 级源头 traceId 解析（数据处理） */
  private soRunTraceId(_input: SubmitRunInput, parent?: { metrics?: Metrics; report?: Report }): string {
    return parent?.metrics?.trace_id || '';
  }

  /** 插入排队 run 记录（逻辑控制；结算后复用同一 run_id 转 running，见 §4.1） */
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

  /** 启动运行（逻辑控制；fire-and-forget，结算内部保证；runId 复用排队记录时走 patch） */
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
    // 注：排队转 running 复用原记录时（runId 传入分支），trace 已在 insertQueuedRun 落库，此处不重复覆盖
    void this.executeRun(activeRunId, input, runtimeSessionId, parent);
    return activeRunId;
  }

  // ===== 原始方法（保留作为参考）=====
  // private async executeRun(runId: string, input: SubmitRunInput, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }): Promise<void> {
  //   let matchOut: MatchAgentDefOutput | undefined;
  //   try {
  //     matchOut = await this.matchAgent(input, parent?.report);
  //     parent?.report?.pushBusinessEvent(BusinessEvent.AgentSelected, {
  //       def_id: matchOut.def_id,
  //       agent_name: matchOut.def.name,
  //       matched_by: matchOut.matched_by,
  //     });
  //     const snapshot = await this.soSnapshot(matchOut.def_id, input, parent?.report);
  //     const soulId = matchOut.def.soul_id ?? '';
  //     const promptId = matchOut.def.prompt_template_id ?? '';
  //     const llmId = snapshot.llm_id ?? '';
  //     const skillEntries = (snapshot.tools ?? [])
  //       .filter((t) => t.kind === 'skill')
  //       .map((t) => ({ id: t.id, brief: t.brief || this.soSkillName(t.id) }));
  //     const mcpEntries = (snapshot.tools ?? [])
  //       .filter((t) => t.kind === 'mcp')
  //       .map((t) => ({ id: t.id, brief: t.brief || this.soComponentName(t.id, 'mcp_install', 'mcp_title') }));
  //     parent?.report?.pushBusinessEvent(BusinessEvent.AgentComponents, {
  //       agent_name: snapshot.name,
  //       soul_id: soulId,
  //       soul_name: this.soComponentName(soulId, 'soul', 'soul_brief'),
  //       prompt_template_id: promptId,
  //       prompt_name: this.soComponentName(promptId, 'prompt_template', 'prompt_template_title'),
  //       llm_id: llmId,
  //       llm_name: this.soComponentName(llmId, 'llm_available', 'llm_title'),
  //       skills: skillEntries,
  //       mcps: mcpEntries,
  //     });
  //     const loopInput = this.prepareLoopInput(runId, input, runtimeSessionId, snapshot);
  //     if (this.writer) {
  //       loopInput.defer_final_reply = true;
  //     }
  //     const loopOutput = new ExecAgentLoopOutput();
  //     await this.loop.execAgentLoop(loopInput, loopOutput, new RunGatewayContext(), parent?.metrics, parent?.report);
  //     let finalResult = loopOutput.result;
  //     if (loopOutput.stop_reason === LoopStopReason.Stop && loopOutput.result) {
  //       if (this.evaluator) {
  //         try {
  //           const evalOut: Record<string, unknown> = {};
  //           const evalCtx: Record<string, unknown> = { session_id: input.session_key, work_id: runId, run_id: input.run_id ?? '' };
  //           await this.evaluator.evalWorkAgent({
  //             work_id: runId,
  //             run_id: input.run_id ?? '',
  //             agent_id: matchOut.def.agent_ref || matchOut.def_id,
  //             task_content: input.user_message,
  //             agent_output: loopOutput.result,
  //           }, evalOut, evalCtx, parent?.metrics, parent?.report);
  //         } catch (err) {
  //           this.logger?.warn?.('评估 Agent 执行失败（不阻断主流程）', { error: err instanceof Error ? err.message : String(err) });
  //         }
  //       }
  //       if (this.writer) {
  //         try {
  //           const writeOut: { response?: string; response_format?: string; blocks?: unknown[] } = { response: '', blocks: [] };
  //           const writeCtx: Record<string, unknown> = { session_id: input.session_key, work_id: runId, run_id: input.run_id ?? '' };
  //           const writeOk = await this.writer.execWrite({
  //             work_id: runId,
  //             run_id: input.run_id ?? '',
  //             user_query: input.user_message,
  //             agent_results: [{
  //               agent_id: matchOut.def.name,
  //               task_content: input.user_message,
  //               result: loopOutput.result,
  //             }],
  //           }, writeOut, writeCtx, parent?.metrics, parent?.report);
  //           if (writeOk && writeOut.response) {
  //             finalResult = writeOut.response;
  //             parent?.report?.pushBusinessEvent(BusinessEvent.WriterCompleted, {
  //               format: writeOut.response_format || 'MARKDOWN',
  //               length: finalResult.length,
  //               has_mermaid: finalResult.includes('```mermaid'),
  //             });
  //             parent?.report?.pushBusinessEvent(BusinessEvent.ReplyDelta, { delta: finalResult });
  //             if (loopOutput.message_id) {
  //               await this.updateAssistantMessageContent(loopOutput.message_id, finalResult);
  //             }
  //           } else {
  //             parent?.report?.pushBusinessEvent(BusinessEvent.ReplyDelta, { delta: loopOutput.result });
  //           }
  //         } catch (err) {
  //           this.logger?.warn?.('写作 Agent 执行失败（降级为原始输出）', { error: err instanceof Error ? err.message : String(err) });
  //           parent?.report?.pushBusinessEvent(BusinessEvent.ReplyDelta, { delta: loopOutput.result });
  //         }
  //       }
  //     }
  //     if (loopInput.defer_final_reply && loopOutput.stop_reason === LoopStopReason.Stop) {
  //       parent?.report?.pushBusinessEvent(BusinessEvent.RunFinished, { stop_reason: loopOutput.stop_reason });
  //     }
  //     await this.settleRun(runId, loopOutput.stop_reason, loopOutput.iterations, matchOut.def_id, matchOut.def.agent_ref, input.user_message, parent?.report, loopOutput.error);
  //     if (loopOutput.stop_reason === LoopStopReason.Error) {
  //       this.logger?.error?.('run 执行失败', {
  //         run_id: runId,
  //         run_id: input.run_id,
  //         session_key: input.session_key,
  //         stop_reason: loopOutput.stop_reason,
  //         error: loopOutput.error,
  //         iterations: loopOutput.iterations,
  //       });
  //       await this.killErroredAgent(runId, matchOut, input, parent?.report, loopOutput.error ?? '');
  //     } else if (loopOutput.stop_reason === LoopStopReason.Aborted) {
  //       this.logger?.warn?.('run 执行中止（外部信号取消/超时）', {
  //         run_id: runId,
  //         run_id: input.run_id,
  //         session_key: input.session_key,
  //         stop_reason: loopOutput.stop_reason,
  //         iterations: loopOutput.iterations,
  //       });
  //     }
  //   } catch (err) {
  //     const errMessage = err instanceof Error ? err.message : String(err);
  //     this.logger?.error?.('run 执行异常（未捕获错误）', { run_id: runId, session_key: input.session_key, error: errMessage });
  //     parent?.metrics?.error?.('run 执行失败（结算为 error）', { run_id: runId, error: errMessage });
  //     await this.settleRun(runId, LoopStopReason.Error, 0, '', matchOut?.def?.agent_ref ?? '', input.user_message, parent?.report, errMessage);
  //     if (matchOut?.def?.agent_ref) {
  //       await this.killErroredAgent(runId, matchOut, input, parent?.report, errMessage);
  //     }
  //   }
  // }

  // ===== 修改后的方法 =====
  /** 执行运行（逻辑控制）：匹配 → 快照 → 循环 → 结算；透传 metrics 并在结束时落地入库；异常必收敛
   *  ===== 修改后（2026-09-19 上下文前置）：① 第一步先构建基本上下文（会话时间线 + 跨会话多层静态记忆），
   *  之后意图分析/Agent 构建/组件装配/Loop 执行全部依赖该基本上下文（静态记忆随 system 注入，意图/执行共享）；
   *  ② 组件装配完成后即选思维模型（CoT/ReAct）并上报 thought.selected（含选择理由）；
   *  ③ Loop 执行期间逐轮上下文/结果/终止决策由 Loop 上报（loop.turn.*）===== */
  private async executeRun(runId: string, input: SubmitRunInput, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }): Promise<void> {
    let matchOut: MatchAgentDefOutput | undefined;
    try {
      // ===== 修改后（2026-09-19 上下文前置）：第一步 = 基本上下文构建。后续所有步骤
      // （intent 分析、Agent 构建、Loop 每轮 system）都消费这一次召回的静态记忆 =====
      const baseCtx = await this.buildStaticMemory(runId, input, parent?.metrics, parent?.report);
      matchOut = await this.matchAgent(runId, input, parent?.metrics, parent?.report);
      // ===== 修改后（2026-09-12）：选择 Agent 先于组件装配上报，时间线顺序符合
      // 「需求确认 → 选择 Agent → 组件写作（LLM/Soul/Prompt/Skill/MCP）」；
      // 修改后（2026-09-14 Span 框架）：matchAgentDef 为切面 span，事件耗时由框架自动盖章（self 时间，
      // 自动扣除内部 buildAgent 等子 span —— 选择 Agent 与构建 Agent 不再互相包含） =====
      parent?.report?.pushBusinessEvent(BusinessEvent.AgentSelected, {
        def_id: matchOut.def_id,
        agent_name: matchOut.def.name,
        matched_by: matchOut.matched_by,
      });
      // ===== 修改后（2026-09-11 收敛版）：def 命中即复用绑定，不再传 regen 绕过缓存 =====
      const snapshot = await this.soSnapshot(matchOut.def_id, runId, input, parent?.metrics, parent?.report);
      // ===== 修改后（2026-09-13）：组件装配完成清单补充组件名称（soul_name/prompt_name/llm_name、
      // Skill/MCP 的 brief 兜底解析），供「思考过程」时间线与执行内容展示名称、悬浮可见 ID；
      // 修改后（2026-09-14）：事件 payload 携带组件装配环节真实耗时 elapsed_ms =====
      const soulId = matchOut.def.soul_id ?? '';
      const promptId = matchOut.def.prompt_template_id ?? '';
      const llmId = snapshot.llm_id ?? '';
      const skillEntries = (snapshot.tools ?? [])
        .filter((t) => t.kind === 'skill')
        .map((t) => ({ id: t.id, brief: t.brief || this.soSkillName(t.id) }));
      const mcpEntries = (snapshot.tools ?? [])
        .filter((t) => t.kind === 'mcp')
        .map((t) => ({ id: t.id, brief: t.brief || this.soComponentName(t.id, 'mcp_install', 'mcp_title') }));
      parent?.report?.pushBusinessEvent(BusinessEvent.AgentComponents, {
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
      // ===== 新增（2026-09-19）：思维模型选定（CoT/ReAct），在组件装配后、Loop 执行前上报。=====
      const thoughtMode = this.decideThoughtMode(skillEntries.length, mcpEntries.length);
      parent?.report?.pushBusinessEvent(BusinessEvent.ThoughtModeSelected, {
        thought_mode: thoughtMode.mode,
        reason: thoughtMode.reason,
        skills_count: skillEntries.length,
        mcps_count: mcpEntries.length,
      });
      const loopInput = this.prepareLoopInput(runId, input, runtimeSessionId, snapshot);
      // ===== 新增（2026-09-15 用户要求）：主 Loop 注入多层静态记忆。
      //      主 Loop（对话每轮的实时执行 Agent）原先仅消费会话时间线 + soul，跨会话多层记忆
      //      （PINNED/CITING/TAG_RELATIVE/SIMILARITY/KEYWORD/RANDOM）只在 Writer 汇总阶段使用。
      //      现在每次 run 开始时构建一次静态记忆上下文（InfoCore.context 多维召回，按 runId
      //      落权威快照），以 <static-memory-context> 不可变块追加到 system：
      //      —— 静态记忆在 system 中，不进入对话消息序列，每轮轮转不变且不可由模型修改；
      //      —— 执行过程中新增的信息（工具产出 / 用户追加消息 / 中间结论）仍在消息序列中动态演进，
      //         与静态记忆自然分离（静态块 usage-note 已声明「与执行新信息冲突时以新信息为准」）。
      //      Writer 汇总阶段保持自身的快照与记忆注入不变（writer work 快照 + agent_results 动态块）=====
      // ===== 修改后（2026-09-19 上下文前置）：主 Loop 不再二次召回静态记忆 ——
      // 复用第一步（buildStaticMemory）的可视记忆清单与 soul system 合成，保证
      // 意图分析、Agent 构建、Loop 执行消费同一份基本上下文快照 =====
      loopInput.system = this.composeSystemWithMemory(snapshot.system ?? '', baseCtx.memory);
      loopInput.thought_mode = thoughtMode.mode;
      // 注入 Writer 时由外部统一排版输出，延迟 Loop 的原始 reply.delta
      if (this.writer) {
        loopInput.defer_final_reply = true;
      }
      const loopOutput = new ExecAgentLoopOutput();
      await this.loop.execAgentLoop(loopInput, loopOutput, new RunGatewayContext(), parent?.metrics, parent?.report);

      // ===== 执行完成后的 评估 + 写作 阶段（完整五阶段链路） =====
      let finalResult = loopOutput.result;
      if (loopOutput.stop_reason === LoopStopReason.Stop && loopOutput.result) {
        // =====================================================================
        // ===== 原始方法（保留作为参考，2026-09-14 前）：评估同步 await，实测评估 LLM 18-20s
        // 阻塞写作与 run 结算（问答 trace 7fc0147f：评估占全程 41s 中的 19.7s） =====
        // if (this.evaluator) {
        //   try {
        //     const evalWorkId = IdGenerator.generate();
        //     parent?.report?.pushBusinessEvent(BusinessEvent.EvaluationStarted, { work_id: evalWorkId });
        //     const evalOut: Record<string, unknown> = {};
        //     const evalCtx: Record<string, unknown> = { session_id: input.session_key, work_id: evalWorkId, run_id: runId };
        //     await this.evaluator.evalWorkAgent({
        //       work_id: evalWorkId,
        //       run_id: runId,
        //       agent_id: matchOut.def.agent_ref || matchOut.def_id,
        //       task_content: input.user_message,
        //       agent_output: loopOutput.result,
        //     }, evalOut, evalCtx, parent?.metrics, parent?.report);
        //   } catch (err) {
        //     this.logger?.warn?.('评估 Agent 执行失败（不阻断主流程）', { error: err instanceof Error ? err.message : String(err) });
        //   }
        // }
        // =====================================================================

        // ===== 修改后（2026-09-14）：评估 Agent 异步化 + 低风险跳过 =====
        // 1) 低风险场景（单轮直答 stop 且仅 1 轮无多轮工具编排）跳过评估（eval_skip_low_risk，默认开）；
        // 2) 需要评估时后台 fire-and-forget 执行，不阻塞写作 Agent 与 run 结算（eval_async，默认开）。
        // 评估 Agent：评估本次输出质量（正确性/完整性/效率/相关性评分）
        // 2026-09-14：评估 Agent 执行前由框架生成其私有 work_id；run_id = 一次问答（runtime_run.id）
        if (this.evaluator) {
          const evalAsync = await this.soEvalAsync();
          const skipLowRisk = await this.soEvalSkipLowRisk();
          const lowRisk = loopOutput.iterations <= 1;
          if (skipLowRisk && lowRisk) {
            this.logger?.debug?.('评估 Agent 跳过（低风险：单轮直答，eval_skip_low_risk=true）', { run_id: runId, iterations: loopOutput.iterations });
          } else {
            const evalWorkId = IdGenerator.generate();
            // 评估 LLM 调用前上报 evaluation.started（时间线实时推进；started 事件仍在流内同步发布）
            parent?.report?.pushBusinessEvent(BusinessEvent.EvaluationStarted, { work_id: evalWorkId, mode: evalAsync ? 'async' : 'sync' });
            const evalPromise = this.runWorkEvaluation(runId, input, matchOut, loopOutput, evalWorkId, parent);
            if (!evalAsync) {
              await evalPromise;
            }
          }
        }

        // 2. 写作 Agent：美化本次输出为 Markdown / Mermaid 等最佳展示格式
        // 2026-09-14：写作 Agent 执行前由框架生成其私有 work_id；run_id = 一次问答（runtime_run.id）
        if (this.writer) {
          try {
            const writeWorkId = IdGenerator.generate();
            // ===== 修改后（2026-09-14）：写作 LLM 调用前上报 writer.started（写作 LLM 实测 7s+，
            // 此前仅有 completed 事件，时间线在写作期静止；开始事件让节点实时推进） =====
            parent?.report?.pushBusinessEvent(BusinessEvent.WriterStarted, { work_id: writeWorkId });
            const writeOut: { response?: string; response_format?: string; blocks?: unknown[] } = { response: '', blocks: [] };
            const writeCtx: Record<string, unknown> = { session_id: input.session_key, work_id: writeWorkId, run_id: runId };
            const writeOk = await this.writer.execWrite({
              work_id: writeWorkId,
              run_id: runId,
              user_query: input.user_message,
              agent_results: [{
                agent_id: matchOut.def.name,
                task_content: input.user_message,
                result: loopOutput.result,
              }],
            }, writeOut, writeCtx, parent?.metrics, parent?.report);
            if (writeOk && writeOut.response) {
              finalResult = writeOut.response;
              // ===== 修改后（2026-09-14 Span 框架）：execWrite 为切面 span，事件耗时由框架自动盖章 =====
              parent?.report?.pushBusinessEvent(BusinessEvent.WriterCompleted, {
                format: writeOut.response_format || 'MARKDOWN',
                length: finalResult.length,
                has_mermaid: finalResult.includes('```mermaid'),
              });
              // 发送美化排版后的最终回复
              parent?.report?.pushBusinessEvent(BusinessEvent.ReplyDelta, { delta: finalResult });
              // 同步更新消息库，保证历史问答（info_raw 聚合）能读到美化后的排版
              if (loopOutput.message_id) {
                await this.updateAssistantMessageContent(loopOutput.message_id, finalResult);
              }
            } else {
              parent?.report?.pushBusinessEvent(BusinessEvent.ReplyDelta, { delta: loopOutput.result });
            }
          } catch (err) {
            this.logger?.warn?.('写作 Agent 执行失败（降级为原始输出）', { error: err instanceof Error ? err.message : String(err) });
            parent?.report?.pushBusinessEvent(BusinessEvent.ReplyDelta, { delta: loopOutput.result });
          }
        }
      }

      // 如果启用了 defer_final_reply 且正常完成，由 Gateway 统筹发布 run.finished
      if (loopInput.defer_final_reply && loopOutput.stop_reason === LoopStopReason.Stop) {
        parent?.report?.pushBusinessEvent(BusinessEvent.RunFinished, { stop_reason: loopOutput.stop_reason });
      }

      // ===== 修改后（2026-09-13）：结算落账并落地 metrics 时间线 =====
      await this.settleRun(runId, loopOutput.stop_reason, loopOutput.iterations, matchOut.def_id, matchOut.def.agent_ref, input.user_message, parent?.metrics, parent?.report, loopOutput.error);
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
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      this.logger?.error?.('run 执行异常（未捕获错误）', { run_id: runId, session_key: input.session_key, error: errMessage });
      parent?.metrics?.error?.('run 执行失败（结算为 error）', { run_id: runId, error: errMessage });
      await this.settleRun(runId, LoopStopReason.Error, 0, '', matchOut?.def?.agent_ref ?? '', input.user_message, parent?.metrics, parent?.report, errMessage);
      if (matchOut?.def?.agent_ref) {
        await this.killErroredAgent(runId, matchOut, input, parent?.metrics, parent?.report, errMessage);
      }
    }
  }

  // ===== 原始方法（保留作为参考）=====
  // private async killErroredAgent(
  //   runId: string,
  //   matchOut: MatchAgentDefOutput,
  //   input: SubmitRunInput,
  //   report?: Report,
  //   errorMessage?: string,
  // ): Promise<void> {
  //   try {
  //     await this.agents.killErroredAgent(
  //       Object.assign(new KillErroredAgentInput(), {
  //         agent_ref: matchOut.def.agent_ref,
  //         work_id: runId,
  //         run_id: input.run_id ?? '',
  //         trace_id: input.run_id ?? '',
  //         task_content: input.user_message,
  //         error: errorMessage ?? '',
  //       }),
  //       new KillErroredAgentOutput(),
  //       new AgentDefContext(),
  //       undefined,
  //       report,
  //     );
  //   } catch (err) {
  //     report?.pushBusinessEvent(BusinessEvent.ErrorOccurred, { run_id: runId, error: err instanceof Error ? err.message : String(err) });
  //   }
  // }

  // ===== 修改后的方法 =====
  /** 错误 Agent 立即杀死（逻辑控制；错误 run 结算后触发；与正确 Agent 自然凋亡分离） */
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

  /** 执行 Work Agent 输出评估（逻辑控制；2026-09-14 从 executeRun 同步段拆出：
   * eval_async=true 时由 fire-and-forget 调用，异常自吞不阻断主流程） */
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

  // ===== 2026-09-14 新增：评估执行策略配置读取（runtime_runs_config；缺省即默认值） =====
  /** 评估异步开关读取（逻辑控制） */
  private async soEvalAsync(): Promise<boolean> {
    const value = await this.config.getString('eval_async', String(RunGatewayService.EVAL_ASYNC_DEFAULT));
    return value !== 'false';
  }

  /** 低风险跳过评估开关读取（逻辑控制） */
  private async soEvalSkipLowRisk(): Promise<boolean> {
    const value = await this.config.getString('eval_skip_low_risk', String(RunGatewayService.EVAL_SKIP_LOW_RISK_DEFAULT));
    return value !== 'false';
  }

  /** 更新 assistant 消息与 text part 内容为美化后的回复（数据处理；保证 history 同步一致） */
  private async updateAssistantMessageContent(messageId: string, content: string): Promise<void> {    try {
      await this.relationDb.update(RUNTIME_MESSAGE_TABLE, newPatch({
        content,
      }), [{ field: 'id', operator: Operator.EQ, value: messageId }]);
      await this.relationDb.update(RUNTIME_MESSAGE_PART_TABLE, newPatch({
        content,
      }), [
        { field: 'message_id', operator: Operator.EQ, value: messageId },
        { field: 'part_type', operator: Operator.EQ, value: 'text' },
      ]);
    } catch (err) {
      this.logger?.warn?.('更新 assistant 消息内容失败（best-effort）', {
        message_id: messageId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ===== 原始方法（保留作为参考）=====
  // private async soRuntimeSessionId(sessionKey: string): Promise<string> {
  //   const addIn = new AddSessionInput();
  //   addIn.session_key = sessionKey;
  //   const addOut = new AddSessionOutput();
  //   await this.session.addSession(addIn, addOut, new SessionContext());
  //   return addOut.session_id;
  // }
  //
  // private async matchAgent(input: SubmitRunInput, report?: Report): Promise<MatchAgentDefOutput> {
  //   const matchInput = new MatchAgentDefInput();
  //   matchInput.task_content = input.user_message;
  //   matchInput.run_id = input.run_id ?? '';
  //   matchInput.context_id = input.context_id ?? '';
  //   const matchOutput = new MatchAgentDefOutput();
  //   await this.agents.matchAgentDef(matchInput, matchOutput, new AgentDefContext(), undefined, report);
  //   return matchOutput;
  // }
  //
  // private async soSnapshot(
  //   defId: string,
  //   input: SubmitRunInput,
  //   report?: Report,
  // ): Promise<SoAgentSnapshotOutput['snapshot']> {
  //   const snapInput = new SoAgentSnapshotInput();
  //   snapInput.def_id = defId;
  //   snapInput.task_content = input.user_message;
  //   snapInput.user_message = input.user_message;
  //   snapInput.run_id = input.run_id ?? '';
  //   snapInput.context_id = input.context_id ?? '';
  //   const snapOutput = new SoAgentSnapshotOutput();
  //   await this.agents.soAgentSnapshot(snapInput, snapOutput, new AgentDefContext(), undefined, report);
  //   return snapOutput.snapshot;
  // }

  // ===== 修改后的方法 =====
  /** 外部会话键 → runtime 会话 ID（逻辑控制；幂等；透传 metrics） */
  private async soRuntimeSessionId(sessionKey: string, metrics?: Metrics): Promise<string> {
    const addIn = new AddSessionInput();
    addIn.session_key = sessionKey;
    const addOut = new AddSessionOutput();
    await this.session.addSession(addIn, addOut, new SessionContext(), metrics);
    return addOut.session_id;
  }

  /** 确定性匹配（逻辑控制；透传 metrics；执行框架先生成本阶段 work_id，Token 归因到 Agent 选择执行） */
  private async matchAgent(runId: string, input: SubmitRunInput, metrics?: Metrics, report?: Report): Promise<MatchAgentDefOutput> {
    const matchInput = new MatchAgentDefInput();
    matchInput.task_content = input.user_message;
    matchInput.session_id = input.session_key;
    matchInput.run_id = runId;
    matchInput.work_id = IdGenerator.generate();
    matchInput.context_id = input.context_id ?? '';
    const matchOutput = new MatchAgentDefOutput();
    await this.agents.matchAgentDef(matchInput, matchOutput, new AgentDefContext(), metrics, report);
    return matchOutput;
  }

  /** 组件快照（逻辑控制；2026-09-11 收敛版：只读 def 显式绑定，无 regen 绕过；透传 metrics；
   * 2026-09-14：run_id = 一次问答（runtime_run.id）） */
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

  // ===== 2026-09-19 新增：思维模型选定（数据处理） =====
  /**
   * CoT/ReAct 判定规则（确定性，无随机）：
   * - 有绑定 Skill 或 MCP（即存在外部工具/事实查询能力）→ ReAct：
   *   执行形态是「行动→观察→再决策」的外部交互闭环，需 ReAct 的 Reason-Act 循环防止一次性幻觉调用；
   * - 无外部工具（纯知识类直答任务）→ CoT：
   *   无外部观察点，ReAct 的 Act 环节退化，一步链式推理（上下文 → 分析 → 结论）耗时最低，
   *   且 Loop 允许每轮 continue（工具仍可由通用原语触发，只是不作为主要交互形态）。
   * 逐轮体现在 loop.turn.started（thought_mode）与 thought.selected 事件 payload.reason。
   */
  private decideThoughtMode(skillCount: number, mcpCount: number): { mode: 'CoT' | 'ReAct'; reason: string } {
    if (skillCount > 0 || mcpCount > 0) {
      return {
        mode: 'ReAct',
        reason: `绑定了 ${skillCount} 个 Skill / ${mcpCount} 个 MCP，执行需「行动→观察→再决策」的外部交互闭环，选用 ReAct`,
      };
    }
    return {
      mode: 'CoT',
      reason: '无绑定 Skill/MCP（纯知识类任务，无外部观察点），ReAct 的 Act 环节退化，选用 CoT 一步链式推理',
    };
  }

  /** Loop 入参组装（原始方法，保留作为参考） */
  // private prepareLoopInput(
  //   runId: string,
  //   input: SubmitRunInput,
  //   runtimeSessionId: string,
  //   snapshot: SoAgentSnapshotOutput['snapshot'],
  // ): ExecAgentLoopInput {
  //   const loopInput = new ExecAgentLoopInput();
  //   loopInput.run_id = runId;
  //   loopInput.session_key = input.session_key;
  //   loopInput.session_id = runtimeSessionId;
  //   loopInput.user_message = input.user_message;
  //   loopInput.system = snapshot.system;
  //   loopInput.llm_id = snapshot.llm_id;
  //   loopInput.temperature = snapshot.temperature;
  //   loopInput.budget = { total: input.budget_total ?? snapshot.budget_total };
  //   return loopInput;
  // }

  /** Loop 入参组装（2026-09-11 选/执分离：工具可见性由 match 阶段组件绑定驱动；
   * 未绑定 Skill → 不注入 skill_exec；未绑定 MCP → 不注入 mcp_exec；
   * component_scope 携带选定 id 清单，作为执行门的唯一合法范围；
   * 2026-09-14：run_id = 一次问答（runtime_run.id），work_id = 执行框架生成的本次 Agent 执行标识） */  private prepareLoopInput(
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
    const boundSkills = (snapshot.tools ?? []).filter((t) => t.kind === 'skill').map((t) => t.id);
    const boundMcps = (snapshot.tools ?? []).filter((t) => t.kind === 'mcp').map((t) => t.id);
    // 工具可见性显式清单：skill_exec/mcp_exec 仅在组件已绑定时注入（其余为通用原语工具）
    loopInput.tools = ['cdt_browser', 'update_plan', 'delegate'];
    if (boundSkills.length) {
      loopInput.tools.push('skill_exec');
    }
    if (boundMcps.length) {
      loopInput.tools.push('mcp_exec');
    }
    loopInput.component_scope = { skills: boundSkills, mcps: boundMcps };
    return loopInput;
  }

  /** 结算落账（原始方法，保留作为参考） */
  // private async settleRun(runId: string, stopReason: string, budgetUsed: number, agentDefId: string): Promise<void> {
  //   const status: RunStatus = stopReason === 'stop' || stopReason === 'budget' ? RunStatus.Finished : (stopReason as RunStatus);
  //   await this.relationDb.update(RUNTIME_RUN_TABLE, newPatch({
  //     status,
  //     stop_reason: stopReason,
  //     settled_at: IdGenerator.now(),
  //     budget_used: budgetUsed,
  //     agent_def_id: agentDefId,
  //   }), [{ field: 'id', operator: Operator.EQ, value: runId }]);
  //   const waiter = this.waiters.get(runId);
  //   this.waiters.delete(runId);
  //   waiter?.resolve({ status, stop_reason: stopReason });
  //   await this.drainFollowups(runId);
  // }

  // ===== 原始方法（保留作为参考）=====
  // private async settleRun(
  //   runId: string,
  //   stopReason: string,
  //   budgetUsed: number,
  //   agentDefId: string,
  //   agentRef?: string,
  //   _taskContent?: string,
  //   report?: Report,
  //   errorMessage?: string,
  // ): Promise<void> {
  //   const status: RunStatus = stopReason === 'stop' || stopReason === 'budget' ? RunStatus.Finished : (stopReason as RunStatus);
  //   await this.relationDb.update(RUNTIME_RUN_TABLE, newPatch({
  //     status,
  //     stop_reason: stopReason,
  //     settled_at: IdGenerator.now(),
  //     budget_used: budgetUsed,
  //     agent_def_id: agentDefId,
  //   }), [{ field: 'id', operator: Operator.EQ, value: runId }]);
  //   const waiter = this.waiters.get(runId);
  //   this.waiters.delete(runId);
  //   waiter?.resolve({ status, stop_reason: stopReason });
  //   if (agentRef && errorMessage) {
  //     report?.pushBusinessEvent(BusinessEvent.ErrorOccurred, { run_id: runId, agent_id: agentRef, error: errorMessage.slice(0, 300) });
  //   }
  //   await this.drainFollowups(runId);
  // }

  // ===== 修改后的方法 =====
  /** 结算落账（2026-09-11：补充 agent_ref/任务/错误信息参数；2026-09-14：旧 metrics 落库方案删除） */
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
    // ===== 修改后（2026-09-14 Span 框架）：旧统一计落库方案（runtime_run.metrics_json +
    // runtime_metrics 重复表）删除；时间线耗时唯一数据源 = 业务事件 payload 自带（span self 时间），
    // Span 树仅驻留内存供审计/总耗时计算，无需持久化 =====
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
  private readonly permissionWaiters = new Map<string, { resolve: (r: { approved: boolean; autoApproved?: boolean }) => void; answered: boolean; tool_id?: string }>();

  // ===== 新增（2026-09-12）：信任工具表（"永久批准"）=====
  // 用户在权限卡点"始终允许"后，tool_id 入表并持久化到 runtime_runs_config（trusted_tools，
  // JSON 数组）；后续同工具 askPermission 直接放行，不再弹窗。撤销走 configRuns 全量覆盖。
  /** 信任工具内存态（config 表为唯一持久源；懒加载） */
  private trustedTools: Set<string> | null = null;

  /** 信任表读取（数据处理）：缺配置/坏 JSON 回退空表 */
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

  /** 信任表持久化（逻辑控制；best-effort，失败仅日志不阻断应答） */
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

  /**
   * 权限等待挂起（逻辑控制；Loop 权限门调用，permission.asked 已由 Loop 经 Report 下发）。
   *
   * ===== 修改后（2026-09-11）：等待加超时兜底（PERMISSION_WAIT_TIMEOUT_MS，默认 120s）——
   * 僵尸 run 复盘：用户关闭页面后 Deferred 永远无人 resolve，run 永久卡 running；超时归一为默认拒绝（approved=false），
   * Loop 按"被拒"走正常配对回流并结算，不再永久挂起。
   */
  async waitPermission(input: WaitPermissionInput, output: WaitPermissionOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.permission_id) {
      throw new ValidationError('permission_id 不能为空');
    }
    // ===== 新增（2026-09-12）：信任工具直接放行（不注册 waiter、不弹窗等待）=====
    if (input.tool_id) {
      const trusted = await this.soTrustedTools();
      if (trusted.has(input.tool_id)) {
        output.approved = true;
        output.answered = true;
        output.auto_approved = true;
        return true;
      }
    }
    const timeoutRef = { value: RunGatewayService.PERMISSION_WAIT_DEFAULT_MS };
    try {
      timeoutRef.value = await this.soPermissionWaitTimeout();
    } catch { /* best effort：配置读取失败回退默认 */ }
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
      // 有应答时清掉超时定时器（answerPermission 负责删除 waiter；timeout 后自键已删，安全幂等）
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
    // ===== 新增（2026-09-12）："始终允许" → 批准且记住时工具入信任表 =====
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

  async configRuns(input: ConfigRunsInput, output: ConfigRunsOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.enabled !== undefined) {
      this.enabled = input.enabled;
      await this.config.set('enabled', input.enabled ? 'true' : 'false', 'BOOLEAN');
    }
    // ===== 2026-09-11：权限等待超时可配置 =====
    if (input.permission_wait_timeout_ms !== undefined) {
      if (input.permission_wait_timeout_ms < 0) {
        throw new ValidationError('permission_wait_timeout_ms 不能为负');
      }
      await this.config.set('permission_wait_timeout_ms', String(input.permission_wait_timeout_ms), 'NUMBER');
    }
    // ===== 新增（2026-09-12）：信任工具表全量覆盖（撤销信任入口）=====
    if (input.trusted_tools !== undefined) {
      const next = new Set(input.trusted_tools.filter((t): t is string => typeof t === 'string' && t.length > 0));
      this.trustedTools = next;
      await this.persistTrustedTools();
    }
    // ===== 2026-09-14 新增：评估执行策略可配置（eval_async / eval_skip_low_risk）=====
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

  /** 权限等待超时读取（数据处理）：缺少配置行回退默认 120000 */
  private async soPermissionWaitTimeout(): Promise<number> {
    const value = await this.config.getInt('permission_wait_timeout_ms', RunGatewayService.PERMISSION_WAIT_DEFAULT_MS);
    return value > 0 ? value : RunGatewayService.PERMISSION_WAIT_DEFAULT_MS;
  }

  // ===== 新增（2026-09-13）：组件 ID → 展示名称解析（Soul/Prompt/LLM/Skill/MCP），
  // 事件载荷携带名称供前端实时时间线展示、ID 随悬浮可见 =====
  /** 组件名称解析（数据处理）：按 id 查表取展示名，查无回退空串（由调用方兜底回退 ID） */
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

  /** Skill 展示名称解析（数据处理）：优先 name 列（技能名称），回退 skill_brief 简述 */
  private soSkillName(id: string): string {
    return this.soComponentName(id, 'skill', 'name') || this.soComponentName(id, 'skill', 'skill_brief');
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
