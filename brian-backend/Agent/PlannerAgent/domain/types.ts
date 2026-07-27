import { Input, Context, Output } from '@brian-agent/base';

export class PlannerAgentContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

export interface AgentPlanRecord {
  id: string;
  created: number;
  updated: number;
  plan_id: string;
  work_id: string;
  interact_id: string;
  task_dag: string;
  parent_plan_id: string;
}

export interface PlannerAgentConfigRecord {
  id: string;
  created: number;
  updated: number;
  complexity_decompose_threshold: number;
  plan_prompt_template_id: string;
  max_subtask_count: number;
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

export class PlanInput extends Input {
  work_id!: string;
  interact_id!: string;
  task_content!: string;
}

export class PlanOutput extends Output {
  plan_id = '';
  task_dag: { nodes: Array<{ task_id: string; task_content: string; task_complexity: number; task_domain: string; priority: number; dependencies: string[] }>; edges: Array<{ from_task_id: string; to_task_id: string }> } = { nodes: [], edges: [] };
}

// ---------------------------------------------------------------------------
// replan
// ---------------------------------------------------------------------------

export class ReplanInput extends Input {
  plan_id!: string;
  failed_task_id!: string;
  failure_reason!: string;
  completed_task_ids!: string[];
}

export class ReplanOutput extends Output {
  new_plan_id = '';
  task_dag: PlanOutput['task_dag'] = { nodes: [], edges: [] };
}

// ---------------------------------------------------------------------------
// getPlan
// ---------------------------------------------------------------------------

export class GetPlanInput extends Input {
  plan_id?: string;
  work_id?: string;
}

export class GetPlanOutput extends Output {
  plans: AgentPlanRecord[] = [];
}

// ---------------------------------------------------------------------------
// configPlannerAgent
// ---------------------------------------------------------------------------

export class ConfigPlannerAgentInput extends Input {
  complexity_decompose_threshold?: number;
  plan_prompt_template_id?: string;
  max_subtask_count?: number;
}

export class ConfigPlannerAgentOutput extends Output {
  config: PlannerAgentConfigRecord | null = null;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const AGENT_PLAN_TABLE = 'agent_plan';
export const PLANNER_AGENT_CONFIG_TABLE = 'planner_agent_config';
