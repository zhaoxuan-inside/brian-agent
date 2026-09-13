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
  SaveInfoInput, SaveInfoOutput,
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
    // trace_id 属维护字段：唯一承载点 = Metrics（AOP 已生成/回填）；无则本地生成回填
    const traceId = metrics?.trace_id || IdGenerator.generate();
    if (metrics) {
      metrics.trace_id = traceId;
    }
    const events: SSEEvent[] = [];
    const emit = (event: string, data: Record<string, unknown>) => {
      const evt: SSEEvent = { event, data };
      events.push(evt);
      onEvent?.(evt);
    };
    const sessionId = input.session_id;
    // ===== 修改后（2026-09-11）：删除重复的 autoGenerateSessionTitleIfEmpty 调用 =====
    // 原实现在 openChatStreamV2 内对同一次请求调用了两次（submitRun 前，仅隔一次 emit），
    // 每次多做一次 chat_session 查询往返；title 只依赖首次写入，保留 Connected 前一次即可。
    // 原代码：
    //   await this.autoGenerateSessionTitleIfEmpty(sessionId, input.msg_content);
    //   emit Connected / Loading
    //   const runtime = this.runtime!;
    //   await this.autoGenerateSessionTitleIfEmpty(sessionId, input.msg_content);   ← 重复调用（已删）
    await this.autoGenerateSessionTitleIfEmpty(sessionId, input.msg_content);
    emit(SseTransportEvent.Connected, { session_id: sessionId, trace_id: traceId });
    emit(SseTransportEvent.Loading, { work_id: sessionId });

    const runtime = this.runtime!;

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
    const addOut = new AddSessionOutput();
    await runtime.session.addSession(addIn, addOut, new SessionContext(), metrics);
    const runtimeSessionId = addOut.session_id;

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
    waitIn.timeout_ms = 300_000;
    const waitOut = new WaitRunOutput();
    await runtime.gateway.waitRun(waitIn, waitOut, new RunGatewayContext(), metrics, report2);
    // ===== 修改后（2026-09-09）：日志携带 trace_id，保证"复制 TraceId"的 id 能在监控页（log_record.trace_id）按交互关联 =====
    // 原代码：meta 未含 trace_id（直连 logger 绕过 Metrics.merge 的自动盖章），log_record.trace_id 恒 NULL，
    // 复制的 TraceId 在监控页查不到任何记录，id 失去关联语义。
    this.logger?.info?.('openChatStreamV2: run settled', {
      session_id: sessionId,
      run_id: submitOut.run_id,
      status: waitOut.status,
      stop_reason: waitOut.stop_reason,
      trace_id: traceId,
      interact_id: traceId,
      work_id: submitOut.run_id,
    });

    // Runtime v2 消息持久化在 runtime_message 表，同步到 info_raw 供 chat history 读取
    await this.syncRuntimeMessagesToInfoRaw(runtimeSessionId, sessionId, submitOut.run_id, traceId, metrics);

    const totalElapsed = typeof metrics?.getTotalDuration === 'function' ? metrics.getTotalDuration() : (metrics?.elapsed_ms ?? 0);
    if (waitOut.status === 'running') {
      emit('error.occurred', { error_message: '系统问答超时（5 分钟），请稍后重试', error_code: 'RUN_TIMEOUT', run_id: submitOut.run_id });
    } else {
      emit(SseTransportEvent.Done, { work_id: submitOut.run_id, interact_id: traceId, trace_id: traceId, elapsed_ms: totalElapsed, token_usage: {}, paused: false });
    }
    output.events = events;
    return true;
  }

  /**
   * 将 Runtime v2 的 runtime_message 表消息同步到 info_raw 表，
   * 供 chat history（soChatHistory）读取。
   *
   * ===== 修改后（2026-09-09）：修复对话区重复上一轮内容 =====
   * 原问题（事故：会话 fb3efe8f，trace 5f24881f / 0c92601f）：
   * 1. 原实现按 session 全量重读 runtime_message，每轮结束都把历史消息重抄一遍；
   *    去重条件 (session_id, info, created=保存时刻) 与 runtime_message.created 恒不相等，
   *    判重必然失败 → 历史问答被重复插入 info_raw，对话区反复出现上一轮内容，
   *    且旧消息被盖上本轮 traceId（interact_id 污染）。
   * 2. 空内容占位行（run 未回复完成时 assistant 行 content=''）会令 saveInfo 抛
   *    ValidationError，异常中断整个同步循环，后续消息漏同步。
   * 修改后：
   * 1. 仍按会话读取（便于超时后迟到的最终回复在下一轮补齐），但去重键改为
   *    (work_id, info_type, info)——与 created 无关，历史旧数据（created=保存时刻）
   *    也能正确判重，不再产生重复行；读取上限 200 条防成本膨胀。
   * 2. 跳过空内容行（continue 而非中断）。
   * 3. 已落库集合一次查询载入内存，避免逐条 COUNT 的 N+1 查询。
   * 注：迟到补齐的历史行会带上当轮 traceId（interact_id），work_id 仍为其原 run，
   * 历史按 work_id 分组展示不受影响。
   */
  private async syncRuntimeMessagesToInfoRaw(runtimeSessionId: string, chatSessionId: string, runId: string, traceId: string, metrics?: Metrics): Promise<void> {
    try {
      // ===== 原始代码（保留作为参考）=====
      // const rows = this.relationDb.queryRaw<{ id: string; role: string; content: string; created: number; run_id: string }>(
      //   `SELECT * FROM "runtime_message" WHERE "session_id" = ? ORDER BY "seq" ASC`,
      //   [runtimeSessionId],
      // );
      // for (const msg of rows) {
      //   const existing = this.relationDb.queryRaw<{ cnt: number }>(
      //     `SELECT COUNT(*) AS cnt FROM "info_raw" WHERE "session_id" = ? AND "info" = ? AND "created" = ?`,
      //     [chatSessionId, msg.content, msg.created],
      //   );
      //   if (existing?.[0]?.cnt > 0) continue;
      //   ...
      //   await this.infoCore.saveInfo(saveInput, saveOutput, new InfoCoreContext());  // 未传 created
      // }
      // 倒序取最近 200 条后反转为时间序（限制全量重读成本）
      const rows = this.relationDb.queryRaw<{ id: string; role: string; content: string; created: number; run_id: string }>(
        `SELECT "id", "role", "content", "created", "run_id" FROM "runtime_message" WHERE "session_id" = ? ORDER BY "seq" DESC LIMIT 200`,
        [runtimeSessionId],
      );
      if (!rows || rows.length === 0) return;
      rows.reverse();

      // 已落库消息集合一次载入（key: work_id|info_type|info），替代逐条 COUNT
      const existingRows = this.relationDb.queryRaw<{ work_id: string; info_type: string; info: string }>(
        `SELECT "work_id", "info_type", "info" FROM "info_raw" WHERE "session_id" = ?`,
        [chatSessionId],
      );
      const existingKeys = new Set<string>(
        (existingRows ?? []).map((r) => `${r.work_id || ''}\u0001${r.info_type || ''}\u0001${r.info || ''}`),
      );

      // ===== 新增（2026-09-12）：中间轮 assistant 消息不同步到对话框 =====
      // Loop 每轮（连同含 tool_calls 的中间轮）都持久化 assistant 消息，原来
      // "好的，我来帮你查一下…"等多条 RESPONSE 会在历史对话区各占一个气泡。
      // 现只同步每 run 的最终回复：含 tool Part 的中间轮消息跳过；每 run 最后一条
      // assistant 消息兜底保留（预算耗尽/异常导致无纯文本最终轮时仍有 RESPONSE）。
      // wire 历史走 runtime_* 表，不受此显示侧过滤影响。
      const runIds = Array.from(new Set(rows.map((r) => r.run_id).filter(Boolean)));
      let toolMsgIds = new Set<string>();
      if (runIds.length > 0) {
        const placeholders = runIds.map(() => '?').join(',');
        const partRows = this.relationDb.queryRaw<{ message_id: string }>(
          `SELECT DISTINCT "message_id" FROM "runtime_message_part" WHERE "run_id" IN (${placeholders}) AND "part_type" = 'tool'`,
          runIds,
        );
        toolMsgIds = new Set((partRows ?? []).map((r) => r.message_id));
      }
      const lastAssistantIdxByRun = new Map<string, number>();
      rows.forEach((m, i) => {
        if (m.role !== 'user') lastAssistantIdxByRun.set(m.run_id || runId, i);
      });

      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const msg = rows[rowIdx];
        // 空内容占位行（如 run 超时未回复的 assistant 行）跳过，不落库也不中断
        if (!msg.content || msg.content.trim() === '') continue;
        // 中间轮叙述跳过（兜底保留每 run 最后一条）
        if (msg.role !== 'user' && toolMsgIds.has(msg.id) && rowIdx !== lastAssistantIdxByRun.get(msg.run_id || runId)) continue;

        const infoType = msg.role === 'user' ? 'REQUEST' : 'RESPONSE';
        const infoCreatorRole = msg.role === 'user' ? 'USER' : 'ASSISTANT';
        const workId = msg.run_id || runId;
        const dedupKey = `${workId}\u0001${infoType}\u0001${msg.content}`;
        if (existingKeys.has(dedupKey)) continue;
        existingKeys.add(dedupKey);

        const saveInput = new SaveInfoInput();
        saveInput.session_id = chatSessionId;
        saveInput.work_id = workId;
        saveInput.interact_id = traceId;
        saveInput.info_type = infoType;
        saveInput.info_creator_role = infoCreatorRole;
        saveInput.info = msg.content;
        // 携带 runtime_message 的真实创建时间：保证 user 先于 assistant 的时序，
        // 历史查询 ORDER BY created 顺序稳定（否则对话区顺序错乱）。
        saveInput.created = Number(msg.created) > 0 ? Number(msg.created) : undefined;
        const saveOutput = new SaveInfoOutput();
        await this.infoCore.saveInfo(saveInput, saveOutput, new InfoCoreContext(), metrics);
      }
    } catch (err: unknown) {
      this.logger?.warn?.('syncRuntimeMessagesToInfoRaw: 同步失败（不影响 SSE 流）', {
        session_id: chatSessionId,
        trace_id: traceId,
        interact_id: traceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
