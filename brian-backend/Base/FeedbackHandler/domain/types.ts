import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';
import type { FeedbackAnalysis } from '@brian-agent/shared';

export type FeedbackSource = 'user' | 'agent';

export interface FeedbackRecord {
  id: string;
  created: number;
  updated: number;
  
  feedback_id: string;
  
  source: FeedbackSource;
  
  agent_id: string;
  
  work_id: string;
  
  run_id: string;
  
  rating: number;
  
  comment: string;
  
  suggestions: string;
  
  category: string;
  
  metadata: string;
}

export class FeedbackContext extends Context {}

export class SubmitFeedbackInput extends Input {
  
  rating?: number;
  
  comment?: string;
  
  category?: string;
  
  work_id?: string;
  
  run_id?: string;
  
  declare metadata?: Record<string, unknown>;
}

export class SubmitFeedbackOutput extends Output {
  feedback_id = '';
}

export class SubmitAgentFeedbackInput extends Input {
  
  agent_id!: string;
  
  work_id?: string;
  
  run_id?: string;
  
  rating?: number;
  
  comment?: string;
  
  suggestions?: string[];
  
  category?: string;
  
  declare metadata?: Record<string, unknown>;
}

export class SubmitAgentFeedbackOutput extends Output {
  feedback_id = '';
}

export class QueryFeedbackInput extends Input {
  
  conditions?: Condition[];
  
  order_by?: OrderBy[];
  
  page?: Page;
}

export class QueryFeedbackOutput extends Output {
  feedbacks: FeedbackRecord[] = [];
  total = 0;
}

export class AnalyzeFeedbackInput extends Input {
  
  source?: FeedbackSource;
  
  agent_id?: string;
  
  category?: string;
  
  time_range_days?: number;
}

export class AnalyzeFeedbackOutput extends Output {
  analysis: FeedbackAnalysis = {
    positiveCount: 0,
    neutralCount: 0,
    negativeCount: 0,
    commonIssues: [],
    suggestions: [],
  };
}

export const FEEDBACK_RECORD_TABLE = 'feedback_record';
export const FEEDBACK_PROCESS_LOG_TABLE = 'feedback_process_log';
export const FEEDBACK_CONFIG_TABLE = 'feedback_config';

export type ProcessAction = 'submitted' | 'disbanded' | 'skipped';

export interface FeedbackProcessLogRecord {
  id: string;
  created: number;
  updated: number;
  process_id: string;
  feedback_id: string;
  action: ProcessAction;
  agent_id: string;
  run_id: string;
  work_id: string;
  rating: number;
  details: string;
}

export interface FeedbackProcessLogListItem extends FeedbackProcessLogRecord {
  
  source?: FeedbackSource;
  
  category?: string;
  
  comment?: string;
  
  user_question?: string;
}

export class RecordProcessLogInput extends Input {
  feedback_id!: string;
  action!: ProcessAction;
  agent_id?: string;
  run_id?: string;
  work_id?: string;
  rating?: number;
  details?: Record<string, unknown>;
}

export class RecordProcessLogOutput extends Output {
  process_id = '';
}

export class QueryProcessLogsInput extends Input {
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}

export class QueryProcessLogsOutput extends Output {
  logs: FeedbackProcessLogListItem[] = [];
  total = 0;
}

export class DeleteFeedbackByRefsInput extends Input {
  
  run_ids?: string[];
  
  work_ids?: string[];
}

export class DeleteFeedbackByRefsOutput extends Output {
  
  deleted_count = 0;
}

export class PurgeOrphanFeedbackInput extends Input {}

export class PurgeOrphanFeedbackOutput extends Output {
  
  purged_count = 0;
}

export class GetProcessLogDetailInput extends Input {
  process_id!: string;
}

export class GetProcessLogDetailOutput extends Output {
  log: FeedbackProcessLogRecord | null = null;
  feedback: FeedbackRecord | null = null;
  
  user_question = '';
  system_answer = '';
}

export interface FeedbackConfigRecord {
  id: string;
  created: number;
  updated: number;
  
  disband_threshold: number;
  
  enable_auto_disband: boolean;
}

export class GetFeedbackConfigInput extends Input {}

export class GetFeedbackConfigOutput extends Output {
  config: FeedbackConfigRecord | null = null;
}

export class UpdateFeedbackConfigInput extends Input {
  disband_threshold?: number;
  enable_auto_disband?: boolean;
}

export class UpdateFeedbackConfigOutput extends Output {
  config: FeedbackConfigRecord | null = null;
}
