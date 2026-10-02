import { makeTaskEvent, parsePayload, type EventSpan, type TaskEvent } from '@brian-agent/shared';
import type { EmitMeta } from '../domain/types';
import type { EventLogSink } from './EventLogSink';
import type { RunStateSink } from './RunStateSink';

/** SSE 传输窄接口（由 StreamAccess 实现，避免 provider 间耦合） */
export interface FrameTransport {
  pushFrame(sessionId: string, endpointId: string, frame: TaskEvent): boolean;
}

export interface DispatcherDeps {
  logSink: EventLogSink;
  stateSink: RunStateSink;
  transport?: FrameTransport;
}

/**
 * EventDispatcher：观测总线唯一 fan-out 点。
 * 职责：run 内单调 seq 分配 → 组装 TaskEvent → 同步 fan-out（SSE 帧 / 事件落库队列 / 状态直更）。
 */
export class EventDispatcher {
  private readonly seqByRun = new Map<string, number>();
  private readonly logSink: EventLogSink;
  private readonly stateSink: RunStateSink;
  private readonly transport?: FrameTransport;

  constructor(deps: DispatcherDeps) {
    this.logSink = deps.logSink;
    this.stateSink = deps.stateSink;
    this.transport = deps.transport;
  }

  emit(meta: EmitMeta, type: string, payload: unknown): TaskEvent | null {
    const sessionId = meta.session_id;
    const runId = meta.run_id || meta.work_id || '';
    if (!sessionId || !runId) return null;
    const ev = makeTaskEvent({
      seq: this.nextSeq(runId),
      ts: Date.now(),
      session_id: sessionId,
      run_id: runId,
      work_id: meta.work_id || runId,
      agent_id: meta.agent_id,
      round: meta.round,
      span: meta.span,
      ref: meta.ref,
      type,
      payload: parsePayload(type, payload),
    });
    this.fanout(meta, ev);
    return ev;
  }

  async flush(): Promise<void> {
    await this.logSink.flush();
  }

  /** 启动恢复：从库中续接 seq，避免重启后 run 内 seq 冲突 */
  primeSeq(runId: string, lastSeq: number): void {
    this.seqByRun.set(runId, Math.max(this.seqByRun.get(runId) ?? 0, lastSeq));
  }

  private nextSeq(runId: string): number {
    const next = (this.seqByRun.get(runId) ?? 0) + 1;
    this.seqByRun.set(runId, next);
    return next;
  }

  private fanout(meta: EmitMeta, ev: TaskEvent): void {
    if (meta.stream_endpoint_id && this.transport) {
      this.transport.pushFrame(meta.session_id ?? '', meta.stream_endpoint_id, ev);
    }
    this.logSink.write(ev);
    this.stateSink.onEvent(ev);
  }
}

export type { EventSpan };
