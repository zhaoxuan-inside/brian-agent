/**
 * @fileoverview Session 模块领域层类型定义（Runtime v2 · 阶段1）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Session/Session-PRD.md`：
 * 会话（session）→ 消息（message）→ Part（message_part）三级模型，
 * 循环控制状态全部从持久化 Part 派生（OpenCode 消息中心范式）。
 *
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，
 * 所有 Output 继承 {@link Output}（`@brian-agent/base`）。
 */

import { Input, Context, Output } from '@brian-agent/base';

/**
 * Session 上下文（SessionContext）。
 */
export class SessionContext extends Context {}

// ---------------------------------------------------------------------------
// Part 类型枚举与状态机
// ---------------------------------------------------------------------------

/**
 * Part 类型（Session-PRD §1.2）：
 * - reasoning：思考/推理内容（思考面板）
 * - text：回复内容（回复面板）
 * - tool：工具调用（每个 toolCall 必有配对 result —— append-only 结构不变量）
 * - steering：边界抽干注入的排队消息
 * - subtask：delegate 子任务引用
 */
export type PartType = 'reasoning' | 'text' | 'tool' | 'steering' | 'subtask';

/**
 * Part 状态机（tool Part）：pending → running → completed/error/aborted。
 * aborted 必带类型化 abort 原因（写入 output_json，规范化失败消息）。
 */
export type PartStatus = 'pending' | 'running' | 'completed' | 'error' | 'aborted';

// ---------------------------------------------------------------------------
// 数据对象
// ---------------------------------------------------------------------------

/**
 * 消息数据对象（MessageData）。
 */
export interface MessageData {
  role: 'user' | 'assistant';
  content: string;
  token_usage?: number;
}

/**
 * 消息含 Parts 的复合对象（soMessages 返回）。
 */
export interface MessageWithParts {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  seq: number;
  run_id?: string;
  created: number;
  parts: PartRecord[];
}

/**
 * Part 表记录（含系统字段）。
 */
export interface PartRecord {
  id: string;
  message_id: string;
  run_id?: string;
  part_type: PartType;
  part_order: number;
  content: string;
  tool_id?: string;
  input_json?: string;
  output_json?: string;
  status: PartStatus;
  block_type?: string;
  block_meta?: string;
  token_count: number;
  elapsed_ms: number;
  created: number;
  updated: number;
}

// ---------------------------------------------------------------------------
// addSession
// ---------------------------------------------------------------------------

/** addSession 入参（幂等：session_key 已存在返回既有 id） */
export class AddSessionInput extends Input {
  /** 外部会话标识（唯一） */
  session_key!: string;
  /** 会话标题 */
  title?: string;
  /** 引用 runtime_agent_def.id（阶段3 声明代理；空串=运行时解析） */
  agent_def_id?: string;
}

/** addSession 出参 */
export class AddSessionOutput extends Output {
  /** 会话 ID（既有会话返回既有 id） */
  session_id!: string;
  /** 是否新建 */
  created!: boolean;
}

// ---------------------------------------------------------------------------
// addMessage
// ---------------------------------------------------------------------------

/** addMessage 入参（seq = last_seq + 1，严格递增） */
export class AddMessageInput extends Input {
  /** 引用 runtime_session.id */
  session_id!: string;
  /** 引用 runtime_run.id（user 消息为空） */
  run_id?: string;
  /** 消息角色 */
  role!: 'user' | 'assistant';
  /** 消息正文 */
  content!: string;
  /** Token 用量（可选） */
  token_usage?: number;
}

/** addMessage 出参 */
export class AddMessageOutput extends Output {
  /** 消息 ID */
  message_id!: string;
  /** 会话内消息序号 */
  seq!: number;
}

// ---------------------------------------------------------------------------
// addPart / updatePart
// ---------------------------------------------------------------------------

/** addPart 入参 */
export class AddPartInput extends Input {
  /** 引用 runtime_message.id */
  message_id!: string;
  /** 引用 runtime_run.id（可选） */
  run_id?: string;
  /** Part 类型 */
  part_type!: PartType;
  /** 初始内容（delta 逐次追加时可为空串） */
  content?: string;
  /** 工具标识（part_type=tool 时） */
  tool_id?: string;
  /** 工具调用参数 JSON（食材直存，成品经事件流） */
  input_json?: string;
  /** 块类型（块流式输出：heading/code_block/…） */
  block_type?: string;
  /** 块元信息 JSON */
  block_meta?: string;
}

/** addPart 出参 */
export class AddPartOutput extends Output {
  /** Part ID */
  part_id!: string;
  /** 消息内 Part 序号 */
  part_order!: number;
}

/** updatePart 入参（状态机 pending→running→completed/error/aborted） */
export class UpdatePartInput extends Input {
  /** Part ID */
  part_id!: string;
  /** 目标状态 */
  status?: PartStatus;
  /** 内容追加（delta 语义：追加到 content） */
  content_patch?: string;
  /** 工具结果 JSON（配对完成时；aborted 时写类型化取消原因） */
  output_json?: string;
  /** Token 数 */
  token_count?: number;
  /** 耗时毫秒 */
  elapsed_ms?: number;
}

/** updatePart 出参 */
export class UpdatePartOutput extends Output {}

// ---------------------------------------------------------------------------
// soMessages
// ---------------------------------------------------------------------------

/** soMessages 入参（seq 倒序分页） */
export class SoMessagesInput extends Input {
  /** 引用 runtime_session.id */
  session_id!: string;
  /** 页大小（默认 50） */
  limit?: number;
  /** 早于该 seq（分页游标） */
  before_seq?: number;
}

/** soMessages 出参 */
export class SoMessagesOutput extends Output {
  /** 消息列表（seq 升序返回） */
  messages: MessageWithParts[] = [];
}

// ---------------------------------------------------------------------------
// ensureRunState / releaseRunState（每会话忙锁）
// ---------------------------------------------------------------------------

/** ensureRunState 入参 */
export class EnsureRunStateInput extends Input {
  /** 外部会话标识 */
  session_key!: string;
  /** 申请执行的 run ID */
  run_id!: string;
}

/** ensureRunState 出参 */
export class EnsureRunStateOutput extends Output {
  /** 是否获取成功（false = 忙，返回活动 run） */
  acquired!: boolean;
  /** 活动运行 ID（忙时非空） */
  active_run_id?: string;
}

/** releaseRunState 入参（幂等） */
export class ReleaseRunStateInput extends Input {
  /** 外部会话标识 */
  session_key!: string;
  /** 释放的 run ID */
  run_id!: string;
}

/** releaseRunState 出参 */
export class ReleaseRunStateOutput extends Output {
  /** 是否实际释放（false = 无活动锁或 run 不匹配） */
  released!: boolean;
}

// ---------------------------------------------------------------------------
// configSession
// ---------------------------------------------------------------------------

/** configSession 入参 */
export class ConfigSessionInput extends Input {
  /** soMessages 默认页大小（默认 50） */
  default_message_limit?: number;
}

/** configSession 出参 */
export class ConfigSessionOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名
// ---------------------------------------------------------------------------

/** runtime_session 表名 */
export const RUNTIME_SESSION_TABLE = 'runtime_session';

/** runtime_message 表名 */
export const RUNTIME_MESSAGE_TABLE = 'runtime_message';

/** runtime_message_part 表名 */
export const RUNTIME_MESSAGE_PART_TABLE = 'runtime_message_part';

/** runtime_config 配置表名 */
export const RUNTIME_SESSION_CONFIG_TABLE = 'runtime_session_config';
