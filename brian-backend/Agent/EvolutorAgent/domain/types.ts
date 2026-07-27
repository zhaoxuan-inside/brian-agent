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
  trace_id!: string;
}

export interface EvalScores {
  correctness: number;
  completeness: number;
  efficiency: number;
  relevance: number;
  overall: number;
}

export class EvalWorkAgentOutput extends Output {
  eval_id = '';
  scores: EvalScores = { correctness: 0, completeness: 0, efficiency: 0, relevance: 0, overall: 0 };
  suggestions: string[] = [];
  need_optimize = false;
}

// ---------------------------------------------------------------------------
// evalWriterAgent
// ---------------------------------------------------------------------------

export class EvalWriterAgentInput extends Input {
  agent_id!: string;
  work_id!: string;
  interact_id!: string;
  user_query!: string;
  final_response!: string;
  agent_results!: Array<{ agent_id: string; task_content: string; result: string }>;
}

export interface WriterEvalScores {
  clarity: number;
  informativeness: number;
  user_alignment: number;
  conciseness: number;
  overall: number;
}

export class EvalWriterAgentOutput extends Output {
  eval_id = '';
  scores: WriterEvalScores = { clarity: 0, informativeness: 0, user_alignment: 0, conciseness: 0, overall: 0 };
  suggestions: string[] = [];
  need_optimize = false;
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
// getEvaluation
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
// getEvolutionReport
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
    usage_trend: Array<{ date: number; usage_count: number }>;
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
}

export class ConfigEvolutorAgentOutput extends Output {
  config: EvolutorAgentConfigRecord | null = null;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const AGENT_EVALUATION_TABLE = 'agent_evaluation';
export const EVOLUTOR_AGENT_CONFIG_TABLE = 'evolutor_agent_config';
