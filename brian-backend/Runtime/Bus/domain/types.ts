/**
 * @fileoverview Bus 模块领域层类型定义（Runtime v2 · 阶段1）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Bus/Bus-PRD.md` §2/§3/§4：
 * 事件总线是副作用唯一出口 —— 业务代码只发布事件，不感知传输；
 * 持久化（runtime_event，每 session seq 严格递增）+ 重放 + 内存尾随订阅。
 */

import { Input, Context, Output } from '@brian-agent/base';

/**
 * EventBus 上下文（EventBusContext）。
 */
export class EventBusContext extends Context {}

// ---------------------------------------------------------------------------
// 事件类型（Bus-PRD §4 · 11 类）
// ---------------------------------------------------------------------------

/** 事件类型（v2 事件协议；含 run 生命周期/Part 流/工具/权限/计划/块投影/错误） */
export type EventType =
  | 'run.accepted'
  | 'run.status'
  | 'part.created'
  | 'part.delta'
  | 'part.updated'
  | 'tool.launch'
  | 'tool.result'
  | 'permission.asked'
  | 'plan.updated'
  | 'message.block'
  | 'error';

/** 持久化事件对象 */
export interface RuntimeEvent {
  id: string;
  session_key: string;
  run_id?: string;
  seq: number;
  type: EventType;
  payload: unknown;
  ts: number;
}

/** 事件订阅回调（投影通道注入；SSE writer 适配层在阶段4 接线） */
export type EventSubscriber = (event: RuntimeEvent) => void;

/** 活跃订阅（registerProjection 返回；unregisterProjection 按 ID 释放） */
export interface EventSubscription {
  subscription_id: string;
  session_key: string;
  last_seq: number;
}

// ---------------------------------------------------------------------------
// publishEvent
// ---------------------------------------------------------------------------

/** publishEvent 入参 */
export class PublishEventInput extends Input {
  /** 外部会话标识 */
  session_key!: string;
  /** 引用 runtime_run.id（可选） */
  run_id?: string;
  /** 事件类型 */
  type!: EventType;
  /** 事件载荷 */
  payload!: unknown;
}

/** publishEvent 出参 */
export class PublishEventOutput extends Output {
  /** 会话内事件序号（严格递增） */
  seq!: number;
}

// ---------------------------------------------------------------------------
// soEventReplay
// ---------------------------------------------------------------------------

/** soEventReplay 入参（after_seq 之后按 seq 升序） */
export class SoEventReplayInput extends Input {
  /** 外部会话标识 */
  session_key!: string;
  /** 早于该 seq 之后的事件（缺省 0） */
  after_seq?: number;
  /** 类型过滤（可选） */
  types?: EventType[];
}

/** soEventReplayOutput */
export class SoEventReplayOutput extends Output {
  /** 事件列表（seq 升序） */
  events: RuntimeEvent[] = [];
  /** 最后一个事件 seq */
  last_seq!: number;
}

// ---------------------------------------------------------------------------
// registerProjection / unregisterProjection（durable：重放 → 直播无缝尾随）
// ---------------------------------------------------------------------------

/** registerProjection 入参 */
export class RegisterProjectionInput extends Input {
  /** 外部会话标识 */
  session_key!: string;
  /** 投影起点（重放 after_seq 之后的事件；缺省 0） */
  after_seq?: number;
  /** 投影回调（SSE writer 适配层注入；缺省仅做尾随订阅） */
  deliver?: EventSubscriber;
}

/** registerProjection 出参（durable 语义：重放已完成，last_seq 起尾随） */
export class RegisterProjectionOutput extends Output {
  /** 投影起点（重放后的事件 seq） */
  last_seq!: number;
  /** 活跃订阅 ID */
  subscription_id!: string;
}

/** unregisterProjection 入参（幂等） */
export class UnregisterProjectionInput extends Input {
  /** 活跃订阅 ID */
  subscription_id!: string;
}

/** unregisterProjection 出参 */
export class UnregisterProjectionOutput extends Output {
  /** 是否实际释放 */
  released!: boolean;
}

// ---------------------------------------------------------------------------
// configBus
// ---------------------------------------------------------------------------

/** configBus 入参 */
export class ConfigBusInput extends Input {
  /** 启用/禁用 Bus 组件（缺省 true） */
  enabled?: boolean;
  /** 事件保留期（天；0=永不清除；变更即时触发一次清理，缺省 30） */
  retention_days?: number;
}

/** configBus 出参 */
export class ConfigBusOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名
// ---------------------------------------------------------------------------

/** runtime_event 表名 */
export const RUNTIME_EVENT_TABLE = 'runtime_event';

/** runtime_bus_config 配置表名 */
export const RUNTIME_BUS_CONFIG_TABLE = 'runtime_bus_config';
