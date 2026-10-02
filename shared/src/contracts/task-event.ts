/**
 * TaskEvent 契约（OBS v2 · ADR-013）
 * 一次任务执行产生的唯一事件形态：执行层只 emit，传输/持久化/投影全部由本契约驱动。
 * 纯 TS + zod，无 node 依赖，前后端同构消费。
 */
import { z } from 'zod'

export const TASK_EVENT_VERSION = 1 as const

export const TaskEventKind = {
  Lifecycle: 'lifecycle',
  Assembly: 'assembly',
  Context: 'context',
  Reasoning: 'reasoning',
  Reply: 'reply',
  Tool: 'tool',
  Llm: 'llm',
  Permission: 'permission',
  Eval: 'eval',
  Writer: 'writer',
  Error: 'error',
} as const

export type TaskEventKind = typeof TaskEventKind[keyof typeof TaskEventKind]

/** 32 个最终事件名（原 BusinessEvent 收敛，死事件已删除） */
export const TaskEventType = {
  RunAccepted: 'run.accepted',
  RunStarted: 'run.started',
  RunFinished: 'run.finished',
  RunFailed: 'run.failed',
  LoopTurnStarted: 'loop.turn.started',
  LoopTurnResult: 'loop.turn.result',
  LoopTurnCompleted: 'loop.turn.completed',
  IntentStarted: 'intent.started',
  IntentAnalyzed: 'intent.analyzed',
  RunMerge: 'run.merge',
  AgentSelected: 'agent.selected',
  AgentBuilt: 'agent.built',
  AgentDisbanded: 'agent.disbanded',
  AgentComponents: 'agent.components',
  ThoughtSelected: 'thought.selected',
  SoulSelected: 'soul.selected',
  PromptSelected: 'prompt.selected',
  SkillSelected: 'skill.selected',
  McpSelected: 'mcp.selected',
  LlmSelected: 'llm.selected',
  ComponentFunnel: 'component.funnel',
  ContextBuilt: 'context.built',
  ProfileSnapshot: 'profile.snapshot',
  ThinkCreated: 'think.created',
  ThinkDelta: 'think.delta',
  ReplyCreated: 'reply.created',
  ReplyDelta: 'reply.delta',
  SkillStarted: 'skill.started',
  SkillResult: 'skill.result',
  LlmInvoked: 'llm.invoked',
  PermissionAsked: 'permission.asked',
  PermissionAnswered: 'permission.answered',
  EvaluationStarted: 'evaluation.started',
  EvaluationCompleted: 'evaluation.completed',
  WriterStarted: 'writer.started',
  WriterCompleted: 'writer.completed',
  ErrorOccurred: 'error.occurred',
} as const

export type TaskEventType = typeof TaskEventType[keyof typeof TaskEventType]

