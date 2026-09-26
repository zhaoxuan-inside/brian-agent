export interface PromptReference {
  
  template_id: string;
  
  variables: PromptVariables;
}

export interface PromptVariables {
  task_content: string;
  agent_name: string;
  domain: string;
  iteration?: number;
  max_iterations?: number;
  tools_json: string;
  
  soul_id: string;
}

export interface ThinkStep {
  reasoning: string;
  next_action: string;
  raw_response: string;
  input_tokens: number;
  output_tokens: number;
  token_usage: number;
  prompt_ref?: PromptReference;
}

export interface ActStep {
  result: string;
  tool_type: string;
  tool_id: string;
}

export interface ReflectStep {
  should_continue: boolean;
  reflection: string;
  raw_response: string;
  input_tokens: number;
  output_tokens: number;
  token_usage: number;
  prompt_ref?: PromptReference;
}

export interface AnswerStep {
  answer: string;
  raw_response: string;
  input_tokens: number;
  output_tokens: number;
  token_usage: number;
  prompt_ref?: PromptReference;
}

export interface TraceIterationRecord {
  iteration_index: number;
  think?: ThinkStep;
  act?: ActStep;
  reflect?: ReflectStep;
  answer?: AnswerStep;
  iteration_elapsed_ms: number;
}

export type TraceIterations = TraceIterationRecord[];

export interface LightTraceRef {
  type: 'trace';
  trace_id: string;
  answer: string;
  total_token_usage: number;
}
