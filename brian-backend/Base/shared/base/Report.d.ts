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
/**
 * 上报通道接口。与 Base/StreamProvider 的 pushText/pushEvent 方法结构一致，
 * 由调用方（如 dev-server 装配层或上层模块）适配注入，避免 base 内部循环依赖。
 */
export interface ReportChannel {
    pushText(sessionId: string, event: string, text: string, meta?: Record<string, unknown>): void;
    pushEvent(sessionId: string, event: string, msgType: string, data: unknown, meta?: Record<string, unknown>): void;
}
/**
 * 上报消息的定位信息，写入 BrianSSEMessage 的对应字段。
 */
export interface ReportMeta {
    session_id?: string;
    interact_id?: string;
    work_id?: string;
    trace_id?: string;
    agent_id?: string;
    agent_name?: string;
    agent_type?: string;
    node_id?: string;
    task_id?: string;
}
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
export declare class Report {
    session_id?: string;
    interact_id?: string;
    work_id?: string;
    trace_id?: string;
    agent_id?: string;
    agent_name?: string;
    agent_type?: string;
    node_id?: string;
    task_id?: string;
    protected channel?: ReportChannel;
    constructor(meta?: ReportMeta, channel?: ReportChannel);
    /** 上报文本内容（服务端自动分片，前端打字机效果） */
    pushText(event: string, text: string, meta?: Record<string, unknown>): void;
    /** 上报结构化事件 */
    pushEvent(event: string, msgType: string, data: unknown, meta?: Record<string, unknown>): void;
    /**
     * 派生子 Report：继承当前定位信息并覆盖部分字段，
     * 供编排层将上报上下文传递给子 Agent / 子任务。
     */
    child(meta?: ReportMeta): Report;
    private mergeMeta;
}
//# sourceMappingURL=Report.d.ts.map