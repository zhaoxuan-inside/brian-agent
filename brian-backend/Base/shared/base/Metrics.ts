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
 * LLM 单次调用统计记录（LLMProvider 调用侧回填）。
 */
export interface LLMCallUsageMetrics {
  /** 本次实际使用的模型 ID（降级后为最终成功候选） */
  llm_id?: string;
  /** 降级尝试序号（从 1 开始；无降级恒为 1） */
  attempt?: number;
  /** 本单次调用输入 Token 数 */
  input_tokens: number;
  /** 本单次调用输出 Token 数 */
  output_tokens: number;
  /** 本单次调用耗时（毫秒） */
  duration_ms: number;
}


/**
 * 步骤 span（2026-09-14 框架化计时核心）。
 *
 * 一切耗时都是 span：span 构成树，父节点只报告 self 时间（duration − 直接子 span 的 duration），
 * 父子包含关系在数据层即被消除（对标 OpenTelemetry span 模型）。
 *
 * 语义约定（框架级）：
 * - 每个 BusinessEvent 业务事件发射点即"刚完成的步骤"边界——发射点处最近闭合的 span 是
 *   该事件所属步骤，其 self 时间由 Report 自动盖章到 payload.elapsed_ms；
 * - 编排方法内的子步骤（如 matchAgentDef 内的 buildAgent）自动成为子 span，
 *   父节点（选择 Agent）耗时只含编排自身动作，天然不包含子步骤耗时；
 * - 同 key 多次调用（如多轮 LLM）以 id 相互区分，永不覆盖。
 */
export interface MetricsSpan {
  /** span 序号（自增；父子关系与聚合均以此定位） */
  id: number;
  /** 计时键：<层名>.<模块名>.<类名>.<方法名>[.子段]（与 AopProxy 键名规则同构） */
  key: string;
  /** 开始时间戳（毫秒） */
  start: number;
  /** 结束时间戳（毫秒）；未闭合为 undefined */
  end?: number;
  /** 父 span 序号（begin 时最近一个未闭合 span；根执行节点为 undefined） */
  parent?: number;
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

  /** ===== 原始方法（保留作为参考，2026-09-14 前扁平键计时方案，已由 Span 树替代删除）=====
   * timings: Record<string, number> = {};   // `<层>.<模块>.<类>.<方法>.start/end` 扁平键
   * recordTiming / recordStart / recordEnd / getDuration / getProcessDurations —— 同键多次调用
   * 相互覆盖（末次覆盖），父子步骤耗时无法分层，执行时间线出现包含关系；本字段与上述方法删除。
   * ===================================================================== */

  /**
   * Span 树（2026-09-14）：本 run 全部步骤的结构化计时记录，推进顺序即数组顺序。
   * AopProxy 自动为每个经由切面的服务方法调用 begin/end；业务私有段落经显式 API 补充。
   */
  spans: MetricsSpan[] = [];

  /** 当前未闭合 span 栈（数组内 span id；begin/end 维护，供父子关系自动解析） */
  private openSpanStack: number[] = [];

  /** 自增 id 游标 */
  private spanSeq = 0;

  /**
   * LLM 调用统计（2026-09-11 新增）：按调用次序累积每次 LLM 调用的
   * token 用量与单次调用耗时，由 LLMProvider 调用侧回填；
   * AOP 落 log_record 时随 Metrics 序列化自动携带。
   */
  llm_usage?: LLMCallUsageMetrics[];

  protected logger?: MetricsLogger;

  constructor(logger?: MetricsLogger, category?: string, trace_id?: string) {
    this.logger = logger;
    this.category = category;
    this.trace_id = trace_id;
    this.openSpanStack = [];
    this.spans = [];
  }

