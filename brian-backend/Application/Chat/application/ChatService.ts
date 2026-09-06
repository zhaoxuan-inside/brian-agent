import { Metrics, Report } from '@brian-agent/base';
import {
  RelationDBAccess, InsertDBInput, InsertDBOutput,
  SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  CountDBInput, CountDBOutput,
  DataObject, DBContext,
  IdGenerator, ValidationError, NotFoundError, Operator,
  type Logger, type Condition,
  type StreamAccess,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  LastNInfoInput, LastNInfoOutput,
  GraphInfoInput, GraphInfoOutput,
  SoCitationEdgesInput, SoCitationEdgesOutput,
  DelInfoGraphInput, DelInfoGraphOutput,
  KeywordKInfoInput, KeywordKInfoOutput,
  PinInfoInput, PinInfoOutput,
  InfoCoreContext,
} from '@brian-agent/core';
import {
  ChatContext,
  CreateSessionInput, CreateSessionOutput,
  DeleteSessionInput, DeleteSessionOutput,
  SearchSessionInput, SearchSessionOutput,
  GetSessionDetailInput, GetSessionDetailOutput,
  UpdateSessionTitleInput, UpdateSessionTitleOutput,
  CheckSessionOverflowInput, CheckSessionOverflowOutput,
  GetChatHistoryInput, GetChatHistoryOutput,
  SearchMessageInput, SearchMessageOutput,
  PinMessageInput, PinMessageOutput,
  GetMessageGraphInput, GetMessageGraphOutput,
  ConfigChatInput, ConfigChatOutput,
  OpenChatStreamInput, OpenChatStreamOutput,
  type SSEEvent,
} from '../domain/types';

import {
  RunGatewayAccess,
  SseTransportEvent,
  SessionAccess,
  RunGatewayContext,
  SubmitRunInput,
  SubmitRunOutput,
  WaitRunInput,
  WaitRunOutput,
  AddSessionInput,
  AddSessionOutput,
  SessionContext,
} from '@brian-agent/runtime';

/** Chat v2 运行时依赖（Runtime v2 接线；缺省走旧编排链路） */
export interface ChatRuntimeV2Deps {
  gateway: RunGatewayAccess;
  session: SessionAccess;
}

