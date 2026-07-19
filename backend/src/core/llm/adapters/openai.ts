import { ChatMessage, LLMResponse, Tool, ToolCall } from '../../../shared/types';
import { parseSSEStream, createSSEHeaders } from '../streaming';

/**
 * OpenAI-compatible API adapter.
 * Supports OpenAI, DeepSeek, GLM, Moonshot, Qwen, and any other
 * provider that implements the OpenAI chat completions API.
 */

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
}

interface OpenAIStreamChunk {
  choices?: {
    index: number;
    delta?: { content?: string; tool_calls?: { index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }[] };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Call OpenAI-compatible chat completions API (non-streaming).
 */
export async function callOpenAI(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens?: number
): Promise<LLMResponse> {
  const startTime = Date.now();
  const url = `${provider.baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature,
  };
  if (maxTokens !== undefined) {
    body.max_tokens = maxTokens;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const data = await response.json() as Record<string, any>;
  const latencyMs = Date.now() - startTime;

  const choice = data.choices?.[0];
  const content = choice?.message?.content || '';
  const usage = data.usage || {};

  return {
    content,
    toolCalls: undefined,
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    },
    latencyMs,
  };
}

/**
 * Stream OpenAI-compatible chat completions via SSE.
 * Yields content delta strings. Returns the full LLMResponse on completion.
 */
export async function* streamOpenAI(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens?: number
): AsyncGenerator<string, LLMResponse> {
  const startTime = Date.now();
  const url = `${provider.baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature,
    stream: true,
  };
  if (maxTokens !== undefined) {
    body.max_tokens = maxTokens;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...createSSEHeaders(),
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI stream API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('OpenAI stream response has no readable body');
  }

  let fullContent = '';
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  try {
    for await (const chunk of parseSSEStream(reader)) {
      const parsed: OpenAIStreamChunk = JSON.parse(chunk);
      const delta = parsed.choices?.[0]?.delta;

      if (delta?.content) {
        fullContent += delta.content;
        yield delta.content;
      }

      if (parsed.usage) {
        usage = {
          promptTokens: parsed.usage.prompt_tokens,
          completionTokens: parsed.usage.completion_tokens,
          totalTokens: parsed.usage.total_tokens,
        };
      }
    }
  } finally {
    // Ensure reader is released if parseSSEStream didn't release it
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
 * Call OpenAI-compatible API with tool/function calling support.
 */
export async function callOpenAIWithTools(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  tools: Tool[],
  temperature: number
): Promise<LLMResponse> {
  const startTime = Date.now();
  const url = `${provider.baseUrl}/chat/completions`;

  const openaiTools = tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const body: Record<string, unknown> = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature,
    tools: openaiTools,
    tool_choice: 'auto',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI tools API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const data = await response.json() as Record<string, any>;
  const latencyMs = Date.now() - startTime;

  const choice = data.choices?.[0];
  const content = choice?.message?.content || '';
  const usage = data.usage || {};

  let toolCalls: ToolCall[] | undefined;
  if (choice?.message?.tool_calls) {
    toolCalls = choice.message.tool_calls.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name || '',
      arguments: (() => {
        try { return JSON.parse(tc.function?.arguments || '{}'); }
        catch { return {}; }
      })(),
    }));
  }

  return {
    content,
    toolCalls,
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    },
    latencyMs,
  };
}