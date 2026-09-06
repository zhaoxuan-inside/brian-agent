import type {
  RelationDBAccess, LLMAccess, PromptsAccess, SkillAccess, SoulAccess, MCPAccess, MQAccess, StreamAccess, Logger,
} from '@brian-agent/base';
import { Metrics, Report } from '@brian-agent/base';
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
  InfoType,
  HandleResultType,
  classifyHandleResult,
  PROMPT_IDS, getBuiltinTemplate, renderTemplate,
  type DataObject,
} from '@brian-agent/base';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import type { InfoCoreAccess, MQCoreAccess, SkillCoreAccess, MCPCoreAccess, LLMCoreAccess, CDTCoreAccess } from '@brian-agent/core';
import {
  MatchSkillInput, MatchSkillOutput, SkillCoreContext,
  MatchMcpInput, MatchMcpOutput, McpCoreContext,
  MatchLLMInput, MatchLLMOutput, LLMCoreContext,
  CDTCoreContext,
  CDTCoreNavigateInput, CDTCoreNavigateOutput,
  CDTCoreTypeTextInput, CDTCoreTypeTextOutput,
  CDTCoreClickInput, CDTCoreClickOutput,
  CDTCoreScrollInput, CDTCoreScrollOutput,
  CDTCoreEvaluateInput, CDTCoreEvaluateOutput,
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
import type { TraceIterations, TraceIterationRecord } from '../domain/trace';
import {
  buildPromptRef, buildThinkStep, buildActStep, buildReflectStep, buildAnswerStep, buildLightTraceRef,
} from './trace/TraceCodec';
import { TraceStore } from './trace/TraceStore';
import {
  GetAgentInput, GetAgentOutput, RecordAgentUsageInput, RecordAgentUsageOutput,
  AgentLibraryContext, ComponentKind,
} from '../../AgentLibrary/domain/types';
import {
  GetStrategyInput, GetStrategyOutput, AgentStrategyContext,
} from '../../AgentStrategy/domain/types';
import {
  SaveInfoInput, SaveInfoOutput, ContextInfoInput, ContextInfoOutput, InfoCoreContext,
  StartWorkerInput, StartWorkerOutput, SoWorkerInput, SoWorkerOutput, MQCoreContext,
  LastNInfoInput, LastNInfoOutput,
} from '@brian-agent/core';
import { parseJsonObject, parseTaskContentAndContext } from '../../shared/signature';
import { formatContextCategories } from '@brian-agent/base';

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
  token_usage?: number;
  tracePiece: Partial<TraceIterationRecord>;
}

/** Agent 执行环境：聚合执行阶段所需的全部上下文，供各 step 处理函数消费。 */
interface AgentExecutionEnv {
  input: ExecAgentInput;
  ctx: AgentExecutionContext;
  agent: { agent_id: string; soul_id: string };
  skillIds: string[];
  mcpIds: string[];
  skills: { id: string; brief: string; work: string }[];
  mcps: { id: string; title: string; brief: string }[];
  toolsJson: string;
  agentName: string;
  domain: string;
  contextData: string;
  llmId: string;
  maxFromRule: number;
  taskId: string;
  config: AgentExecutionConfigRecord | null;
}

export class AgentExecutionService {
  // 全量 LLM 轨迹（各阶段 prompt/raw_response/工具结果）单条可达数百 KB，
  // 上限淘汰防止随执行次数无界增长；需要完整轨迹走 agent_execution_trace 落库查询。
  private static readonly TRACES_MAX = 100;
  private readonly traces = new Map<string, {
    agent_id: string;
    start_time: number;
    end_time: number;
    iterations: TraceIterations;
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
    private readonly llmCore: LLMCoreAccess,
    private readonly cdtCore?: CDTCoreAccess,
    private readonly logger?: Logger,
    private readonly streamAccess?: StreamAccess,
  ) {
    this.traceStore = new TraceStore(relationDb);
  }

  private readonly traceStore: TraceStore;

