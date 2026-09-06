/**
 * @fileoverview StreamProvider 服务实现。
 *
 * 管理 SSE 连接生命周期、心跳保活、并发 Agent 消息隔离缓冲、文本切片（2-5 字符打字机）
 * 以及基于 BrianSSEMessage 协议的结构化数据推送。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import type { Logger } from '../../shared/aop/AopProxy';
import { businessEventMsgType } from '../../shared/base/BusinessEvent';
import { ValidationError } from '../../shared/errors';
import {
  BrianSSEMessage,
  RegisterStreamInput,
  RegisterStreamOutput,
  PushStreamInput,
  PushStreamOutput,
  CloseStreamInput,
  CloseStreamOutput,
  GetStreamStatsOutput,
  ConfigStreamInput,
  ConfigStreamOutput,
  StreamConfigRecord,
  StreamWriter,
  STREAM_CONFIG_TABLE,
  STREAM_EVENT_TABLE,
  PushEventToEndpointOutput,
  ReplayEndpointEventsOutput,
} from '../domain/types';

interface ActiveSessionStream {
  sessionId: string;
  /** SSE 端点 ID（registerStream 生成；前端请求时携带，按 ID 定位端点） */
  endpointId: string;
  writer: StreamWriter;
  heartbeatTimer: NodeJS.Timeout | null;
  seq: number;
  channelLengths: Map<string, number>;
  onClose?: () => void;
  closed: boolean;
}

