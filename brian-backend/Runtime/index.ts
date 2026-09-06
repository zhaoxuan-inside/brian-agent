/**
 * @fileoverview Runtime 编排内核（Runtime v2）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md`：
 * 代码即编排 —— 单一两级 agent 循环 + 消息/Part 模型 + 编排原语工具化 +
 * 事件总线投影。弃用 JSONNode workflow 与 ExecutionRule 状态机。
 *
 * 阶段 0 骨架：shared（IterationBudget · AbortReason · LLMEvent re-export）。
 * 子模块：Session / Runs / Loop / Tools / Agents（事件流功能由 StreamProvider 承载，2026-09-05）
 * （见各子 PRD）。
 */

// shared：预算 · 取消 · run 协议枚举 · LLMEvent/BusinessEvent 再导出
export { IterationBudget } from './shared/IterationBudget';
export type { BudgetSpec } from './shared/IterationBudget';
export { AbortReason, RunPhase, DEFAULT_BUDGET_TOTAL } from './shared/types';
export { BusinessEvent, businessEventMsgType, SseTransportEvent } from '@brian-agent/base';
export type { BusinessEventKind } from '@brian-agent/base';
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
  LoopStopReason,
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

// Agents：声明式定义 · 确定性匹配 · 组件快照（阶段3 前置）
export { AgentDefAccess, AgentsSchemaInitializer } from './Agents';
export {
  AgentDefContext,
  AgentMode,
  AgentDefStatus,
  AgentMatchLayer,
  MatchAgentDefInput,
  MatchAgentDefOutput,
  SoAgentSnapshotInput,
  SoAgentSnapshotOutput,
  DeclareAgentInput,
  DeclareAgentOutput,
  SoAgentDefsInput,
  SoAgentDefsOutput,
  ConfigAgentDefInput,
  ConfigAgentDefOutput,
  RUNTIME_AGENT_DEF_TABLE,
  RUNTIME_AGENTS_CONFIG_TABLE,
} from './Agents';
export type {
  AgentDefRecord,
  AgentSnapshot,
  SnapshotToolEntry,
  AgentDefComponents,
} from './Agents';

// Runs：运行网关（两段式 · session lane · 队列模式）（阶段3/4 前置）
export { RunGatewayAccess, RunsSchemaInitializer } from './Runs';
export {
  RunGatewayContext,
  SubmitRunInput,
  SubmitRunOutput,
  WaitRunInput,
  WaitRunOutput,
  SteerRunInput,
  SteerRunOutput,
  AbortRunInput,
  AbortRunOutput,
  SoRunStatusInput,
  SoRunStatusOutput,
  ConfigRunsInput,
  ConfigRunsOutput,
  QueueMode,
  RunStatus,
  RUNTIME_RUN_TABLE,
  RUNTIME_RUNS_CONFIG_TABLE,
} from './Runs';
export type {
  RunRecord,
} from './Runs';


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
  ConfigSessionInput,
  ConfigSessionOutput,
  MessageRole,
  SessionStatus,
  PartType,
  PartStatus,
  RUNTIME_SESSION_TABLE,
  RUNTIME_MESSAGE_TABLE,
  RUNTIME_MESSAGE_PART_TABLE,
  RUNTIME_SESSION_CONFIG_TABLE,
} from './Session';
export type {
  MessageWithParts,
  PartRecord,
} from './Session';
export type { LoopQueue } from './Loop';
