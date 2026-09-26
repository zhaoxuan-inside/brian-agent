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
import type { SkillSpecJson } from '../../SkillRuntime';
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
import type { SkillRuntimeAccess } from '../../SkillRuntime';
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
  ExecSkillInput,
  ExecSkillOutput,
  SoSkillsInput,
  SoSkillsOutput,
  SkillRuntimeContext,
  RegisterRunSkillsInput,
  RegisterSkillsOutput,
  ClearRunSkillsInput,
} from '../../SkillRuntime';

const LOOP_MESSAGE_LIMIT = 100;

const DELTA_FLUSH_MS = 50;

interface LoopRunContext {
  runId: string;
  sessionKey: string;
  sessionId: string;

  workId?: string;
  system?: string;
  llmId?: string;
  temperature?: number;
  maxTokens?: number;
  idleWatchdogMs?: number;
  budget: IterationBudget;
  controller: AbortController;
  specs: SkillSpecJson[];

  componentScope?: { skills: string[]; mcps: string[] };
  stopReason: LoopStopReason;
  result: string;
  error?: string;
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  lastMessageId?: string;
  finalTurn: boolean;
  deferFinalReply: boolean;

  thoughtMode?: string;

  report?: Report;

  metrics?: Metrics;

  permissionGate?: { wait(input: { permission_id: string; tool_id?: string }): Promise<{ approved: boolean; autoApproved?: boolean }> };

  deltaBuffer: { text: string; reasoning: string; timer?: ReturnType<typeof setTimeout> };
}

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

export interface PermissionAudit {

  asked(input: {
    permission_id: string;
    session_id: string;
    session_key: string;
    run_id: string;
    tool_id: string;
    arguments_json: string;
    asked_at: number;
  }): Promise<void>;

  answered(input: { permission_id: string; approved: boolean; answered_at: number }): Promise<void>;
}

export class AgentLoopService {
  private enabled = true;
  private defaultBudgetTotal = DEFAULT_BUDGET_TOTAL;
  private readonly runControllers = new Map<string, AbortController>();

  constructor(
    private readonly llm: LLMAccess,
    private readonly session: SessionAccess,
    private readonly skillRuntime: SkillRuntimeAccess,
    private readonly logger?: Logger,

    private readonly queue?: LoopQueue,

    private readonly permissionGate?: { wait(input: { permission_id: string; tool_id?: string }): Promise<{ approved: boolean; autoApproved?: boolean }> },

    private readonly permissionAudit?: PermissionAudit,
  ) {}

