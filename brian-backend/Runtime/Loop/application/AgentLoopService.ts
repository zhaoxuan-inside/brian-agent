/**
 * @fileoverview AgentLoopService —— 两级 agent 循环（Runtime v2 · 阶段2）。
 *
 * 依据 `Loop/Loop-PRD.md` §5/§7 与 `Session-PRD.md` §5：
 * - 外层 while（followup 队列，阶段3 接 Runs）+ 内层 while（tool_calls + steering 检查点）；
 * - **消息中心**：每轮 wire 消息从持久化 Part 派生（prepareModelMessages 读
 *   runtime_message_part），不持有跨轮内存消息状态；
 * - 终止条件 = finish reason 无 tool_calls；预算 = IterationBudget（超支宽限收尾）；
 * - 真取消：run 级 AbortController（abortLoopTurn / 外部 signal），AbortedError
 *   直接收敛 stop_reason='aborted'，不触发任何降级；
 * - 双通道副作用：持久化事件经 EventBus（重放/审计事实源）；业务事件经 Report
 *   （StreamProvider 在线上报，无流会话静默降级 no-op）。
 *
 * 每 5 参方法 ≤40 行；逻辑控制（I/O 编排）与数据处理（纯加工）拆分。
 */

import type {
  LLMAccess,
  Logger,
  Metrics,
  Report,
  LLMMessage,
  ParsedToolCall,
  LLMEvent,
} from '@brian-agent/base';

import { BusinessEvent } from '@brian-agent/base';
import type { ToolSpecJson } from '../../Tools';
import {
  LLMContext,
  ExecLLMEventsInput,
  ExecLLMEventsOutput,
  AbortedError,
  ValidationError,
  IdGenerator,
} from '@brian-agent/base';
import { DEFAULT_BUDGET_TOTAL, IterationBudget, AbortReason, RunPhase } from '../../shared/types';
import type { SessionAccess } from '../../Session';
import type { ToolAccess } from '../../Tools';
import {
  ExecAgentLoopInput,
  ExecAgentLoopOutput,
  AbortLoopTurnInput,
  AbortLoopTurnOutput,
  ConfigLoopInput,
  ConfigLoopOutput,
  LoopContext,
  LoopStopReason,
  LoopQueue,
} from '../domain/types';
import {
  AddMessageInput,
  AddMessageOutput,
  AddPartInput,
  AddPartOutput,
  UpdatePartInput,
  UpdatePartOutput,
  SoMessagesInput,
  SoMessagesOutput,
  PartRecord,
  MessageWithParts,
  MessageRole,
  PartType,
  PartStatus,
  SessionContext,
} from '../../Session';
import {
  ExecToolInput,
  ExecToolOutput,
  SoToolsInput,
  SoToolsOutput,
  ToolContext,
} from '../../Tools';

/** 循环内轮读取消息上限（soMessages limit） */
const LOOP_MESSAGE_LIMIT = 100;

/** part.delta 合帧间隔（毫秒） */
const DELTA_FLUSH_MS = 50;

/** run 级循环运行上下文（内部） */
interface LoopRunContext {
  runId: string;
  sessionKey: string;
  sessionId: string;
  system?: string;
  llmId?: string;
  temperature?: number;
  maxTokens?: number;
  idleWatchdogMs?: number;
  budget: IterationBudget;
  controller: AbortController;
  specs: ToolSpecJson[];
  stopReason: LoopStopReason;
  result: string;
  error?: string;
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  lastMessageId?: string;
  finalTurn: boolean;
  /** 业务事件在线上报通道（无流会话为 undefined，pushBusinessEvent no-op） */
  report?: Report;
  /** 衡量对象（方法内日志经 Metrics 保存——Metrics 封装 LogProvider 调用接口） */
  metrics?: Metrics;
  /** 权限门（工具执行前询问；Runs 注入） */
  permissionGate?: { wait(input: { permission_id: string }): Promise<{ approved: boolean }> };
  /** part.delta 合帧缓冲（修复③：50ms 合并降频，delta 拼接语义不变） */
  deltaBuffer: { text: string; reasoning: string; timer?: ReturnType<typeof setTimeout> };
}

