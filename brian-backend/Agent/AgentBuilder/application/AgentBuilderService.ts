import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, StreamAccess, Logger } from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError, NotFoundError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
  InfoType,
  PROMPT_IDS, getBuiltinTemplate, renderTemplate,
  type DataObject,
} from '@brian-agent/base';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import type {
  LLMCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess, InfoCoreAccess,
} from '@brian-agent/core';
import {
  simpleSimilarity,
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

  async buildAgent(input: BuildAgentInput, output: BuildAgentOutput, ctx: AgentBuilderContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const libCtx = this.toLibCtx(ctx, input.interact_id);
    const agentId = IdGenerator.generate();
    const sessionId = ctx.session_id || '';
    const workId = ctx.work_id || '';
    const interactId = input.interact_id || ctx.interact_id || '';

    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sessionId) {
      await this.streamAccess.pushEvent(sessionId, 'agent_building', 'AGENT_SPEC', {
        status: 'ANALYZING',
        task_content: input.task_content,
      }, { work_id: workId, interact_id: interactId, agent_id: agentId });
    }

    // 先通过 Core 为该 agent 匹配 LLM，供任务分析使用（禁止 llm_model LIMIT 1）
    const analysisLlm = await this.matchLlmForAgent(agentId, input.interact_id);
    const analysis = await this.analyzeTask(input, config, analysisLlm);
    const signature = analysis.signature;
    const complexity = analysis.complexity;
    const domain = analysis.domain;

    if (!input.force_new) {
      const matchOut = new MatchAgentOutput();
      await this.agentLibrary.matchAgent(
        Object.assign(new MatchAgentInput(), {
          task_signature: signature,
          task_content: input.task_content,
          agent_type: 'WORKER',
        }),
        matchOut,
        libCtx,
      );
      if (matchOut.matched && !matchOut.regenerate && matchOut.agent_id) {
        await this.agentLibrary.recordAgentUsage(
          Object.assign(new RecordAgentUsageInput(), {
            agent_id: matchOut.agent_id,
            work_id: ctx.work_id || '',
            interact_id: input.interact_id || ctx.interact_id || '',
          }),
          new RecordAgentUsageOutput(),
          libCtx,
        );
        output.agent_id = matchOut.agent_id;

        if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sessionId) {
          // meta.agent_id 使用本次构建的临时 agentId，与 agent_building 事件对齐，
          // 前端据此定位「构建中」的占位卡片；matched_agent_id 为命中的既有 Agent。
          await this.streamAccess.pushEvent(sessionId, 'agent_matched', 'AGENT_SPEC', {
            matched_agent_id: matchOut.agent_id,
            reused: true,
            matched_by: matchOut.matched_by || 'SIMILARITY',
          }, { work_id: workId, interact_id: interactId, agent_id: agentId });
        }
        return true;
      }
    }

    const strategyOut = new MatchStrategyOutput();
    await this.agentStrategy.matchStrategy(
      Object.assign(new MatchStrategyInput(), {
        task_content: input.task_content,
        task_complexity: complexity,
        task_domain: domain,
      }),
      strategyOut,
      new AgentStrategyContext(),
    );
    if (!strategyOut.strategy_id) {
      throw new ValidationError('Failed to match strategy');
    }

    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || ctx.interact_id || '',
      }),
      llmOut,
      new LLMCoreContext(),
    );
    const llmId = llmOut.llm_id || analysisLlm || '';

    const skillOut = new MatchSkillOutput();
    await this.skillCore.matchSkill(
      Object.assign(new MatchSkillInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      skillOut,
      new SkillCoreContext(),
    );

    const mcpOut = new MatchMcpOutput();
    await this.mcpCore.matchMCP(
      Object.assign(new MatchMcpInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      mcpOut,
      new McpCoreContext(),
    );

    const soulOut = new MatchSoulOutput();
    await this.soulCore.matchSoul(
      Object.assign(new MatchSoulInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
        task_content: input.task_content,
        task_domain: analysis.domain,
      }),
      soulOut,
      new SoulCoreContext(),
    );

    const agentName = this.generateAgentName(
      soulOut.soul,
      skillOut.skills || [],
      analysis.domain || analysis.signature,
      agentId,
    );

    // Prompt 选择：经 PromptsAccess 资源选择（纯选择，无绑定持久化；绑定落 agent 表）
    const promptTemplateId = await this.matchPromptForAgent(
      input.task_content || analysis.signature, analysis.domain,
    );

    // 为新 Agent 生成说明（LLM 基于任务与选定组件生成；该说明是后续 matchAgent 的匹配依据）
    const agentPurpose = await this.generateAgentPurpose(
      input.task_content || analysis.signature,
      analysis.domain || '通用',
      String(soulOut.soul?.soul_brief ?? ''),
      (skillOut.skills ?? []).map((s) => s.skill_brief),
      mcpOut.mcp_ids ?? [],
    );

    const addOut = new AddAgentOutput();
    const ok = await this.agentLibrary.addAgent(
      Object.assign(new AddAgentInput(), {
        agent_id: agentId,
        agent_type: 'WORKER',
        strategy_id: strategyOut.strategy_id,
        soul_id: soulOut.soul_id || '',
        task_signature: signature,
        agent_name: agentName,
        agent_purpose: agentPurpose,
        // 绑定唯一事实源 = agent 表：构建时的选择结果直接落账
        skill_ids: (skillOut.skills ?? []).map((s) => s.skill_id),
        mcp_ids: mcpOut.mcp_ids ?? [],
        prompt_template_id: promptTemplateId,
      }),
      addOut,
      libCtx,
    );
    if (!ok) throw new ValidationError('addAgent failed');

    for (const sid of skillOut.skills ?? []) {
      await this.skillCore.optSkill(
        Object.assign(new OptSkillInput(), {
          agent_id: agentId,
          context_id: ctx.session_id || '',
          interact_id: input.interact_id || '',
          skill_id: sid.skill_id,
        }),
        new OptSkillOutput(),
        new SkillCoreContext(),
      );
    }
    for (const mid of mcpOut.mcp_ids ?? []) {
      await this.mcpCore.optMCP(
        Object.assign(new OptMcpInput(), {
          agent_id: agentId,
          context_id: ctx.session_id || '',
          interact_id: input.interact_id || '',
          mcp_id: mid,
        }),
        new OptMcpOutput(),
        new McpCoreContext(),
      );
    }
    if (soulOut.soul_id) {
      await this.soulCore.optSoul(
        Object.assign(new OptSoulInput(), {
          agent_id: agentId,
          context_id: ctx.session_id || '',
          interact_id: input.interact_id || '',
          soul_id: soulOut.soul_id,
        }),
        new OptSoulOutput(),
        new SoulCoreContext(),
      );
    }

    // 依用户规范：Agent 自主构建过程保存至消息表 info_raw
    if (this.infoCore && typeof this.infoCore.saveInfo === 'function' && sessionId) {
      try {
        const saveIn = Object.assign(new SaveInfoInput(), {
          session_id: sessionId,
          work_id: workId,
          interact_id: interactId,
          info_type: InfoType.AGENT,
          info_creator_role: 'LEARNING',
          info_creator_id: agentId,
          info: JSON.stringify({
            event: 'agent_built',
            agent_id: agentId,
            agent_name: agentName,
            task_signature: signature,
            complexity,
            domain,
            strategy_id: strategyOut.strategy_id,
            llm_id: llmId,
            soul_id: soulOut.soul_id || '',
            soul: soulOut.soul,
            skills: (skillOut.skills || []).map(s => s.skill_brief || s.skill_id),
            mcps: mcpOut.mcp_ids || [],
          }),
        });
        await this.infoCore.saveInfo(saveIn, new SaveInfoOutput(), new InfoCoreContext());
      } catch {
        /* best-effort */
      }
    }

    // 流式推送 Agent 自主构建完成事件
    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sessionId) {
      await this.streamAccess.pushEvent(sessionId, 'agent_built', 'AGENT_SPEC', {
        agent_id: agentId,
        agent_name: agentName,
        task_signature: signature,
        complexity,
        domain,
        strategy_id: strategyOut.strategy_id,
        llm_id: llmId,
        soul: soulOut.soul,
        skills: (skillOut.skills || []).map(s => s.skill_brief || s.skill_id),
        mcps: mcpOut.mcp_ids || [],
      }, { work_id: workId, interact_id: interactId, agent_id: agentId });
    }

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

    const libCtx = this.toLibCtx(ctx, input.interact_id);
    const getOut = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_id: input.agent_id }),
      getOut,
      libCtx,
    );
    if (getOut.agents.length === 0) throw new NotFoundError('Agent', input.agent_id);
    const agent = getOut.agents[0];

    // 策略重匹配
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
      output.changes.push({
        component: 'strategy',
        from: agent.strategy_id,
        to: strategyOut.strategy_id,
      });
      await this.agentLibrary.updateAgent(
        Object.assign(new UpdateAgentInput(), {
          agent_id: input.agent_id,
          strategy_id: strategyOut.strategy_id,
        }),
        new UpdateAgentOutput(),
        libCtx,
      );
    }

    // ===== 评估驱动的解绑：Core ageSkill/ageSoul 输出低使用候选（评估依据），Agent 模块执行解绑 =====
    const skillAgeOut = new AgeSkillOutput();
    await this.skillCore.ageSkill(new AgeSkillInput(), skillAgeOut, new SkillCoreContext());
    const staleSkillIds = skillAgeOut.stale_skills
      .filter((s) => s.agent_id === input.agent_id && (agent.skill_ids ?? []).includes(s.skill_id))
      .map((s) => s.skill_id);
    if (staleSkillIds.length > 0) {
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
    const soulAgeOut = new AgeSoulOutput();
    await this.soulCore.ageSoul(new AgeSoulInput(), soulAgeOut, new SoulCoreContext());
    const staleSoulIds = soulAgeOut.stale_souls
      .filter((s) => s.agent_id === input.agent_id && s.soul_id === agent.soul_id)
      .map((s) => s.soul_id);
    if (staleSoulIds.length > 0 && agent.soul_id) {
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

    // LLM 重新匹配：绑定只写入 LLMProvider 的 agent_llm，不再回写 agent 表 llm_id
    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      llmOut,
      new LLMCoreContext(),
    );
    if (llmOut.llm_id) {
      output.changes.push({ component: 'llm', from: '', to: llmOut.llm_id });
    }

    const soulOut = new OptSoulOutput();
    await this.soulCore.optSoul(
      Object.assign(new OptSoulInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
        soul_id: agent.soul_id,
      }),
      soulOut,
      new SoulCoreContext(),
    );
    // Soul：optSoul 输出裁决与生效 soul（不落绑定），重绑由 Agent 模块写 agent 表
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

    const skillMatchOut = new MatchSkillOutput();
    await this.skillCore.matchSkill(
      Object.assign(new MatchSkillInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      skillMatchOut,
      new SkillCoreContext(),
    );
    // Skill：matchSkill 已改纯选择（绑定唯一事实源 = agent 表）；此处评估后整组重绑 + usage 记录
    const matchedSkillIds = (skillMatchOut.skills ?? []).map((s) => s.skill_id);
    const boundSkillIds = agent.skill_ids ?? [];
    const addedSkills = matchedSkillIds.filter((id) => !boundSkillIds.includes(id));
    const removedSkills = boundSkillIds.filter((id) => !matchedSkillIds.includes(id));
    if (addedSkills.length > 0 || removedSkills.length > 0) {
      await this.agentLibrary.bindAgentComponent(
        Object.assign(new BindAgentComponentInput(), {
          agent_id: input.agent_id,
          component_kind: ComponentKind.Skill,
          component_ids: matchedSkillIds,
        }),
        new BindAgentComponentOutput(),
        libCtx,
      );
      for (const id of addedSkills) output.changes.push({ component: 'skill', from: '', to: id });
      for (const id of removedSkills) output.changes.push({ component: 'skill', from: id, to: '' });
    }
    for (const skillId of matchedSkillIds) {
      await this.skillCore.optSkill(
        Object.assign(new OptSkillInput(), {
          agent_id: input.agent_id,
          context_id: ctx.session_id || '',
          interact_id: input.interact_id || '',
          skill_id: skillId,
        }),
        new OptSkillOutput(),
        new SkillCoreContext(),
      );
    }

    const mcpMatchOut = new MatchMcpOutput();
    await this.mcpCore.matchMCP(
      Object.assign(new MatchMcpInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      mcpMatchOut,
      new McpCoreContext(),
    );
    // MCP：同 Skill，评估后整组重绑（agent 表）+ usage 记录
    const matchedMcpIds = mcpMatchOut.mcp_ids ?? [];
    const boundMcpIds = agent.mcp_ids ?? [];
    const addedMcps = matchedMcpIds.filter((id) => !boundMcpIds.includes(id));
    const removedMcps = boundMcpIds.filter((id) => !matchedMcpIds.includes(id));
    if (addedMcps.length > 0 || removedMcps.length > 0) {
      await this.agentLibrary.bindAgentComponent(
        Object.assign(new BindAgentComponentInput(), {
          agent_id: input.agent_id,
          component_kind: ComponentKind.Mcp,
          component_ids: matchedMcpIds,
        }),
        new BindAgentComponentOutput(),
        libCtx,
      );
      for (const id of addedMcps) output.changes.push({ component: 'mcp', from: '', to: id });
      for (const id of removedMcps) output.changes.push({ component: 'mcp', from: id, to: '' });
    }
    for (const mcpId of matchedMcpIds) {
      await this.mcpCore.optMCP(
        Object.assign(new OptMcpInput(), {
          agent_id: input.agent_id,
          context_id: ctx.session_id || '',
          interact_id: input.interact_id || '',
          mcp_id: mcpId,
        }),
        new OptMcpOutput(),
        new McpCoreContext(),
      );
    }

    output.optimized = output.changes.length > 0;
    return true;
  }

  // ===== 系统 Agent 配置映射 =====
  private static readonly SYSTEM_AGENT_CONFIG: Record<string, { strategyLabel: string; signatureKey: string; defaultName: string }> = {
    PLANNER: { strategyLabel: 'Plan-and-Solve', signatureKey: 'planner', defaultName: '系统-Planner' },
    WRITER: { strategyLabel: 'CoT', signatureKey: 'writer', defaultName: '系统-Writer' },
    EVOLUTOR: { strategyLabel: 'ReAct', signatureKey: 'evolutor', defaultName: '系统-Evolutor' },
    SUMMARY: { strategyLabel: 'CoT', signatureKey: 'summary', defaultName: '系统-Summary' },
    INTENT: { strategyLabel: 'CoT', signatureKey: 'intent', defaultName: '需求理解 Agent' },
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
    await this.matchLlmForAgent(agentId, ctx.interact_id || '');
    let soulId = '';
    if (agentType !== 'SUMMARY' && agentType !== 'INTENT') {
      const soulOut = new MatchSoulOutput();
      await this.soulCore.matchSoul(
        Object.assign(new MatchSoulInput(), {
          agent_id: agentId,
          context_id: ctx.session_id || '',
          interact_id: ctx.interact_id || '',
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
          interact_id: '',
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

  private async matchLlmForAgent(agentId: string, interactId: string): Promise<string> {
    const llmOut = new MatchLLMOutput();
    try {
      await this.llmCore.matchLLM(
        Object.assign(new MatchLLMInput(), {
          agent_id: agentId,
          context_id: '',
          interact_id: interactId || '',
        }),
        llmOut,
        new LLMCoreContext(),
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
        );
        let prompt = okPrompt && promptOut.prompt ? promptOut.prompt : '';
        if (!prompt) {
          const tpl = getBuiltinTemplate(PROMPT_IDS.taskAnalysis);
          if (tpl) prompt = renderTemplate(tpl, variables);
        }
        if (prompt) {
          const llmOut = new ExecLLMOutput();
          await this.llmAccess.execLLM(
            Object.assign(new ExecLLMInput(), { id: llmId, prompt }),
            llmOut,
            new LLMContext(),
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

  private toLibCtx(ctx: AgentBuilderContext, interactId: string): AgentLibraryContext {
    return Object.assign(new AgentLibraryContext(), {
      session_id: ctx.session_id,
      work_id: ctx.work_id,
      interact_id: interactId || ctx.interact_id,
    });
  }

  /**
   * Prompt 选择（纯选择，无绑定持久化）：经 PromptsAccess 取启用模板，
   * simpleSimilarity 对任务文本与 模板名+摘要 打分取最优；无候选或低分回退空串（执行侧内置兜底）。
   */
  private async matchPromptForAgent(taskText: string, domain: string): Promise<string> {
    try {
      const out = new SoPromptOutput();
      await this.promptsAccess.soPrompt(Object.assign(new SoPromptInput(), {}), out, new PromptContext());
      let bestId = '';
      let bestScore = 0;
      for (const t of out.list ?? []) {
        if (t.enable === false) continue;
        const haystack = `${t.prompt_template_title ?? ''} ${t.prompt_template_brief ?? ''}`;
        const score = Math.max(
          simpleSimilarity(taskText, haystack),
          simpleSimilarity(domain, haystack),
        );
        if (score > bestScore) {
          bestScore = score;
          bestId = t.id;
        }
      }
      return bestScore > 0 ? bestId : '';
    } catch {
      return '';
    }
  }

  /**
   * 为新 Agent 生成说明（LLM；说明是后续 matchAgent 的匹配依据，需概括领域/职责/组件能力）。
   * LLM 失败时回退为任务拼串兜底。
   */
  private async generateAgentPurpose(
    taskText: string,
    domain: string,
    soulBrief: string,
    skillBriefs: string[],
    mcpIds: string[],
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
      const ok = await this.llmAccess.execLLM(execInput, execOutput, new LLMContext());
      const text = (execOutput.result ?? '').trim();
      return ok && text ? text.slice(0, 200) : fallback;
    } catch {
      return fallback;
    }
  }

  private generateAgentName(
    soul: Record<string, unknown> | null,
    skills: Array<{ skill_id: string; skill_brief: string; relevance: number }>,
    domain: string,
    agentId: string,
  ): string {
    const parts: string[] = []
    if (domain) parts.push(domain)
    const soulBrief = (soul as Record<string, string> | null)?.soul_brief || ''
    if (soulBrief) parts.push(soulBrief)
    else if (skills.length > 0 && skills[0].skill_brief) parts.push(skills[0].skill_brief)
    if (parts.length === 0) return `Agent-${agentId.slice(0, 8)}`
    return parts.join('-')
  }
}
