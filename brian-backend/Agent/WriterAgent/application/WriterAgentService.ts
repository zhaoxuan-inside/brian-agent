import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { BusinessEvent, Metrics, Report } from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError,
  ExecLLMInput, ExecLLMOutput, ExecLLMEventsInput, ExecLLMEventsOutput, type LLMEvent,
  LLMContext, PromptContext, SoPromptInput, SoPromptOutput,
  GetSoulInput, GetSoulOutput, SoulContext, HandleResultType, type DataObject,
} from '@brian-agent/base';
import type { SoulAccess, StreamAccess } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import { ContextInfoInput, ContextInfoOutput, InfoCoreContext } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import {
  WRITER_AGENT_CONFIG_TABLE, WRITER_AGENT_USER_PROFILE_TABLE,
  type WriterAgentConfigRecord, type WriterAgentUserProfileRecord,
  WriterAgentContext,
  WriteInput, WriteOutput,
  SaveUserProfileInput, SaveUserProfileOutput,
  GetUserProfileInput, GetUserProfileOutput,
  ConfigWriterAgentInput, ConfigWriterAgentOutput,
  type Block, type BlockMeta,
} from '../domain/types';
import {
  BuildSystemAgentInput, BuildSystemAgentOutput, AgentBuilderContext,
} from '../../AgentBuilder/domain/types';
import {
  GetAgentInput, GetAgentOutput, RecordAgentUsageInput, RecordAgentUsageOutput,
  AgentLibraryContext, type AgentRecord,
} from '../../AgentLibrary/domain/types';
import { formatContextCategories } from '@brian-agent/base';
import {
  buildWriterResultsContext, cleanFallbackResults, formatAgentResult,
  type WriterResultsContext,
} from '../domain/services/WriterDomainService';
import { TraceStore } from '../../AgentExecution/application/trace/TraceStore';
import { buildSingleAnswerTrace } from '../../AgentExecution/application/trace/TraceCodec';
import { renderPromptWithFallback, resolveAgentLlm } from '../../shared/AgentKit';

const FORMAT_ENUM = ['TEXT', 'MARKDOWN', 'JSON'];
const STYLE_ENUM = ['clear', 'concise', 'detailed', 'creative'];
const DEPTH_ENUM = ['shallow', 'medium', 'deep'];
const LANGUAGE_ENUM = ['zh-CN', 'en-US'];


const WRITER_THINKING_DISABLED = { thinking: { type: 'disabled' }, enable_thinking: false } as const;

type WriterPreferences = NonNullable<WriteInput['user_preferences']>;

interface PreparedWriterAgent {
  agentId: string;
  agent: AgentRecord | undefined;
  libCtx: AgentLibraryContext;
}

