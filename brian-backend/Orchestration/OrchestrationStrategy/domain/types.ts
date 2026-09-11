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
  /** 用户原始输入；存在时 SAVE_USER_INPUT 落库原文，user_query 仅作为编排执行 query */
  original_user_query?: string;
  strategy!: string;
  work_context?: Record<string, unknown>;
  citing_msg_ids?: string[];
  selected_msg_ids?: string[];
  info_type?: string;
  info_creator_id?: string;
  info_creator_role?: string;
}

export class StartOrchestrationOutput extends Output {
  final_response = '';
  /** 编排因需用户补充参数而暂停（Planner 识别出需澄清的任务），等待前端收集参数后重入 */
  paused = false;
  /** 需向用户收集的澄清问题（paused 为 true 时有值） */
  clarifications: Array<{ question: string; domain?: string }> = [];
}

export class ExecuteSimpleStrategyInput extends Input {
  work_id!: string;
  interact_id!: string;
  session_id!: string;
  user_query!: string;
  work_context?: Record<string, unknown>;
}

export class ExecuteSimpleStrategyOutput extends Output {
  agent_results: Array<{ agent_id: string; task_content: string; result: string; trace_id: string; handle_result_type?: string }> = [];
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
  agent_results: Array<{ agent_id: string; task_content: string; result: string; trace_id: string; handle_result_type?: string }> = [];
  plan_id = '';
}

export class ExecutePostProcessingInput extends Input {
  work_id!: string;
  interact_id!: string;
  session_id!: string;
  user_query!: string;
  agent_results!: Array<{ agent_id: string; task_content: string; result: string; trace_id: string; handle_result_type?: string }>;
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
}

export class ConfigOrchestrationStrategyOutput extends Output {
  config: Record<string, unknown> = {};
}
