/**
 * @fileoverview Runtime 编排内核共享类型（Runtime v2 · 阶段 0 骨架）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md` §4：
 * shared 提供 IterationBudget · AbortReason · LLMEvent 类型（LLMEvent 在
 * Base/shared/llm/LLMEvent.ts 定义，此处 re-export —— Base 生产流事件，
 * 类型归属 Base，Runtime 消费）。
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

// 类型化取消（OpenClaw turn-interruption 范式）
export { AbortedError, type AbortReasonKind } from '@brian-agent/base';

// IterationBudget（Hermes 迭代预算范式）
export { IterationBudget, BUDGET_GRACE_MARKER } from './IterationBudget';
export type { BudgetSpec } from './IterationBudget';
