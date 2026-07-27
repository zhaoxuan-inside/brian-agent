import { v4 as uuidv4 } from 'uuid';

export type AgentTypeEnum = 'WORKER' | 'PLANNER' | 'WRITER' | 'EVOLUTOR';
export type EvalTypeEnum = 'WORK_AGENT' | 'WRITER_AGENT';
export type ResponseFormatEnum = 'TEXT' | 'MARKDOWN' | 'JSON';
export type StyleEnum = 'clear' | 'concise' | 'detailed' | 'creative';
export type DepthEnum = 'shallow' | 'medium' | 'deep';
export type ToolTypeEnum = 'SKILL' | 'MCP' | 'NONE';

export interface AgentBindingOp {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  id?: string;
  data?: Record<string, unknown>;
}

export interface TaskNode {
  task_id: string;
  task_content: string;
  task_complexity: number;
  task_domain: string;
  priority: number;
  dependencies: string[];
}

export interface TaskEdge {
  from_task_id: string;
  to_task_id: string;
}

export interface TaskDag {
  plan_id: string;
  total_task_count: number;
  nodes: TaskNode[];
  edges: TaskEdge[];
}

export interface WorkAgentResult {
  agent_id: string;
  task_content: string;
  result: string;
}

export interface ScoresEvalWork {
  correctness: number;
  completeness: number;
  efficiency: number;
  relevance: number;
  overall: number;
}

export interface ScoresEvalWriter {
  clarity: number;
  informativeness: number;
  user_alignment: number;
  conciseness: number;
  overall: number;
}

export interface UserProfile {
  session_id: string;
  language: string;
  style: StyleEnum;
  depth: DepthEnum;
  format: ResponseFormatEnum;
  additional_preferences?: string;
}

export interface ExecutionRuleSteps {
  version: string;
  max_iterations?: number;
  steps?: ExecutionRuleStep[];
  phases?: ExecutionRulePhase[];
}

export interface ExecutionRulePhase {
  phase: string;
  loop_over?: string;
  steps: ExecutionRuleStep[];
}

export interface ExecutionRuleStep {
  step: string;
  next?: string | null;
  next_field?: string;
  condition_field?: string;
  condition?: ExecutionRuleCondition;
  on_error?: string;
  true_next?: string;
  false_next?: string;
  loop_over?: string;
}

export interface ExecutionRuleCondition {
  field: string;
  operator: string;
  value: unknown;
}

export function generateId(): string {
  return uuidv4();
}
