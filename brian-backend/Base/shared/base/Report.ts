import type { Metrics } from './Metrics';
import { BusinessEvent, TIMELINE_POINT_EVENTS, businessEventMsgType } from './BusinessEvent';
export { BusinessEvent, TIMELINE_POINT_EVENTS, businessEventMsgType } from './BusinessEvent';
export type { BusinessEventKind } from './BusinessEvent';

export interface ReportChannel {
  pushText(sessionId: string, event: string, text: string, meta?: Record<string, unknown>): void;
  pushEvent(
    sessionId: string,
    event: string,
    msgType: string,
    data: unknown,
    meta?: Record<string, unknown>,
  ): void;
}

export interface ReportEventStream {
  
  pushToEndpoint(input: { endpoint_id: string; session_key?: string; run_id?: string; type: string; payload: unknown }): Promise<void>;
}

export interface ReportMeta {
  session_id?: string;
  
  session_key?: string;
  
  run_id?: string;
  
  stream_endpoint_id?: string;
  work_id?: string;
  trace_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_type?: string;
  node_id?: string;
  task_id?: string;
}

export class Report {
  session_id?: string;
  
  session_key?: string;
  
  run_id?: string;
  work_id?: string;
  trace_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_type?: string;
  node_id?: string;
  task_id?: string;

  protected channel?: ReportChannel;

  

  private metrics?: Metrics;

  
  bindMetrics(metrics: Metrics): void {
    this.metrics = metrics;
  }

  
  stream_endpoint_id?: string;

  
  private static eventStream?: ReportEventStream;

  
  private static logger?: { error: (msg: string, meta?: unknown) => void };

  
  static setEventStreamGateway(gateway: ReportEventStream | null): void {
    Report.eventStream = gateway ?? undefined;
  }

  
  static setLogger(logger: { error: (msg: string, meta?: unknown) => void } | null): void {
    Report.logger = logger ?? undefined;
  }

  constructor(meta?: ReportMeta, channel?: ReportChannel) {
    if (meta) Object.assign(this, meta);
    this.channel = channel;
  }

  
  pushText(event: string, text: string, meta?: Record<string, unknown>): void {
    if (!this.channel || !this.session_id) return;
    this.channel.pushText(this.session_id, event, text, this.mergeMeta(meta));
  }

  
  pushEvent(event: string, msgType: string, data: unknown, meta?: Record<string, unknown>): void {
    if (!this.channel || !this.session_id) return;
    this.channel.pushEvent(this.session_id, event, msgType, data, this.mergeMeta(meta));
  }

  

  pushBusinessEvent(event: BusinessEvent, data: unknown, meta?: Record<string, unknown>): void {
    
    
    
    
    
    let stamped: unknown = data;
    if (this.metrics && data && typeof data === 'object' && !Array.isArray(data) && !TIMELINE_POINT_EVENTS.has(event)) {
      const span = this.metrics.lastClosedSpan();
      if (span && span.end !== undefined) {
        const payload = data as Record<string, unknown>;
        if (payload['elapsed_ms'] === undefined) {
          stamped = Object.assign({}, payload, {
            elapsed_ms: this.metrics.spanSelfMs(span),
            span_key: span.key,
            span_seq: span.id,
          });
        }
      }
    }
    if (Report.eventStream && this.stream_endpoint_id) {
      void Report.eventStream
        .pushToEndpoint({
          endpoint_id: this.stream_endpoint_id,
          session_key: this.session_key || this.session_id,
          run_id: this.run_id || this.work_id || undefined,
          type: event,
          payload: stamped,
        })
        .catch((err: unknown) => {
          Report.logger?.error?.('pushBusinessEvent: pushToEndpoint 失败', {
            event,
            endpoint_id: this.stream_endpoint_id,
            session_key: this.session_key || this.session_id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      return;
    }
    this.pushEvent(event, businessEventMsgType(event), stamped, meta);
  }

  

  child(meta?: ReportMeta): Report {
    const merged: ReportMeta = {
      session_id: this.session_id,
      run_id: this.run_id,
      work_id: this.work_id,
      trace_id: this.trace_id,
      agent_id: this.agent_id,
      agent_name: this.agent_name,
      agent_type: this.agent_type,
      node_id: this.node_id,
      task_id: this.task_id,
      ...meta,
    };
    return new Report(merged, this.channel);
  }

  private mergeMeta(meta?: Record<string, unknown>): Record<string, unknown> {
    const base: Record<string, unknown> = {};
    for (const key of ['session_key', 'run_id', 'stream_endpoint_id', 'work_id', 'trace_id', 'agent_id', 'agent_name', 'agent_type', 'node_id', 'task_id'] as const) {
      const value = this[key];
      if (value) base[key] = value;
    }
    return meta ? { ...base, ...meta } : base;
  }
}
