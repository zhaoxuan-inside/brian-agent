import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, StreamAccess, Logger } from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError, NotFoundError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
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

/** 构建期组件装配结果（策略/LLM/技能/MCP/人格 + 命名与 Prompt 选择） */
interface AgentBuildComponents {
  strategyId: string;
  llmId: string;
  skillOut: MatchSkillOutput;
  mcpOut: MatchMcpOutput;
  soulOut: MatchSoulOutput;
  agentName: string;
  promptTemplateId: string;
  agentPurpose: string;
}

/**
 * AgentBuilder：组装 Agent 实例。
 * - LLM/Skill/MCP/Soul 匹配全部委托 Core，Agent 层不做 llm_model 自选。
 * - optimizeAgent 由 EvolutorAgent 在评估后决定是否调用；用于保存策略与工具绑定调整。
 * - Skill/MCP 绑定的写入与读取均经由 SkillCore/MCPCore 的接口完成，Agent 层不直接
 *   操作 Core 的 agent_skill / agent_mcp 绑定表。
 */
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

  // ===== 修改后的方法（2026-09-19）：构建阶段每个组件的选择/生成逐一上报 ——
  // llm/skill/mcp/soul/prompt 在各自 Core 匹配完成后即时 emit（LLM/Skill/MCP/Soul/Prompt 组件
  // 各自的「选定」事件带 stage='build' 与选择原因），使 thinking 过程可看到本次新建 Agent
  // 的组件装配明细，而不是只在最终 agent.components 汇总一处 =====
  async buildAgent(input: BuildAgentInput, output: BuildAgentOutput, ctx: AgentBuilderContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const libCtx = this.toLibCtx(ctx, input.run_id);
    const agentId = IdGenerator.generate();
    const sessionId = ctx.session_id || '';
    const workId = ctx.work_id || '';
    const runId = input.run_id || ctx.run_id || '';

    await this.emitAgentBuildingEvent(sessionId, workId, runId, agentId, input.task_content);

    // 先通过 Core 为该 agent 匹配 LLM，供任务分析使用（禁止 llm_model LIMIT 1）
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
    await this.emitAgentBuiltEvent(sessionId, workId, runId, agentId, analysis, components);

    // 自动优化由 Evolutor 评估后经 MQ 触发 optimizeAgent，auto_optimize 开关在 optimizeAgent 入口读取
    output.agent_id = agentId;
    return true;
  }

  /**
   * 由 EvolutorAgent 在 need_optimize 时调用。
   * 重新匹配策略与 Core 组件，并将变更写回 agent 表与 Core 绑定表。
   */
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

  // ===== 修改后的系统 Agent 配置映射（纯汉字功能名称，不含助手后缀，系统属性由 created_by/agent_type 独立保存） =====
  private static readonly SYSTEM_AGENT_CONFIG: Record<string, { strategyLabel: string; signatureKey: string; defaultName: string }> = {
    PLANNER: { strategyLabel: 'Plan-and-Solve', signatureKey: 'planner', defaultName: '任务规划' },
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
    // LLM 绑定只存在于 LLMProvider 的 agent_llm，构建时经 matchLLM 写入（此处解析仅用于任务分析）
    // matchLLM 有副作用：写入 agent_llm 绑定（返回值此处不使用）
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

  // ---------------------------------------------------------------------------
  // buildAgent 私有步骤（构建编排的各语义阶段）
  // ---------------------------------------------------------------------------

  /** 推送 agent_building 流事件（构建起点 ANALYZING 状态；无流会话时静默跳过）。 */
  private async emitAgentBuildingEvent(sessionId: string, workId: string, runId: string, agentId: string, taskContent: string): Promise<void> {
    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sessionId) {
      await this.streamAccess.pushEvent(sessionId, 'agent_building', 'AGENT_SPEC', {
        status: 'ANALYZING',
        task_content: taskContent,
      }, { work_id: workId, run_id: runId, agent_id: agentId });
    }
  }

  /** 非强制新建时按签名匹配既有 Agent：命中即记录使用并复用（返回 true），未命中返回 false。 */
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
    await this.emitAgentMatchedEvent(sessionId, workId, runId, agentId, matchOut);
    return true;
  }

  /** 记录命中 Agent 的使用次数（usage 统计，供老化与评估频率判定）。 */
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

  /** 推送 agent_matched 流事件（meta.agent_id 为本次构建临时 ID，与 agent_building 事件对齐，前端据此定位占位卡片）。 */
  private async emitAgentMatchedEvent(sessionId: string, workId: string, runId: string, agentId: string, matchOut: MatchAgentOutput): Promise<void> {
    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sessionId) {
      await this.streamAccess.pushEvent(sessionId, 'agent_matched', 'AGENT_SPEC', {
        matched_agent_id: matchOut.agent_id,
        reused: true,
        matched_by: matchOut.matched_by || 'SIMILARITY',
      }, { work_id: workId, run_id: runId, agent_id: agentId });
    }
  }

  /** 匹配执行策略（按任务内容/复杂度/领域）；未命中抛 ValidationError。 */
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

  /** 构建阶段经 Core.matchLLM 选定 LLM（绑定事实源 = agent_llm，由 matchLLM 写入），并即时上报 LlmSelected 事件。 */
  private async matchLlmForBuild(ctx: AgentBuilderContext, agentId: string, runId: string, fallbackLlmId: string, metrics?: Metrics, report?: Report): Promise<string> {
    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        run_id: runId,
      }),
      llmOut,
      new LLMCoreContext(),
      metrics,
      report,
    );
    const llmId = llmOut.llm_id || fallbackLlmId || '';
    // ===== 2026-09-19：LLM 组件选定体现（构建阶段；绑定事实源 = agent_llm，由 matchLLM 写入） =====
    report?.pushBusinessEvent(BusinessEvent.LlmSelected, {
      llm_id: llmId,
      stage: 'build',
      reason: 'Core 按任务/配额选型（matchLLM 选定并写入 agent_llm 绑定，供任务分析与本 Agent 执行复用）',
    });
    return llmId;
  }

  /** 构建阶段经 Core.matchSkill 选定技能（纯选择，绑定落 agent 表 skill_ids），并即时上报 SkillSelected 事件。 */
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
    // ===== 2026-09-19：Skill 组件选定体现（构建阶段；绑定落 agent 表 skill_ids） =====
    report?.pushBusinessEvent(BusinessEvent.SkillSelected, {
      source: 'build',
      skills: (skillOut.skills ?? []).map((s) => ({ id: s.skill_id, brief: s.skill_brief })),
      reason: `skillCore.matchSkill 判定终态=match_detail=${skillOut.detail ?? 'unknown'}（技能数 ${(skillOut.skills ?? []).length}）`,
      skills_count: (skillOut.skills ?? []).length,
    });
    return skillOut;
  }

  /** 构建阶段经 Core.matchMCP 选定外部工具通道（纯选择，绑定落 agent 表 mcp_ids），并即时上报 McpSelected 事件。 */
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
    // ===== 2026-09-19：MCP 组件选定体现（构建阶段；绑定落 agent 表 mcp_ids） =====
    report?.pushBusinessEvent(BusinessEvent.McpSelected, {
      stage: 'build',
      mcps: (mcpOut.mcp_ids ?? []).map((id) => ({ id, brief: '' })),
      reason: `mcpCore.matchMCP 判定终态=match_detail=${mcpOut.detail ?? 'unknown'}（MCP 数 ${(mcpOut.mcp_ids ?? []).length}）`,
      mcps_count: (mcpOut.mcp_ids ?? []).length,
    });
    return mcpOut;
  }

  /** 构建阶段经 Core.matchSoul 按任务领域选择/生成人格（命中即复用、未命中由 Core 生成入库），并即时上报 SoulSelected 事件。 */
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
    // ===== 2026-09-19：Soul 组件选定/生成体现（构建阶段；命中即复用、未命中由 Core 生成入库） =====
    report?.pushBusinessEvent(BusinessEvent.SoulSelected, {
      soul_id: soulOut.soul_id || '',
      brief: String(soulOut.soul?.soul_brief ?? '').slice(0, 200),
      stage: 'build',
      reason: soulOut.soul_id
        ? 'soulCore.matchSoul 按任务领域选择/生成人格（soul 入 soul 表并落 agent 绑定）'
        : 'soulCore.matchSoul 无命中（本次构建未绑定 Soul）',
    });
    return soulOut;
  }

  /** 选择 Prompt 模板（LLM 语义评分 ≥75 采纳特定模板，否则回退空串走执行侧内置身份模板），并即时上报 PromptSelected 事件。 */
  private async selectPromptForAgent(taskText: string, domain: string, metrics?: Metrics, report?: Report): Promise<string> {
    const promptTemplateId = await this.matchPromptForAgent(taskText, domain, metrics, report);
    // ===== 2026-09-19：Prompt 组件选定体现（构建阶段；LLM 语义评分 ≥75 才采纳特定模板，否则回退内置身份模板） =====
    report?.pushBusinessEvent(BusinessEvent.PromptSelected, {
      template_id: promptTemplateId,
      stage: 'build',
      reason: promptTemplateId
        ? 'matchPromptForAgent LLM 语义评分命中特定模板（score≥75），绑定落 agent 表 prompt_template_id'
        : '无高度契合模板（评分<75），Prompt 回退执行侧内置身份模板（Brian 身份声明）',
    });
    return promptTemplateId;
  }

  /** 装配新 Agent 全部组件：策略 → LLM → 技能 → MCP → 人格 → 命名 → Prompt → 用途说明（顺序即上报顺序）。 */
  private async assembleAgentComponents(
    input: BuildAgentInput, ctx: AgentBuilderContext, agentId: string,
    analysis: AgentBuildAnalysis, analysisLlm: string,
    metrics?: Metrics, report?: Report,
  ): Promise<AgentBuildComponents> {
    const strategyId = await this.matchStrategyForAgent(input.task_content, analysis.complexity, analysis.domain, metrics, report);
    const llmId = await this.matchLlmForBuild(ctx, agentId, input.run_id || ctx.run_id || '', analysisLlm, metrics, report);
    const skillOut = await this.matchSkillForBuild(ctx, agentId, input.run_id || '', metrics, report);
    const mcpOut = await this.matchMcpForBuild(ctx, agentId, input.run_id || '', metrics, report);
    const soulOut = await this.matchSoulForBuild(ctx, agentId, input.run_id || '', input.task_content, analysis.domain, metrics, report);
    const agentName = generateAgentName(soulOut.soul, skillOut.skills || [], analysis.domain || analysis.signature);
    const promptTemplateId = await this.selectPromptForAgent(input.task_content || analysis.signature, analysis.domain, metrics, report);
    const agentPurpose = await this.generateAgentPurpose(
      input.task_content || analysis.signature,
      analysis.domain || '通用',
      String(soulOut.soul?.soul_brief ?? ''),
      (skillOut.skills ?? []).map((s) => s.skill_brief),
      mcpOut.mcp_ids ?? [],
      metrics,
      report,
    );
    return { strategyId, llmId, skillOut, mcpOut, soulOut, agentName, promptTemplateId, agentPurpose };
  }

  /** 持久化新 Agent（addAgent 落 agent 表，构建期组件选择直接落账、归属 system）；失败抛 ValidationError。 */
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
        // 绑定唯一事实源 = agent 表：构建时的选择结果直接落账
        skill_ids: (components.skillOut.skills ?? []).map((s) => s.skill_id),
        mcp_ids: components.mcpOut.mcp_ids ?? [],
        prompt_template_id: components.promptTemplateId,
        // ===== 2026-09-11：自动构建的 Agent 归属 system（解散动作仅作用于系统侧） =====
        created_by: 'system',
      }),
      addOut,
      libCtx,
    );
    if (!ok) throw new ValidationError('addAgent failed');
  }

  /** 构建后组件绑定收尾：技能 / MCP / 人格逐项经 Core opt 写绑定与 usage。 */
  private async bindCoreComponents(ctx: AgentBuilderContext, agentId: string, runId: string, components: AgentBuildComponents): Promise<void> {
    await this.optSkillBindings(agentId, ctx.session_id || '', runId, (components.skillOut.skills ?? []).map((s) => s.skill_id));
    await this.optMcpBindings(agentId, ctx.session_id || '', runId, components.mcpOut.mcp_ids ?? []);
    await this.optSoulBinding(agentId, ctx.session_id || '', runId, components.soulOut.soul_id || '');
  }

  /** 为 Agent 逐个绑定技能（Core optSkill 写绑定与 usage）。 */
  private async optSkillBindings(agentId: string, contextId: string, runId: string, skillIds: string[]): Promise<void> {
    for (const skillId of skillIds) {
      await this.skillCore.optSkill(
        Object.assign(new OptSkillInput(), {
          agent_id: agentId,
          context_id: contextId,
          run_id: runId,
          skill_id: skillId,
        }),
        new OptSkillOutput(),
        new SkillCoreContext(),
      );
    }
  }

  /** 为 Agent 逐个绑定 MCP（Core optMCP 写绑定与 usage）。 */
  private async optMcpBindings(agentId: string, contextId: string, runId: string, mcpIds: string[]): Promise<void> {
    for (const mcpId of mcpIds) {
      await this.mcpCore.optMCP(
        Object.assign(new OptMcpInput(), {
          agent_id: agentId,
          context_id: contextId,
          run_id: runId,
          mcp_id: mcpId,
        }),
        new OptMcpOutput(),
        new McpCoreContext(),
      );
    }
  }

  /** 为 Agent 绑定人格（Core optSoul 写绑定与 usage；soulId 为空跳过）。 */
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

  /** 组装构建产物摘要（领域服务纯函数；info_raw 存档与 agent_built 流事件共用）。 */
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

  /** 构建过程存档（依用户规范落 info_raw，best-effort）：Agent 主体已创建完成，存档失败仅影响记忆溯源。 */
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
      /* best-effort */
      // 容忍构建过程存档失败：Agent 主体已创建完成，存档缺失仅影响记忆溯源
      metrics?.warn('AgentBuilderService.buildAgent 构建过程存档落库失败已容忍', {
        error: err instanceof Error ? err.message : String(err), agent_id: agentId, session_id: sessionId,
      });
    }
  }

  /** 流式推送 Agent 自主构建完成事件（agent_built；无流会话时静默跳过）。 */
  private async emitAgentBuiltEvent(
    sessionId: string, workId: string, runId: string, agentId: string,
    analysis: AgentBuildAnalysis, components: AgentBuildComponents,
  ): Promise<void> {
    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sessionId) {
      const summary = this.buildBuildSummary(agentId, analysis, components);
      await this.streamAccess.pushEvent(sessionId, 'agent_built', 'AGENT_SPEC', summary, { work_id: workId, run_id: runId, agent_id: agentId });
    }
  }

  // ---------------------------------------------------------------------------
  // optimizeAgent 私有步骤（优化编排的各语义阶段）
  // ---------------------------------------------------------------------------

  /** 加载待优化 Agent（soAgent 查 agent 表）；不存在抛 NotFoundError。 */
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

  /** 策略重匹配（按 usage_feedback 或原任务签名）：命中不同策略时记录变更并回写 agent 表。 */
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

  /** 评估驱动解绑低使用技能：Core ageSkill 输出候选（评估依据），Agent 模块执行解绑并记录变更。 */
  private async unbindStaleSkills(input: OptimizeAgentInput, agent: AgentRecord, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<void> {
    const skillAgeOut = new AgeSkillOutput();
    await this.skillCore.ageSkill(new AgeSkillInput(), skillAgeOut, new SkillCoreContext());
    const staleSkillIds = skillAgeOut.stale_skills
      .filter((s) => s.agent_id === input.agent_id && (agent.skill_ids ?? []).includes(s.skill_id))
      .map((s) => s.skill_id);
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

  /** 评估驱动解绑低使用人格：Core ageSoul 输出候选，命中当前 soul 时执行解绑并记录变更。 */
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

  /** LLM 重新匹配：绑定只写入 LLMProvider 的 agent_llm，不回写 agent 表；命中即记录变更。 */
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

  /** Soul 重绑定：optSoul 输出裁决与生效 soul（不落绑定），生效变化时由 Agent 模块回写 agent 表并记录变更。 */
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

  /** Skill 整组重绑：matchSkill 已改纯选择（绑定唯一事实源 = agent 表），差异后整组回写并记录变更；返回匹配到的技能 ID。 */
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

  /** MCP 整组重绑：同 Skill，差异后整组回写（agent 表）并记录变更；返回匹配到的 MCP ID。 */
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

  // ---------------------------------------------------------------------------
  // 既有私有辅助
  // ---------------------------------------------------------------------------

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
        // ===== 2026-09-11：删除硬编码内存回退；DB 渲染缺失 fail-loud =====
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

  // ===== 修改后的方法（大模型语义评判，统一百分制 0-100，过滤内部系统模板，无强匹配回退空串） =====
  private async matchPromptForAgent(taskText: string, domain: string, metrics?: Metrics, report?: Report): Promise<string> {
    try {
      const out = new SoPromptOutput();
      await this.promptsAccess.soPrompt(Object.assign(new SoPromptInput(), {}), out, new PromptContext(), metrics, report);
      // 过滤系统内部流转组件模板（Planner DAG、Evolutor 评估、Writer 响应、Think/Reflect 阶段等）
      const candidates = (out.list ?? []).filter((t) => {
        if (!t.enable) return false;
        const title = t.prompt_template_title ?? '';
        if (t.is_system && (title.includes('任务拆解') || title.includes('评估') || title.includes('汇总') || title.includes('阶段') || title.includes('Think') || title.includes('Reflect') || title.includes('Answer') || title.includes('匹配'))) {
          return false;
        }
        return true;
      });

      if (candidates.length === 0) return '';

      // 大模型语义评判（百分制 0-100，采纳阈值 75 分）
      const execInput = new ExecLLMInput();
      execInput.prompt = [
        '为以下用户任务评估最匹配的特定提示词模板（如无高度契合的专业模板，请给出低于 70 的分数）：',
        `任务内容：${taskText.slice(0, 300)}`,
        `任务领域：${domain}`,
        '',
        '候选模板列表：',
        ...candidates.map((c, i) => `${i + 1}. ID: ${c.id}, 标题: ${c.prompt_template_title}, 说明: ${c.prompt_template_brief ?? ''}`),
        '',
        '请以 JSON 格式输出评估结果（score 为 0-100 的整数，表示匹配契合度；若无高度匹配的特定模板请给出低于 70 的分数）：',
        '{"template_id": "...", "score": 85, "reason": "..."}',
        '只输出 JSON，不要任何其他文本。',
      ].join('\n');
      execInput.max_tokens = 200;

      const execOutput = new ExecLLMOutput();
      execInput.caller = 'AgentBuilderService.matchPromptTemplate.llmScore';
      const ok = await this.llmAccess.execLLM(execInput, execOutput, new LLMContext(), metrics, report);
      if (!ok || !execOutput.result) return '';

      const parsed = parseJsonObject(execOutput.result);
      if (!parsed) return '';

      const score = Number(parsed.score ?? 0);
      const normalizedScore = score > 0 && score <= 1 ? Math.round(score * 100) : Math.round(score);
      const templateId = String(parsed.template_id ?? '');

      if (normalizedScore >= 75 && templateId && candidates.some((c) => c.id === templateId)) {
        return templateId;
      }
      return '';
    } catch {
      return '';
    }
  }

  /**
   * 为新 Agent 生成说明（LLM；说明是后续 matchAgent 的匹配依据，需概括领域/职责/组件能力；透传 metrics/report）。
   * LLM 失败时回退为任务拼串兜底。
   */
  private async generateAgentPurpose(
    taskText: string,
    domain: string,
    soulBrief: string,
    skillBriefs: string[],
    mcpIds: string[],
    metrics?: Metrics,
    report?: Report,
  ): Promise<string> {
    const fallback = `负责 ${domain} 领域任务处理: ${taskText.slice(0, 120)}`;
    try {
      const execInput = new ExecLLMInput();
      execInput.prompt = [
        '为以下新 Agent 生成一句中文说明（50 字以内），概括其负责的任务领域、职责与可用能力。',
        '说明将用于后续按语义相似度匹配 Agent，请包含关键领域词。',
        `任务：${taskText.slice(0, 200)}`,
        `领域：${domain}`,
        soulBrief ? `人格：${soulBrief.slice(0, 80)}` : '',
        skillBriefs.length ? `技能：${skillBriefs.slice(0, 5).join('、').slice(0, 120)}` : '',
        mcpIds.length ? `MCP：${mcpIds.slice(0, 5).join('、')}` : '',
        '只输出说明文本，不要任何前缀或引号。',
      ].filter(Boolean).join('\n');
      const execOutput = new ExecLLMOutput();
      execInput.caller = 'AgentBuilderService.generateAgentPurpose';
      const ok = await this.llmAccess.execLLM(execInput, execOutput, new LLMContext(), metrics, report);
      const text = (execOutput.result ?? '').trim();
      return ok && text ? text.slice(0, 200) : fallback;
    } catch {
      return fallback;
    }
  }
}
