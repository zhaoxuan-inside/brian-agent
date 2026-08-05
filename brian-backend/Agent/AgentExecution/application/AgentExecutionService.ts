import type {
  RelationDBAccess, LLMAccess, PromptsAccess, SkillAccess, SoulAccess, MCPAccess, MQAccess,
} from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError, NotFoundError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  ExecSkillInput, ExecSkillOutput, SkillContext,
  ExecMcpInput, ExecMcpOutput, McpContext,
  GetSoulInput, GetSoulOutput, SoulContext,
  SendMQInput, SendMQOutput, MQContext,
  GetQueueStatsInput, GetQueueStatsOutput,
  SoPromptInput, SoPromptOutput,
  type DataObject,
} from '@brian-agent/base';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import type { InfoCoreAccess, MQCoreAccess, SkillCoreAccess, MCPCoreAccess } from '@brian-agent/core';
import {
  MatchSkillInput, MatchSkillOutput, SkillCoreContext,
  MatchMcpInput, MatchMcpOutput, McpCoreContext,
} from '@brian-agent/core';
import {
  AGENT_EXECUTION_CONFIG_TABLE, AGENT_EXECUTION_TRACE_TABLE, type AgentExecutionConfigRecord,
  AgentExecutionContext,
  ExecAgentInput, ExecAgentOutput,
  ExecAgentAsyncInput, ExecAgentAsyncOutput,
  ThinkInput, ThinkOutput,
  ActInput, ActOutput,
  ReflectInput, ReflectOutput,
  AnswerInput, AnswerOutput,
  GetTraceInput, GetTraceOutput,
  GetExecQueueStatusInput, GetExecQueueStatusOutput,
  ConfigAgentExecutionInput, ConfigAgentExecutionOutput,
  type TraceIteration,
} from '../domain/types';
import {
  GetAgentInput, GetAgentOutput, RecordAgentUsageInput, RecordAgentUsageOutput,
  AgentLibraryContext,
} from '../../AgentLibrary/domain/types';
import {
  GetStrategyInput, GetStrategyOutput, AgentStrategyContext,
} from '../../AgentStrategy/domain/types';
import {
  SaveInfoInput, SaveInfoOutput, ContextInfoInput, ContextInfoOutput, InfoCoreContext,
  StartWorkerInput, StartWorkerOutput, SoWorkerInput, SoWorkerOutput, MQCoreContext,
  LastNInfoInput, LastNInfoOutput,
} from '@brian-agent/core';
import { parseJsonObject } from '../../shared/signature';

const EVAL_QUEUE = 'agent.eval';
const EXEC_QUEUE = 'agent.execution';

interface RuleStep {
  step: string;
  next?: string | null;
  true_next?: string;
  false_next?: string;
  on_error?: string;
  condition_field?: string;
}

interface RulePhase {
  phase: string;
  loop_over?: string;
  steps: RuleStep[];
}

interface ExecutionRule {
  version?: string;
  max_iterations?: number;
  steps?: RuleStep[];
  phases?: RulePhase[];
}

interface StepResult {
  history: string;
  finalAnswer?: string;
  stopRunning?: boolean;
  jumpTarget?: string | null;
  conditionValue?: boolean;
  subSteps?: string[];
}

