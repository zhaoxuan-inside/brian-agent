import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import type { LLMCoreAccess } from '@brian-agent/core';
import type { MCPCoreAccess } from '@brian-agent/core';
import type { SkillCoreAccess } from '@brian-agent/core';
import type { SoulCoreAccess } from '@brian-agent/core';
import {
  type AgentBuilderConfigRecord,
  AGENT_BUILDER_CONFIG_TABLE,
  BuildAgentInput, BuildAgentOutput,
  OptimizeAgentInput, OptimizeAgentOutput,
  BuildPlannerAgentInput, BuildPlannerAgentOutput,
  BuildWriterAgentInput, BuildWriterAgentOutput,
  BuildEvolutorAgentInput, BuildEvolutorAgentOutput,
  ConfigAgentBuilderInput, ConfigAgentBuilderOutput,
} from '../domain/types';
import {
  AddAgentInput, AddAgentOutput, GetAgentInput, GetAgentOutput,
  UpdateAgentInput, UpdateAgentOutput, MatchAgentInput, MatchAgentOutput,
  RecordAgentUsageInput, RecordAgentUsageOutput,
} from '../../AgentLibrary/domain/types';
import {
  MatchStrategyInput, MatchStrategyOutput,
} from '../../AgentStrategy/domain/types';
import {
  MatchLLMInput, MatchLLMOutput, CheckLLMQuotaInput, CheckLLMQuotaOutput,
  LLMCoreContext,
} from '@brian-agent/core';
import { MatchMcpInput, MatchMcpOutput, OptMcpInput, OptMcpOutput, McpCoreContext } from '@brian-agent/core';
import { MatchSkillInput, MatchSkillOutput, OptSkillInput, OptSkillOutput, SkillCoreContext } from '@brian-agent/core';
import { MatchSoulInput, MatchSoulOutput, OptSoulInput, OptSoulOutput, SoulCoreContext } from '@brian-agent/core';

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

  async buildAgent(input: BuildAgentInput, ctx: unknown, output: BuildAgentOutput): Promise<boolean> {
    const config = this.getConfig();
    let complexity = input.task_complexity;
    let domain = input.task_domain ?? '';
    let signature = '';

    if (config?.task_analysis_prompt_template_id) {
      try {
        const prompt = `Analyze task: "${input.task_content}"\nReturn JSON: {"complexity": 0-100, "domain": "...", "signature": "..."}`;
        const analysis = JSON.parse(prompt);
        complexity = complexity ?? analysis.complexity;
        domain = domain || analysis.domain || '';
        signature = analysis.signature || input.task_content.slice(0, 200);
      } catch {
        signature = input.task_content.slice(0, 200);
        complexity = complexity ?? 50;
      }
    } else {
      signature = input.task_content.slice(0, 200);
      complexity = complexity ?? 50;
    }

    if (!input.force_new) {
      const matchOut = new MatchAgentOutput();
      await this.agentLibrary.matchAgent(
        Object.assign(new MatchAgentInput(), { task_signature: signature, agent_type: 'WORKER' }),
        {}, matchOut,
      );
      if (matchOut.agent_id) {
        const recOut = new RecordAgentUsageOutput();
        await this.agentLibrary.recordAgentUsage(
          Object.assign(new RecordAgentUsageInput(), { agent_id: matchOut.agent_id, work_id: '', interact_id: input.interact_id }),
          {}, recOut,
        );
        output.agent_id = matchOut.agent_id;
        return true;
      }
    }

    const agentId = IdGenerator.uuid();

    const strategyOut = new MatchStrategyOutput();
    await this.agentStrategy.matchStrategy(
      Object.assign(new MatchStrategyInput(), { task_content: input.task_content, task_complexity: complexity, task_domain: domain }),
      {}, strategyOut,
    );

    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), { agent_id: agentId, context_id: '', interact_id: input.interact_id }),
      new LLMCoreContext(), llmOut,
    );

    const skillOut = new MatchSkillOutput();
    await this.skillCore.matchSkill(
      Object.assign(new MatchSkillInput(), { agent_id: agentId, context_id: '', interact_id: input.interact_id }),
      new SkillCoreContext(), skillOut,
    );

    const mcpOut = new MatchMcpOutput();
    await this.mcpCore.matchMCP(
      Object.assign(new MatchMcpInput(), { agent_id: agentId, context_id: '', interact_id: input.interact_id }),
      new McpCoreContext(), mcpOut,
    );

    const soulOut = new MatchSoulOutput();
    await this.soulCore.matchSoul(
      Object.assign(new MatchSoulInput(), { agent_id: agentId, context_id: '', interact_id: input.interact_id }),
      new SoulCoreContext(), soulOut,
    );

    const llmId = llmOut.llm_id || '';
    if (!strategyOut.strategy_id || !llmId) {
      output.error = 'Failed to match strategy or LLM';
      return false;
    }

    const addOut = new AddAgentOutput();
    await this.agentLibrary.addAgent(
      Object.assign(new AddAgentInput(), {
        agent_id: agentId, agent_type: 'WORKER', strategy_id: strategyOut.strategy_id,
        llm_id: llmId, soul_id: soulOut.soul_id, task_signature: signature, agent_name: `Agent-${agentId.slice(0, 8)}`,
      }), {}, addOut,
    );

    for (const sid of skillOut.skills) {
      await this.skillCore.optSkill(
        Object.assign(new OptSkillInput(), { agent_id: agentId, context_id: '', interact_id: input.interact_id, skill_id: sid.skill_id }),
        new SkillCoreContext(), new OptSkillOutput(),
      );
    }
    for (const mid of mcpOut.mcp_ids) {
      await this.mcpCore.optMCP(
        Object.assign(new OptMcpInput(), { agent_id: agentId, context_id: '', interact_id: input.interact_id, mcp_id: mid }),
        new McpCoreContext(), new OptMcpOutput(),
      );
    }
    if (soulOut.soul_id) {
      await this.soulCore.optSoul(
        Object.assign(new OptSoulInput(), { agent_id: agentId, context_id: '', interact_id: input.interact_id, soul_id: soulOut.soul_id }),
        new SoulCoreContext(), new OptSoulOutput(),
      );
    }

    const optInput = Object.assign(new OptimizeAgentInput(), { agent_id: agentId, interact_id: input.interact_id });
    this.optimizeAgent(optInput, ctx, new OptimizeAgentOutput()).catch(() => {});

    output.agent_id = agentId;
    return true;
  }

  async optimizeAgent(input: OptimizeAgentInput, _ctx: unknown, output: OptimizeAgentOutput): Promise<boolean> {
    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(Object.assign(new GetAgentInput(), { agent_id: input.agent_id }), {}, getOut);
    if (getOut.agents.length === 0) { output.error = 'Agent not found'; return false; }
    const agent = getOut.agents[0];

    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), { agent_id: input.agent_id, context_id: '', interact_id: input.interact_id }),
      new LLMCoreContext(), llmOut,
    );
    if (llmOut.llm_id && llmOut.llm_id !== agent.llm_id) {
      output.changes.push({ component: 'llm', from: agent.llm_id, to: llmOut.llm_id });
      await this.agentLibrary.updateAgent(
        Object.assign(new UpdateAgentInput(), { agent_id: input.agent_id, llm_id: llmOut.llm_id } as never),
        {}, new UpdateAgentOutput(),
      );
    }

    const soulOut = new OptSoulOutput();
    await this.soulCore.optSoul(
      Object.assign(new OptSoulInput(), { agent_id: input.agent_id, context_id: '', interact_id: input.interact_id, soul_id: agent.soul_id }),
      new SoulCoreContext(), soulOut,
    );
    if (soulOut.current_soul_id && soulOut.current_soul_id !== agent.soul_id) {
      output.changes.push({ component: 'soul', from: agent.soul_id, to: soulOut.current_soul_id });
    }

    output.optimized = output.changes.length > 0;
    return true;
  }

  async buildPlannerAgent(input: BuildPlannerAgentInput, _ctx: unknown, output: BuildPlannerAgentOutput): Promise<boolean> {
    if (!input.force_new) {
      const getOut = new GetAgentOutput();
      await this.agentLibrary.getAgent(Object.assign(new GetAgentInput(), { agent_type: 'PLANNER' }), {}, getOut);
      const found = getOut.agents.find((a) => a.enable);
      if (found) { output.agent_id = found.agent_id; return true; }
    }

    const agentId = IdGenerator.uuid();
    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), { agent_id: agentId, context_id: '', interact_id: '' }),
      new LLMCoreContext(), llmOut,
    );

    const soulOut = new MatchSoulOutput();
    await this.soulCore.matchSoul(
      Object.assign(new MatchSoulInput(), { agent_id: agentId, context_id: '', interact_id: '' }),
      new SoulCoreContext(), soulOut,
    );

    const addOut = new AddAgentOutput();
    await this.agentLibrary.addAgent(
      Object.assign(new AddAgentInput(), {
        agent_id: agentId, agent_type: 'PLANNER', strategy_id: '', llm_id: llmOut.llm_id || '',
        soul_id: soulOut.soul_id, task_signature: 'planner', agent_name: 'PlannerAgent',
      }), {}, addOut,
    );
    output.agent_id = agentId;
    return true;
  }

  async buildWriterAgent(input: BuildWriterAgentInput, _ctx: unknown, output: BuildWriterAgentOutput): Promise<boolean> {
    if (!input.force_new) {
      const getOut = new GetAgentOutput();
      await this.agentLibrary.getAgent(Object.assign(new GetAgentInput(), { agent_type: 'WRITER' }), {}, getOut);
      const found = getOut.agents.find((a) => a.enable);
      if (found) { output.agent_id = found.agent_id; return true; }
    }

    const agentId = IdGenerator.uuid();
    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), { agent_id: agentId, context_id: '', interact_id: '' }),
      new LLMCoreContext(), llmOut,
    );
    const soulOut = new MatchSoulOutput();
    await this.soulCore.matchSoul(
      Object.assign(new MatchSoulInput(), { agent_id: agentId, context_id: '', interact_id: '' }),
      new SoulCoreContext(), soulOut,
    );

    const addOut = new AddAgentOutput();
    await this.agentLibrary.addAgent(
      Object.assign(new AddAgentInput(), {
        agent_id: agentId, agent_type: 'WRITER', strategy_id: '', llm_id: llmOut.llm_id || '',
        soul_id: soulOut.soul_id, task_signature: 'writer', agent_name: 'WriterAgent',
      }), {}, addOut,
    );
    output.agent_id = agentId;
    return true;
  }

  async buildEvolutorAgent(input: BuildEvolutorAgentInput, _ctx: unknown, output: BuildEvolutorAgentOutput): Promise<boolean> {
    if (!input.force_new) {
      const getOut = new GetAgentOutput();
      await this.agentLibrary.getAgent(Object.assign(new GetAgentInput(), { agent_type: 'EVOLUTOR' }), {}, getOut);
      const found = getOut.agents.find((a) => a.enable);
      if (found) { output.agent_id = found.agent_id; return true; }
    }

    const agentId = IdGenerator.uuid();
    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), { agent_id: agentId, context_id: '', interact_id: '' }),
      new LLMCoreContext(), llmOut,
    );
    const soulOut = new MatchSoulOutput();
    await this.soulCore.matchSoul(
      Object.assign(new MatchSoulInput(), { agent_id: agentId, context_id: '', interact_id: '' }),
      new SoulCoreContext(), soulOut,
    );

    const addOut = new AddAgentOutput();
    await this.agentLibrary.addAgent(
      Object.assign(new AddAgentInput(), {
        agent_id: agentId, agent_type: 'EVOLUTOR', strategy_id: '', llm_id: llmOut.llm_id || '',
        soul_id: soulOut.soul_id, task_signature: 'evolutor', agent_name: 'EvolutorAgent',
      }), {}, addOut,
    );
    output.agent_id = agentId;
    return true;
  }

  async configAgentBuilder(input: ConfigAgentBuilderInput, _ctx: unknown, output: ConfigAgentBuilderOutput): Promise<boolean> {
    let config = this.getConfig();
    if (!config) {
      const now = Math.floor(Date.now() / 1000);
      this.relationDb.executeRaw(
        `INSERT INTO ${AGENT_BUILDER_CONFIG_TABLE} (id, created, updated, task_analysis_prompt_template_id, default_strategy_id, auto_optimize) VALUES (?, ?, ?, ?, ?, 1)`,
        [IdGenerator.uuid(), now, now, '', ''],
      );
      config = this.getConfig();
    }
    if (!config) { output.error = 'config init failed'; return false; }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.task_analysis_prompt_template_id !== undefined) { sets.push('task_analysis_prompt_template_id = ?'); vals.push(input.task_analysis_prompt_template_id); }
    if (input.default_strategy_id !== undefined) { sets.push('default_strategy_id = ?'); vals.push(input.default_strategy_id); }
    if (input.auto_optimize !== undefined) { sets.push('auto_optimize = ?'); vals.push(input.auto_optimize ? 1 : 0); }
    if (sets.length > 0) {
      sets.push('updated = ?'); vals.push(Math.floor(Date.now() / 1000)); vals.push(config.id);
      this.relationDb.executeRaw(`UPDATE ${AGENT_BUILDER_CONFIG_TABLE} SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    output.config = this.getConfig();
    return true;
  }

  private getConfig(): AgentBuilderConfigRecord | null {
    const rows = this.relationDb.queryRaw<AgentBuilderConfigRecord>(
      `SELECT * FROM ${AGENT_BUILDER_CONFIG_TABLE} LIMIT 1`,
    );
    return rows[0] ?? null;
  }
}
