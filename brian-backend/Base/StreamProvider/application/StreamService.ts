import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import type { Logger } from '../../shared/aop/AopProxy';
import type { TaskEvent } from '@brian-agent/shared';
import {
  BrianSSEMessage,
  RegisterStreamInput,
  RegisterStreamOutput,
  CloseStreamInput,
  CloseStreamOutput,
  GetStreamStatsOutput,
  ConfigStreamInput,
  ConfigStreamOutput,
  StreamConfigRecord,
  StreamWriter,
  STREAM_CONFIG_TABLE,
} from '../domain/types';

interface ActiveSessionStream {
  sessionId: string;
  endpointId: string;
  writer: StreamWriter;
  heartbeatTimer: NodeJS.Timeout | null;
  seq: number;
  onClose?: () => void;
  closed: boolean;
}

/** StreamService：SSE 连接与帧写（ADR-013 瘦身）——落库/状态/分片全部移除 */
export class StreamService {
  private readonly sessions = new Map<string, ActiveSessionStream>();
  private readonly endpoints = new Map<string, string>();
  private configCache: StreamConfigRecord | null = null;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logger?: Logger,
  ) {}

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
    } catch (err) {
      this.logger?.warn?.('StreamService.getConfig 读取流配置失败，使用默认配置', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return {
      id: 'default_stream_config',
      sse_heartbeat_interval_ms: 15000,
      created: 0,
      updated: 0,
    };
  }

  async registerStream(
    input: RegisterStreamInput,
    output: RegisterStreamOutput,
  ): Promise<boolean> {
    const { session_id, writer, onClose } = input;
    if (!session_id || !writer) {
      output.registered = false;
      return false;
    }
    if (this.sessions.has(session_id)) {
      this.closeSessionInternal(session_id, 'Replaced by new connection');
    }
    const cfg = await this.getConfig();
    const endpointId = input.endpoint_id || IdGenerator.generate();
    const streamItem: ActiveSessionStream = {
      sessionId: session_id,
      endpointId,
      writer,
      heartbeatTimer: null,
      seq: 0,
      onClose,
      closed: false,
    };
    this.endpoints.set(endpointId, session_id);
    this.startHeartbeat(streamItem, cfg.sse_heartbeat_interval_ms || 15000);
    this.sessions.set(session_id, streamItem);
    output.client_id = session_id;
    output.endpoint_id = endpointId;
    output.registered = true;
    this.logger?.debug?.(`Registered SSE stream for session ${session_id}`, { source: 'StreamProvider' });
    return true;
  }

  /** 观测总线写帧入口：TaskEvent 作为 data 整帧下发 */
  pushEventFrame(sessionId: string, endpointId: string, ev: TaskEvent): boolean {
    const sid = this.endpoints.get(endpointId);
    if (!sid) return false;
    const session = this.sessions.get(sid);
    if (!session || session.closed) return false;
    const frame: BrianSSEMessage<TaskEvent> = {
      msg_id: IdGenerator.generate(),
      seq: session.seq++,
      session_id: sessionId,
      run_id: ev.run_id,
      work_id: ev.work_id,
      agent_id: ev.agent_id,
      event: ev.type,
      msg_type: ev.kind === 'reasoning' || ev.kind === 'reply' ? 'TEXT' : 'TRACE',
      chunk_length: 1,
      accumulated_length: 0,
      timestamp: ev.ts,
      data: ev,
    };
    this.writeFrame(session, frame);
    return true;
  }

  async closeStream(
    input: CloseStreamInput,
    output: CloseStreamOutput,
  ): Promise<boolean> {
    output.closed = this.closeSessionInternal(input.session_id, input.reason);
    return true;
  }

  async soStreamStats(output: GetStreamStatsOutput): Promise<boolean> {
    output.active_sessions = [];
    for (const [sid, item] of this.sessions.entries()) {
      if (!item.closed) output.active_sessions.push(sid);
    }
    output.active_sessions_count = output.active_sessions.length;
    return true;
  }

  async configStream(
    input: ConfigStreamInput,
    output: ConfigStreamOutput,
  ): Promise<boolean> {
    const now = IdGenerator.now();
    const current = await this.getConfig();
    const heartbeat = input.sse_heartbeat_interval_ms ?? current.sse_heartbeat_interval_ms;
    this.relationDb.executeRaw(`
      UPDATE "${STREAM_CONFIG_TABLE}"
      SET "sse_heartbeat_interval_ms" = ?, "updated" = ?
      WHERE "id" = ?
    `, [heartbeat, now, current.id]);
    this.configCache = { ...current, sse_heartbeat_interval_ms: heartbeat, updated: now };
    output.updated = true;
    return true;
  }

  private startHeartbeat(streamItem: ActiveSessionStream, heartbeatMs: number): void {
    streamItem.heartbeatTimer = setInterval(() => {
      if (streamItem.closed) {
        if (streamItem.heartbeatTimer) clearInterval(streamItem.heartbeatTimer);
        return;
      }
      try {
        const ok = streamItem.writer(': ping\n\n');
        if (ok === false) {
          this.closeSessionInternal(streamItem.sessionId, 'Heartbeat write failed');
        }
      } catch {
        this.closeSessionInternal(streamItem.sessionId, 'Heartbeat exception');
      }
    }, heartbeatMs);
  }

  private writeFrame(session: ActiveSessionStream, msg: BrianSSEMessage): void {
    if (session.closed) return;
    try {
      const payload = `data: ${JSON.stringify(msg)}\n\n`;
      const ok = session.writer(payload);
      if (ok === false) {
        this.closeSessionInternal(session.sessionId, 'Write returned false');
      }
    } catch {
      this.closeSessionInternal(session.sessionId, 'Write error');
    }
  }

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
    } catch (err) {
      this.logger?.warn?.('StreamService.closeSessionInternal onClose 回调异常（会话清理继续）', {
        error: err instanceof Error ? err.message : String(err),
        session_id: sessionId,
      });
    }
    this.sessions.delete(sessionId);
    this.endpoints.delete(session.endpointId);
    this.logger?.debug?.(`Closed SSE stream for session ${sessionId}, reason: ${reason || 'normal'}`, { source: 'StreamProvider' });
    return true;
  }
}
