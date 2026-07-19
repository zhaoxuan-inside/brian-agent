import { ChatMessage, LLMResponse, Tool, ToolCall } from '../../../shared/types';
import { parseSSEStream, createSSEHeaders } from '../streaming';

/**
 * Google Gemini API adapter.
 * Uses the generateContent and streamGenerateContent endpoints.
 */

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
}

interface GeminiStreamChunk {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Convert ChatMessage[] to Gemini contents format.
 * Gemini API requires the first message to be from 'user' and messages
 * must alternate between 'user' and 'model'.
 */
function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  const contents: GeminiContent[] = [];

  for (const msg of conversationMessages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiPart[] = [{ text: msg.content }];

    // If there's a system message, prepend it as a user message with system instruction
    if (systemMessages.length > 0 && contents.length === 0) {
      const systemText = systemMessages.map(m => m.content).join('\n');
      contents.push({
        role: 'user',
        parts: [{ text: `[System Instructions]\n${systemText}\n\n[User Message]\n${msg.content}` }],
      });
      continue;
    }

    contents.push({ role, parts });
  }

  // Ensure first message is from user (Gemini requirement)
  if (contents.length > 0 && contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: '' }] });
  }

  return contents;
}

/**
 * Convert Gemini tools to Gemini format.
 */
function toGeminiTools(tools: Tool[]): { functionDeclarations: { name: string; description: string; parameters: Record<string, unknown> }[] }[] {
  if (tools.length === 0) return [];
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    })),
  }];
}

/**
 * Call Google Gemini generateContent API (non-streaming).
 */
export async function callGemini(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens?: number
): Promise<LLMResponse> {
  const startTime = Date.now();
  const apiKey = provider.apiKey;
  const url = `${provider.baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const contents = toGeminiContents(messages);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens || 4096,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Gemini API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const data = await response.json() as Record<string, any>;
  const latencyMs = Date.now() - startTime;

  const candidate = data.candidates?.[0] as GeminiCandidate | undefined;
  const parts = candidate?.content?.parts || [];
  const textParts = parts.filter(p => p.text).map(p => p.text!).join('');

  const usageMetadata = data.usageMetadata || {};

  return {
    content: textParts,
    toolCalls: undefined,
    usage: {
      promptTokens: usageMetadata.promptTokenCount || 0,
      completionTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0,
    },
    latencyMs,
  };
}

/**
 * Stream Google Gemini API via SSE.
 * Yields text delta strings. Returns the full LLMResponse on completion.
 */
export async function* streamGemini(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens?: number
): AsyncGenerator<string, LLMResponse> {
  const startTime = Date.now();
  const apiKey = provider.apiKey;
  const url = `${provider.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const contents = toGeminiContents(messages);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens || 4096,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...createSSEHeaders(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Gemini stream API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Gemini stream response has no readable body');
  }

  let fullContent = '';
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  try {
    for await (const chunk of parseSSEStream(reader)) {
      const parsed: GeminiStreamChunk = JSON.parse(chunk);
      const parts = parsed.candidates?.[0]?.content?.parts;

      if (parts) {
        for (const part of parts) {
          if (part.text) {
            fullContent += part.text;
            yield part.text;
          }
        }
      }

      if (parsed.usageMetadata) {
        usage = {
          promptTokens: parsed.usageMetadata.promptTokenCount,
          completionTokens: parsed.usageMetadata.candidatesTokenCount,
          totalTokens: parsed.usageMetadata.totalTokenCount,
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
 * Call Google Gemini API with tool/function calling support.
 */
export async function callGeminiWithTools(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  tools: Tool[],
  temperature: number
): Promise<LLMResponse> {
  const startTime = Date.now();
  const apiKey = provider.apiKey;
  const url = `${provider.baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const contents = toGeminiContents(messages);
  const geminiTools = toGeminiTools(tools);

  const body: Record<string, unknown> = {
    contents,
    tools: geminiTools,
    generationConfig: {
      temperature,
      maxOutputTokens: 4096,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Gemini tools API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const data = await response.json() as Record<string, any>;
  const latencyMs = Date.now() - startTime;

  const candidate = data.candidates?.[0] as GeminiCandidate | undefined;
  const parts = candidate?.content?.parts || [];
  const textParts = parts.filter(p => p.text).map(p => p.text!).join('');
  const functionCalls = parts.filter(p => p.functionCall);

  const usageMetadata = data.usageMetadata || {};

  let toolCalls: ToolCall[] | undefined;
  if (functionCalls.length > 0) {
    toolCalls = functionCalls.map((fc, idx) => ({
      id: `gemini-tc-${idx}`,
      name: fc.functionCall?.name || '',
      arguments: fc.functionCall?.args || {},
    }));
  }

  return {
    content: textParts,
    toolCalls,
    usage: {
      promptTokens: usageMetadata.promptTokenCount || 0,
      completionTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0,
    },
    latencyMs,
  };
}