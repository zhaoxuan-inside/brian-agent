import type { LLMService } from '../../core/llm';
import type { SkillManager } from '../../core/skill/SkillManager';
import type { Tool } from '../../shared/types';
import { execThink, execAct, execReflect, execAnswer } from '../atomic';
import type { ThinkStep, ObserveEntry, ThinkInput } from '../atomic/think';
import type { AgentLifecycle } from '../lifecycle';
import { logger } from '../../infrastructure/logger';

export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';

export interface ExecLoopConfig {
  work_id: string;
  session_id: string;
  strategy_name: string;
  flow_definition: StrategyFlowDefinition;
  max_steps: number;
  step_timeout_seconds: number;
  retry_count: number;
  retry_interval_ms: number[];
  system_prompt: string;
  task_goal: string;
  llm_id: string;
}

export interface StrategyFlowDefinition {
  type: 'react' | 'cot' | 'plan-execute';
  steps: StrategyStep[];
}

export interface StrategyStep {
  name: string;
  type: 'THINK' | 'ACT' | 'REFLECT' | 'ANSWER';
  condition?: string;
}

export interface ExecLoopOutput {
  final_answer: string;
  total_steps: number;
  total_tokens: number;
  status: ExecutionStatus;
  trace: ThinkStep[];
  observations: ObserveEntry[];
  elapsed_ms: number;
}

export interface ExecLoopContext {
  step_num: number;
  reasoning_chain: ThinkStep[];
  observation_history: ObserveEntry[];
  max_steps: number;
  total_tokens: number;
  cancel_flag: boolean;
  start_time: number;
}

