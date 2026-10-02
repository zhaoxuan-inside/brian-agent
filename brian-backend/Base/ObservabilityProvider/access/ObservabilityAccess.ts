import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { Logger } from '../../shared/aop/AopProxy';
import { TaskEventSchemaInitializer } from '../infrastructure/TaskEventSchemaInitializer';
import { EventDispatcher, type FrameTransport } from '../application/EventDispatcher';
import { EventLogSink } from '../application/EventLogSink';
import { RunStateSink } from '../application/RunStateSink';
import { SoEventsInput, SoEventsOutput, TASK_EVENT_TABLE, type EmitMeta } from '../domain/types';
import type { TaskEvent } from '@brian-agent/shared';

/**
 * ObservabilityAccess：观测总线门面（ADR-013）。
 * 组装 Dispatcher 三 sink；对外提供 emit / flush / soEvents（历史重放读）。
 */
export class ObservabilityAccess implements FrameTransport {
  public readonly dispatcher: EventDispatcher;
  private readonly db: RelationDBAccess;
  private frameWriter?: (sessionId: string, endpointId: string, ev: TaskEvent) => boolean;

  constructor(db: RelationDBAccess, _logger?: Logger) {
    this.db = db;
    new TaskEventSchemaInitializer(db).init();
    this.dispatcher = new EventDispatcher({
      logSink: new EventLogSink(db),
      stateSink: new RunStateSink(db),
      transport: this,
    });
  }

  /** 由 Server 组合根注入 SSE 帧写通道（StreamService 就绪后） */
  setFrameWriter(writer: (sessionId: string, endpointId: string, ev: TaskEvent) => boolean): void {
    this.frameWriter = writer;
  }

  /** FrameTransport：经 StreamService 薄通道写帧（不落库、不分片） */
  pushFrame(sessionId: string, endpointId: string, ev: TaskEvent): boolean {
    return this.frameWriter ? this.frameWriter(sessionId, endpointId, ev) : false;
  }

  emit(meta: EmitMeta, type: string, payload: unknown): TaskEvent | null {
    return this.dispatcher.emit(meta, type, payload);
  }

  async flush(): Promise<void> {
    await this.dispatcher.flush();
  }

  /** 历史重放读：run 内 seq ASC 事件行（after_seq 支持增量拉取） */
  async soEvents(input: SoEventsInput, output: SoEventsOutput): Promise<boolean> {
    const runId = input.run_id;
    if (!runId) return true;
    const rows = this.db.queryRaw<Record<string, unknown>>(
      `SELECT "seq","kind","event_type","ts","agent_id","round","span_json","ref_json","payload_json"
       FROM "${TASK_EVENT_TABLE}" WHERE "run_id" = ? AND "seq" > ? ORDER BY "seq" ASC LIMIT ?`,
      [runId, input.after_seq, input.limit],
    );
    output.run_id = runId;
    output.events = (rows ?? []).map((r) => ({
      seq: Number(r.seq), kind: String(r.kind), event_type: String(r.event_type),
      ts: Number(r.ts), agent_id: String(r.agent_id ?? ''), round: r.round == null ? null : Number(r.round),
      span_json: String(r.span_json ?? '{}'), ref_json: String(r.ref_json ?? '{}'),
      payload_json: String(r.payload_json ?? '{}'),
    }));
    output.last_seq = output.events.length ? output.events[output.events.length - 1].seq : input.after_seq;
    return true;
  }
}
