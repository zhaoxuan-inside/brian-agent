import type {
  LLMProviderRecord,
  LLMAvailableRecord,
  ExecLLMInput,
} from '../../domain/types';
import type { HttpRequestOptions, ParsedChatResult } from './ILLMProviderStrategy';
import { BaseLLMStrategy } from './BaseLLMStrategy';

export class AnthropicStrategy extends BaseLLMStrategy {
  override readonly name: string = 'anthropic';

  override supports(provider: LLMProviderRecord): boolean {
    const title = provider.llm_provider_title?.toLowerCase() ?? '';
    const url = provider.llm_provider_url?.toLowerCase() ?? '';
    return title.includes('anthropic') || url.includes('anthropic.com') || title.includes('claude');
  }

  protected override buildHeaders(
    provider: LLMProviderRecord,
    contentType = 'application/json',
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    if (provider.api_key) {
      headers['x-api-key'] = provider.api_key;
      headers['Authorization'] = `Bearer ${provider.api_key}`;
      headers['anthropic-version'] = '2023-06-01';
    }
    return headers;
  }

  override buildTestRequest(provider: LLMProviderRecord): HttpRequestOptions {
    return {
      url: provider.llm_provider_url,
      method: 'GET',
      headers: this.buildHeaders(provider, ''),
    };
  }

  override buildListModelsRequest(provider: LLMProviderRecord): HttpRequestOptions {
    const modelsPath = provider.models_path || 'v1/models';
    const url = this.buildEndpoint(provider.llm_provider_url, modelsPath);
    return {
      url,
      method: 'GET',
      headers: this.buildHeaders(provider, ''),
    };
  }

  override buildChatRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: ExecLLMInput,
  ): HttpRequestOptions {
    const chatPath = provider.chat_path || 'v1/messages';
    const url = this.buildEndpoint(provider.llm_provider_url, chatPath);

    
    const maxTokens = input.max_tokens ?? (model.max_tokens && model.max_tokens > 0 ? model.max_tokens : 4096);

    const body: Record<string, unknown> = {
      model: model.llm_title,
      messages: [{ role: 'user', content: String(input.prompt ?? '') }],
      max_tokens: maxTokens,
    };

    
    if (input.system) {
      body.system = input.system;
    }
    if (input.temperature !== undefined) {
      body.temperature = input.temperature;
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

  override parseChatResponse(json: unknown, rawText: string): ParsedChatResult {
    
    if (json && typeof json === 'object') {
      const obj = json as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      if (Array.isArray(obj.content) && obj.content.length > 0) {
        const textParts = obj.content
          .filter((c) => c.type === 'text' || !c.type)
          .map((c) => c.text || '')
          .join('');
        return {
          content: textParts,
          inputTokens: obj.usage?.input_tokens ?? 0,
          outputTokens: obj.usage?.output_tokens ?? 0,
        };
      }
    }

    
    return super.parseChatResponse(json, rawText);
  }
}
