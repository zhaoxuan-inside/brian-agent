import { Metrics, Report } from '@brian-agent/base';
import {
  RelationDBAccess, InsertDBInput, InsertDBOutput,
  SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  CountDBInput, CountDBOutput,
  DataObject, DBContext,
  IdGenerator, ValidationError, NotFoundError, Operator, Logic,
  type Logger, type Condition,
  type StreamAccess,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  LastNInfoInput, LastNInfoOutput,
  GraphInfoInput, GraphInfoOutput,
  SoCitationEdgesInput, SoCitationEdgesOutput,
  // ===== 新增（2026-09-15 记忆集中）：会话级记忆删除统一走 InfoCore =====
  DelInfoBySessionInput, DelInfoBySessionOutput,
  KeywordKInfoInput, KeywordKInfoOutput,
  PinInfoInput, PinInfoOutput,
  SaveInfoInput, SaveInfoOutput,
  InfoCoreContext,
} from '@brian-agent/core';
import {
  ChatContext,
  CreateSessionInput, CreateSessionOutput,
  DeleteSessionInput, DeleteSessionOutput,
  PurgeOrphanSessionsInput, PurgeOrphanSessionsOutput,
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
  toSessionSummaries,
  toTraceTokenUsage,
  type SessionAggregateMaps,
} from '../domain/services/SessionSearchDomainService';

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
  RUNTIME_SESSION_TABLE,
  RUNTIME_MESSAGE_TABLE,
  RUNTIME_MESSAGE_PART_TABLE,
  RUNTIME_RUN_TABLE,
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
    await this.autoGenerateSessionTitleIfEmpty(sessionId, input.msg_content, metrics);
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
    const submitOut = new SubmitRunOutput();
    await runtime.gateway.submitRun(submitIn, submitOut, new RunGatewayContext(), metrics, report2);
    // ===== 修改后（2026-09-14 业务/可观测 ID 分离）：run_id 属问答业务维度（= runtime_run.id，一次问答），
    // 不再借用 traceId；trace_id 属可观测体系，仍由 traceId 单独承载 =====
    const runId = submitOut.run_id;
    // ===== 新增（2026-09-15 分析 trace 1a688f04 修复①）：用户消息 REQUEST 立即落 info_raw。
    //      原先 REQUEST 只在 run 结算后随 syncRuntimeMessagesToInfoRaw 补齐，Writer 构建上下文
    //      （run 内最后一步）时时间线恒空 → 快照无 TIMELINE/CURRENT，本次输入缺失。
    //      运行结束后的同步仍执行，靠 work_id|info_type|info 去重键幂等，不会落双行 =====
    try {
      const earlySaveInput = new SaveInfoInput();
      earlySaveInput.session_id = sessionId;
      earlySaveInput.work_id = runId;
      earlySaveInput.run_id = runId;
      earlySaveInput.info_type = 'REQUEST';
      earlySaveInput.info_creator_role = 'USER';
      earlySaveInput.info = input.msg_content;
      earlySaveInput.trace_id = traceId;
      await this.infoCore.saveInfo(earlySaveInput, new SaveInfoOutput(), new InfoCoreContext(), metrics);
    } catch { /* best-effort：失败不影响问答，稍后由同步补齐 */ }
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
      run_id: runId,
      status: waitOut.status,
      stop_reason: waitOut.stop_reason,
      trace_id: traceId,
      work_id: submitOut.run_id,
    });

    // Runtime v2 消息持久化在 runtime_message 表，同步到 info_raw 供 chat history 读取
    await this.syncRuntimeMessagesToInfoRaw(runtimeSessionId, sessionId, submitOut.run_id, traceId, metrics);

    const totalElapsed = typeof metrics?.getTotalDuration === 'function' ? metrics.getTotalDuration() : (metrics?.elapsed_ms ?? 0);
    if (waitOut.status === 'running') {
      emit('error.occurred', { error_message: '系统问答超时（5 分钟），请稍后重试', error_code: 'RUN_TIMEOUT', run_id: submitOut.run_id });
    } else {
      emit(SseTransportEvent.Done, { run_id: runId, trace_id: traceId, elapsed_ms: totalElapsed, token_usage: {}, paused: false });
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
   *    且旧消息被盖上本轮 traceId（run_id 污染）。
   * 2. 空内容占位行（run 未回复完成时 assistant 行 content=''）会令 saveInfo 抛
   *    ValidationError，异常中断整个同步循环，后续消息漏同步。
   * 修改后：
   * 1. 仍按会话读取（便于超时后迟到的最终回复在下一轮补齐），但去重键改为
   *    (work_id, info_type, info)——与 created 无关，历史旧数据（created=保存时刻）
   *    也能正确判重，不再产生重复行；读取上限 200 条防成本膨胀。
   * 2. 跳过空内容行（continue 而非中断）。
   * 3. 已落库集合一次查询载入内存，避免逐条 COUNT 的 N+1 查询。
    * 注：迟到补齐的历史行会带上当轮 traceId（run_id），work_id 仍为其原 run，
    * 历史按 work_id 分组展示不受影响。
    * ===== 修改后（2026-09-14 业务/可观测 ID 分离）：run_id 属问答业务维度（= runtime_run.id），
    * 落库时取 workId（其原 run），不再借用 traceId；trace_id 仍按源头治理规则取 runtime_run.trace_id。
    */
  private async syncRuntimeMessagesToInfoRaw(runtimeSessionId: string, chatSessionId: string, runId: string, traceId: string, metrics?: Metrics): Promise<void> {
    try {
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
      // ===== 修改后（2026-09-14 trace 源头治理）：历史行不再盖当轮 traceId =====
      // 原行为：迟到补齐的历史行（本轮之外的 run）也被盖上当轮 traceId，造成
      // "两次提问 traceId 相同"的污染（事故 trace 989acae9：上一轮 run 因进程重启
      // 未及自身同步，本轮补齐时被盖上本轮 trace）。
      // 修改后：每行按其原 run 反查 runtime_run.trace_id（run 受理时已持久化源头
      // trace），查不到则留空，绝不伪造当轮 trace。
      let toolMsgIds = new Set<string>();
      if (runIds.length > 0) {
        const placeholders = runIds.map(() => '?').join(',');
        const partRows = this.relationDb.queryRaw<{ msg_id: string }>(
          `SELECT DISTINCT "msg_id" FROM "runtime_message_part" WHERE "run_id" IN (${placeholders}) AND "part_type" = 'tool'`,
          runIds,
        );
        toolMsgIds = new Set((partRows ?? []).map((r) => r.msg_id));
      }
      const runTraceMap = new Map<string, string>();
      if (runIds.length > 0) {
        const placeholders = runIds.map(() => '?').join(',');
        const runRows = this.relationDb.queryRaw<{ id: string; trace_id: string }>(
          `SELECT "id", "trace_id" FROM "runtime_run" WHERE "id" IN (${placeholders})`,
          runIds,
        );
        for (const r of runRows ?? []) {
          if (r.trace_id) runTraceMap.set(String(r.id), String(r.trace_id));
        }
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
        // 源头 trace 治理：行 trace 一律取其所属 run 受理时落库的 runtime_run.trace_id
        //（含 steer 合流 run：全部消息归因到受理源头 trace）；runtime_run 无记录时，
        // 当轮 run 行沿用本轮 trace 兜底，历史 run 补齐行显式置 ''，绝不盖当轮 trace。
        const rowTraceId = runTraceMap.get(workId) ?? (workId === runId ? traceId : '');
        saveInput.trace_id = rowTraceId;
        saveInput.run_id = workId;
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
        run_id: runId,
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
        // ===== 新增（2026-09-21 反馈级联删除）：随会话删除关联的反馈数据 =====
        // 反馈表（feedback_record / feedback_process_log）以 run_id（对话轮次，
        // 关联 runtime_run.id）和 work_id（作品/任务，关联 info_raw.work_id）引用
        // 会话内容。此前会话删除后这些引用全部失效，监控页残留「无法关联任何内容」
        // 的孤儿反馈（只剩一串 ID）。故在删除会话数据**之前**先收集两类引用
        // （info_raw / runtime_run 马上会被下方步骤删除），再按 run_id / work_id
        // 级联删除反馈。表名按名引用（同 writer_agent_user_profile 惯例，
        // 避免 Application → Base 的运行时耦合）；失败静默跳过不阻塞会话删除。
        try {
          const fbRunRows = await this.relationDb.select(RUNTIME_RUN_TABLE, {
            conditions: [{ field: 'session_key', operator: Operator.EQ, value: sessionId }],
            fields: ['id'],
          });
          const fbRunIds = fbRunRows.map(r => String(r.id ?? '')).filter(Boolean);
          const fbWorkRows = await this.relationDb.select('info_raw', {
            conditions: [{ field: 'session_id', operator: Operator.EQ, value: sessionId }],
            fields: ['work_id'],
          });
          const fbWorkIds = [...new Set(fbWorkRows.map(r => String(r.work_id ?? '')).filter(Boolean))];
          if (fbRunIds.length > 0 || fbWorkIds.length > 0) {
            const fbConds: Condition[] = [];
            if (fbRunIds.length > 0) fbConds.push({ field: 'run_id', operator: Operator.IN, value: fbRunIds });
            if (fbWorkIds.length > 0) fbConds.push({ field: 'work_id', operator: Operator.IN, value: fbWorkIds, logic: Logic.OR });
            await this.relationDb.delete('feedback_record', fbConds);
            await this.relationDb.delete('feedback_process_log', fbConds);
          }
        } catch (fbErr: unknown) {
          this.logger?.warn?.('deleteSession: 反馈数据级联清理失败（已跳过）', {
            session_id: sessionId,
            error: fbErr instanceof Error ? fbErr.message : String(fbErr),
          });
        }

        // ===== 修改后：记忆删除统一收敛 InfoCoreProvider.delInfoBySession（含派生表 / 上下文快照 / GraphDB 级联），
        //      chat_session / runtime_ / stream_event 等非记忆表仍由本层负责 =====
        const delInput = new DelInfoBySessionInput();
        delInput.session_id = sessionId;
        const delOutput = new DelInfoBySessionOutput();
        await this.infoCore.delInfoBySession(delInput, delOutput, new InfoCoreContext(), _metrics);

        const affected = await this.relationDb.delete('chat_session', [
          { field: 'session_id', operator: Operator.EQ, value: sessionId },
        ]);
        deletedCount += affected;

        // ===== 新增（2026-09-21 会话删除关联数据同步）：WriterAgent 会话级写作偏好
        // （writer_agent_user_profile.session_id 唯一）此前随会话删除后残留为孤儿数据，
        // 导致会话重新创建/复用同 id 时读取到陈旧偏好；此处随会话同步清理。
        // 表名按名引用，避免 Application → Agent 的运行时耦合；表不存在时静默跳过 =====
        try {
          await this.relationDb.delete('writer_agent_user_profile', [
            { field: 'session_id', operator: Operator.EQ, value: sessionId },
          ]);
        } catch (prefErr: unknown) {
          this.logger?.warn?.('deleteSession: writer_agent_user_profile 清理失败（已跳过）', {
            session_id: sessionId,
            error: prefErr instanceof Error ? prefErr.message : String(prefErr),
          });
        }

        // ===== 新增（2026-09-15）：思考过程/耗时统计生命周期跟随问答 —— 删除会话时
        // 一并清理事件流（stream_event，思考过程时间线的持久事实源）与 Runtime 派生表
        // （runtime_run / runtime_message_part / runtime_message / runtime_session，
        //  Part 含 elapsed_ms 耗时与思考内容）；不存在时静默跳过 =====
        try {
          await this.relationDb.delete('stream_event', [
            { field: 'session_key', operator: Operator.EQ, value: sessionId },
          ]);
          await this.relationDb.delete(RUNTIME_RUN_TABLE, [
            { field: 'session_key', operator: Operator.EQ, value: sessionId },
          ]);
          // Runtime 派生数据以 runtime_session.session_key = 问答会话 id 关联
          const runtimeSessions = await this.relationDb.select(RUNTIME_SESSION_TABLE, {
            conditions: [{ field: 'session_key', operator: Operator.EQ, value: sessionId }],
            fields: ['id'],
          });
          const runtimeSessionIds = runtimeSessions.map((r) => String(r.id ?? '')).filter(Boolean);
          if (runtimeSessionIds.length > 0) {
            const runtimeMessages = await this.relationDb.select(RUNTIME_MESSAGE_TABLE, {
              conditions: [{ field: 'session_id', operator: Operator.IN, value: runtimeSessionIds }],
              fields: ['id'],
            });
            const runtimeMessageIds = runtimeMessages.map((r) => String(r.id ?? '')).filter(Boolean);
            if (runtimeMessageIds.length > 0) {
              await this.relationDb.delete(RUNTIME_MESSAGE_PART_TABLE, [
                { field: 'msg_id', operator: Operator.IN, value: runtimeMessageIds },
              ]);
            }
            await this.relationDb.delete(RUNTIME_MESSAGE_TABLE, [
              { field: 'session_id', operator: Operator.IN, value: runtimeSessionIds },
            ]);
            await this.relationDb.delete(RUNTIME_SESSION_TABLE, [
              { field: 'session_key', operator: Operator.EQ, value: sessionId },
            ]);
          }
        } catch (cleanupErr: unknown) {
          this.logger?.warn?.('deleteSession: runtime/stream 思考过程数据清理失败（已跳过）', {
            session_id: sessionId,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }
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

  /**
   * 清理「孤儿会话记忆」：`info_raw` 中 `session_id` 已不存在于 `chat_session` 的残留记录
   * （及其派生表与 GraphDB 引用边），供服务启动时与每日定时任务调用。
   *
   * 根因（2026-09-21 记忆残留事故）：历史版本权限审计桥以 Runtime 内部 session id 落
   * `info_raw.session_id`（而非对话会话键），以及早期在会话级联删除逻辑收敛前删除的会话，
   * 都会在 `info_raw` 留下 `session_id` 无法匹配任何 `chat_session` 的孤儿行。
   * 这些行不会被 `deleteSession(指定 session_id)` 命中，因而会话删除后仍在「信息 > 记忆」
   * 页持续展示已删除会话的对话内容。
   *
   * 判定口径：以 `chat_session.session_id` 为唯一存活集合（会话在 `createSession` 时即落库，
   * 所有 `info_raw` 写入均发生在会话存在期间），差集即孤儿。
   * 清理复用 {@link deleteSession} 的级联逻辑，保证与单次会话删除行为一致。
   */
  async purgeOrphanSessions(input: PurgeOrphanSessionsInput, output: PurgeOrphanSessionsOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    // 1. 存活会话键集合
    const liveRows = this.relationDb.queryRaw<{ session_id: string }>(
      `SELECT "session_id" FROM "chat_session"`,
    );
    const liveSessions = new Set<string>(
      (liveRows ?? []).map((r) => String(r.session_id ?? '')).filter(Boolean),
    );

    // 2. info_raw 中出现过的全部会话键，差集即孤儿
    const rawRows = this.relationDb.queryRaw<{ session_id: string }>(
      `SELECT DISTINCT "session_id" FROM "info_raw"`,
    );
    const orphanSessions = Array.from(new Set(
      (rawRows ?? []).map((r) => String(r.session_id ?? '')).filter(Boolean),
    )).filter((sid) => !liveSessions.has(sid));

    output.purged_session_ids = orphanSessions;
    output.purged_count = orphanSessions.length;
    if (input.dry_run || orphanSessions.length === 0) return true;

    // 3. 复用 deleteSession 的级联清理（info_* / GraphDB / runtime_* / stream_event / writer 偏好）
    const delInput = new DeleteSessionInput();
    delInput.session_ids = orphanSessions;
    await this.deleteSession(delInput, new DeleteSessionOutput(), _context, _metrics, _report);
    return true;
  }

  /**
   * 检索会话列表（应用编排）：关键词/时间过滤 → 分页取会话 → 批量聚合统计 → 摘要映射 → 总数回写。
   *
   * 命中过滤条件（关键词 / 时间范围）返回空集时短路返回；统计/标签/token/消息数
   * 均为批量查询（消除逐会话 N+1），单项查询失败按口径降级不阻断。
   */
  async soSession(input: SearchSessionInput, output: SearchSessionOutput, _context: ChatContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const conditions: Condition[] = [];
    if (input.keyword) {
      const matchedIds = this.soSessionIdsByKeyword(input.keyword);
      if (matchedIds.length === 0) return this.writeEmptySessionPage(output);
      conditions.push({ field: 'session_id', operator: Operator.IN, value: matchedIds });
    }
    if (input.start_time !== undefined || input.end_time !== undefined) {
      const timeMatchedIds = this.soSessionIdsByTimeRange(input.start_time, input.end_time);
      if (timeMatchedIds.length === 0) return this.writeEmptySessionPage(output);
      conditions.push({ field: 'session_id', operator: Operator.IN, value: timeMatchedIds });
    }
    const selOutput = await this.soSessionPage(input, conditions);
    const sessionIds = selOutput.rows.map((r) => String(r.session_id ?? '')).filter(Boolean);
    const maps = this.soSessionAggregateMaps(sessionIds, metrics);
    const sessions = toSessionSummaries(selOutput.rows, maps);
    const total = await this.countSessionTotal(conditions, metrics);
    output.sessions = sessions;
    output.total = total;
    return true;
  }

  /** 空结果页回写（数据处理）：无命中时输出空列表与 0 总数 */
  private writeEmptySessionPage(output: SearchSessionOutput): boolean {
    output.sessions = [];
    output.total = 0;
    return true;
  }

  /** 按关键词查会话 ID（逻辑控制；会话标题 LIKE 与 info 内容 LIKE 联合） */
  private soSessionIdsByKeyword(keyword: string): string[] {
    const kw = `%${keyword}%`;
    const matchedRows = this.relationDb.queryRaw<{ session_id: string }>(
      `SELECT "session_id" FROM "chat_session" WHERE "session_title" LIKE ? UNION SELECT DISTINCT "session_id" FROM "info_raw" WHERE "info" LIKE ?`,
      [kw, kw],
    );
    return matchedRows.map((r) => r.session_id).filter(Boolean);
  }

  /** 按时间范围查会话 ID（逻辑控制；info_raw.created 半开区间过滤 [start, end)） */
  private soSessionIdsByTimeRange(startTime?: number, endTime?: number): string[] {
    const timeConds: string[] = [];
    const timeArgs: unknown[] = [];
    if (startTime !== undefined) {
      timeConds.push('"created" >= ?');
      timeArgs.push(startTime);
    }
    if (endTime !== undefined) {
      timeConds.push('"created" < ?');
      timeArgs.push(endTime);
    }
    const timeRows = this.relationDb.queryRaw<{ session_id: string }>(
      `SELECT DISTINCT "session_id" FROM "info_raw" WHERE ${timeConds.join(' AND ')}`,
      timeArgs,
    );
    return timeRows.map((r) => r.session_id).filter(Boolean);
  }

  /** 分页查会话行（逻辑控制；排序解析与分页默认值在此装配） */
  private async soSessionPage(input: SearchSessionInput, conditions: Condition[]): Promise<SelectDBOutput> {
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
    return selOutput;
  }

  /** 批量装配会话页聚合映射（逻辑控制；五类统计依序执行，批量结果供领域层映射消费） */
  private soSessionAggregateMaps(sessionIds: string[], metrics?: Metrics): SessionAggregateMaps {
    const maps: SessionAggregateMaps = {
      statMap: new Map(), tagsMap: new Map(), tokenMap: new Map(), countMap: new Map(), lastMsgMap: new Map(),
    };
    if (sessionIds.length === 0) return maps;
    maps.statMap = this.soSessionQaStats(sessionIds, metrics);
    maps.tagsMap = this.soSessionTags(sessionIds, metrics);
    maps.tokenMap = this.soSessionTokenStats(sessionIds, metrics);
    maps.countMap = this.soSessionMessageCount(sessionIds);
    maps.lastMsgMap = this.soSessionLastMessage(sessionIds, metrics);
    return maps;
  }

  /** 聚合会话问答次数与问/答字符数（逻辑控制；info_type = REQUEST/RESPONSE 汇总，失败降级空映射） */
  private soSessionQaStats(sessionIds: string[], metrics?: Metrics): Map<string, { qa_count: number; question_chars: number; answer_chars: number }> {
    const statMap = new Map<string, { qa_count: number; question_chars: number; answer_chars: number }>();
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
    } catch (err) {
      /* degrade gracefully */
      metrics?.warn('ChatService.soSession 会话统计聚合失败（该批会话统计降级为 0）', {
        error: err instanceof Error ? err.message : String(err),
        session_ids: sessionIds,
      });
    }
    return statMap;
  }

  /** 聚合会话标签集合（逻辑控制；info_tag 关联去重，失败降级空映射） */
  private soSessionTags(sessionIds: string[], metrics?: Metrics): Map<string, string[]> {
    const tagsMap = new Map<string, string[]>();
    const placeholders = sessionIds.map(() => '?').join(',');
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
    } catch (err) {
      /* degrade gracefully */
      metrics?.warn('ChatService.soSession 会话标签聚合失败（该批会话标签降级为空）', {
        error: err instanceof Error ? err.message : String(err),
        session_ids: sessionIds,
      });
    }
    return tagsMap;
  }

  /** 聚合会话 token 用量（逻辑控制；iterations 明细优先，查询失败降级空映射） */
  private soSessionTokenStats(sessionIds: string[], metrics?: Metrics): Map<string, { input_tokens: number; output_tokens: number }> {
    const tokenMap = new Map<string, { input_tokens: number; output_tokens: number }>();
    try {
      const placeholders = sessionIds.map(() => '?').join(',');
      const traceRows = this.relationDb.queryRaw<{ session_id: string; trace_id: string; iterations_json: string; total_token_usage: number }>(
        `SELECT ow."session_id", t."trace_id", t."iterations_json", t."total_token_usage"
         FROM "orchestration_work" ow
         INNER JOIN "orchestration_agent_execution" e ON ow."work_id" = e."work_id"
         INNER JOIN "agent_execution_trace" t ON e."trace_id" = t."trace_id" AND e."trace_id" IS NOT NULL AND e."trace_id" != ''
         WHERE ow."session_id" IN (${placeholders})
         GROUP BY ow."session_id", t."trace_id"`,
        sessionIds,
      );
      this.aggregateTraceTokenRows(traceRows, tokenMap, metrics);
    } catch (err) {
      /* degrade gracefully */
      metrics?.warn('ChatService.soSession 会话 token 聚合失败（token 统计降级为 0）', {
        error: err instanceof Error ? err.message : String(err),
        session_ids: sessionIds,
      });
    }
    return tokenMap;
  }

  /** 逐条累计 trace token 用量（数据处理；同会话同 trace 去重，解析失败告警并回退 total_token_usage） */
  private aggregateTraceTokenRows(
    traceRows: Array<{ session_id: string; trace_id: string; iterations_json: string; total_token_usage: number }>,
    tokenMap: Map<string, { input_tokens: number; output_tokens: number }>,
    metrics?: Metrics,
  ): void {
    const seen = new Set<string>();
    for (const r of traceRows) {
      const sid = String(r.session_id ?? '');
      const traceId = String(r.trace_id ?? '');
      if (!sid || !traceId || seen.has(`${sid}:${traceId}`)) continue;
      seen.add(`${sid}:${traceId}`);
      let usage = { input_tokens: 0, output_tokens: 0 };
      try {
        usage = toTraceTokenUsage(String(r.iterations_json ?? ''), Number(r.total_token_usage ?? 0) || 0);
      } catch (err) {
        metrics?.warn('ChatService.soSession iterations_json 解析失败（回退 total_token_usage 统计）', {
          error: err instanceof Error ? err.message : String(err),
          session_id: sid,
          trace_id: traceId,
        });
        usage.output_tokens = Number(r.total_token_usage ?? 0) || 0;
      }
      const cur = tokenMap.get(sid) ?? { input_tokens: 0, output_tokens: 0 };
      cur.input_tokens += usage.input_tokens;
      cur.output_tokens += usage.output_tokens;
      tokenMap.set(sid, cur);
    }
  }

  /** 批量查会话消息条数（逻辑控制；失败降级空映射） */
  private soSessionMessageCount(sessionIds: string[]): Map<string, number> {
    const countMap = new Map<string, number>();
    try {
      const placeholders = sessionIds.map(() => '?').join(',');
      const cntRows = this.relationDb.queryRaw<{ session_id: string; cnt: number }>(
        `SELECT "session_id", COUNT(*) AS cnt FROM "info_raw" WHERE "session_id" IN (${placeholders}) GROUP BY "session_id"`,
        sessionIds,
      );
      for (const r of cntRows) countMap.set(String(r.session_id), Number(r.cnt));
    } catch { /* degrade gracefully */ }
    return countMap;
  }

  /** 批量查会话最后一条消息（逻辑控制；子查询取每会话最新 created，失败降级空映射） */
  private soSessionLastMessage(sessionIds: string[], metrics?: Metrics): Map<string, { time: number; msg: string }> {
    const lastMsgMap = new Map<string, { time: number; msg: string }>();
    try {
      const placeholders = sessionIds.map(() => '?').join(',');
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
    } catch (err) {
      /* degrade gracefully */
      metrics?.warn('ChatService.soSession 最后消息批量查询失败（最后消息降级为空）', {
        error: err instanceof Error ? err.message : String(err),
        session_ids: sessionIds,
      });
    }
    return lastMsgMap;
  }

  /** 统计会话总数（逻辑控制；同过滤条件 countDB，失败降级 0） */
  private async countSessionTotal(conditions: Condition[], metrics?: Metrics): Promise<number> {
    try {
      const totalInput = Object.assign(new CountDBInput(), {
        table: 'chat_session',
        conditions,
      });
      const totalOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(totalInput, totalOutput, new DBContext());
      return totalOutput.count;
    } catch (err) {
      /* degrade gracefully */
      metrics?.warn('ChatService.soSession 会话总数统计失败（total 降级为 0）', {
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }

  async soSessionDetail(input: GetSessionDetailInput, output: GetSessionDetailOutput, _context: ChatContext, metrics?: Metrics, _report?: Report,
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
    } catch (err) {
      /* degrade gracefully */
      metrics?.warn('ChatService.soSessionDetail 消息计数失败（message_count 降级为 0）', {
        error: err instanceof Error ? err.message : String(err),
        session_id: input.session_id,
      });
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

  async checkSessionOverflow(input: CheckSessionOverflowInput, output: CheckSessionOverflowOutput, _context: ChatContext, metrics?: Metrics, _report?: Report,
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
    } catch (err) {
      /* use default */
      metrics?.warn('ChatService.checkSessionOverflow 读取会话配置失败（使用默认上限 1000）', {
        error: err instanceof Error ? err.message : String(err),
        session_id: input.session_id,
      });
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
    } catch (err) {
      /* degrade gracefully */
      metrics?.warn('ChatService.checkSessionOverflow 消息计数失败（按 0 条判断溢出）', {
        error: err instanceof Error ? err.message : String(err),
        session_id: input.session_id,
      });
    }

    output.is_overflowed = messageCount >= maxMessages;
    output.message_count = messageCount;
    output.max_messages = maxMessages;
    return true;
  }

  async soChatHistory(input: GetChatHistoryInput, output: GetChatHistoryOutput, _context: ChatContext, metrics?: Metrics, _report?: Report,
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
      } catch (err) {
        /* use default */
        metrics?.warn('ChatService.soChatHistory 读取默认历史条数配置失败（使用默认 50）', {
          error: err instanceof Error ? err.message : String(err),
          session_id: input.session_id,
        });
      }
    }

    const lastNInput = Object.assign(new LastNInfoInput(), {
      session_id: input.session_id,
      work_id: input.work_id,
      run_id: input.run_id,
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
        run_id: row.run_id,
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

  async soMessage(input: SearchMessageInput, output: SearchMessageOutput, _context: ChatContext, metrics?: Metrics, _report?: Report,
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
      } catch (err) {
        /* degrade gracefully */
        metrics?.warn('ChatService.soMessage 消息摘要查询失败（摘要降级为空）', {
          error: err instanceof Error ? err.message : String(err),
          info_id: row.info_id,
        });
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

  async pinMessage(input: PinMessageInput, output: PinMessageOutput, _context: ChatContext, metrics?: Metrics, _report?: Report,
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
    } catch (err) {
      /* degrade gracefully */
      metrics?.warn('ChatService.pinMessage 读取当前 pin 状态失败（按未置顶处理）', {
        error: err instanceof Error ? err.message : String(err),
        info_id: input.info_id,
      });
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

  private async autoGenerateSessionTitleIfEmpty(sessionId: string, msgContent: string, metrics?: Metrics): Promise<void> {
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
    } catch (err) {
      /* best effort */
      metrics?.warn('ChatService.autoGenerateSessionTitleIfEmpty 自动生成会话标题失败（跳过）', {
        error: err instanceof Error ? err.message : String(err),
        session_id: sessionId,
      });
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
