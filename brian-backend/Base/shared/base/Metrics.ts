/**
 * @fileoverview Metrics 基类定义。所有 Provider 方法签名中的第 4 个参数（衡量对象）都必须继承此基类。
 *
 * 方法签名规范：`Boolean method(XxxInput, XxxOutput, XxxContext, XxxMetrics, XxxReport)`。
 * Metrics 负责方法的衡量信息：耗时统计与日志记录（封装 LogProvider 调用）。
 *
 * Metrics 由调用方显式构造传入；调用方未传时由 AopProxy 自动创建默认实例
 * （注入 wrap 时配置的 logger）。AopProxy 在方法执行完成后自动回填 elapsed_ms。
 *
 * 说明：为避免 base ↔ aop 循环依赖，此处定义与 aop/AopProxy.Logger
 * 结构一致的 MetricsLogger 接口，二者结构兼容可互相赋值。
 */

/**
 * Metrics 使用的日志记录器接口（与 aop/AopProxy 的 Logger 结构一致）。
 */
export interface MetricsLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  /**
   * 带日志级别参数的保存入口（可选；调用 LogProvider 保存日志时显式携带级别）。
   * level 取值 DEBUG/INFO/WARN/ERROR；未实现时 Metrics.logAt 按级别回退到具体方法。
   */
  log?(level: string, message: string, meta?: Record<string, unknown>): void;
}

/**
 * Metrics 基类。
 *
 * 用法示例：
 * ```typescript
 * class LLMCallMetrics extends Metrics {
 *   token_count?: number;
 * }
 * ```
 */
export class Metrics {
  /** 请求追踪 ID，由 AopProxy 从 Input/Context 提取回填 */
  trace_id?: string;

  /** 衡量类别，默认由 AopProxy 填充为 "ClassName.methodName" */
  category?: string;

  /** 方法开始执行的时间戳（毫秒），由 AopProxy 填充 */
  started_at?: number;

  /** 本次执行的耗时（毫秒），由 AopProxy 自动填充 */
  elapsed_ms?: number;

  protected logger?: MetricsLogger;

  constructor(logger?: MetricsLogger, category?: string, trace_id?: string) {
    this.logger = logger;
    this.category = category;
    this.trace_id = trace_id;
  }

  /** 记录调试日志 */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger?.debug(this.prefix(message), this.merge(meta));
  }

  /** 记录信息日志 */
  info(message: string, meta?: Record<string, unknown>): void {
    this.logger?.info?.(this.prefix(message), this.merge(meta));
  }

  /** 记录警告日志 */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger?.warn?.(this.prefix(message), this.merge(meta));
  }

  /** 记录错误日志 */
  error(message: string, meta?: Record<string, unknown>): void {
    this.logger?.error(this.prefix(message), this.merge(meta));
  }

  /**
   * 保存方法调用记录（AOP 切面在方法返回或抛异常时调用；JSON 格式）。
   *
   * 采集方法调用的全部参数（Input/Output/Context/Metrics/Report）及其内容，
   * 以 JSON 写入 LogProvider（经 logger → LogService.addLog，metadata 为 JSON）。
   * 参数内容经 safeStringify 序列化（函数/循环引用安全，超长截断）。
   */
  saveInvocation(record: {
    /** 目标类名（如 SoulService） */
    targetName: string;
    /** 方法名 */
    methodName: string;
    /** 结果状态 */
    status: 'ok' | 'error';
    /** 抛异常时的错误消息 */
    error?: string;
    /** 方法调用的全部参数（含内容；由 AopProxy 传入 Input/Output/Context/Metrics/Report） */
    args: Record<string, unknown>;
  }): void {
    const invocation = {
      method: `${record.targetName}.${record.methodName}`,
      status: record.status,
      error: record.error,
      elapsed_ms: this.elapsed_ms,
      args: Metrics.safeSerialize(record.args),
    };
    const message = `${record.methodName} ${record.status === 'ok' ? 'completed' : 'failed'}`;
    // AOP 切面的调用记录为 DEBUG 级别（经级别参数调用 LogProvider；
    // 默认 min_level=INFO 时自动过滤，排查问题可将 log 配置 min_level 调整为 DEBUG）
    this.logAt('DEBUG', message, {
      log_source: 'AOP',
      invocation_json: JSON.stringify(invocation),
    });
  }

  /**
   * 按级别参数调用 LogProvider（优先 logger.log(level, …)；
   * logger 未实现 log 时按级别回退到 debug/info/warn/error）。
   */
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
        this.logger?.error(text, payload);
        return;
      default:
        this.logger?.debug(text, payload);
    }
  }

  /**
   * 安全 JSON 序列化（静态辅助）：函数/符号 → '[fn]'，循环引用 → '[circular]'，
   * 单值字符串超长截断（保留 JSON 可解析性）。序列化失败回退为摘要字符串。
   */
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

  /** 标记计时起点（AopProxy 已自动设置 started_at，业务内分段计时可重复调用） */
  start(): number {
    this.started_at = Date.now();
    return this.started_at;
  }

  /** 结束计时并返回自 started_at 起的耗时（毫秒），同时回填 elapsed_ms */
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
