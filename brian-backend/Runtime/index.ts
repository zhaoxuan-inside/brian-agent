/**
 * @fileoverview Runtime 编排内核（Runtime v2）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md`：
 * 代码即编排 —— 单一两级 agent 循环 + 消息/Part 模型 + 编排原语工具化 +
 * 事件总线投影。弃用 JSONNode workflow 与 ExecutionRule 状态机。
 *
 * 阶段 0 骨架：shared（IterationBudget · AbortReason · LLMEvent re-export）。
 * 阶段 1 起：Session / Runs / Loop / Tools / Agents / Bus 六子模块
 * （见各子 PRD）。
 */

// shared：预算 · 取消 · LLMEvent 再导出
export { IterationBudget, BUDGET_GRACE_MARKER } from './shared/IterationBudget';
export type { BudgetSpec } from './shared/IterationBudget';
export type {
  LLMEvent,
  LLMMessage,
  LLMMessageRole,
  LLMToolSpec,
  LLMToolCallWire,
  ParsedToolCall,
  TokenUsage,
} from '@brian-agent/base';
export { AbortedError } from '@brian-agent/base';
export type { AbortReasonKind } from '@brian-agent/base';

// Loop：两级 agent 循环（消息中心 · 预算 · 真取消）（阶段2）
export { LoopAccess, LoopContext } from './Loop';
export {
  ExecAgentLoopInput,
  ExecAgentLoopOutput,
  AbortLoopTurnInput,
  AbortLoopTurnOutput,
  ConfigLoopInput,
  ConfigLoopOutput,
} from './Loop';

// Tools：工具框架（zod 校验回流 · 编排原语工具化）（阶段2）
export { ToolAccess } from './Tools';
export {
  ToolContext,
  RegisterToolInput,
  RegisterToolOutput,
  ExecToolInput,
  ExecToolOutput,
  SoToolsInput,
  SoToolsOutput,
  RegisterBuiltinToolsInput,
  RegisterBuiltinToolsOutput,
  ConfigToolInput,
  ConfigToolOutput,
} from './Tools';
export type {
  ToolResult,
  ToolExecutionContext,
  ToolDef,
  AnyToolDef,
  ToolSpecJson,
} from './Tools';
export { zodToJSONSchema } from './Tools';

// Bus：事件总线（持久化事件 · 重放 · durable 投影）（阶段1）
export { EventBusAccess, BusSchemaInitializer } from './Bus';
export {
  EventBusContext,
  PublishEventInput,
  PublishEventOutput,
  SoEventReplayInput,
  SoEventReplayOutput,
  RegisterProjectionInput,
  RegisterProjectionOutput,
  UnregisterProjectionInput,
  UnregisterProjectionOutput,
  ConfigBusInput,
  ConfigBusOutput,
  RUNTIME_EVENT_TABLE,
  RUNTIME_BUS_CONFIG_TABLE,
} from './Bus';
export type {
  EventType,
  RuntimeEvent,
  EventSubscriber,
  EventSubscription,
} from './Bus';

// Session：会话 · 消息/Part · 运行忙锁（阶段1）
export { SessionAccess, SessionSchemaInitializer } from './Session';
export {
  SessionContext,
  AddSessionInput,
  AddSessionOutput,
  AddMessageInput,
  AddMessageOutput,
  AddPartInput,
  AddPartOutput,
  UpdatePartInput,
  UpdatePartOutput,
  SoMessagesInput,
  SoMessagesOutput,
  EnsureRunStateInput,
  EnsureRunStateOutput,
  ReleaseRunStateInput,
  ReleaseRunStateOutput,
  ConfigSessionInput,
  ConfigSessionOutput,
  RUNTIME_SESSION_TABLE,
  RUNTIME_MESSAGE_TABLE,
  RUNTIME_MESSAGE_PART_TABLE,
  RUNTIME_SESSION_CONFIG_TABLE,
} from './Session';
export type {
  PartType,
  PartStatus,
  MessageWithParts,
  PartRecord,
} from './Session';
