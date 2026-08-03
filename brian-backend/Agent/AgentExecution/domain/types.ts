import { Input, Context, Output } from '@brian-agent/base';

export class AgentExecutionContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
  trace_id?: string;
}

export interface AgentExecutionConfigRecord {
  id: string;
  created: number;
  updated: number;
  think_prompt_template_id: string;
  reflect_prompt_template_id: string;
  answer_prompt_template_id: string;
  default_max_iterations: number;
  async_worker_interval: number;
}

// ---------------------------------------------------------------------------
// execAgent
// ---------------------------------------------------------------------------

export class ExecAgentInput extends Input {
  agent_id!: string;
  work_id!: string;
  interact_id!: string;
  task_content!: string;
  max_iterations?: number;
}

export class ExecAgentOutput extends Output {
  answer = '';
  iterations = 0;
  trace_id = '';
}

// ---------------------------------------------------------------------------
// execAgentAsync
// ---------------------------------------------------------------------------

export class ExecAgentAsyncInput extends Input {
  agent_id!: string;
  work_id!: string;
  interact_id!: string;
  task_content!: string;
  callback_queue?: string;
  max_iterations?: number;
}

export class ExecAgentAsyncOutput extends Output {
  job_id = '';
}

// ---------------------------------------------------------------------------
// think
// ---------------------------------------------------------------------------

export class ThinkInput extends Input {
  agent_id!: string;
  llm_id!: string;
  soul_id!: string;
  context_data!: string;
  history!: string;
  iteration!: number;
  skill_ids!: string;
  mcp_ids!: string;
}

export class ThinkOutput extends Output {
  reasoning = '';
  next_action = '';
  token_usage = 0;
}

// ---------------------------------------------------------------------------
// act
// ---------------------------------------------------------------------------

export class ActInput extends Input {
  agent_id!: string;
  skill_ids!: string[];
  mcp_ids!: string[];
  next_action!: string;
  context_data!: string;
}

export class ActOutput extends Output {
  result = '';
  tool_type = '';
  tool_id = '';
}

// ---------------------------------------------------------------------------
// reflect
// ---------------------------------------------------------------------------

export class ReflectInput extends Input {
  agent_id!: string;
  llm_id!: string;
  soul_id!: string;
  context_data!: string;
  history!: string;
  iteration!: number;
  max_iterations!: number;
  skill_ids!: string;
  mcp_ids!: string;
}

export class ReflectOutput extends Output {
  should_continue = false;
  reflection = '';
  token_usage = 0;
}

// ---------------------------------------------------------------------------
// answer
// ---------------------------------------------------------------------------

export class AnswerInput extends Input {
  agent_id!: string;
  llm_id!: string;
  soul_id!: string;
  history!: string;
  context_data!: string;
  task_content!: string;
  skill_ids!: string;
  mcp_ids!: string;
}

export class AnswerOutput extends Output {
  answer = '';
  token_usage = 0;
}

// ---------------------------------------------------------------------------
// getTrace
// ---------------------------------------------------------------------------

export class GetTraceInput extends Input {
  declare trace_id: string;
}

export interface TraceIteration {
  iteration_index: number;
  think?: Record<string, unknown>;
  act?: Record<string, unknown>;
  reflect?: Record<string, unknown>;
  answer?: Record<string, unknown>;
  iteration_elapsed_ms: number;
}

export class GetTraceOutput extends Output {
  trace: {
    trace_id: string;
    agent_id: string;
    start_time: number;
    end_time: number;
    total_elapsed_ms: number;
    iterations: TraceIteration[];
    total_token_usage: number;
  } | null = null;
}

// ---------------------------------------------------------------------------
// getExecQueueStatus
// ---------------------------------------------------------------------------

export class GetExecQueueStatusInput extends Input {}

export class GetExecQueueStatusOutput extends Output {
  queue_stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
  workers: unknown[] = [];
}

// ---------------------------------------------------------------------------
// configAgentExecution
// ---------------------------------------------------------------------------

export class ConfigAgentExecutionInput extends Input {
  think_prompt_template_id?: string;
  reflect_prompt_template_id?: string;
  answer_prompt_template_id?: string;
  default_max_iterations?: number;
  async_worker_interval?: number;
}

export class ConfigAgentExecutionOutput extends Output {
  config: AgentExecutionConfigRecord | null = null;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const AGENT_EXECUTION_CONFIG_TABLE = 'agent_execution_config';
export const AGENT_EXECUTION_TRACE_TABLE = 'agent_execution_trace';
