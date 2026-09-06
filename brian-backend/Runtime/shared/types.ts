/**
 * @fileoverview Runtime 编排内核共享类型（Runtime v2）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md` §4：
 * shared 提供 AbortReason / RunPhase / Budget / LLMEvent / BusinessEvent
 * （LLMEvent 在 Base/shared/llm/LLMEvent.ts 定义，BusinessEvent 在
 * Base/shared/base/BusinessEvent.ts 定义 —— 协议归属 Base，Runtime 消费）。
 */

// LLMEvent 归一化流事件（Base 生产，Runtime 消费）
export type {
  LLMEvent,
  LLMMessage,
  LLMMessageRole,
  LLMToolSpec,
  LLMToolCallWire,
  ParsedToolCall,
  TokenUsage,
} from '@brian-agent/base';

// 业务事件枚举（全库唯一注册点在 Base/shared/base/BusinessEvent.ts）
export { BusinessEvent } from '@brian-agent/base';

// 类型化取消（OpenClaw turn-interruption 范式）
export { AbortedError } from '@brian-agent/base';

/** 类型化取消原因（Loop/Runs 共用；与 Base AbortReasonKind 字面量对齐） */
export enum AbortReason {
  /** 用户主动取消 */
  User = 'user',
  /** 超时取消 */
  Timeout = 'timeout',
  /** 预算超支取消 */
  Budget = 'budget',
  /** 被更新提交取代（interrupt 队列模式） */
  Superseded = 'superseded',
}

/** run.status 事件 phase（Loop 发布 run 生命周期用） */
export enum RunPhase {
  Start = 'start',
  End = 'end',
  Error = 'error',
}

// IterationBudget（Hermes 迭代预算范式）
export { IterationBudget } from './IterationBudget';
export type { BudgetSpec } from './IterationBudget';

/** 默认迭代预算 total（Loop 缺省 / Runs 入队兜底 / Agents 声明兜底共用） */
export const DEFAULT_BUDGET_TOTAL = 60;
