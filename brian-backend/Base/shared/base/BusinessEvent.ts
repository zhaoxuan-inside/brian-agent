/**
 * @fileoverview SSE 业务事件注册表（全库唯一注册点）。
 *
 * 命名规范（Runtime-PRD §9）：
 * 1. 统一 `主体.动作` 点分风格：主体 = 领域对象（run/reply/think/tool/plan/permission/
 *    context/agent/error/message），动作 = 祈使语气（accepted/started/finished/…）；
 * 2. 前端视角命名：回复正文用 reply.*、思考过程用 think.*（不暴露存储术语 part）；
 * 3. 会话传输帧（session.*）与业务事件分两个枚举，前者由 ChatService 直发、
 *    后者经 Report → StreamProvider 持久化/投递；
 * 4. 禁止在调用点书写裸字符串，一律引用枚举成员；新增事件必须同步
 *    `EVENT_UI_STYLE`（前端 sseEventTypes.ts）与前端处理器。
 *
 * 与前端 `brian-frontend/src/composables/sseEventTypes.ts` 保持同构。
 */

/** 业务事件（枚举值即线上协议事件名） */
export enum BusinessEvent {
  // —— run 生命周期 ——
  /** 受理回执（两段式 submitRun ack） */
  RunAccepted = 'run.accepted',
  /** run 开始执行 */
  RunStarted = 'run.started',
  /** run 正常收敛（stop/budget） */
  RunFinished = 'run.finished',
  /** run 异常/取消收敛 */
  RunFailed = 'run.failed',

  // —— 回复正文（前端视角） ——
  /** 回复 Part 创建 */
  ReplyCreated = 'reply.created',
  /** 回复正文增量 */
  ReplyDelta = 'reply.delta',

  // —— 思考过程 ——
  /** 思考 Part 创建 */
  ThinkCreated = 'think.created',
  /** 思考增量 */
  ThinkDelta = 'think.delta',

  // —— 工具执行 ——
  /** 工具开始执行 */
  ToolStarted = 'tool.started',
  /** 工具结果（配对完成） */
  ToolResult = 'tool.result',

  // —— 编排原语 ——
  /** 计划更新（update_plan） */
  PlanUpdated = 'plan.updated',
  /** 权限询问 */
  PermissionAsked = 'permission.asked',
  /** 权限应答 */
  PermissionAnswered = 'permission.answered',

  // —— 过程可观测 ——
  /** 上下文构建完成（含当轮 wire 消息） */
  ContextBuilt = 'context.built',
  /** Agent 选择完成（匹配层/命中 Agent） */
  AgentSelected = 'agent.selected',
  /** 组件选定清单（Soul/Skill/MCP/Prompt/LLM） */
  AgentComponents = 'agent.components',

  // —— 错误与块流 ——
  /** 错误（规范化失败消息） */
  ErrorOccurred = 'error.occurred',
  /** 块流消息（heading/code_block 投影；阶段4） */
  MessageBlock = 'message.block',
}

/** 业务事件名（字符串字面量联合，供既有 string 参数位渐进迁移） */
export type BusinessEventKind = `${BusinessEvent}`;

/**
 * 业务事件 → BrianSSEMessage.msg_type 映射。
 * 正文/思考增量为文本流（TEXT）；其余为结构化追踪事件（TRACE）。
 */
export function businessEventMsgType(event: BusinessEvent): 'TEXT' | 'TRACE' {
  return event === BusinessEvent.ReplyDelta || event === BusinessEvent.ThinkDelta
    ? 'TEXT'
    : 'TRACE';
}

/** 会话传输帧（ChatService 直发，非业务事件） */
export enum SseTransportEvent {
  Connected = 'session.connected',
  Loading = 'session.loading',
  Done = 'session.done',
}
