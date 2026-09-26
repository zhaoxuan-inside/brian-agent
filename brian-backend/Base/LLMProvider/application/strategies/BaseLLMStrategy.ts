import type {
  LLMProviderRecord,
  LLMAvailableRecord,
  ExecLLMInput,
  ExecLLMEventsInput,
  EmbedLLMInput,
} from '../../domain/types';
import type { LLMMessage, LLMToolSpec } from '../../../shared/llm/LLMEvent';
import type {
  ILLMProviderStrategy,
  HttpRequestOptions,
  ParsedModelItem,
  ParsedChatResult,
  ParsedEmbedResult,
} from './ILLMProviderStrategy';

export const DEFAULT_MODELS_PATH = 'v1/models';
export const DEFAULT_CHAT_PATH = 'v1/chat/completions';
export const DEFAULT_EMBED_PATH = 'v1/embeddings';

const EVENTS_EXTRA_BLOCKLIST = [
  'messages', 'prompt', 'system', 'temperature', 'max_tokens',
  'model', 'tools', 'tool_choice', 'api_key',
];

export class BaseLLMStrategy implements ILLMProviderStrategy {
  readonly name: string = 'openai-compatible';

  

  supports(_provider: LLMProviderRecord): boolean {
    return true;
  }

  

  protected buildEndpoint(baseUrl: string, apiPath: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${apiPath.replace(/^\/+/, '')}`;
  }

  

  protected buildHeaders(
    provider: LLMProviderRecord,
    contentType = 'application/json',
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    if (provider.api_key) {
      headers['Authorization'] = `Bearer ${provider.api_key}`;
    }
    return headers;
  }

  

  buildTestRequest(provider: LLMProviderRecord): HttpRequestOptions {
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers['Authorization'] = `Bearer ${provider.api_key}`;
      headers['x-api-key'] = provider.api_key;
    }
    return {
      url: provider.llm_provider_url,
      method: 'GET',
      headers,
    };
  }

  

  buildListModelsRequest(provider: LLMProviderRecord): HttpRequestOptions {
    const modelsPath = provider.models_path || DEFAULT_MODELS_PATH;
    const url = this.buildEndpoint(provider.llm_provider_url, modelsPath);
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers['Authorization'] = `Bearer ${provider.api_key}`;
      headers['x-api-key'] = provider.api_key;
    }
    return {
      url,
      method: 'GET',
      headers,
    };
  }

  

  parseListModelsResponse(json: unknown, _rawText: string): ParsedModelItem[] {
    let modelsArray: Array<Record<string, unknown>> = [];
    if (json && typeof json === 'object') {
      const obj = json as Record<string, unknown>;
      if (Array.isArray(obj.data)) {
        modelsArray = obj.data as Array<Record<string, unknown>>;
      } else if (Array.isArray(obj.models)) {
        modelsArray = obj.models as Array<Record<string, unknown>>;
      }
    } else if (Array.isArray(json)) {
      modelsArray = json as Array<Record<string, unknown>>;
    }

    const result: ParsedModelItem[] = [];
    for (const m of modelsArray) {
      if (!m || typeof m !== 'object') continue;
      const rawName = String(m.name || m.id || '');
      if (!rawName) continue;
      const modelId = rawName.replace(/^models\//, '');
      let brief: string | undefined;
      if (m.displayName) {
        brief = m.description ? `${m.displayName} - ${m.description}` : String(m.displayName);
      } else if (m.owned_by) {
        brief = `owned_by: ${String(m.owned_by)}`;
      } else if (m.description) {
        brief = String(m.description);
      }

      const tl = m.token_limits as Record<string, unknown> | undefined;
      const topProvider = m.top_provider as Record<string, unknown> | undefined;
      const maxTokens = Number(
        m.max_completion_tokens || (topProvider?.max_completion_tokens)
        || m.max_tokens || m.inputTokenLimit || m.context_length
        || tl?.context_window || 0,
      );

      result.push({
        modelId,
        displayName: m.displayName ? String(m.displayName) : undefined,
        description: brief,
        maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 0,
        raw: m,
      });
    }
    return result;
  }

  

  buildChatRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: ExecLLMInput,
  ): HttpRequestOptions {
    const chatPath = provider.chat_path || DEFAULT_CHAT_PATH;
    const url = this.buildEndpoint(provider.llm_provider_url, chatPath);

    const body: Record<string, unknown> = {
      model: model.llm_title,
      messages: [{ role: 'user', content: String(input.prompt ?? '') }],
    };

    if (input.system) {
      (body.messages as Array<Record<string, unknown>>).unshift({
        role: 'system',
        content: input.system,
      });
    }
    if (input.temperature !== undefined) {
      body.temperature = input.temperature;
    }
    if (input.max_tokens !== undefined) {
      body.max_tokens = input.max_tokens;
    } else if (model.max_tokens) {
      body.max_tokens = model.max_tokens > 100000 ? 4096 : model.max_tokens;
    }

    if (input.extra) {
      for (const [k, v] of Object.entries(input.extra)) {
        if (!['prompt', 'system', 'temperature', 'max_tokens', 'model', 'messages', 'api_key'].includes(k)) {
          body[k] = v;
        }
      }
    }

    return {
      url,
      method: 'POST',
      headers: this.buildHeaders(provider, 'application/json'),
      body: JSON.stringify(body),
    };
  }

  

  parseChatResponse(json: unknown, _rawText: string): ParsedChatResult {
    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;

    if (json && typeof json === 'object') {
      const obj = json as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      if (Array.isArray(obj.choices) && obj.choices[0]?.message?.content) {
        content = String(obj.choices[0].message.content);
      }
      if (obj.usage) {
        inputTokens = obj.usage.prompt_tokens ?? 0;
        outputTokens = obj.usage.completion_tokens ?? 0;
      }
    }

    return { content, inputTokens, outputTokens };
  }

  

  buildChatEventsRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: ExecLLMEventsInput,
  ): HttpRequestOptions {
    const chatPath = provider.chat_path || DEFAULT_CHAT_PATH;
    const url = this.buildEndpoint(provider.llm_provider_url, chatPath);
    const body = this.prepareEventsBody(model, input);
    return {
      url,
      method: 'POST',
      headers: this.buildHeaders(provider, 'application/json'),
      body: JSON.stringify(body),
    };
  }

  

  protected prepareEventsBody(
    model: LLMAvailableRecord,
    input: ExecLLMEventsInput,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: model.llm_title,
      messages: this.prepareEventsMessages(input),
      stream: true,
    };
    if (input.temperature !== undefined) {
      body.temperature = input.temperature;
    }
    body.max_tokens = this.prepareEventsMaxTokens(model, input.max_tokens);
    if (input.tools?.length) {
      body.tools = input.tools.map((spec: LLMToolSpec) => this.prepareToolSpec(spec));
      body.tool_choice = input.tool_choice ?? 'auto';
    }
    if (input.extra) {
      for (const [k, v] of Object.entries(input.extra)) {
        if (!EVENTS_EXTRA_BLOCKLIST.includes(k)) {
          body[k] = v;
        }
      }
    }
    return body;
  }

  

  protected prepareEventsMessages(input: ExecLLMEventsInput): LLMMessage[] {
    const messages: LLMMessage[] = input.messages?.length ? [...input.messages] : [];
    if (input.system) {
      if (messages[0]?.role === 'system') {
        messages[0] = { role: 'system', content: input.system };
      } else {
        messages.unshift({ role: 'system', content: input.system });
      }
    }
    if (!messages.length) {
      messages.push({ role: 'user', content: String(input.prompt ?? '') });
    }
    return messages;
  }

  

  protected prepareEventsMaxTokens(
    model: LLMAvailableRecord,
    maxTokens?: number,
  ): number | undefined {
    if (maxTokens !== undefined) {
      return maxTokens;
    }
    if (model.max_tokens) {
      return model.max_tokens > 100000 ? 4096 : model.max_tokens;
    }
    return undefined;
  }

  

  protected prepareToolSpec(spec: LLMToolSpec): Record<string, unknown> {
    return {
      type: 'function',
      function: {
        name: spec.tool_id,
        description: spec.description,
        parameters: spec.parameters,
      },
    };
  }

  

  buildEmbedRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: EmbedLLMInput,
  ): HttpRequestOptions {
    const url = this.buildEndpoint(provider.llm_provider_url, DEFAULT_EMBED_PATH);
    const body = {
      model: model.llm_title,
      input: input.input,
    };
    return {
      url,
      method: 'POST',
      headers: this.buildHeaders(provider, 'application/json'),
      body: JSON.stringify(body),
    };
  }

  

  parseEmbedResponse(json: unknown, _rawText: string): ParsedEmbedResult {
    let embedding: number[] = [];
    let inputTokens = 0;

    if (json && typeof json === 'object') {
      const obj = json as {
        data?: Array<{ embedding?: number[] }>;
        usage?: { prompt_tokens?: number };
      };
      if (Array.isArray(obj.data) && Array.isArray(obj.data[0]?.embedding)) {
        embedding = obj.data[0].embedding;
      }
      if (obj.usage?.prompt_tokens) {
        inputTokens = obj.usage.prompt_tokens;
      }
    }

    return { embedding, inputTokens };
  }
}