export class StreamService {
  private readonly sessions = new Map<string, ActiveSessionStream>();
  /** SSE 端点 ID → session_id（Report 携带端点 ID 上报时按此定位具体连接） */
  private readonly endpoints = new Map<string, string>();
  /** 事件 seq 进程内缓存（每 session_key 严格递增；DB MAX 为持久事实源） */
  private readonly eventSeqCache = new Map<string, number>();
  /** 每 session_key 发布串行链（保证 fire-and-forget 场景下 seq 与投递顺序一致） */
  private readonly eventChains = new Map<string, Promise<void>>();
  private configCache: StreamConfigRecord | null = null;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logger?: Logger,
  ) {}

  /**
   * 读取或获取流配置缓存
   */
  async getConfig(): Promise<StreamConfigRecord> {
    if (this.configCache) return this.configCache;
    try {
      const rows = this.relationDb.queryRaw<StreamConfigRecord>(
        `SELECT * FROM "${STREAM_CONFIG_TABLE}" LIMIT 1`,
      );
      if (rows.length > 0) {
        this.configCache = rows[0];
        return this.configCache;
      }
    } catch {
      /* ignore */
    }
    return {
      id: 'default_stream_config',
      sse_heartbeat_interval_ms: 15000,
      chunk_min_chars: 2,
      chunk_max_chars: 5,
      created: 0,
      updated: 0,
    };
  }

  /**
   * 按端点 ID 推送业务事件（事件流的保存 + 在线投递；Report 携带端点 ID 调用）。
   *
   * - 持久化：事件写入 stream_event（每 session_key 严格递增 seq，发布按会话串行化保证顺序）；
   * - 投递：按端点 ID 定位 SSE 连接，经 v1 兼容格式化映射后写帧；端点不存在时仅持久化（供重放）；
   * - 未映射的事件类型（如 run.accepted/part.created）仅持久化（审计），不产生 SSE 帧。
   */
  async publishEvent(
    input: { endpoint_id: string; session_key: string; run_id?: string; type: string; payload: unknown },
    output: PushEventToEndpointOutput,
  ): Promise<boolean> {
    if (!input.endpoint_id || !input.session_key || !input.type) {
      throw new ValidationError('endpoint_id/session_key/type 不能为空');
    }
    // 每 session_key 串行化：fire-and-forget 调用下保证 seq 分配与帧写入顺序一致
    const prev = this.eventChains.get(input.session_key) ?? Promise.resolve();
    const current = prev.then(() => this.publishEventInternal(input, output));
    this.eventChains.set(input.session_key, current.catch(() => undefined));
    await current;
    return true;
  }

  /** 发布内部实现（逻辑控制）：seq 分配 → 落库 → 端点投递 */
  private async publishEventInternal(
    input: { endpoint_id: string; session_key: string; run_id?: string; type: string; payload: unknown },
    output: PushEventToEndpointOutput,
  ): Promise<void> {
    const seq = await this.nextEventSeq(input.session_key);
    const now = IdGenerator.now();
    try {
      await this.relationDb.insert(STREAM_EVENT_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'session_key', value: input.session_key },
        { field: 'run_id', value: input.run_id ?? '' },
        { field: 'seq', value: seq },
        { field: 'event_type', value: input.type },
        { field: 'payload_json', value: JSON.stringify(input.payload ?? {}) },
        { field: 'ts', value: now },
      ]);
    } catch {
      // 事件落库失败不影响在线投递（审计缺一条，优先保证流不中断）
    }
    output.seq = seq;
    output.delivered = this.writeEventToEndpoint(input.endpoint_id, input.type, input.payload);
  }

  /** 分配下一条事件 seq（逻辑控制；进程缓存 + DB MAX 持久事实源） */
  private async nextEventSeq(sessionKey: string): Promise<number> {
    const cached = this.eventSeqCache.get(sessionKey);
    if (cached !== undefined) {
      this.eventSeqCache.set(sessionKey, cached + 1);
      return cached + 1;
    }
    const rows = this.relationDb.queryRaw<{ max_seq: number }>(
      `SELECT COALESCE(MAX("seq"), 0) AS max_seq FROM "${STREAM_EVENT_TABLE}" WHERE "session_key" = ?`,
      [sessionKey],
    );
    const next = (rows?.[0]?.max_seq ?? 0) + 1;
    this.eventSeqCache.set(sessionKey, next);
    return next;
  }

  /** 按端点 ID 写帧（逻辑控制；返回是否实际投递） */
  private writeEventToEndpoint(endpointId: string, type: string, payload: unknown): boolean {
    const sessionId = this.endpoints.get(endpointId);
    if (!sessionId) {
      return false;
    }
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) {
      return false;
    }
    this.writeFrame(session, this.formatEventFrame(type, payload));
    return true;
  }

  /** v2 原生帧组装（数据处理）：event = BusinessEvent 协议名，msg_type 按语义映射，data = 协议载荷 */
  private formatEventFrame(type: string, payload: unknown): BrianSSEMessage {
    return {
      msg_id: IdGenerator.generate(),
      seq: 0,
      session_id: '',
      interact_id: '',
      work_id: '',
      event: type,
      msg_type: businessEventMsgType(type as never),
      chunk_length: 1,
      accumulated_length: 0,
      timestamp: Date.now(),
      data: payload ?? {},
    };
  }

  /**
   * 端点事件重放（断线恢复）：after_seq 之后按 seq 升序重放到端点（保存的事件流）。
   */
  async replayEvents(
    input: { endpoint_id: string; session_key: string; after_seq?: number },
    output: ReplayEndpointEventsOutput,
  ): Promise<boolean> {
    if (!input.endpoint_id || !input.session_key) {
      throw new ValidationError('endpoint_id/session_key 不能为空');
    }
    const after = input.after_seq ?? 0;
    const rows = this.relationDb.queryRaw<{ seq: number; event_type: string; payload_json: string }>(
      `SELECT "seq", "event_type", "payload_json" FROM "${STREAM_EVENT_TABLE}"
       WHERE "session_key" = ? AND "seq" > ? ORDER BY "seq" ASC`,
      [input.session_key, after],
    );
    let lastSeq = after;
    for (const row of rows ?? []) {
      const seq = Number(row.seq);
      let payload: unknown = {};
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        payload = {};
      }
      this.writeEventToEndpoint(input.endpoint_id, String(row.event_type), payload);
      lastSeq = seq;
      output.replayed += 1;
    }
    output.last_seq = lastSeq;
    return true;
  }

  /**
   * 注册 / 接管某个 session 的 SSE 连接
   */
  async registerStream(
    input: RegisterStreamInput,
    output: RegisterStreamOutput,
  ): Promise<boolean> {
    const { session_id, writer, onClose } = input;
    if (!session_id || !writer) {
      output.registered = false;
      return false;
    }

    // 若当前会话已有未关闭的连接，先平滑关闭旧连接
    if (this.sessions.has(session_id)) {
      this.closeSessionInternal(session_id, 'Replaced by new connection');
    }

    const cfg = await this.getConfig();
    const heartbeatMs = cfg.sse_heartbeat_interval_ms || 15000;

    const endpointId = input.endpoint_id || IdGenerator.generate();
    const streamItem: ActiveSessionStream = {
      sessionId: session_id,
      endpointId,
      writer,
      heartbeatTimer: null,
      seq: 0,
      channelLengths: new Map(),
      onClose,
      closed: false,
    };
    this.endpoints.set(endpointId, session_id);

    // 启动心跳定时器
    streamItem.heartbeatTimer = setInterval(() => {
      if (streamItem.closed) {
        if (streamItem.heartbeatTimer) clearInterval(streamItem.heartbeatTimer);
        return;
      }
      try {
        const ok = streamItem.writer(': ping\n\n');
        if (ok === false) {
          this.closeSessionInternal(session_id, 'Heartbeat write failed');
        }
      } catch (err) {
        this.closeSessionInternal(session_id, 'Heartbeat exception');
      }
    }, heartbeatMs);

    this.sessions.set(session_id, streamItem);
    output.client_id = session_id;
    output.endpoint_id = endpointId;
    output.registered = true;

    this.logger?.debug?.(`Registered SSE stream for session ${session_id}`, { source: 'StreamProvider' });
    return true;
  }

  /**
   * 向指定 session 推送结构化 SSE 消息。
   * 支持多 Agent 并发隔离、自动分片打字机输出。
   */
  async pushStream<T = unknown>(
    input: PushStreamInput<T>,
    output: PushStreamOutput,
  ): Promise<boolean> {
    const session = this.sessions.get(input.session_id);
    if (!session || session.closed) {
      output.pushed = false;
      return false;
    }

    const cfg = await this.getConfig();
    const minChunk = input.chunk_min ?? cfg.chunk_min_chars ?? 2;
    const maxChunk = input.chunk_max ?? cfg.chunk_max_chars ?? 5;
    const channelKey = `${input.work_id || ''}_${input.agent_id || 'main'}_${input.node_id || ''}`;
    let accumulated = session.channelLengths.get(channelKey) ?? 0;

    // 检查是否需要对文本进行打字机 chunk 分片
    const isTextChunkable =
      Boolean(input.enable_chunking) &&
      typeof input.data === 'string' &&
      input.data.length > 0;

    if (isTextChunkable) {
      const fullText = input.data as unknown as string;
      const fullLength = fullText.length;
      let currentIndex = 0;
      let lastMsgId = '';
      let lastSeq = session.seq;

      while (currentIndex < fullLength) {
        if (session.closed) break;

        const chunkSize = Math.floor(Math.random() * (maxChunk - minChunk + 1)) + minChunk;
        const chunk = fullText.slice(currentIndex, currentIndex + chunkSize);
        currentIndex += chunk.length;
        accumulated += chunk.length;

        const sseMsg: BrianSSEMessage<{ chunk: string; is_last_chunk: boolean }> = {
          msg_id: IdGenerator.generate(),
          seq: session.seq++,
          session_id: input.session_id,
          interact_id: input.interact_id || '',
          work_id: input.work_id || '',
          agent_id: input.agent_id,
          agent_name: input.agent_name,
          agent_type: input.agent_type,
          node_id: input.node_id,
          task_id: input.task_id,
          event: input.event,
          msg_type: input.msg_type || 'TEXT',
          full_length: fullLength,
          chunk_length: chunk.length,
          accumulated_length: accumulated,
          timestamp: IdGenerator.now(),
          data: {
            chunk,
            is_last_chunk: currentIndex >= fullLength,
          },
        };

        lastMsgId = sseMsg.msg_id;
        lastSeq = sseMsg.seq;
        this.writeFrame(session, sseMsg);

        if (input.chunk_delay_ms && input.chunk_delay_ms > 0 && currentIndex < fullLength) {
          await new Promise((resolve) => setTimeout(resolve, input.chunk_delay_ms));
        }
      }

      session.channelLengths.set(channelKey, accumulated);
      output.msg_id = lastMsgId;
      output.seq = lastSeq;
      output.pushed = true;
      return true;
    }

    // 非 chunk 分片的普通结构化消息推送（如 DAG 事件、上下文构建事件、Agent构建事件、控制事件等）
    const fullLength = typeof input.data === 'string' ? input.data.length : 1;
    accumulated += fullLength;
    session.channelLengths.set(channelKey, accumulated);

    const sseMsg: BrianSSEMessage<T> = {
      msg_id: IdGenerator.generate(),
      seq: session.seq++,
      session_id: input.session_id,
      interact_id: input.interact_id || '',
      work_id: input.work_id || '',
      agent_id: input.agent_id,
      agent_name: input.agent_name,
      agent_type: input.agent_type,
      node_id: input.node_id,
      task_id: input.task_id,
      event: input.event,
      msg_type: input.msg_type,
      full_length: fullLength,
      chunk_length: fullLength,
      accumulated_length: accumulated,
      timestamp: IdGenerator.now(),
      data: input.data,
    };

    this.writeFrame(session, sseMsg);

    output.msg_id = sseMsg.msg_id;
    output.seq = sseMsg.seq;
    output.pushed = true;
    return true;
  }

  /**
   * 关闭指定 session 的 SSE 流
   */
  async closeStream(
    input: CloseStreamInput,
    output: CloseStreamOutput,
  ): Promise<boolean> {
    const closed = this.closeSessionInternal(input.session_id, input.reason);
    output.closed = closed;
    return true;
  }

  /**
   * 查询活跃连接状态
   */
  async soStreamStats(output: GetStreamStatsOutput): Promise<boolean> {
    const active: string[] = [];
    for (const [sid, item] of this.sessions.entries()) {
      if (!item.closed) active.push(sid);
    }
    output.active_sessions_count = active.length;
    output.active_sessions = active;
    return true;
  }

  /**
   * 更新配置
   */
  async configStream(
    input: ConfigStreamInput,
    output: ConfigStreamOutput,
  ): Promise<boolean> {
    const now = IdGenerator.now();
    const current = await this.getConfig();
    const heartbeat = input.sse_heartbeat_interval_ms ?? current.sse_heartbeat_interval_ms;
    const minChunk = input.chunk_min_chars ?? current.chunk_min_chars;
    const maxChunk = input.chunk_max_chars ?? current.chunk_max_chars;

    this.relationDb.executeRaw(`
      UPDATE "${STREAM_CONFIG_TABLE}"
      SET "sse_heartbeat_interval_ms" = ?, "chunk_min_chars" = ?, "chunk_max_chars" = ?, "updated" = ?
      WHERE "id" = ?
    `, [heartbeat, minChunk, maxChunk, now, current.id]);

    this.configCache = {
      ...current,
      sse_heartbeat_interval_ms: heartbeat,
      chunk_min_chars: minChunk,
      chunk_max_chars: maxChunk,
      updated: now,
    };
    output.updated = true;
    return true;
  }

  /**
   * 底层写入 SSE 帧数据
   */
  private writeFrame(session: ActiveSessionStream, msg: BrianSSEMessage): void {
    if (session.closed) return;
    try {
      const payload = `data: ${JSON.stringify(msg)}\n\n`;
      const ok = session.writer(payload);
      if (ok === false) {
        this.closeSessionInternal(session.sessionId, 'Write returned false');
      }
    } catch (err) {
      this.closeSessionInternal(session.sessionId, 'Write error');
    }
  }

  /**
   * 内部清理与关闭会话
   */
  private closeSessionInternal(sessionId: string, reason?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.closed = true;
    if (session.heartbeatTimer) {
      clearInterval(session.heartbeatTimer);
      session.heartbeatTimer = null;
    }

    try {
      session.onClose?.();
    } catch {
      /* ignore */
    }

    this.sessions.delete(sessionId);
    this.logger?.debug?.(`Closed SSE stream for session ${sessionId}, reason: ${reason || 'normal'}`, { source: 'StreamProvider' });
    return true;
  }
}
