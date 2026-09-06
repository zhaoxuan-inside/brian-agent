import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { IdGenerator, Operator, Direction, ValidationError, NotFoundError, type Condition } from '@brian-agent/base';
import {
  FEEDBACK_TABLE, FEEDBACK_TYPES, FEEDBACK_STATUSES,
  FeedbackContext, FeedbackRecord, FeedbackType, FeedbackStatus,
  SubmitFeedbackInput, SubmitFeedbackOutput,
  GetFeedbackInput, GetFeedbackOutput,
  ListFeedbackInput, ListFeedbackOutput,
  GetFeedbackStatsInput, GetFeedbackStatsOutput,
  UpdateFeedbackStatusInput, UpdateFeedbackStatusOutput,
} from '../domain/types';

export class FeedbackService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly _logger?: Logger,
  ) {}

  async submitFeedback(input: SubmitFeedbackInput, output: SubmitFeedbackOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const msgId = String(input.msg_id || '').trim();
    if (!msgId) throw new ValidationError('msg_id 不能为空');
    const type = this.normalizeType(input.type);
    const score = this.normalizeScore(type, input.score);
    const now = IdGenerator.now();

    const existing = await this.relationDb.selectOne(FEEDBACK_TABLE, [
      { field: 'msg_id', operator: Operator.EQ, value: msgId },
      { field: 'type', operator: Operator.EQ, value: type },
    ]);

    if (existing) {
      await this.relationDb.update(FEEDBACK_TABLE, [
        { field: 'updated', value: now },
        { field: 'score', value: score },
        { field: 'comment', value: input.comment ?? String(existing.comment ?? '') },
        { field: 'work_id', value: input.work_id ?? String(existing.work_id ?? '') },
        { field: 'session_id', value: input.session_id ?? String(existing.session_id ?? '') },
        { field: 'status', value: 'pending' },
      ], [
        { field: 'id', operator: Operator.EQ, value: String(existing.id) },
      ]);
      output.feedback = await this.loadById(String(existing.id));
      return true;
    }

    const id = IdGenerator.generate();
    await this.relationDb.insert(FEEDBACK_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'msg_id', value: msgId },
      { field: 'work_id', value: input.work_id ?? '' },
      { field: 'session_id', value: input.session_id ?? '' },
      { field: 'type', value: type },
      { field: 'score', value: score },
      { field: 'comment', value: input.comment ?? '' },
      { field: 'status', value: 'pending' },
    ]);
    output.feedback = await this.loadById(id);
    return true;
  }

  async soFeedbackById(input: GetFeedbackInput, output: GetFeedbackOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.id) throw new ValidationError('id 不能为空');
    output.feedback = await this.loadById(input.id);
    if (!output.feedback) throw new NotFoundError('feedback', input.id);
    return true;
  }

  async soFeedback(input: ListFeedbackInput, output: ListFeedbackOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const page = input.page && input.page > 0 ? input.page : 1;
    const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : 50;
    const conditions: Condition[] = [];
    if (input.status) conditions.push({ field: 'status', operator: Operator.EQ, value: input.status });
    if (input.type) conditions.push({ field: 'type', operator: Operator.EQ, value: input.type });
    if (input.msg_id) conditions.push({ field: 'msg_id', operator: Operator.EQ, value: input.msg_id });
    if (input.session_id) conditions.push({ field: 'session_id', operator: Operator.EQ, value: input.session_id });

    const rows = await this.relationDb.select(FEEDBACK_TABLE, {
      conditions,
      order_by: [{ field: 'created', direction: Direction.DESC }],
      page: { current: page, size: pageSize },
    });
    output.total = await this.relationDb.count(FEEDBACK_TABLE, conditions);
    output.feedbacks = (rows || []).map((r) => this.toRecord(r));
    return true;
  }

  async soFeedbackStats(input: GetFeedbackStatsInput, output: GetFeedbackStatsOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.start_time !== undefined) {
      clauses.push('"created" >= ?');
      params.push(input.start_time);
    }
    if (input.end_time !== undefined) {
      clauses.push('"created" <= ?');
      params.push(input.end_time);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    const summary = this.relationDb.queryRaw<{ total: number; avg_rating: number; rating_count: number; like_count: number; dislike_count: number; pending_count: number }>(
      `SELECT COUNT(*) AS "total",
        COALESCE(AVG(CASE WHEN "type" = 'rating' THEN "score" END), 0) AS "avg_rating",
        SUM(CASE WHEN "type" = 'rating' THEN 1 ELSE 0 END) AS "rating_count",
        SUM(CASE WHEN "type" = 'like' THEN 1 ELSE 0 END) AS "like_count",
        SUM(CASE WHEN "type" = 'dislike' THEN 1 ELSE 0 END) AS "dislike_count",
        SUM(CASE WHEN "status" = 'pending' THEN 1 ELSE 0 END) AS "pending_count"
       FROM "${FEEDBACK_TABLE}"${where}`,
      params,
    )[0];
    output.total = Number(summary?.total) || 0;
    output.avg_rating = Number(Number(summary?.avg_rating || 0).toFixed(2));
    output.rating_count = Number(summary?.rating_count) || 0;
    output.like_count = Number(summary?.like_count) || 0;
    output.dislike_count = Number(summary?.dislike_count) || 0;
    output.pending_count = Number(summary?.pending_count) || 0;
    output.by_type = this.relationDb.queryRaw<{ type: string; count: number }>(
      `SELECT "type", COUNT(*) AS "count" FROM "${FEEDBACK_TABLE}"${where} GROUP BY "type" ORDER BY "count" DESC`,
      params,
    ).map((r) => ({ type: String(r.type), count: Number(r.count) || 0 }));
    return true;
  }

  async updateFeedbackStatus(input: UpdateFeedbackStatusInput, output: UpdateFeedbackStatusOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.id) throw new ValidationError('id 不能为空');
    const status = this.normalizeStatus(input.status);
    const existing = await this.loadById(input.id);
    if (!existing) throw new NotFoundError('feedback', input.id);
    await this.relationDb.update(FEEDBACK_TABLE, [
      { field: 'updated', value: IdGenerator.now() },
      { field: 'status', value: status },
    ], [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    output.feedback = await this.loadById(input.id);
    return true;
  }

  private async loadById(id: string): Promise<FeedbackRecord | null> {
    const row = await this.relationDb.selectOne(FEEDBACK_TABLE, [
      { field: 'id', operator: Operator.EQ, value: id },
    ]);
    return row ? this.toRecord(row) : null;
  }

  private toRecord(row: Record<string, unknown>): FeedbackRecord {
    return {
      id: String(row.id ?? ''),
      created: Number(row.created) || 0,
      updated: Number(row.updated) || 0,
      msg_id: String(row.msg_id ?? ''),
      work_id: String(row.work_id ?? ''),
      session_id: String(row.session_id ?? ''),
      type: this.normalizeType(String(row.type)),
      score: Number(row.score) || 0,
      comment: String(row.comment ?? ''),
      status: this.normalizeStatus(String(row.status || 'pending')),
    };
  }

  private normalizeType(raw: string): FeedbackType {
    const type = String(raw || '').toLowerCase() as FeedbackType;
    if (!FEEDBACK_TYPES.includes(type)) throw new ValidationError('type 必须是 rating / like / dislike');
    return type;
  }

  private normalizeStatus(raw: string): FeedbackStatus {
    const status = String(raw || '').toLowerCase() as FeedbackStatus;
    if (!FEEDBACK_STATUSES.includes(status)) throw new ValidationError('status 必须是 pending / processed / dismissed');
    return status;
  }

  private normalizeScore(type: FeedbackType, raw?: number): number {
    if (type === 'like') return 1;
    if (type === 'dislike') return 0;
    const score = Number(raw);
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      throw new ValidationError('rating 的 score 必须是 1-5');
    }
    return Math.round(score);
  }
}
