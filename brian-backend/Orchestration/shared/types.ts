import { Input, Context, Output } from '@brian-agent/base';

export const ORCHESTRATION_DB = 'orchestration';

export const ORCHESTRATION_WORK_TABLE = 'orchestration_work';
export const ORCHESTRATION_CONFIG_TABLE = 'orchestration_config';
export const ORCHESTRATION_STRATEGY_TABLE = 'orchestration_strategy';
export const ORCHESTRATION_STRATEGY_EXECUTION_TABLE = 'orchestration_strategy_execution';
export const ORCHESTRATION_TASK_AGENT_TABLE = 'orchestration_task_agent';
export const ORCHESTRATION_AGENT_DAG_TABLE = 'orchestration_agent_dag';
export const ORCHESTRATION_AGENT_DAG_RECORD_TABLE = 'orchestration_agent_dag_record';
export const ORCHESTRATION_AGENT_EXECUTION_TABLE = 'orchestration_agent_execution';
export const ORCHESTRATION_JSONNODE_TRACE_TABLE = 'orchestration_jsonnode_trace';
export const ORCHESTRATION_NODE_TYPE_TABLE = 'orchestration_node_type';

export interface WorkRecord {
  id: string;
  created: number;
  updated: number;
  work_id: string;
  interact_id: string;
  session_id: string;
  user_query: string;
  status: string;
  orchestration_strategy: string;
  task_count: number;
  completed_task_count: number;
  elapsed_ms: number;
  cancel_reason: string;
  error_message: string;
  final_response: string;
  metadata: string;
}

export interface OrchestrationConfigRecord {
  id: string;
  created: number;
  updated: number;
  complexity_decompose_threshold: number;
  strategy_prompt_template_id: string;
  default_strategy: string;
  max_recent_works: number;
  async_worker_interval: number;
  default_strategy_id: string;
  max_plan_retries: number;
  plan_prompt_template_id: string;
  max_concurrent: number;
  default_max_iterations: number;
  dag_timeout_ms: number;
  max_execution_depth: number;
  node_timeout_ms: number;
  trace_enabled: number | boolean;
  max_nodes_in_graph?: number;
}

export interface OrchestrationStrategyRecord {
  id: string;
  created: number;
  updated: number;
  strategy_id: string;
  strategy_label: string;
  strategy_description: string;
  jsonnode_definition: string;
  enable: number | boolean;
}

export interface OrchestrationStrategyExecutionRecord {
  id: string;
  created: number;
  updated: number;
  execution_id: string;
  work_id: string;
  strategy_id: string;
  plan_id: string;
  plan_retry_count: number;
  execution_status: string;
  error_info: string;
}

export interface OrchestrationTaskAgentRecord {
  id: string;
  created: number;
  updated: number;
  plan_id: string;
  task_id: string;
  agent_id: string;
  task_complexity?: number;
  task_domain?: string;
}

export interface OrchestrationAgentDAGRecord {
  id: string;
  created: number;
  updated: number;
  plan_id: string;
  from_agent_id: string;
  to_agent_id: string;
}

export interface OrchestrationAgentDAGSnapshotRecord {
  id: string;
  created: number;
  updated: number;
  plan_id: string;
  total_agent_count: number;
  agent_dag_json: string;
}

export interface OrchestrationAgentExecutionRecord {
  id: string;
  created: number;
  updated: number;
  work_id: string;
  agent_id: string;
  plan_id: string;
  task_id: string;
  execution_type: string;
  task_content: string;
  status: string;
  answer: string;
  trace_id: string;
  iterations: number;
  elapsed_ms: number;
  error_info: string;
}

export interface OrchestrationJSONNodeTraceRecord {
  id: string;
  created: number;
  updated: number;
  orchestration_id: string;
  node_id: string;
  node_type: string;
  status: string;
  elapsed_ms: number;
  error_info: string;
}

export interface OrchestrationNodeTypeRecord {
  id: string;
  created: number;
  updated: number;
  node_type: string;
  description: string;
  handler_module: string;
  is_builtin: number | boolean;
}

export class OrchestrationContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}
