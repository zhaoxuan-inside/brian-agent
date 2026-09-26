import type {
  LLMEvent,
  ParsedToolCall,
  TokenUsage,
} from '../../../shared/llm/LLMEvent';

interface ToolCallAccumulator {
  index: number;
  id: string;
  tool_id: string;
  arguments: string;
}

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

export class LLMEventsParser {
  private readonly toolCallsByIndex = new Map<number, ToolCallAccumulator>();
  private readonly toolCallOrder: number[] = [];
  private textBuf = '';
  private reasoningBuf = '';
  private finishReasonSeen = false;

  
  get text(): string {
    return this.textBuf;
  }

  
  get reasoning(): string {
    return this.reasoningBuf;
  }

  
  get toolCalls(): ParsedToolCall[] {
    return this.toolCallOrder.map((index) => {
      const acc = this.toolCallsByIndex.get(index)!;
      return { index: acc.index, id: acc.id, tool_id: acc.tool_id, arguments: acc.arguments };
    });
  }

  
  get sawFinishReason(): boolean {
    return this.finishReasonSeen;
  }

  

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

  

  private mapFinishReason(reason?: string | null): 'tool-calls' | 'stop' {
    if (reason === 'tool_calls' || reason === 'tool-calls' || reason === 'function_call') {
      return 'tool-calls';
    }
    return 'stop';
  }

  

  private buildUsage(
    usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
  ): TokenUsage {
    if (usage && (usage.prompt_tokens || usage.completion_tokens)) {
      return {
        input_tokens: usage.prompt_tokens ?? 0,
        output_tokens: usage.completion_tokens ?? 0,
      };
    }
    return { input_tokens: 0, output_tokens: 0 };
  }
}
