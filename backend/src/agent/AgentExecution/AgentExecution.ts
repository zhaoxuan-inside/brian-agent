import type { AgentDatabase } from '../infra/dbTypes';
import { Input, Context, Output } from '../../shared/base';
import { NotFoundError } from '../../shared/errors';
import { logger } from '../../infrastructure/logger';
import { AopProxy } from '../infra/aopProxy';
import { generateId } from '../AgentLibrary/agentTypes';
import { getAgentByAgentId, recordAgentUsage } from '../AgentLibrary/db';
import type { AgentContextService, ContextItem } from '../AgentContext';
import { BuildAgentContextInput, BuildAgentContextOutput } from '../AgentContext';
import type { LLMService } from '../../core/llm/LLMService';
import type { SkillManager } from '../../core/skill/SkillManager';
import type { MCPManager } from '../../core/mcp/MCPManager';
import type { MQCore } from '../../core/mq/MQCore';
import type { ChatCompletionRequest } from '../../base/LLMWrapper';

const MODULE = 'AgentExecution';

function ensureTables(db: AgentDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_execution_config (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
    think_prompt_template_id TEXT NOT NULL DEFAULT '',
    reflect_prompt_template_id TEXT NOT NULL DEFAULT '',
    answer_prompt_template_id TEXT NOT NULL DEFAULT '',
    default_max_iterations INTEGER NOT NULL DEFAULT 10,
    async_worker_interval INTEGER NOT NULL DEFAULT 1000
  )`);

  const econf = db.prepare('SELECT * FROM agent_execution_config LIMIT 1').get() as Record<string, unknown> | undefined;
  if (!econf) {
    const now = Date.now();
    db.prepare('INSERT INTO agent_execution_config (id,created,updated) VALUES (?,?,?)').run(generateId(), now, now);
  }

  db.exec(`CREATE TABLE IF NOT EXISTS agent_execution_trace (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
    trace_id TEXT NOT NULL UNIQUE, agent_id TEXT NOT NULL,
    work_id TEXT NOT NULL DEFAULT '', interact_id TEXT NOT NULL DEFAULT '',
    task_content TEXT NOT NULL DEFAULT '', history TEXT NOT NULL DEFAULT '[]',
    iterations INTEGER NOT NULL DEFAULT 0, answer TEXT NOT NULL DEFAULT '',
    elapsed_ms INTEGER NOT NULL DEFAULT 0, token_usage INTEGER NOT NULL DEFAULT 0
  )`);
  db.prepare('CREATE INDEX IF NOT EXISTS idx_exec_trace_agent_id ON agent_execution_trace(agent_id)').run();
}

class ExecAgentInput extends Input {
  agent_id!: string;
  work_id!: string;
  interact_id!: string;
  task_content!: string;
  session_id?: string;
  max_iterations?: number;
  constructor(d: Partial<ExecAgentInput>) { super(d); Object.assign(this, d); }
}
class ExecAgentContext extends Context { }
class ExecAgentOutput extends Output { answer?: string; iterations?: number; trace_id?: string; elapsed_ms?: number; }

class ExecAgentAsyncInput extends Input {
  agent_id!: string;
  work_id!: string;
  interact_id!: string;
  task_content!: string;
  callback_queue?: string;
  max_iterations?: number;
  constructor(d: Partial<ExecAgentAsyncInput>) { super(d); Object.assign(this, d); }
}
class ExecAgentAsyncContext extends Context { }
class ExecAgentAsyncOutput extends Output { job_id?: string; }

class ThinkInput extends Input {
  agent_id!: string; llm_id?: string; soul_id?: string;
  context_data?: string; history?: string[]; iteration?: number;
  constructor(d: Partial<ThinkInput>) { super(d); Object.assign(this, d); }
}
class ThinkContext extends Context { }
class ThinkOutput extends Output { reasoning?: string; next_action?: string; token_usage?: number; elapsed_ms?: number; }

class ActInput extends Input {
  agent_id!: string; skill_ids?: string[]; mcp_ids?: string[];
  next_action?: string; context_data?: string;
  constructor(d: Partial<ActInput>) { super(d); Object.assign(this, d); }
}
class ActContext extends Context { }
class ActOutput extends Output { result?: string; tool_type?: string; tool_id?: string; elapsed_ms?: number; success_status?: boolean; }

class ReflectInput extends Input {
  agent_id!: string; llm_id?: string; soul_id?: string;
  context_data?: string; history?: string[]; iteration?: number; max_iterations?: number;
  constructor(d: Partial<ReflectInput>) { super(d); Object.assign(this, d); }
}
class ReflectContext extends Context { }
class ReflectOutput extends Output { should_continue?: boolean; reflection?: string; token_usage?: number; elapsed_ms?: number; }

class AnswerInput extends Input {
  agent_id!: string; llm_id?: string; soul_id?: string;
  history?: string[]; context_data?: string; task_content?: string;
  constructor(d: Partial<AnswerInput>) { super(d); Object.assign(this, d); }
}
class AnswerContext extends Context { }
class AnswerOutput extends Output { answer?: string; token_usage?: number; elapsed_ms?: number; }

class GetTraceInput extends Input { trace_id!: string; constructor(d: Partial<GetTraceInput>) { super(d); Object.assign(this, d); } }
class GetTraceContext extends Context { }
class GetTraceOutput extends Output { trace?: Record<string, unknown>; }

class GetExecQueueStatusInput extends Input { }
class GetExecQueueStatusContext extends Context { }
class GetExecQueueStatusOutput extends Output {
  queue_stats?: { pending: number; processing: number; completed: number; failed: number };
  workers?: unknown[];
}

class ConfigAgentExecutionInput extends Input {
  think_prompt_template_id?: string; reflect_prompt_template_id?: string;
  answer_prompt_template_id?: string; default_max_iterations?: number;
  async_worker_interval?: number;
  constructor(d: Partial<ConfigAgentExecutionInput>) { super(d); Object.assign(this, d); }
}
class ConfigAgentExecutionContext extends Context { }
class ConfigAgentExecutionOutput extends Output {
  think_prompt_template_id?: string; reflect_prompt_template_id?: string;
  answer_prompt_template_id?: string; default_max_iterations?: number;
  async_worker_interval?: number;
}

export { ExecAgentInput, ExecAgentAsyncInput, ThinkInput, ActInput, ReflectInput, AnswerInput, GetTraceInput, GetExecQueueStatusInput, ConfigAgentExecutionInput };
export { ExecAgentContext, ExecAgentAsyncContext, ThinkContext, ActContext, ReflectContext, AnswerContext, GetTraceContext, GetExecQueueStatusContext, ConfigAgentExecutionContext };
export { ExecAgentOutput, ExecAgentAsyncOutput, ThinkOutput, ActOutput, ReflectOutput, AnswerOutput, GetTraceOutput, GetExecQueueStatusOutput, ConfigAgentExecutionOutput };

const DEFAULT_SYSTEM_PROMPT = `You are an AI agent designed to solve tasks. Follow this process:
1. THINK: Analyze the task and decide the next action
2. ACT: Execute tools (if needed)
3. REFLECT: Evaluate results and decide whether to continue
4. ANSWER: Provide the final answer

Always respond with clear, structured output. Use Chinese unless the task is in another language.`;

export class AgentExecutionService {
  private db: AgentDatabase;

  constructor(
    db: AgentDatabase,
    private llmService?: LLMService,
    private skillManager?: SkillManager,
    private mcpManager?: MCPManager,
    private mqCore?: MQCore,
    private agentContextService?: AgentContextService,
  ) {
    this.db = db;
    ensureTables(db);
  }

  async execAgent(input: ExecAgentInput, _context: ExecAgentContext, output: ExecAgentOutput): Promise<boolean> {
    logger.info(MODULE, '[execAgent] start', { agent_id: input.agent_id, task: input.task_content?.substring(0, 100) });
    const startTime = Date.now();

    const agent = getAgentByAgentId(input.agent_id);
    if (!agent || agent.enable === 0) throw new NotFoundError(`Agent ${input.agent_id} not found or disabled`);

    const config = this.db.prepare('SELECT * FROM agent_execution_config LIMIT 1').get() as Record<string, unknown>;
    const maxIter = input.max_iterations ?? (Number(config.default_max_iterations) || 10);
    const traceId = generateId();

    let contextText = '';
    if (this.agentContextService && input.session_id) {
      try {
        const ctxOut = new BuildAgentContextOutput();
        await this.agentContextService.buildAgentContext(
          new BuildAgentContextInput({ session_id: input.session_id, agent_id: input.agent_id, work_id: input.work_id, trace_id: traceId }),
          {} as any,
          ctxOut
        );
        if (ctxOut.context_data && ctxOut.context_data.length > 0) {
          contextText = ctxOut.context_data.map((item: ContextItem) => `[${item.source}] ${item.content}`).join('\n');
        }
      } catch (e) {
        logger.warn(MODULE, '[execAgent] buildAgentContext failed', { error: (e as Error).message });
      }
    }

    const history: string[] = [];
    let iterations = 0;
    let totalTokenUsage = 0;

    const doThink = async (iter: number): Promise<{ reasoning: string; nextAction: string; tokenUsage: number }> => {
      if (!this.llmService) {
        return { reasoning: 'No LLM available', nextAction: 'FINISH', tokenUsage: 0 };
      }
      const request: ChatCompletionRequest = {
        model: '',
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: `Context:\n${contextText}\n\nTask: ${input.task_content}\nIteration: ${iter}/${maxIter}\nHistory: ${history.join('\n')}\n\nThink about the next step. Respond with: FINISH to end, or ACT to use a tool.` },
        ],
        temperature: 0.3,
        maxTokens: 1024,
      };
      try {
        const resp = await this.llmService.chatCompletion(request);
        const content = resp.choices?.[0]?.message?.content || '';
        const tok = resp.usage?.totalTokens || 0;
        totalTokenUsage += tok;
        const isFinished = /\bFINISH\b/i.test(content);
        return {
          reasoning: content,
          nextAction: isFinished ? 'FINISH' : 'ACT',
          tokenUsage: tok,
        };
      } catch (e) {
        logger.warn(MODULE, '[execAgent] think failed', { error: (e as Error).message });
        return { reasoning: `Think failed: ${(e as Error).message}`, nextAction: 'FINISH', tokenUsage: 0 };
      }
    };

    const doReflect = async (iter: number): Promise<{ shouldContinue: boolean; reflection: string; tokenUsage: number }> => {
      if (iter >= maxIter - 1) return { shouldContinue: false, reflection: 'Reached max iterations', tokenUsage: 0 };
      if (!this.llmService) return { shouldContinue: false, reflection: 'No LLM available', tokenUsage: 0 };
      try {
        const request: ChatCompletionRequest = {
          model: '',
          messages: [
            { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
            { role: 'user', content: `Context:\n${contextText}\n\nTask: ${input.task_content}\nIteration: ${iter}/${maxIter}\nHistory: ${history.join('\n')}\n\nShould we continue or give the final answer? Respond CONTINUE or FINISH.` },
          ],
          temperature: 0.1,
          maxTokens: 512,
        };
        const resp = await this.llmService.chatCompletion(request);
        const content = resp.choices?.[0]?.message?.content || '';
        const tok = resp.usage?.totalTokens || 0;
        totalTokenUsage += tok;
        return {
          shouldContinue: /\bCONTINUE\b/i.test(content) && !/\bFINISH\b/i.test(content),
          reflection: content,
          tokenUsage: tok,
        };
      } catch (e) {
        logger.warn(MODULE, '[execAgent] reflect failed', { error: (e as Error).message });
        return { shouldContinue: false, reflection: `Reflect failed: ${(e as Error).message}`, tokenUsage: 0 };
      }
    };

    const doAnswer = async (): Promise<{ answer: string; tokenUsage: number }> => {
      if (!this.llmService) {
        return { answer: `[Agent ${input.agent_id}] Task: "${input.task_content.substring(0, 200)}" completed in ${iterations} iterations.`, tokenUsage: 0 };
      }
      try {
        const request: ChatCompletionRequest = {
          model: '',
          messages: [
            { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
            { role: 'user', content: `Context:\n${contextText}\n\nTask: ${input.task_content}\nCompleted in ${iterations} iterations.\nHistory: ${history.join('\n')}\n\nGenerate the final answer.` },
          ],
          temperature: 0.5,
          maxTokens: 4096,
        };
        const resp = await this.llmService.chatCompletion(request);
        const tok = resp.usage?.totalTokens || 0;
        totalTokenUsage += tok;
        return {
          answer: resp.choices?.[0]?.message?.content || input.task_content,
          tokenUsage: tok,
        };
      } catch (e) {
        return { answer: `[Agent ${input.agent_id}] Error generating answer: ${(e as Error).message}`, tokenUsage: 0 };
      }
    };

    for (let i = 0; i < maxIter; i++) {
      iterations++;
      const thinkResult = await doThink(i);
      history.push(`[Think ${i}] ${thinkResult.reasoning}`);

      if (thinkResult.nextAction === 'FINISH') break;

      const reflectResult = await doReflect(i);
      history.push(`[Reflect ${i}] ${reflectResult.reflection}`);

      if (!reflectResult.shouldContinue) break;
    }

    const answerResult = await doAnswer();
    history.push(`[Answer] ${answerResult.answer}`);

    try {
      recordAgentUsage({ agent_id: input.agent_id, work_id: input.work_id, interact_id: input.interact_id });
    } catch { /* non-critical */ }

    output.answer = answerResult.answer;
    output.iterations = iterations;
    output.trace_id = traceId;
    output.elapsed_ms = Date.now() - startTime;

    try {
      const now = Date.now();
      this.db.prepare(`INSERT INTO agent_execution_trace (id,created,updated,trace_id,agent_id,work_id,interact_id,task_content,history,iterations,answer,elapsed_ms,token_usage)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        generateId(), now, now, traceId, input.agent_id, input.work_id || '', input.interact_id || '',
        input.task_content, JSON.stringify(history), iterations, answerResult.answer,
        output.elapsed_ms, totalTokenUsage
      );
    } catch { /* trace storage is non-critical */ }

    logger.info(MODULE, '[execAgent] done', { agent_id: input.agent_id, iterations, elapsed_ms: output.elapsed_ms });
    return true;
  }

  execAgentAsync(input: ExecAgentAsyncInput, context: ExecAgentAsyncContext, output: ExecAgentAsyncOutput): boolean {
    logger.info(MODULE, '[execAgentAsync] start', { agent_id: input.agent_id });
    output.job_id = generateId();
    setImmediate(async () => {
      try {
        const execOut = new ExecAgentOutput();
        await this.execAgent(
          new ExecAgentInput({ agent_id: input.agent_id, work_id: input.work_id, interact_id: input.interact_id, task_content: input.task_content, max_iterations: input.max_iterations }),
          new ExecAgentContext({ sessionId: context.sessionId, workId: context.workId }),
          execOut
        );
        logger.info(MODULE, '[execAgentAsync] job completed', { job_id: output.job_id, agent_id: input.agent_id });
      } catch (e) {
        logger.error(MODULE, '[execAgentAsync] job failed', { job_id: output.job_id, error: (e as Error).message });
      }
    });
    return true;
  }

  async think(input: ThinkInput, _context: ThinkContext, output: ThinkOutput): Promise<boolean> {
    if (!this.llmService) {
      output.reasoning = '[LLM unavailable]';
      output.next_action = 'FINISH';
      return true;
    }
    try {
      const request: ChatCompletionRequest = {
        model: '',
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: `Context: ${input.context_data || ''}\nHistory: ${(input.history || []).join('\n')}\n\nThink about next actions.` },
        ],
        temperature: 0.3,
        maxTokens: 1024,
      };
      const resp = await this.llmService.chatCompletion(request);
      output.reasoning = resp.choices?.[0]?.message?.content || '';
      const content = output.reasoning || '';
      output.next_action = /\bFINISH\b/i.test(content) ? 'FINISH' : 'ACT';
      output.token_usage = resp.usage?.totalTokens || 0;
    } catch (e) {
      output.reasoning = `Think error: ${(e as Error).message}`;
      output.next_action = 'FINISH';
      output.token_usage = 0;
    }
    return true;
  }

  async act(input: ActInput, _context: ActContext, output: ActOutput): Promise<boolean> {
    const startTime = Date.now();

    let action: { tool_type?: string; tool_id?: string; tool_name?: string; args?: Record<string, unknown> } | null = null;
    if (input.next_action) {
      try { action = JSON.parse(input.next_action); } catch { action = null; }
    }

    if (!action) {
      output.result = 'No action required';
      output.tool_type = 'NONE';
      output.success_status = true;
      output.elapsed_ms = Date.now() - startTime;
      return true;
    }

    const toolType = action.tool_type || 'Skill';
    const toolId = action.tool_id || action.tool_name || '';
    const args = action.args || {};

    output.tool_type = toolType;
    output.tool_id = toolId;

    try {
      if (toolType === 'Skill' && this.skillManager) {
        const result = await this.skillManager.executeSkill(toolId, args);
        output.result = typeof result === 'string' ? result : JSON.stringify(result);
        output.success_status = true;
      } else if (toolType === 'MCP' && this.mcpManager) {
        const result = await this.mcpManager.execute({ toolName: toolId, args } as unknown as Parameters<typeof this.mcpManager.execute>[0]);
        output.result = typeof result === 'string' ? result : JSON.stringify(result);
        output.success_status = true;
      } else {
        output.result = `Tool type "${toolType}" is not available (no ${toolType.toLowerCase()} manager configured)`;
        output.success_status = false;
      }
    } catch (e) {
      output.result = `Act error: ${(e as Error).message}`;
      output.success_status = false;
    }

    output.elapsed_ms = Date.now() - startTime;
    return true;
  }

  async reflect(input: ReflectInput, _context: ReflectContext, output: ReflectOutput): Promise<boolean> {
    if (input.iteration !== undefined && input.max_iterations !== undefined && input.iteration >= input.max_iterations) {
      output.should_continue = false;
      output.reflection = 'Reached max iterations';
      return true;
    }
    if (!this.llmService) {
      output.should_continue = false;
      output.reflection = '[LLM unavailable]';
      return true;
    }
    try {
      const request: ChatCompletionRequest = {
        model: '',
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: `Review history:\n${(input.history || []).join('\n')}\n\nShould continue? Respond CONTINUE or FINISH.` },
        ],
        temperature: 0.1,
        maxTokens: 512,
      };
      const resp = await this.llmService.chatCompletion(request);
      const content = resp.choices?.[0]?.message?.content || '';
      output.should_continue = /\bCONTINUE\b/i.test(content) && !/\bFINISH\b/i.test(content);
      output.reflection = content;
      output.token_usage = resp.usage?.totalTokens || 0;
    } catch (e) {
      output.should_continue = false;
      output.reflection = `Reflect error: ${(e as Error).message}`;
      output.token_usage = 0;
    }
    return true;
  }

  async answer(input: AnswerInput, _context: AnswerContext, output: AnswerOutput): Promise<boolean> {
    if (!this.llmService) {
      output.answer = `Task: ${input.task_content || 'Unknown task'}`;
      return true;
    }
    try {
      const request: ChatCompletionRequest = {
        model: '',
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: `Task: ${input.task_content || ''}\nHistory: ${(input.history || []).join('\n')}\nContext: ${input.context_data || ''}\n\nGenerate the final answer.` },
        ],
        temperature: 0.5,
        maxTokens: 4096,
      };
      const resp = await this.llmService.chatCompletion(request);
      output.answer = resp.choices?.[0]?.message?.content || input.task_content || '';
      output.token_usage = resp.usage?.totalTokens || 0;
    } catch (e) {
      output.answer = `Answer generation error: ${(e as Error).message}`;
      output.token_usage = 0;
    }
    return true;
  }

  getTrace(input: GetTraceInput, _context: GetTraceContext, output: GetTraceOutput): boolean {
    const row = this.db.prepare('SELECT * FROM agent_execution_trace WHERE trace_id = ?').get(input.trace_id) as Record<string, unknown> | undefined;

    if (!row) {
      output.trace = {
        trace_id: input.trace_id,
        error: 'Trace not found',
      };
      return true;
    }

    let history: unknown[];
    try { history = JSON.parse(row.history as string); } catch { history = []; }

    output.trace = {
      trace_id: row.trace_id,
      agent_id: row.agent_id,
      work_id: row.work_id,
      interact_id: row.interact_id,
      task_content: row.task_content,
      iterations: row.iterations,
      elapsed_ms: row.elapsed_ms,
      token_usage: row.token_usage,
      answer: row.answer,
      history,
      started_at: row.created,
    };
    return true;
  }

  getExecQueueStatus(_input: GetExecQueueStatusInput, _context: GetExecQueueStatusContext, output: GetExecQueueStatusOutput): boolean {
    if (this.mqCore) {
      const getWorkerOutput = { workers: [] as { status: string }[] };
      this.mqCore.getWorker(
        { queue: 'agent.execution' } as Parameters<typeof this.mqCore.getWorker>[0],
        {} as Parameters<typeof this.mqCore.getWorker>[1],
        getWorkerOutput as Parameters<typeof this.mqCore.getWorker>[2],
      );

      const running = getWorkerOutput.workers.filter(w => w.status === 'RUNNING').length;
      output.queue_stats = {
        pending: 0,
        processing: running,
        completed: 0,
        failed: 0,
      };
      output.workers = getWorkerOutput.workers;
    } else {
      output.queue_stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
      output.workers = [];
    }
    return true;
  }

  configAgentExecution(input: ConfigAgentExecutionInput, _context: ConfigAgentExecutionContext, output: ConfigAgentExecutionOutput): boolean {
    logger.info(MODULE, '[configAgentExecution] start');
    const now = Date.now();
    const sets: string[] = ['updated = ?'];
    const params: unknown[] = [now];
    if (input.think_prompt_template_id !== undefined) { sets.push('think_prompt_template_id = ?'); params.push(input.think_prompt_template_id); }
    if (input.reflect_prompt_template_id !== undefined) { sets.push('reflect_prompt_template_id = ?'); params.push(input.reflect_prompt_template_id); }
    if (input.answer_prompt_template_id !== undefined) { sets.push('answer_prompt_template_id = ?'); params.push(input.answer_prompt_template_id); }
    if (input.default_max_iterations !== undefined) { sets.push('default_max_iterations = ?'); params.push(input.default_max_iterations); }
    if (input.async_worker_interval !== undefined) { sets.push('async_worker_interval = ?'); params.push(input.async_worker_interval); }
    this.db.prepare(`UPDATE agent_execution_config SET ${sets.join(',')}`).run(...params);
    const config = this.db.prepare('SELECT * FROM agent_execution_config LIMIT 1').get() as Record<string, unknown>;
    output.think_prompt_template_id = config.think_prompt_template_id as string;
    output.reflect_prompt_template_id = config.reflect_prompt_template_id as string;
    output.answer_prompt_template_id = config.answer_prompt_template_id as string;
    output.default_max_iterations = Number(config.default_max_iterations) || 10;
    output.async_worker_interval = Number(config.async_worker_interval) || 1000;
    logger.info(MODULE, '[configAgentExecution] done');
    return true;
  }
}

export function createAgentExecutionService(
  db: AgentDatabase,
  llmService?: LLMService,
  skillManager?: SkillManager,
  mcpManager?: MCPManager,
  mqCore?: MQCore,
  agentContextService?: AgentContextService,
): AgentExecutionService {
  return AopProxy(new AgentExecutionService(db, llmService, skillManager, mcpManager, mqCore, agentContextService));
}
