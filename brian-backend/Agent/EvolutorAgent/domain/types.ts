import { Input, Context, Output } from '@brian-agent/base';
import type { Condition, OrderBy, Page } from '@brian-agent/base';

export class EvolutorAgentContext extends Context {
  session_id?: string;
  work_id?: string;
  interact_id?: string;
}

export interface AgentEvaluationRecord {
  id: string;
  created: number;
  updated: number;
  eval_id: string;
  agent_id: string;
  eval_type: string;
  work_id: string;
  interact_id: string;
  scores: string;
  suggestions: string;
  need_optimize: boolean;
}

export interface EvolutorAgentConfigRecord {
  id: string;
  created: number;
  updated: number;
  eval_work_prompt_template_id: string;
  eval_write_prompt_template_id: string;
  optimize_threshold: number;
  eval_frequency_threshold: number;
  eval_schedule_interval_ms: number;
  eval_batch_size: number;
  llm_id: string | null;
  /** 低分解散阈值（百分制；2026-09-11 新增，默认 30） */
  critical_disband_score: number;
}

// ---------------------------------------------------------------------------
// evalWorkAgent
// ---------------------------------------------------------------------------

export class EvalWorkAgentInput extends Input {
  agent_id!: string;
  work_id!: string;
  interact_id!: string;
  task_content!: string;
  agent_output!: string;
  /** 被评估输出的处理结果类型：错误信息（call_error / internal_error）跳过评分 */
  handle_result_type?: string;
  declare trace_id: string;
}

export interface EvalScores {
  correctness: number;
  completeness: number;
  efficiency: number;
  relevance: number;
  overall: number;
}

export class EvalWorkAgentOutput extends Output {
  // 实际执行评估的 Evolutor 系统 Agent 的 agent_id（注意：input.agent_id 为被评估的 Work Agent）
  agent_id = '';
  eval_id = '';
  scores: EvalScores = { correctness: 0, completeness: 0, efficiency: 0, relevance: 0, overall: 0 };
  suggestions: string[] = [];
  need_optimize = false;
  /** 低分解散是否已执行（2026-09-11 新增；overall < DisbandThreshold.Critical 且 system 归属时 true） */
  disbanded = false;
}

// ---------------------------------------------------------------------------
// evalWriterAgent
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export class EvalWriterAgentInput extends Input {
  agent_id!: string;
  work_id!: string;
  interact_id!: string;
  user_query!: string;
  final_response!: string;
  agent_results!: Array<{ agent_id: string; task_content: string; result: string; handle_result_type?: string }>;
  /** 最终回复的处理结果类型：错误信息跳过评分 */
  handle_result_type?: string;
}

export interface WriterEvalScores {
  clarity: number;
  informativeness: number;
  user_alignment: number;
  conciseness: number;
  overall: number;
}

export class EvalWriterAgentOutput extends Output {
  // 实际执行评估的 Evolutor 系统 Agent 的 agent_id（注意：input.agent_id 为被评估的 Writer Agent）
  agent_id = '';
  eval_id = '';
  scores: WriterEvalScores = { clarity: 0, informativeness: 0, user_alignment: 0, conciseness: 0, overall: 0 };
  suggestions: string[] = [];
  need_optimize = false;
  // 本次评估的轨迹 id（已落库 agent_execution_trace，供编排层关联 orchestration_agent_execution）
  trace_id = '';
}

// ---------------------------------------------------------------------------
// startEvalSchedule / stopEvalSchedule
// ---------------------------------------------------------------------------

export class StartEvalScheduleInput extends Input {
  interval_ms?: number;
  eval_batch_size?: number;
}

export class StartEvalScheduleOutput extends Output {
  worker_id = '';
}

export class StopEvalScheduleInput extends Input {
  worker_id?: string;
}

export class StopEvalScheduleOutput extends Output {}

// ---------------------------------------------------------------------------
// soEvaluation
// ---------------------------------------------------------------------------

export class GetEvaluationInput extends Input {
  agent_id?: string;
  eval_type?: string;
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}

export class GetEvaluationOutput extends Output {
  evaluations: AgentEvaluationRecord[] = [];
}

// ---------------------------------------------------------------------------
// soEvolutionReport
// ---------------------------------------------------------------------------

export class GetEvolutionReportInput extends Input {
  agent_id!: string;
  time_range_days?: number;
}

export class GetEvolutionReportOutput extends Output {
  report: {
    agent_id: string; agent_name: string; agent_type: string;
    score_trend: Array<{ date: number; overall: number; correctness: number; completeness: number }>;
    component_changes: Array<{ time: number; component: string; from: string; to: string }>;
    usage_trend: Array<{ date: string; count: number }>;
    current_score: number;
    evolution_summary: string;
  } | null = null;
}

// ---------------------------------------------------------------------------
// configEvolutorAgent
// ---------------------------------------------------------------------------

export class ConfigEvolutorAgentInput extends Input {
  eval_work_prompt_template_id?: string;
  eval_write_prompt_template_id?: string;
  optimize_threshold?: number;
  eval_frequency_threshold?: number;
  eval_schedule_interval_ms?: number;
  eval_batch_size?: number;
  llm_id?: string | null;
  /** 低分解散阈值（百分制；2026-09-11 新增） */
  critical_disband_score?: number;
}

export class ConfigEvolutorAgentOutput extends Output {
  config: EvolutorAgentConfigRecord | null = null;
}

// ---------------------------------------------------------------------------
// runEvalOnce（单轮评估闭环：手动触发/随机触发各执行一次完整评估，不启动常驻调度）
// ---------------------------------------------------------------------------

export class RunEvalOnceInput extends Input {
  /** 评估时间窗（毫秒），默认 7 天 */
  cutoff_ms?: number;
  /** 触发阈值：Agent 累计未评估 usage 达到该值才评估，默认 5 */
  eval_frequency_threshold?: number;
  /** 单 Agent 单轮最大评估条数，默认 20 */
  eval_batch_size?: number;
}

export class RunEvalOnceOutput extends Output {
  /** 本轮扫描到的 Agent 数 */
  scanned_agents = 0;
  /** 本轮实际评估的 usage 条数 */
  evaluated_count = 0;
  /** 本轮跳过（无 usage_context 关键字段）的条数 */
  skipped_count = 0;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const AGENT_EVALUATION_TABLE = 'agent_evaluation';
export const EVOLUTOR_AGENT_CONFIG_TABLE = 'evolutor_agent_config';
