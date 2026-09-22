import { Metrics, Report, newRecord, newPatch, Operator, Logic } from '../../shared';
import { IdGenerator } from '../../ToolProvider';
import type { RelationDBAccess } from '../../RelationDBProvider';
import type { Condition, OrderBy } from '../../shared/query';
import {
  FEEDBACK_RECORD_TABLE,
  FEEDBACK_PROCESS_LOG_TABLE,
  FEEDBACK_CONFIG_TABLE,
  type FeedbackRecord,
  type FeedbackProcessLogRecord,
  type FeedbackProcessLogListItem,
  type ProcessAction,
  FeedbackContext,
  SubmitFeedbackInput, SubmitFeedbackOutput,
  SubmitAgentFeedbackInput, SubmitAgentFeedbackOutput,
  QueryFeedbackInput, QueryFeedbackOutput,
  AnalyzeFeedbackInput, AnalyzeFeedbackOutput,
  RecordProcessLogInput, RecordProcessLogOutput,
  QueryProcessLogsInput, QueryProcessLogsOutput,
  GetProcessLogDetailInput, GetProcessLogDetailOutput,
  DeleteFeedbackByRefsInput, DeleteFeedbackByRefsOutput,
  PurgeOrphanFeedbackInput, PurgeOrphanFeedbackOutput,
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

  // ===== 修改后的方法：在原始查询之上批量补充人性化展示字段 =====
  // 列表原本只含一串 ID（process_id / agent_id / run_id），对人不友好。
  // 通过 feedback_id IN / run_id IN 各一次批量查询（非逐行 N+1）关联
  // 反馈来源、分类、评论与该轮对话的首条用户提问，供前端直接展示。
  async getProcessLogs(
    input: QueryProcessLogsInput, output: QueryProcessLogsOutput, _ctx: FeedbackContext,
    metrics?: Metrics, _report?: Report,
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
    await this.enrichProcessLogs(output.logs, metrics);
    return true;
  }

  /** 批量补充列表项的人性化展示字段（失败静默降级为仅原始字段） */
  private async enrichProcessLogs(logs: FeedbackProcessLogListItem[], metrics?: Metrics): Promise<void> {
    try {
      // 1) feedback_id IN 批量取反馈记录 → source / category / comment
      const feedbackIds = [...new Set(logs.map(l => l.feedback_id).filter(Boolean))];
      const feedbackMap = new Map<string, FeedbackRecord>();
      if (feedbackIds.length > 0) {
        const feedbackRows = await this.relationDb.select(FEEDBACK_RECORD_TABLE, {
          conditions: [{ field: 'feedback_id', operator: Operator.IN, value: feedbackIds }],
        });
        for (const row of feedbackRows) {
          const record = mapRecord(row);
          feedbackMap.set(record.feedback_id, record);
        }
      }

      // 2) run_id IN 批量取用户提问（每个 run 取首条），与详情接口口径一致
      const runIds = [...new Set(logs.map(l => l.run_id).filter(Boolean))];
      const questionMap = new Map<string, string>();
      if (runIds.length > 0) {
        const questionRows = await this.relationDb.select('info_raw', {
          conditions: [
            { field: 'run_id', operator: Operator.IN, value: runIds },
            { field: 'info_creator_role', operator: Operator.EQ, value: 'user' },
          ],
          order_by: [{ field: 'created', direction: 'ASC' }],
        });
        for (const row of questionRows) {
          const runId = String(row.run_id ?? '');
          if (runId && !questionMap.has(runId)) questionMap.set(runId, String(row.info ?? ''));
        }
      }

      for (const log of logs) {
        const feedback = feedbackMap.get(log.feedback_id);
        if (feedback) {
          log.source = feedback.source;
          log.category = feedback.category;
          log.comment = feedback.comment;
        }
        const question = questionMap.get(log.run_id);
        if (question) log.user_question = question;
      }
    } catch (err) {
      /* 补充字段失败时降级为仅返回原始字段 */
      metrics?.warn('FeedbackService.enrichProcessLogs 展示字段补充失败，降级为仅原始字段', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
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

  /**
   * 按关联引用删除反馈（会话删除时级联调用）。
   *
   * 会话（对话原文 info_raw / 运行记录 runtime_run）被删除后，引用它的
   * feedback_record 与 feedback_process_log 会变成「无法关联任何内容」的
   * 孤儿数据（监控页只剩一串 ID）。会话删除时按 run_id / work_id 级联删除。
   * run_id 与 work_id 之间为 OR 关系，两类引用各自独立成立。
   */
  async deleteFeedbackByRefs(
    input: DeleteFeedbackByRefsInput, output: DeleteFeedbackByRefsOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const runIds = (input.run_ids ?? []).filter(Boolean);
    const workIds = (input.work_ids ?? []).filter(Boolean);
    if (runIds.length === 0 && workIds.length === 0) {
      output.deleted_count = 0;
      return true;
    }
    const conds: Condition[] = [];
    if (runIds.length > 0) conds.push({ field: 'run_id', operator: Operator.IN, value: runIds });
    if (workIds.length > 0) conds.push({ field: 'work_id', operator: Operator.IN, value: workIds, logic: Logic.OR });
    let deleted = 0;
    deleted += await this.relationDb.delete(FEEDBACK_RECORD_TABLE, conds);
    deleted += await this.relationDb.delete(FEEDBACK_PROCESS_LOG_TABLE, conds);
    output.deleted_count = deleted;
    return true;
  }

  /**
   * 孤儿反馈清理（启动时一次性执行）。
   *
   * 历史版本删除会话时未级联清理反馈，残留关联内容已被删除的孤儿记录。
   * 行级存在性判据：run_id 有效 ⇔ 存在于 runtime_run；work_id 有效 ⇔ 存在于
   * info_raw（对话原文删除时按 work_id 级联消失）。run_id 与 work_id 均无效
   * （或两者本为空）的记录即孤儿——监控页只会显示「暂无提问内容」和一串无法
   * 关联的 ID——按 id 走标准删除路径移除。失败静默降级为 0。
   */
  async purgeOrphanFeedback(
    input: PurgeOrphanFeedbackInput, output: PurgeOrphanFeedbackOutput, _ctx: FeedbackContext,
    _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    try {
      const orphanPredicate =
        `(run_id = '' OR run_id NOT IN (SELECT id FROM runtime_run))` +
        ` AND (work_id = '' OR work_id NOT IN (SELECT work_id FROM info_raw WHERE work_id IS NOT NULL))`;
      let purged = 0;
      for (const table of [FEEDBACK_RECORD_TABLE, FEEDBACK_PROCESS_LOG_TABLE]) {
        const orphanRows = await this.relationDb.queryRaw<{ id: string }>(
          `SELECT id FROM ${table} WHERE ${orphanPredicate}`,
        );
        const ids = orphanRows.map(r => String(r.id ?? '')).filter(Boolean);
        if (ids.length > 0) {
          purged += await this.relationDb.delete(table, [
            { field: 'id', operator: Operator.IN, value: ids },
          ]);
        }
      }
      output.purged_count = purged;
    } catch { output.purged_count = 0; }
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
      } catch {
        /* skip bad JSON：suggestions 列非 JSON（历史/手工数据）时跳过该条，不影响其余统计 */
      }
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