export class ChatService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly logger?: Logger,
    private readonly streamAccess?: StreamAccess,
    private readonly runtime?: ChatRuntimeV2Deps,
  ) {}

  async openChatStream(
    input: OpenChatStreamInput,
    output: OpenChatStreamOutput,
    context: ChatContext,
    metrics?: Metrics,
    report?: Report,
    onEvent?: (event: SSEEvent) => void,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }
    if (!input.msg_content || input.msg_content.trim() === '') {
      throw new ValidationError('msg_content cannot be empty');
    }

    const sessionExists = await this.checkSessionExists(input.session_id);
    if (!sessionExists) {
      throw new NotFoundError('Session', input.session_id);
    }

    if (!this.runtime) {
      throw new ValidationError('Runtime v2 未装配（编排内核必需）');
    }
    // V1 编排链路已移除（2026-09-05）：openChatStream 即 v2 链路
    return this.openChatStreamV2(input, output, context, metrics, report, onEvent);
  }

  /** V1 旧链路已删除（v1 编排回退与 SSE 旧协议层已随 V1 移除） */
  private async legacyOpenChatStreamRemoved(): Promise<void> {}

  // -------------------------------------------------------------------------
  // Runtime v2 链路（业务事件经 Report→StreamProvider 推送到端点；保存/审计/断线恢复在 StreamProvider）
  // -------------------------------------------------------------------------

  /** v2 链路入口（逻辑控制）：生命周期事件 + 投影 + submitRun + waitRun + done */
  async openChatStreamV2(
    input: OpenChatStreamInput,
    output: OpenChatStreamOutput,
    context: ChatContext,
    metrics?: Metrics,
    report?: Report,
    onEvent?: (event: SSEEvent) => void,
  ): Promise<boolean> {
    const traceId = context.trace_id || IdGenerator.generate();
    context.trace_id = traceId;
    const events: SSEEvent[] = [];
    const emit = (event: string, data: Record<string, unknown>) => {
      const evt: SSEEvent = { event, data };
      events.push(evt);
      onEvent?.(evt);
    };
    const sessionId = input.session_id;
    await this.autoGenerateSessionTitleIfEmpty(sessionId, input.msg_content);
    emit(SseTransportEvent.Connected, { session_id: sessionId, trace_id: traceId });
    emit(SseTransportEvent.Loading, { work_id: sessionId });

    const runtime = this.runtime!;
    await this.autoGenerateSessionTitleIfEmpty(sessionId, input.msg_content);
    const overflowInput = Object.assign(new CheckSessionOverflowInput(), { session_id: sessionId });
    const overflowOutput = new CheckSessionOverflowOutput();
    await this.checkSessionOverflow(overflowInput, overflowOutput, context, metrics, report);
    if (overflowOutput.is_overflowed) {
      emit('error.occurred', { error_message: `Session ${sessionId} has exceeded message limit`, error_code: 'OVERFLOW' });
      output.events = events;
      return true;
    }
    const addIn = new AddSessionInput();
    addIn.session_key = sessionId;
    await runtime.session.addSession(addIn, new AddSessionOutput(), new SessionContext());

    // ===== Report 只负责接收业务的消息：携带 SSE 端点 ID，上报经 StreamProvider =====
    // 保存（stream_event 持久化/审计）、断线恢复重放、按端点 ID 定位 SSE 连接投递，
    // 全部由 StreamProvider 承载（v1 兼容事件名格式化亦在 StreamProvider 内）。
    const report2 = new Report({
      session_id: sessionId,
      session_key: sessionId,
      trace_id: traceId,
      stream_endpoint_id: input.stream_endpoint_id,
    });

    const submitIn = new SubmitRunInput();
    submitIn.session_key = sessionId;
    submitIn.session_id = sessionId;
    submitIn.user_message = input.msg_content;
    submitIn.interact_id = traceId;
    const submitOut = new SubmitRunOutput();
    await runtime.gateway.submitRun(submitIn, submitOut, new RunGatewayContext(), metrics, report2);
    const waitIn = new WaitRunInput();
    waitIn.run_id = submitOut.run_id;
    const waitOut = new WaitRunOutput();
    await runtime.gateway.waitRun(waitIn, waitOut, new RunGatewayContext(), metrics, report2);
    this.logger?.info?.('openChatStreamV2: run settled', { session_id: sessionId, run_id: submitOut.run_id, status: waitOut.status, stop_reason: waitOut.stop_reason });
    emit(SseTransportEvent.Done, { work_id: submitOut.run_id, interact_id: traceId, trace_id: traceId, elapsed_ms: 0, token_usage: {}, paused: false });
    output.events = events;
    return true;
  }

  /** 最终回复 → transcript text 分块（数据处理；2-5 字符打字机分块，与 StreamProvider 默认口径一致） */
  private chunkResponseForTranscript(text: string): string[] {
    const chunks: string[] = [];
    let offset = 0;
    while (offset < text.length) {
      const size = Math.min(text.length - offset, 2 + Math.floor(Math.random() * 4));
      chunks.push(text.slice(offset, offset + size));
      offset += size;
    }
    return chunks;
  }



  async createSession(input: CreateSessionInput, output: CreateSessionOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const sessionId = IdGenerator.generate();
    const now = IdGenerator.now();
    const title = input.session_title || '新会话';

    const data: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'session_id', value: sessionId },
      { field: 'session_title', value: title },
    ];

    const insInput = Object.assign(new InsertDBInput(), {
      table: 'chat_session',
      data,
    });
    await this.relationDb.insertDB(insInput, Object.assign(new InsertDBOutput(), {}), new DBContext());

    output.session_id = sessionId;
    output.session_title = title;
    output.created = now;
    return true;
  }

  async deleteSession(input: DeleteSessionInput, output: DeleteSessionOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.session_ids || input.session_ids.length === 0) {
      throw new ValidationError('session_ids must be a non-empty array');
    }

    let deletedCount = 0;

    for (const sessionId of input.session_ids) {
      try {
        // 1. 收集该会话下所有 info_id
        const infoRows = await this.relationDb.select('info_raw', {
          conditions: [{ field: 'session_id', operator: Operator.EQ, value: sessionId }],
          fields: ['info_id'],
        });
        const infoIds = infoRows.map((r) => String(r.info_id ?? '')).filter(Boolean);

        // 2. 删除按 info_id 关联的派生表（info_tag_vector 为全局标签向量，交由 orphan_tag_check 定时任务清理）
        if (infoIds.length > 0) {
          await this.relationDb.delete('info_tag', [
            { field: 'info_id', operator: Operator.IN, value: infoIds },
          ]);
          await this.relationDb.delete('info_summary', [
            { field: 'info_id', operator: Operator.IN, value: infoIds },
          ]);
          await this.relationDb.delete('info_keyword', [
            { field: 'info_id', operator: Operator.IN, value: infoIds },
          ]);
          await this.relationDb.delete('info_vector', [
            { field: 'info_id', operator: Operator.IN, value: infoIds },
          ]);
        }

        // 3. 删除主表与 GraphDB 引用节点/边
        await this.infoCore.delInfoGraph(Object.assign(new DelInfoGraphInput(), { info_ids: infoIds }), new DelInfoGraphOutput(), new InfoCoreContext());
        await this.relationDb.delete('info_raw', [
          { field: 'session_id', operator: Operator.EQ, value: sessionId },
        ]);
        const affected = await this.relationDb.delete('chat_session', [
          { field: 'session_id', operator: Operator.EQ, value: sessionId },
        ]);
        deletedCount += affected;
      } catch (err: unknown) {
        this.logger?.error?.('deleteSession: failed to delete session', {
          session_id: sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    output.deleted_count = deletedCount;
    return true;
  }

  async soSession(input: SearchSessionInput, output: SearchSessionOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const conditions: Condition[] = [];

    if (input.keyword) {
      const kw = `%${input.keyword}%`;
      const matchedRows = this.relationDb.queryRaw<{ session_id: string }>(
        `SELECT "session_id" FROM "chat_session" WHERE "session_title" LIKE ? UNION SELECT DISTINCT "session_id" FROM "info_raw" WHERE "info" LIKE ?`,
        [kw, kw],
      );
      const matchedIds = matchedRows.map((r) => r.session_id).filter(Boolean);
      if (matchedIds.length === 0) {
        output.sessions = [];
        output.total = 0;
        return true;
      }
      conditions.push({
        field: 'session_id',
        operator: Operator.IN,
        value: matchedIds,
      });
    }

    if (input.start_time !== undefined || input.end_time !== undefined) {
      const timeConds: string[] = [];
      const timeArgs: unknown[] = [];
      if (input.start_time !== undefined) {
        timeConds.push('"created" >= ?');
        timeArgs.push(input.start_time);
      }
      if (input.end_time !== undefined) {
        timeConds.push('"created" < ?');
        timeArgs.push(input.end_time);
      }
      const timeRows = this.relationDb.queryRaw<{ session_id: string }>(
        `SELECT DISTINCT "session_id" FROM "info_raw" WHERE ${timeConds.join(' AND ')}`,
        timeArgs,
      );
      const timeMatchedIds = timeRows.map((r) => r.session_id).filter(Boolean);
      if (timeMatchedIds.length === 0) {
        output.sessions = [];
        output.total = 0;
        return true;
      }
      conditions.push({
        field: 'session_id',
        operator: Operator.IN,
        value: timeMatchedIds,
      });
    }

    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'chat_session',
        conditions,
        order_by: input.order_by ? [
          { field: input.order_by.replace(/^-/, ''), direction: input.order_by.startsWith('-') ? 'DESC' : 'ASC' },
        ] : [{ field: 'updated', direction: 'DESC' }],
        page: { current: pageCurrent, size: pageSize },
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, selOutput, new DBContext());

    // ===== 新增：批量聚合会话统计（问答次数 / 字符数 / 标签 / token），避免逐会话 N+1 =====
    const sessionIds = selOutput.rows.map((r) => String(r.session_id ?? '')).filter(Boolean);
    const statMap = new Map<string, { qa_count: number; question_chars: number; answer_chars: number }>();
    const tagsMap = new Map<string, string[]>();
    const tokenMap = new Map<string, { input_tokens: number; output_tokens: number }>();

    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');

      try {
        const statRows = this.relationDb.queryRaw<{ session_id: string; qa_count: number; question_chars: number; answer_chars: number }>(
          `SELECT "session_id",
             SUM(CASE WHEN "info_type" = 'REQUEST' THEN 1 ELSE 0 END) AS qa_count,
             SUM(CASE WHEN "info_type" = 'REQUEST' THEN "info_length" ELSE 0 END) AS question_chars,
             SUM(CASE WHEN "info_type" = 'RESPONSE' THEN "info_length" ELSE 0 END) AS answer_chars
           FROM "info_raw" WHERE "session_id" IN (${placeholders}) GROUP BY "session_id"`,
          sessionIds,
        );
        for (const r of statRows) {
          statMap.set(String(r.session_id), {
            qa_count: Number(r.qa_count ?? 0) || 0,
            question_chars: Number(r.question_chars ?? 0) || 0,
            answer_chars: Number(r.answer_chars ?? 0) || 0,
          });
        }
      } catch {
        /* degrade gracefully */
      }

      try {
        const tagRows = this.relationDb.queryRaw<{ session_id: string; tag: string }>(
          `SELECT ir."session_id", t."tag"
           FROM "info_tag" t
           INNER JOIN "info_raw" ir ON t."info_id" = ir."info_id"
           WHERE ir."session_id" IN (${placeholders})
           GROUP BY ir."session_id", t."tag"`,
          sessionIds,
        );
        for (const r of tagRows) {
          const sid = String(r.session_id ?? '');
          const tag = String(r.tag ?? '').trim();
          if (!sid || !tag) continue;
          const list = tagsMap.get(sid) ?? [];
          if (!list.includes(tag)) list.push(tag);
          tagsMap.set(sid, list);
        }
      } catch {
        /* degrade gracefully */
      }

      try {
        const traceRows = this.relationDb.queryRaw<{ session_id: string; trace_id: string; iterations_json: string; total_token_usage: number }>(
          `SELECT ow."session_id", t."trace_id", t."iterations_json", t."total_token_usage"
           FROM "orchestration_work" ow
           INNER JOIN "orchestration_agent_execution" e ON ow."work_id" = e."work_id"
           INNER JOIN "agent_execution_trace" t ON e."trace_id" = t."trace_id" AND e."trace_id" IS NOT NULL AND e."trace_id" != ''
           WHERE ow."session_id" IN (${placeholders})
           GROUP BY ow."session_id", t."trace_id"`,
          sessionIds,
        );
        const seen = new Set<string>();
        for (const r of traceRows) {
          const sid = String(r.session_id ?? '');
          const traceId = String(r.trace_id ?? '');
          if (!sid || !traceId || seen.has(`${sid}:${traceId}`)) continue;
          seen.add(`${sid}:${traceId}`);
          let inputTokens = 0;
          let outputTokens = 0;
          try {
            const iterations = JSON.parse(r.iterations_json || '[]');
            if (Array.isArray(iterations)) {
              for (const it of iterations) {
                for (const key of ['think', 'reflect', 'answer']) {
                  const piece = it?.[key];
                  if (piece && typeof piece === 'object') {
                    inputTokens += Number(piece.input_tokens ?? 0) || 0;
                    outputTokens += Number(piece.output_tokens ?? 0) || 0;
                  }
                }
              }
            }
          } catch {
            /* ignore */
          }
          if (inputTokens === 0 && outputTokens === 0) {
            outputTokens = Number(r.total_token_usage ?? 0) || 0;
          }
          const cur = tokenMap.get(sid) ?? { input_tokens: 0, output_tokens: 0 };
          cur.input_tokens += inputTokens;
          cur.output_tokens += outputTokens;
          tokenMap.set(sid, cur);
        }
      } catch {
        /* degrade gracefully */
      }
    }

    const sessions: SearchSessionOutput['sessions'] = [];

    // 批量查询消息计数与最后消息，消除逐会话 N+1
    const countMap = new Map<string, number>();
    const lastMsgMap = new Map<string, { time: number; msg: string }>();
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      try {
        const cntRows = this.relationDb.queryRaw<{ session_id: string; cnt: number }>(
          `SELECT "session_id", COUNT(*) AS cnt FROM "info_raw" WHERE "session_id" IN (${placeholders}) GROUP BY "session_id"`,
          sessionIds,
        );
        for (const r of cntRows) countMap.set(String(r.session_id), Number(r.cnt));
      } catch { /* degrade gracefully */ }

      try {
        const lastRows = this.relationDb.queryRaw<{ session_id: string; created: number; info: string }>(
          `SELECT ir."session_id", ir."created", ir."info"
           FROM "info_raw" ir
           INNER JOIN (
             SELECT "session_id", MAX("created") AS max_created
             FROM "info_raw" WHERE "session_id" IN (${placeholders}) GROUP BY "session_id"
           ) latest ON ir."session_id" = latest."session_id" AND ir."created" = latest.max_created`,
          sessionIds,
        );
        for (const r of lastRows) {
          lastMsgMap.set(String(r.session_id), { time: Number(r.created), msg: String(r.info ?? '') });
        }
      } catch { /* degrade gracefully */ }
    }

    for (const row of selOutput.rows) {
      const sessionId = row.session_id as string;

      const countInfo = countMap.get(sessionId);
      const messageCount = countInfo ?? 0;
      const lastInfo = lastMsgMap.get(sessionId);
      const lastMessageTime = lastInfo?.time ?? 0;
      const lastMessage = lastInfo?.msg ?? '';

      const stat = statMap.get(sessionId) ?? { qa_count: 0, question_chars: 0, answer_chars: 0 };
      const token = tokenMap.get(sessionId) ?? { input_tokens: 0, output_tokens: 0 };

      sessions.push({
        session_id: sessionId,
        session_title: (row.session_title as string) ?? '',
        message_count: messageCount,
        last_message_time: lastMessageTime,
        last_message: lastMessage || (row.session_title as string) || '',
        created: (row.created as number) ?? 0,
        updated: (row.updated as number) ?? 0,
        qa_count: stat.qa_count,
        question_chars: stat.question_chars,
        answer_chars: stat.answer_chars,
        input_tokens: token.input_tokens,
        output_tokens: token.output_tokens,
        tags: tagsMap.get(sessionId) ?? [],
      });
    }

    let total = 0;
    try {
      const totalInput = Object.assign(new CountDBInput(), {
        table: 'chat_session',
        conditions,
      });
      const totalOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(totalInput, totalOutput, new DBContext());
      total = totalOutput.count;
    } catch {
      /* degrade gracefully */
    }

    output.sessions = sessions;
    output.total = total;
    return true;
  }

  async soSessionDetail(input: GetSessionDetailInput, output: GetSessionDetailOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'chat_session',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());

    if (!selOutput.row) {
      throw new NotFoundError('Session', input.session_id);
    }

    let messageCount = 0;
    try {
      const cntInput = Object.assign(new CountDBInput(), {
        table: 'info_raw',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        ] as Condition[],
      });
      const cntOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(cntInput, cntOutput, new DBContext());
      messageCount = cntOutput.count;
    } catch {
      /* degrade gracefully */
    }

    output.session = {
      ...selOutput.row,
      message_count: messageCount,
    };
    return true;
  }

  async updateSessionTitle(input: UpdateSessionTitleInput, _output: UpdateSessionTitleOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }
    if (!input.session_title || input.session_title.trim() === '') {
      throw new ValidationError('session_title cannot be empty');
    }

    const data: DataObject[] = [
      { field: 'session_title', value: input.session_title.trim() },
      { field: 'updated', value: IdGenerator.now() },
    ];

    const updInput = Object.assign(new UpdateDBInput(), {
      table: 'chat_session',
      data,
      conditions: [
        { field: 'session_id', operator: Operator.EQ, value: input.session_id },
      ] as Condition[],
    });
    const updOutput = Object.assign(new UpdateDBOutput(), {});
    await this.relationDb.updateDB(updInput, updOutput, new DBContext());

    if (updOutput.affected_rows === 0) {
      throw new NotFoundError('Session', input.session_id);
    }

    return true;
  }

  async checkSessionOverflow(input: CheckSessionOverflowInput, output: CheckSessionOverflowOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    let maxMessages = 1000;
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'chat_config' },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());
      if (selOutput.row) {
        maxMessages = (selOutput.row.max_messages_per_session as number) ?? 1000;
      }
    } catch {
      /* use default */
    }

    let messageCount = 0;
    try {
      const cntInput = Object.assign(new CountDBInput(), {
        table: 'info_raw',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        ] as Condition[],
      });
      const cntOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(cntInput, cntOutput, new DBContext());
      messageCount = cntOutput.count;
    } catch {
      /* degrade gracefully */
    }

    output.is_overflowed = messageCount >= maxMessages;
    output.message_count = messageCount;
    output.max_messages = maxMessages;
    return true;
  }

  async soChatHistory(input: GetChatHistoryInput, output: GetChatHistoryOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    let lastN = input.lastN;
    if (lastN === undefined) {
      lastN = 50;
      try {
        const selInput = Object.assign(new SelectOneDBInput(), {
          query_param: { table: 'chat_config' },
        });
        const selOutput = Object.assign(new SelectOneDBOutput(), {});
        await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());
        if (selOutput.row) {
          lastN = (selOutput.row.default_history_lastN as number) ?? 50;
        }
      } catch {
        /* use default */
      }
    }

    const lastNInput = Object.assign(new LastNInfoInput(), {
      session_id: input.session_id,
      work_id: input.work_id,
      interact_id: input.interact_id,
      lastN,
    });
    const lastNOutput = new LastNInfoOutput();
    await this.infoCore.lastNInfo(
      lastNInput,
      lastNOutput,
      new InfoCoreContext(),
    );

    const messages: GetChatHistoryOutput['messages'] = [];
    const allRows = lastNOutput.list;

    let start = 0;
    let end = allRows.length;

    if (input.page_current !== undefined && input.page_size !== undefined) {
      start = (input.page_current - 1) * input.page_size;
      end = start + input.page_size;
      if (start < 0) start = 0;
      if (end > allRows.length) end = allRows.length;
    }

    const pageRows = allRows.slice(start, end);

    let graphRows: Array<{ citing_info_id: string; cited_info_id: string }> = [];
    try {
      const citeOut = new SoCitationEdgesOutput();
      await this.infoCore.soCitationEdges(new SoCitationEdgesInput(), citeOut, new InfoCoreContext());
      graphRows = citeOut.edges;
    } catch { /* degrade gracefully */ }

    for (const row of pageRows) {
      const citingInfoIds: string[] = [];
      const citedInfoIds: string[] = [];

      for (const g of graphRows) {
        const citing = g.citing_info_id;
        const cited = g.cited_info_id;
        if (cited === row.info_id && citing) {
          citingInfoIds.push(citing);
        }
        if (citing === row.info_id && cited) {
          citedInfoIds.push(cited);
        }
      }

      messages.push({
        info_id: row.info_id,
        info_type: row.info_type,
        info_creator_role: row.info_creator_role,
        info: row.info,
        created: row.created,
        pin: row.pin === 1,
        work_id: row.work_id,
        interact_id: row.interact_id,
        trace_id: row.trace_id,
        citing_count: citingInfoIds.length,
        cited_count: citedInfoIds.length,
        citing_info_ids: [...new Set(citingInfoIds)],
        cited_info_ids: [...new Set(citedInfoIds)],
      });
    }

    output.messages = messages;
    output.total = allRows.length;
    return true;
  }

  async soMessage(input: SearchMessageInput, output: SearchMessageOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.keyword || input.keyword.trim() === '') {
      throw new ValidationError('keyword cannot be empty');
    }

    const kwInput = Object.assign(new KeywordKInfoInput(), {
      info: input.keyword,
    });
    const kwOutput = new KeywordKInfoOutput();
    await this.infoCore.keywordKInfo(
      kwInput,
      kwOutput,
      new InfoCoreContext(),
    );

    let filteredList = kwOutput.list;
    if (input.session_id) {
      filteredList = filteredList.filter((r) => r.session_id === input.session_id);
    }

    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;
    const start = (pageCurrent - 1) * pageSize;
    const pageList = filteredList.slice(start, start + pageSize);

    const messages: SearchMessageOutput['messages'] = [];

    for (const row of pageList) {
      let summary = '';
      try {
        const selInput = Object.assign(new SelectOneDBInput(), {
          query_param: {
            table: 'info_summary',
            conditions: [
              { field: 'info_id', operator: Operator.EQ, value: row.info_id },
            ] as Condition[],
          },
        });
        const selOutput = Object.assign(new SelectOneDBOutput(), {});
        await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());
        if (selOutput.row) {
          summary = (selOutput.row.summary as string) ?? '';
        }
      } catch {
        /* degrade gracefully */
      }

      messages.push({
        info_id: row.info_id,
        info_type: row.info_type,
        info_creator_role: row.info_creator_role,
        info: row.info,
        summary,
        created: row.created,
        session_id: row.session_id,
      });
    }

    output.messages = messages;
    output.total = filteredList.length;
    return true;
  }

  async pinMessage(input: PinMessageInput, output: PinMessageOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('info_id is required');
    }

    let currentPin = false;
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'info_raw',
          conditions: [
            { field: 'info_id', operator: Operator.EQ, value: input.info_id },
          ] as Condition[],
        },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());
      if (selOutput.row) {
        currentPin = (selOutput.row.pin as number) === 1;
      }
    } catch {
      /* degrade gracefully */
    }

    try {
      const pinInput = Object.assign(new PinInfoInput(), {
        info_id: input.info_id,
      });
      await this.infoCore.pinInfo(
        pinInput,
        new PinInfoOutput(),
        new InfoCoreContext(),
      );
      output.pin = !currentPin;
    } catch (err: unknown) {
      this.logger?.error?.('pinMessage: failed to pin info', {
        info_id: input.info_id,
        error: err instanceof Error ? err.message : String(err),
      });
      output.pin = currentPin;
      return false;
    }

    return true;
  }

  async soMessageGraph(input: GetMessageGraphInput, output: GetMessageGraphOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }

    const graphInput = Object.assign(new GraphInfoInput(), {
      session_id: input.session_id,
    });
    const graphOutput = new GraphInfoOutput();
    await this.infoCore.graphInfo(
      graphInput,
      graphOutput,
      new InfoCoreContext(),
    );

    output.graph_structure = {
      nodes: graphOutput.graph.nodes,
      edges: graphOutput.graph.edges,
    };

    return true;
  }

  async configChat(input: ConfigChatInput, output: ConfigChatOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'chat_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());

    const current = (selOutput.row ?? {}) as Record<string, unknown>;
    const id = (current.id as string) || 'chat_config_default';
    const data: DataObject[] = [
      { field: 'id', value: id },
      { field: 'updated', value: IdGenerator.now() },
    ];

    if (input.max_messages_per_session !== undefined) {
      if (input.max_messages_per_session <= 0) {
        throw new ValidationError('max_messages_per_session must be positive');
      }
      data.push({ field: 'max_messages_per_session', value: input.max_messages_per_session });
    }

    if (input.sse_heartbeat_interval_ms !== undefined) {
      if (input.sse_heartbeat_interval_ms <= 0) {
        throw new ValidationError('sse_heartbeat_interval_ms must be positive');
      }
      data.push({ field: 'sse_heartbeat_interval_ms', value: input.sse_heartbeat_interval_ms });
    }

    if (input.default_history_lastN !== undefined) {
      if (input.default_history_lastN <= 0) {
        throw new ValidationError('default_history_lastN must be positive');
      }
      data.push({ field: 'default_history_lastN', value: input.default_history_lastN });
    }

    if (data.length > 2) {
      const updInput = Object.assign(new UpdateDBInput(), {
        table: 'chat_config',
        data,
        conditions: [
          { field: 'id', operator: Operator.EQ, value: id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());
    }

    const outConfig: Record<string, unknown> = {};
    for (const key of Object.keys(current)) {
      outConfig[key] = current[key];
    }
    if (input.max_messages_per_session !== undefined) {
      outConfig.max_messages_per_session = input.max_messages_per_session;
    }
    if (input.sse_heartbeat_interval_ms !== undefined) {
      outConfig.sse_heartbeat_interval_ms = input.sse_heartbeat_interval_ms;
    }
    if (input.default_history_lastN !== undefined) {
      outConfig.default_history_lastN = input.default_history_lastN;
    }

    output.config = outConfig;
    return true;
  }

  private async autoGenerateSessionTitleIfEmpty(sessionId: string, msgContent: string): Promise<void> {
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'chat_session',
          conditions: [
            { field: 'session_id', operator: Operator.EQ, value: sessionId },
          ] as Condition[],
        },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());

      if (selOutput.row) {
        const currentTitle = (selOutput.row.session_title as string) ?? '';
        if (!currentTitle || currentTitle.trim() === '' || currentTitle.trim() === '新会话') {
          const autoTitle = msgContent.trim().slice(0, 50);
          if (autoTitle) {
            const updInput = Object.assign(new UpdateSessionTitleInput(), {
              session_id: sessionId,
              session_title: autoTitle,
            });
            await this.updateSessionTitle(updInput, new UpdateSessionTitleOutput(), new ChatContext());
          }
        }
      }
    } catch {
      /* best effort */
    }
  }

  private async checkSessionExists(sessionId: string): Promise<boolean> {
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'chat_session',
          conditions: [
            { field: 'session_id', operator: Operator.EQ, value: sessionId },
          ] as Condition[],
        },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());
      return selOutput.row != null;
    } catch {
      return false;
    }
  }

}
