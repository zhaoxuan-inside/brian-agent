import { Metrics, Report, newRecord, newPatch, Operator } from '../../shared';
import { IdGenerator } from '../../ToolProvider';
import type { RelationDBAccess } from '../../RelationDBProvider';
import type { Condition, OrderBy } from '../../shared/query';
import {
  FEEDBACK_RECORD_TABLE,
  FEEDBACK_PROCESS_LOG_TABLE,
  FEEDBACK_CONFIG_TABLE,
  type FeedbackRecord,
  type FeedbackProcessLogRecord,
  type ProcessAction,
  FeedbackContext,
  SubmitFeedbackInput, SubmitFeedbackOutput,
  SubmitAgentFeedbackInput, SubmitAgentFeedbackOutput,
  QueryFeedbackInput, QueryFeedbackOutput,
  AnalyzeFeedbackInput, AnalyzeFeedbackOutput,
  RecordProcessLogInput, RecordProcessLogOutput,
  QueryProcessLogsInput, QueryProcessLogsOutput,
  GetProcessLogDetailInput, GetProcessLogDetailOutput,
  GetFeedbackConfigInput, GetFeedbackConfigOutput,
  UpdateFeedbackConfigInput, UpdateFeedbackConfigOutput,
} from '../domain/types';

function mapRecord(row: Record<string, unknown>): FeedbackRecord {
  return {
    id: String(row.id),
    created: Number(row.created),
    updated: Number(row.updated),
    feedback_id: String(row.feedback_id),
    source: String(row.source) as FeedbackRecord['source'],
    agent_id: String(row.agent_id ?? ''),
    work_id: String(row.work_id ?? ''),
    run_id: String(row.run_id ?? ''),
    rating: Number(row.rating ?? 0),
    comment: String(row.comment ?? ''),
    suggestions: String(row.suggestions ?? '[]'),
    category: String(row.category ?? ''),
    metadata: String(row.metadata ?? '{}'),
  };
}

function mapProcessLog(row: Record<string, unknown>): FeedbackProcessLogRecord {
  return {
    id: String(row.id),
    created: Number(row.created),
    updated: Number(row.updated),
    process_id: String(row.process_id),
    feedback_id: String(row.feedback_id ?? ''),
    action: String(row.action ?? 'submitted') as ProcessAction,
    agent_id: String(row.agent_id ?? ''),
    run_id: String(row.run_id ?? ''),
    work_id: String(row.work_id ?? ''),
    rating: Number(row.rating ?? 0),
    details: String(row.details ?? '{}'),
  };
}

const RATING_POSITIVE_THRESHOLD = 70;
const RATING_NEGATIVE_THRESHOLD = 40;

export class FeedbackService {
  constructor(
    private readonly relationDb: RelationDBAccess,
  ) {}

  async submitFeedback(
    input: SubmitFeedbackInput, output: SubmitFeedbackOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.rating !== undefined && (input.rating < 0 || input.rating > 100)) {
      output.error = '评分范围 0-100';
      output.error_code = 'VALIDATION_ERROR';
      return true;
    }

    const feedbackId = IdGenerator.generate();
    await this.relationDb.insert(FEEDBACK_RECORD_TABLE, newRecord({
      feedback_id: feedbackId,
      source: 'user',
      agent_id: '',
      work_id: input.work_id || '',
      run_id: input.run_id || '',
      rating: input.rating ?? 0,
      comment: input.comment || '',
      suggestions: '[]',
      category: input.category || '',
      metadata: input.metadata ? JSON.stringify(input.metadata) : '{}',
    }));

    await this.recordProcessLogInternal(feedbackId, 'submitted', {
      run_id: input.run_id,
      work_id: input.work_id,
      rating: input.rating ?? 0,
    });

