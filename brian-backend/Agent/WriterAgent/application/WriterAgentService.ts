import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
  GetSoulInput, GetSoulOutput, SoulContext,
  type DataObject,
} from '@brian-agent/base';
import type { SoulAccess } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  SaveInfoInput, SaveInfoOutput, ContextInfoInput, ContextInfoOutput, InfoCoreContext,
} from '@brian-agent/core';
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
} from '../domain/types';
import {
  BuildWriterAgentInput, BuildWriterAgentOutput, AgentBuilderContext,
} from '../../AgentBuilder/domain/types';
import {
  GetAgentInput, GetAgentOutput, RecordAgentUsageInput, RecordAgentUsageOutput,
  AgentLibraryContext,
} from '../../AgentLibrary/domain/types';
import { parseJsonObject } from '../../shared/signature';

const FORMAT_ENUM = ['TEXT', 'MARKDOWN', 'JSON'];

export class WriterAgentService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly soulAccess?: SoulAccess,
  ) {}

  async write(input: WriteInput, ctx: WriterAgentContext, output: WriteOutput): Promise<boolean> {
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: ctx.session_id,
      work_id: input.work_id || ctx.work_id,
      interact_id: input.interact_id || ctx.interact_id,
    });
    const buildOut = new BuildWriterAgentOutput();
    await this.agentBuilder.buildWriterAgent(new BuildWriterAgentInput(), builderCtx, buildOut);
    if (!buildOut.agent_id) throw new ValidationError('buildWriterAgent failed');

    const libCtx = Object.assign(new AgentLibraryContext(), builderCtx);
    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      libCtx,
      getOut,
    );
    const agent = getOut.agents[0];

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

    let contextExtra = '';
    if (ctx.session_id) {
      try {
        const ctxOut = new ContextInfoOutput();
        await this.infoCore.context(
          Object.assign(new ContextInfoInput(), { session_id: ctx.session_id }),
          new InfoCoreContext(),
          ctxOut,
        );
        contextExtra = (ctxOut.list ?? []).map((i) => String((i as { info?: string }).info ?? '')).join('\n');
      } catch { /* best-effort */ }
    }

    const results = input.agent_results
      .map((r) => `[${r.agent_id}] ${r.task_content}: ${r.result}`)
      .join('\n');

    let response = '';
    let tokens = 0;
    const llmId = agent?.llm_id || '';
    if (llmId) {
      let system = '';
      if (agent?.soul_id && this.soulAccess) {
        try {
          const soulOut = new GetSoulOutput();
          await this.soulAccess.getSoul(
            Object.assign(new GetSoulInput(), { id: agent.soul_id }),
            new SoulContext(),
            soulOut,
          );
          system = soulOut.soul?.soul_content ?? soulOut.soul?.soul_brief ?? '';
        } catch { /* ignore */ }
      }

      let prompt =
        `User query: ${input.user_query}\nPreferences: ${JSON.stringify(preferences)}\n` +
        `Context:\n${contextExtra}\nResults:\n${results}\n` +
        'Write a humanized final response. Return JSON: {"response":"...","response_format":"MARKDOWN"}';

      if (config?.write_prompt_template_id) {
        try {
          const promptOut = new ExecPromptOutput();
          await this.promptsAccess.execPrompt(
            Object.assign(new ExecPromptInput(), {
              id: config.write_prompt_template_id,
              variables: {
                user_query: input.user_query,
                preferences,
                context: contextExtra,
                agent_results: input.agent_results,
                soul: system,
              },
            }),
            new PromptContext(),
            promptOut,
          );
          if (promptOut.prompt) prompt = promptOut.prompt;
        } catch { /* use fallback prompt */ }
      }

      const llmOut = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: llmId,
          prompt,
          params: system ? { system } : undefined,
        }),
        new LLMContext(),
        llmOut,
      );
      tokens = Number((llmOut.usage as Record<string, unknown> | undefined)?.total_tokens ?? 0);
      const parsed = parseJsonObject(llmOut.result);
      response = String(parsed?.response ?? llmOut.result ?? '');
      if (parsed?.response_format) {
        preferences.format = String(parsed.response_format);
      }
    } else {
      response = `Summary: ${input.user_query.slice(0, 100)}\n\nResults:\n${results}`;
    }

    await this.agentLibrary.recordAgentUsage(
      Object.assign(new RecordAgentUsageInput(), {
        agent_id: buildOut.agent_id,
        work_id: input.work_id || ctx.work_id || '',
        interact_id: input.interact_id || ctx.interact_id || '',
      }),
      libCtx,
      new RecordAgentUsageOutput(),
    );

    if (ctx.session_id) {
      try {
        await this.infoCore.saveInfo(
          Object.assign(new SaveInfoInput(), {
            session_id: ctx.session_id,
            work_id: input.work_id || ctx.work_id || '',
            interact_id: input.interact_id || ctx.interact_id || '',
            info_creator_id: buildOut.agent_id,
            info_creator_role: 'RESPONSE',
            info: response,
          }),
          new InfoCoreContext(),
          new SaveInfoOutput(),
        );
      } catch { /* best-effort */ }
    }

    output.response = response;
    output.response_format = preferences.format || 'MARKDOWN';
    output.token_usage = tokens;
    return true;
  }

  async saveUserProfile(
    input: SaveUserProfileInput,
    _ctx: WriterAgentContext,
    _output: SaveUserProfileOutput,
  ): Promise<boolean> {
    if (!input.session_id) throw new ValidationError('session_id 为必填');
    if (input.format && !FORMAT_ENUM.includes(input.format)) {
      throw new ValidationError(`format 必须是 ${FORMAT_ENUM.join('|')}`);
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

  async getUserProfile(
    input: GetUserProfileInput,
    _ctx: WriterAgentContext,
    output: GetUserProfileOutput,
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

  async configWriterAgent(
    input: ConfigWriterAgentInput,
    _ctx: WriterAgentContext,
    output: ConfigWriterAgentOutput,
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
          new PromptContext(),
          so,
        );
        if (!so.list?.length) {
          throw new ValidationError(`prompt_template_id 不存在: ${input.write_prompt_template_id}`);
        }
      }
      data.push({ field: 'write_prompt_template_id', value: input.write_prompt_template_id });
    }
    if (input.default_language !== undefined) data.push({ field: 'default_language', value: input.default_language });
    if (input.default_style !== undefined) data.push({ field: 'default_style', value: input.default_style });
    if (input.default_depth !== undefined) data.push({ field: 'default_depth', value: input.default_depth });
    if (input.default_format !== undefined) {
      if (!FORMAT_ENUM.includes(input.default_format)) {
        throw new ValidationError(`default_format 必须是 ${FORMAT_ENUM.join('|')}`);
      }
      data.push({ field: 'default_format', value: input.default_format });
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
    };
  }
}
