/**
 * SSE 线上事件全集（前端 mirror）。
 *
 * 与后端 `Base/shared/base/BusinessEvent.ts` 同构——后端为唯一注册点，
 * 此处为前端的类型安全镜像；两端修改必须同步。
 * 命名规范：统一 `主体.动作` 点分风格，主体 = 领域对象，动作 = 祈使语气。
 */

/** 业务事件（Runtime v2 事件协议，Report.pushBusinessEvent 上报、StreamProvider 持久化/投递） */
export const BusinessEvent = {
  // run 生命周期
  RunAccepted: 'run.accepted',
  RunStarted: 'run.started',
  RunFinished: 'run.finished',
  RunFailed: 'run.failed',
  // 回复正文
  PartUpdated: 'part.updated',
  ReplyCreated: 'reply.created',
  ReplyDelta: 'reply.delta',
  // 思考过程
  ThinkCreated: 'think.created',
  ThinkDelta: 'think.delta',
  // 工具执行
  ToolStarted: 'tool.started',
  ToolResult: 'tool.result',
  // 编排原语
  PlanUpdated: 'plan.updated',
  PermissionAsked: 'permission.asked',
  PermissionAnswered: 'permission.answered',
  // 过程可观测
  ContextBuilt: 'context.built',
  AgentSelected: 'agent.selected',
  AgentComponents: 'agent.components',
  // 错误与块流
  ErrorOccurred: 'error.occurred',
  MessageBlock: 'message.block',
} as const

/** 会话传输帧（ChatService 直发，非业务事件） */
export const SseTransportEvent = {
  Connected: 'session.connected',
  Loading: 'session.loading',
  Done: 'session.done',
} as const

/** SSE 线上事件名全集 */
export type SseEventName =
  | (typeof BusinessEvent)[keyof typeof BusinessEvent]
  | (typeof SseTransportEvent)[keyof typeof SseTransportEvent]

/** 展示区域（决定事件渲染到消息流的哪个块区域） */
export type EventUiArea = 'text' | 'thinking' | 'action' | 'output' | 'lifecycle' | 'error'

/** 事件 → 展示样式映射（组件按此渲染每个事件的区域与样式类） */
export interface EventUiStyle {
  area: EventUiArea
  tone: 'default' | 'success' | 'error' | 'muted'
}

/** 全事件展示样式映射表（唯一注册点；新增事件必须同步登记） */
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
  [BusinessEvent.ToolStarted]: { area: 'action', tone: 'default' },
  [BusinessEvent.ToolResult]: { area: 'output', tone: 'default' },
  [BusinessEvent.PlanUpdated]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.PermissionAsked]: { area: 'lifecycle', tone: 'default' },
  [BusinessEvent.PermissionAnswered]: { area: 'lifecycle', tone: 'muted' },
  [BusinessEvent.ContextBuilt]: { area: 'thinking', tone: 'muted' },
  [BusinessEvent.AgentSelected]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.AgentComponents]: { area: 'thinking', tone: 'default' },
  [BusinessEvent.ErrorOccurred]: { area: 'error', tone: 'error' },
  [BusinessEvent.MessageBlock]: { area: 'text', tone: 'default' },
  [SseTransportEvent.Connected]: { area: 'lifecycle', tone: 'muted' },
  [SseTransportEvent.Loading]: { area: 'lifecycle', tone: 'muted' },
  [SseTransportEvent.Done]: { area: 'lifecycle', tone: 'success' },
}
