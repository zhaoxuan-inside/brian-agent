import { Input, Context, Output } from '@brian-agent/base';
import type { TraceIterationRecord } from './trace';

export class AgentExecutionContext extends Context {
  declare trace_id?: string;
  selected_msg_ids?: string[];
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
  run_id!: string;
  task_content!: string;
  max_iterations?: number;
  task_id?: string;
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
  run_id!: string;
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
  agent_name!: string;
  llm_id!: string;
  soul_id!: string;
  task_content!: string;
  context_data!: string;
  history!: string;
  iteration!: number;
  tools_json!: string;
  domain!: string;
}

export class ThinkOutput extends Output {
  reasoning = '';
  next_action = '';
  prompt = '';
  raw_response = '';
  input_tokens = 0;
  output_tokens = 0;
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
  params: Record<string, unknown> = {};
  next_action = '';
}

// ---------------------------------------------------------------------------
// reflect
// ---------------------------------------------------------------------------

export class ReflectInput extends Input {
  agent_id!: string;
  agent_name!: string;
  llm_id!: string;
  soul_id!: string;
  task_content!: string;
  context_data!: string;
  history!: string;
  iteration!: number;
  max_iterations!: number;
  tools_json!: string;
  domain!: string;
}

export class ReflectOutput extends Output {
  should_continue = false;
  reflection = '';
  prompt = '';
  raw_response = '';
  input_tokens = 0;
  output_tokens = 0;
  token_usage = 0;
}

// ---------------------------------------------------------------------------
// answer
// ---------------------------------------------------------------------------

export class AnswerInput extends Input {
  agent_id!: string;
  agent_name!: string;
  llm_id!: string;
  soul_id!: string;
  history!: string;
  context_data!: string;
  task_content!: string;
  tools_json!: string;
  domain!: string;
}

export class AnswerOutput extends Output {
  answer = '';
  prompt = '';
  raw_response = '';
  input_tokens = 0;
  output_tokens = 0;
  token_usage = 0;
}

// ---------------------------------------------------------------------------
// soTrace
// ---------------------------------------------------------------------------

export class GetTraceInput extends Input {
  declare trace_id: string;
}

export type TraceIteration = TraceIterationRecord;

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
// soExecQueueStatus
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
