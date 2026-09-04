"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Metrics = void 0;
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
class Metrics {
    /** 请求追踪 ID，由 AopProxy 从 Input/Context 提取回填 */
    trace_id;
    /** 衡量类别，默认由 AopProxy 填充为 "ClassName.methodName" */
    category;
    /** 方法开始执行的时间戳（毫秒），由 AopProxy 填充 */
    started_at;
    /** 本次执行的耗时（毫秒），由 AopProxy 自动填充 */
    elapsed_ms;
    logger;
    constructor(logger, category, trace_id) {
        this.logger = logger;
        this.category = category;
        this.trace_id = trace_id;
    }
    /** 记录调试日志 */
    debug(message, meta) {
        this.logger?.debug(this.prefix(message), this.merge(meta));
    }
    /** 记录信息日志 */
    info(message, meta) {
        this.logger?.info?.(this.prefix(message), this.merge(meta));
    }
    /** 记录警告日志 */
    warn(message, meta) {
        this.logger?.warn?.(this.prefix(message), this.merge(meta));
    }
    /** 记录错误日志 */
    error(message, meta) {
        this.logger?.error(this.prefix(message), this.merge(meta));
    }
    /** 标记计时起点（AopProxy 已自动设置 started_at，业务内分段计时可重复调用） */
    start() {
        this.started_at = Date.now();
        return this.started_at;
    }
    /** 结束计时并返回自 started_at 起的耗时（毫秒），同时回填 elapsed_ms */
    end() {
        if (this.started_at !== undefined) {
            this.elapsed_ms = Date.now() - this.started_at;
        }
        return this.elapsed_ms ?? 0;
    }
    prefix(message) {
        return this.category ? `${this.category} ${message}` : message;
    }
    merge(meta) {
        const base = { category: this.category };
        if (this.trace_id)
            base.trace_id = this.trace_id;
        if (this.elapsed_ms !== undefined)
            base.elapsed_ms = this.elapsed_ms;
        return meta ? { ...base, ...meta } : base;
    }
}
exports.Metrics = Metrics;
//# sourceMappingURL=Metrics.js.map