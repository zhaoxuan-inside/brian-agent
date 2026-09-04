/**
 * @fileoverview LLMEventsParser —— OpenAI 兼容 SSE 帧解析器（Runtime v2 · 阶段 0）。
 *
 * 状态化：把单个 SSE data 帧解析为归一化 LLMEvent 数组，并在流结束时产出
 * finish 事件（聚合完成的 tool_calls + usage）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Loop/Loop-PRD.md` §4/§7：
 * - 解析 delta.content（text_delta）、delta.reasoning_content（reasoning_delta）、
 *   delta.tool_calls（tool_call_delta，按 index 聚合）、finish_reason 与 usage。
 * - 旧 execLLM 流式路径只解析 delta.content 且 usage 记 0/0；本解析器补齐
 *   reasoning_content / tool_calls / finish_reason / usage 四类字段。
 *
 * 每个方法 ≤40 行（Runtime-PRD §7 强制约束）。
 */

import type {
  LLMEvent,
  ParsedToolCall,
  TokenUsage,
} from '../../../shared/llm/LLMEvent';

/** 流内聚合中的工具调用 */
interface ToolCallAccumulator {
  index: number;
  id: string;
  tool_id: string;
  arguments: string;
}

/** OpenAI 兼容 SSE data 帧形状 */
interface ChatChunkShape {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

/**
 * LLMEventsParser。
 *
 * 逐帧 parseChunk；流结束（[DONE] 或连接关闭）时 parseFinishFrame 产出 finish 事件。
 */
export class LLMEventsParser {
  private readonly toolCallsByIndex = new Map<number, ToolCallAccumulator>();
  private readonly toolCallOrder: number[] = [];
  private textBuf = '';
  private reasoningBuf = '';
  private finishReasonSeen = false;

  /** 聚合后的回复内容 */
  get text(): string {
    return this.textBuf;
  }

  /** 聚合后的思考内容 */
  get reasoning(): string {
    return this.reasoningBuf;
  }

  /** 聚合后的完整工具调用（按流内出现顺序） */
  get toolCalls(): ParsedToolCall[] {
    return this.toolCallOrder.map((index) => {
      const acc = this.toolCallsByIndex.get(index)!;
      return { index: acc.index, id: acc.id, tool_id: acc.tool_id, arguments: acc.arguments };
    });
  }

  /** 流内是否出现过显式 finish_reason 帧（false = 流中途断开） */
  get sawFinishReason(): boolean {
    return this.finishReasonSeen;
  }

  /**
   * 解析单个 SSE data 帧（逻辑控制）。
   *
   * @param chunk 已反序列化的帧 JSON（解析失败时传 null）
   * @returns 归一化事件数组（可能为空；不含 finish 事件）
   */
  parseChunk(chunk: unknown): LLMEvent[] {
    if (!chunk || typeof chunk !== 'object') {
      return [];
    }
    const events: LLMEvent[] = [];
    const frame = chunk as ChatChunkShape;
    const choice = Array.isArray(frame.choices) ? frame.choices[0] : undefined;
    if (choice?.finish_reason != null) {
      this.finishReasonSeen = true;
    }
    if (choice?.delta) {
      this.handleDelta(choice.delta, events);
    }
    return events;
  }

  /**
   * 产出 finish 事件（数据处理）。
   *
   * @param chunk 最后一帧 JSON（可携带 finish_reason 与 usage；null 时默认 stop）
   * @param finishReason 上层判定的结束原因（'aborted'/'error' 覆盖帧内原因）
   */
  buildFinishEvent(
    chunk: unknown,
    finishReason?: 'tool-calls' | 'stop' | 'aborted' | 'error',
  ): LLMEvent {
    const frame = (chunk && typeof chunk === 'object' ? chunk : null) as ChatChunkShape | null;
    const frameChoice = frame?.choices?.[0];
    const reason = finishReason ?? this.mapFinishReason(frameChoice?.finish_reason);
    return {
      type: 'finish',
      finish_reason: reason,
      tool_calls: this.toolCalls,
      usage: this.buildUsage(frame?.usage),
    };
  }

  /**
   * 处理单帧 delta（逻辑控制）。
   */
  private handleDelta(
    delta: NonNullable<NonNullable<ChatChunkShape['choices']>[number]['delta']>,
    events: LLMEvent[],
  ): void {
    if (delta.reasoning_content) {
      this.reasoningBuf += delta.reasoning_content;
      events.push({ type: 'reasoning_delta', delta: delta.reasoning_content });
    }
    if (delta.content) {
      this.textBuf += delta.content;
      events.push({ type: 'text_delta', delta: delta.content });
    }
    if (Array.isArray(delta.tool_calls)) {
      this.handleToolCallDeltas(delta.tool_calls, events);
    }
  }

  /**
   * 处理单帧 tool_calls delta 数组（数据处理，按 index 聚合）。
   */
  private handleToolCallDeltas(
    deltas: Array<{
      index?: number;
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }>,
    events: LLMEvent[],
  ): void {
    for (const delta of deltas) {
      const index = delta.index ?? 0;
      const acc = this.ensureAccumulator(index, delta.id, delta.function?.name);
      if (delta.function?.arguments) {
        acc.arguments += delta.function.arguments;
      }
      events.push({
        type: 'tool_call_delta',
        index,
        id: delta.id || undefined,
        tool_id: delta.function?.name || undefined,
        args_delta: delta.function?.arguments || undefined,
      });
    }
  }

  /**
   * 确保工具调用聚合槽位存在（数据处理）。
   */
  private ensureAccumulator(
    index: number,
    id?: string,
    toolId?: string,
  ): ToolCallAccumulator {
    let acc = this.toolCallsByIndex.get(index);
    if (!acc) {
      acc = { index, id: id ?? '', tool_id: toolId ?? '', arguments: '' };
      this.toolCallsByIndex.set(index, acc);
      this.toolCallOrder.push(index);
      return acc;
    }
    if (id && !acc.id) {
      acc.id = id;
    }
    if (toolId && !acc.tool_id) {
      acc.tool_id = toolId;
    }
    return acc;
  }

  /**
   * 映射 wire finish_reason（数据处理）。
   */
  private mapFinishReason(reason?: string | null): 'tool-calls' | 'stop' {
    if (reason === 'tool_calls' || reason === 'tool-calls' || reason === 'function_call') {
      return 'tool-calls';
    }
    return 'stop';
  }

  /**
   * 构建 Token 用量（数据处理）：流式 usage 帧缺失时按 4 字符/Token 粗估输出侧。
   */
  private buildUsage(
    usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
  ): TokenUsage {
    if (usage && (usage.prompt_tokens || usage.completion_tokens)) {
      return {
        input_tokens: usage.prompt_tokens ?? 0,
        output_tokens: usage.completion_tokens ?? 0,
      };
    }
    const outputTokens = Math.ceil(this.textBuf.length / 4);
    return { input_tokens: 0, output_tokens: outputTokens };
  }
}
