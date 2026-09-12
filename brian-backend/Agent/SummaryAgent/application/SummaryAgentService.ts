import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, SoulAccess, Logger } from '@brian-agent/base';
import { Operator, ValidationError, ExecLLMInput, ExecLLMOutput, LLMContext, ExecPromptInput, ExecPromptOutput, PromptContext, SoSoulOutput, AddSoulOutput, GetSoulInput, GetSoulOutput, SoulContext, PROMPT_IDS } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import { InfoCoreContext, SoInfoSummaryConfigInput, SoInfoSummaryConfigOutput } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import {
  BuildSystemAgentInput, BuildSystemAgentOutput, AgentBuilderContext,
} from '../../AgentBuilder/domain/types';
import {
  GetAgentInput, GetAgentOutput, UpdateAgentInput, UpdateAgentOutput, AgentLibraryContext,
} from '../../AgentLibrary/domain/types';
import { resolveAgentLlm } from '../../shared/AgentKit';
import {
  SummaryAgentContext,
  GenerateSummaryInput, GenerateSummaryOutput,
  SUMMARY_SOUL_BRIEF, SUMMARY_SOUL_CONTENT, SUMMARY_SOUL_USAGE,
} from '../domain/types';

export class SummaryAgentService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly soulAccess: SoulAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly llmCore?: LLMCoreAccess,
    private readonly logger?: Logger,
  ) {}

  /**
   * 初始化：确保摘要生成所需的内置资源就绪（幂等）。
   *
   * SummaryAgent 无独立表结构（摘要配置由 InfoCore 的 info_summary_config 承载、
   * 摘要文本存于 info_raw.summary），初始化工作即确保：
   * 1. 内置摘要 Soul（soul 表）存在；
   * 2. 内置系统 Agent（agent 表，agent_type=SUMMARY）存在并绑定该 Soul。
   *
   * 初始化失败不阻断服务启动（dev-server 启动流程稍后仍会显式调用 ensureBuiltin 并告警），
   * 仅记录警告，与 generateSummary 的降级行为一致。
   */
  async initialize(_ctx: SummaryAgentContext): Promise<void> {
    try {
      await this.ensureBuiltin(_ctx);
    } catch (e) {
      this.logger?.warn?.(`SummaryAgent 初始化失败（内置摘要 Soul/Agent）: ${String(e)}`);
    }
  }

  async ensureBuiltin(_ctx: SummaryAgentContext): Promise<boolean> {
    const builtinSoulId = await this.ensureBuiltinSoul();

    const buildOut = new BuildSystemAgentOutput();
    await this.agentBuilder.buildSystemAgent(
      Object.assign(new BuildSystemAgentInput(), { agent_type: 'SUMMARY' }),
      buildOut,
      new AgentBuilderContext(),
    );
    if (!buildOut.agent_id) throw new ValidationError('buildSummaryAgent failed');

    const getOut = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      getOut,
      new AgentLibraryContext(),
    );
    const agent = getOut.agents[0];
    if (agent && builtinSoulId && agent.soul_id !== builtinSoulId) {
      await this.agentLibrary.updateAgent(
        Object.assign(new UpdateAgentInput(), { agent_id: buildOut.agent_id, soul_id: builtinSoulId }),
        new UpdateAgentOutput(),
        new AgentLibraryContext(),
      );
    }
    return true;
  }

  async generateSummary(input: GenerateSummaryInput, output: GenerateSummaryOutput, _ctx: SummaryAgentContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const cfgOut = new SoInfoSummaryConfigOutput();
    await this.infoCore.soInfoSummaryConfig(new SoInfoSummaryConfigInput(), cfgOut, new InfoCoreContext());
    const config = cfgOut.config;
    if (!config || config.enable !== 1) {
      output.summary = '';
      return true;
    }

    const types = String(config.info_types ?? 'RESPONSE')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (types.length > 0 && !types.includes(input.info_type)) {
      output.summary = '';
      return true;
    }

    const threshold = config.threshold ?? 100;
    if (input.info.length <= threshold) {
      output.summary = input.info;
      return true;
    }

    output.summary = await this.generateByLLM(input.info);
    return true;
  }

  private async ensureBuiltinSoul(): Promise<string> {
    const so = new SoSoulOutput();
    await this.soulAccess.soSoul(
      { conditions: [{ field: 'soul_brief', operator: Operator.EQ, value: SUMMARY_SOUL_BRIEF }] },
      so,
      new SoulContext(),
    );
    if (so.list.length > 0) return so.list[0].id;

    const addOut = new AddSoulOutput();
    await this.soulAccess.addSoul(
      {
        data: {
          soul_brief: SUMMARY_SOUL_BRIEF,
          soul_content: SUMMARY_SOUL_CONTENT,
          soul_usage: SUMMARY_SOUL_USAGE,
        },
      },
      addOut,
      new SoulContext(),
    );
    return addOut.id;
  }

  private async generateByLLM(info: string): Promise<string> {
    const getOut = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_type: 'SUMMARY' }),
      getOut,
      new AgentLibraryContext(),
    );
    const agent = getOut.agents.find((a) => a.enable);
    // LLM 绑定只存在于 LLMProvider 的 agent_llm，经 Core.matchLLM 解析
    let llmId = '';
    if (agent?.agent_id && this.llmCore) {
      llmId = await this.resolveLlm(agent.agent_id);
    }

    let system = '';
    if (agent?.soul_id) {
      try {
        const soulOut = new GetSoulOutput();
        await this.soulAccess.soSoulById(
          Object.assign(new GetSoulInput(), { id: agent.soul_id }),
          soulOut,
          new SoulContext(),
        );
        system = soulOut.soul?.soul_content ?? soulOut.soul?.soul_brief ?? '';
      } catch {
        /* ignore */
      }
    }

    const promptOut = new ExecPromptOutput();
    const okPrompt = await this.promptsAccess.execPrompt(
      Object.assign(new ExecPromptInput(), {
        id: PROMPT_IDS.summary,
        variables: { task_content: info, soul: system },
      }),
      promptOut,
      new PromptContext(),
    );
    // ===== 2026-09-11：删除硬编码内存回退；DB 渲染缺失 fail-loud =====
    const prompt = okPrompt && promptOut.prompt ? promptOut.prompt : '';
    if (!prompt) {
      throw new ValidationError(`Prompt 模板不可用或渲染为空: ${PROMPT_IDS.summary}`);
    }

    const llmOut = new ExecLLMOutput();
    const ok = await this.llmAccess.execLLM(
      Object.assign(new ExecLLMInput(), {
        id: llmId,
        prompt,
        ...(system ? { system } : {}),
      }),
      llmOut,
      new LLMContext(),
    );
    if (!ok || !llmOut.result) return '';
    return llmOut.result.trim();
  }

  /**
   * 通过 Core.matchLLM 解析 SummaryAgent 绑定的 LLM（agent_llm）。
   */
  private async resolveLlm(agentId: string): Promise<string> {
    return resolveAgentLlm(this.llmCore, agentId);
  }
}
