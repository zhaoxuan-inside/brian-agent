"use strict";
/**
 * @fileoverview Report 基类定义。所有 Provider 方法签名中的第 5 个参数（上报对象）都必须继承此基类。
 *
 * 方法签名规范：`Boolean method(XxxInput, XxxOutput, XxxContext, XxxMetrics, XxxReport)`。
 * Report 负责将方法执行过程中的信息上报给客户端。
 *
 * 底层对接 StreamProvider（BrianSSEMessage 协议）：调用方构造 Report 时注入
 * ReportChannel（通常由 StreamAccess 适配而来），方法内通过 pushText/pushEvent 上报。
 * 未注入 channel 时（如非流式调用）自动静默降级为 no-op。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Report = void 0;
/**
 * Report 基类。
 *
 * 用法示例：
 * ```typescript
 * const report = new Report({ session_id, work_id, trace_id }, channel);
 * // 方法内部：
 * report.pushText('answer', '部分回答内容');
 * report.pushEvent('dag_update', 'DAG', { nodes });
 * ```
 */
class Report {
    session_id;
    interact_id;
    work_id;
    trace_id;
    agent_id;
    agent_name;
    agent_type;
    node_id;
    task_id;
    channel;
    constructor(meta, channel) {
        if (meta)
            Object.assign(this, meta);
        this.channel = channel;
    }
    /** 上报文本内容（服务端自动分片，前端打字机效果） */
    pushText(event, text, meta) {
        if (!this.channel || !this.session_id)
            return;
        this.channel.pushText(this.session_id, event, text, this.mergeMeta(meta));
    }
    /** 上报结构化事件 */
    pushEvent(event, msgType, data, meta) {
        if (!this.channel || !this.session_id)
            return;
        this.channel.pushEvent(this.session_id, event, msgType, data, this.mergeMeta(meta));
    }
    /**
     * 派生子 Report：继承当前定位信息并覆盖部分字段，
     * 供编排层将上报上下文传递给子 Agent / 子任务。
     */
    child(meta) {
        const merged = {
            session_id: this.session_id,
            interact_id: this.interact_id,
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
    mergeMeta(meta) {
        const base = {};
        for (const key of ['interact_id', 'work_id', 'trace_id', 'agent_id', 'agent_name', 'agent_type', 'node_id', 'task_id']) {
            const value = this[key];
            if (value)
                base[key] = value;
        }
        return meta ? { ...base, ...meta } : base;
    }
}
exports.Report = Report;
//# sourceMappingURL=Report.js.map