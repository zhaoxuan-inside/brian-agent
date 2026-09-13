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
  RUNTIME_METRICS_TABLE,
  RUNTIME_RUNS_CONFIG_TABLE,
} from '../domain/types';

/** 输出评估接口（鸭子类型，由组合根注入 Evolutor 适配器） */
export interface OutputEvaluator {
  evalWorkAgent(input: {
    work_id: string;
    interact_id: string;
    agent_id: string;
    task_content: string;
    agent_output: string;
  }, output: unknown, ctx: unknown, metrics?: Metrics, report?: Report): Promise<boolean>;
}

/** 输出写作排版接口（鸭子类型，由组合根注入 Writer 适配器） */
export interface OutputWriter {
  execWrite(input: {
    work_id: string;
    interact_id: string;
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

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly session: SessionAccess,
    private readonly agents: AgentDefAccess,
    private readonly loop: LoopAccess,
    private readonly logger?: Logger,
    private readonly evaluator?: OutputEvaluator,
    private readonly writer?: OutputWriter,
  ) {
    this.config = new ConfigService(relationDb, RUNTIME_RUNS_CONFIG_TABLE);
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
  /** 插入排队 run 记录（逻辑控制；结算后复用同一 run_id 转 running，见 §4.1） */
  private async insertQueuedRun(input: SubmitRunInput, mode: QueueMode, runtimeSessionId: string): Promise<string> {
    const record = newRecord({
      session_key: input.session_key,
      session_id: runtimeSessionId,
      lane: input.lane_kind ?? 'session',
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
      });
      await this.relationDb.insert(RUNTIME_RUN_TABLE, record);
    }
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
  //           const evalCtx: Record<string, unknown> = { session_id: input.session_key, work_id: runId, interact_id: input.interact_id ?? '' };
  //           await this.evaluator.evalWorkAgent({
  //             work_id: runId,
  //             interact_id: input.interact_id ?? '',
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
  //           const writeCtx: Record<string, unknown> = { session_id: input.session_key, work_id: runId, interact_id: input.interact_id ?? '' };
  //           const writeOk = await this.writer.execWrite({
  //             work_id: runId,
  //             interact_id: input.interact_id ?? '',
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
  //         interact_id: input.interact_id,
  //         session_key: input.session_key,
  //         stop_reason: loopOutput.stop_reason,
  //         error: loopOutput.error,
  //         iterations: loopOutput.iterations,
  //       });
  //       await this.killErroredAgent(runId, matchOut, input, parent?.report, loopOutput.error ?? '');
  //     } else if (loopOutput.stop_reason === LoopStopReason.Aborted) {
  //       this.logger?.warn?.('run 执行中止（外部信号取消/超时）', {
  //         run_id: runId,
  //         interact_id: input.interact_id,
  //         session_key: input.session_key,
  //         stop_reason: loopOutput.stop_reason,
  //         iterations: loopOutput.iterations,
  //       });
  //     }
  //   } catch (err) {
  //     const errMessage = err instanceof Error ? err.message : String(err);
  //     this.logger?.error?.('run 执行异常（未捕获错误）', { run_id: runId, interact_id: input.interact_id, session_key: input.session_key, error: errMessage });
  //     parent?.metrics?.error?.('run 执行失败（结算为 error）', { run_id: runId, error: errMessage });
  //     await this.settleRun(runId, LoopStopReason.Error, 0, '', matchOut?.def?.agent_ref ?? '', input.user_message, parent?.report, errMessage);
  //     if (matchOut?.def?.agent_ref) {
  //       await this.killErroredAgent(runId, matchOut, input, parent?.report, errMessage);
  //     }
  //   }
  // }

  // ===== 修改后的方法 =====
  /** 执行运行（逻辑控制）：匹配 → 快照 → 循环 → 结算；透传 metrics 并在结束时落地入库；异常必收敛 */
  private async executeRun(runId: string, input: SubmitRunInput, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }): Promise<void> {
    let matchOut: MatchAgentDefOutput | undefined;
    try {
      matchOut = await this.matchAgent(input, parent?.metrics, parent?.report);
      // ===== 修改后（2026-09-12）：选择 Agent 先于组件装配上报，时间线顺序符合
      // 「需求确认 → 选择 Agent → 组件写作（LLM/Soul/Prompt/Skill/MCP）」 =====
      parent?.report?.pushBusinessEvent(BusinessEvent.AgentSelected, {
        def_id: matchOut.def_id,
        agent_name: matchOut.def.name,
        matched_by: matchOut.matched_by,
      });
      // ===== 修改后（2026-09-11 收敛版）：def 命中即复用绑定，不再传 regen 绕过缓存 =====
      const snapshot = await this.soSnapshot(matchOut.def_id, input, parent?.metrics, parent?.report);
      // ===== 修改后（2026-09-13）：组件装配完成清单补充组件名称（soul_name/prompt_name/llm_name、
      // Skill/MCP 的 brief 兜底解析），供「思考过程」时间线与执行内容展示名称、悬浮可见 ID =====
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
      const loopInput = this.prepareLoopInput(runId, input, runtimeSessionId, snapshot);
      // 注入 Writer 时由外部统一排版输出，延迟 Loop 的原始 reply.delta
      if (this.writer) {
        loopInput.defer_final_reply = true;
      }
      const loopOutput = new ExecAgentLoopOutput();
      await this.loop.execAgentLoop(loopInput, loopOutput, new RunGatewayContext(), parent?.metrics, parent?.report);

      // ===== 执行完成后的 评估 + 写作 阶段（完整五阶段链路） =====
      let finalResult = loopOutput.result;
      if (loopOutput.stop_reason === LoopStopReason.Stop && loopOutput.result) {
        // 1. 评估 Agent：评估本次输出质量（正确性/完整性/效率/相关性评分）
        if (this.evaluator) {
          try {
            const evalOut: Record<string, unknown> = {};
            const evalCtx: Record<string, unknown> = { session_id: input.session_key, work_id: runId, interact_id: input.interact_id ?? '' };
            await this.evaluator.evalWorkAgent({
              work_id: runId,
              interact_id: input.interact_id ?? '',
              agent_id: matchOut.def.agent_ref || matchOut.def_id,
              task_content: input.user_message,
              agent_output: loopOutput.result,
            }, evalOut, evalCtx, parent?.metrics, parent?.report);
          } catch (err) {
            this.logger?.warn?.('评估 Agent 执行失败（不阻断主流程）', { error: err instanceof Error ? err.message : String(err) });
          }
        }

        // 2. 写作 Agent：美化本次输出为 Markdown / Mermaid 等最佳展示格式
        if (this.writer) {
          try {
            const writeOut: { response?: string; response_format?: string; blocks?: unknown[] } = { response: '', blocks: [] };
            const writeCtx: Record<string, unknown> = { session_id: input.session_key, work_id: runId, interact_id: input.interact_id ?? '' };
            const writeOk = await this.writer.execWrite({
              work_id: runId,
              interact_id: input.interact_id ?? '',
              user_query: input.user_message,
              agent_results: [{
                agent_id: matchOut.def.name,
                task_content: input.user_message,
                result: loopOutput.result,
              }],
            }, writeOut, writeCtx, parent?.metrics, parent?.report);
            if (writeOk && writeOut.response) {
              finalResult = writeOut.response;
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
          interact_id: input.interact_id,
          session_key: input.session_key,
          stop_reason: loopOutput.stop_reason,
          error: loopOutput.error,
          iterations: loopOutput.iterations,
        });
        await this.killErroredAgent(runId, matchOut, input, parent?.metrics, parent?.report, loopOutput.error ?? '');
      } else if (loopOutput.stop_reason === LoopStopReason.Aborted) {
        this.logger?.warn?.('run 执行中止（外部信号取消/超时）', {
          run_id: runId,
          interact_id: input.interact_id,
          session_key: input.session_key,
          stop_reason: loopOutput.stop_reason,
          iterations: loopOutput.iterations,
        });
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      this.logger?.error?.('run 执行异常（未捕获错误）', { run_id: runId, interact_id: input.interact_id, session_key: input.session_key, error: errMessage });
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
  //         interact_id: input.interact_id ?? '',
  //         trace_id: input.interact_id ?? '',
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
          interact_id: input.interact_id ?? '',
          trace_id: input.interact_id ?? '',
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

  /** 更新 assistant 消息与 text part 内容为美化后的回复（数据处理；保证 history 同步一致） */
  private async updateAssistantMessageContent(messageId: string, content: string): Promise<void> {
    try {
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
  //   matchInput.interact_id = input.interact_id ?? '';
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
  //   snapInput.interact_id = input.interact_id ?? '';
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

  /** 确定性匹配（逻辑控制；透传 metrics） */
  private async matchAgent(input: SubmitRunInput, metrics?: Metrics, report?: Report): Promise<MatchAgentDefOutput> {
    const matchInput = new MatchAgentDefInput();
    matchInput.task_content = input.user_message;
    matchInput.interact_id = input.interact_id ?? '';
    matchInput.context_id = input.context_id ?? '';
    const matchOutput = new MatchAgentDefOutput();
    await this.agents.matchAgentDef(matchInput, matchOutput, new AgentDefContext(), metrics, report);
    return matchOutput;
  }

  /** 组件快照（逻辑控制；2026-09-11 收敛版：只读 def 显式绑定，无 regen 绕过；透传 metrics） */
  private async soSnapshot(
    defId: string,
    input: SubmitRunInput,
    metrics?: Metrics,
    report?: Report,
  ): Promise<SoAgentSnapshotOutput['snapshot']> {
    const snapInput = new SoAgentSnapshotInput();
    snapInput.def_id = defId;
    snapInput.task_content = input.user_message;
    snapInput.user_message = input.user_message;
    snapInput.interact_id = input.interact_id ?? '';
    snapInput.context_id = input.context_id ?? '';
    const snapOutput = new SoAgentSnapshotOutput();
    await this.agents.soAgentSnapshot(snapInput, snapOutput, new AgentDefContext(), metrics, report);
    return snapOutput.snapshot;
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
   * component_scope 携带选定 id 清单，作为执行门的唯一合法范围） */
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
    loopInput.interact_id = input.interact_id;
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
  /** 结算落账（2026-09-11：补充 agent_ref/任务/错误信息参数；2026-09-13：落地 metrics 时间线与耗时入库） */
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
    const timings = metrics?.timings ?? {};
    const timingsJson = JSON.stringify(timings);
    const totalDuration = typeof metrics?.getTotalDuration === 'function' ? metrics.getTotalDuration() : 0;
    const now = IdGenerator.now();

    await this.relationDb.update(RUNTIME_RUN_TABLE, newPatch({
      status,
      stop_reason: stopReason,
      settled_at: now,
      budget_used: budgetUsed,
      agent_def_id: agentDefId,
      metrics_json: timingsJson,
    }), [{ field: 'id', operator: Operator.EQ, value: runId }]);

    try {
      const runRow = await this.soRunRow(runId);
      const sessionKey = String(runRow?.session_key ?? '');
      const traceId = metrics?.trace_id || '';
      await this.relationDb.insert(RUNTIME_METRICS_TABLE, newRecord({
        id: IdGenerator.generate(),
        created: now,
        updated: now,
        run_id: runId,
        session_key: sessionKey,
        trace_id: traceId,
        timings_json: timingsJson,
        total_duration_ms: totalDuration,
      }));
    } catch (err) {
      this.logger?.warn?.('落地 runtime_metrics 失败（非阻断）', {
        run_id: runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

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
    output.permission_wait_timeout_ms = await this.soPermissionWaitTimeout();
    output.trusted_tools = [...(await this.soTrustedTools())];
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