/** 单轮 LLM 调用结果（内部） */
interface LLMTurnResult {
  ok: boolean;
  verdict?: LoopStopReason;
  text?: string;
  reasoning?: string;
  finishReason?: string;
  toolCalls?: ParsedToolCall[];
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

/**
 * AgentLoopService。
 */
export class AgentLoopService {
  private enabled = true;
  private defaultBudgetTotal = DEFAULT_BUDGET_TOTAL;
  private readonly runControllers = new Map<string, AbortController>();

  constructor(
    private readonly llm: LLMAccess,
    private readonly session: SessionAccess,
    private readonly tool: ToolAccess,
    private readonly logger?: Logger,
    /** 会话级队列（steering/followup；RunGateway 注入，鸭子接口不反向依赖） */
    private readonly queue?: LoopQueue,
    /** 权限门（Runs 注入；工具执行前询问，permission.asked → 应答 → 继续/拒绝） */
    private readonly permissionGate?: { wait(input: { permission_id: string }): Promise<{ approved: boolean }> },
  ) {}

  /** 初始化组件 */
  async initialize(): Promise<void> {
    this.logger?.debug?.('AgentLoopService 初始化完成');
  }

  /** 组件使能守卫 */
  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new ValidationError('Loop 组件未启用，请先通过 configLoop 启用');
    }
  }

  // -------------------------------------------------------------------------
  // execAgentLoop（公开边界）
  // -------------------------------------------------------------------------

  /** 执行两级 agent 循环（逻辑控制；5 参公开边界） */
  async execAgentLoop(input: ExecAgentLoopInput, output: ExecAgentLoopOutput, _context: LoopContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    this.validateLoopInput(input);
    const ctx = await this.prepareLoopContext(input, metrics, report);
    try {
      await this.runOuterLoop(ctx);
      this.fillLoopOutput(output, ctx);
    } finally {
      await this.settleLoop(ctx);
    }
    return true;
  }

  /** 循环入参校验（数据处理） */
  private validateLoopInput(input: ExecAgentLoopInput): void {
    if (!input.run_id || !input.session_key || !input.session_id || !input.user_message) {
      throw new ValidationError('run_id/session_key/session_id/user_message 不能为空');
    }
  }

  /** 组装循环运行上下文（逻辑控制）：取消接线 · 预算 · 工具规格 · 用户消息 */
  private async prepareLoopContext(input: ExecAgentLoopInput, metrics?: Metrics, report?: Report): Promise<LoopRunContext> {
    const budget = new IterationBudget(input.budget ?? { total: this.defaultBudgetTotal });
    const controller = new AbortController();
    this.runControllers.set(input.run_id, controller);
    try {
      this.wireExternalSignal(input, controller);
      const specs = await this.soLoopToolSpecs(input.tools);
      await this.persistUserMessage(input);
      await this.publishRunStatus({ runId: input.run_id, sessionKey: input.session_key, report }, RunPhase.Start);
      return this.prepareContextFields(input, budget, controller, specs, metrics, report);
    } catch (err) {
      this.runControllers.delete(input.run_id);
      throw err;
    }
  }

  /** 上下文字段组装（数据处理） */
  private prepareContextFields(
    input: ExecAgentLoopInput,
    budget: IterationBudget,
    controller: AbortController,
    specs: ToolSpecJson[],
    metrics?: Metrics,
    report?: Report,
  ): LoopRunContext {
    return {
      runId: input.run_id,
      sessionKey: input.session_key,
      sessionId: input.session_id,
      system: input.system,
      llmId: input.llm_id || undefined,
      temperature: input.temperature,
      maxTokens: input.max_tokens,
      idleWatchdogMs: input.idle_watchdog_ms,
      budget,
      controller,
      specs,
      stopReason: LoopStopReason.Stop,
      result: '',
      iterations: 0,
      inputTokens: 0,
      outputTokens: 0,
      finalTurn: false,
      metrics,
      report,
      deltaBuffer: { text: '', reasoning: '' },
    };
  }

  /** 外部 signal → run controller 接线（逻辑控制；未知原因归一为 user） */
  private wireExternalSignal(input: ExecAgentLoopInput, controller: AbortController): void {
    if (!input.signal) {
      return;
    }
    if (input.signal.aborted) {
      controller.abort(AbortReason.User);
      return;
    }
    input.signal.addEventListener('abort', () => {
      const reason = input.signal?.reason as AbortReason | undefined;
      const known = reason && Object.values(AbortReason).includes(reason) ? reason : AbortReason.User;
      controller.abort(known);
    }, { once: true });
  }

  /** 会话内写入用户消息（逻辑控制） */
  private async persistUserMessage(input: ExecAgentLoopInput): Promise<void> {
    const add = new AddMessageInput();
    add.session_id = input.session_id;
    add.role = MessageRole.User;
    add.content = input.user_message;
    add.run_id = input.run_id;
    await this.session.addMessage(add, new AddMessageOutput(), new SessionCtx());
  }

  /** 解析本轮可见工具规格（逻辑控制） */
  private async soLoopToolSpecs(toolIds?: string[]): Promise<ToolSpecJson[]> {
    const soIn = new SoToolsInput();
    soIn.tool_ids = toolIds;
    const soOut = new SoToolsOutput();
    await this.tool.soTools(soIn, soOut, new ToolCtx());
    return soOut.specs;
  }

  // -------------------------------------------------------------------------
  // 两级循环
  // -------------------------------------------------------------------------

  /** 外层循环（逻辑控制）：followup 队列 + steering 残留兜底（RunGateway 注入；无队列时单轮） */
  private async runOuterLoop(ctx: LoopRunContext): Promise<void> {
    ctx.stopReason = await this.runInnerLoop(ctx);
    for (;;) {
      const followup = this.queue?.takeFollowup(ctx.sessionKey) ?? [];
      const residualSteer = followup.length ? [] : (this.queue?.drainSteering(ctx.sessionKey) ?? []);
      const injected = [...followup, ...residualSteer];
      if (!injected.length) {
        break;
      }
      await this.persistInjectedMessages(ctx, injected);
      ctx.stopReason = await this.runInnerLoop(ctx);
    }
  }

  /** 注入排队消息为 user 消息（逻辑控制；下一轮 wire 派生自动包含） */
  private async persistInjectedMessages(ctx: LoopRunContext, messages: string[]): Promise<void> {
    for (const message of messages) {
      const add = new AddMessageInput();
      add.session_id = ctx.sessionId;
      add.role = MessageRole.User;
      add.content = message;
      add.run_id = ctx.runId;
      await this.session.addMessage(add, new AddMessageOutput(), new SessionCtx());
    }
  }

  /** 内层循环（逻辑控制）：终止条件 = finish reason 无 tool_calls / 预算 / 取消 */
  private async runInnerLoop(ctx: LoopRunContext): Promise<LoopStopReason> {
    for (;;) {
      const verdict = await this.runInnerTurn(ctx);
      if (verdict !== 'continue') {
        return verdict;
      }
    }
  }

  /** 预算消费与收尾判定（逻辑控制） */
  private consumeBudget(ctx: LoopRunContext): { stop: boolean; reason?: LoopStopReason; finalTurn: boolean } {
    if (!ctx.budget.consume()) {
      return { stop: true, reason: LoopStopReason.Budget, finalTurn: false };
    }
    const finalTurn = !ctx.budget.graceAvailable && ctx.budget.remaining === 0;
    return { stop: false, finalTurn };
  }

  /** 内层单轮（逻辑控制）：预算 → steering 抽干 → LLM → 持久化 → 工具消费 */
  private async runInnerTurn(ctx: LoopRunContext): Promise<'continue' | LoopStopReason> {
    const steered = this.queue?.drainSteering(ctx.sessionKey) ?? [];
    if (steered.length) {
      await this.persistInjectedMessages(ctx, steered);
    }
    const gate = this.consumeBudget(ctx);
    if (gate.stop) {
      return gate.reason ?? LoopStopReason.Budget;
    }
    ctx.finalTurn = gate.finalTurn;
    const turn = await this.callLLMTurn(ctx);
    if (!turn.ok) {
      this.flushDeltaBuffer(ctx);
      return turn.verdict ?? LoopStopReason.Error;
    }
    this.flushDeltaBuffer(ctx);
    await this.persistAssistantTurn(ctx, turn);
    if (turn.finishReason !== 'tool-calls') {
      ctx.result = turn.text ?? '';
      // 修复①消费侧：流中途断开（无 finish_reason 帧）→ finish_reason='error'，规范化失败
      if (turn.finishReason === 'error') {
        ctx.error = ctx.error ?? 'LLM 流异常终止（未收到结束帧）';
        return LoopStopReason.Error;
      }
      return LoopStopReason.Stop;
    }
    await this.consumeToolCalls(ctx, turn.toolCalls ?? []);
    return 'continue';
  }

  // -------------------------------------------------------------------------
  // LLM 调用与流处理
  // -------------------------------------------------------------------------

  /** 单轮 LLM 调用（逻辑控制；AbortedError → aborted 收敛） */
  private async callLLMTurn(ctx: LoopRunContext): Promise<LLMTurnResult> {
    const input = await this.prepareLLMTurnInput(ctx);
    const output = new ExecLLMEventsOutput();
    try {
      const ok = await this.llm.execLLMEvents(input, output, new LLMCtx());
      if (!ok) {
        ctx.error = output.error;
        return { ok: false, verdict: LoopStopReason.Error, error: output.error };
      }
      return this.fillTurnResult(output);
    } catch (err) {
      if (err instanceof AbortedError) {
        return { ok: false, verdict: LoopStopReason.Aborted, error: err.message };
      }
      throw err;
    }
  }

  /** 单轮结果组装（数据处理） */
  private fillTurnResult(output: ExecLLMEventsOutput): LLMTurnResult {
    return {
      ok: true,
      text: output.result,
      reasoning: output.reasoning,
      finishReason: output.finish_reason,
      toolCalls: output.tool_calls,
      inputTokens: output.input_tokens,
      outputTokens: output.output_tokens,
    };
  }

  /** LLM 入参组装（逻辑控制；finalTurn 收掉工具） */
  private async prepareLLMTurnInput(ctx: LoopRunContext): Promise<ExecLLMEventsInput> {
    const input = new ExecLLMEventsInput();
    input.id = ctx.llmId ?? '';
    input.system = ctx.system;
    input.messages = await this.prepareModelMessages(ctx.sessionId);
    if (!ctx.finalTurn) {
      input.tools = ctx.specs.map((spec) => ({
        tool_id: spec.id,
        description: spec.description,
        parameters: spec.parameters,
      }));
      input.tool_choice = 'auto';
    }
    input.temperature = ctx.temperature;
    input.max_tokens = ctx.maxTokens;
    input.idle_watchdog_ms = ctx.idleWatchdogMs;
    input.signal = ctx.controller.signal;
    input.on_event = (event) => this.streamHandler(ctx, event);
    // 过程可观测：当轮上下文构建完成（wire 消息即当轮 prompt 输入侧）
    const round = ctx.iterations + 1;
    ctx.report?.pushBusinessEvent(BusinessEvent.ContextBuilt, {
      round,
      message_count: input.messages.length,
      messages: input.messages.map((m) => ({
        role: m.role,
        content: String(m.content ?? '').slice(0, 4000),
        tool_calls: m.tool_calls?.map((t) => t.function.name),
      })),
    });
    return input;
  }

  /** 流事件 → part.delta 合帧缓冲（逻辑控制；Part 在 turn 完成时持久化） */
  private streamHandler(ctx: LoopRunContext, event: LLMEvent): void {
    if (event.type === 'reasoning_delta') {
      this.bufferDelta(ctx, 'reasoning', event.delta);
      return;
    }
    if (event.type === 'text_delta') {
      this.bufferDelta(ctx, 'text', event.delta);
    }
  }

  /** delta 入缓冲并调度合帧（逻辑控制；50ms 内多条 delta 合并为一条较大 delta） */
  private bufferDelta(ctx: LoopRunContext, field: 'text' | 'reasoning', delta: string): void {
    ctx.deltaBuffer[field] += delta;
    if (!ctx.deltaBuffer.timer) {
      ctx.deltaBuffer.timer = setTimeout(() => this.flushDeltaBuffer(ctx), DELTA_FLUSH_MS);
    }
  }

  /** 刷新合帧缓冲（逻辑控制；turn 完成/结算时同步调用，timer 清理） */
  private flushDeltaBuffer(ctx: LoopRunContext): void {
    if (ctx.deltaBuffer.timer) {
      clearTimeout(ctx.deltaBuffer.timer);
      ctx.deltaBuffer.timer = undefined;
    }
    for (const field of ['reasoning', 'text'] as const) {
      const buffered = ctx.deltaBuffer[field];
      if (!buffered) {
        continue;
      }
      ctx.deltaBuffer[field] = '';
      this.publishPartDelta(ctx, field, buffered);
    }
  }

  /** part.delta 事件发布（数据处理；投递失败记录告警，不中断流处理） */
  private publishPartDelta(ctx: LoopRunContext, field: 'text' | 'reasoning', delta: string): void {
    const event = field === 'text' ? BusinessEvent.ReplyDelta : BusinessEvent.ThinkDelta;
    ctx.report?.pushBusinessEvent(event, { delta });
  }

  // -------------------------------------------------------------------------
  // 持久化派生（消息中心）
  // -------------------------------------------------------------------------

  /** 会话持久化消息 → wire 消息（逻辑控制；Part 派生） */
  private async prepareModelMessages(sessionId: string): Promise<LLMMessage[]> {
    const soIn = new SoMessagesInput();
    soIn.session_id = sessionId;
    soIn.limit = LOOP_MESSAGE_LIMIT;
    const soOut = new SoMessagesOutput();
    await this.session.soMessages(soIn, soOut, new SessionCtx());
    const wire: LLMMessage[] = [];
    for (const message of soOut.messages) {
      if (message.role === MessageRole.User) {
        wire.push({ role: 'user', content: message.content });
      } else {
        this.assistantToWire(message, wire);
      }
    }
    return wire;
  }

  /** assistant 消息 → wire 消息（数据处理；toolCalls + 配对 tool 结果） */
  private assistantToWire(message: MessageWithParts, wire: LLMMessage[]): void {
    const toolParts = message.parts.filter((p) => p.part_type === PartType.Tool);
    const text = message.parts.find((p) => p.part_type === PartType.Text)?.content ?? message.content;
    const toolCalls = toolParts
      .map((p) => this.toWireToolCall(p))
      .filter((c): c is WireToolCall => Boolean(c));
    if (toolCalls.length) {
      wire.push({ role: 'assistant', content: text, tool_calls: toolCalls });
    } else if (text) {
      wire.push({ role: 'assistant', content: text });
    }
    for (const part of toolParts) {
      wire.push(this.toToolResultMessage(part));
    }
  }

  /** tool Part → wire tool_call（数据处理；缺 tool_call_id 视为损坏不派生） */
  private toWireToolCall(part: PartRecord): WireToolCall | null {
    const meta = this.parseToolMeta(part.input_json);
    if (!meta.tool_call_id) {
      return null;
    }
    return {
      id: meta.tool_call_id,
      type: 'function',
      function: { name: part.tool_id ?? '', arguments: meta.arguments ?? '{}' },
    };
  }

  /** tool Part → wire tool 结果消息（数据处理） */
  private toToolResultMessage(part: PartRecord): LLMMessage {
    const meta = this.parseToolMeta(part.input_json);
    return {
      role: 'tool',
      tool_call_id: meta.tool_call_id ?? part.id,
      content: part.output_json || part.content || '（工具无输出）',
    };
  }

  /** 持久化 assistant 轮（逻辑控制）：消息 + reasoning/text/tool Parts + 事件 */
  private async persistAssistantTurn(ctx: LoopRunContext, turn: LLMTurnResult): Promise<void> {
    ctx.iterations += 1;
    ctx.inputTokens += turn.inputTokens ?? 0;
    ctx.outputTokens += turn.outputTokens ?? 0;
    const messageOut = new AddMessageOutput();
    const add = new AddMessageInput();
    add.session_id = ctx.sessionId;
    add.role = MessageRole.Assistant;
    add.content = turn.text ?? '';
    add.run_id = ctx.runId;
    add.token_count = turn.outputTokens;
    await this.session.addMessage(add, messageOut, new SessionCtx());
    ctx.lastMessageId = messageOut.message_id;
    await this.persistTurnParts(ctx, messageOut.message_id, turn);
  }

  /** 持久化轮内 Parts（逻辑控制）：reasoning/text 直存；tool pending 待配对 */
  private async persistTurnParts(ctx: LoopRunContext, messageId: string, turn: LLMTurnResult): Promise<void> {
    if (turn.reasoning) {
      await this.addTurnPart(ctx, messageId, PartType.Reasoning, turn.reasoning);
    }
    if (turn.text) {
      await this.addTurnPart(ctx, messageId, PartType.Text, turn.text);
    }
    for (const call of turn.toolCalls ?? []) {
      await this.addToolPart(ctx, messageId, call);
    }
  }

  /** 新增 Part 并发布 part.created（逻辑控制） */
  private async addTurnPart(ctx: LoopRunContext, messageId: string, partType: PartType, content: string): Promise<void> {
    const input = new AddPartInput();
    input.message_id = messageId;
    input.run_id = ctx.runId;
    input.part_type = partType;
    input.content = content;
    const output = new AddPartOutput();
    await this.session.addPart(input, output, new SessionCtx());
    await this.publishPartCreated(ctx, messageId, output.part_id, partType);
  }

  /** 新增 tool Part（input_json = {tool_call_id, arguments}）并发布事件（逻辑控制） */
  private async addToolPart(ctx: LoopRunContext, messageId: string, call: ParsedToolCall): Promise<void> {
    const input = new AddPartInput();
    input.message_id = messageId;
    input.run_id = ctx.runId;
    input.part_type = PartType.Tool;
    input.tool_id = call.tool_id;
    input.input_json = JSON.stringify({ tool_call_id: call.id, arguments: call.arguments });
    const output = new AddPartOutput();
    await this.session.addPart(input, output, new SessionCtx());
    await this.publishPartCreated(ctx, messageId, output.part_id, PartType.Tool, call.tool_id);
  }

  // -------------------------------------------------------------------------
  // 工具消费
  // -------------------------------------------------------------------------

  /** 顺序执行本轮 tool_calls（逻辑控制；配对结果回流；权限门：执行前询问） */
  private async consumeToolCalls(ctx: LoopRunContext, toolCalls: ParsedToolCall[]): Promise<void> {
    for (const call of toolCalls) {
      const part = await this.soToolPart(ctx, call);
      if (!part) {
        continue;
      }
      const approved = await this.askPermission(ctx, call);
      if (!approved) {
        await this.completeToolPart(ctx, part.id, call, {
          status: 'error',
          output: `工具 ${call.tool_id} 被用户拒绝执行（permission denied）`,
        });
        continue;
      }
      await this.markPartRunning(ctx, part.id, call);
      const result = await this.execLoopTool(ctx, call);
      await this.completeToolPart(ctx, part.id, call, result);
    }
  }

  /** 权限询问（逻辑控制）：permission.asked 经 Report 下发，挂起等待 answerPermission 应答 */
  private async askPermission(ctx: LoopRunContext, call: ParsedToolCall): Promise<boolean> {
    if (!this.permissionGate) {
      return true;
    }
    const permissionId = IdGenerator.generate();
    ctx.report?.pushBusinessEvent(BusinessEvent.PermissionAsked, {
      permission_id: permissionId,
      tool_id: call.tool_id,
      input: call.arguments,
      run_id: ctx.runId,
    });
    const result = await this.permissionGate.wait({ permission_id: permissionId });
    return result.approved;
  }

  /** 查询本轮 tool Part（逻辑控制；按 message + tool_call_id 匹配） */
  private async soToolPart(ctx: LoopRunContext, call: ParsedToolCall): Promise<PartRecord | null> {
    if (!ctx.lastMessageId) {
      return null;
    }
    const soIn = new SoMessagesInput();
    soIn.session_id = ctx.sessionId;
    soIn.limit = LOOP_MESSAGE_LIMIT;
    const soOut = new SoMessagesOutput();
    await this.session.soMessages(soIn, soOut, new SessionCtx());
    const message = soOut.messages.find((m) => m.id === ctx.lastMessageId);
    const found = message?.parts.find((p) => {
      if (p.part_type !== PartType.Tool || p.tool_id !== call.tool_id) {
        return false;
      }
      return this.parseToolMeta(p.input_json).tool_call_id === call.id;
    });
    return found ?? null;
  }

  /** tool Part input_json 元数据解析（数据处理） */
  private parseToolMeta(inputJson?: string): { tool_call_id?: string; arguments?: string } {
    try {
      return JSON.parse(inputJson || '{}');
    } catch {
      return {};
    }
  }

  /** 标记 tool Part running 并发布 tool.launch（逻辑控制） */
  private async markPartRunning(ctx: LoopRunContext, partId: string, call: ParsedToolCall): Promise<void> {
    const upd = new UpdatePartInput();
    upd.part_id = partId;
    upd.status = PartStatus.Running;
    await this.session.updatePart(upd, new UpdatePartOutput(), new SessionCtx());
    ctx.report?.pushBusinessEvent(BusinessEvent.ToolStarted, { part_id: partId, tool_id: call.tool_id, input: call.arguments });
  }

  /** 执行工具（逻辑控制；execTool 配对结果语义） */
  private async execLoopTool(ctx: LoopRunContext, call: ParsedToolCall): Promise<{ status: string; output: string; elapsed_ms?: number }> {
    const input = new ExecToolInput();
    input.tool_id = call.tool_id;
    input.raw_args = call.arguments;
    input.run_id = ctx.runId;
    input.session_key = ctx.sessionKey;
    input.signal = ctx.controller.signal;
    // 工具的业务事件出口：经 Report→StreamProvider（保存/审计/投递）
    input.emitEvent = (type: string, payload: unknown) => {
      ctx.report?.pushBusinessEvent(type as never, { run_id: ctx.runId, ...(typeof payload === 'object' && payload ? payload : {}) });
    };
    const output = new ExecToolOutput();
    await this.tool.execTool(input, output, new ToolCtx());
    return output.result;
  }

  /** 完成配对：Part 状态机 + tool.result 事件（逻辑控制） */
  private async completeToolPart(ctx: LoopRunContext, partId: string, call: ParsedToolCall, result: { status: string; output: string; elapsed_ms?: number },
  ): Promise<void> {
    const upd = new UpdatePartInput();
    upd.part_id = partId;
    upd.status = result.status === 'ok' ? PartStatus.Completed : PartStatus.Error;
    upd.output_json = result.output;
    upd.elapsed_ms = result.elapsed_ms;
    await this.session.updatePart(upd, new UpdatePartOutput(), new SessionCtx());
    ctx.report?.pushBusinessEvent(BusinessEvent.ToolResult, { part_id: partId, tool_id: call.tool_id, status: result.status, output: result.output, elapsed_ms: result.elapsed_ms });
  }

  // -------------------------------------------------------------------------
  // 事件与收尾
  // -------------------------------------------------------------------------

  /** 发布 part.created（逻辑控制） */
  private async publishPartCreated(ctx: LoopRunContext, messageId: string, partId: string, partType: PartType, _toolId?: string): Promise<void> {
    if (partType === PartType.Text) {
      ctx.report?.pushBusinessEvent(BusinessEvent.ReplyCreated, { message_id: messageId, part_id: partId });
    } else if (partType === PartType.Reasoning) {
      ctx.report?.pushBusinessEvent(BusinessEvent.ThinkCreated, { message_id: messageId, part_id: partId });
    }
    // tool Part 不发 created（由 tool.started 表达执行生命周期）
  }

  /** 发布 run 生命周期事件（逻辑控制）：started/finished/failed 三态 */
  private async publishRunStatus(target: { runId: string; sessionKey: string; report?: Report }, phase: RunPhase, stopReason?: LoopStopReason): Promise<void> {
    const payload = { stop_reason: stopReason };
    const event = phase === RunPhase.Start ? BusinessEvent.RunStarted
      : phase === RunPhase.End ? BusinessEvent.RunFinished
      : BusinessEvent.RunFailed;
    target.report?.pushBusinessEvent(event, payload);
  }

  /** 出参组装（数据处理） */
  private fillLoopOutput(output: ExecAgentLoopOutput, ctx: LoopRunContext): void {
    output.stop_reason = ctx.stopReason;
    output.result = ctx.result;
    output.iterations = ctx.iterations;
    output.token_usage = { input_tokens: ctx.inputTokens, output_tokens: ctx.outputTokens };
    output.message_id = ctx.lastMessageId;
    output.error = ctx.error;
  }

  /** 收尾（逻辑控制）：刷新缓冲 + 注销 run controller + run.status 结算事件 */
  private async settleLoop(ctx: LoopRunContext): Promise<void> {
    this.flushDeltaBuffer(ctx);
    this.runControllers.delete(ctx.runId);
    const phase = ctx.stopReason === LoopStopReason.Stop ? RunPhase.End : RunPhase.Error;
    try {
      await this.publishRunStatus(ctx, phase, ctx.stopReason);
    } catch (err) {
      ctx.metrics?.warn?.('run.status 结算事件发布失败（不掩盖业务结果）', {
        run_id: ctx.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // -------------------------------------------------------------------------
  // abortLoopTurn / configLoop
  // -------------------------------------------------------------------------

  /** 类型化取消活动 run（逻辑控制；幂等） */
  async abortLoopTurn(input: AbortLoopTurnInput, output: AbortLoopTurnOutput, _context: LoopContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const controller = this.runControllers.get(input.run_id);
    if (!controller) {
      output.signalled = false;
      return true;
    }
    controller.abort(input.reason);
    output.signalled = true;
    return true;
  }

  /** 模块配置（逻辑控制） */
  async configLoop(input: ConfigLoopInput, _output: ConfigLoopOutput, _context: LoopContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.enabled !== undefined) {
      this.enabled = input.enabled;
    }
    if (input.default_budget_total !== undefined) {
      this.defaultBudgetTotal = input.default_budget_total;
    }
    return true;
  }
}

/** 上下文别名简写（避免每处 new 完整类名） */
class SessionCtx extends SessionContext {}
class LLMCtx extends LLMContext {}
class ToolCtx extends ToolContext {}

/** wire 侧工具调用（LLMMessage.tool_calls 元素） */
interface WireToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
