export const BusinessEvent = {
  
  RunAccepted: 'run.accepted',
  RunStarted: 'run.started',
  RunFinished: 'run.finished',
  RunFailed: 'run.failed',
  
  PartUpdated: 'part.updated',
  ReplyCreated: 'reply.created',
  ReplyDelta: 'reply.delta',
  
  ThinkCreated: 'think.created',
  ThinkDelta: 'think.delta',
  
  SkillStarted: 'skill.started',
  SkillResult: 'skill.result',
  
  PlanUpdated: 'plan.updated',
  PermissionAsked: 'permission.asked',
  PermissionAnswered: 'permission.answered',
  
  ContextBuilt: 'context.built',
  AgentSelected: 'agent.selected',
  AgentComponents: 'agent.components',
  IntentAnalyzed: 'intent.analyzed',
  IntentStarted: 'intent.started',
  EvaluationStarted: 'evaluation.started',
  WriterStarted: 'writer.started',
  AgentBuilt: 'agent.built',
  LlmSelected: 'llm.selected',
  LlmInvoked: 'llm.invoked',
  SoulSelected: 'soul.selected',
  ThoughtModeSelected: 'thought.selected',
  PromptSelected: 'prompt.selected',
  SkillSelected: 'skill.selected',
  McpSelected: 'mcp.selected',
  EvaluationCompleted: 'evaluation.completed',
  WriterCompleted: 'writer.completed',
  LoopTurnStarted: 'loop.turn.started',
  LoopTurnResult: 'loop.turn.result',
  LoopTurnCompleted: 'loop.turn.completed',
  
  ErrorOccurred: 'error.occurred',
  MessageBlock: 'message.block',
} as const

export const SseTransportEvent = {
  Connected: 'session.connected',
  Loading: 'session.loading',
  Done: 'session.done',
} as const

export type SseEventName =
  | (typeof BusinessEvent)[keyof typeof BusinessEvent]
  | (typeof SseTransportEvent)[keyof typeof SseTransportEvent]

export type EventUiArea = 'text' | 'thinking' | 'action' | 'output' | 'lifecycle' | 'error'

export interface EventUiStyle {
  area: EventUiArea
  tone: 'default' | 'success' | 'error' | 'muted'
}

export const EVENT_UI_STYLE: Record<SseEventName, EventUiStyle> = {
  [BusinessEvent.RunAccepted]: { area: 'lifecycle', tone: 'muted' },
  [BusinessEvent.RunStarted]: { area: 'lifecycle', tone: 'muted' },
  [BusinessEvent.RunFinished]: { area: 'lifecycle', tone: 'success' },
  [BusinessEvent.RunFailed]: { area: 'error', tone: 'error' },
  [BusinessEvent.PartUpdated]: { area: 'lifecycle', tone: 'muted' },
  [BusinessEvent.ReplyCreated]: { area: 'text', tone: 'default' },
  [BusinessEvent.ReplyDelta]: { area: 'text', tone: 'default' },
  [BusinessEvent.ThinkCreated]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.ThinkDelta]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.SkillStarted]: { area: 'action', tone: 'default' },
  [BusinessEvent.SkillResult]: { area: 'output', tone: 'default' },
  [BusinessEvent.PlanUpdated]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.PermissionAsked]: { area: 'lifecycle', tone: 'default' },
  [BusinessEvent.PermissionAnswered]: { area: 'lifecycle', tone: 'muted' },
  [BusinessEvent.ContextBuilt]: { area: 'thinking', tone: 'muted' },
  [BusinessEvent.AgentSelected]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.AgentComponents]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.IntentAnalyzed]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.IntentStarted]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.EvaluationStarted]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.WriterStarted]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.AgentBuilt]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.LlmSelected]: { area: 'thinking', tone: 'muted' },
  [BusinessEvent.LlmInvoked]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.SoulSelected]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.ThoughtModeSelected]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.PromptSelected]: { area: 'thinking', tone: 'muted' },
  [BusinessEvent.SkillSelected]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.McpSelected]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.EvaluationCompleted]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.WriterCompleted]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.LoopTurnStarted]: { area: 'lifecycle', tone: 'muted' },
  [BusinessEvent.LoopTurnResult]: { area: 'lifecycle', tone: 'default' },
  [BusinessEvent.LoopTurnCompleted]: { area: 'lifecycle', tone: 'muted' },
  [BusinessEvent.ErrorOccurred]: { area: 'error', tone: 'error' },
  [BusinessEvent.MessageBlock]: { area: 'text', tone: 'default' },
  [SseTransportEvent.Connected]: { area: 'lifecycle', tone: 'muted' },
  [SseTransportEvent.Loading]: { area: 'lifecycle', tone: 'muted' },
  [SseTransportEvent.Done]: { area: 'lifecycle', tone: 'success' },
}

export const TimelineItemKind = {
  Lifecycle: 'lifecycle',
  LifecycleOk: 'lifecycle-ok',
  LifecycleFail: 'lifecycle-fail',
  Intent: 'intent',
  Agent: 'agent',
  Model: 'model',
  Context: 'context',
  Think: 'think',
  Reply: 'reply',
  Tool: 'tool',
  ToolOk: 'tool-ok',
  ToolFail: 'tool-fail',
  Plan: 'plan',
  Permission: 'permission',
  PermissionOk: 'permission-ok',
  PermissionDeny: 'permission-deny',
  Eval: 'eval',
  Writer: 'writer',
} as const

export type TimelineItemKind = (typeof TimelineItemKind)[keyof typeof TimelineItemKind]
