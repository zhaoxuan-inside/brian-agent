import { Input, Context, Output } from '@brian-agent/base';

export class JSONNodeContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

export class JSONNodeConfig {
  max_execution_depth = 50;
  node_timeout_ms = 300000;
  trace_enabled = true;
}

export type NodeHandler = (sharedData: Record<string, unknown>, params: Record<string, unknown>, context: JSONNodeContext) => Promise<void>;

export interface JSONNodeDefinition {
  version: string;
  orchestration_id: string;
  start_node: string;
  nodes: JSONNodeItem[];
}

export interface JSONNodeItem {
  node_id: string;
  node_type: string;
  params: Record<string, unknown>;
  next: string | null;
  on_error?: string;
  true_next?: string;
  false_next?: string;
}

export interface NodeExecutionTrace {
  node_id: string;
  node_type: string;
  status: string;
  elapsed_ms: number;
  error?: string;
}

export class ExecJSONNodeInput extends Input {
  orchestration_id!: string;
  jsonnode_definition!: JSONNodeDefinition;
  initial_data?: Record<string, unknown>;
}

export class ExecJSONNodeOutput extends Output {
  shared_data: Record<string, unknown> = {};
  execution_trace: NodeExecutionTrace[] = [];
}

export class GetJSONNodeTraceInput extends Input {
  orchestration_id!: string;
}

export class GetJSONNodeTraceOutput extends Output {
  trace: NodeExecutionTrace[] = [];
}

export class RegisterNodeTypeInput extends Input {
  node_type!: string;
  handler!: NodeHandler;
}

export class RegisterNodeTypeOutput extends Output {
  registered = false;
}

export class ValidateJSONNodeInput extends Input {
  jsonnode_definition!: JSONNodeDefinition;
}

export class ValidateJSONNodeOutput extends Output {
  valid = false;
  errors: string[] = [];
}

export class ConfigJSONNodeInput extends Input {
  max_execution_depth?: number;
  node_timeout_ms?: number;
  trace_enabled?: boolean;
}

export class ConfigJSONNodeOutput extends Output {
  config: JSONNodeConfig = new JSONNodeConfig();
}

export const BUILTIN_NODE_TYPES = [
  'SAVE_USER_INPUT',
  'BUILD_WORK_CONTEXT',
  'SELECT_STRATEGY',
  'CONDITION',
  'BUILD_WORK_AGENT',
  'EXEC_AGENT',
  'PLAN_WORK',
  'BUILD_AGENT_DAG',
  'EXEC_DAG',
  'WRITE_RESULT',
  'EVAL_RESULT',
  'SAVE_RESPONSE',
  'HANDLE_ERROR',
  'INVOKE',
] as const;

export const ORCHESTRATION_JSONNODE_TRACE_TABLE = 'orchestration_jsonnode_trace';
export const ORCHESTRATION_NODE_TYPE_TABLE = 'orchestration_node_type';