export class AgentExecutionService {
  private readonly traces = new Map<string, {
    agent_id: string;
    start_time: number;
    end_time: number;
    iterations: TraceIteration[];
    total_token_usage: number;
    answer: string;
  }>();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly skillAccess: SkillAccess,
    private readonly soulAccess: SoulAccess,
    private readonly mcpAccess: MCPAccess,
    private readonly mqAccess: MQAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly agentStrategy: AgentStrategyAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly mqCore: MQCoreAccess,
    private readonly skillCore: SkillCoreAccess,
    private readonly mcpCore: MCPCoreAccess,
  ) {}

  async execAgent(
    input: ExecAgentInput,
    ctx: AgentExecutionContext,
    output: ExecAgentOutput,
  ): Promise<boolean> {
    const start = IdGenerator.now();
    const config = await this.getConfig();
    const traceId = IdGenerator.generate();
    const maxIter = input.max_iterations ?? config?.default_max_iterations ?? 10;
    const libCtx = this.toLibCtx(ctx, input.work_id, input.interact_id);

    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(
      Object.assign(new GetAgentInput(), { agent_id: input.agent_id }),
      libCtx,
      getOut,
    );
    if (getOut.agents.length === 0 || !getOut.agents[0].enable) {
      throw new NotFoundError('Agent', input.agent_id);
    }
    const agent = getOut.agents[0];
    if (!agent.llm_id) {
      throw new ValidationError(`Agent ${input.agent_id} 未绑定 llm_id，请先通过 Core.matchLLM 完成匹配`);
    }
    const domainMatch = (agent.task_signature || '').match(/^\[(.+?)\]/);
    const domain = domainMatch ? domainMatch[1] : 'general';
    const agentName = agent.agent_name || agent.agent_id;

    let contextData = input.task_content;
    const sessionId = ctx.session_id;
    if (sessionId) {
      try {
        const ctxOut = new ContextInfoOutput();
        await this.infoCore.context(
          Object.assign(new ContextInfoInput(), { session_id: sessionId }),
          new InfoCoreContext(),
          ctxOut,
        );
        if (ctxOut.list?.length) {
          contextData = `${ctxOut.list.map((i) => String((i as { info?: string }).info ?? i)).join('\n')}\n${input.task_content}`;
        }
      } catch {
        /* best-effort */
      }
    }

    const stratOut = new GetStrategyOutput();
    await this.agentStrategy.getStrategy(
      Object.assign(new GetStrategyInput(), { strategy_id: agent.strategy_id }),
      new AgentStrategyContext(),
      stratOut,
    );

    const skills = await this.loadSkills(input.agent_id, ctx);
    const mcps = await this.loadMcps(input.agent_id, ctx);
    const skillIds = skills.map((s) => s.id);
    const mcpIds = mcps.map((m) => m.id);
    const toolsJson = JSON.stringify({
      skills: skills.map((s) => ({ id: s.id, description: s.brief, work: s.work })),
      mcps: mcps.map((m) => ({ id: m.id, name: m.title, description: m.brief })),
    });

    let history = '';
    let iteration = 0;
    let finalAnswer = '';
    const traceIterations: TraceIteration[] = [];
    let totalTokens = 0;

    let rule: ExecutionRule | null = null;
    try {
      rule = stratOut.execution_rule ? JSON.parse(stratOut.execution_rule) as ExecutionRule : null;
    } catch {
      rule = null;
    }
    const maxFromRule = rule?.max_iterations ?? maxIter;

    const env = {
      input, ctx, agent, skillIds, mcpIds, skills, mcps, contextData, toolsJson, maxFromRule, config,
      agentName, domain,
    };

    if (!rule?.steps && !rule?.phases) {
      const answerOut = new AnswerOutput();
      await this.answer(
        Object.assign(new AnswerInput(), {
          agent_id: input.agent_id, agent_name: agentName, domain, llm_id: agent.llm_id, soul_id: agent.soul_id,
          history, context_data: contextData, task_content: input.task_content,
          tools_json: toolsJson,
        }),
        ctx,
        answerOut,
      );
      finalAnswer = answerOut.answer;
      totalTokens += answerOut.token_usage;
      traceIterations.push({
        iteration_index: 0,
        answer: { answer: answerOut.answer },
        iteration_elapsed_ms: answerOut.elapsed_ms ?? 0,
      });
    } else if (rule.phases?.length) {
      const result = await this.runPhases(rule, env, history, maxFromRule, traceIterations);
      history = result.history;
      finalAnswer = result.finalAnswer;
      totalTokens += result.totalTokens;
      iteration = result.iteration;
    } else if (rule.steps?.length) {
      const result = await this.runSteps(rule.steps, env, history, maxFromRule, traceIterations);
      history = result.history;
      finalAnswer = result.finalAnswer;
      totalTokens += result.totalTokens;
      iteration = result.iteration;
    }

    if (!finalAnswer) {
      const answerOut = new AnswerOutput();
      await this.answer(
        Object.assign(new AnswerInput(), {
          agent_id: input.agent_id, agent_name: agentName, domain, llm_id: agent.llm_id, soul_id: agent.soul_id,
          history, context_data: contextData, task_content: input.task_content,
          tools_json: toolsJson,
        }),
        ctx,
        answerOut,
      );
      finalAnswer = answerOut.answer;
      totalTokens += answerOut.token_usage;
    }

    await this.agentLibrary.recordAgentUsage(
      Object.assign(new RecordAgentUsageInput(), {
        agent_id: input.agent_id,
        work_id: input.work_id || ctx.work_id || '',
        interact_id: input.interact_id || ctx.interact_id || '',
        usage_context: JSON.stringify({
          trace_id: traceId,
          task_content: input.task_content,
          agent_output: finalAnswer,
        }),
      }),
      libCtx,
      new RecordAgentUsageOutput(),
    );

    if (sessionId) {
      try {
        await this.infoCore.saveInfo(
          Object.assign(new SaveInfoInput(), {
            session_id: sessionId,
            work_id: input.work_id || ctx.work_id || '',
            interact_id: input.interact_id || ctx.interact_id || '',
            info_creator_id: input.agent_id,
            info_creator_role: 'AGENT',
            info: JSON.stringify({
              type: 'trace',
              trace_id: traceId,
              iterations: traceIterations,
              answer: finalAnswer,
            }),
          }),
          new InfoCoreContext(),
          new SaveInfoOutput(),
        );
      } catch {
        /* best-effort */
      }
    }

    const end = IdGenerator.now();
    this.traces.set(traceId, {
      agent_id: input.agent_id,
      start_time: start,
      end_time: end,
      iterations: traceIterations,
      total_token_usage: totalTokens,
      answer: finalAnswer,
    });
    await this.persistTrace(traceId, input.agent_id, start, end, traceIterations, totalTokens, finalAnswer);

    // 评估投递 MQ，由 Evolutor 消费（不直接回调）
    try {
      await this.mqAccess.sendMQ(
        Object.assign(new SendMQInput(), {
          data: {
            queue: EVAL_QUEUE,
            payload: {
              type: 'eval_work_agent',
              agent_id: input.agent_id,
              work_id: input.work_id,
              interact_id: input.interact_id,
              task_content: input.task_content,
              agent_output: finalAnswer,
              trace_id: traceId,
            },
          },
        }),
        new MQContext(),
        new SendMQOutput(),
      );
    } catch {
      /* best-effort */
    }

    output.answer = finalAnswer;
    output.iterations = iteration || traceIterations.length;
    output.trace_id = traceId;
    output.elapsed_ms = end - start;
    return true;
  }

  async execAgentAsync(
    input: ExecAgentAsyncInput,
    ctx: AgentExecutionContext,
    output: ExecAgentAsyncOutput,
  ): Promise<boolean> {
    const jobId = IdGenerator.generate();
    const config = await this.getConfig();
    const interval = config?.async_worker_interval ?? 1000;

    await this.mqAccess.sendMQ(
      Object.assign(new SendMQInput(), {
        data: {
          queue: EXEC_QUEUE,
          payload: {
            job_id: jobId,
            agent_id: input.agent_id,
            work_id: input.work_id,
            interact_id: input.interact_id,
            task_content: input.task_content,
            max_iterations: input.max_iterations,
            callback_queue: input.callback_queue,
            session_id: ctx.session_id,
          },
        },
      }),
      new MQContext(),
      new SendMQOutput(),
    );

    try {
      await this.mqCore.startWorker(
        Object.assign(new StartWorkerInput(), {
          queue: EXEC_QUEUE,
          interval,
          handler: async (msg: { payload?: unknown }) => {
            const payload = (msg.payload ?? msg) as Record<string, unknown>;
            const execOut = new ExecAgentOutput();
            const execCtx = Object.assign(new AgentExecutionContext(), {
              session_id: payload.session_id as string | undefined,
              work_id: payload.work_id as string | undefined,
              interact_id: payload.interact_id as string | undefined,
            });
            await this.execAgent(
              Object.assign(new ExecAgentInput(), {
                agent_id: payload.agent_id,
                work_id: payload.work_id,
                interact_id: payload.interact_id,
                task_content: payload.task_content,
                max_iterations: payload.max_iterations,
              }),
              execCtx,
              execOut,
            );
            if (payload.callback_queue) {
              await this.mqAccess.sendMQ(
                Object.assign(new SendMQInput(), {
                  data: { queue: String(payload.callback_queue), payload: execOut },
                }),
                new MQContext(),
                new SendMQOutput(),
              );
            }
            return true;
          },
        }),
        new MQCoreContext(),
        new StartWorkerOutput(),
      );
    } catch {
      /* worker may already exist */
    }

    output.job_id = jobId;
    return true;
  }

  async think(input: ThinkInput, ctx: AgentExecutionContext, output: ThinkOutput): Promise<boolean> {
    if (!input.llm_id) throw new ValidationError('think 需要 llm_id');
    const config = await this.getConfig();
    const system = await this.loadSoulSystem(input.soul_id);
    const prompt = await this.renderOrFallback(
      config?.think_prompt_template_id,
      {
        agent_name: input.agent_name,
        soul: system,
        context_data: input.context_data,
        history: input.history,
        iteration: input.iteration,
        tools_json: input.tools_json || '{}',
        domain: input.domain || 'general',
      },
      `System: ${system}\nContext: ${input.context_data}\nHistory: ${input.history}\n` +
      `Tools: ${input.tools_json}\nIteration: ${input.iteration}\n` +
      'Reason step by step. If external tools are needed, set next_action.tool_type to SKILL or MCP with tool_id and params. ' +
      'Return JSON: {"reasoning":"...","next_action":{"tool_type":"NONE|SKILL|MCP","tool_id":"","params":{},"sub_steps":[]}}',
    );

    const llmOut = new ExecLLMOutput();
    const ok = await this.llmAccess.execLLM(
      Object.assign(new ExecLLMInput(), {
        id: input.llm_id,
        params: { prompt, ...(system ? { system } : {}) },
      }),
      new LLMContext(),
      llmOut,
    );
    if (!ok) throw new ValidationError('think execLLM failed');

    const parsed = parseJsonObject(llmOut.result);
    output.reasoning = String(parsed?.reasoning ?? llmOut.result);
    output.next_action = JSON.stringify(parsed?.next_action ?? { tool_type: 'NONE' });
    output.token_usage = Number((llmOut.usage as Record<string, unknown> | undefined)?.total_tokens ?? 0);

    await this.saveStepInfo(ctx, input.agent_id, 'THINK', output.reasoning);
    return true;
  }

  async act(input: ActInput, ctx: AgentExecutionContext, output: ActOutput): Promise<boolean> {
    let action: Record<string, unknown> = {};
    try {
      action = JSON.parse(input.next_action) as Record<string, unknown>;
    } catch {
      action = { tool_type: 'NONE' };
    }

    const toolType = String(action.tool_type ?? 'NONE').toUpperCase();
    const toolId = String(action.tool_id ?? '');
    const params = (action.params as Record<string, unknown>) ?? {};
    output.tool_type = toolType;
    output.tool_id = toolId;

    if (toolType === 'SKILL') {
      if (!input.skill_ids.includes(toolId)) {
        throw new ValidationError(`Skill not bound to agent: ${toolId}`);
      }
      const skillOut = new ExecSkillOutput();
      const ok = await this.skillAccess.execSkill(
        Object.assign(new ExecSkillInput(), { id: toolId, params }),
        new SkillContext(),
        skillOut,
      );
      if (!ok) throw new ValidationError(`execSkill failed: ${toolId}`);
      output.result = typeof skillOut.result === 'string'
        ? skillOut.result
        : JSON.stringify(skillOut.result ?? {});
      await this.saveStepInfo(ctx, input.agent_id, 'SKILL', output.result);
      return true;
    }

    if (toolType === 'MCP') {
      if (!input.mcp_ids.includes(toolId)) {
        throw new ValidationError(`MCP not bound to agent: ${toolId}`);
      }
      const mcpOut = new ExecMcpOutput();
      const ok = await this.mcpAccess.execMcp(
        Object.assign(new ExecMcpInput(), { id: toolId, params }),
        new McpContext(),
        mcpOut,
      );
      if (!ok) throw new ValidationError(`execMcp failed: ${toolId}`);
      output.result = typeof mcpOut.result === 'string'
        ? mcpOut.result
        : JSON.stringify(mcpOut.result ?? {});
      await this.saveStepInfo(ctx, input.agent_id, 'MCP', output.result);
      return true;
    }

    output.result = 'No external tool required';
    await this.saveStepInfo(ctx, input.agent_id, 'ACT', output.result);
    return true;
  }

  async reflect(input: ReflectInput, ctx: AgentExecutionContext, output: ReflectOutput): Promise<boolean> {
    if (!input.llm_id) throw new ValidationError('reflect 需要 llm_id');
    if (input.iteration >= input.max_iterations) {
      output.should_continue = false;
      output.reflection = 'Max iterations reached';
      return true;
    }

    const config = await this.getConfig();
    const system = await this.loadSoulSystem(input.soul_id);
    const prompt = await this.renderOrFallback(
      config?.reflect_prompt_template_id,
      {
        agent_name: input.agent_name,
        soul: system,
        context_data: input.context_data,
        history: input.history,
        iteration: input.iteration,
        max_iterations: input.max_iterations,
        tools_json: input.tools_json || '{}',
        domain: input.domain || 'general',
      },
      `System: ${system}\nContext: ${input.context_data}\nHistory: ${input.history}\n` +
      `Tools: ${input.tools_json}\n` +
      `Iteration: ${input.iteration}/${input.max_iterations}\n` +
      'Evaluate progress. Return JSON: {"should_continue":true/false,"reflection":"..."}',
    );

    const llmOut = new ExecLLMOutput();
    await this.llmAccess.execLLM(
      Object.assign(new ExecLLMInput(), {
        id: input.llm_id,
        params: { prompt, ...(system ? { system } : {}) },
      }),
      new LLMContext(),
      llmOut,
    );

    const parsed = parseJsonObject(llmOut.result);
    output.should_continue = Boolean(parsed?.should_continue ?? true);
    output.reflection = String(parsed?.reflection ?? llmOut.result);
    output.token_usage = Number((llmOut.usage as Record<string, unknown> | undefined)?.total_tokens ?? 0);
    await this.saveStepInfo(ctx, input.agent_id, 'REFLECT', output.reflection);
    return true;
  }

  async answer(input: AnswerInput, ctx: AgentExecutionContext, output: AnswerOutput): Promise<boolean> {
    if (!input.llm_id) throw new ValidationError('answer 需要 llm_id');
    const config = await this.getConfig();
    const system = await this.loadSoulSystem(input.soul_id);
    const prompt = await this.renderOrFallback(
      config?.answer_prompt_template_id,
      {
        agent_name: input.agent_name,
        soul: system,
        task_content: input.task_content,
        context_data: input.context_data,
        history: input.history,
        tools_json: input.tools_json || '{}',
        domain: input.domain || 'general',
      },
      `System: ${system}\nTask: ${input.task_content}\nContext: ${input.context_data}\n` +
      `Tools: ${input.tools_json}\nHistory: ${input.history}\nGenerate the final answer.`,
    );

    const llmOut = new ExecLLMOutput();
    await this.llmAccess.execLLM(
      Object.assign(new ExecLLMInput(), {
        id: input.llm_id,
        params: { prompt, ...(system ? { system } : {}) },
      }),
      new LLMContext(),
      llmOut,
    );
    output.answer = llmOut.result || '';
    output.token_usage = Number((llmOut.usage as Record<string, unknown> | undefined)?.total_tokens ?? 0);

    if (ctx.session_id) {
      try {
        await this.infoCore.saveInfo(
          Object.assign(new SaveInfoInput(), {
            session_id: ctx.session_id,
            work_id: ctx.work_id || '',
            interact_id: ctx.interact_id || '',
            info_creator_id: input.agent_id,
            info_creator_role: 'RESPONSE',
            info: output.answer,
          }),
          new InfoCoreContext(),
          new SaveInfoOutput(),
        );
      } catch {
        /* best-effort */
      }
    }
    return true;
  }

  async getTrace(
    input: GetTraceInput,
    _ctx: AgentExecutionContext,
    output: GetTraceOutput,
  ): Promise<boolean> {
    const mem = this.traces.get(input.trace_id);
    if (mem) {
      output.trace = {
        trace_id: input.trace_id,
        agent_id: mem.agent_id,
        start_time: mem.start_time,
        end_time: mem.end_time,
        total_elapsed_ms: mem.end_time - mem.start_time,
        iterations: mem.iterations,
        total_token_usage: mem.total_token_usage,
      };
      return true;
    }

    const row = await this.relationDb.selectOne(AGENT_EXECUTION_TRACE_TABLE, [
      { field: 'trace_id', operator: Operator.EQ, value: input.trace_id },
    ]);
    if (row) {
      const iterations = JSON.parse(String(row.iterations_json || '[]')) as TraceIteration[];
      output.trace = {
        trace_id: input.trace_id,
        agent_id: String(row.agent_id),
        start_time: Number(row.start_time),
        end_time: Number(row.end_time),
        total_elapsed_ms: Number(row.end_time) - Number(row.start_time),
        iterations,
        total_token_usage: Number(row.total_token_usage ?? 0),
      };
      return true;
    }

    // 回退 InfoCore lastN 检索
    try {
      const lastOut = new LastNInfoOutput();
      await this.infoCore.lastNInfo(
        Object.assign(new LastNInfoInput(), { lastN: 50 }),
        new InfoCoreContext(),
        lastOut,
      );
      const found = (lastOut.list ?? []).find((item) => {
        try {
          const info = JSON.parse(String((item as { info?: string }).info ?? ''));
          return info?.trace_id === input.trace_id;
        } catch {
          return false;
        }
      });
      if (found) {
        const info = JSON.parse(String((found as { info: string }).info));
        output.trace = {
          trace_id: input.trace_id,
          agent_id: String((found as { info_creator_id?: string }).info_creator_id ?? ''),
          start_time: 0,
          end_time: 0,
          total_elapsed_ms: 0,
          iterations: info.iterations ?? [],
          total_token_usage: 0,
        };
        return true;
      }
    } catch {
      /* ignore */
    }

    output.trace = null;
    return true;
  }

  async getExecQueueStatus(
    _input: GetExecQueueStatusInput,
    _ctx: AgentExecutionContext,
    output: GetExecQueueStatusOutput,
  ): Promise<boolean> {
    const statsOut = new GetQueueStatsOutput();
    try {
      await this.mqAccess.getQueueStats(
        Object.assign(new GetQueueStatsInput(), { queue: EXEC_QUEUE }),
        new MQContext(),
        statsOut,
      );
      const s = statsOut.stats;
      output.queue_stats = {
        pending: Number(s?.pending ?? 0),
        processing: Number(s?.processing ?? 0),
        completed: Number(s?.completed ?? 0),
        failed: Number(s?.failed ?? 0),
      };
    } catch {
      output.queue_stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
    }

    const workersOut = new SoWorkerOutput();
    try {
      await this.mqCore.soWorker(
        Object.assign(new SoWorkerInput(), { queue: EXEC_QUEUE }),
        new MQCoreContext(),
        workersOut,
      );
      output.workers = workersOut.workers ?? [];
    } catch {
      output.workers = [];
    }
    return true;
  }

  async configAgentExecution(
    input: ConfigAgentExecutionInput,
    _ctx: AgentExecutionContext,
    output: ConfigAgentExecutionOutput,
  ): Promise<boolean> {
    let config = await this.getConfig();
    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(AGENT_EXECUTION_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'think_prompt_template_id', value: '' },
        { field: 'reflect_prompt_template_id', value: '' },
        { field: 'answer_prompt_template_id', value: '' },
        { field: 'default_max_iterations', value: 10 },
        { field: 'async_worker_interval', value: 1000 },
      ]);
      config = await this.getConfig();
    }
    if (!config) throw new ValidationError('config init failed');

    const data: DataObject[] = [];
    for (const key of [
      'think_prompt_template_id',
      'reflect_prompt_template_id',
      'answer_prompt_template_id',
    ] as const) {
      const val = input[key];
      if (val !== undefined) {
        if (val) await this.assertPromptExists(val);
        data.push({ field: key, value: val });
      }
    }
    if (input.default_max_iterations !== undefined) {
      if (input.default_max_iterations <= 0) throw new ValidationError('default_max_iterations 必须 > 0');
      data.push({ field: 'default_max_iterations', value: input.default_max_iterations });
    }
    if (input.async_worker_interval !== undefined) {
      if (input.async_worker_interval <= 0) throw new ValidationError('async_worker_interval 必须 > 0');
      data.push({ field: 'async_worker_interval', value: input.async_worker_interval });
    }
    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(
        AGENT_EXECUTION_CONFIG_TABLE,
        data,
        [{ field: 'id', operator: Operator.EQ, value: config.id }],
      );
    }
    output.config = await this.getConfig();
    return true;
  }

  // ---------------------------------------------------------------------------
  // 规则引擎
  // ---------------------------------------------------------------------------

  private async runSteps(
    steps: RuleStep[],
    env: {
      input: ExecAgentInput;
      ctx: AgentExecutionContext;
      agent: { agent_id: string; llm_id: string; soul_id: string };
      skillIds: string[];
      mcpIds: string[];
      contextData: string;
      maxFromRule: number;
      config: AgentExecutionConfigRecord | null;
    },
    history: string,
    maxIter: number,
    traceIterations: TraceIteration[],
  ): Promise<{ history: string; finalAnswer: string; totalTokens: number; iteration: number }> {
    let current: RuleStep | null = steps[0] ?? null;
    let iteration = 0;
    let finalAnswer = '';
    let totalTokens = 0;
    const stepIndex = new Map(steps.map((s) => [s.step, s]));

    while (current && iteration < maxIter) {
      const t0 = IdGenerator.now();
      const result = await this.executeAtomic(current, env, history, iteration, maxIter);
      history = result.history;
      totalTokens += result.token_usage ?? 0;
      traceIterations.push({
        iteration_index: iteration,
        ...result.tracePiece,
        iteration_elapsed_ms: IdGenerator.now() - t0,
      });

      if (result.finalAnswer) {
        finalAnswer = result.finalAnswer;
        break;
      }
      if (result.stopRunning && !result.jumpTarget) break;

      let nextTarget: string | null = null;
      if (result.jumpTarget) {
        nextTarget = result.jumpTarget;
      } else if (result.conditionValue === false) {
        nextTarget = current.false_next ?? null;
      } else if (result.conditionValue === true) {
        nextTarget = current.true_next ?? current.next ?? null;
      } else {
        nextTarget = current.next ?? null;
      }

      if (!nextTarget) break;
      current = stepIndex.get(nextTarget) ?? null;
      if (!current && nextTarget === 'Answer') {
        current = stepIndex.get('Answer') ?? null;
      }
      iteration++;
    }

    return { history, finalAnswer, totalTokens, iteration };
  }

  /**
   * Plan-and-Solve：支持 phase 跳转（SolvePhase / SummaryAnswer）、loop_over sub_steps。
   */
  private async runPhases(
    rule: ExecutionRule,
    env: {
      input: ExecAgentInput;
      ctx: AgentExecutionContext;
      agent: { agent_id: string; llm_id: string; soul_id: string };
      skillIds: string[];
      mcpIds: string[];
      contextData: string;
      maxFromRule: number;
      config: AgentExecutionConfigRecord | null;
    },
    history: string,
    maxIter: number,
    traceIterations: TraceIteration[],
  ): Promise<{ history: string; finalAnswer: string; totalTokens: number; iteration: number }> {
    const phases = rule.phases ?? [];
    // 全局 step 索引：phase.step 与 裸 step 名
    const globalSteps = new Map<string, { phase: RulePhase; step: RuleStep }>();
    for (const p of phases) {
      for (const s of p.steps) {
        globalSteps.set(s.step, { phase: p, step: s });
        globalSteps.set(`${p.phase}${s.step}`, { phase: p, step: s });
        globalSteps.set(`${p.phase.toLowerCase()}${s.step}`, { phase: p, step: s });
      }
      globalSteps.set(`${p.phase}Phase`, { phase: p, step: p.steps[0] });
      globalSteps.set(`${p.phase.toLowerCase()}phase`, { phase: p, step: p.steps[0] });
    }

    let phaseIdx = 0;
    let currentStep: RuleStep | null = phases[0]?.steps[0] ?? null;
    let currentPhase: RulePhase | null = phases[0] ?? null;
    let iteration = 0;
    let finalAnswer = '';
    let totalTokens = 0;
    let subSteps: string[] = [];
    let subStepIndex = 0;

    while (currentStep && currentPhase && iteration < maxIter) {
      const t0 = IdGenerator.now();
      // loop_over：将当前 sub_step 注入 context
      let stepEnv = env;
      if (currentPhase.loop_over === 'sub_steps' && subSteps.length > 0) {
        const sub = subSteps[Math.min(subStepIndex, subSteps.length - 1)];
        stepEnv = {
          ...env,
          contextData: `${env.contextData}\nCurrent sub_step: ${sub}`,
        };
      }

      const result = await this.executeAtomic(currentStep, stepEnv, history, iteration, maxIter);
      history = result.history;
      totalTokens += result.token_usage ?? 0;
      if (result.subSteps?.length) subSteps = result.subSteps;
      traceIterations.push({
        iteration_index: iteration,
        ...result.tracePiece,
        iteration_elapsed_ms: IdGenerator.now() - t0,
      });

      if (result.finalAnswer) {
        finalAnswer = result.finalAnswer;
        break;
      }

      let nextName: string | null = null;
      if (result.jumpTarget) {
        nextName = result.jumpTarget;
      } else if (result.conditionValue === false) {
        nextName = currentStep.false_next ?? null;
      } else if (result.conditionValue === true) {
        nextName = currentStep.true_next ?? currentStep.next ?? null;
      } else {
        nextName = currentStep.next ?? null;
      }

      // Reflect false → 若 loop 还有 sub_step，继续 Act；否则走 false_next
      if (
        currentStep.step === 'Reflect'
        && result.conditionValue === false
        && currentPhase.loop_over === 'sub_steps'
        && subStepIndex < subSteps.length - 1
      ) {
        subStepIndex++;
        nextName = 'Act';
      }

      if (!nextName) {
        // 进入下一 phase
        phaseIdx++;
        currentPhase = phases[phaseIdx] ?? null;
        currentStep = currentPhase?.steps[0] ?? null;
        iteration++;
        continue;
      }

      const resolved = this.resolveJump(nextName, globalSteps, currentPhase);
      if (!resolved) {
        // 尝试 Answer
        const answer = globalSteps.get('Answer');
        if (answer) {
          currentPhase = answer.phase;
          currentStep = answer.step;
        } else {
          break;
        }
      } else {
        currentPhase = resolved.phase;
        currentStep = resolved.step;
      }
      iteration++;
    }

    return { history, finalAnswer, totalTokens, iteration };
  }

  private resolveJump(
    target: string,
    globalSteps: Map<string, { phase: RulePhase; step: RuleStep }>,
    currentPhase: RulePhase,
  ): { phase: RulePhase; step: RuleStep } | null {
    if (globalSteps.has(target)) return globalSteps.get(target)!;
    const lower = target.toLowerCase();
    if (globalSteps.has(lower)) return globalSteps.get(lower)!;
    // 同 phase 内
    const local = currentPhase.steps.find((s) => s.step === target);
    if (local) return { phase: currentPhase, step: local };
    return null;
  }

  private async executeAtomic(
    step: RuleStep,
    env: {
      input: ExecAgentInput;
      ctx: AgentExecutionContext;
      agent: { agent_id: string; llm_id: string; soul_id: string };
      skillIds: string[];
      mcpIds: string[];
      skills: { id: string; brief: string; work: string }[];
      mcps: { id: string; title: string; brief: string }[];
      toolsJson: string;
      agentName: string;
      domain: string;
      contextData: string;
    },
    history: string,
    iteration: number,
    maxIter: number,
  ): Promise<StepResult & { token_usage?: number; tracePiece: Partial<TraceIteration> }> {
    const { input, ctx, agent, skillIds, mcpIds, contextData, toolsJson, agentName, domain } = env;

    try {
      if (step.step === 'Think') {
        const thinkOut = new ThinkOutput();
        await this.think(
          Object.assign(new ThinkInput(), {
            agent_id: input.agent_id,
            agent_name: agentName,
            llm_id: agent.llm_id,
            soul_id: agent.soul_id,
            context_data: contextData,
            history,
            iteration,
            tools_json: toolsJson,
            domain,
          }),
          ctx,
          thinkOut,
        );
        const nextAction = parseJsonObject(thinkOut.next_action) ?? {};
        const subSteps = Array.isArray(nextAction.sub_steps)
          ? (nextAction.sub_steps as unknown[]).map(String)
          : undefined;
        return {
          history: `${history}\nThink: ${thinkOut.reasoning}\nNext: ${thinkOut.next_action}`,
          jumpTarget: step.next ?? null,
          subSteps,
          token_usage: thinkOut.token_usage,
          tracePiece: {
            think: { reasoning: thinkOut.reasoning, next_action: thinkOut.next_action },
          },
        };
      }

      if (step.step === 'Act') {
        const actOut = new ActOutput();
        await this.act(
          Object.assign(new ActInput(), {
            agent_id: input.agent_id,
            skill_ids: skillIds,
            mcp_ids: mcpIds,
            next_action: this.extractLastNextAction(history),
            context_data: contextData,
          }),
          ctx,
          actOut,
        );
        return {
          history: `${history}\nAct: ${actOut.result}`,
          jumpTarget: step.next ?? null,
          tracePiece: {
            act: { result: actOut.result, tool_type: actOut.tool_type, tool_id: actOut.tool_id },
          },
        };
      }

      if (step.step === 'Reflect') {
        const reflectOut = new ReflectOutput();
        await this.reflect(
          Object.assign(new ReflectInput(), {
            agent_id: input.agent_id,
            agent_name: agentName,
            llm_id: agent.llm_id,
            soul_id: agent.soul_id,
            context_data: contextData,
            history,
            iteration,
            max_iterations: maxIter,
            tools_json: toolsJson,
            domain,
          }),
          ctx,
          reflectOut,
        );
        return {
          history: `${history}\nReflect: ${reflectOut.reflection}`,
          conditionValue: reflectOut.should_continue,
          jumpTarget: reflectOut.should_continue
            ? (step.true_next ?? null)
            : (step.false_next ?? null),
          token_usage: reflectOut.token_usage,
          tracePiece: {
            reflect: {
              should_continue: reflectOut.should_continue,
              reflection: reflectOut.reflection,
            },
          },
        };
      }

      if (step.step === 'Answer') {
        const answerOut = new AnswerOutput();
        await this.answer(
          Object.assign(new AnswerInput(), {
            agent_id: input.agent_id,
            agent_name: agentName,
            llm_id: agent.llm_id,
            soul_id: agent.soul_id,
            history,
            context_data: contextData,
            task_content: input.task_content,
            tools_json: toolsJson,
            domain,
          }),
          ctx,
          answerOut,
        );
        return {
          history,
          finalAnswer: answerOut.answer,
          stopRunning: true,
          token_usage: answerOut.token_usage,
          tracePiece: { answer: { answer: answerOut.answer } },
        };
      }
    } catch (err) {
      if (step.on_error) {
        return {
          history: `${history}\nError: ${String(err)}`,
          jumpTarget: step.on_error,
          tracePiece: {},
        };
      }
      throw err;
    }

    return { history, jumpTarget: step.next ?? null, tracePiece: {} };
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private async loadSoulSystem(soulId: string): Promise<string> {
    if (!soulId) return '';
    try {
      const out = new GetSoulOutput();
      await this.soulAccess.getSoul(
        Object.assign(new GetSoulInput(), { id: soulId }),
        new SoulContext(),
        out,
      );
      return out.soul?.soul_content ?? out.soul?.soul_brief ?? '';
    } catch {
      return '';
    }
  }

  private async renderOrFallback(
    templateId: string | undefined,
    variables: Record<string, unknown>,
    fallback: string,
  ): Promise<string> {
    if (!templateId) return fallback;
    try {
      const out = new ExecPromptOutput();
      const ok = await this.promptsAccess.execPrompt(
        Object.assign(new ExecPromptInput(), { id: templateId, variables }),
        new PromptContext(),
        out,
      );
      if (ok && out.prompt) return out.prompt;
    } catch {
      /* fallback */
    }
    return fallback;
  }

  private async assertPromptExists(id: string): Promise<void> {
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

  /**
   * 通过 SkillCore 读取 Agent 当前绑定的 Skill 列表。
   * matchSkill 命中缓存时会直接返回 agent_skill 表中的已绑定记录，
   * Agent 层不直接操作 Core 的 agent_skill 绑定表。
   */
  private async loadSkills(agentId: string, ctx: AgentExecutionContext): Promise<{ id: string; brief: string; work: string }[]> {
    try {
      const out = new MatchSkillOutput();
      await this.skillCore.matchSkill(
        Object.assign(new MatchSkillInput(), {
          agent_id: agentId,
          context_id: ctx.session_id || '',
          interact_id: ctx.interact_id || '',
        }),
        new SkillCoreContext(),
        out,
      );
      const entries = out.skills ?? [];
      if (entries.length === 0) return [];
      const ids = entries.map((s) => s.skill_id);
      const skillRows = this.relationDb.queryRaw<{ id: string; skill_brief: string; work: string }>(
        `SELECT "id", "skill_brief", "work" FROM "skill" WHERE "id" IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
      const workMap = new Map((skillRows || []).map((r) => [r.id, r.work]));
      return entries.map((s) => ({ id: s.skill_id, brief: s.skill_brief, work: workMap.get(s.skill_id) || s.skill_brief }));
    } catch {
      return [];
    }
  }

  /**
   * 通过 MCPCore 读取 Agent 当前绑定的 MCP 列表。
   * matchMCP 命中缓存时会直接返回 agent_mcp 表中的已绑定记录，
   * Agent 层不直接操作 Core 的 agent_mcp 绑定表。
   */
  private async loadMcps(agentId: string, ctx: AgentExecutionContext): Promise<{ id: string; title: string; brief: string }[]> {
    try {
      const out = new MatchMcpOutput();
      await this.mcpCore.matchMCP(
        Object.assign(new MatchMcpInput(), {
          agent_id: agentId,
          context_id: ctx.session_id || '',
          interact_id: ctx.interact_id || '',
        }),
        new McpCoreContext(),
        out,
      );
      const ids = out.mcp_ids ?? [];
      if (ids.length === 0) return [];
      const rows = this.relationDb.queryRaw<{ id: string; mcp_title: string; mcp_brief: string | null }>(
        `SELECT "id", "mcp_title", "mcp_brief" FROM "mcp_install" WHERE "id" IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
      return (rows || []).map((r) => ({ id: r.id, title: r.mcp_title, brief: r.mcp_brief || '' }));
    } catch {
      return [];
    }
  }

  private async saveStepInfo(
    ctx: AgentExecutionContext,
    agentId: string,
    role: string,
    info: string,
  ): Promise<void> {
    if (!ctx.session_id) return;
    try {
      await this.infoCore.saveInfo(
        Object.assign(new SaveInfoInput(), {
          session_id: ctx.session_id,
          work_id: ctx.work_id || '',
          interact_id: ctx.interact_id || '',
          info_creator_id: agentId,
          info_creator_role: role,
          info,
        }),
        new InfoCoreContext(),
        new SaveInfoOutput(),
      );
    } catch {
      /* best-effort */
    }
  }

  private async persistTrace(
    traceId: string,
    agentId: string,
    start: number,
    end: number,
    iterations: TraceIteration[],
    totalTokens: number,
    answer: string,
  ): Promise<void> {
    // agent_execution_trace 表由 AgentExecutionSchemaInitializer 在初始化阶段通过 RelationDBProvider 创建，
    // 此处仅通过 RelationDBProvider 写入轨迹数据，不再内联建表。
    try {
      const now = IdGenerator.now();
      await this.relationDb.insert(AGENT_EXECUTION_TRACE_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'trace_id', value: traceId },
        { field: 'agent_id', value: agentId },
        { field: 'start_time', value: start },
        { field: 'end_time', value: end },
        { field: 'iterations_json', value: JSON.stringify(iterations) },
        { field: 'total_token_usage', value: totalTokens },
        { field: 'answer', value: answer },
      ]);
    } catch {
      /* best-effort */
    }
  }

  private async getConfig(): Promise<AgentExecutionConfigRecord | null> {
    const row = await this.relationDb.selectOne(AGENT_EXECUTION_CONFIG_TABLE, []);
    if (!row) return null;
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      think_prompt_template_id: String(row.think_prompt_template_id ?? ''),
      reflect_prompt_template_id: String(row.reflect_prompt_template_id ?? ''),
      answer_prompt_template_id: String(row.answer_prompt_template_id ?? ''),
      default_max_iterations: Number(row.default_max_iterations ?? 10),
      async_worker_interval: Number(row.async_worker_interval ?? 1000),
    };
  }

  private toLibCtx(ctx: AgentExecutionContext, workId: string, interactId: string): AgentLibraryContext {
    return Object.assign(new AgentLibraryContext(), {
      session_id: ctx.session_id,
      work_id: workId || ctx.work_id,
      interact_id: interactId || ctx.interact_id,
    });
  }

  private extractLastNextAction(history: string): string {
    const matches = [...history.matchAll(/Next:\s*(.+)/g)];
    if (matches.length === 0) return '{"tool_type":"NONE"}';
    return matches[matches.length - 1][1].trim();
  }
}
