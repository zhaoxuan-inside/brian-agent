import {
  Metrics,
  Report,
  funnelBm25Ranking,
  funnelSemanticRouterRanking,
  buildFunnelDocText,
  toFunnelBm25Options,
  funnelNegativeReason,
  batchGetOrComputeEmbeddings,
  batchGetDualExampleEmbeddings,
  batchGetComponentExamples,
  analyzeTaskComplexity,
  runComponentElection,
  standardTierLadder,
  loadElectionThresholdOverrides,
  applySignalScores,
  DEFAULT_ELECTION_THRESHOLDS,
  createSemanticsTaskFn,
  type FunnelRankingEntry,
  type ComponentElectionAdapter,
  type ElectionCandidate,
  type ElectionSignals,
  type ElectionThresholds,
  type PromptTemplateRecord,
  PROMPT_TEMPLATE_EMBEDDING_TABLE,
  PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE,
} from '@brian-agent/base';
import type { ComponentSemantics } from '@brian-agent/base';
import { createComponentFunnelTrace, pushComponentFunnel, FUNNEL_MECHANISM_LABELS, type ComponentFunnelTrace } from '@brian-agent/base';
import { createComponentTitleLookup, type ComponentTitleLookup } from '@brian-agent/base';
import { EmbedLLMInput, EmbedLLMOutput } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, StreamAccess, Logger } from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError, NotFoundError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput, AddPromptInput, AddPromptOutput,
  InfoType,
  BusinessEvent,
  type DataObject,
} from '@brian-agent/base';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import type {
  LLMCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess, InfoCoreAccess,
} from '@brian-agent/core';
import {
  AgeSkillInput, AgeSkillOutput, AgeSoulInput, AgeSoulOutput,
} from '@brian-agent/core';
import {
  SaveInfoInput, SaveInfoOutput, InfoCoreContext,
} from '@brian-agent/core';
import {
  type AgentBuilderConfigRecord,
  AGENT_BUILDER_CONFIG_TABLE,
  AgentBuilderContext,
  BuildAgentInput, BuildAgentOutput,
  OptimizeAgentInput, OptimizeAgentOutput,
  BuildSystemAgentInput, BuildSystemAgentOutput,
  ConfigAgentBuilderInput, ConfigAgentBuilderOutput,
} from '../domain/types';
import {
  AddAgentInput, AddAgentOutput, GetAgentInput, GetAgentOutput,
  UpdateAgentInput, UpdateAgentOutput, MatchAgentInput, MatchAgentOutput,
  RecordAgentUsageInput, RecordAgentUsageOutput, AgentLibraryContext,
  BindAgentComponentInput,
  BindAgentComponentOutput,
  ComponentKind,
  UnbindAgentComponentInput,
  UnbindAgentComponentOutput,
} from '../../AgentLibrary/domain/types';
import {
  MatchStrategyInput, MatchStrategyOutput,
  SoStrategyInput, SoStrategyOutput, AgentStrategyContext,
} from '../../AgentStrategy/domain/types';
import {
  MatchLLMInput, MatchLLMOutput, LLMCoreContext,
  MatchMcpInput, MatchMcpOutput, OptMcpInput, OptMcpOutput, McpCoreContext,
  MatchSkillInput, MatchSkillOutput, OptSkillInput, OptSkillOutput, SkillCoreContext,
  MatchSoulInput, MatchSoulOutput, OptSoulInput, OptSoulOutput, SoulCoreContext,
} from '@brian-agent/core';
import { buildTaskSignature, parseJsonObject } from '../../shared/signature';
import { generateAgentName } from '../domain/services/AgentNamingDomainService';
import { computeBindingDiff } from '../domain/services/BindingDiffDomainService';
import { buildAgentBuildSummary } from '../domain/services/AgentBuildSummaryDomainService';
import type { AgentBuildAnalysis } from '../domain/services/AgentBuildSummaryDomainService';
import type { AgentRecord } from '../../AgentLibrary/domain/types';

interface AgentBuildComponents {
  strategyId: string;
  llmId: string;
  skillOut: MatchSkillOutput;
  mcpOut: MatchMcpOutput;
  soulOut: MatchSoulOutput;
  agentName: string;
  promptTemplateId: string;
  agentPurpose: string;
  agentSemantics: ComponentSemantics;
}