const KIND_BY_TYPE: Record<string, TaskEventKind> = {
  [TaskEventType.RunAccepted]: TaskEventKind.Lifecycle,
  [TaskEventType.RunStarted]: TaskEventKind.Lifecycle,
  [TaskEventType.RunFinished]: TaskEventKind.Lifecycle,
  [TaskEventType.RunFailed]: TaskEventKind.Lifecycle,
  [TaskEventType.LoopTurnStarted]: TaskEventKind.Lifecycle,
  [TaskEventType.LoopTurnResult]: TaskEventKind.Lifecycle,
  [TaskEventType.LoopTurnCompleted]: TaskEventKind.Lifecycle,
  [TaskEventType.IntentStarted]: TaskEventKind.Lifecycle,
  [TaskEventType.IntentAnalyzed]: TaskEventKind.Lifecycle,
  [TaskEventType.RunMerge]: TaskEventKind.Lifecycle,
  [TaskEventType.AgentSelected]: TaskEventKind.Assembly,
  [TaskEventType.AgentBuilt]: TaskEventKind.Assembly,
  [TaskEventType.AgentDisbanded]: TaskEventKind.Assembly,
  [TaskEventType.AgentComponents]: TaskEventKind.Assembly,
  [TaskEventType.ThoughtSelected]: TaskEventKind.Assembly,
  [TaskEventType.SoulSelected]: TaskEventKind.Assembly,
  [TaskEventType.PromptSelected]: TaskEventKind.Assembly,
  [TaskEventType.SkillSelected]: TaskEventKind.Assembly,
  [TaskEventType.McpSelected]: TaskEventKind.Assembly,
  [TaskEventType.LlmSelected]: TaskEventKind.Assembly,
  [TaskEventType.ComponentFunnel]: TaskEventKind.Assembly,
  [TaskEventType.ContextBuilt]: TaskEventKind.Context,
  [TaskEventType.ProfileSnapshot]: TaskEventKind.Context,
  [TaskEventType.ThinkCreated]: TaskEventKind.Reasoning,
  [TaskEventType.ThinkDelta]: TaskEventKind.Reasoning,
  [TaskEventType.ReplyCreated]: TaskEventKind.Reply,
  [TaskEventType.ReplyDelta]: TaskEventKind.Reply,
  [TaskEventType.SkillStarted]: TaskEventKind.Tool,
  [TaskEventType.SkillResult]: TaskEventKind.Tool,
  [TaskEventType.LlmInvoked]: TaskEventKind.Llm,
  [TaskEventType.PermissionAsked]: TaskEventKind.Permission,
  [TaskEventType.PermissionAnswered]: TaskEventKind.Permission,
  [TaskEventType.EvaluationStarted]: TaskEventKind.Eval,
  [TaskEventType.EvaluationCompleted]: TaskEventKind.Eval,
  [TaskEventType.WriterStarted]: TaskEventKind.Writer,
  [TaskEventType.WriterCompleted]: TaskEventKind.Writer,
  [TaskEventType.ErrorOccurred]: TaskEventKind.Error,
}

export function kindOf(type: string): TaskEventKind {
  return KIND_BY_TYPE[type] ?? TaskEventKind.Lifecycle
}

/** Metrics span 快照（发射时定格，取代 push 时打戳） */
export const EventSpanSchema = z.object({
  key: z.string().default(''),
  depth: z.number().default(0),
  self_ms: z.number().default(0),
  total_ms: z.number().default(0),
})

/** 跨记录关联（execute_record / runtime_message_part / runtime_message / permission） */
export const EventRefSchema = z.object({
  execute_id: z.string().optional(),
  part_id: z.string().optional(),
  msg_id: z.string().optional(),
  tool_call_id: z.string().optional(),
  permission_id: z.string().optional(),
})

export const TaskEventBaseSchema = z.object({
  v: z.literal(1).default(1),
  seq: z.number().int().min(1),
  ts: z.number(),
  session_id: z.string(),
  run_id: z.string(),
  work_id: z.string().default(''),
  agent_id: z.string().optional(),
  round: z.number().int().optional(),
  span: EventSpanSchema.optional(),
  ref: EventRefSchema.optional(),
  kind: z.string(),
  type: z.string(),
  payload: z.unknown(),
})

export type TaskEventBase = z.infer<typeof TaskEventBaseSchema>
export type EventSpan = z.infer<typeof EventSpanSchema>
export type EventRef = z.infer<typeof EventRefSchema>
export type TaskEvent = TaskEventBase & { payload: unknown }

/** 以已有对象快速组一个 envelope（seq/会话等由 EventDispatcher 填充） */
export function makeTaskEvent(partial: Partial<TaskEventBase> & { type: string; payload: unknown }): TaskEvent {
  return {
    v: TASK_EVENT_VERSION,
    seq: partial.seq ?? 0,
    ts: partial.ts ?? Date.now(),
    session_id: partial.session_id ?? '',
    run_id: partial.run_id ?? '',
    work_id: partial.work_id ?? '',
    agent_id: partial.agent_id,
    round: partial.round,
    span: partial.span,
    ref: partial.ref,
    kind: kindOf(partial.type),
    type: partial.type,
    payload: partial.payload,
  }
}
