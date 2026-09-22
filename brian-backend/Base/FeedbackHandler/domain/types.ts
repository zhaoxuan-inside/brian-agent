/**
 * @fileoverview FeedbackHandler 领域层类型定义。
 *
 * 反馈处理模块负责统一处理来自反馈 Agent（如 EvolutorAgent 评估建议）和
 * 用户端的反馈提交，提供反馈存储、查询与分析能力。
 *
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，
 * 所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';
import type { FeedbackAnalysis } from '@brian-agent/shared';

/** 反馈来源 */
export type FeedbackSource = 'user' | 'agent';

/** 反馈记录 */
export interface FeedbackRecord {
  id: string;
  created: number;
  updated: number;
  /** 反馈 ID（唯一标识） */
  feedback_id: string;
  /** 来源：user（用户提交）/ agent（Agent 评估产生） */
  source: FeedbackSource;
  /** 关联 Agent ID（Agent 评估反馈时有值） */
  agent_id: string;
  /** 关联 work_id */
  work_id: string;
  /** 关联 run_id */
  run_id: string;
  /** 评分（0-100，可选） */
  rating: number;
  /** 评论文本 */
  comment: string;
  /** 优化建议列表（JSON 字符串数组） */
  suggestions: string;
  /** 反馈分类 */
  category: string;
  /** 扩展元数据（JSON） */
  metadata: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export class FeedbackContext extends Context {}

// ---------------------------------------------------------------------------
// submitFeedback（用户提交反馈）
// ---------------------------------------------------------------------------

export class SubmitFeedbackInput extends Input {
  /** 评分（0-100） */
  rating?: number;
  /** 评论文本 */
  comment?: string;
  /** 反馈分类 */
  category?: string;
  /** 关联 work_id */
  work_id?: string;
  /** 关联 run_id */
  run_id?: string;
  /** 扩展元数据 */
  declare metadata?: Record<string, unknown>;
}

export class SubmitFeedbackOutput extends Output {
  feedback_id = '';
}

// ---------------------------------------------------------------------------
// submitAgentFeedback（Agent 提交评估反馈）
// ---------------------------------------------------------------------------

export class SubmitAgentFeedbackInput extends Input {
  /** 被评估 Agent ID */
  agent_id!: string;
  /** 关联 work_id */
  work_id?: string;
  /** 关联 run_id */
  run_id?: string;
  /** 评分（0-100） */
  rating?: number;
  /** 评论文本 */
  comment?: string;
  /** 优化建议列表 */
  suggestions?: string[];
  /** 反馈分类 */
  category?: string;
  /** 扩展元数据 */
  declare metadata?: Record<string, unknown>;
}

export class SubmitAgentFeedbackOutput extends Output {
  feedback_id = '';
}

// ---------------------------------------------------------------------------
// soFeedback（查询反馈）
// ---------------------------------------------------------------------------

export class QueryFeedbackInput extends Input {
  /** 筛选条件 */
  conditions?: Condition[];
  /** 排序 */
  order_by?: OrderBy[];
  /** 分页 */
  page?: Page;
}

export class QueryFeedbackOutput extends Output {
  feedbacks: FeedbackRecord[] = [];
  total = 0;
}

// ---------------------------------------------------------------------------
// analyzeFeedback（分析反馈，生成 FeedbackAnalysis）
// ---------------------------------------------------------------------------

export class AnalyzeFeedbackInput extends Input {
  /** 按来源筛选（默认全部） */
  source?: FeedbackSource;
  /** 按 Agent ID 筛选 */
  agent_id?: string;
  /** 按分类筛选 */
  category?: string;
  /** 统计时间范围（天数，默认 30） */
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

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const FEEDBACK_RECORD_TABLE = 'feedback_record';
export const FEEDBACK_PROCESS_LOG_TABLE = 'feedback_process_log';
export const FEEDBACK_CONFIG_TABLE = 'feedback_config';

// ---------------------------------------------------------------------------
// 反馈处理日志
// ---------------------------------------------------------------------------

/** 处理动作类型 */
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

/**
 * 处理日志列表项（人性化展示字段）。
 *
 * 列表接口在返回原始日志的基础上，批量关联补充展示字段，
 * 避免前端列表只显示一串无意义的 ID：
 * - source / category / comment：关联 feedback_record 补充反馈来源、分类与评论；
 * - user_question：按 run_id 关联 info_raw 取该轮对话首条用户提问。
 */
export interface FeedbackProcessLogListItem extends FeedbackProcessLogRecord {
  /** 反馈来源：user（用户提交）/ agent（Agent 评估产生） */
  source?: FeedbackSource;
  /** 反馈分类 */
  category?: string;
  /** 用户评论文本（用户提交反馈时） */
  comment?: string;
  /** 关联的用户提问摘要 */
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

// ---------------------------------------------------------------------------
// 反馈级联删除
// ---------------------------------------------------------------------------

/** 按关联引用删除反馈（会话删除时级联调用） */
export class DeleteFeedbackByRefsInput extends Input {
  /** 关联 run_id 列表（对话轮次，关联 runtime_run.id） */
  run_ids?: string[];
  /** 关联 work_id 列表（作品/任务） */
  work_ids?: string[];
}

export class DeleteFeedbackByRefsOutput extends Output {
  /** 实际删除的记录总数（feedback_record + feedback_process_log） */
  deleted_count = 0;
}

/** 孤儿反馈清理（run_id 已不存在于 runtime_run 的历史残留） */
export class PurgeOrphanFeedbackInput extends Input {}

export class PurgeOrphanFeedbackOutput extends Output {
  /** 清理的记录总数 */
  purged_count = 0;
}

export class GetProcessLogDetailInput extends Input {
  process_id!: string;
}

export class GetProcessLogDetailOutput extends Output {
  log: FeedbackProcessLogRecord | null = null;
  feedback: FeedbackRecord | null = null;
  /** 关联的用户提问与系统回答（通过 run_id 查 info_raw） */
  user_question = '';
  system_answer = '';
}

// ---------------------------------------------------------------------------
// 反馈配置
// ---------------------------------------------------------------------------

export interface FeedbackConfigRecord {
  id: string;
  created: number;
  updated: number;
  /** 低分解散阈值（百分制，低于此分的系统 Agent 将被解散，默认 30） */
  disband_threshold: number;
  /** 是否启用自动解散 */
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