    output.feedback_id = feedbackId;
    return true;
  }

  async submitAgentFeedback(
    input: SubmitAgentFeedbackInput, output: SubmitAgentFeedbackOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.agent_id) {
      output.error = 'agent_id 不能为空';
      output.error_code = 'VALIDATION_ERROR';
      return true;
    }
    if (input.rating !== undefined && (input.rating < 0 || input.rating > 100)) {
      output.error = '评分范围 0-100';
      output.error_code = 'VALIDATION_ERROR';
      return true;
    }

    const feedbackId = IdGenerator.generate();
    await this.relationDb.insert(FEEDBACK_RECORD_TABLE, newRecord({
      feedback_id: feedbackId,
      source: 'agent',
      agent_id: input.agent_id,
      work_id: input.work_id || '',
      run_id: input.run_id || '',
      rating: input.rating ?? 0,
      comment: input.comment || '',
      suggestions: JSON.stringify(input.suggestions ?? []),
      category: input.category || '',
      metadata: input.metadata ? JSON.stringify(input.metadata) : '{}',
    }));

    output.feedback_id = feedbackId;
    return true;
  }

  async recordProcessLog(
    input: RecordProcessLogInput, output: RecordProcessLogOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const processId = await this.recordProcessLogInternal(
      input.feedback_id, input.action, {
        agent_id: input.agent_id,
        run_id: input.run_id,
        work_id: input.work_id,
        rating: input.rating ?? 0,
        details: input.details,
      },
    );
    output.process_id = processId;
    return true;
  }

  async getProcessLogs(
    input: QueryProcessLogsInput, output: QueryProcessLogsOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const sort: OrderBy[] = input.order_by ?? [{ field: 'created', direction: 'DESC' }];
    const rows = await this.relationDb.select(FEEDBACK_PROCESS_LOG_TABLE, {
      conditions: input.conditions,
      order_by: sort,
      page: input.page,
    });
    output.logs = rows.map(mapProcessLog);
    const count = await this.relationDb.count(FEEDBACK_PROCESS_LOG_TABLE, input.conditions);
    output.total = count;
    return true;
  }

  async getProcessLogDetail(
    input: GetProcessLogDetailInput, output: GetProcessLogDetailOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const logRow = await this.relationDb.selectOne(FEEDBACK_PROCESS_LOG_TABLE, [
      { field: 'process_id', operator: Operator.EQ, value: input.process_id },
    ]);
    if (!logRow) {
      output.error = '未找到记录';
      output.error_code = 'NOT_FOUND';
      return true;
    }
    const log = mapProcessLog(logRow);
    output.log = log;

    if (log.feedback_id) {
      const fbRow = await this.relationDb.selectOne(FEEDBACK_RECORD_TABLE, [
        { field: 'feedback_id', operator: Operator.EQ, value: log.feedback_id },
      ]);
      output.feedback = fbRow ? mapRecord(fbRow) : null;
    }

    if (log.run_id) {
      const questions = await this.relationDb.select('info_raw', {
        conditions: [
          { field: 'run_id', operator: Operator.EQ, value: log.run_id },
          { field: 'info_creator_role', operator: Operator.EQ, value: 'user' },
        ],
        order_by: [{ field: 'created', direction: 'ASC' }],
        page: { current: 1, size: 1 },
      });
      if (questions.length > 0) {
        output.user_question = String(questions[0].info || '');
      }

      const answers = await this.relationDb.select('info_raw', {
        conditions: [
          { field: 'run_id', operator: Operator.EQ, value: log.run_id },
          { field: 'info_creator_role', operator: Operator.EQ, value: 'assistant' },
        ],
        order_by: [{ field: 'created', direction: 'ASC' }],
        page: { current: 1, size: 1 },
      });
      if (answers.length > 0) {
        output.system_answer = String(answers[0].info || '');
      }
    }

    return true;
  }

  async soFeedback(
    input: QueryFeedbackInput, output: QueryFeedbackOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(FEEDBACK_RECORD_TABLE, {
      conditions: input.conditions,
      order_by: input.order_by,
      page: input.page,
    });
    output.feedbacks = rows.map(mapRecord);
    const count = await this.relationDb.count(FEEDBACK_RECORD_TABLE, input.conditions);
    output.total = count;
    return true;
  }

  async analyzeFeedback(
    input: AnalyzeFeedbackInput, output: AnalyzeFeedbackOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const conditions: Condition[] = [];
    const timeAgo = Date.now() - (input.time_range_days ?? 30) * 24 * 60 * 60 * 1000;
    conditions.push({ field: 'created', operator: Operator.GE, value: timeAgo });
    if (input.source) {
      conditions.push({ field: 'source', operator: Operator.EQ, value: input.source });
    }
    if (input.agent_id) {
      conditions.push({ field: 'agent_id', operator: Operator.EQ, value: input.agent_id });
    }
    if (input.category) {
      conditions.push({ field: 'category', operator: Operator.EQ, value: input.category });
    }

    const rows = await this.relationDb.select(FEEDBACK_RECORD_TABLE, {
      conditions,
      order_by: [{ field: 'created', direction: 'DESC' }],
    });
    const records = rows.map(mapRecord);

    let positiveCount = 0;
    let neutralCount = 0;
    let negativeCount = 0;
    const issueCount: Record<string, number> = {};
    const allSuggestions: string[] = [];

    for (const r of records) {
      if (r.rating >= RATING_POSITIVE_THRESHOLD) {
        positiveCount++;
      } else if (r.rating <= RATING_NEGATIVE_THRESHOLD && r.rating > 0) {
        negativeCount++;
      } else {
        neutralCount++;
      }

      if (r.comment) {
        issueCount[r.comment] = (issueCount[r.comment] || 0) + 1;
      }

      try {
        const parsed = JSON.parse(r.suggestions);
        if (Array.isArray(parsed)) {
          for (const s of parsed) {
            if (typeof s === 'string') allSuggestions.push(s);
          }
        }
      } catch { /* skip bad JSON */ }
    }

    const commonIssues = Object.entries(issueCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([comment]) => comment);

    output.analysis = {
      positiveCount,
      neutralCount,
      negativeCount,
      commonIssues,
      suggestions: [...new Set(allSuggestions)],
    };

    return true;
  }

  async getFeedbackConfig(
    _input: GetFeedbackConfigInput, output: GetFeedbackConfigOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(FEEDBACK_CONFIG_TABLE, {
      order_by: [{ field: 'created', direction: 'DESC' }],
      page: { current: 1, size: 1 },
    });
    if (rows.length > 0) {
      const r = rows[0];
      output.config = {
        id: String(r.id),
        created: Number(r.created),
        updated: Number(r.updated),
        disband_threshold: Number(r.disband_threshold ?? 30),
        enable_auto_disband: r.enable_auto_disband === true || r.enable_auto_disband === 1 || r.enable_auto_disband === '1',
      };
    }
    return true;
  }

  async updateFeedbackConfig(
    input: UpdateFeedbackConfigInput, output: UpdateFeedbackConfigOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(FEEDBACK_CONFIG_TABLE, {
      order_by: [{ field: 'created', direction: 'DESC' }],
      page: { current: 1, size: 1 },
    });

    if (rows.length === 0) {
      output.error = '配置不存在';
      output.error_code = 'NOT_FOUND';
      return true;
    }

    const recordId = String(rows[0].id);
    const patch: Record<string, unknown> = {};
    if (input.disband_threshold !== undefined) patch.disband_threshold = input.disband_threshold;
    if (input.enable_auto_disband !== undefined) patch.enable_auto_disband = input.enable_auto_disband ? 1 : 0;

    if (Object.keys(patch).length > 0) {
      await this.relationDb.update(
        FEEDBACK_CONFIG_TABLE,
        newPatch(patch),
        [{ field: 'id', operator: Operator.EQ, value: recordId }],
      );
    }

    const updated = await this.relationDb.selectOne(FEEDBACK_CONFIG_TABLE, [
      { field: 'id', operator: Operator.EQ, value: recordId },
    ]);
    if (updated) {
      output.config = {
        id: String(updated.id),
        created: Number(updated.created),
        updated: Number(updated.updated),
        disband_threshold: Number(updated.disband_threshold ?? 30),
        enable_auto_disband: updated.enable_auto_disband === true || updated.enable_auto_disband === 1 || updated.enable_auto_disband === '1',
      };
    }

    return true;
  }

  private async recordProcessLogInternal(
    feedbackId: string,
    action: ProcessAction,
    meta: { agent_id?: string; run_id?: string; work_id?: string; rating?: number; details?: Record<string, unknown> },
  ): Promise<string> {
    const processId = IdGenerator.generate();
    await this.relationDb.insert(FEEDBACK_PROCESS_LOG_TABLE, newRecord({
      process_id: processId,
      feedback_id: feedbackId,
      action,
      agent_id: meta.agent_id || '',
      run_id: meta.run_id || '',
      work_id: meta.work_id || '',
      rating: meta.rating ?? 0,
      details: meta.details ? JSON.stringify(meta.details) : '{}',
    }));
    return processId;
  }
}