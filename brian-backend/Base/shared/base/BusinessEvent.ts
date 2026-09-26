export enum BusinessEvent {
  
  
  RunAccepted = 'run.accepted',
  
  RunStarted = 'run.started',
  
  RunFinished = 'run.finished',
  
  RunFailed = 'run.failed',

  
  
  ReplyCreated = 'reply.created',
  
  ReplyDelta = 'reply.delta',

  
  
  ThinkCreated = 'think.created',
  
  ThinkDelta = 'think.delta',

  
  
  SkillStarted = 'skill.started',
  
  SkillResult = 'skill.result',

  
  
  PlanUpdated = 'plan.updated',
  
  PermissionAsked = 'permission.asked',
  
  PermissionAnswered = 'permission.answered',

  
  
  ContextBuilt = 'context.built',
  
  AgentSelected = 'agent.selected',
  
  AgentComponents = 'agent.components',
  
  IntentAnalyzed = 'intent.analyzed',
  
  IntentStarted = 'intent.started',
  
  EvaluationStarted = 'evaluation.started',
  
  WriterStarted = 'writer.started',
  
  AgentBuilt = 'agent.built',
  
  LlmSelected = 'llm.selected',
  
  PromptSelected = 'prompt.selected',
  
  SkillSelected = 'skill.selected',
  
  McpSelected = 'mcp.selected',
  
  EvaluationCompleted = 'evaluation.completed',
  
  WriterCompleted = 'writer.completed',
  
  AgentDisbanded = 'agent.disbanded',
  
  SoulSelected = 'soul.selected',
  
  ThoughtModeSelected = 'thought.selected',
  
  LoopTurnStarted = 'loop.turn.started',
  
  LoopTurnResult = 'loop.turn.result',
  

  LoopTurnCompleted = 'loop.turn.completed',

  
  
  ErrorOccurred = 'error.occurred',
  
  MessageBlock = 'message.block',
}

export type BusinessEventKind = `${BusinessEvent}`;

export const TIMELINE_POINT_EVENTS: ReadonlySet<BusinessEvent> = new Set([
  
  BusinessEvent.RunAccepted,
  BusinessEvent.RunStarted,
  BusinessEvent.RunFinished,
  BusinessEvent.RunFailed,
  
  BusinessEvent.IntentStarted,
  BusinessEvent.EvaluationStarted,
  BusinessEvent.WriterStarted,
  
  BusinessEvent.ReplyCreated,
  BusinessEvent.ThinkCreated,
  
  BusinessEvent.LoopTurnStarted,
  
  BusinessEvent.SkillStarted,
  
  BusinessEvent.PermissionAsked,
  BusinessEvent.PermissionAnswered,
]);

export function businessEventMsgType(event: BusinessEvent): 'TEXT' | 'TRACE' {
  return event === BusinessEvent.ReplyDelta || event === BusinessEvent.ThinkDelta
    ? 'TEXT'
    : 'TRACE';
}

export enum SseTransportEvent {
  Connected = 'session.connected',
  Loading = 'session.loading',
  Done = 'session.done',
}

export enum TimelineItemKind {
  Lifecycle = 'lifecycle',
  LifecycleOk = 'lifecycle-ok',
  LifecycleFail = 'lifecycle-fail',
  Intent = 'intent',
  Agent = 'agent',
  Model = 'model',
  Context = 'context',
  Think = 'think',
  Reply = 'reply',
  Tool = 'tool',
  ToolOk = 'tool-ok',
  ToolFail = 'tool-fail',
  Plan = 'plan',
  Permission = 'permission',
  PermissionOk = 'permission-ok',
  PermissionDeny = 'permission-deny',
  Eval = 'eval',
  Writer = 'writer',
}
