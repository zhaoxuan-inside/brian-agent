import { Input, Context, Output } from '@brian-agent/base';

export class OrchestrationExecutionContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

export class OrchestrationExecutionConfig {
  max_concurrent = 1;
  default_max_iterations = 10;
  async_worker_interval = 1000;
  dag_timeout_ms = 300000;
}

export interface TaskNode {
  task_id: string;
  task_content: string;
  task_complexity?: number;
  task_domain?: string;
  priority?: number;
}

export interface TaskEdge {
  from_task_id: string;
  to_task_id: string;
}

export interface TaskDAG {
  nodes: TaskNode[];
  edges: TaskEdge[];
}

export interface AgentNode {
  agent_id: string;
  task_id: string;
  task_content: string;
  task_complexity?: number;
  task_domain?: string;
  task_priority?: number;
  status: string;
}

export interface AgentEdge {
  from_agent_id: string;
  to_agent_id: string;
  data_dependency: string;
}

export interface AgentDAG {
  plan_id: string;
  total_agent_count: number;
  agent_nodes: AgentNode[];
  agent_edges: AgentEdge[];
}

export interface AgentResult {
  agent_id: string;
  task_id: string;
  answer: string;
  trace_id: string;
  iterations: number;
  elapsed_ms: number;
  status: string;
}

export interface DAGProgress {
  work_id: string;
  plan_id: string;
  total_tasks: number;
  completed_tasks: number;
  running_tasks: number;
  failed_tasks: number;
  pending_tasks: number;
  node_details: AgentNodeDetail[];
  total_elapsed_ms: number;
}

export interface AgentNodeDetail {
  agent_id: string;
  task_content: string;
  status: string;
  answer: string;
  trace_id: string;
  elapsed_ms: number;
}

export interface OrchestrationExecQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// buildAgentDAG
// ---------------------------------------------------------------------------

export class BuildAgentDAGInput extends Input {
  plan_id!: string;
  task_dag!: TaskDAG;
  interact_id!: string;
  force_new?: boolean;
}

export class BuildAgentDAGOutput extends Output {
  agent_dag: AgentDAG = { plan_id: '', total_agent_count: 0, agent_nodes: [], agent_edges: [] };
  task_agent_map: Record<string, string> = {};
}

// ---------------------------------------------------------------------------
// execSingleAgent
// ---------------------------------------------------------------------------

export class ExecSingleAgentInput extends Input {
  work_id!: string;
  interact_id!: string;
  agent_id!: string;
  task_content!: string;
  plan_id?: string;
  task_id?: string;
  work_context?: string;
}

export class ExecSingleAgentOutput extends Output {
  answer = '';
  trace_id = '';
  iterations = 0;
  elapsed_ms = 0;
}

// ---------------------------------------------------------------------------
// execDAG
// ---------------------------------------------------------------------------

export class ExecDAGInput extends Input {
  work_id!: string;
  agent_dag!: AgentDAG;
  work_context?: string;
  max_concurrent?: number;
  dag_timeout_ms?: number;
}

export class ExecDAGOutput extends Output {
  agent_results: AgentResult[] = [];
  total_elapsed_ms = 0;
  failed_count = 0;
}

// ---------------------------------------------------------------------------
// execDAGAsync
// ---------------------------------------------------------------------------

export class ExecDAGAsyncInput extends Input {
  work_id!: string;
  agent_dag!: AgentDAG;
  work_context?: string;
  callback_queue?: string;
  max_concurrent?: number;
}

export class ExecDAGAsyncOutput extends Output {
  job_id = '';
}

// ---------------------------------------------------------------------------
// getDAGProgress
// ---------------------------------------------------------------------------

export class GetDAGProgressInput extends Input {
  work_id!: string;
  plan_id?: string;
}

export class GetDAGProgressOutput extends Output {
  progress: DAGProgress | null = null;
}

// ---------------------------------------------------------------------------
// cancelExecution
// ---------------------------------------------------------------------------

export class CancelExecutionInput extends Input {
  work_id!: string;
}

export class CancelExecutionOutput extends Output {
  cancelled_count = 0;
}

// ---------------------------------------------------------------------------
// getExecQueueStatus
// ---------------------------------------------------------------------------

export class GetOrchestrationExecQueueStatusInput extends Input {}

export class GetOrchestrationExecQueueStatusOutput extends Output {
  queue_stats: OrchestrationExecQueueStats = { pending: 0, processing: 0, completed: 0, failed: 0 };
  workers: unknown[] = [];
  mq_queue_status: Record<string, unknown> | null = null;
}

// ---------------------------------------------------------------------------
// configOrchestrationExecution
// ---------------------------------------------------------------------------

export class ConfigOrchestrationExecutionInput extends Input {
  max_concurrent?: number;
  default_max_iterations?: number;
  async_worker_interval?: number;
  dag_timeout_ms?: number;
}

export class ConfigOrchestrationExecutionOutput extends Output {
  config: OrchestrationExecutionConfig = new OrchestrationExecutionConfig();
}

// ---------------------------------------------------------------------------
// Tables (re-exported from shared)
// ---------------------------------------------------------------------------

export {
  ORCHESTRATION_TASK_AGENT_TABLE,
  ORCHESTRATION_AGENT_DAG_TABLE,
  ORCHESTRATION_AGENT_DAG_RECORD_TABLE,
  ORCHESTRATION_AGENT_EXECUTION_TABLE,
  ORCHESTRATION_CONFIG_TABLE,
} from '../../shared/types';