  async initialize(): Promise<void> {
    this.logger?.debug?.('AgentLoopService 初始化完成');
  }

  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new ValidationError('Loop 组件未启用，请先通过 configLoop 启用');
    }
  }

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

  private validateLoopInput(input: ExecAgentLoopInput): void {
    if (!input.run_id || !input.session_key || !input.session_id || !input.user_message) {
      throw new ValidationError('run_id/session_key/session_id/user_message 不能为空');
    }
  }

  private async prepareLoopContext(input: ExecAgentLoopInput, metrics?: Metrics, report?: Report): Promise<LoopRunContext> {
    const budget = new IterationBudget(input.budget ?? { total: this.defaultBudgetTotal });
    const controller = new AbortController();
    this.runControllers.set(input.run_id, controller);
    try {
      this.wireExternalSignal(input, controller);

      await this.registerRunSkills(input, metrics);
      const specs = await this.soLoopSkillSpecs(input.skills, input.run_id, metrics);
      await this.persistUserMessage(input, metrics);
      await this.publishRunStatus({ runId: input.run_id, sessionKey: input.session_key, report }, RunPhase.Start);
      return this.prepareContextFields(input, budget, controller, specs, metrics, report);
    } catch (err) {
      this.runControllers.delete(input.run_id);
      throw err;
    }
  }

  private prepareContextFields(
    input: ExecAgentLoopInput,
    budget: IterationBudget,
    controller: AbortController,
    specs: SkillSpecJson[],
    metrics?: Metrics,
    report?: Report,
  ): LoopRunContext {
    return {
      runId: input.run_id,
      sessionKey: input.session_key,
      sessionId: input.session_id,
      workId: input.work_id || input.run_id,
      system: input.system,
      llmId: input.llm_id || undefined,
      temperature: input.temperature,
      maxTokens: input.max_tokens,
      idleWatchdogMs: input.idle_watchdog_ms,
      budget,
      controller,
      specs,
      componentScope: input.component_scope,
      stopReason: LoopStopReason.Stop,
      result: '',
      iterations: 0,
      inputTokens: 0,
      outputTokens: 0,
      finalTurn: false,
      deferFinalReply: input.defer_final_reply === true,
      thoughtMode: input.thought_mode,
      metrics,
      report,
      deltaBuffer: { text: '', reasoning: '' },
    };
  }

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

  private async persistUserMessage(input: ExecAgentLoopInput, metrics?: Metrics): Promise<void> {
    const add = new AddMessageInput();
    add.session_id = input.session_id;
    add.role = MessageRole.User;
    add.content = input.user_message;
    add.run_id = input.run_id;
    await this.session.addMessage(add, new AddMessageOutput(), new SessionCtx(), metrics);
  }

  private async soLoopSkillSpecs(skillIds: string[] | undefined, runId: string, metrics?: Metrics): Promise<SkillSpecJson[]> {
    const soIn = new SoSkillsInput();
    soIn.skill_ids = skillIds;
    soIn.run_id = runId;
    const soOut = new SoSkillsOutput();
    await this.skillRuntime.soSkills(soIn, soOut, new ToolCtx(), metrics);
    return soOut.specs;
  }

  private async registerRunSkills(input: ExecAgentLoopInput, metrics?: Metrics): Promise<void> {
    const skillIds = (input.component_scope?.skills ?? []).filter(Boolean);
    try {
      await this.skillRuntime.registerRunSkills(
        Object.assign(new RegisterRunSkillsInput(), { run_id: input.run_id, skill_ids: skillIds }),
        new RegisterSkillsOutput(),
        new ToolCtx(),
        metrics,
      );
    } catch (err) {
      this.logger?.warn?.('run 级 Skill 工具注册失败（该 run 的 Skill 不入工具清单）', {
        run_id: input.run_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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

  private async persistInjectedMessages(ctx: LoopRunContext, messages: string[]): Promise<void> {
    for (const message of messages) {
      const add = new AddMessageInput();
      add.session_id = ctx.sessionId;
      add.role = MessageRole.User;
      add.content = message;
      add.run_id = ctx.runId;
      await this.session.addMessage(add, new AddMessageOutput(), new SessionCtx(), ctx.metrics);
    }
  }

  private async runInnerLoop(ctx: LoopRunContext): Promise<LoopStopReason> {
    for (;;) {
      const verdict = await this.runInnerTurn(ctx);
      if (verdict !== 'continue') {
        return verdict;
      }
    }
  }

  private consumeBudget(ctx: LoopRunContext): { stop: boolean; reason?: LoopStopReason; finalTurn: boolean } {
    if (!ctx.budget.consume()) {
      return { stop: true, reason: LoopStopReason.Budget, finalTurn: false };
    }
    const finalTurn = !ctx.budget.graceAvailable && ctx.budget.remaining === 0;
    return { stop: false, finalTurn };
  }

  private async runInnerTurn(ctx: LoopRunContext): Promise<'continue' | LoopStopReason> {
    const round = ctx.iterations + 1;
    const steered = this.queue?.drainSteering(ctx.sessionKey) ?? [];
    if (steered.length) {
      await this.persistInjectedMessages(ctx, steered);
    }
    const gate = this.consumeBudget(ctx);
    if (gate.stop) {
      this.emitLoopTurnResult(ctx, round, 'none', '', [], 'budget', `预算耗尽（remaining=${ctx.budget.remaining}，无宽限），停止执行`);
      return gate.reason ?? LoopStopReason.Budget;
    }
    ctx.finalTurn = gate.finalTurn;
    ctx.report?.pushBusinessEvent(BusinessEvent.LoopTurnStarted, {
      round,
      thought_mode: ctx.thoughtMode ?? '',
      final_turn: ctx.finalTurn,
      base_context: 'static-memory + soul + identity system（不变块）',
    });
    const turn = await this.callLLMTurn(ctx);
    if (!turn.ok) {

      this.logger?.warn?.('Agent 循环单轮执行失败', {
        run_id: ctx.runId,
        session_key: ctx.sessionKey,
        round: ctx.iterations + 1,
        stop_reason: turn.verdict,
        error: turn.error,
        input_tokens: turn.inputTokens,
        output_tokens: turn.outputTokens,
      });
      this.flushDeltaBuffer(ctx, 'think');
      this.emitLoopTurnResult(ctx, round, 'none', '', [], 'error', turn.error ?? '本轮 LLM 调用失败，停止执行');
      return turn.verdict ?? LoopStopReason.Error;
    }

    this.flushDeltaBuffer(ctx, 'think');
    await this.persistAssistantTurn(ctx, turn);
    const toolNames = (turn.toolCalls ?? []).map((c) => c.tool_id);
    const decision = turn.finishReason === 'tool-calls' ? 'continue' : 'stop';

    const decisionReason = turn.finishReason === 'tool-calls'
      ? `本轮发起了 ${toolNames.length} 个技能调用，需观察技能结果后再决策，继续下一轮`
      : turn.finishReason === 'error'
        ? 'LLM 流异常终止（未收到结束帧）'
        : '本轮无需调用技能（finish_reason=stop），Agent 结论已产出，收敛结束';
    this.emitLoopTurnResult(ctx, round, String(turn.finishReason ?? ''), turn.text ?? '', toolNames, decision, decisionReason);
    if (turn.finishReason !== 'tool-calls') {
      if (turn.finishReason !== 'error' && turn.text) {
        if (!ctx.deferFinalReply) {
          ctx.report?.pushBusinessEvent(BusinessEvent.ReplyDelta, { delta: turn.text });
        }
      }
      ctx.result = turn.text ?? '';

      if (turn.finishReason === 'error') {
        ctx.error = ctx.error ?? 'LLM 流异常终止（未收到结束帧）';
        return LoopStopReason.Error;
      }
      return LoopStopReason.Stop;
    }
    await this.consumeToolCalls(ctx, turn.toolCalls ?? []);
    return 'continue';
  }

  private emitLoopTurnResult(
    ctx: LoopRunContext,
    round: number,
    finishReason: string,
    text: string,
    toolCalls: string[],
    nextAction: 'continue' | 'stop' | 'error' | 'budget',
    reason: string,
  ): void {
    ctx.report?.pushBusinessEvent(BusinessEvent.LoopTurnResult, {
      round,
      thought_mode: ctx.thoughtMode ?? '',
      finish_reason: finishReason,
      result_preview: text.slice(0, 300),
      result_length: text.length,
      tool_calls: toolCalls.slice(0, 10),
      next_action: nextAction,
      decision_reason: reason.slice(0, 300),
      context_note: '本轮上下文见同轮 context.built（基础上下文 + 会话新增消息）',
    });
  }

  private async callLLMTurn(ctx: LoopRunContext): Promise<LLMTurnResult> {
    const input = await this.prepareLLMTurnInput(ctx);
    const output = new ExecLLMEventsOutput();
    try {
      const ok = await this.llm.execLLMEvents(input, output, new LLMCtx(), ctx.metrics);
      if (!ok) {
        ctx.error = output.error;
        return { ok: false, verdict: LoopStopReason.Error, error: output.error };
      }

      const turnResult = this.fillTurnResult(output);
      ctx.report?.pushBusinessEvent(BusinessEvent.LoopTurnCompleted, {
        round: ctx.iterations + 1,
      });
      return turnResult;
    } catch (err) {
      if (err instanceof AbortedError) {
        this.logger?.warn?.('LLM 调用被中止（AbortedError）', {
          run_id: ctx.runId,
          session_key: ctx.sessionKey,
          round: ctx.iterations + 1,
          error: err.message,
        });
        return { ok: false, verdict: LoopStopReason.Aborted, error: err.message };
      }
      throw err;
    }
  }

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

  private async prepareLLMTurnInput(ctx: LoopRunContext): Promise<ExecLLMEventsInput> {
    const input = new ExecLLMEventsInput();
    input.id = ctx.llmId ?? '';
    input.session_id = ctx.sessionKey;
    input.run_id = ctx.runId;
    input.work_id = ctx.workId;
    input.caller = 'AgentLoopService.callLLMTurn';
    input.system = ctx.system;
    const ctxSpan = ctx.metrics ? ctx.metrics.beginSpan('Runtime.Loop.AgentLoopService.prepareModelMessages') : undefined;
    input.messages = await this.prepareModelMessages(ctx.sessionId, ctx.metrics);
    if (ctx.metrics && ctxSpan) ctx.metrics.endSpan(ctxSpan);
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

    const round = ctx.iterations + 1;
    ctx.report?.pushBusinessEvent(BusinessEvent.ContextBuilt, {
      round,
      thought_mode: ctx.thoughtMode ?? '',
      message_count: input.messages.length,
      system: String(ctx.system ?? '').slice(0, 4000),
      messages: input.messages.map((m) => ({
        role: m.role,
        content: String(m.content ?? '').slice(0, 4000),
        tool_calls: m.tool_calls?.map((t) => t.function.name),
      })),
    });
    return input;
  }

  private streamHandler(ctx: LoopRunContext, event: LLMEvent): void {
    if (event.type === 'reasoning_delta') {
      this.bufferDelta(ctx, 'reasoning', event.delta);
      return;
    }
    if (event.type === 'text_delta') {
      this.bufferDelta(ctx, 'text', event.delta);
    }
  }

  private bufferDelta(ctx: LoopRunContext, field: 'text' | 'reasoning', delta: string): void {
    ctx.deltaBuffer[field] += delta;
    if (!ctx.deltaBuffer.timer) {

      ctx.deltaBuffer.timer = setTimeout(() => this.flushDeltaBuffer(ctx, 'think'), DELTA_FLUSH_MS);
    }
  }

  private flushDeltaBuffer(ctx: LoopRunContext, textAs: 'reply' | 'think' = 'reply'): void {
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
      this.publishPartDelta(ctx, field, buffered, textAs);
    }
  }

  private publishPartDelta(ctx: LoopRunContext, field: 'text' | 'reasoning', delta: string, textAs: 'reply' | 'think' = 'reply'): void {

    const event = field === 'text' && textAs === 'reply' ? BusinessEvent.ReplyDelta : BusinessEvent.ThinkDelta;
    ctx.report?.pushBusinessEvent(event, { delta });
  }

  private async prepareModelMessages(sessionId: string, metrics?: Metrics): Promise<LLMMessage[]> {
    const soIn = new SoMessagesInput();
    soIn.session_id = sessionId;
    soIn.limit = LOOP_MESSAGE_LIMIT;
    const soOut = new SoMessagesOutput();
    await this.session.soMessages(soIn, soOut, new SessionCtx(), metrics);
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

  private assistantToWire(message: MessageWithParts, wire: LLMMessage[]): void {
    const toolParts = message.parts.filter((p) => p.part_type === PartType.Tool);
    const text = message.parts.find((p) => p.part_type === PartType.Text)?.content ?? message.content;
    const toolCalls = toolParts
      .map((p) => this.toWireSkillCall(p))
      .filter((c): c is WireSkillCall => Boolean(c));
    if (toolCalls.length) {
      wire.push({ role: 'assistant', content: text, tool_calls: toolCalls });
    } else if (text) {
      wire.push({ role: 'assistant', content: text });
    }
    for (const part of toolParts) {
      wire.push(this.toSkillResultMessage(part));
    }
  }

  private toWireSkillCall(part: PartRecord): WireSkillCall | null {
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

  private toSkillResultMessage(part: PartRecord): LLMMessage {
    const meta = this.parseToolMeta(part.input_json);
    return {
      role: 'tool',
      tool_call_id: meta.tool_call_id ?? part.id,
      content: part.output_json || part.content || '（工具无输出）',
    };
  }

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
    await this.session.addMessage(add, messageOut, new SessionCtx(), ctx.metrics);
    ctx.lastMessageId = messageOut.msg_id;
    await this.persistTurnParts(ctx, messageOut.msg_id, turn);
  }

  private async persistTurnParts(ctx: LoopRunContext, messageId: string, turn: LLMTurnResult): Promise<void> {
    if (turn.reasoning) {
      await this.addTurnPart(ctx, messageId, PartType.Reasoning, turn.reasoning);
    }
    if (turn.text) {
      await this.addTurnPart(ctx, messageId, PartType.Text, turn.text);
    }
    for (const call of turn.toolCalls ?? []) {
      await this.addSkillPart(ctx, messageId, call);
    }
  }

  private async addTurnPart(ctx: LoopRunContext, messageId: string, partType: PartType, content: string): Promise<void> {
    const input = new AddPartInput();
    input.msg_id = messageId;
    input.run_id = ctx.runId;
    input.part_type = partType;
    input.content = content;
    const output = new AddPartOutput();
    await this.session.addPart(input, output, new SessionCtx(), ctx.metrics);
    await this.publishPartCreated(ctx, messageId, output.part_id, partType);
    const upd = new UpdatePartInput();
    upd.part_id = output.part_id;
    upd.status = PartStatus.Completed;
    await this.session.updatePart(upd, new UpdatePartOutput(), new SessionCtx(), ctx.metrics);
  }

  private async addSkillPart(ctx: LoopRunContext, messageId: string, call: ParsedToolCall): Promise<void> {
    const input = new AddPartInput();
    input.msg_id = messageId;
    input.run_id = ctx.runId;
    input.part_type = PartType.Tool;
    input.tool_id = call.tool_id;
    input.input_json = JSON.stringify({ tool_call_id: call.id, arguments: call.arguments });
    const output = new AddPartOutput();
    await this.session.addPart(input, output, new SessionCtx(), ctx.metrics);
    await this.publishPartCreated(ctx, messageId, output.part_id, PartType.Tool, call.tool_id);
  }

  private async consumeToolCalls(ctx: LoopRunContext, toolCalls: ParsedToolCall[]): Promise<void> {
    for (const call of toolCalls) {
      const part = await this.soSkillPart(ctx, call);
      if (!part) {
        continue;
      }
      const approved = await this.askPermission(ctx, call);
      if (!approved) {
        await this.completeSkillPart(ctx, part.id, call, {
          status: 'error',
          output: `技能 ${call.tool_id} 被用户拒绝执行（permission denied）`,
        });
        continue;
      }
      await this.markPartRunning(ctx, part.id, call);
      const result = await this.execLoopSkill(ctx, call);
      await this.completeSkillPart(ctx, part.id, call, result);
    }
  }

  private async askPermission(ctx: LoopRunContext, call: ParsedToolCall): Promise<boolean> {
    if (!this.permissionGate) {
      return true;
    }
    const permissionId = IdGenerator.generate();

    ctx.report?.pushBusinessEvent(BusinessEvent.PermissionAsked, {
      permission_id: permissionId,
      skill_id: call.tool_id,
      tool_id: call.tool_id,
      input: call.arguments,
      run_id: ctx.runId,
    });
    await this.permissionAudit?.asked({
      permission_id: permissionId,
      session_id: ctx.sessionId,
      session_key: ctx.sessionKey,
      run_id: ctx.runId,
      tool_id: call.tool_id,
      arguments_json: call.arguments,
      asked_at: Date.now(),
    });
    const result = await this.permissionGate.wait({ permission_id: permissionId, tool_id: call.tool_id });
    ctx.report?.pushBusinessEvent(BusinessEvent.PermissionAnswered, {
      permission_id: permissionId,
      skill_id: call.tool_id,
      tool_id: call.tool_id,
      approved: result.approved,
      auto_approved: result.autoApproved === true,
      run_id: ctx.runId,
    });
    await this.permissionAudit?.answered({
      permission_id: permissionId,
      approved: result.approved,
      answered_at: Date.now(),
    });
    return result.approved;
  }

  private async soSkillPart(ctx: LoopRunContext, call: ParsedToolCall): Promise<PartRecord | null> {
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

  private parseToolMeta(inputJson?: string): { tool_call_id?: string; arguments?: string } {
    try {
      return JSON.parse(inputJson || '{}');
    } catch {
      return {};
    }
  }

  private async markPartRunning(ctx: LoopRunContext, partId: string, call: ParsedToolCall): Promise<void> {
    const upd = new UpdatePartInput();
    upd.part_id = partId;
    upd.status = PartStatus.Running;
    await this.session.updatePart(upd, new UpdatePartOutput(), new SessionCtx(), ctx.metrics);

    ctx.report?.pushBusinessEvent(BusinessEvent.SkillStarted, { part_id: partId, skill_id: call.tool_id, tool_id: call.tool_id, input: call.arguments });
  }

  private async execLoopSkill(ctx: LoopRunContext, call: ParsedToolCall): Promise<{ status: string; output: string; elapsed_ms?: number }> {
    const input = new ExecSkillInput();
    input.tool_id = call.tool_id;
    input.raw_args = call.arguments;
    input.run_id = ctx.runId;
    input.session_key = ctx.sessionKey;
    input.signal = ctx.controller.signal;
    input.component_scope = ctx.componentScope;

    input.emitEvent = (type: string, payload: unknown) => {
      ctx.report?.pushBusinessEvent(type as never, { run_id: ctx.runId, ...(typeof payload === 'object' && payload ? payload : {}) });
    };
    const output = new ExecSkillOutput();
    await this.skillRuntime.execSkill(input, output, new ToolCtx(), ctx.metrics, ctx.report);
    return output.result;
  }

  private async completeSkillPart(ctx: LoopRunContext, partId: string, call: ParsedToolCall, result: { status: string; output: string; elapsed_ms?: number },
  ): Promise<void> {
    const upd = new UpdatePartInput();
    upd.part_id = partId;
    upd.status = result.status === 'ok' ? PartStatus.Completed : PartStatus.Error;
    upd.output_json = result.output;
    upd.elapsed_ms = result.elapsed_ms;
    await this.session.updatePart(upd, new UpdatePartOutput(), new SessionCtx(), ctx.metrics);
    ctx.report?.pushBusinessEvent(BusinessEvent.SkillResult, { part_id: partId, skill_id: call.tool_id, tool_id: call.tool_id, status: result.status, output: result.output, elapsed_ms: result.elapsed_ms });
  }

  private async publishPartCreated(ctx: LoopRunContext, messageId: string, partId: string, partType: PartType, _toolId?: string): Promise<void> {
    if (partType === PartType.Text) {
      ctx.report?.pushBusinessEvent(BusinessEvent.ReplyCreated, { msg_id: messageId, part_id: partId });
    } else if (partType === PartType.Reasoning) {
      ctx.report?.pushBusinessEvent(BusinessEvent.ThinkCreated, { msg_id: messageId, part_id: partId });
    }

  }

  private async publishRunStatus(target: { runId: string; sessionKey: string; report?: Report }, phase: RunPhase, stopReason?: LoopStopReason): Promise<void> {
    const payload = { stop_reason: stopReason };
    const event = phase === RunPhase.Start ? BusinessEvent.RunStarted
      : phase === RunPhase.End ? BusinessEvent.RunFinished
      : BusinessEvent.RunFailed;
    target.report?.pushBusinessEvent(event, payload);
  }

  private fillLoopOutput(output: ExecAgentLoopOutput, ctx: LoopRunContext): void {
    output.stop_reason = ctx.stopReason;
    output.result = ctx.result;
    output.iterations = ctx.iterations;
    output.token_usage = { input_tokens: ctx.inputTokens, output_tokens: ctx.outputTokens };
    output.msg_id = ctx.lastMessageId;
    output.error = ctx.error;
    output.work_id = ctx.workId;
  }

  private async settleLoop(ctx: LoopRunContext): Promise<void> {
    this.flushDeltaBuffer(ctx);

    try {
      await this.skillRuntime.clearRunSkills(
        Object.assign(new ClearRunSkillsInput(), { run_id: ctx.runId }),
        new ToolCtx(),
      );
    } catch {

    }
    this.runControllers.delete(ctx.runId);
    const phase = ctx.stopReason === LoopStopReason.Stop ? RunPhase.End : RunPhase.Error;
    if (phase === RunPhase.Error) {
      this.logger?.warn?.('Agent 循环异常结束', {
        run_id: ctx.runId,
        session_key: ctx.sessionKey,
        stop_reason: ctx.stopReason,
        iterations: ctx.iterations,
        error: ctx.error,
        input_tokens: ctx.inputTokens,
        output_tokens: ctx.outputTokens,
      });
    }

    if (ctx.deferFinalReply && phase === RunPhase.End) {
      return;
    }
    try {
      await this.publishRunStatus(ctx, phase, ctx.stopReason);
    } catch (err) {
      ctx.metrics?.warn?.('run.status 结算事件发布失败（不掩盖业务结果）', {
        run_id: ctx.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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

class SessionCtx extends SessionContext {}
class LLMCtx extends LLMContext {}
class ToolCtx extends SkillRuntimeContext {}

interface WireSkillCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
