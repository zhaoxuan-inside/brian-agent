import { Input, Context, Output } from '@brian-agent/base';

export class OrchestrationStrategyContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

export class StartOrchestrationInput extends Input {
  work_id!: string;
  interact_id!: string;
  session_id!: string;
  user_query!: string;
  strategy!: string;
  work_context?: Record<string, unknown>;
}

export class StartOrchestrationOutput extends Output {
  final_response = '';
}

export class ExecuteSimpleStrategyInput extends Input {
  work_id!: string;
  interact_id!: string;
  session_id!: string;
  user_query!: string;
  work_context?: Record<string, unknown>;
}

export class ExecuteSimpleStrategyOutput extends Output {
  agent_results: Array<{ agent_id: string; task_content: string; result: string; trace_id: string }> = [];
  plan_id = '';
}

export class ExecutePlanningStrategyInput extends Input {
  work_id!: string;
  interact_id!: string;
  session_id!: string;
  user_query!: string;
  work_context?: Record<string, unknown>;
}

export class ExecutePlanningStrategyOutput extends Output {
  agent_results: Array<{ agent_id: string; task_content: string; result: string; trace_id: string }> = [];
  plan_id = '';
}

export class ExecutePostProcessingInput extends Input {
  work_id!: string;
  interact_id!: string;
  session_id!: string;
  user_query!: string;
  agent_results!: Array<{ agent_id: string; task_content: string; result: string; trace_id: string }>;
}

export class ExecutePostProcessingOutput extends Output {
  final_response = '';
  eval_id = '';
}

export class AddOrchestrationStrategyInput extends Input {
  strategy_label!: string;
  strategy_description!: string;
  jsonnode_definition!: string;
  enable?: boolean;
}

export class AddOrchestrationStrategyOutput extends Output {
  strategy_id = '';
}

export class HandleDAGFailureInput extends Input {
  plan_id!: string;
  failed_task_id!: string;
  failure_reason!: string;
  completed_task_ids!: string[];
  work_id!: string;
  interact_id!: string;
  agent_dag?: Record<string, unknown>;
}

export class HandleDAGFailureOutput extends Output {
  action = '';
  new_agent_dag?: Record<string, unknown>;
  max_retry_reached = false;
}

export class GetOrchestrationStrategyInput extends Input {
  strategy_id?: string;
  strategy_label?: string;
  conditions?: Array<{ field: string; operator: string; value: unknown }>;
  page?: { current: number; size: number };
}

export class GetOrchestrationStrategyOutput extends Output {
  strategies: Array<Record<string, unknown>> = [];
}

export class UpdateOrchestrationStrategyInput extends Input {
  strategy_id!: string;
  strategy_label?: string;
  strategy_description?: string;
  jsonnode_definition?: string;
  enable?: boolean;
}

export class UpdateOrchestrationStrategyOutput extends Output {}

export class ConfigOrchestrationStrategyInput extends Input {
  default_strategy_id?: string;
  max_plan_retries?: number;
  plan_prompt_template_id?: string;
}

export class ConfigOrchestrationStrategyOutput extends Output {
  config: Record<string, unknown> = {};
}
