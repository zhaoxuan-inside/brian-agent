export interface MetricsLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  

  log?(level: string, message: string, meta?: Record<string, unknown>): void;
}
export interface LLMCallUsageMetrics {
  
  
  llm_id?: string;
  
  
  attempt?: number;
  
  input_tokens: number;
  
  output_tokens: number;
  
  duration_ms: number;

  
  
  connect_ms?: number;
  
  
  ttft_ms?: number;
  
  
  stream_ms?: number;
}
export interface MetricsSpan {
  
  id: number;
  
  key: string;
  
  start: number;
  
  end?: number;
  
  parent?: number;
}

export class Metrics {
  
  trace_id?: string;

  
  category?: string;

  
  started_at?: number;

  
  elapsed_ms?: number;

  

  

  spans: MetricsSpan[] = [];

  
  private openSpanStack: number[] = [];

  
  private spanSeq = 0;

  

  llm_usage?: LLMCallUsageMetrics[];

  protected logger?: MetricsLogger;

  constructor(logger?: MetricsLogger, category?: string, trace_id?: string) {
    this.logger = logger;
    this.category = category;
    this.trace_id = trace_id;
    this.openSpanStack = [];
    this.spans = [];
  }

  
  

  beginSpan(key: string): MetricsSpan {
    const span: MetricsSpan = {
      id: ++this.spanSeq,
      key,
      start: Date.now(),
      parent: this.openSpanStack[this.openSpanStack.length - 1],
    };
    this.spans.push(span);
    this.openSpanStack.push(span.id);
    return span;
  }

  
  

  endSpan(handle?: MetricsSpan): MetricsSpan | undefined {
    if (handle) {
      const idx = this.openSpanStack.indexOf(handle.id);
      if (idx >= 0) this.openSpanStack.splice(idx, 1);
      const span = this.spans.find((s) => s.id === handle.id && s.end === undefined);
      if (!span) return undefined;
      span.end = Date.now();
      return span;
    }
    const id = this.openSpanStack.pop();
    if (id === undefined) return undefined;
    const span = this.spans.find((s) => s.id === id && s.end === undefined);
    if (!span) return undefined;
    span.end = Date.now();
    return span;
  }

  
  

  lastClosedSpan(): MetricsSpan | undefined {
    let best: MetricsSpan | undefined;
    for (const span of this.spans) {
      if (span.end === undefined) continue;
      if (!best || span.end > best.end!) best = span;
    }
    return best;
  }

  

  spanDuration(span: MetricsSpan): number {
    if (span.end === undefined) return 0;
    return span.end >= span.start ? span.end - span.start : 0;
  }

  
  
  

  spanDepth(span: MetricsSpan): number {
    let depth = 0;
    let current: MetricsSpan | undefined = span;
    const seen = new Set<number>();
    while (current && current.parent !== undefined && !seen.has(current.parent)) {
      seen.add(current.id);
      depth += 1;
      current = this.spans.find((s) => s.id === current!.parent);
    }
    return depth;
  }

  
  

  spanSelfMs(span: MetricsSpan): number {
    const self = this.spanDuration(span);
    if (self <= 0) return 0;
    let children = 0;
    for (const child of this.spans) {
      if (child.parent === span.id) children += this.spanDuration(child);
    }
    const value = self - children;
    return value > 0 ? value : self;
  }

  

  

  getTotalDuration(): number {
    const closed = this.spans.filter((s) => s.end !== undefined);
    if (closed.length === 0) {
      return this.elapsed_ms ?? 0;
    }
    const starts = closed.map((s) => s.start);
    const ends = closed.map((s) => s.end!);
    const minStart = Math.min(...starts);
    const maxEnd = Math.max(...ends);
    return maxEnd >= minStart ? maxEnd - minStart : 0;
  }

  

  recordLLMUsage(usage: LLMCallUsageMetrics): void {
    if (!this.llm_usage) {
      this.llm_usage = [];
    }
    this.llm_usage.push(usage);
  }

  

  
  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger?.debug?.(this.prefix(message), this.merge(meta));
  }

  
  info(message: string, meta?: Record<string, unknown>): void {
    this.logger?.info?.(this.prefix(message), this.merge(meta));
  }

  
  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger?.warn?.(this.prefix(message), this.merge(meta));
  }

  
  error(message: string, meta?: Record<string, unknown>): void {
    this.logger?.error?.(this.prefix(message), this.merge(meta));
  }

  
  

  saveInvocation(record: {
    
    targetName: string;
    
    methodName: string;
    
    status: 'ok' | 'error';
    
    error?: string;
    
    args: Record<string, unknown>;
  }): void {
    const invocation = {
      method: `${record.targetName}.${record.methodName}`,
      status: record.status,
      error: record.error,
      elapsed_ms: this.elapsed_ms,
      spans: Metrics.safeSerialize(this.spans, 8192) as unknown,
      args: Metrics.safeSerialize(record.args),
    };
    const message = `${record.methodName} ${record.status === 'ok' ? 'completed' : 'failed'}`;
    
    
    this.logAt('DEBUG', message, {
      log_source: 'AOP',
      invocation_json: JSON.stringify(invocation),
    });
  }

  

  private logAt(level: string, message: string, meta?: Record<string, unknown>): void {
    if (typeof this.logger?.log === 'function') {
      this.logger.log(level, this.prefix(message), this.merge(meta));
      return;
    }
    const text = this.prefix(message);
    const payload = this.merge(meta);
    switch (level.toUpperCase()) {
      case 'INFO':
        this.logger?.info?.(text, payload);
        return;
      case 'WARN':
        this.logger?.warn?.(text, payload);
        return;
      case 'ERROR':
        this.logger?.error?.(text, payload);
        return;
      default:
        this.logger?.debug?.(text, payload);
    }
  }

  

  static safeSerialize(value: unknown, maxChars = 4096): unknown {
    const seen = new WeakSet<object>();
    const walk = (node: unknown, depth: number): unknown => {
      if (node === null || node === undefined) return node;
      const t = typeof node;
      if (t === 'function' || t === 'symbol') return '[fn]';
      if (t !== 'object') {
        if (t === 'string' && (node as string).length > maxChars) {
          return `${(node as string).slice(0, maxChars)}…[截断,原长 ${(node as string).length}]`;
        }
        return node;
      }
      if (depth > 6) return '[深度截断]';
      if (seen.has(node as object)) return '[circular]';
      seen.add(node as object);
      if (Array.isArray(node)) {
        return node.slice(0, 50).map((item) => walk(item, depth + 1));
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        try {
          out[k] = walk(v, depth + 1);
        } catch {
          out[k] = '[unserializable]';
        }
      }
      return out;
    };
    try {
      return JSON.parse(JSON.stringify(walk(value, 0)));
    } catch {
      return `[unserializable: ${String(value).slice(0, 100)}]`;
    }
  }

  
  start(): number {
    this.started_at = Date.now();
    return this.started_at;
  }

  
  end(): number {
    if (this.started_at !== undefined) {
      this.elapsed_ms = Date.now() - this.started_at;
    }
    return this.elapsed_ms ?? 0;
  }

  private prefix(message: string): string {
    return this.category ? `${this.category} ${message}` : message;
  }

  private merge(meta?: Record<string, unknown>): Record<string, unknown> {
    const base: Record<string, unknown> = { category: this.category };
    if (this.trace_id) base.trace_id = this.trace_id;
    if (this.elapsed_ms !== undefined) base.elapsed_ms = this.elapsed_ms;
    return meta ? { ...base, ...meta } : base;
  }
}
