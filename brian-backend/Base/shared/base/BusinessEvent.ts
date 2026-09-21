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
  /** 上下文构建完成（含当轮 wire 消息与 system prompt） */
  ContextBuilt = 'context.built',
  /** Agent 选择完成（匹配层/命中 Agent） */
  AgentSelected = 'agent.selected',
  /** 组件选定清单（Soul/Skill/MCP/Prompt/LLM） */
  AgentComponents = 'agent.components',
  /** 意图识别完成（LLM 需求/意图匹配评估打分） */
  IntentAnalyzed = 'intent.analyzed',
  /** 意图分析开始（2026-09-14：意图打分 LLM 调用可达 20s，开始事件供时间线实时推进，避免静止在上一节点） */
  IntentStarted = 'intent.started',
  /** 评估开始（2026-09-14：评估 LLM 调用可达 20s，开始事件供时间线实时推进） */
  EvaluationStarted = 'evaluation.started',
  /** 写作排版开始（2026-09-14：写作 LLM 调用可达 10s，开始事件供时间线实时推进） */
  WriterStarted = 'writer.started',
  /** Agent 构建完成（未命中既有 Agent 时新建） */
  AgentBuilt = 'agent.built',
  /** LLM 选定（快照解析出模型） */
  LlmSelected = 'llm.selected',
  /** Prompt 选定（模板渲染出 system prompt） */
  PromptSelected = 'prompt.selected',
  /** Skill 选定（matchSkill 动态解析） */
  SkillSelected = 'skill.selected',
  /** MCP 选定（matchMCP 动态解析） */
  McpSelected = 'mcp.selected',
  /** 评估完成（Evolutor 对 Work/Writer Agent 的评分结论） */
  EvaluationCompleted = 'evaluation.completed',
  /** 写作排版完成（Writer 对最终输出的 Markdown/Mermaid 结构化美化） */
  WriterCompleted = 'writer.completed',
  /** Agent 解散（2026-09-11 新增；低分 < DisbandThreshold.Critical 且 system 归属时执行） */
  AgentDisbanded = 'agent.disbanded',
  /** Soul 选定/生成（2026-09-19 新增；Agent 构建阶段组件选择的独立体现） */
  SoulSelected = 'soul.selected',
  /** 思维模型选定（2026-09-19 新增；CoT/ReAct 的选择结论与理由，在 Agent 组件装配后、Loop 执行前上报） */
  ThoughtModeSelected = 'thought.selected',
  /** Loop 单轮开始（2026-09-19 新增；逐轮体现思维模型与轮次推进） */
  LoopTurnStarted = 'loop.turn.started',
  /** Loop 单轮结果（2026-09-19 新增；本轮执行结果、工具调用与是否继续执行的决策） */
  LoopTurnResult = 'loop.turn.result',
  /** Loop 单轮完成（2026-09-14 Span 框架；payload 自带该轮 LLM 调用 span self 耗时，
   *  供「深度推理思考」汇总节点的多轮求和口径） */
  LoopTurnCompleted = 'loop.turn.completed',

  // —— 错误与块流 ——
  /** 错误（规范化失败消息） */
  ErrorOccurred = 'error.occurred',
  /** 块流消息（heading/code_block 投影；阶段4） */
  MessageBlock = 'message.block',
}

/** 业务事件名（字符串字面量联合，供既有 string 参数位渐进迁移） */
export type BusinessEventKind = `${BusinessEvent}`;

/**
 * 时间点类事件（开始/结束时间点，非动作）：仅标记时间线推进，无耗时语义。
 * Report 框架对此类事件不自动盖章 elapsed_ms（2026-09-15 约定：
 * 开始与结束是时间点，不是动作；「…中」的耗时由对应完成事件携带）。
 */
export const TIMELINE_POINT_EVENTS: ReadonlySet<BusinessEvent> = new Set([
  // —— run 生命周期始末 ——
  BusinessEvent.RunAccepted,
  BusinessEvent.RunStarted,
  BusinessEvent.RunFinished,
  BusinessEvent.RunFailed,
  // —— 各环节开始（耗时由对应完成事件携带）——
  BusinessEvent.IntentStarted,
  BusinessEvent.EvaluationStarted,
  BusinessEvent.WriterStarted,
  // —— 部分/内容创建点 ——
  BusinessEvent.ReplyCreated,
  BusinessEvent.ThinkCreated,
  // —— Loop 单轮开始（耗时由 loop.turn.completed / loop.turn.result 携带）——
  BusinessEvent.LoopTurnStarted,
  // —— 工具开始（耗时由 tool.result 携带）——
  BusinessEvent.ToolStarted,
  // —— 权限询问/应答（等待用户操作，不属执行耗时）——
  BusinessEvent.PermissionAsked,
  BusinessEvent.PermissionAnswered,
]);

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

/** 执行时间线样式分类枚举（后端控制业务分类，前端按枚举绑定样式与图标） */
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
