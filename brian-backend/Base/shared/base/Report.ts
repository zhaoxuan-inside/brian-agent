/**
 * @fileoverview Report 基类定义。所有 Provider 方法签名中的第 5 个参数（上报对象）都必须继承此基类。
 *
 * 方法签名规范：`Boolean method(XxxInput, XxxOutput, XxxContext, XxxMetrics, XxxReport)`。
 * Report 负责将方法执行过程中的信息上报给客户端。
 *
 * 底层对接 StreamProvider（BrianSSEMessage 协议）：调用方构造 Report 时注入
 * ReportChannel（通常由 StreamAccess 适配而来），方法内通过 pushText/pushEvent 上报。
 * 未注入 channel 时（如非流式调用）自动静默降级为 no-op。
 *
 * 业务事件（需要客户端感知的信息）一律经 `pushBusinessEvent` 上报，事件名必须取自
 * `BusinessEvent` 枚举（全库唯一注册点），禁止散落裸字符串。
 */

import { BusinessEvent, businessEventMsgType } from './BusinessEvent';
export { BusinessEvent, businessEventMsgType } from './BusinessEvent';
export type { BusinessEventKind } from './BusinessEvent';

/**
 * 上报通道接口。与 Base/StreamProvider 的 pushText/pushEvent 方法结构一致，
 * 由调用方（如 dev-server 装配层或上层模块）适配注入，避免 base 内部循环依赖。
 */
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

/**
 * 事件流网关接口（StreamProvider 模块适配实现；组合根经 setEventStreamGateway 注入）。
 *
 * 职责划分（2026-09-05）：Report 只负责接收业务的消息并携带 SSE 端点 ID；
 * 数据的保存、断线恢复、审计等事件流功能由 StreamProvider 按端点 ID 承载。
 */
export interface ReportEventStream {
  /** 按端点 ID 推送业务事件（StreamProvider 持久化事件并定位 SSE 端点投递） */
  pushToEndpoint(input: { endpoint_id: string; session_key?: string; run_id?: string; type: string; payload: unknown }): Promise<void>;
}

/**
 * 上报消息的定位信息，写入 BrianSSEMessage 的对应字段。
 */
export interface ReportMeta {
  session_id?: string;
  /** 外部会话标识（事件流 session_key；缺省回退 session_id） */
  session_key?: string;
  /** 运行 ID（事件流 run_id；由 AopProxy 从 Input 回填） */
  run_id?: string;
  /** SSE 端点 ID（前端创建 SSE 端点时生成，请求时携带；上报经 StreamProvider 按此定位端点） */
  stream_endpoint_id?: string;
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
export class Report {
  session_id?: string;
  /** 外部会话标识（事件流 session_key；缺省回退 session_id） */
  session_key?: string;
  /** 运行 ID（事件流 run_id） */
  run_id?: string;
  interact_id?: string;
  work_id?: string;
  trace_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_type?: string;
  node_id?: string;
  task_id?: string;

  protected channel?: ReportChannel;

  /** SSE 端点 ID（前端创建 SSE 端点时生成，请求时携带；上报时 StreamProvider 按此定位端点） */
  stream_endpoint_id?: string;

  /** 事件流网关（StreamProvider 适配；组合根启动时注入一次） */
  private static eventStream?: ReportEventStream;

  /** 注入事件流网关（组合根调用一次；StreamProvider 适配实现） */
  static setEventStreamGateway(gateway: ReportEventStream | null): void {
    Report.eventStream = gateway ?? undefined;
  }

  constructor(meta?: ReportMeta, channel?: ReportChannel) {
    if (meta) Object.assign(this, meta);
    this.channel = channel;
  }

  /** 上报文本内容（服务端自动分片，前端打字机效果） */
  pushText(event: string, text: string, meta?: Record<string, unknown>): void {
    if (!this.channel || !this.session_id) return;
    this.channel.pushText(this.session_id, event, text, this.mergeMeta(meta));
  }

  /** 上报结构化事件 */
  pushEvent(event: string, msgType: string, data: unknown, meta?: Record<string, unknown>): void {
    if (!this.channel || !this.session_id) return;
    this.channel.pushEvent(this.session_id, event, msgType, data, this.mergeMeta(meta));
  }

  /**
   * 上报业务事件（事件名必须取自 BusinessEvent 枚举）。
   *
   * 融合语义（2026-09-05）：
   * - 已 attach 发布器（Report 作为上报端点管理者）：经发布器落 Bus——持久化/审计/seq
   *   由 Bus 承担，在线投递由 Bus 扇出到本 Report 管理的端点（fire-and-forget，不阻塞业务）；
   * - 未 attach：退化为 channel 直推（仅在线，无持久化）；
   * - 两者皆无：静默 no-op（无流会话降级）。
   */
  pushBusinessEvent(event: BusinessEvent, data: unknown, meta?: Record<string, unknown>): void {
    if (Report.eventStream && this.stream_endpoint_id) {
      // 携带 SSE 端点 ID 调用 StreamProvider：保存（持久化/审计）+ 按端点 ID 投递 + 断线恢复重放
      void Report.eventStream
        .pushToEndpoint({
          endpoint_id: this.stream_endpoint_id,
          session_key: this.session_key || this.session_id,
          run_id: this.run_id || this.work_id || undefined,
          type: event,
          payload: data,
        })
        .catch(() => undefined);
      return;
    }
    this.pushEvent(event, businessEventMsgType(event), data, meta);
  }

  /**
   * 派生子 Report：继承当前定位信息并覆盖部分字段，
   * 供编排层将上报上下文传递给子 Agent / 子任务。
   */
  child(meta?: ReportMeta): Report {
    const merged: ReportMeta = {
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

  private mergeMeta(meta?: Record<string, unknown>): Record<string, unknown> {
    const base: Record<string, unknown> = {};
    for (const key of ['session_key', 'run_id', 'stream_endpoint_id', 'interact_id', 'work_id', 'trace_id', 'agent_id', 'agent_name', 'agent_type', 'node_id', 'task_id'] as const) {
      const value = this[key];
      if (value) base[key] = value;
    }
    return meta ? { ...base, ...meta } : base;
  }
}