export async function execLoop(
  config: ExecLoopConfig,
  llmService: LLMService,
  tools: Tool[],
  skillManager: SkillManager,
  lifecycle?: AgentLifecycle,
): Promise<ExecLoopOutput> {
  const startTime = Date.now();
  const ctx: ExecLoopContext = {
    step_num: 0,
    reasoning_chain: [],
    observation_history: [],
    max_steps: config.max_steps,
    total_tokens: 0,
    cancel_flag: false,
    start_time: startTime,
  };

  const strategy = config.flow_definition.type;

  try {
    switch (strategy) {
      case 'cot':
        return await runCoT(config, ctx, llmService, lifecycle);
      case 'plan-execute':
        return await runPlanExecute(config, ctx, llmService, tools, skillManager, lifecycle);
      case 'react':
      default:
        return await runReAct(config, ctx, llmService, tools, skillManager, lifecycle);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('SCHEDULER', `[${config.work_id}] execution error: ${msg}`);
    return {
      final_answer: `执行出错：${msg}`,
      total_steps: ctx.step_num,
      total_tokens: ctx.total_tokens,
      status: 'FAILED',
      trace: ctx.reasoning_chain,
      observations: ctx.observation_history,
      elapsed_ms: Date.now() - startTime,
    };
  }
}

// ─── CoT: Think loop without tools ───────────────────────────────────

async function runCoT(
  config: ExecLoopConfig,
  ctx: ExecLoopContext,
  llmService: LLMService,
  lifecycle?: AgentLifecycle,
): Promise<ExecLoopOutput> {
  while (ctx.step_num < ctx.max_steps) {
    if (checkCancel(ctx, lifecycle)) return buildOutput(config, ctx, 'CANCELLED');

    const thinkInput: ThinkInput = {
      session_id: config.session_id,
      work_id: config.work_id,
      interact_id: '',
      history_info: [],
      system_prompt: config.system_prompt,
      user_prompt: ctx.step_num === 0
        ? config.task_goal
        : `Continue reasoning. Previous reasoning:\n${formatChain(ctx.reasoning_chain)}`,
      runtime: {
        step_num: ctx.step_num,
        reasoning_chain: ctx.reasoning_chain,
        observation_history: ctx.observation_history,
      },
    };

    ctx.step_num++;
    const result = await execThink(thinkInput, llmService);

    ctx.reasoning_chain.push({
      step_num: ctx.step_num,
      action: result.action,
      reasoning: result.reasoning,
      timestamp: Date.now(),
      tokens: result.llm_response.usage?.totalTokens,
    });
    ctx.total_tokens += result.llm_response.usage?.totalTokens || 0;

    if (result.action === 'FINISH') {
      const answerResult = await execAnswer(
        {
          task_goal: config.task_goal,
          reasoning_chain: ctx.reasoning_chain,
          observation_history: ctx.observation_history,
          system_prompt: config.system_prompt,
        },
        llmService,
      );
      ctx.total_tokens += answerResult.total_tokens;
      return {
        final_answer: answerResult.final_answer,
        total_steps: ctx.step_num,
        total_tokens: ctx.total_tokens,
        status: 'SUCCESS',
        trace: ctx.reasoning_chain,
        observations: ctx.observation_history,
        elapsed_ms: Date.now() - ctx.start_time,
      };
    }
    // CONTINUE_THINK → loop back
  }

  return buildOutput(config, ctx, 'TIMEOUT');
}

// ─── ReAct: Think → Act → Reflect loop ─────────────────────────────────

async function runReAct(
  config: ExecLoopConfig,
  ctx: ExecLoopContext,
  llmService: LLMService,
  tools: Tool[],
  skillManager: SkillManager,
  lifecycle?: AgentLifecycle,
): Promise<ExecLoopOutput> {
  while (ctx.step_num < ctx.max_steps) {
    if (checkCancel(ctx, lifecycle)) return buildOutput(config, ctx, 'CANCELLED');

    // Think
    const thinkInput: ThinkInput = {
      session_id: config.session_id,
      work_id: config.work_id,
      interact_id: '',
      history_info: [],
      system_prompt: config.system_prompt,
      user_prompt: ctx.step_num === 0
        ? config.task_goal
        : `Previous observation: ${getLastObservation(ctx)}\nDecide next action.`,
      runtime: {
        step_num: ctx.step_num,
        reasoning_chain: ctx.reasoning_chain,
        observation_history: ctx.observation_history,
      },
    };

    ctx.step_num++;
    const thinkResult = await execThink(thinkInput, llmService);
    ctx.reasoning_chain.push({
      step_num: ctx.step_num,
      action: thinkResult.action,
      reasoning: thinkResult.reasoning,
      tool_name: thinkResult.tool_name,
      tool_args: thinkResult.tool_args,
      timestamp: Date.now(),
      tokens: thinkResult.llm_response.usage?.totalTokens,
    });
    ctx.total_tokens += thinkResult.llm_response.usage?.totalTokens || 0;

    if (thinkResult.action === 'FINISH') break;

    if (thinkResult.action === 'CONTINUE_THINK') continue;

    if (thinkResult.action === 'CALL_TOOL' && thinkResult.tool_name) {
      if (checkCancel(ctx, lifecycle)) return buildOutput(config, ctx, 'CANCELLED');

      // Act
      const actResult = await execAct(
        {
          tool_type: 'MCP',
          tool_id: thinkResult.tool_name,
          tool_name: thinkResult.tool_name,
          args: thinkResult.tool_args || {},
        },
        tools,
        skillManager,
      );

      if (checkCancel(ctx, lifecycle)) return buildOutput(config, ctx, 'CANCELLED');

      // Reflect
      const reflectResult = await execReflect(
        {
          raw_result: actResult.success ? actResult.raw_result : `ERROR: ${actResult.error}`,
          task_goal: config.task_goal,
          history_info: ctx.reasoning_chain.map(s => ({
            step_num: s.step_num,
            summary: s.reasoning,
          })),
        },
        llmService,
      );

      ctx.observation_history.push({
        action_type: reflectResult.action_type,
        raw_result: actResult.raw_result,
        reasoning: reflectResult.reasoning,
        timestamp: Date.now(),
      });

      if (reflectResult.action_type === 'FINISH') break;
      // CALL_TOOL or CONTINUE_THINK → loop back
    }
  }

  // Answer
  const answerResult = await execAnswer(
    {
      task_goal: config.task_goal,
      reasoning_chain: ctx.reasoning_chain,
      observation_history: ctx.observation_history,
      system_prompt: config.system_prompt,
    },
    llmService,
  );
  ctx.total_tokens += answerResult.total_tokens;

  const status: ExecutionStatus = ctx.step_num >= ctx.max_steps ? 'TIMEOUT' : 'SUCCESS';
  return {
    final_answer: answerResult.final_answer,
    total_steps: ctx.step_num,
    total_tokens: ctx.total_tokens,
    status,
    trace: ctx.reasoning_chain,
    observations: ctx.observation_history,
    elapsed_ms: Date.now() - ctx.start_time,
  };
}

// ─── Plan-Execute: Plan → iterate sub-steps with ReAct ──────────────────

async function runPlanExecute(
  config: ExecLoopConfig,
  ctx: ExecLoopContext,
  llmService: LLMService,
  tools: Tool[],
  skillManager: SkillManager,
  lifecycle?: AgentLifecycle,
): Promise<ExecLoopOutput> {
  // Phase 1: Generate plan
  const planMessages = [
    {
      role: 'system' as const,
      content: `You are a planning agent. Decompose the task into sub-steps. Respond JSON:
{ "steps": [{ "id": "step_1", "description": "...", "expectedOutput": "..." }] }`,
    },
    { role: 'user' as const, content: config.task_goal },
  ];

  let planSteps: { id: string; description: string }[] = [];
  try {
    const planResponse = await llmService.chat(planMessages, { temperature: 0.3 });
    const jsonMatch = planResponse.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const plan = JSON.parse(jsonMatch[0]);
      planSteps = plan.steps || [];
    }
  } catch {
    planSteps = [{ id: 'step_1', description: config.task_goal }];
  }

  // Phase 2: Execute each sub-step with ReAct
  const allResults: string[] = [];
  for (const subStep of planSteps) {
    if (checkCancel(ctx, lifecycle)) break;

    const subConfig: ExecLoopConfig = {
      ...config,
      task_goal: subStep.description,
      max_steps: Math.min(config.max_steps, 5),
    };
    const subCtx: ExecLoopContext = {
      step_num: 0,
      reasoning_chain: [],
      observation_history: [],
      max_steps: subConfig.max_steps,
      total_tokens: 0,
      cancel_flag: false,
      start_time: Date.now(),
    };

    const subResult = await runReAct(subConfig, subCtx, llmService, tools, skillManager, lifecycle);
    ctx.step_num += subResult.total_steps;
    ctx.total_tokens += subResult.total_tokens;
    ctx.reasoning_chain.push(...subResult.trace);
    ctx.observation_history.push(...subResult.observations);

    allResults.push(`[${subStep.id}] ${subResult.final_answer}`);
  }

  // Phase 3: Synthesize final answer
  const answerResult = await execAnswer(
    {
      task_goal: config.task_goal,
      reasoning_chain: ctx.reasoning_chain,
      observation_history: ctx.observation_history,
      system_prompt: config.system_prompt,
    },
    llmService,
  );
  ctx.total_tokens += answerResult.total_tokens;

  return {
    final_answer: answerResult.final_answer,
    total_steps: ctx.step_num,
    total_tokens: ctx.total_tokens,
    status: 'SUCCESS',
    trace: ctx.reasoning_chain,
    observations: ctx.observation_history,
    elapsed_ms: Date.now() - ctx.start_time,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatChain(chain: ThinkStep[]): string {
  return chain.map(s => `[Step ${s.step_num}] ${s.reasoning}`).join('\n');
}

function getLastObservation(ctx: ExecLoopContext): string {
  const last = ctx.observation_history[ctx.observation_history.length - 1];
  return last ? `[${last.action_type}] ${last.reasoning}` : '(no observations)';
}

function checkCancel(ctx: ExecLoopContext, lifecycle?: AgentLifecycle): boolean {
  if (ctx.cancel_flag) return true;
  return false;
}

function buildOutput(
  config: ExecLoopConfig,
  ctx: ExecLoopContext,
  status: ExecutionStatus,
): ExecLoopOutput {
  return {
    final_answer: status === 'TIMEOUT'
      ? `任务执行超时（最大步骤数 ${ctx.max_steps}），已完成 ${ctx.step_num} 步。`
      : status === 'CANCELLED'
        ? '任务已被取消。'
        : '执行异常。',
    total_steps: ctx.step_num,
    total_tokens: ctx.total_tokens,
    status,
    trace: ctx.reasoning_chain,
    observations: ctx.observation_history,
    elapsed_ms: Date.now() - ctx.start_time,
  };
}
