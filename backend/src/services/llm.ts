import { modelConfigService, recordModelCall } from '../app';
import type { ModelProvider } from './modelConfig';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
}

interface ChatResponse {
  message: string;
  usage: { promptTokens: number; completionTokens: number };
}

export async function callLLM(messages: ChatMessage[]): Promise<ChatResponse> {
  const cfg = modelConfigService.getConfig();
  const provider = cfg.providers.find(p => p.id === cfg.selectedProviderId);
  const model = provider?.models.find(m => m.id === cfg.selectedModelId);

  if (!provider || !provider.enabled) {
    throw new Error('未选择或未启用的模型提供商');
  }
  if (!provider.apiKey) {
    throw new Error(`请在设置中配置 ${provider.name} 的 API Key`);
  }
  if (!provider.baseUrl) {
    throw new Error(`请在设置中配置 ${provider.name} 的 API 地址`);
  }

  const modelId = model?.id || cfg.selectedModelId;
  const temperature = cfg.temperature;

  const startTime = Date.now();

  if (provider.type === 'anthropic') {
    return callAnthropic(provider, modelId, messages, temperature, startTime);
  }
  if (provider.type === 'google') {
    return callGoogle(provider, modelId, messages, temperature, startTime);
  }
  // OpenAI-compatible (OpenAI, DeepSeek, GLM, Moonshot, Qwen, custom)
  return callOpenAICompatible(provider, modelId, messages, temperature, startTime);
}

async function callOpenAICompatible(
  provider: ModelProvider,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  startTime: number
): Promise<ChatResponse> {
  const url = `${provider.baseUrl}/chat/completions`;
  const body = {
    model,
    messages,
    temperature,
    stream: false,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`模型调用失败 (${resp.status}): ${text.slice(0, 300)}`);
  }

  const data = await resp.json() as Record<string, any>;
  const latency = Date.now() - startTime;
  const promptTokens = data.usage?.prompt_tokens || 0;
  const completionTokens = data.usage?.completion_tokens || 0;
  recordModelCall(promptTokens + completionTokens, latency);

  return {
    message: data.choices?.[0]?.message?.content || '(空响应)',
    usage: { promptTokens, completionTokens },
  };
}

async function callAnthropic(
  provider: ModelProvider,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  startTime: number
): Promise<ChatResponse> {
  const url = `${provider.baseUrl}/messages`;
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model,
    messages: chatMessages,
    max_tokens: 4096,
    temperature,
  };
  if (systemMsg) body.system = systemMsg.content;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic 调用失败 (${resp.status}): ${text.slice(0, 300)}`);
  }

  const data = await resp.json() as Record<string, any>;
  const latency = Date.now() - startTime;
  const promptTokens = data.usage?.input_tokens || 0;
  const completionTokens = data.usage?.output_tokens || 0;
  recordModelCall(promptTokens + completionTokens, latency);

  return {
    message: data.content?.[0]?.text || '(空响应)',
    usage: { promptTokens, completionTokens },
  };
}

async function callGoogle(
  provider: ModelProvider,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  startTime: number
): Promise<ChatResponse> {
  const url = `${provider.baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;

  // Convert to Google's format
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  // Inject system message as first user message if present
  const systemMsg = messages.find(m => m.role === 'system');
  if (systemMsg && contents.length > 0) {
    contents[0].parts[0].text = `[System: ${systemMsg.content}]\n\n${contents[0].parts[0].text}`;
  }

  const body = {
    contents,
    generationConfig: { temperature },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google 调用失败 (${resp.status}): ${text.slice(0, 300)}`);
  }

  const data = await resp.json() as Record<string, any>;
  const latency = Date.now() - startTime;
  const promptTokens = data.usageMetadata?.promptTokenCount || 0;
  const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
  recordModelCall(promptTokens + completionTokens, latency);

  return {
    message: data.candidates?.[0]?.content?.parts?.[0]?.text || '(空响应)',
    usage: { promptTokens, completionTokens },
  };
}

// Streaming
export async function* callLLMStream(messages: ChatMessage[]): AsyncGenerator<string, { usage: { promptTokens: number; completionTokens: number } }, void> {
  const cfg = modelConfigService.getConfig();
  const provider = cfg.providers.find(p => p.id === cfg.selectedProviderId);
  const model = provider?.models.find(m => m.id === cfg.selectedModelId);

  if (!provider || !provider.enabled) throw new Error('未选择或未启用的模型提供商');
  if (!provider.apiKey) throw new Error(`请在设置中配置 ${provider.name} 的 API Key`);
  if (!provider.baseUrl) throw new Error(`请在设置中配置 ${provider.name} 的 API 地址`);

  const modelId = model?.id || cfg.selectedModelId;
  const temperature = cfg.temperature;
  const startTime = Date.now();

  const url = `${provider.baseUrl}/chat/completions`;
  const body = { model: modelId, messages, temperature, stream: true };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`模型调用失败 (${resp.status}): ${text.slice(0, 300)}`);
  }

  if (!resp.body) throw new Error('No response body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data) as Record<string, any>;
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            yield delta.content;
          }
          if (parsed.usage?.completion_tokens) {
            completionTokens = parsed.usage.completion_tokens;
            promptTokens = parsed.usage.prompt_tokens;
          }
        } catch {
          // skip parse errors
        }
      }
    }
  } finally {
    const latency = Date.now() - startTime;
    recordModelCall(promptTokens + completionTokens, latency);
  }

  return { usage: { promptTokens, completionTokens } };
}