  // ===== 修改后的方法（2026-09-14）：Span 树计时框架 =====
  /**
   * 开始一个步骤 span（记录端）：
   * - parent 自动解析为当前最近一个未闭合 span（AopProxy 包装的方法调用拓扑天然构成树）；
   * - 同 key 并存多次（多轮 LLM 等）以 id 区分，互不覆盖。
   * @param key 计时键，如 `Base.LLMProvider.LLMService.execLLMEvents` 或语义子段键
   * @returns span 句柄（调 endSpan 收口）
   */
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

  // ===== 修改后的方法（2026-09-15）：按 handle 配对收口，不再依赖栈顶顺序 =====
  /**
   * 结束一个步骤 span（记录端）：begin/end 按 handle 显式配对。
   * - 传入 handle：只收口该 span（未闭合时置 end 并从栈内移除该 id）；
   *   异步交错导致 handle 未在栈顶也照样正确收口（不依赖 LIFO 假设）；
   * - 已闭合或未知的 handle：no-op（防止关错其他 span）；
   * - 缺省（无 handle）：仍收口栈顶（兼容旧缺省语义）。
   */
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

  // ===== 修改后的方法（2026-09-15）：取闭合时间戳最大（最近闭合）的 span =====
  /**
   * 读取最近一个已闭合的 span（消费端）：
   * BusinessEvent 发射点即"刚完成的步骤"，Report 自动盖章其 self 时间到 payload.elapsed_ms。
   * 异步交错下创建序 ≠ 闭合序，故按 end 时间戳取最近闭合者。
   */
  lastClosedSpan(): MetricsSpan | undefined {
    let best: MetricsSpan | undefined;
    for (const span of this.spans) {
      if (span.end === undefined) continue;
      if (!best || span.end > best.end!) best = span;
    }
    return best;
  }

  /**
   * span 耗时（毫秒，消费端）：未闭合返回 0。
   */
  spanDuration(span: MetricsSpan): number {
    if (span.end === undefined) return 0;
    return span.end >= span.start ? span.end - span.start : 0;
  }

  // ===== 修改后的方法（2026-09-15）：负 self 回退取 duration =====
  /**
   * span 的 self 耗时（毫秒，消费端）：duration − 直接子 span 的 duration 之和。
   * 异步交错时间轴下子项之和可能超过父 duration，此时不再 clamp 成 0
   * （否则该步骤会显示"无耗时"），回退退化为整段 duration。
   */
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

  /**
   * 按 key 汇总全部已闭合 span 的 self 耗时之和（消费端；多轮调用求和口径），
   * `periodMs` 参数兼容：仅对 key 完全一致的 span 求和。
   */
  sumSpanSelfMs(key: string): number {
    let total = 0;
    for (const span of this.spans) {
      if (span.key === key && span.end !== undefined) total += this.spanSelfMs(span);
    }
    return total;
  }

  /**
   * 统计总耗时（毫秒，消费端）：全部根 span（无父）从最早 start 到最晚 end 的包络；
   * 无 span 记录（旧调用形态）回退 elapsed_ms。
   */
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

  /**
   * 记录一次 LLM 调用统计（2026-09-11 新增；累积式调用）。
   */
  recordLLMUsage(usage: LLMCallUsageMetrics): void {
    if (!this.llm_usage) {
      this.llm_usage = [];
    }
    this.llm_usage.push(usage);
  }

  /**
   * 汇总 LLM 调用统计（累积合计；无记录时返回零值快照）。
   */
  summarizeLLMUsage(): { calls: number; input_tokens: number; output_tokens: number; duration_ms: number } {
    const usage = this.llm_usage ?? [];
    return {
      calls: usage.length,
      input_tokens: usage.reduce((sum, u) => sum + (u.input_tokens ?? 0), 0),
      output_tokens: usage.reduce((sum, u) => sum + (u.output_tokens ?? 0), 0),
      duration_ms: usage.reduce((sum, u) => sum + (u.duration_ms ?? 0), 0),
    };
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

  // ===== 修改后的方法 =====
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
      spans: Metrics.safeSerialize(this.spans, 8192) as unknown,
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
