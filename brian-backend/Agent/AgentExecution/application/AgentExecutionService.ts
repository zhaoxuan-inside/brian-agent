import type { RelationDBAccess, LLMAccess, PromptsAccess, SkillAccess, SoulAccess, MCPAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import type { InfoCoreAccess, LLMCoreAccess, MQCoreAccess } from '@brian-agent/core';
import {
  AGENT_EXECUTION_CONFIG_TABLE, type AgentExecutionConfigRecord,
  ExecAgentInput, ExecAgentOutput,
  ExecAgentAsyncInput, ExecAgentAsyncOutput,
  ThinkInput, ThinkOutput,
  ActInput, ActOutput,
  ReflectInput, ReflectOutput,
  AnswerInput, AnswerOutput,
  GetTraceInput, GetTraceOutput,
  GetExecQueueStatusInput, GetExecQueueStatusOutput,
  ConfigAgentExecutionInput, ConfigAgentExecutionOutput,
} from '../domain/types';
import { GetAgentInput, GetAgentOutput, RecordAgentUsageInput, RecordAgentUsageOutput } from '../../AgentLibrary/domain/types';
import { GetStrategyInput, GetStrategyOutput } from '../../AgentStrategy/domain/types';
import { CheckLLMQuotaInput, CheckLLMQuotaOutput, LLMCoreContext } from '@brian-agent/core';

export class AgentExecutionService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly skillAccess: SkillAccess,
    private readonly soulAccess: SoulAccess,
    private readonly mcpAccess: MCPAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly agentStrategy: AgentStrategyAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly llmCore: LLMCoreAccess,
    private readonly mqCore: MQCoreAccess,
  ) {}

  async execAgent(input: ExecAgentInput, ctx: unknown, output: ExecAgentOutput): Promise<boolean> {
    const config = this.getConfig();
    const traceId = IdGenerator.uuid();
    const maxIter = input.max_iterations ?? config?.default_max_iterations ?? 10;

    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(Object.assign(new GetAgentInput(), { agent_id: input.agent_id }), {}, getOut);
    if (getOut.agents.length === 0 || !getOut.agents[0].enable) {
      output.error = 'Agent not found or disabled';
      return false;
    }
    const agent = getOut.agents[0];

    try {
      const quotaOut = new CheckLLMQuotaOutput();
      await this.llmCore.checkLLMQuota(
        Object.assign(new CheckLLMQuotaInput(), { llm_provider_id: agent.llm_id }),
        new LLMCoreContext(), quotaOut,
      );
    } catch { /* quota check best-effort */ }

    const stratOut = new GetStrategyOutput();
    await this.agentStrategy.getStrategy(
      Object.assign(new GetStrategyInput(), { strategy_id: agent.strategy_id }), {}, stratOut,
    );

    const skillRows = this.relationDb.queryRaw<{ skill_id: string }>(
      `SELECT skill_id FROM agent_skill WHERE agent_id = ?`, [input.agent_id],
    );
    const skillIds = skillRows.map((r) => r.skill_id);

    const mcpRows = this.relationDb.queryRaw<{ mcp_id: string }>(
      `SELECT mcp_id FROM agent_mcp WHERE agent_id = ?`, [input.agent_id],
    );
    const mcpIds = mcpRows.map((r) => r.mcp_id);

    const contextData = input.task_content;
    let history = '';
    let iteration = 0;
    let finalAnswer = '';
    const traceIterations: unknown[] = [];

    const executionRule = stratOut.execution_rule ? JSON.parse(stratOut.execution_rule) : null;

    const steps = executionRule?.steps;
    const maxFromRule = executionRule?.max_iterations ?? maxIter;

    if (!steps || steps.length === 0) {
      const answerOut = new AnswerOutput();
      await this.answer(
        Object.assign(new AnswerInput(), {
          agent_id: input.agent_id, llm_id: agent.llm_id, soul_id: agent.soul_id,
          history, context_data: contextData, task_content: input.task_content,
        }), ctx, answerOut,
      );
      finalAnswer = answerOut.answer;
    } else {
      let currentStep = steps[0];
      let running = true;
      while (running && iteration < maxFromRule) {
        if (currentStep.step === 'Think') {
          const thinkOut = new ThinkOutput();
          await this.think(
            Object.assign(new ThinkInput(), {
              agent_id: input.agent_id, llm_id: agent.llm_id, soul_id: agent.soul_id,
              context_data: contextData, history, iteration,
            }), ctx, thinkOut,
          );
          history += `\nThink: ${thinkOut.reasoning}\nNext: ${thinkOut.next_action}`;
          traceIterations.push({ iteration_index: iteration, think: { reasoning: thinkOut.reasoning, next_action: thinkOut.next_action } });
          currentStep = this.findNextStep(steps, currentStep.next);
        }

        if (currentStep?.step === 'Act') {
          const actOut = new ActOutput();
          await this.act(
            Object.assign(new ActInput(), {
              agent_id: input.agent_id, skill_ids: skillIds, mcp_ids: mcpIds,
              next_action: this.extractLastNextAction(history), context_data: contextData,
            }), ctx, actOut,
          );
          history += `\nAct: ${actOut.result}`;
          traceIterations[traceIterations.length - 1] = { ...(traceIterations[traceIterations.length - 1] as object), act: { result: actOut.result, tool_type: actOut.tool_type } };
          currentStep = this.findNextStep(steps, currentStep.next);
        }

        if (currentStep?.step === 'Reflect') {
          const reflectOut = new ReflectOutput();
          await this.reflect(
            Object.assign(new ReflectInput(), {
              agent_id: input.agent_id, llm_id: agent.llm_id, soul_id: agent.soul_id,
              context_data: contextData, history, iteration, max_iterations: maxFromRule,
            }), ctx, reflectOut,
          );
          history += `\nReflect: ${reflectOut.reflection}`;
          traceIterations[traceIterations.length - 1] = { ...(traceIterations[traceIterations.length - 1] as object), reflect: { should_continue: reflectOut.should_continue, reflection: reflectOut.reflection } };
          if (reflectOut.should_continue) {
            currentStep = this.findNextStep(steps, currentStep.true_next || currentStep.condition_field ? 'Think' : currentStep.next);
          } else {
            running = false;
          }
          if (!currentStep) running = false;
        }

        if (currentStep?.step === 'Answer') {
          const answerOut = new AnswerOutput();
          await this.answer(
            Object.assign(new AnswerInput(), {
              agent_id: input.agent_id, llm_id: agent.llm_id, soul_id: agent.soul_id,
              history, context_data: contextData, task_content: input.task_content,
            }), ctx, answerOut,
          );
          finalAnswer = answerOut.answer;
          traceIterations.push({ iteration_index: iteration, answer: { answer: finalAnswer } });
          running = false;
        }

        iteration++;
      }

      if (!finalAnswer) {
        const answerOut = new AnswerOutput();
        await this.answer(
          Object.assign(new AnswerInput(), {
            agent_id: input.agent_id, llm_id: agent.llm_id, soul_id: agent.soul_id,
            history, context_data: contextData, task_content: input.task_content,
          }), ctx, answerOut,
        );
        finalAnswer = answerOut.answer;
      }
    }

    const recOut = new RecordAgentUsageOutput();
    await this.agentLibrary.recordAgentUsage(
      Object.assign(new RecordAgentUsageInput(), { agent_id: input.agent_id, work_id: input.work_id, interact_id: input.interact_id }),
      {}, recOut,
    );

    output.answer = finalAnswer;
    output.iterations = iteration;
    output.trace_id = traceId;
    return true;
  }

  async execAgentAsync(input: ExecAgentAsyncInput, _ctx: unknown, output: ExecAgentAsyncOutput): Promise<boolean> {
    const jobId = IdGenerator.uuid();
    output.job_id = jobId;
    return true;
  }

  async think(input: ThinkInput, _ctx: unknown, output: ThinkOutput): Promise<boolean> {
    const config = this.getConfig();
    const prompt = `Soul: ${input.soul_id}\nContext: ${input.context_data}\nHistory: ${input.history}\nIteration: ${input.iteration}\nReason and decide next action.`;
    try {
      output.reasoning = `Analysis at iteration ${input.iteration}`;
      output.next_action = '{}';
      output.token_usage = 0;
    } catch (err) {
      output.error = String(err);
      return false;
    }
    return true;
  }

  async act(input: ActInput, _ctx: unknown, output: ActOutput): Promise<boolean> {
    try {
      const action = JSON.parse(input.next_action);
      output.tool_type = action.tool_type || 'NONE';
      output.tool_id = action.tool_id || '';
      if (action.tool_type === 'SKILL') {
        if (!input.skill_ids.includes(action.tool_id)) {
          output.error = 'Skill not in agent bindings';
          return false;
        }
        output.result = JSON.stringify(action);
      } else if (action.tool_type === 'MCP') {
        if (!input.mcp_ids.includes(action.tool_id)) {
          output.error = 'MCP not in agent bindings';
          return false;
        }
        output.result = JSON.stringify(action);
      } else {
        output.result = 'No action required';
      }
    } catch {
      output.result = 'No action required';
      output.tool_type = 'NONE';
    }
    return true;
  }

  async reflect(input: ReflectInput, _ctx: unknown, output: ReflectOutput): Promise<boolean> {
    if (input.iteration >= input.max_iterations) {
      output.should_continue = false;
      output.reflection = 'Max iterations reached';
      return true;
    }
    output.should_continue = input.iteration < 3;
    output.reflection = `Reflection at iteration ${input.iteration}`;
    return true;
  }

  async answer(input: AnswerInput, _ctx: unknown, output: AnswerOutput): Promise<boolean> {
    output.answer = `Answer for task: ${input.task_content.slice(0, 200)}`;
    output.token_usage = 0;
    return true;
  }

  async getTrace(input: GetTraceInput, _ctx: unknown, output: GetTraceOutput): Promise<boolean> {
    output.trace = {
      trace_id: input.trace_id, agent_id: '', start_time: 0, end_time: 0,
      total_elapsed_ms: 0, iterations: [], total_token_usage: 0,
    };
    return true;
  }

  async getExecQueueStatus(_input: GetExecQueueStatusInput, _ctx: unknown, output: GetExecQueueStatusOutput): Promise<boolean> {
    output.queue_stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
    output.workers = [];
    return true;
  }

  async configAgentExecution(input: ConfigAgentExecutionInput, _ctx: unknown, output: ConfigAgentExecutionOutput): Promise<boolean> {
    let config = this.getConfig();
    if (!config) {
      const now = Math.floor(Date.now() / 1000);
      this.relationDb.executeRaw(
        `INSERT INTO ${AGENT_EXECUTION_CONFIG_TABLE} (id, created, updated, think_prompt_template_id, reflect_prompt_template_id, answer_prompt_template_id, default_max_iterations, async_worker_interval) VALUES (?, ?, ?, ?, ?, ?, 10, 1000)`,
        [IdGenerator.uuid(), now, now, '', '', ''],
      );
      config = this.getConfig();
    }
    if (!config) { output.error = 'config init failed'; return false; }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.think_prompt_template_id !== undefined) { sets.push('think_prompt_template_id = ?'); vals.push(input.think_prompt_template_id); }
    if (input.reflect_prompt_template_id !== undefined) { sets.push('reflect_prompt_template_id = ?'); vals.push(input.reflect_prompt_template_id); }
    if (input.answer_prompt_template_id !== undefined) { sets.push('answer_prompt_template_id = ?'); vals.push(input.answer_prompt_template_id); }
    if (input.default_max_iterations !== undefined) { sets.push('default_max_iterations = ?'); vals.push(input.default_max_iterations); }
    if (input.async_worker_interval !== undefined) { sets.push('async_worker_interval = ?'); vals.push(input.async_worker_interval); }
    if (sets.length > 0) {
      sets.push('updated = ?'); vals.push(Math.floor(Date.now() / 1000)); vals.push(config.id);
      this.relationDb.executeRaw(`UPDATE ${AGENT_EXECUTION_CONFIG_TABLE} SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    output.config = this.getConfig();
    return true;
  }

  private getConfig(): AgentExecutionConfigRecord | null {
    const rows = this.relationDb.queryRaw<AgentExecutionConfigRecord>(
      `SELECT * FROM ${AGENT_EXECUTION_CONFIG_TABLE} LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  private findNextStep(steps: Array<{ step: string; next?: string; true_next?: string }>, target: string | undefined) {
    if (!target) return null;
    return steps.find((s) => s.step === target) ?? null;
  }

  private extractLastNextAction(history: string): string {
    const match = history.match(/Next:\s*(.+)/);
    return match ? match[1].trim() : '{}';
  }
}
