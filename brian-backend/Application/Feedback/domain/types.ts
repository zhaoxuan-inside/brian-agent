import { Input, Context, Output } from '@brian-agent/base';

export class FeedbackContext extends Context {}

export const FEEDBACK_TABLE = 'user_feedback';
export const FEEDBACK_TYPES = ['rating', 'like', 'dislike'] as const;
export const FEEDBACK_STATUSES = ['pending', 'processed', 'dismissed'] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface FeedbackRecord {
  id: string;
  created: number;
  updated: number;
  msg_id: string;
  work_id: string;
  session_id: string;
  type: FeedbackType;
  score: number;
  comment: string;
  status: FeedbackStatus;
}

export class SubmitFeedbackInput extends Input {
  msg_id!: string;
  type!: FeedbackType;
  score?: number;
  comment?: string;
  work_id?: string;
  session_id?: string;
}
export class SubmitFeedbackOutput extends Output {
  feedback: FeedbackRecord | null = null;
}

export class GetFeedbackInput extends Input {
  id!: string;
}
export class GetFeedbackOutput extends Output {
  feedback: FeedbackRecord | null = null;
}

export class ListFeedbackInput extends Input {
  status?: FeedbackStatus;
  type?: FeedbackType;
  msg_id?: string;
  session_id?: string;
  page?: number;
  pageSize?: number;
}
export class ListFeedbackOutput extends Output {
  feedbacks: FeedbackRecord[] = [];
  total = 0;
}

export class GetFeedbackStatsInput extends Input {
  start_time?: number;
  end_time?: number;
}
export class GetFeedbackStatsOutput extends Output {
  total = 0;
  avg_rating = 0;
  rating_count = 0;
  like_count = 0;
  dislike_count = 0;
  pending_count = 0;
  by_type: Array<{ type: string; count: number }> = [];
}

export class UpdateFeedbackStatusInput extends Input {
  id!: string;
  status!: FeedbackStatus;
}
export class UpdateFeedbackStatusOutput extends Output {
  feedback: FeedbackRecord | null = null;
}