  async execAgent(input: ExecAgentInput, output: ExecAgentOutput, ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const start = IdGenerator.now();
    const config = await this.getConfig();
    const traceId = IdGenerator.generate();
    const maxIter = input.max_iterations ?? config?.default_max_iterations ?? 10;
    const libCtx = this.toLibCtx(ctx, input.work_id, input.interact_id);

    const getOut = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_id: input.agent_id }),
      getOut,
      libCtx,
    );
    if (getOut.agents.length === 0 || !getOut.agents[0].enable) {
      throw new NotFoundError('Agent', input.agent_id);
    }
    const agent = getOut.agents[0];
    // LLM 绑定只存在于 LLMProvider 的 agent_llm，执行时经 Core.matchLLM 解析
    const llmId = await this.resolveLlm(input.agent_id, ctx);
    const domainMatch = (agent.task_signature || '').match(/^\[(.+?)\]/);
    const domain = domainMatch ? domainMatch[1] : 'general';
    const agentName = agent.agent_name || agent.agent_id;

    // ===== 修改后的方法：剥离 work_context 非内容 JSON 属性，确保 Prompt 仅包含纯净 Task Content =====
    const { cleanTaskContent } = parseTaskContentAndContext(input.task_content);
    input.task_content = cleanTaskContent;
    let contextData = cleanTaskContent;

    const sessionId = ctx.session_id;
    if (sessionId) {
      try {
        const ctxOut = new ContextInfoOutput();
        // ===== 修改后的代码：传入 info: input.task_content =====
        await this.infoCore.context(
          Object.assign(new ContextInfoInput(), {
            session_id: sessionId,
            work_id: input.work_id || ctx.work_id || '',
            selected_msg_ids: ctx.selected_msg_ids,
            info: input.task_content,
            persist_snapshot: false,
          }),
          ctxOut,
          new InfoCoreContext(),
        );
        // ===== 修改后的方法：按分类分类节点包裹内容且脱敏非内容属性 =====
        // 当前消息（本次输入）已由 InfoCoreProvider.context 单独拆出为 CURRENT 类型，
        // 不再拼入上下文；上下文仅包含历史引用消息，任务内容经 task_content 变量单独注入。
        const formattedCtx = formatContextCategories(ctxOut);
        if (formattedCtx) {
          contextData = formattedCtx;
        }
      } catch {
        /* best-effort */
      }
    }

    const stratOut = new GetStrategyOutput();
    await this.agentStrategy.soStrategyById(
      Object.assign(new GetStrategyInput(), { strategy_id: agent.strategy_id }),
      stratOut,
      new AgentStrategyContext(),
    );

    const skills = await this.loadSkills(input.agent_id, ctx);
    const mcps = await this.loadMcps(input.agent_id, ctx);
    const skillIds = skills.map((s) => s.id);
    const mcpIds = mcps.map((m) => m.id);
    const toolsJson = JSON.stringify({
      skills: skills.map((s) => ({ id: s.id, description: s.brief, work: s.work })),
      mcps: mcps.map((m) => ({ id: m.id, name: m.title, description: m.brief })),
      browser: this.buildBrowserToolDef(),
    });

    let history = '';
    let iteration = 0;
    let finalAnswer = '';
    const traceIterations: TraceIterations = [];
    let totalTokens = 0;

    let rule: ExecutionRule | null = null;
    try {
      rule = stratOut.execution_rule ? JSON.parse(stratOut.execution_rule) as ExecutionRule : null;
    } catch {
      rule = null;
    }

    // ===== 工具可用但策略规则不含 Act 步（如 CoT）时，升级为 ReAct 工具循环 =====
    // CoT 规则为 Think→Answer，缺少 Act，导致 Think 即使决定 tool_type=CDT/SKILL/MCP 也不会被执行。
    // 只要 Agent 存在可用工具（绑定 Skill / MCP / 内置浏览器），就应保证工具决策能被实际执行。
    const hasTools = skillIds.length > 0 || mcpIds.length > 0 || Boolean(this.cdtCore);
    const ruleHasAct = !!rule?.steps?.some((s) => s.step === 'Act')
      || !!rule?.phases?.some((p) => p.steps.some((s) => s.step === 'Act'));
    if (hasTools && rule && !ruleHasAct) {
      rule = {
        version: '1.0',
        max_iterations: 10,
        steps: [
          { step: 'Think', next: 'Act', on_error: 'Answer' },
          { step: 'Act', next: 'Reflect', on_error: 'Answer' },
          { step: 'Reflect', condition_field: 'should_continue', true_next: 'Think', false_next: 'Answer', on_error: 'Answer' },
          { step: 'Answer', next: null },
        ],
      };
    }
    const maxFromRule = rule?.max_iterations ?? maxIter;

    const env = {
      input, ctx, agent, skillIds, mcpIds, skills, mcps, contextData, toolsJson, maxFromRule, config,
      agentName, domain, llmId, taskId: input.task_id ?? '',
    };

    if (!rule?.steps && !rule?.phases) {
      const answerOut = new AnswerOutput();
      await this.execAnswer(
        Object.assign(new AnswerInput(), {
          agent_id: input.agent_id, agent_name: agentName, domain, llm_id: llmId, soul_id: agent.soul_id,
          history, context_data: contextData, task_content: input.task_content,
          tools_json: toolsJson,
        }),
        answerOut,
        ctx,
      );
      finalAnswer = answerOut.answer;
      totalTokens += answerOut.token_usage;
      // ===== 修改后的代码：补全 raw_response 与 input/output tokens 记录（prompt 以引用存储，展示时重建） =====
      traceIterations.push({
        iteration_index: 0,
        answer: buildAnswerStep(answerOut, this.answerPromptRef(env)),
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
      await this.execAnswer(
        Object.assign(new AnswerInput(), {
          agent_id: input.agent_id, agent_name: agentName, domain, llm_id: llmId, soul_id: agent.soul_id,
          history, context_data: contextData, task_content: input.task_content,
          tools_json: toolsJson,
        }),
        answerOut,
        ctx,
      );
      finalAnswer = answerOut.answer;
      totalTokens += answerOut.token_usage;
      traceIterations.push({
        iteration_index: traceIterations.length,
        answer: buildAnswerStep(answerOut, this.answerPromptRef(env)),
        iteration_elapsed_ms: answerOut.elapsed_ms ?? 0,
      });
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
      new RecordAgentUsageOutput(),
      libCtx,
    );

    // 空答案视为执行失败：LLM 不可用时 ReACT 循环可能“正常”跑完但产出为空，
    // 需显式失败，避免上游编排层把空输出当作成功结果继续 Writer / Evolutor 阶段。
    const producedOutput = Boolean(finalAnswer && finalAnswer.trim());
    if (!producedOutput) {
      output.error = 'Work Agent 未产生有效输出（LLM 调用失败或返回为空）';
    }

    if (sessionId) {
      try {
        const traceHandleResult = producedOutput
          ? HandleResultType.CORRECT
          : classifyHandleResult(output.error, 'external');
        await this.infoCore.saveInfo(
          Object.assign(new SaveInfoInput(), {
            session_id: sessionId,
            work_id: input.work_id || ctx.work_id,
            interact_id: input.interact_id || ctx.interact_id || '',
            info_type: InfoType.ACT,
            info_creator_role: 'AGENT',
            info_creator_id: input.agent_id,
            info: JSON.stringify(buildLightTraceRef(traceId, finalAnswer, totalTokens)),
            handle_result_type: traceHandleResult,
          }),
          new SaveInfoOutput(),
          new InfoCoreContext(),
        );
      } catch {
        /* best-effort */
      }
    }

    const end = IdGenerator.now();
    while (this.traces.size >= AgentExecutionService.TRACES_MAX) {
      // Map 迭代序即插入序，淘汰最早写入的轨迹
      const oldest = this.traces.keys().next().value;
      if (oldest === undefined) break;
      this.traces.delete(oldest);
    }
    this.traces.set(traceId, {
      agent_id: input.agent_id,
      start_time: start,
      end_time: end,
      iterations: traceIterations,
      total_token_usage: totalTokens,
      answer: finalAnswer,
    });
    await this.traceStore.save({
      trace_id: traceId, agent_id: input.agent_id, start_time: start, end_time: end,
      iterations: traceIterations, total_token_usage: totalTokens, answer: finalAnswer,
    });

    output.answer = finalAnswer;
    output.iterations = iteration || traceIterations.length;
    output.trace_id = traceId;
    output.elapsed_ms = end - start;

    return producedOutput;
  }

  async execAgentAsync(input: ExecAgentAsyncInput, output: ExecAgentAsyncOutput, ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report,
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
      new SendMQOutput(),
      new MQContext(),
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
              execOut,
              execCtx,
            );
            if (payload.callback_queue) {
              await this.mqAccess.sendMQ(
                Object.assign(new SendMQInput(), {
                  data: { queue: String(payload.callback_queue), payload: execOut },
                }),
                new SendMQOutput(),
                new MQContext(),
              );
            }
            return true;
          },
        }),
        new StartWorkerOutput(),
        new MQCoreContext(),
      );
    } catch {
      /* worker may already exist */
    }

    output.job_id = jobId;
    return true;
  }

  /**
   * 统一封装 LLM 文本生成调用：execLLM 失败（返回 false）时抛出带阶段名的
   * ValidationError，保证 think / reflect / answer 三阶段对 LLM 失败的语义一致，
   * 避免下游把“空输出”误判为正常完成。
   */
  private async execLLMOrThrow(
    llmId: string,
    prompt: string,
    stepName: string,
    system?: string,
  ): Promise<ExecLLMOutput> {
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
    if (!ok) {
      const reason = llmOut.error ?? 'unknown error';
      throw new ValidationError(`${stepName} execLLM failed: ${reason}`);
    }
    return llmOut;
  }

  async execThink(input: ThinkInput, output: ThinkOutput, ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    if (!input.llm_id) throw new ValidationError('think 需要 llm_id');
    const config = await this.getConfig();
    const system = await this.loadSoulSystem(input.soul_id);
    const prompt = await this.renderOrFallback(
      config?.think_prompt_template_id,
      PROMPT_IDS.think,
      {
        agent_name: input.agent_name,
        soul: system,
        task_content: input.task_content,
        context_data: input.context_data,
        history: input.history,
        iteration: input.iteration,
        tools_json: input.tools_json || '{}',
        domain: input.domain || 'general',
      },
    );

    const llmOut = await this.execLLMOrThrow(input.llm_id, prompt, 'think', system);

    const parsed = parseJsonObject(llmOut.result);
    output.prompt = prompt;
    output.raw_response = llmOut.result || '';
    output.reasoning = String(parsed?.reasoning ?? llmOut.result);
    output.next_action = JSON.stringify(parsed?.next_action ?? { tool_type: 'NONE' });
    output.input_tokens = Number(llmOut.input_tokens ?? 0);
    output.output_tokens = Number(llmOut.output_tokens ?? 0);
    output.token_usage = Number((llmOut.input_tokens ?? 0) + (llmOut.output_tokens ?? 0));

    await this.saveStepInfo(ctx, 'THINK', 'AGENT', input.agent_id, output.reasoning);
    return true;
  }

  async execAct(input: ActInput, output: ActOutput, ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
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
    output.params = params;
    output.next_action = input.next_action;

    if (toolType === 'SKILL') {
      if (!input.skill_ids.includes(toolId)) {
        throw new ValidationError(`Skill not bound to agent: ${toolId}`);
      }
      try {
        const skillOut = new ExecSkillOutput();
        const ok = await this.skillAccess.execSkill(
          Object.assign(new ExecSkillInput(), { id: toolId, params }),
          skillOut,
          new SkillContext(),
        );
        if (!ok) {
          throw new ValidationError(skillOut.error ?? `execSkill failed: ${toolId}`);
        }
        output.result = typeof skillOut.result === 'string'
          ? skillOut.result
          : JSON.stringify(skillOut.result ?? {});
        await this.saveStepInfo(ctx, 'SKILL', 'SKILL', toolId, output.result);
        return true;
      } catch (err) {
        await this.saveStepInfo(
          ctx, 'SKILL', 'SKILL', toolId, this.errorText(err),
          classifyHandleResult(err, 'external'),
        );
        throw err;
      }
    }

    if (toolType === 'MCP') {
      if (!input.mcp_ids.includes(toolId)) {
        throw new ValidationError(`MCP not bound to agent: ${toolId}`);
      }
      try {
        const mcpOut = new ExecMcpOutput();
        const ok = await this.mcpAccess.execMcp(
          Object.assign(new ExecMcpInput(), { id: toolId, params }),
          mcpOut,
          new McpContext(),
        );
        if (!ok) {
          throw new ValidationError(mcpOut.error ?? `execMcp failed: ${toolId}`);
        }
        output.result = typeof mcpOut.result === 'string'
          ? mcpOut.result
          : JSON.stringify(mcpOut.result ?? {});
        await this.saveStepInfo(ctx, 'MCP', 'MCP', toolId, output.result);
        return true;
      } catch (err) {
        await this.saveStepInfo(
          ctx, 'MCP', 'MCP', toolId, this.errorText(err),
          classifyHandleResult(err, 'external'),
        );
        throw err;
      }
    }

    if (toolType === 'CDT') {
      try {
        const result = await this.execCdtAction(toolId, params);
        output.result = result;
        await this.saveStepInfo(ctx, InfoType.CDT, 'CDT', toolId, result);
        return true;
      } catch (err) {
        await this.saveStepInfo(
          ctx, InfoType.CDT, 'CDT', toolId, this.errorText(err),
          classifyHandleResult(err, 'external'),
        );
        throw err;
      }
    }

    output.result = 'No external tool required';
    await this.saveStepInfo(ctx, 'ACT', 'AGENT', input.agent_id, output.result);
    return true;
  }

  async execReflect(input: ReflectInput, output: ReflectOutput, ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
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
      PROMPT_IDS.reflect,
      {
        agent_name: input.agent_name,
        soul: system,
        task_content: input.task_content,
        context_data: input.context_data,
        history: input.history,
        iteration: input.iteration,
        max_iterations: input.max_iterations,
        tools_json: input.tools_json || '{}',
        domain: input.domain || 'general',
      },
    );

    const llmOut = await this.execLLMOrThrow(input.llm_id, prompt, 'reflect', system);

    const parsed = parseJsonObject(llmOut.result);
    output.prompt = prompt;
    output.raw_response = llmOut.result || '';
    output.should_continue = Boolean(parsed?.should_continue ?? true);
    output.reflection = String(parsed?.reflection ?? llmOut.result);
    output.input_tokens = Number(llmOut.input_tokens ?? 0);
    output.output_tokens = Number(llmOut.output_tokens ?? 0);
    output.token_usage = Number((llmOut.input_tokens ?? 0) + (llmOut.output_tokens ?? 0));
    await this.saveStepInfo(ctx, 'REFLECT', 'AGENT', input.agent_id, output.reflection);
    return true;
  }

  async execAnswer(input: AnswerInput, output: AnswerOutput, _ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    if (!input.llm_id) throw new ValidationError('answer 需要 llm_id');
    const config = await this.getConfig();
    const system = await this.loadSoulSystem(input.soul_id);
    const prompt = await this.renderOrFallback(
      config?.answer_prompt_template_id,
      PROMPT_IDS.answer,
      {
        agent_name: input.agent_name,
        soul: system,
        task_content: input.task_content,
        context_data: input.context_data,
        history: input.history,
        tools_json: input.tools_json || '{}',
        domain: input.domain || 'general',
      },
    );

    const llmOut = await this.execLLMOrThrow(input.llm_id, prompt, 'answer', system);
    output.prompt = prompt;
    output.raw_response = llmOut.result || '';
    output.answer = llmOut.result || '';
    output.input_tokens = Number(llmOut.input_tokens ?? 0);
    output.output_tokens = Number(llmOut.output_tokens ?? 0);
    output.token_usage = Number((llmOut.input_tokens ?? 0) + (llmOut.output_tokens ?? 0));

    return true;
  }

  async soTrace(input: GetTraceInput, output: GetTraceOutput, _ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report,
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
        lastOut,
        new InfoCoreContext(),
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

  async soExecQueueStatus(_input: GetExecQueueStatusInput, output: GetExecQueueStatusOutput, _ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const statsOut = new GetQueueStatsOutput();
    try {
      await this.mqAccess.soQueueStats(
        Object.assign(new GetQueueStatsInput(), { queue: EXEC_QUEUE }),
        statsOut,
        new MQContext(),
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
        workersOut,
        new MQCoreContext(),
      );
      output.workers = workersOut.workers ?? [];
    } catch {
      output.workers = [];
    }
    return true;
  }

  async configAgentExecution(input: ConfigAgentExecutionInput, output: ConfigAgentExecutionOutput, _ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report,
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
    env: AgentExecutionEnv,
    history: string,
    maxIter: number,
    traceIterations: TraceIterations,
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
    env: AgentExecutionEnv,
    history: string,
    maxIter: number,
    traceIterations: TraceIterations,
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
    env: AgentExecutionEnv,
    history: string,
    iteration: number,
    maxIter: number,
  ): Promise<StepResult> {
    try {
      return await this.dispatchStep(step, env, history, iteration, maxIter);
    } catch (err) {
      return this.handleStepError(step, history, err);
    }
  }

  private async dispatchStep(
    step: RuleStep,
    env: AgentExecutionEnv,
    history: string,
    iteration: number,
    maxIter: number,
  ): Promise<StepResult> {
    switch (step.step) {
      case 'Think': return this.runThinkStep(step, env, history, iteration);
      case 'Act': return this.runActStep(step, env, history, iteration);
      case 'Reflect': return this.runReflectStep(step, env, history, iteration, maxIter);
      case 'Answer': return this.runAnswerStep(step, env, history);
      default: return { history, jumpTarget: step.next ?? null, tracePiece: {} };
    }
  }

  private handleStepError(step: RuleStep, history: string, err: unknown): StepResult {
    if (step.on_error) {
      return { history: `${history}\nError: ${String(err)}`, jumpTarget: step.on_error, tracePiece: {} };
    }
    throw err;
  }

  private async runThinkStep(
    step: RuleStep,
    env: AgentExecutionEnv,
    history: string,
    iteration: number,
  ): Promise<StepResult> {
    const thinkOut = new ThinkOutput();
    await this.execThink(this.buildThinkInput(env, history, iteration), thinkOut, env.ctx);
    this.pushThink(env, step.step, thinkOut, iteration);
    const nextAction = parseJsonObject(thinkOut.next_action);
    const subSteps = this.extractSubSteps(nextAction);
    // ===== 优化：think 判定无需外部工具（tool_type=NONE）时直接进入 Answer，跳过 Act+Reflect =====
    // 对于「推荐/规划/问答」类任务，Think 一轮即可判定无需工具，此时 Reflect 空转（LLM 常把
    // 答案写进 reflection 却仍返回 should_continue=true）是「执行慢」的主要来源。跳过 Reflect
    // 可省掉一整轮 LLM 调用，直接产出最终回答。
    const toolType = String(nextAction?.tool_type ?? 'NONE').toUpperCase();
    const skipToAnswer = !toolType || toolType === 'NONE';
    return {
      history: `${history}\nThink: ${thinkOut.reasoning}\nNext: ${thinkOut.next_action}`,
      jumpTarget: skipToAnswer ? 'Answer' : (step.next ?? null),
      subSteps,
      token_usage: thinkOut.token_usage,
      tracePiece: { think: buildThinkStep(thinkOut, this.thinkPromptRef(env, iteration)) },
    };
  }

  private async runActStep(step: RuleStep, env: AgentExecutionEnv, history: string, iteration: number): Promise<StepResult> {
    const actOut = new ActOutput();
    await this.execAct(this.buildActInput(env, history), actOut, env.ctx);
    this.pushAct(env, step.step, actOut, iteration);
    return {
      history: `${history}\nAct: ${actOut.result}`,
      jumpTarget: step.next ?? null,
      tracePiece: { act: buildActStep(actOut) },
    };
  }

  private async runReflectStep(
    step: RuleStep,
    env: AgentExecutionEnv,
    history: string,
    iteration: number,
    maxIter: number,
  ): Promise<StepResult> {
    const reflectOut = new ReflectOutput();
    await this.execReflect(this.buildReflectInput(env, history, iteration, maxIter), reflectOut, env.ctx);
    this.pushReflect(env, step.step, reflectOut, iteration);
    return {
      history: `${history}\nReflect: ${reflectOut.reflection}`,
      conditionValue: reflectOut.should_continue,
      jumpTarget: reflectOut.should_continue ? (step.true_next ?? null) : (step.false_next ?? null),
      token_usage: reflectOut.token_usage,
      tracePiece: { reflect: buildReflectStep(reflectOut, this.reflectPromptRef(env, iteration, maxIter)) },
    };
  }

  private async runAnswerStep(step: RuleStep, env: AgentExecutionEnv, history: string): Promise<StepResult> {
    const answerOut = new AnswerOutput();
    await this.execAnswer(this.buildAnswerInput(env, history), answerOut, env.ctx);
    return {
      history,
      finalAnswer: answerOut.answer,
      stopRunning: true,
      token_usage: answerOut.token_usage,
      tracePiece: { answer: buildAnswerStep(answerOut, this.answerPromptRef(env)) },
    };
  }

  private buildThinkInput(env: AgentExecutionEnv, history: string, iteration: number): ThinkInput {
    const { input, agent, contextData, toolsJson, agentName, domain, llmId } = env;
    return Object.assign(new ThinkInput(), {
      agent_id: input.agent_id, agent_name: agentName, llm_id: llmId, soul_id: agent.soul_id,
      task_content: input.task_content, context_data: contextData, history, iteration,
      tools_json: toolsJson, domain,
    });
  }

  private buildActInput(env: AgentExecutionEnv, history: string): ActInput {
    const { input, skillIds, mcpIds, contextData } = env;
    return Object.assign(new ActInput(), {
      agent_id: input.agent_id, skill_ids: skillIds, mcp_ids: mcpIds,
      next_action: this.extractLastNextAction(history), context_data: contextData,
    });
  }

  private buildReflectInput(
    env: AgentExecutionEnv,
    history: string,
    iteration: number,
    maxIter: number,
  ): ReflectInput {
    const { input, agent, contextData, toolsJson, agentName, domain, llmId } = env;
    return Object.assign(new ReflectInput(), {
      agent_id: input.agent_id, agent_name: agentName, llm_id: llmId, soul_id: agent.soul_id,
      task_content: input.task_content, context_data: contextData, history, iteration,
      max_iterations: maxIter, tools_json: toolsJson, domain,
    });
  }

  private buildAnswerInput(env: AgentExecutionEnv, history: string): AnswerInput {
    const { input, agent, contextData, toolsJson, agentName, domain, llmId } = env;
    return Object.assign(new AnswerInput(), {
      agent_id: input.agent_id, agent_name: agentName, llm_id: llmId, soul_id: agent.soul_id,
      history, context_data: contextData, task_content: input.task_content, tools_json: toolsJson, domain,
    });
  }

  private thinkPromptRef(env: AgentExecutionEnv, iteration: number) {
    return buildPromptRef(env.config?.think_prompt_template_id, PROMPT_IDS.think, {
      task_content: env.input.task_content, agent_name: env.agentName, domain: env.domain,
      iteration, tools_json: env.toolsJson, soul_id: env.agent.soul_id,
    });
  }

  private reflectPromptRef(env: AgentExecutionEnv, iteration: number, maxIter: number) {
    return buildPromptRef(env.config?.reflect_prompt_template_id, PROMPT_IDS.reflect, {
      task_content: env.input.task_content, agent_name: env.agentName, domain: env.domain,
      iteration, max_iterations: maxIter, tools_json: env.toolsJson, soul_id: env.agent.soul_id,
    });
  }

  private answerPromptRef(env: AgentExecutionEnv) {
    return buildPromptRef(env.config?.answer_prompt_template_id, PROMPT_IDS.answer, {
      task_content: env.input.task_content, agent_name: env.agentName, domain: env.domain,
      tools_json: env.toolsJson, soul_id: env.agent.soul_id,
    });
  }

  private extractSubSteps(nextAction: Record<string, unknown> | null): string[] | undefined {
    if (!nextAction) return undefined;
    const subSteps = nextAction.sub_steps;
    return Array.isArray(subSteps) ? (subSteps as unknown[]).map(String) : undefined;
  }

  private pushThink(env: AgentExecutionEnv, nodeId: string, thinkOut: ThinkOutput, iteration: number): void {
    const { ctx, input, agent, agentName, taskId } = env;
    const sessionId = ctx.session_id || '';
    if (!this.streamAccess || typeof this.streamAccess.pushEvent !== 'function' || !sessionId || !thinkOut.reasoning) return;
    this.streamAccess.pushEvent(sessionId, 'agent_thinking', 'TRACE', {
      reasoning: thinkOut.reasoning,
      next_action: thinkOut.next_action,
      prompt: thinkOut.prompt,
      raw_response: thinkOut.raw_response,
      iteration,
    }, {
      work_id: input.work_id || ctx.work_id || '', interact_id: input.interact_id || ctx.interact_id || '',
      agent_id: input.agent_id, agent_name: agentName,
      agent_type: (agent as any)?.agent_type || 'WORKER', node_id: nodeId, task_id: taskId,
    } as any).catch(() => {});
  }

  private pushAct(env: AgentExecutionEnv, nodeId: string, actOut: ActOutput, iteration: number): void {
    const { ctx, input, agent, agentName, taskId } = env;
    const sessionId = ctx.session_id || '';
    if (!this.streamAccess || typeof this.streamAccess.pushEvent !== 'function' || !sessionId) return;
    this.streamAccess.pushEvent(sessionId, 'agent_action', 'TRACE', {
      tool_type: actOut.tool_type, tool_id: actOut.tool_id, result: actOut.result,
      params: actOut.params, next_action: actOut.next_action, iteration,
    }, {
      work_id: input.work_id || ctx.work_id || '', interact_id: input.interact_id || ctx.interact_id || '',
      agent_id: input.agent_id, agent_name: agentName,
      agent_type: (agent as any)?.agent_type || 'WORKER', node_id: nodeId, task_id: taskId,
    } as any).catch(() => {});
  }

  private pushReflect(env: AgentExecutionEnv, nodeId: string, reflectOut: ReflectOutput, iteration: number): void {
    const { ctx, input, agent, agentName, taskId } = env;
    const sessionId = ctx.session_id || '';
    if (!this.streamAccess || typeof this.streamAccess.pushEvent !== 'function' || !sessionId) return;
    this.streamAccess.pushEvent(sessionId, 'agent_reflection', 'TRACE', {
      passed: !reflectOut.should_continue, reflection: reflectOut.reflection,
      prompt: reflectOut.prompt, raw_response: reflectOut.raw_response, iteration,
    }, {
      work_id: input.work_id || ctx.work_id || '', interact_id: input.interact_id || ctx.interact_id || '',
      agent_id: input.agent_id, agent_name: agentName,
      agent_type: (agent as any)?.agent_type || 'WORKER', node_id: nodeId, task_id: taskId,
    } as any).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  /**
   * 通过 Core.matchLLM 解析 Agent 绑定的 LLM（绑定只存在于 LLMProvider 的 agent_llm）。
   */
  private async resolveLlm(agentId: string, ctx: AgentExecutionContext): Promise<string> {
    const llmOut = new MatchLLMOutput();
    await this.llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), {
        agent_id: agentId,
        context_id: ctx.session_id || '',
        interact_id: ctx.interact_id || '',
      }),
      llmOut,
      new LLMCoreContext(),
    );
    if (!llmOut.llm_id) {
      throw new ValidationError(`Agent ${agentId} 未匹配到可用 LLM`);
    }
    return llmOut.llm_id;
  }

  private async loadSoulSystem(soulId: string): Promise<string> {
    if (!soulId) return '';
    try {
      const out = new GetSoulOutput();
      await this.soulAccess.soSoulById(
        Object.assign(new GetSoulInput(), { id: soulId }),
        out,
        new SoulContext(),
      );
      return out.soul?.soul_content ?? out.soul?.soul_brief ?? '';
    } catch {
      return '';
    }
  }

  private async renderOrFallback(
    templateId: string | undefined,
    builtinId: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    const id = templateId || builtinId;
    try {
      const out = new ExecPromptOutput();
      const ok = await this.promptsAccess.execPrompt(
        Object.assign(new ExecPromptInput(), { id, variables }),
        out,
        new PromptContext(),
      );
      if (ok && out.prompt) return out.prompt;
    } catch {
      /* fallback */
    }
    const tpl = getBuiltinTemplate(builtinId);
    return tpl ? renderTemplate(tpl, variables) : '';
  }

  private async assertPromptExists(id: string): Promise<void> {
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

  /** 读取 Agent 当前绑定（逻辑控制；绑定唯一事实源 = agent 表，经 AgentLibrary.soAgent） */
  private async soBoundComponentIds(agentId: string, kind: ComponentKind): Promise<string[]> {
    const out = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_id: agentId }),
      out,
      new AgentLibraryContext(),
    );
    const record = out.agents[0];
    if (!record) return [];
    if (kind === ComponentKind.Skill) return record.skill_ids ?? [];
    if (kind === ComponentKind.Mcp) return record.mcp_ids ?? [];
    return record.soul_id ? [record.soul_id] : [];
  }

  /**
   * 读取 Agent 当前绑定的 Skill 列表（绑定唯一事实源 = agent 表 skill_ids_json）。
   * 绑定经 matchSkill 的 bound_skill_ids 确定性水合（Core 不再持有绑定）。
   */
  private async loadSkills(agentId: string, ctx: AgentExecutionContext): Promise<{ id: string; brief: string; work: string }[]> {
    try {
      const boundSkillIds = await this.soBoundComponentIds(agentId, ComponentKind.Skill);
      const out = new MatchSkillOutput();
      await this.skillCore.matchSkill(
        Object.assign(new MatchSkillInput(), {
          agent_id: agentId,
          context_id: ctx.session_id || '',
          interact_id: ctx.interact_id || '',
          bound_skill_ids: boundSkillIds,
        }),
        out,
        new SkillCoreContext(),
      );
      const entries = out.skills ?? [];
      if (entries.length === 0) return [];
      const ids = entries.map((s) => s.skill_id);
      // ===== 修改后的代码：work 字段取自 skill_md 列（skill 表实际存在的工作指令列）=====
      const skillRows = this.relationDb.queryRaw<{ id: string; skill_brief: string; skill_md: string }>(
        `SELECT "id", "skill_brief", "skill_md" FROM "skill" WHERE "id" IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
      const workMap = new Map((skillRows || []).map((r) => [r.id, r.skill_md]));
      return entries.map((s) => ({ id: s.skill_id, brief: s.skill_brief, work: workMap.get(s.skill_id) || s.skill_brief }));
    } catch {
      return [];
    }
  }

  /**
   * 读取 Agent 当前绑定的 MCP 列表（绑定唯一事实源 = agent 表 mcp_ids_json）。
   * 绑定经 matchMCP 的 bound_mcp_ids 确定性水合。
   */
  private async loadMcps(agentId: string, ctx: AgentExecutionContext): Promise<{ id: string; title: string; brief: string }[]> {
    try {
      const boundMcpIds = await this.soBoundComponentIds(agentId, ComponentKind.Mcp);
      const out = new MatchMcpOutput();
      await this.mcpCore.matchMCP(
        Object.assign(new MatchMcpInput(), {
          agent_id: agentId,
          context_id: ctx.session_id || '',
          interact_id: ctx.interact_id || '',
          bound_mcp_ids: boundMcpIds,
        }),
        out,
        new McpCoreContext(),
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

  /**
   * 构建浏览器工具清单（CDT 内置浏览器自动化能力）。
   *
   * 浏览器能力无需像 Skill / MCP 那样绑定到 Agent，而是作为内置能力始终可用
   * （前提是 CDTCoreAccess 已注入）。调用方式：next_action.tool_type="CDT"，
   * tool_id 取下方 operations 中的 id，params 按各 operation 的参数填写。
   */
  private buildBrowserToolDef(): Record<string, unknown> {
    return {
      enabled: Boolean(this.cdtCore),
      description: '内置浏览器自动化能力（基于 CDT/Chrome DevTools Protocol）。用于访问网页、读取网页内容（如天气、新闻、搜索结果）、点击、填表等。调用方式：next_action.tool_type="CDT"，tool_id 为下方 operations 中的 id，params 按各 operation 的参数填写。',
      operations: [
        { id: 'navigate', description: '打开指定 URL 页面（如 https://weather.cma.cn/）', params: { url: '目标网址', waitForLoad: '是否等待加载完成，默认 true' } },
        { id: 'getContent', description: '提取当前页面可见文本内容，用于读取网页信息', params: {} },
        { id: 'click', description: '点击页面元素', params: { selector: 'CSS 选择器' } },
        { id: 'typeText', description: '在输入框中输入文字（如搜索框）', params: { selector: 'CSS 选择器', text: '要输入的文字' } },
        { id: 'scroll', description: '滚动页面', params: { pixels: '滚动像素数', toBottom: '是否滚动到底部' } },
        { id: 'evaluate', description: '在页面执行 JavaScript 表达式并返回结果', params: { expression: 'JS 表达式' } },
      ],
    };
  }

  /**
   * 执行 CDT 浏览器操作。
   *
   * 所有浏览器调用统一经 CDTCoreAccess（Core 层）完成，最终落到 CDTProvider（Base 层）
   * 的 Chrome DevTools Protocol 通道，保证浏览器操作不绕过 CDT 链路。
   */
  private async execCdtAction(operation: string, params: Record<string, unknown>): Promise<string> {
    const cdt = this.cdtCore;
    if (!cdt) throw new ValidationError('CDT 浏览器能力未注入（cdtCore 为空）');

    const op = String(operation || '').trim().toLowerCase();
    switch (op) {
      case 'navigate': {
        const url = String(params.url ?? '').trim();
        if (!url) throw new ValidationError('CDT navigate 需要 url 参数');
        const out = new CDTCoreNavigateOutput();
        const ok = await cdt.navigate(
          Object.assign(new CDTCoreNavigateInput(), { url, waitForLoad: params.waitForLoad !== false }),
          out,
          new CDTCoreContext(),
        );
        if (!ok) throw new ValidationError(out.error || 'CDT navigate 执行失败');
        return `已打开页面：${url}`;
      }
      case 'getcontent': {
        const out = new CDTCoreEvaluateOutput();
        const ok = await cdt.evaluate(
          Object.assign(new CDTCoreEvaluateInput(), { expression: 'document.body ? document.body.innerText : ""' }),
          out,
          new CDTCoreContext(),
        );
        if (!ok) throw new ValidationError(out.error || 'CDT getContent 执行失败');
        return this.extractEvalText(out.result).slice(0, 8000);
      }
      case 'click': {
        const selector = String(params.selector ?? '').trim();
        if (!selector) throw new ValidationError('CDT click 需要 selector 参数');
        const out = new CDTCoreClickOutput();
        const ok = await cdt.click(
          Object.assign(new CDTCoreClickInput(), { selector }),
          out,
          new CDTCoreContext(),
        );
        if (!ok) throw new ValidationError(out.error || 'CDT click 执行失败');
        return `已点击元素：${selector}`;
      }
      case 'typetext': {
        const selector = String(params.selector ?? '').trim();
        const text = String(params.text ?? '');
        if (!selector) throw new ValidationError('CDT typeText 需要 selector 参数');
        const out = new CDTCoreTypeTextOutput();
        const ok = await cdt.typeText(
          Object.assign(new CDTCoreTypeTextInput(), { selector, text }),
          out,
          new CDTCoreContext(),
        );
        if (!ok) throw new ValidationError(out.error || 'CDT typeText 执行失败');
        return `已在 ${selector} 中输入文字`;
      }
      case 'scroll': {
        const out = new CDTCoreScrollOutput();
        const ok = await cdt.scroll(
          Object.assign(new CDTCoreScrollInput(), {
            pixels: Number(params.pixels ?? 0) || undefined,
            toBottom: Boolean(params.toBottom),
          }),
          out,
          new CDTCoreContext(),
        );
        if (!ok) throw new ValidationError(out.error || 'CDT scroll 执行失败');
        return '已滚动页面';
      }
      case 'evaluate': {
        const expression = String(params.expression ?? '').trim();
        if (!expression) throw new ValidationError('CDT evaluate 需要 expression 参数');
        const out = new CDTCoreEvaluateOutput();
        const ok = await cdt.evaluate(
          Object.assign(new CDTCoreEvaluateInput(), { expression }),
          out,
          new CDTCoreContext(),
        );
        if (!ok) throw new ValidationError(out.error || 'CDT evaluate 执行失败');
        return this.extractEvalText(out.result);
      }
      default:
        throw new ValidationError(`不支持的 CDT 操作：${operation}`);
    }
  }

  /** 从 CDP Runtime.evaluate 结果对象中提取文本值。 */
  private extractEvalText(raw: unknown): string {
    const value = (raw as { result?: { value?: unknown } } | undefined)?.result?.value;
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return '';
    return JSON.stringify(value);
  }

  private async saveStepInfo(
    ctx: AgentExecutionContext,
    infoType: string,
    creatorRole: string,
    creatorId: string,
    info: string,
    handleResultType?: string,
  ): Promise<void> {
    if (!ctx.session_id) return;
    try {
      await this.infoCore.saveInfo(
        Object.assign(new SaveInfoInput(), {
          session_id: ctx.session_id,
          work_id: ctx.work_id,
          interact_id: ctx.interact_id || '',
          info_type: infoType,
          info_creator_role: creatorRole,
          info_creator_id: creatorId,
          info,
          handle_result_type: handleResultType,
        }),
        new SaveInfoOutput(),
        new InfoCoreContext(),
      );
    } catch {
      /* best-effort */
    }
  }

  private errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
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
