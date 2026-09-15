import { Input, Context, Output } from '@brian-agent/base';

export class PlannerAgentContext extends Context {
  selected_msg_ids?: string[];
}

export interface AgentPlanRecord {
  id: string;
  created: number;
  updated: number;
  plan_id: string;
  work_id: string;
  run_id: string;
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
  llm_id: string | null;
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

/**
 * Planner 拆解出的单个任务节点。
 *
 * 层级语义：
 * - `parent_task_id` 表达「拆解方向」（父任务拆出子任务），根任务为空；
 * - `dependencies` 表达「执行依赖」（执行前必须先完成的子任务 task_id）；
 * - 叶子任务（无子任务）dependencies 为空，由 WorkAgent 直接执行；
 * - 父任务依赖所有子任务完成后再执行，由其汇总 Agent 结合任务目标与子任务结果产出结果。
 */
export interface PlanTaskNode {
  task_id: string;
  /** 父任务 ID（拆解层级），根任务为 undefined */
  parent_task_id?: string;
  task_content: string;
  task_complexity: number;
  task_domain: string;
  priority: number;
  /** 执行依赖：本任务执行前必须先完成的子任务 task_id 列表 */
  dependencies: string[];
}

/** 执行依赖边：from 为子任务（先执行），to 为父任务（后执行汇总）。 */
export interface PlanTaskEdge {
  from_task_id: string;
  to_task_id: string;
}

export interface PlanTaskDAG {
  nodes: PlanTaskNode[];
  edges: PlanTaskEdge[];
}

/**
 * 需用户补充参数才能执行的任务，拆解时从 DAG 中排除，转为澄清问题。
 * 由编排层在拆解后暂停执行，通过前端弹窗收集答案后重入编排。
 */
export interface PlanClarification {
  /** 向用户提出的澄清问题 */
  question: string;
  /** 该问题所属的任务域（如"交通预订"），用于展示与归组 */
  domain?: string;
}

export class PlanInput extends Input {
  work_id!: string;
  run_id!: string;
  task_content!: string;
}

export class PlanOutput extends Output {
  plan_id = '';
  task_dag: PlanTaskDAG = { nodes: [], edges: [] };
  /** 需用户补充参数才能执行的任务对应的澄清问题（不进入 DAG） */
  clarifications: PlanClarification[] = [];
}

// ---------------------------------------------------------------------------
// planHierarchical
// ---------------------------------------------------------------------------

export class PlanHierarchicalInput extends Input {
  work_id!: string;
  run_id!: string;
  task_content!: string;
  /** 递归拆解最大深度（在 LLM 单次层级拆解基础上额外递归），默认 2 */
  max_depth?: number;
}

export class PlanHierarchicalOutput extends Output {
  plan_id = '';
  task_dag: PlanTaskDAG = { nodes: [], edges: [] };
  /** 需用户补充参数才能执行的任务对应的澄清问题（不进入 DAG） */
  clarifications: PlanClarification[] = [];
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
  task_dag: PlanTaskDAG = { nodes: [], edges: [] };
}

// ---------------------------------------------------------------------------
// soPlan
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
  llm_id?: string | null;
}

export class ConfigPlannerAgentOutput extends Output {
  config: PlannerAgentConfigRecord | null = null;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const AGENT_PLAN_TABLE = 'agent_plan';
export const PLANNER_AGENT_CONFIG_TABLE = 'planner_agent_config';
