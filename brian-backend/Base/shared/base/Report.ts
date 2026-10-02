import type { Metrics } from './Metrics';
import type { ExecuteEvent, ExecuteEventSink } from './ExecuteEvent';
export { BusinessEvent } from './BusinessEvent';
export type { BusinessEventKind } from './BusinessEvent';
export type { ExecuteEvent, ExecuteEventSink } from './ExecuteEvent';
export { EXECUTE_COMPONENT_TYPES, resolveComponentType, isExecuteEventObservable } from './ExecuteEvent';
import type { EventRef, EventSpan } from '@brian-agent/shared';

/**
 * Report：执行侧观测唯一出口（ADR-013）。
 * 执行层只 emit(type, payload)，seq/落库/SSE/状态由 Observability 总线接手。
 */
export interface ReportMeta {
  session_id?: string;
  run_id?: string;
  work_id?: string;
  trace_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_type?: string;
  node_id?: string;
  task_id?: string;
  round?: number;
  stream_endpoint_id?: string;
  ref?: EventRef;
  span?: EventSpan;
}

/** 观测总线网关（由 ObservabilityAccess 实现，Server 组合根注入） */
export interface TaskEventGateway {
  emit(meta: ReportMeta, type: string, payload: unknown): void;
  flush(): Promise<void>;
}

export class Report {
  session_id?: string;
  run_id?: string;
  work_id?: string;
  trace_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_type?: string;
  node_id?: string;
  task_id?: string;
  round?: number;
  stream_endpoint_id?: string;

  /** ADR-012:最近一次 execute_event 落库行 id(供 skill.result ref.execute_id 关联) */
  last_execute_id?: string;

  protected metrics?: Metrics;

  bindMetrics(metrics: Metrics): void {
    this.metrics = metrics;
  }

  private static eventGateway?: TaskEventGateway;

  private static executeEventSink?: ExecuteEventSink;

  private static logger?: { error: (msg: string, meta?: unknown) => void };

  static setEventGateway(gateway: TaskEventGateway | null): void {
    Report.eventGateway = gateway ?? undefined;
  }

  /** 等待观测写链落库完成（run 收尾/读侧关联前调用） */
  static async flushObservability(): Promise<void> {
    try {
      await Report.eventGateway?.flush();
      await Report.executeEventSink?.flush?.();
    } catch (err) {
      Report.logger?.error?.('flushObservability 失败（不影响业务）', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  static setExecuteEventSink(sink: ExecuteEventSink | null): void {
    Report.executeEventSink = sink ?? undefined;
  }

  static setLogger(logger: { error: (msg: string, meta?: unknown) => void } | null): void {
    Report.logger = logger ?? undefined;
  }

  static emitExecuteEvent(event: ExecuteEvent, context?: Report): string | undefined {
    const sink = Report.executeEventSink;
    if (!sink) return undefined;
    const merged: ExecuteEvent = {
      ...event,
      session_id: context?.session_id || event.session_id || '',
      work_id: context?.work_id || event.work_id || '',
      run_id: context?.run_id || event.run_id || '',
      trace_id: context?.trace_id || event.trace_id || '',
      agent_id: context?.agent_id || event.agent_id || '',
    };
    try {
      const rowId = sink.push(merged);
      if (context && rowId) context.last_execute_id = rowId;
      return rowId;
    } catch (err) {
      Report.logger?.error?.('emitExecuteEvent 执行事件上报失败（不影响业务）', {
        component_id: event.component_id,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  constructor(meta?: ReportMeta, metrics?: Metrics) {
    if (meta) Object.assign(this, meta);
    this.metrics = metrics;
  }

  /** 唯一发射口：type 为事件名（shared 契约 TaskEventType），payload 按契约；ref 可选挂 execute_id 等关联 */
  emit(type: string, payload: unknown, ref?: EventRef): void {
    const gateway = Report.eventGateway;
    if (!gateway || !this.session_id) return;
    gateway.emit(this.snapshotMeta(ref), type, payload);
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
      round: this.round,
      stream_endpoint_id: this.stream_endpoint_id,
      ...meta,
    };
    return new Report(merged, this.metrics);
  }

  private snapshotMeta(ref?: EventRef): ReportMeta {
    return {
      session_id: this.session_id,
      run_id: this.run_id,
      work_id: this.work_id,
      trace_id: this.trace_id,
      agent_id: this.agent_id,
      agent_name: this.agent_name,
      agent_type: this.agent_type,
      node_id: this.node_id,
      task_id: this.task_id,
      round: this.round,
      stream_endpoint_id: this.stream_endpoint_id,
      span: this.spanSnapshot(),
      ref,
    };
  }

  private spanSnapshot(): EventSpan | undefined {
    const span = this.metrics?.lastClosedSpan();
    if (!span || span.end === undefined) return undefined;
    return {
      key: span.key,
      depth: this.metrics?.spanDepth(span) ?? 0,
      self_ms: this.metrics?.spanSelfMs(span) ?? 0,
      total_ms: this.metrics?.spanDuration(span) ?? 0,
    };
  }
}