export class WriterAgentService {
  private readonly traceStore: TraceStore;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly soulAccess?: SoulAccess,
    private readonly llmCore?: LLMCoreAccess,
    private readonly streamAccess?: StreamAccess,
  ) {
    this.traceStore = new TraceStore(relationDb);
  }

  async execWrite(input: WriteInput, output: WriteOutput, ctx: WriterAgentContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    const startedAt = IdGenerator.now();
    const prepared = await this.prepareWriterAgent(input, ctx);
    const { preferences, config } = await this.resolveWritePreferences(input, ctx);
    const contextExtra = await this.buildSessionContext(input, ctx, metrics, report);
    const resultsCtx = buildWriterResultsContext(input.agent_results ?? []);
    if (resultsCtx.errorResults.length > 0 && resultsCtx.results === '') {
      await this.emitErrorFallback(input, output, prepared, preferences, config, resultsCtx, startedAt, metrics);
      return true;
    }
    
    let llmId = config?.llm_id || '';
    if (!llmId && prepared.agent?.agent_id && this.llmCore) {
      llmId = await this.resolveLlm(prepared.agent.agent_id, metrics);
    }
    const system = await this.loadSoulContent(prepared.agent, metrics);
    const prompt = await this.renderWritePrompt(input, preferences, contextExtra, resultsCtx, system, config, metrics);
    const llm = await this.execWriterLlm(input, ctx, llmId, system, prompt, metrics, report);
    const { response, tokens } = this.applyWriteResult(output, llm, resultsCtx.results, input.user_query);
    output.agent_id = prepared.agentId;
    output.response = response;
    output.response_format = preferences.format || 'MARKDOWN';
    output.token_usage = tokens;
    await this.recordTrace(output, this.buildWriterTraceParams(prepared, input.user_query, response,
      Number(llm.eventsOutput.input_tokens ?? 0), Number(llm.eventsOutput.output_tokens ?? 0),
      String(llm.eventsOutput.result ?? ''), startedAt, config), metrics);
    
    await this.recordWriterUsage(prepared.libCtx, prepared.agentId, input, ctx, input.user_query, response, output.trace_id);
    return true;
  }

  
  private async prepareWriterAgent(input: WriteInput, ctx: WriterAgentContext): Promise<PreparedWriterAgent> {
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: ctx.session_id,
      work_id: input.work_id || ctx.work_id,
      run_id: input.run_id || ctx.run_id,
    });
    const buildOut = new BuildSystemAgentOutput();
    await this.agentBuilder.buildSystemAgent(
      Object.assign(new BuildSystemAgentInput(), { agent_type: 'WRITER' }),
      buildOut,
      builderCtx,
    );
    if (!buildOut.agent_id) throw new ValidationError('buildWriterAgent failed');
    const libCtx = Object.assign(new AgentLibraryContext(), builderCtx);
    const getOut = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      getOut,
      libCtx,
    );
    return { agentId: buildOut.agent_id, agent: getOut.agents[0], libCtx };
  }

  
  private async resolveWritePreferences(input: WriteInput, ctx: WriterAgentContext): Promise<{
    preferences: WriterPreferences;
    config: WriterAgentConfigRecord | null;
  }> {
    let preferences = input.user_preferences;
    if (!preferences && ctx.session_id) {
      const profile = await this.loadProfile(ctx.session_id);
      if (profile) {
        preferences = {
          language: profile.language,
          style: profile.style,
          depth: profile.depth,
          format: profile.format,
        };
      }
    }
    const config = await this.getConfig();
    if (!preferences) {
      preferences = {
        language: config?.default_language ?? 'zh-CN',
        style: config?.default_style ?? 'clear',
        depth: config?.default_depth ?? 'medium',
        format: config?.default_format ?? 'MARKDOWN',
      };
    }
    return { preferences, config };
  }

  

  private async buildSessionContext(input: WriteInput, ctx: WriterAgentContext, metrics?: Metrics, report?: Report): Promise<string> {
    if (!ctx.session_id) return '';
    try {
      const ctxOut = new ContextInfoOutput();





      await this.infoCore.context(
        Object.assign(new ContextInfoInput(), {
          session_id: ctx.session_id, work_id: ctx.work_id || '',
          selected_msg_ids: ctx.selected_msg_ids, info: input.user_query, persist_snapshot: false,
        }),
        ctxOut,
        new InfoCoreContext(),
      );
      const staticMemory = formatContextCategories(ctxOut);
      // 写作阶段上下文构建透出（stage=writer，与主循环轮次区分；全文随 llm_call_detail 落库）
      if (staticMemory && report) {
        report.emit(BusinessEvent.ContextBuilt, {
          round: 0, stage: 'writer', message_count: 0,
          system: staticMemory.slice(0, 4000),
        });
      }
      return staticMemory;
    } catch (err) {
      
      metrics?.warn('WriterAgentService.execWrite 构建会话上下文失败，降级为空上下文', {
        error: err instanceof Error ? err.message : String(err),
        session_id: ctx.session_id, work_id: ctx.work_id,
      });
      return '';
    }
  }

  
  private async emitErrorFallback(
    input: WriteInput, output: WriteOutput, prepared: PreparedWriterAgent,
    preferences: WriterPreferences, config: WriterAgentConfigRecord | null,
    resultsCtx: WriterResultsContext, startedAt: number, metrics?: Metrics,
  ): Promise<void> {
    const errorText = resultsCtx.errorResults.map(formatAgentResult).join('\n');
    output.blocks = [{
      id: IdGenerator.generate(),
      type: 'error_fallback' as const,
      content: errorText,
      meta: { streaming_status: 'completed' as const },
    }];
    output.agent_id = prepared.agentId;
    output.response = errorText;
    output.response_format = preferences.format || 'MARKDOWN';
    output.token_usage = 0;
    output.handle_result_type = resultsCtx.errorResults[0]?.handle_result_type ?? HandleResultType.INTERNAL_ERROR;
    await this.recordTrace(output, this.buildWriterTraceParams(prepared, input.user_query, errorText, 0, 0, '', startedAt, config), metrics);
  }

  
  private buildWriterTraceParams(
    prepared: PreparedWriterAgent, taskContent: string, response: string,
    inputTokens: number, outputTokens: number, rawResponse: string,
    startedAt: number, config: WriterAgentConfigRecord | null,
  ) {
    return {
      agentId: prepared.agentId,
      agentName: prepared.agent?.agent_name ?? prepared.agentId,
      soulId: prepared.agent?.soul_id ?? '',
      taskContent,
      response,
      inputTokens,
      outputTokens,
      rawResponse,
      elapsedMs: IdGenerator.now() - startedAt,
      templateId: config?.write_prompt_template_id,
    };
  }

  
  private async loadSoulContent(agent: AgentRecord | undefined, metrics?: Metrics): Promise<string> {
    if (!agent?.soul_id || !this.soulAccess) return '';
    try {
      const soulOut = new GetSoulOutput();
      await this.soulAccess.soSoulById(
        Object.assign(new GetSoulInput(), { id: agent.soul_id }),
        soulOut,
        new SoulContext(),
      );
      return soulOut.soul?.soul_content ?? soulOut.soul?.soul_brief ?? '';
    } catch (err) {
      
      metrics?.warn('WriterAgentService.execWrite 读取 Soul 失败，降级为无 system 角色', {
        error: err instanceof Error ? err.message : String(err),
        soul_id: agent.soul_id,
        agent_id: agent.agent_id,
      });
      return '';
    }
  }

  
  private renderWritePrompt(
    input: WriteInput, preferences: WriterPreferences, contextExtra: string,
    resultsCtx: WriterResultsContext, system: string, config: WriterAgentConfigRecord | null,
    metrics?: Metrics,
  ): Promise<string> {
    return this.renderPrompt(config?.write_prompt_template_id, 'Writer', {
      user_query: input.user_query,
      task_content: input.user_query,
      preferences: JSON.stringify(preferences),
      context: contextExtra,
      context_data: contextExtra,
      agent_results: resultsCtx.agentResultsContext || resultsCtx.results,
      soul: system,
    }, metrics);
  }

  /** ADR-013：Writer 流式正文统一走 reply.delta 业务事件（裸 text_chunk 通道已删除） */
  private buildWriteEventsInput(
    input: WriteInput, ctx: WriterAgentContext, llmId: string, system: string, prompt: string, report?: Report,
  ): ExecLLMEventsInput {
    let writerStreamStarted = false;
    return Object.assign(new ExecLLMEventsInput(), {
      id: llmId,
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        { role: 'user' as const, content: prompt },
      ],
      temperature: 0.3,

      extra: { ...WRITER_THINKING_DISABLED },
      session_id: ctx.session_id || '',
      run_id: input.run_id || ctx.run_id || '',
      work_id: input.work_id || ctx.work_id || '',
      caller: 'WriterAgent.execWrite',
      on_event: (ev: LLMEvent) => {
        if (ev.type === 'text_delta' && ev.delta) {
          // 首个 delta 带 replace：前端 reducer 用 Writer 排版稿替换 Loop 原稿正文
          const isFirst = !writerStreamStarted;
          writerStreamStarted = true;
          report?.emit(BusinessEvent.ReplyDelta, { delta: ev.delta, replace: isFirst });
        }
      },
    });
  }

  
  private async execWriterLlm(
    input: WriteInput, ctx: WriterAgentContext, llmId: string, system: string, prompt: string,
    metrics?: Metrics, report?: Report,
  ): Promise<{ ok: boolean; eventsOutput: ExecLLMEventsOutput }> {
    const eventsInput = this.buildWriteEventsInput(input, ctx, llmId, system, prompt, report);
    const eventsOutput = new ExecLLMEventsOutput();
    let ok = false;
    if (typeof this.llmAccess.execLLMEvents === 'function') {
      ok = await this.llmAccess.execLLMEvents(eventsInput, eventsOutput, new LLMContext(), metrics, report);
    } else {
      const execIn = Object.assign(new ExecLLMInput(), {
        id: llmId,
        prompt,
        ...(system ? { system } : {}),
        
        extra: { ...WRITER_THINKING_DISABLED },
        session_id: ctx.session_id || '',
        run_id: input.run_id || ctx.run_id || '',
        work_id: input.work_id || ctx.work_id || '',
        caller: 'WriterAgent.execWrite',
      });
      const execOut = new ExecLLMOutput();
      ok = await this.llmAccess.execLLM(execIn, execOut, new LLMContext(), metrics, report);
      eventsOutput.result = execOut.result ?? '';
      eventsOutput.input_tokens = execOut.input_tokens ?? 0;
      eventsOutput.output_tokens = execOut.output_tokens ?? 0;
    }
    return { ok, eventsOutput };
  }

  
  private applyWriteResult(
    output: WriteOutput,
    llm: { ok: boolean; eventsOutput: ExecLLMEventsOutput },
    fallbackResults: string,
    userQuery: string,
  ): { response: string; tokens: number } {
    if (!llm.ok || !llm.eventsOutput.result) {
      
      const response = cleanFallbackResults(fallbackResults) || userQuery;
      output.blocks = [{
        id: IdGenerator.generate(),
        type: 'text_paragraph' as const,
        content: response,
        meta: { streaming_status: 'completed' as const },
      }];
      return { response, tokens: 0 };
    }
    const tokens = Number((llm.eventsOutput.input_tokens ?? 0) + (llm.eventsOutput.output_tokens ?? 0));
    
    
    
    
    const response = llm.eventsOutput.result.trim();
    
    output.blocks = this.parseBlocks(response);
    return { response, tokens };
  }

  
  private async recordWriterUsage(libCtx: AgentLibraryContext, agentId: string, input: WriteInput, ctx: WriterAgentContext,
    taskContent: string, agentOutput: string, traceId?: string): Promise<void> {
    await this.agentLibrary.recordAgentUsage(
      Object.assign(new RecordAgentUsageInput(), {
        agent_id: agentId,
        work_id: input.work_id || ctx.work_id || '',
        run_id: input.run_id || ctx.run_id || '',
        
        usage_context: JSON.stringify({
          trace_id: traceId || '',
          task_content: taskContent,
          agent_output: agentOutput,
        }),
      }),
      new RecordAgentUsageOutput(),
      libCtx,
    );
  }

  

  private async recordTrace(
    output: WriteOutput,
    params: {
      agentId: string;
      agentName: string;
      soulId: string;
      taskContent: string;
      response: string;
      inputTokens: number;
      outputTokens: number;
      rawResponse: string;
      elapsedMs: number;
      templateId: string | undefined;
    },
    metrics?: Metrics,
  ): Promise<void> {
    try {
      const traceId = IdGenerator.generate();
      const now = IdGenerator.now();
      await this.traceStore.save({
        trace_id: traceId,
        agent_id: params.agentId,
        start_time: now,
        end_time: now + params.elapsedMs,
        iterations: buildSingleAnswerTrace({
          answer: params.response,
          raw_response: params.rawResponse,
          input_tokens: params.inputTokens,
          output_tokens: params.outputTokens,
          elapsed_ms: params.elapsedMs,
          template_id: params.templateId,
          variables: {
            task_content: params.taskContent,
            agent_name: params.agentName,
            domain: 'writer',
            tools_json: '{}',
            soul_id: params.soulId,
          },
        }),
        total_token_usage: params.inputTokens + params.outputTokens,
        answer: params.response,
      }, metrics);
      output.trace_id = traceId;
    } catch (err) {
      
      
      metrics?.warn('WriterAgentService.recordTrace 写作轨迹落盘失败已容忍', {
        error: err instanceof Error ? err.message : String(err),
        agent_id: params.agentId,
      });
    }
  }

  async saveUserProfile(input: SaveUserProfileInput, _output: SaveUserProfileOutput, _ctx: WriterAgentContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.session_id) throw new ValidationError('session_id 为必填');
    if (input.language !== undefined && !LANGUAGE_ENUM.includes(input.language)) {
      throw new ValidationError(`language 必须是 ${LANGUAGE_ENUM.join('|')}`);
    }
    if (input.format && !FORMAT_ENUM.includes(input.format)) {
      throw new ValidationError(`format 必须是 ${FORMAT_ENUM.join('|')}`);
    }
    if (input.style !== undefined && !STYLE_ENUM.includes(input.style)) {
      throw new ValidationError(`style 必须是 ${STYLE_ENUM.join('|')}`);
    }
    if (input.depth !== undefined && !DEPTH_ENUM.includes(input.depth)) {
      throw new ValidationError(`depth 必须是 ${DEPTH_ENUM.join('|')}`);
    }
    const existing = await this.relationDb.selectOne(WRITER_AGENT_USER_PROFILE_TABLE, [
      { field: 'session_id', operator: Operator.EQ, value: input.session_id },
    ]);
    const now = IdGenerator.now();
    if (existing) {
      const data: DataObject[] = [{ field: 'updated', value: now }];
      if (input.language !== undefined) data.push({ field: 'language', value: input.language });
      if (input.style !== undefined) data.push({ field: 'style', value: input.style });
      if (input.depth !== undefined) data.push({ field: 'depth', value: input.depth });
      if (input.format !== undefined) data.push({ field: 'format', value: input.format });
      if (input.additional_preferences !== undefined) {
        data.push({ field: 'additional_preferences', value: input.additional_preferences });
      }
      await this.relationDb.update(
        WRITER_AGENT_USER_PROFILE_TABLE,
        data,
        [{ field: 'session_id', operator: Operator.EQ, value: input.session_id }],
      );
    } else {
      await this.relationDb.insert(WRITER_AGENT_USER_PROFILE_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'session_id', value: input.session_id },
        { field: 'language', value: input.language ?? 'zh-CN' },
        { field: 'style', value: input.style ?? 'clear' },
        { field: 'depth', value: input.depth ?? 'medium' },
        { field: 'format', value: input.format ?? 'MARKDOWN' },
        { field: 'additional_preferences', value: input.additional_preferences ?? '' },
      ]);
    }
    return true;
  }

  async soUserProfile(input: GetUserProfileInput, output: GetUserProfileOutput, _ctx: WriterAgentContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const profile = await this.loadProfile(input.session_id);
    if (profile) {
      output.user_profile = {
        language: profile.language,
        style: profile.style,
        depth: profile.depth,
        format: profile.format,
        additional_preferences: profile.additional_preferences,
      };
    }
    return true;
  }

  async configWriterAgent(input: ConfigWriterAgentInput, output: ConfigWriterAgentOutput, _ctx: WriterAgentContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    let config = await this.getConfig();
    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(WRITER_AGENT_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'write_prompt_template_id', value: '' },
        { field: 'default_language', value: 'zh-CN' },
        { field: 'default_style', value: 'clear' },
        { field: 'default_depth', value: 'medium' },
        { field: 'default_format', value: 'MARKDOWN' },
      ]);
      config = await this.getConfig();
    }
    if (!config) throw new ValidationError('config init failed');

    const data: DataObject[] = [];
    if (input.write_prompt_template_id !== undefined) {
      if (input.write_prompt_template_id) {
        const so = new SoPromptOutput();
        await this.promptsAccess.soPrompt(
          Object.assign(new SoPromptInput(), {
            conditions: [{ field: 'id', operator: Operator.EQ, value: input.write_prompt_template_id }],
          }),
          so,
          new PromptContext(),
        );
        if (!so.list?.length) {
          throw new ValidationError(`prompt_template_id 不存在: ${input.write_prompt_template_id}`);
        }
      }
      data.push({ field: 'write_prompt_template_id', value: input.write_prompt_template_id });
    }
    if (input.default_language !== undefined) {
      if (!LANGUAGE_ENUM.includes(input.default_language)) {
        throw new ValidationError(`default_language 必须是 ${LANGUAGE_ENUM.join('|')}`);
      }
      data.push({ field: 'default_language', value: input.default_language });
    }
    if (input.default_style !== undefined) {
      if (!STYLE_ENUM.includes(input.default_style)) {
        throw new ValidationError(`default_style 必须是 ${STYLE_ENUM.join('|')}`);
      }
      data.push({ field: 'default_style', value: input.default_style });
    }
    if (input.default_depth !== undefined) {
      if (!DEPTH_ENUM.includes(input.default_depth)) {
        throw new ValidationError(`default_depth 必须是 ${DEPTH_ENUM.join('|')}`);
      }
      data.push({ field: 'default_depth', value: input.default_depth });
    }
    if (input.default_format !== undefined) {
      if (!FORMAT_ENUM.includes(input.default_format)) {
        throw new ValidationError(`default_format 必须是 ${FORMAT_ENUM.join('|')}`);
      }
      data.push({ field: 'default_format', value: input.default_format });
    }
    if (input.llm_id !== undefined) {
      data.push({ field: 'llm_id', value: input.llm_id || null });
    }
    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(
        WRITER_AGENT_CONFIG_TABLE,
        data,
        [{ field: 'id', operator: Operator.EQ, value: config.id }],
      );
    }
    output.config = await this.getConfig();
    return true;
  }

  private async loadProfile(sessionId: string): Promise<WriterAgentUserProfileRecord | null> {
    const row = await this.relationDb.selectOne(WRITER_AGENT_USER_PROFILE_TABLE, [
      { field: 'session_id', operator: Operator.EQ, value: sessionId },
    ]);
    if (!row) return null;
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      session_id: String(row.session_id),
      language: String(row.language),
      style: String(row.style),
      depth: String(row.depth),
      format: String(row.format),
      additional_preferences: String(row.additional_preferences ?? ''),
    };
  }

  

  private async renderPrompt(
    templateId: string | undefined,
    builtinId: string,
    variables: Record<string, unknown>,
    metrics?: Metrics,
  ): Promise<string> {
    return renderPromptWithFallback(this.promptsAccess, templateId, builtinId, variables, metrics);
  }

  

  private async resolveLlm(agentId: string, metrics?: Metrics): Promise<string> {
    return resolveAgentLlm(this.llmCore, agentId, metrics);
  }

  private async getConfig(): Promise<WriterAgentConfigRecord | null> {
    const row = await this.relationDb.selectOne(WRITER_AGENT_CONFIG_TABLE, []);
    if (!row) return null;
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      write_prompt_template_id: String(row.write_prompt_template_id ?? ''),
      default_language: String(row.default_language ?? 'zh-CN'),
      default_style: String(row.default_style ?? 'clear'),
      default_depth: String(row.default_depth ?? 'medium'),
      default_format: String(row.default_format ?? 'MARKDOWN'),
      llm_id: (row.llm_id as string) || null,
    };
  }

  private parseBlocks(raw: string): Block[] {
    const VALID_TYPES = ['text_paragraph', 'heading', 'code_block', 'list_item', 'artifact_preview', 'error_fallback'];
    try {
      let json = raw.trim();
      const arrStart = json.indexOf('[');
      const arrEnd = json.lastIndexOf(']');
      if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
        json = json.slice(arrStart, arrEnd + 1);
      }
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      return parsed.map((item: { type?: string; content?: string; meta?: BlockMeta }) => {
        const type = (typeof item.type === 'string' && VALID_TYPES.includes(item.type))
          ? item.type as Block['type'] : 'text_paragraph';
        const id = IdGenerator.generate();
        return {
          id,
          type,
          content: String(item.content ?? ''),
          meta: item.meta ? { streaming_status: 'completed' as const, ...item.meta } : { streaming_status: 'completed' as const },
        };
      });
    } catch {
      return [{
        id: IdGenerator.generate(),
        type: 'text_paragraph' as const,
        content: raw,
        meta: { streaming_status: 'completed' as const },
      }];
    }
  }
}
