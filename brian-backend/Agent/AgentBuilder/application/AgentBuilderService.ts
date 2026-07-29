import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError, NotFoundError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
  type DataObject,
} from '@brian-agent/base';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import type {
  LLMCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess,
} from '@brian-agent/core';
import {
  type AgentBuilderConfigRecord,
  AGENT_BUILDER_CONFIG_TABLE,
  AgentBuilderContext,
  BuildAgentInput, BuildAgentOutput,
  OptimizeAgentInput, OptimizeAgentOutput,
  BuildSystemAgentOutput,
  BuildPlannerAgentInput, BuildPlannerAgentOutput,
  BuildWriterAgentInput, BuildWriterAgentOutput,
  BuildEvolutorAgentInput, BuildEvolutorAgentOutput,
  ConfigAgentBuilderInput, ConfigAgentBuilderOutput,
} from '../domain/types';
import {
  AddAgentInput, AddAgentOutput, GetAgentInput, GetAgentOutput,
  UpdateAgentInput, UpdateAgentOutput, MatchAgentInput, MatchAgentOutput,
  RecordAgentUsageInput, RecordAgentUsageOutput, AgentLibraryContext,
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
  ) {}

  async buildAgent(
    input: BuildAgentInput,
    ctx: AgentBuilderContext,
    output: BuildAgentOutput,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const libCtx = this.toLibCtx(ctx, input.interact_id);
    const agentId = IdGenerator.generate();

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
          agent_type: 'WORKER',
        }),
        libCtx,
        matchOut,
      );
      if (matchOut.agent_id) {
        await this.agentLibrary.recordAgentUsage(
          Object.assign(new RecordAgentUsageInput(), {
            agent_id: matchOut.agent_id,
            work_id: ctx.work_id || '',
            interact_id: input.interact_id || ctx.interact_id || '',
          }),
          libCtx,
          new RecordAgentUsageOutput(),
        );
        output.agent_id = matchOut.agent_id;
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
      new AgentStrategyContext(),
      strategyOut,
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
      new LLMCoreContext(),
      llmOut,
    );
    const llmId = llmOut.llm_id || analysisLlm || '';

    const skillOut = new MatchSkillOutput();
    await this.skillCore.matchSkill(
      Object.assign(new MatchSkillInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      new SkillCoreContext(),
      skillOut,
    );

    const mcpOut = new MatchMcpOutput();
    await this.mcpCore.matchMCP(
      Object.assign(new MatchMcpInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      new McpCoreContext(),
      mcpOut,
    );

    const soulOut = new MatchSoulOutput();
    await this.soulCore.matchSoul(
      Object.assign(new MatchSoulInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      new SoulCoreContext(),
      soulOut,
    );

    const addOut = new AddAgentOutput();
    const ok = await this.agentLibrary.addAgent(
      Object.assign(new AddAgentInput(), {
        agent_id: agentId,
        agent_type: 'WORKER',
        strategy_id: strategyOut.strategy_id,
        llm_id: llmId,
        soul_id: soulOut.soul_id || '',
        task_signature: signature,
        agent_name: `Agent-${agentId.slice(0, 8)}`,
      }),
      libCtx,
      addOut,
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
        new SkillCoreContext(),
        new OptSkillOutput(),
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
        new McpCoreContext(),
        new OptMcpOutput(),
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
        new SoulCoreContext(),
        new OptSoulOutput(),
      );
    }

    // auto_optimize 仅标记配置；实际优化由 Evolutor 评估后触发
    output.agent_id = agentId;
    return true;
  }

  /**
   * 由 EvolutorAgent 在 need_optimize 时调用。
   * 重新匹配策略与 Core 组件，并将变更写回 agent 表与 Core 绑定表。
   */
  async optimizeAgent(
    input: OptimizeAgentInput,
    ctx: AgentBuilderContext,
    output: OptimizeAgentOutput,
  ): Promise<boolean> {
    const libCtx = this.toLibCtx(ctx, input.interact_id);
    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(
      Object.assign(new GetAgentInput(), { agent_id: input.agent_id }),
      libCtx,
      getOut,
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
      new AgentStrategyContext(),
      strategyOut,
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
        libCtx,
        new UpdateAgentOutput(),
      );
    }

    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      new LLMCoreContext(),
      llmOut,
    );
    if (llmOut.llm_id && llmOut.llm_id !== agent.llm_id) {
      output.changes.push({ component: 'llm', from: agent.llm_id, to: llmOut.llm_id });
      await this.agentLibrary.updateAgent(
        Object.assign(new UpdateAgentInput(), {
          agent_id: input.agent_id,
          llm_id: llmOut.llm_id,
        }),
        libCtx,
        new UpdateAgentOutput(),
      );
    }

    const soulOut = new OptSoulOutput();
    await this.soulCore.optSoul(
      Object.assign(new OptSoulInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
        soul_id: agent.soul_id,
      }),
      new SoulCoreContext(),
      soulOut,
    );
    const newSoul = soulOut.current_soul_id || '';
    if (newSoul && newSoul !== agent.soul_id) {
      output.changes.push({ component: 'soul', from: agent.soul_id, to: newSoul });
      await this.agentLibrary.updateAgent(
        Object.assign(new UpdateAgentInput(), {
          agent_id: input.agent_id,
          soul_id: newSoul,
        }),
        libCtx,
        new UpdateAgentOutput(),
      );
    }

    const skillMatchOut = new MatchSkillOutput();
    await this.skillCore.matchSkill(
      Object.assign(new MatchSkillInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      new SkillCoreContext(),
      skillMatchOut,
    );
    // Skill/MCP 绑定变更维护在 Core 的 agent_skill / agent_mcp 表，Agent 层不直接访问；
    // 通过 SkillCore.matchSkill 触发重新评估并持久化绑定，optSkill 记录使用，
    // 单条变更的 "from"/"to" 不在 Agent 层 surface（Core 闭环负责）。
    for (const s of skillMatchOut.skills ?? []) {
      await this.skillCore.optSkill(
        Object.assign(new OptSkillInput(), {
          agent_id: input.agent_id,
          context_id: ctx.session_id || '',
          interact_id: input.interact_id || '',
          skill_id: s.skill_id,
        }),
        new SkillCoreContext(),
        new OptSkillOutput(),
      );
      output.changes.push({ component: 'skill', from: '', to: s.skill_id });
    }

    const mcpMatchOut = new MatchMcpOutput();
    await this.mcpCore.matchMCP(
      Object.assign(new MatchMcpInput(), {
        agent_id: input.agent_id,
        context_id: ctx.session_id || '',
        interact_id: input.interact_id || '',
      }),
      new McpCoreContext(),
      mcpMatchOut,
    );
    for (const mcpId of mcpMatchOut.mcp_ids ?? []) {
      await this.mcpCore.optMCP(
        Object.assign(new OptMcpInput(), {
          agent_id: input.agent_id,
          context_id: ctx.session_id || '',
          interact_id: input.interact_id || '',
          mcp_id: mcpId,
        }),
        new McpCoreContext(),
        new OptMcpOutput(),
      );
      output.changes.push({ component: 'mcp', from: '', to: mcpId });
    }

    output.optimized = output.changes.length > 0;
    return true;
  }

  async buildPlannerAgent(
    input: BuildPlannerAgentInput,
    ctx: AgentBuilderContext,
    output: BuildPlannerAgentOutput,
  ): Promise<boolean> {
    return this.buildSystemAgent('PLANNER', 'Plan-and-Solve', 'planner', input.force_new, ctx, output);
  }

  async buildWriterAgent(
    input: BuildWriterAgentInput,
    ctx: AgentBuilderContext,
    output: BuildWriterAgentOutput,
  ): Promise<boolean> {
    return this.buildSystemAgent('WRITER', 'CoT', 'writer', input.force_new, ctx, output);
  }

  async buildEvolutorAgent(
    input: BuildEvolutorAgentInput,
    ctx: AgentBuilderContext,
    output: BuildEvolutorAgentOutput,
  ): Promise<boolean> {
    return this.buildSystemAgent('EVOLUTOR', 'ReAct', 'evolutor', input.force_new, ctx, output);
  }

  async configAgentBuilder(
    input: ConfigAgentBuilderInput,
    _ctx: AgentBuilderContext,
    output: ConfigAgentBuilderOutput,
  ): Promise<boolean> {
    let config = await this.getConfig();
    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(AGENT_BUILDER_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'task_analysis_prompt_template_id', value: '' },
        { field: 'default_strategy_id', value: '' },
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
    if (input.default_strategy_id !== undefined) {
      if (input.default_strategy_id) {
        const so = new SoStrategyOutput();
        await this.agentStrategy.soStrategy(
          Object.assign(new SoStrategyInput(), {
            conditions: [
              { field: 'strategy_id', operator: Operator.EQ, value: input.default_strategy_id },
            ],
          }),
          new AgentStrategyContext(),
          so,
        );
        if (!so.strategies?.length) {
          throw new ValidationError(`default_strategy_id 不存在: ${input.default_strategy_id}`);
        }
      }
      data.push({ field: 'default_strategy_id', value: input.default_strategy_id });
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

  private async buildSystemAgent(
    agentType: string,
    strategyLabel: string,
    signatureKey: string,
    forceNew: boolean | undefined,
    ctx: AgentBuilderContext,
    output: BuildSystemAgentOutput,
  ): Promise<boolean> {
    const libCtx = this.toLibCtx(ctx, '');
    if (!forceNew) {
      const getOut = new GetAgentOutput();
      await this.agentLibrary.getAgent(
        Object.assign(new GetAgentInput(), { agent_type: agentType }),
        libCtx,
        getOut,
      );
      const found = getOut.agents.find((a) => a.enable);
      if (found) {
        output.agent_id = found.agent_id;
        return true;
      }
    }

    const agentId = IdGenerator.generate();
    const llmId = await this.matchLlmForAgent(agentId, ctx.interact_id || '');
    const soulOut = new MatchSoulOutput();
    await this.soulCore.matchSoul(
      Object.assign(new MatchSoulInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        interact_id: ctx.interact_id || '',
      }),
      new SoulCoreContext(),
      soulOut,
    );

    const strategyId = await this.getStrategyIdByLabel(strategyLabel);
    if (!strategyId) throw new ValidationError(`strategy not found: ${strategyLabel}`);

    const addOut = new AddAgentOutput();
    const ok = await this.agentLibrary.addAgent(
      Object.assign(new AddAgentInput(), {
        agent_id: agentId,
        agent_type: agentType,
        strategy_id: strategyId,
        llm_id: llmId,
        soul_id: soulOut.soul_id || '',
        task_signature: buildTaskSignature(signatureKey, agentType.toLowerCase()),
        agent_name: `${agentType.charAt(0)}${agentType.slice(1).toLowerCase()}Agent`,
      }),
      libCtx,
      addOut,
    );
    if (!ok) throw new ValidationError(`addAgent failed for ${agentType}`);
    if (soulOut.soul_id) {
      await this.soulCore.optSoul(
        Object.assign(new OptSoulInput(), {
          agent_id: agentId,
          context_id: '',
          interact_id: '',
          soul_id: soulOut.soul_id,
        }),
        new SoulCoreContext(),
        new OptSoulOutput(),
      );
    }
    output.agent_id = agentId;
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
        new LLMCoreContext(),
        llmOut,
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
        const promptOut = new ExecPromptOutput();
        await this.promptsAccess.execPrompt(
          Object.assign(new ExecPromptInput(), {
            id: config.task_analysis_prompt_template_id,
            variables: { task_content: input.task_content },
          }),
          new PromptContext(),
          promptOut,
        );
        if (promptOut.prompt) {
          const llmOut = new ExecLLMOutput();
          await this.llmAccess.execLLM(
            Object.assign(new ExecLLMInput(), { id: llmId, prompt: promptOut.prompt }),
            new LLMContext(),
            llmOut,
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
      new AgentStrategyContext(),
      so,
    );
    return so.strategies?.[0]?.strategy_id ?? '';
  }

  private async assertPrompt(id: string): Promise<void> {
    const out = new SoPromptOutput();
    await this.promptsAccess.soPrompt(
      Object.assign(new SoPromptInput(), {
        conditions: [{ field: 'id', operator: Operator.EQ, value: id }],
      }),
      new PromptContext(),
      out,
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
      default_strategy_id: String(row.default_strategy_id ?? ''),
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
}