export class AgentBuilderService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly agentStrategy: AgentStrategyAccess,
    private readonly llmCore: LLMCoreAccess,
    private readonly mcpCore: MCPCoreAccess,
    private readonly skillCore: SkillCoreAccess,
    private readonly soulCore: SoulCoreAccess,
    private readonly logger?: Logger,
    private readonly infoCore?: InfoCoreAccess,
    private readonly streamAccess?: StreamAccess,
  ) {}

  async buildAgent(input: BuildAgentInput, output: BuildAgentOutput, ctx: AgentBuilderContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const libCtx = this.toLibCtx(ctx, input.run_id);
    const agentId = IdGenerator.generate();
    const sessionId = ctx.session_id || '';
    const workId = ctx.work_id || '';
    const runId = input.run_id || ctx.run_id || '';

    const analysisLlm = await this.matchLlmForAgent(agentId, input.run_id, metrics, report);
    const analysis = await this.analyzeTask(input, config, analysisLlm, metrics, report);

    if (!input.force_new) {
      const reused = await this.reuseMatchedAgent(
        input, output, libCtx, agentId, sessionId, workId, runId, analysis.signature, metrics, report,
      );
      if (reused) return true;
    }

    const components = await this.assembleAgentComponents(input, ctx, agentId, analysis, analysisLlm, metrics, report);

    await this.persistBuiltAgent(libCtx, agentId, analysis, components);
    await this.bindCoreComponents(ctx, agentId, input.run_id || '', components);
    await this.archiveAgentBuild(sessionId, workId, runId, agentId, analysis, components, metrics);
    report?.emit(BusinessEvent.AgentBuilt, {
      agent_id: agentId,
      name: components.agentName,
      purpose: components.agentPurpose || '',
    });

    output.agent_id = agentId;
    return true;
  }

  async optimizeAgent(input: OptimizeAgentInput, output: OptimizeAgentOutput, ctx: AgentBuilderContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    if (!config?.auto_optimize) {
      output.optimized = false;
      return true;
    }

    const libCtx = this.toLibCtx(ctx, input.run_id);
    const agent = await this.loadOptimizeTarget(input, libCtx);

    await this.rematchStrategy(input, agent, libCtx, output);
    await this.unbindStaleSkills(input, agent, libCtx, output);
    await this.unbindStaleSouls(input, agent, libCtx, output);
    await this.rematchLlm(input, ctx, output);
    await this.rebindSoul(input, agent, ctx, libCtx, output);
    const matchedSkillIds = await this.rebindSkills(input, agent, ctx, libCtx, output);
    await this.optSkillBindings(input.agent_id, ctx.session_id || '', input.run_id || '', matchedSkillIds);
    const matchedMcpIds = await this.rebindMcps(input, agent, ctx, libCtx, output);
    await this.optMcpBindings(input.agent_id, ctx.session_id || '', input.run_id || '', matchedMcpIds);

    output.optimized = output.changes.length > 0;
    return true;
  }

  /** 组件实例名称查询（惰性创建，事件 payload 展示名） */
  private titleLookup: ComponentTitleLookup | null = null;

  private static readonly SYSTEM_AGENT_CONFIG: Record<string, { strategyLabel: string; signatureKey: string; defaultName: string }> = {
    WRITER: { strategyLabel: 'CoT', signatureKey: 'writer', defaultName: '写作汇总' },
    EVOLUTOR: { strategyLabel: 'ReAct', signatureKey: 'evolutor', defaultName: '进化评估' },
    SUMMARY: { strategyLabel: 'CoT', signatureKey: 'summary', defaultName: '内容摘要' },
    INTENT: { strategyLabel: 'CoT', signatureKey: 'intent', defaultName: '需求理解' },
  };

  async buildSystemAgent(input: BuildSystemAgentInput, output: BuildSystemAgentOutput, ctx: AgentBuilderContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const agentType = input.agent_type;
    const config = AgentBuilderService.SYSTEM_AGENT_CONFIG[agentType];
    if (!config) throw new ValidationError(`unknown system agent type: ${agentType}`);

    const libCtx = this.toLibCtx(ctx, '');
    if (!input.force_new) {
      const getOut = new GetAgentOutput();
      await this.agentLibrary.soAgent(
        Object.assign(new GetAgentInput(), { agent_type: agentType }),
        getOut,
        libCtx,
      );
      const found = getOut.agents.find((a) => a.enable);
      if (found) {
        output.agent_id = found.agent_id;
        return true;
      }
    }

    const agentId = IdGenerator.generate();

    await this.matchLlmForAgent(agentId, ctx.run_id || '');
    let soulId = '';
    if (agentType !== 'SUMMARY' && agentType !== 'INTENT') {
      const soulOut = new MatchSoulOutput();
      await this.soulCore.matchSoul(
        Object.assign(new MatchSoulInput(), {
          agent_id: agentId,
          context_id: ctx.session_id || '',
          run_id: ctx.run_id || '',
        }),
        soulOut,
        new SoulCoreContext(),
      );
      soulId = soulOut.soul_id || '';
    }

    const strategyId = await this.getStrategyIdByLabel(config.strategyLabel);
    if (!strategyId) throw new ValidationError(`strategy not found: ${config.strategyLabel}`);

    const addOut = new AddAgentOutput();
    const ok = await this.agentLibrary.addAgent(
      Object.assign(new AddAgentInput(), {
        agent_id: agentId,
        agent_type: agentType,
        strategy_id: strategyId,
        soul_id: soulId,
        task_signature: buildTaskSignature(config.signatureKey, agentType.toLowerCase()),
        agent_name: config.defaultName || `系统-${agentType.charAt(0)}${agentType.slice(1).toLowerCase()}`,
      }),
      addOut,
      libCtx,
    );
    if (!ok) throw new ValidationError(`addAgent failed for ${agentType}`);
    if (soulId) {
      await this.soulCore.optSoul(
        Object.assign(new OptSoulInput(), {
          agent_id: agentId,
          context_id: '',
          run_id: '',
          soul_id: soulId,
        }),
        new OptSoulOutput(),
        new SoulCoreContext(),
      );
    }
    output.agent_id = agentId;
    return true;
  }

  async configAgentBuilder(input: ConfigAgentBuilderInput, output: ConfigAgentBuilderOutput, _ctx: AgentBuilderContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    let config = await this.getConfig();
    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(AGENT_BUILDER_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'task_analysis_prompt_template_id', value: '' },
        { field: 'auto_optimize', value: 1 },
      ]);
      config = await this.getConfig();
    }
    if (!config) throw new ValidationError('config init failed');

    const data: DataObject[] = [];
    if (input.task_analysis_prompt_template_id !== undefined) {
      if (input.task_analysis_prompt_template_id) {
        await this.assertPrompt(input.task_analysis_prompt_template_id);
      }
      data.push({ field: 'task_analysis_prompt_template_id', value: input.task_analysis_prompt_template_id });
    }
    if (input.auto_optimize !== undefined) {
      data.push({ field: 'auto_optimize', value: input.auto_optimize ? 1 : 0 });
    }
    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(
        AGENT_BUILDER_CONFIG_TABLE,
        data,
        [{ field: 'id', operator: Operator.EQ, value: config.id }],
      );
    }
    output.config = await this.getConfig();
    return true;
  }

  private async reuseMatchedAgent(
    input: BuildAgentInput, output: BuildAgentOutput, libCtx: AgentLibraryContext,
    agentId: string, sessionId: string, workId: string, runId: string, signature: string,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const matchOut = new MatchAgentOutput();
    await this.agentLibrary.matchAgent(
      Object.assign(new MatchAgentInput(), {
        task_signature: signature,
        task_content: input.task_content,
        agent_type: 'WORKER',
      }),
      matchOut,
      libCtx,
      metrics,
      report,
    );
    if (!matchOut.matched || matchOut.regenerate || !matchOut.agent_id) return false;

    await this.recordMatchedAgentUsage(matchOut.agent_id, libCtx, workId, runId, metrics, report);
    output.agent_id = matchOut.agent_id;
    return true;
  }

  private async recordMatchedAgentUsage(
    agentId: string, libCtx: AgentLibraryContext, workId: string, runId: string,
    metrics?: Metrics, report?: Report,
  ): Promise<void> {
    await this.agentLibrary.recordAgentUsage(
      Object.assign(new RecordAgentUsageInput(), {
        agent_id: agentId,
        work_id: workId,
        run_id: runId,
      }),
      new RecordAgentUsageOutput(),
      libCtx,
      metrics,
      report,
    );
  }

  private async matchStrategyForAgent(taskContent: string, complexity: number, domain: string, metrics?: Metrics, report?: Report): Promise<string> {
    const strategyOut = new MatchStrategyOutput();
    await this.agentStrategy.matchStrategy(
      Object.assign(new MatchStrategyInput(), {
        task_content: taskContent,
        task_complexity: complexity,
        task_domain: domain,
      }),
      strategyOut,
      new AgentStrategyContext(),
      metrics,
      report,
    );
    if (!strategyOut.strategy_id) {
      throw new ValidationError('Failed to match strategy');
    }
    return strategyOut.strategy_id;
  }

  private async matchLlmForBuild(ctx: AgentBuilderContext, agentId: string, runId: string, taskContent: string, fallbackLlmId: string, metrics?: Metrics, report?: Report): Promise<string> {
    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        run_id: runId,
        task_content: taskContent,
      }),
      llmOut,
      new LLMCoreContext(),
      metrics,
      report,
    );
    const llmId = llmOut.llm_id || fallbackLlmId || '';
    const llmTitle = String((llmOut.llm as Record<string, unknown> | null)?.llm_title ?? '');

    report?.emit(BusinessEvent.LlmSelected, {
      llm_id: llmId,
      llm_name: llmTitle,
      stage: 'build',
      reason: this.llmBuildReason(llmOut),
    });
    return llmId;
  }

  /** build 路径 LLM 选举原因：detail 标识映射为时间线可读文案 */
  private llmBuildReason(llmOut: MatchLLMOutput): string {
    const detail = llmOut.detail ?? '';
    if (llmOut.from_cache || detail.includes('cache')) return 'Agent 绑定（绑定事实源）';
    if (detail === 'election_llm_default') return 'LLM 选举阶梯耗尽，默认模型兜底';
    if (detail.startsWith('election_llm_')) return `LLM 统一选举命中（${detail}）`;
    return detail ? `LLM 选举判定（${detail}）` : 'Core 按任务/配额选型';
  }

  private async matchSkillForBuild(ctx: AgentBuilderContext, agentId: string, runId: string, metrics?: Metrics, report?: Report): Promise<MatchSkillOutput> {
    const skillOut = new MatchSkillOutput();
    await this.skillCore.matchSkill(
      Object.assign(new MatchSkillInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        run_id: runId,
      }),
      skillOut,
      new SkillCoreContext(),
      metrics,
      report,
    );

    const selected = this.soSelectedSkillEntries(skillOut);
    report?.emit(BusinessEvent.SkillSelected, {
      source: 'build',
      skills: selected,
      system_skills: (skillOut.system_skills ?? []).map((s) => ({ id: s.skill_id, name: this.soSkillTitle(s.skill_id), brief: s.skill_brief })),
      reason: `skillCore.matchSkill 判定终态=${skillOut.detail ?? 'unknown'}（选中技能数 ${selected.length}，其中系统级 ${(skillOut.system_skills ?? []).length} 个恒选中、沉淀命中 ${(skillOut.skills ?? []).length} 个）`,
      skills_count: selected.length,
      system_skills_count: (skillOut.system_skills ?? []).length,
    });
    return skillOut;
  }

  private soSelectedSkillEntries(skillOut: MatchSkillOutput): Array<{ id: string; name: string; system?: boolean }> {
    const merged = new Map<string, { id: string; name: string; system?: boolean }>();
    for (const s of skillOut.system_skills ?? []) {
      merged.set(s.skill_id, { id: s.skill_id, name: this.soSkillTitle(s.skill_id) || s.skill_brief, system: true });
    }
    for (const s of skillOut.skills ?? []) {
      const isSystem = s.skill_id.startsWith('skill_builtin-');
      if (!merged.has(s.skill_id)) {
        merged.set(s.skill_id, { id: s.skill_id, name: this.soSkillTitle(s.skill_id) || s.skill_brief, system: isSystem || undefined });
      }
    }
    return [...merged.values()];
  }

  /** skill_record.title 查询（组件实例展示名） */
  private soSkillTitle(id: string): string {
    return this.componentTitle(id, 'skill_record', 'title');
  }

  private componentTitle(id: string, table: string, titleCol: string): string {
    if (!this.titleLookup) this.titleLookup = createComponentTitleLookup(this.relationDb);
    return this.titleLookup(id, table, titleCol);
  }

  private async matchMcpForBuild(ctx: AgentBuilderContext, agentId: string, runId: string, metrics?: Metrics, report?: Report): Promise<MatchMcpOutput> {
    const mcpOut = new MatchMcpOutput();
    await this.mcpCore.matchMCP(
      Object.assign(new MatchMcpInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        run_id: runId,
      }),
      mcpOut,
      new McpCoreContext(),
      metrics,
      report,
    );

    report?.emit(BusinessEvent.McpSelected, {
      stage: 'build',
      mcps: (mcpOut.mcp_ids ?? []).map((id) => ({ id, name: this.componentTitle(id, 'mcp_install_record', 'mcp_title') })),
      reason: `mcpCore.matchMCP 判定终态=match_detail=${mcpOut.detail ?? 'unknown'}（MCP 数 ${(mcpOut.mcp_ids ?? []).length}）`,
      mcps_count: (mcpOut.mcp_ids ?? []).length,
    });
    return mcpOut;
  }

  private async matchSoulForBuild(ctx: AgentBuilderContext, agentId: string, runId: string, taskContent: string, taskDomain: string, metrics?: Metrics, report?: Report): Promise<MatchSoulOutput> {
    const soulOut = new MatchSoulOutput();
    await this.soulCore.matchSoul(
      Object.assign(new MatchSoulInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        run_id: runId,
        task_content: taskContent,
        task_domain: taskDomain,
      }),
      soulOut,
      new SoulCoreContext(),
      metrics,
      report,
    );

    report?.emit(BusinessEvent.SoulSelected, {
      soul_id: soulOut.soul_id || '',
      soul_name: this.componentTitle(soulOut.soul_id || '', 'soul_record', 'soul_title'),
      stage: 'build',
      reason: soulOut.soul_id
        ? 'soulCore.matchSoul 按任务领域选择/生成人格（soul 入 soul 表并落 agent 绑定）'
        : 'soulCore.matchSoul 无命中（本次构建未绑定 Soul）',
    });
    return soulOut;
  }

  private async selectPromptForAgent(agentId: string, taskText: string, domain: string, metrics?: Metrics, report?: Report): Promise<string> {
    const promptTemplateId = await this.matchPromptForAgent(agentId, taskText, domain, metrics, report);

    report?.emit(BusinessEvent.PromptSelected, {
      template_id: promptTemplateId,
      prompt_name: this.componentTitle(promptTemplateId, 'prompt_template_record', 'title'),
      stage: 'build',
      reason: promptTemplateId
        ? 'matchPromptForAgent LLM 语义评分命中特定模板（score≥75），绑定落 agent 表 prompt_template_id'
        : '无高度契合模板（评分<75），Prompt 回退执行侧内置身份模板（Brian 身份声明）',
    });
    return promptTemplateId;
  }

  private async assembleAgentComponents(
    input: BuildAgentInput, ctx: AgentBuilderContext, agentId: string,
    analysis: AgentBuildAnalysis, analysisLlm: string,
    metrics?: Metrics, report?: Report,
  ): Promise<AgentBuildComponents> {
    const [strategyId, llmId, skillOut, mcpOut, soulOut, promptTemplateId] = await Promise.all([
      this.matchStrategyForAgent(input.task_content, analysis.complexity, analysis.domain, metrics, report),
      this.matchLlmForBuild(ctx, agentId, input.run_id || ctx.run_id || '', input.task_content, analysisLlm, metrics, report),
      this.matchSkillForBuild(ctx, agentId, input.run_id || '', metrics, report),
      this.matchMcpForBuild(ctx, agentId, input.run_id || '', metrics, report),
      this.matchSoulForBuild(ctx, agentId, input.run_id || '', input.task_content, analysis.domain, metrics, report),
      this.selectPromptForAgent(agentId, input.task_content || analysis.signature, analysis.domain, metrics, report),
    ]);

    const agentName = generateAgentName(soulOut.soul, skillOut.skills || [], analysis.domain || analysis.signature);
    const agentSemantics = await this.generateAgentSemantics(
      input.task_content || analysis.signature,
      analysis.domain || '通用',
      agentName,
      String(soulOut.soul?.soul_brief ?? ''),
      (skillOut.skills ?? []).map((s) => s.skill_brief),
      mcpOut.mcp_ids ?? [],
      metrics,
    );
    const agentPurpose = agentSemantics.brief;
    return { strategyId, llmId, skillOut, mcpOut, soulOut, agentName, promptTemplateId, agentPurpose, agentSemantics };
  }

  private async persistBuiltAgent(libCtx: AgentLibraryContext, agentId: string, analysis: AgentBuildAnalysis, components: AgentBuildComponents): Promise<void> {
    const addOut = new AddAgentOutput();
    const ok = await this.agentLibrary.addAgent(
      Object.assign(new AddAgentInput(), {
        agent_id: agentId,
        agent_type: 'WORKER',
        strategy_id: components.strategyId,
        soul_id: components.soulOut.soul_id || '',
        task_signature: analysis.signature,
        agent_name: components.agentName,
        agent_purpose: components.agentPurpose,

        skill_ids: this.soSelectedSkillEntries(components.skillOut).map((s) => s.id),
        mcp_ids: components.mcpOut.mcp_ids ?? [],
        prompt_template_id: components.promptTemplateId,
        positive_examples: components.agentSemantics.positive_examples,
        negative_examples: components.agentSemantics.negative_examples,

        created_by: 'system',
      }),
      addOut,
      libCtx,
    );
    if (!ok) throw new ValidationError('addAgent failed');
  }

  private async bindCoreComponents(ctx: AgentBuilderContext, agentId: string, runId: string, components: AgentBuildComponents): Promise<void> {
    const skillIds = this.soSelectedSkillEntries(components.skillOut).map((s) => s.id);
    const mcpIds = components.mcpOut.mcp_ids ?? [];
    const soulId = components.soulOut.soul_id || '';

    await Promise.all([
      this.optSkillBindings(agentId, ctx.session_id || '', runId, skillIds),
      this.optMcpBindings(agentId, ctx.session_id || '', runId, mcpIds),
      this.optSoulBinding(agentId, ctx.session_id || '', runId, soulId),
    ]);
  }

  private async optSkillBindings(agentId: string, contextId: string, runId: string, skillIds: string[]): Promise<void> {
    await Promise.all(skillIds.map((skillId) =>
      this.skillCore.optSkill(
        Object.assign(new OptSkillInput(), {
          agent_id: agentId,
          context_id: contextId,
          run_id: runId,
          skill_id: skillId,
        }),
        new OptSkillOutput(),
        new SkillCoreContext(),
      ),
    ));
  }

  private async optMcpBindings(agentId: string, contextId: string, runId: string, mcpIds: string[]): Promise<void> {
    await Promise.all(mcpIds.map((mcpId) =>
      this.mcpCore.optMCP(
        Object.assign(new OptMcpInput(), {
          agent_id: agentId,
          context_id: contextId,
          run_id: runId,
          mcp_id: mcpId,
        }),
        new OptMcpOutput(),
        new McpCoreContext(),
      ),
    ));
  }

  private async optSoulBinding(agentId: string, contextId: string, runId: string, soulId: string): Promise<void> {
    if (!soulId) return;
    await this.soulCore.optSoul(
      Object.assign(new OptSoulInput(), {
        agent_id: agentId,
        context_id: contextId,
        run_id: runId,
        soul_id: soulId,
      }),
      new OptSoulOutput(),
      new SoulCoreContext(),
    );
  }

  private buildBuildSummary(agentId: string, analysis: AgentBuildAnalysis, components: AgentBuildComponents): Record<string, unknown> {
    return buildAgentBuildSummary({
      agentId,
      agentName: components.agentName,
      analysis,
      strategyId: components.strategyId,
      llmId: components.llmId,
      soul: components.soulOut.soul,
      skills: components.skillOut.skills || [],
      mcpIds: components.mcpOut.mcp_ids || [],
    });
  }

  private async archiveAgentBuild(
    sessionId: string, workId: string, runId: string, agentId: string,
    analysis: AgentBuildAnalysis, components: AgentBuildComponents,
    metrics?: Metrics,
  ): Promise<void> {
    if (!this.infoCore || typeof this.infoCore.saveInfo !== 'function' || !sessionId) return;
    try {
      const info = JSON.stringify({
        event: 'agent_built',
        ...this.buildBuildSummary(agentId, analysis, components),
        soul_id: components.soulOut.soul_id || '',
      });
      const saveIn = Object.assign(new SaveInfoInput(), {
        session_id: sessionId, work_id: workId, run_id: runId,
        info_type: InfoType.AGENT, info_creator_role: 'LEARNING', info_creator_id: agentId, info,
      });
      await this.infoCore.saveInfo(saveIn, new SaveInfoOutput(), new InfoCoreContext());
    } catch (err) {

      metrics?.warn('AgentBuilderService.buildAgent 构建过程存档落库失败已容忍', {
        error: err instanceof Error ? err.message : String(err), agent_id: agentId, session_id: sessionId,
      });
    }
  }

  private async loadOptimizeTarget(input: OptimizeAgentInput, libCtx: AgentLibraryContext): Promise<AgentRecord> {
    const getOut = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_id: input.agent_id }),
      getOut,
      libCtx,
    );
    if (getOut.agents.length === 0) throw new NotFoundError('Agent', input.agent_id);
    return getOut.agents[0];
  }

  private async rematchStrategy(input: OptimizeAgentInput, agent: AgentRecord, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<void> {
    const strategyOut = new MatchStrategyOutput();
    await this.agentStrategy.matchStrategy(
      Object.assign(new MatchStrategyInput(), {
        task_content: input.usage_feedback || agent.task_signature,
        task_complexity: 50,
        task_domain: '',
      }),
      strategyOut,
      new AgentStrategyContext(),
    );
    if (strategyOut.strategy_id && strategyOut.strategy_id !== agent.strategy_id) {
      output.changes.push({ component: 'strategy', from: agent.strategy_id, to: strategyOut.strategy_id });
      await this.agentLibrary.updateAgent(
        Object.assign(new UpdateAgentInput(), {
          agent_id: input.agent_id,
          strategy_id: strategyOut.strategy_id,
        }),
        new UpdateAgentOutput(),
        libCtx,
      );
    }
  }

  private async unbindStaleSkills(input: OptimizeAgentInput, agent: AgentRecord, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<void> {
    const skillAgeOut = new AgeSkillOutput();
    await this.skillCore.ageSkill(new AgeSkillInput(), skillAgeOut, new SkillCoreContext());
    const staleSkillIds = skillAgeOut.stale_skills
      .filter((s) => s.agent_id === input.agent_id && (agent.skill_ids ?? []).includes(s.skill_id))

      .map((s) => s.skill_id)
      .filter((id) => !id.startsWith('skill_builtin-'));
    if (staleSkillIds.length === 0) return;
    await this.agentLibrary.unbindAgentComponent(
      Object.assign(new UnbindAgentComponentInput(), {
        agent_id: input.agent_id,
        component_kind: ComponentKind.Skill,
        component_ids: staleSkillIds,
      }),
      new UnbindAgentComponentOutput(),
      libCtx,
    );
    for (const id of staleSkillIds) output.changes.push({ component: 'skill', from: id, to: '' });
  }

  private async unbindStaleSouls(input: OptimizeAgentInput, agent: AgentRecord, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<void> {
    const soulAgeOut = new AgeSoulOutput();
    await this.soulCore.ageSoul(new AgeSoulInput(), soulAgeOut, new SoulCoreContext());
    const staleSoulIds = soulAgeOut.stale_souls
      .filter((s) => s.agent_id === input.agent_id && s.soul_id === agent.soul_id)
      .map((s) => s.soul_id);
    if (staleSoulIds.length === 0 || !agent.soul_id) return;
    await this.agentLibrary.unbindAgentComponent(
      Object.assign(new UnbindAgentComponentInput(), {
        agent_id: input.agent_id,
        component_kind: ComponentKind.Soul,
        component_ids: staleSoulIds,
      }),
      new UnbindAgentComponentOutput(),
      libCtx,
    );
    output.changes.push({ component: 'soul', from: agent.soul_id, to: '' });
  }

  private async rematchLlm(input: OptimizeAgentInput, ctx: AgentBuilderContext, output: OptimizeAgentOutput): Promise<void> {
    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        run_id: input.run_id || '',
      }),
      llmOut,
      new LLMCoreContext(),
    );
    if (llmOut.llm_id) {
      output.changes.push({ component: 'llm', from: '', to: llmOut.llm_id });
    }
  }

  private async rebindSoul(input: OptimizeAgentInput, agent: AgentRecord, ctx: AgentBuilderContext, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<void> {
    const soulOut = new OptSoulOutput();
    await this.soulCore.optSoul(
      Object.assign(new OptSoulInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        run_id: input.run_id || '',
        soul_id: agent.soul_id,
      }),
      soulOut,
      new SoulCoreContext(),
    );
    const newSoul = soulOut.current_soul_id || '';
    if (newSoul && newSoul !== agent.soul_id) {
      await this.agentLibrary.bindAgentComponent(
        Object.assign(new BindAgentComponentInput(), {
          agent_id: input.agent_id,
          component_kind: ComponentKind.Soul,
          component_ids: [newSoul],
        }),
        new BindAgentComponentOutput(),
        libCtx,
      );
      output.changes.push({ component: 'soul', from: agent.soul_id, to: newSoul });
    }
  }

  private async rebindSkills(input: OptimizeAgentInput, agent: AgentRecord, ctx: AgentBuilderContext, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<string[]> {
    const skillMatchOut = new MatchSkillOutput();
    await this.skillCore.matchSkill(
      Object.assign(new MatchSkillInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        run_id: input.run_id || '',
      }),
      skillMatchOut,
      new SkillCoreContext(),
    );
    const matchedSkillIds = (skillMatchOut.skills ?? []).map((s) => s.skill_id);
    const diff = computeBindingDiff(agent.skill_ids ?? [], matchedSkillIds);
    if (diff.added.length > 0 || diff.removed.length > 0) {
      await this.agentLibrary.bindAgentComponent(
        Object.assign(new BindAgentComponentInput(), {
          agent_id: input.agent_id,
          component_kind: ComponentKind.Skill,
          component_ids: matchedSkillIds,
        }),
        new BindAgentComponentOutput(),
        libCtx,
      );
      for (const id of diff.added) output.changes.push({ component: 'skill', from: '', to: id });
      for (const id of diff.removed) output.changes.push({ component: 'skill', from: id, to: '' });
    }
    return matchedSkillIds;
  }

  private async rebindMcps(input: OptimizeAgentInput, agent: AgentRecord, ctx: AgentBuilderContext, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<string[]> {
    const mcpMatchOut = new MatchMcpOutput();
    await this.mcpCore.matchMCP(
      Object.assign(new MatchMcpInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        run_id: input.run_id || '',
      }),
      mcpMatchOut,
      new McpCoreContext(),
    );
    const matchedMcpIds = mcpMatchOut.mcp_ids ?? [];
    const diff = computeBindingDiff(agent.mcp_ids ?? [], matchedMcpIds);
    if (diff.added.length > 0 || diff.removed.length > 0) {
      await this.agentLibrary.bindAgentComponent(
        Object.assign(new BindAgentComponentInput(), {
          agent_id: input.agent_id,
          component_kind: ComponentKind.Mcp,
          component_ids: matchedMcpIds,
        }),
        new BindAgentComponentOutput(),
        libCtx,
      );
      for (const id of diff.added) output.changes.push({ component: 'mcp', from: '', to: id });
      for (const id of diff.removed) output.changes.push({ component: 'mcp', from: id, to: '' });
    }
    return matchedMcpIds;
  }

  private async matchLlmForAgent(agentId: string, runId: string, metrics?: Metrics, report?: Report): Promise<string> {
    const llmOut = new MatchLLMOutput();
    try {
      await this.llmCore.matchLLM(
        Object.assign(new MatchLLMInput(), {
          agent_id: agentId,
          context_id: '',
          run_id: runId || '',
        }),
        llmOut,
        new LLMCoreContext(),
        metrics,
        report,
      );
    } catch {
      return '';
    }
    return llmOut.llm_id || '';
  }

  private async analyzeTask(
    input: BuildAgentInput,
    config: AgentBuilderConfigRecord | null,
    llmId: string,
    metrics?: Metrics,
    report?: Report,
  ): Promise<{ complexity: number; domain: string; signature: string }> {
    let complexity = input.task_complexity ?? 50;
    let domain = input.task_domain ?? 'general';
    let signature = buildTaskSignature(input.task_content, domain);

    if (config?.task_analysis_prompt_template_id && llmId) {
      try {
        const variables = { task_content: input.task_content };
        const promptOut = new ExecPromptOutput();
        const okPrompt = await this.promptsAccess.execPrompt(
          Object.assign(new ExecPromptInput(), {
            id: config.task_analysis_prompt_template_id,
            variables,
          }),
          promptOut,
          new PromptContext(),
          metrics,
          report,
        );

        const prompt = okPrompt && promptOut.prompt ? promptOut.prompt : '';
        if (!prompt) {
          throw new ValidationError(`Prompt 模板不可用或渲染为空: ${config.task_analysis_prompt_template_id}`);
        }
        if (prompt) {
          const llmOut = new ExecLLMOutput();
          await this.llmAccess.execLLM(
            Object.assign(new ExecLLMInput(), { id: llmId, prompt, caller: 'AgentBuilderService.buildAgent.taskAnalysis' }),
            llmOut,
            new LLMContext(),
            metrics,
            report,
          );
          const analysis = parseJsonObject(llmOut.result);
          if (analysis) {
            if (typeof analysis.complexity === 'number') complexity = analysis.complexity;
            if (analysis.domain) domain = String(analysis.domain);
            if (analysis.signature) {
              signature = String(analysis.signature);
            } else {
              signature = buildTaskSignature(input.task_content, domain);
            }
          }
        }
      } catch {
        signature = buildTaskSignature(input.task_content, domain);
      }
    }
    return { complexity, domain, signature };
  }

  private async getStrategyIdByLabel(label: string): Promise<string> {
    const so = new SoStrategyOutput();
    await this.agentStrategy.soStrategy(
      Object.assign(new SoStrategyInput(), {
        conditions: [
          { field: 'strategy_label', operator: Operator.EQ, value: label },
          { field: 'enable', operator: Operator.EQ, value: 1 },
        ],
      }),
      so,
      new AgentStrategyContext(),
    );
    return so.strategies?.[0]?.strategy_id ?? '';
  }

  private async assertPrompt(id: string): Promise<void> {
    const out = new SoPromptOutput();
    await this.promptsAccess.soPrompt(
      Object.assign(new SoPromptInput(), {
        conditions: [{ field: 'id', operator: Operator.EQ, value: id }],
      }),
      out,
      new PromptContext(),
    );
    if (!out.list?.length) throw new ValidationError(`prompt_template_id 不存在: ${id}`);
  }

  private async getConfig(): Promise<AgentBuilderConfigRecord | null> {
    const row = await this.relationDb.selectOne(AGENT_BUILDER_CONFIG_TABLE, []);
    if (!row) return null;
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      task_analysis_prompt_template_id: String(row.task_analysis_prompt_template_id ?? ''),
      auto_optimize: row.auto_optimize === true || row.auto_optimize === 1 || row.auto_optimize === '1',
    };
  }

  private toLibCtx(ctx: AgentBuilderContext, runId: string): AgentLibraryContext {
    return Object.assign(new AgentLibraryContext(), {
      session_id: ctx.session_id,
      work_id: ctx.work_id,
      run_id: runId || ctx.run_id,
    });
  }

  private async embedFunnelText(text: string, metrics?: Metrics): Promise<number[]> {
    try {
      const out = new EmbedLLMOutput();
      await this.llmAccess.embedLLM(Object.assign(new EmbedLLMInput(), { id: '', input: text }), out, new LLMContext(), metrics);
      return out.embedding ?? [];
    } catch {
      return [];
    }
  }

  private async matchPromptForAgent(agentId: string, taskText: string, domain: string, metrics?: Metrics, report?: Report): Promise<string> {
    const funnel = createComponentFunnelTrace('prompt', agentId);
    const templateId = await this.soPromptFunnelSelect(taskText, domain, metrics, report, funnel);
    pushComponentFunnel(report, funnel, templateId ? 'prompt_selected' : 'prompt_miss');
    return templateId;
  }

  private async soPromptFunnelSelect(taskText: string, domain: string, metrics: Metrics | undefined, report: Report | undefined, funnel: ComponentFunnelTrace): Promise<string> {
    try {
      const candidates = await this.soPromptCandidates();
      if (candidates.length === 0) return '';
      const result = { templateId: '' };
      const adapter = this.promptElectionAdapter(taskText, domain, candidates, result, metrics, funnel);
      await runComponentElection(adapter, taskText, result);
      return result.templateId;
    } catch {
      return '';
    }
  }

  /** 合法候选集：启用中的模板，剔除系统内置评估/汇总/阶段类契约模板 */
  private async soPromptCandidates(): Promise<SoPromptOutput['list']> {
    const out = new SoPromptOutput();
    await this.promptsAccess.soPrompt(Object.assign(new SoPromptInput(), {}), out, new PromptContext());
    return (out.list ?? []).filter((t) => {
      if (!t.enable) return false;
      const title = t.prompt_template_title ?? '';
      if (t.is_system && (title.includes('评估') || title.includes('汇总') || title.includes('阶段') || title.includes('Think') || title.includes('Reflect') || title.includes('Answer') || title.includes('匹配'))) {
        return false;
      }
      return true;
    });
  }

  /** Prompt 选举适配器（单选择优；终端=按任务生成新模板入库，规格 3.3.3 创建新的 Prompt） */
  private promptElectionAdapter(
    taskText: string, domain: string, candidates: SoPromptOutput['list'],
    result: { templateId: string }, metrics?: Metrics, funnel?: ComponentFunnelTrace,
  ): ComponentElectionAdapter<PromptTemplateRecord> {
    return {
      component: 'prompt',
      multiSelect: false,
      directAdoptSingle: false,
      funnel,
      findReusable: async () => null,
      extractSignals: () => this.promptExtractSignals(taskText, candidates, metrics, funnel),
      tiers: () => standardTierLadder(),
      select: async (_i, _o, picked, tier) => {
        result.templateId = picked[0].id;
        funnel?.markAdopted('vector');
        metrics?.info('Prompt 选举命中', { tier: tier.label, template_id: picked[0].id });
        return true;
      },
      exhaust: async () => {
        result.templateId = await this.createPromptForTask(taskText, domain, metrics, funnel);
        return true;
      },
    };
  }

  /** 信号提取（并行）：合法集 + BM25/语义路由双通道（正/负范例双向）；结构信号弃权 */
  private async promptExtractSignals(taskText: string, candidates: SoPromptOutput['list'], metrics?: Metrics, funnel?: ComponentFunnelTrace): Promise<ElectionSignals<PromptTemplateRecord>> {
    const overrides = await loadElectionThresholdOverrides(this.relationDb, 'prompt');
    const thresholds: ElectionThresholds = { ...DEFAULT_ELECTION_THRESHOLDS, ...overrides };
    const docs = candidates.map((c) => ({ id: c.id, name: c.prompt_template_title ?? '', brief: c.prompt_template_brief ?? '' }));
    const docOf = new Map(candidates.map((c) => [c.id, c]));
    const queryEmbedding = await this.embedFunnelText(taskText, metrics);
    const [bm25Ranking, vectorRanking] = await Promise.all([
      this.promptBm25Signal(taskText, docs, funnel),
      this.promptVectorSignal(queryEmbedding, docs, metrics, funnel),
    ]);
    const pickedCandidates: ElectionCandidate<PromptTemplateRecord>[] = docs.map((d) => ({
      id: d.id, label: d.name || d.id, doc: docOf.get(d.id) as PromptTemplateRecord,
      bm25Score: 0, vectorScore: 0, exampleSim: 0, negativeSim: 0, rejectedByNegative: false,
    }));
    applySignalScores(pickedCandidates, bm25Ranking, vectorRanking);
    return { candidates: pickedCandidates, complexity: analyzeTaskComplexity({ text: taskText }), structureIds: new Set<string>(), thresholds };
  }

  /** BM25 信号（并行支路）：正/负范例双向增强后全量排序，登记漏斗明细 */
  private async promptBm25Signal(taskText: string, docs: Array<{ id: string; name: string; brief: string }>, funnel?: ComponentFunnelTrace): Promise<FunnelRankingEntry<{ id: string; name: string; brief: string }>[]> {
    const examples = await batchGetComponentExamples({
      relationDb: this.relationDb, table: PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE,
      targetIdField: 'prompt_template_id', targetIds: docs.map((d) => d.id),
    });
    const ranking = funnelBm25Ranking(taskText, docs, toFunnelBm25Options(examples));
    funnel?.addMechanism({
      mechanism: 'bm25', label: FUNNEL_MECHANISM_LABELS.bm25, adopted: ranking.some((e) => e.score >= 90 && !e.rejected),
      candidates: ranking.map((e) => ({ id: e.doc.id, name: e.doc.name || e.doc.brief.slice(0, 40), score: e.score, reason: funnelNegativeReason(e) })),
    });
    return ranking;
  }

  /** 向量信号（并行支路）：语义路由器（描述向量+正/负范例向量）全量排序，登记漏斗明细 */
  private async promptVectorSignal(queryEmbedding: number[], docs: Array<{ id: string; name: string; brief: string }>, metrics?: Metrics, funnel?: ComponentFunnelTrace): Promise<FunnelRankingEntry<{ id: string; name: string; brief: string }>[]> {
    if (!queryEmbedding || queryEmbedding.length === 0) return [];
    const items = docs.map((d) => ({ id: d.id, text: buildFunnelDocText(d.name, d.brief) }));
    const [precomputed, dualExamples] = await Promise.all([
      batchGetOrComputeEmbeddings({
        relationDb: this.relationDb, table: PROMPT_TEMPLATE_EMBEDDING_TABLE, targetIdField: 'prompt_template_id',
        items, embedFn: (t) => this.embedFunnelText(t, metrics),
      }),
      batchGetDualExampleEmbeddings({
        relationDb: this.relationDb, table: PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE, targetIdField: 'prompt_template_id',
        targetIds: docs.map((d) => d.id),
      }),
    ]);
    const ranking = await funnelSemanticRouterRanking(
      queryEmbedding, docs, (d) => this.embedFunnelText(buildFunnelDocText(d.name, d.brief), metrics),
      precomputed, dualExamples.positiveMap, dualExamples.negativeMap,
    );
    funnel?.addMechanism({
      mechanism: 'vector', label: FUNNEL_MECHANISM_LABELS.vector, adopted: ranking.some((e) => !e.rejected && e.score >= 80),
      candidates: ranking.map((e) => ({ id: e.doc.id, name: e.doc.name || e.doc.brief.slice(0, 40), score: e.score, reason: funnelNegativeReason(e) })),
    });
    return ranking;
  }

  /** 阶梯耗尽终端：按任务生成新 Prompt 模板入库并返回其 id（语义规范引擎统一收敛） */
  private async createPromptForTask(taskText: string, domain: string, metrics?: Metrics, funnel?: ComponentFunnelTrace): Promise<string> {
    const execInput = new ExecLLMInput();
    execInput.prompt = [
      '请为以下任务创作一个可复用的 Prompt 模板。输出严格 JSON（无代码块）：',
      '{"title": "模板标题（5-10个汉字，突出职能）", "template": "模板正文，用 {{task_content}} 表示任务占位符，{{context}} 表示上下文占位符"}',
      `任务内容：${taskText.slice(0, 300)}`,
      `任务领域：${domain}`,
    ].join('\n');
    execInput.max_tokens = 500;
    execInput.caller = 'AgentBuilderService.createPromptForTask';
    const execOutput = new ExecLLMOutput();
    const ok = await this.llmAccess.execLLM(execInput, execOutput, new LLMContext(), metrics);
    if (!ok) return '';
    const parsed = parseJsonObject(execOutput.result ?? '');
    const template = String(parsed?.template ?? '').trim();
    if (!template) return '';
    const addInput = new AddPromptInput();
    addInput.data = {
      prompt_template_title: String(parsed?.title ?? taskText.slice(0, 10)),
      prompt_template: template,
      prompt_template_brief: `接收任务${domain ? `（${domain} 领域）` : ''}，按模板占位符注入任务与上下文，输出结构化执行结果`,
    } as never;
    const addOutput = new AddPromptOutput();
    const created = await this.promptsAccess.addPrompt(addInput, addOutput, new PromptContext());
    if (!created) return '';
    funnel?.addDirect('创建新的 Prompt', [{ id: addOutput.id, name: String(parsed?.title ?? ''), score: 0 }]);
    metrics?.info('Prompt 选举耗尽：已生成新模板入库', { template_id: addOutput.id, title: String(parsed?.title ?? '') });
    return addOutput.id;
  }
  private async generateAgentSemantics(
    taskText: string,
    domain: string,
    agentName: string,
    soulBrief: string,
    skillBriefs: string[],
    mcpIds: string[],
    metrics?: Metrics,
  ): Promise<ComponentSemantics> {
    const extra = [
      domain ? `任务领域:${domain}` : '',
      soulBrief ? `人格:${soulBrief.slice(0, 80)}` : '',
      skillBriefs.length ? `技能:${skillBriefs.slice(0, 5).join('、').slice(0, 120)}` : '',
      mcpIds.length ? `MCP:${mcpIds.slice(0, 5).join('、')}` : '',
    ].filter(Boolean).join('；');
    const generated = await createSemanticsTaskFn(this.llmAccess)({
      kind: 'agent',
      title: agentName,
      brief: `负责 ${domain} 领域任务处理与专业解答`,
      content: taskText.slice(0, 300),
      extra,
    }).catch(() => null);
    if (generated && generated.brief) {
      metrics?.info('AgentBuilderService.generateAgentSemantics 语义四元组生成成功', { domain });
      return generated;
    }
    return {
      title: agentName,
      brief: `负责 ${domain} 领域任务处理与专业解答。参考任务：${taskText.slice(0, 60)}`,
      positive_examples: [],
      negative_examples: [],
    };
  }
}
