import { ChatMessage, LLMResponse, Tool, ToolCall } from '../../../shared/types';
import { parseSSEStream, createSSEHeaders } from '../streaming';

/**
 * Anthropic Messages API adapter.
 * Uses the Anthropic-specific API format with system prompt handling.
 */

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicStreamEvent {
  type: string;
  delta?: { type: string; text?: string; partial_json?: string };
  content_block?: AnthropicContentBlock;
  usage?: { input_tokens: number; output_tokens: number };
  message?: { content: AnthropicContentBlock[]; usage: { input_tokens: number; output_tokens: number } };
}

/**
 * Call Anthropic Messages API (non-streaming).
 */
export async function callAnthropic(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens?: number
): Promise<LLMResponse> {
  const startTime = Date.now();
  const url = `${provider.baseUrl}/messages`;

  // Separate system message from conversation
  const systemMessage = messages.find(m => m.role === 'system');
  const conversationMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model,
    messages: conversationMessages,
    max_tokens: maxTokens || 4096,
    temperature,
  };

  if (systemMessage) {
    body.system = systemMessage.content;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const data = await response.json() as Record<string, any>;
  const latencyMs = Date.now() - startTime;

  const contentBlocks = data.content as AnthropicContentBlock[] | undefined;
  const textBlocks = contentBlocks?.filter(b => b.type === 'text') || [];
  const content = textBlocks.map(b => b.text || '').join('');

  const usage = data.usage || {};

  return {
    content,
    toolCalls: undefined,
    usage: {
      promptTokens: usage.input_tokens || 0,
      completionTokens: usage.output_tokens || 0,
      totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    },
    latencyMs,
  };
}

/**
 * Stream Anthropic Messages API via SSE.
 * Yields text delta strings. Returns the full LLMResponse on completion.
 */
export async function* streamAnthropic(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens?: number
): AsyncGenerator<string, LLMResponse> {
  const startTime = Date.now();
  const url = `${provider.baseUrl}/messages`;

  const systemMessage = messages.find(m => m.role === 'system');
  const conversationMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model,
    messages: conversationMessages,
    max_tokens: maxTokens || 4096,
    temperature,
    stream: true,
  };

  if (systemMessage) {
    body.system = systemMessage.content;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...createSSEHeaders(),
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Anthropic stream API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Anthropic stream response has no readable body');
  }

  let fullContent = '';
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  try {
    for await (const chunk of parseSSEStream(reader)) {
      const event: AnthropicStreamEvent = JSON.parse(chunk);

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta?.text) {
        fullContent += event.delta.text;
        yield event.delta.text;
      }

      if (event.type === 'message_delta' && event.usage) {
        usage = {
          promptTokens: 0, // Anthropic doesn't provide input_tokens in stream deltas
          completionTokens: event.usage.output_tokens,
          totalTokens: event.usage.output_tokens,
        };
      }

      if (event.type === 'message_stop' && event.message?.usage) {
        usage = {
          promptTokens: event.message.usage.input_tokens,
          completionTokens: event.message.usage.output_tokens,
          totalTokens: event.message.usage.input_tokens + event.message.usage.output_tokens,
        };
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }

  const latencyMs = Date.now() - startTime;
  return {
    content: fullContent,
    usage,
    latencyMs,
  };
}

/**
 * Call Anthropic Messages API with tool use support.
 */
export async function callAnthropicWithTools(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  tools: Tool[],
  temperature: number
): Promise<LLMResponse> {
  const startTime = Date.now();
  const url = `${provider.baseUrl}/messages`;

  const systemMessage = messages.find(m => m.role === 'system');
  const conversationMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const anthropicTools = tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  const body: Record<string, unknown> = {
    model,
    messages: conversationMessages,
    max_tokens: 4096,
    temperature,
    tools: anthropicTools,
  };

  if (systemMessage) {
    body.system = systemMessage.content;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Anthropic tools API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const data = await response.json() as Record<string, any>;
  const latencyMs = Date.now() - startTime;

  const contentBlocks = data.content as AnthropicContentBlock[] | undefined;
  const textBlocks = contentBlocks?.filter(b => b.type === 'text') || [];
  const content = textBlocks.map(b => b.text || '').join('');

  const toolUseBlocks = contentBlocks?.filter(b => b.type === 'tool_use') || [];
  const toolCalls: ToolCall[] = toolUseBlocks.map(b => ({
    id: b.id || '',
    name: b.name || '',
    arguments: b.input || {},
  }));

  const usage = data.usage || {};

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: {
      promptTokens: usage.input_tokens || 0,
      completionTokens: usage.output_tokens || 0,
      totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    },
    latencyMs,
  };
}