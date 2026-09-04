/**
 * @fileoverview LLMEvent 归一化流事件类型定义（Runtime v2 · 阶段 0）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Loop/Loop-PRD.md` §4：
 * execLLMEvents 把不同提供商的原生 SSE 流归一化为四类 delta 事件
 * （reasoning / text / tool_call / finish），供 Runtime 编排内核消费。
 *
 * 范式来源：OpenCode session/processor（LLMEvent 流状态机）+
 * Hermes conversation_loop（原生 tool_calls 消息 + 严格角色交替）。
 *
 * 说明：本阶段事件 API 仅面向 OpenAI 兼容 wire 格式（与既有 execLLM 流式路径一致），
 * Anthropic / Google 原生格式的归一化在后续阶段补齐（Loop-PRD §4 已声明边界）。
 */

/** LLM 工具规格（JSON Schema 形式，供原生 tool_calls 请求使用） */
export interface LLMToolSpec {
  /** 工具标识（内部统一 tool_id；wire 映射 function.name 在策略边界完成） */
  tool_id: string;
  /** 工具描述（模型据此决策是否调用） */
  description: string;
  /** 参数 JSON Schema（由 zod schema 在上层转换） */
  parameters: Record<string, unknown>;
}

/** LLM 消息角色 */
export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** assistant 消息内的原生工具调用（已配对执行后才进入下一轮请求） */
export interface LLMToolCallWire {
  /** 工具调用 ID（provider 生成，回传时必须一致） */
  id: string;
  /** 固定 'function' */
  type?: 'function';
  /** 工具标识与参数 */
  function: {
    name: string;
    /** JSON 序列化的参数字符串 */
    arguments: string;
  };
}

/**
 * LLM 消息（原生 messages 数组，取代 prompt/system 的单轮拼装）。
 * 严格角色交替：tool 角色仅可连排在 assistant tool_calls 之后（Hermes 约定）。
 */
export interface LLMMessage {
  role: LLMMessageRole;
  /** 消息正文（tool 角色为工具执行结果） */
  content: string;
  /** 工具调用标识（role=tool 时必填） */
  tool_call_id?: string;
  /** 原生工具调用（role=assistant 发起工具调用时） */
  tool_calls?: LLMToolCallWire[];
}

/** 归一化的完整工具调用（流式参数聚合完成后） */
export interface ParsedToolCall {
  /** 流内聚合序号（choices delta tool_calls 的 index） */
  index: number;
  /** 工具调用 ID */
  id: string;
  /** 工具标识（内部统一 tool_id；wire function.name 在解析边界映射） */
  tool_id: string;
  /** JSON 序列化的参数字符串（聚合后的 arguments） */
  arguments: string;
}

/** Token 用量 */
export interface TokenUsage {
  /** 输入 Token 数 */
  input_tokens: number;
  /** 输出 Token 数 */
  output_tokens: number;
}

/**
 * LLMEvent 归一化流事件。
 *
 * - reasoning_delta：思考/推理内容 delta（delta.reasoning_content，DeepSeek/Ark 风格）
 * - text_delta：回复内容 delta（choices delta content）
 * - tool_call_delta：工具调用参数 delta（choices delta tool_calls，按 index 聚合）
 * - finish：流结束（聚合完成的完整 tool_calls + Token 用量）
 */
export type LLMEvent =
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'text_delta'; delta: string }
  | {
      type: 'tool_call_delta';
      /** 流内聚合序号 */
      index: number;
      /** 工具调用 ID（首个 delta 携带，后续为空） */
      id?: string;
      /** 工具标识（首个 delta 携带，后续为空；wire function.name 映射） */
      tool_id?: string;
      /** 参数 JSON 字符串 delta */
      args_delta?: string;
    }
  | {
      type: 'finish';
      /** 结束原因：tool-calls 表示需执行工具并回流；stop 表示最终回复 */
      finish_reason: 'tool-calls' | 'stop' | 'aborted' | 'error';
      /** 聚合完成的完整工具调用（finish_reason=tool-calls 时非空） */
      tool_calls: ParsedToolCall[];
      /** Token 用量（流式 usage 最终帧或估算） */
      usage: TokenUsage;
    };
