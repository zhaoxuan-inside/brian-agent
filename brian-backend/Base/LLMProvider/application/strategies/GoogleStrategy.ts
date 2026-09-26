import type {
  LLMProviderRecord,
  LLMAvailableRecord,
  ExecLLMInput,
} from '../../domain/types';
import type { HttpRequestOptions, ParsedChatResult } from './ILLMProviderStrategy';
import { BaseLLMStrategy } from './BaseLLMStrategy';

export class GoogleStrategy extends BaseLLMStrategy {
  override readonly name: string = 'google';

  override supports(provider: LLMProviderRecord): boolean {
    const title = provider.llm_provider_title?.toLowerCase() ?? '';
    const url = provider.llm_provider_url?.toLowerCase() ?? '';
    return title.includes('google') || url.includes('googleapis.com') || title.includes('gemini');
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
      headers['Authorization'] = `Bearer ${provider.api_key}`;
      headers['x-goog-api-key'] = provider.api_key;
    }
    return headers;
  }

  

  private appendGoogleKey(url: string, apiKey?: string | null): string {
    if (!apiKey) return url;
    if (url.includes('key=')) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}key=${encodeURIComponent(apiKey)}`;
  }

  override buildTestRequest(provider: LLMProviderRecord): HttpRequestOptions {
    const url = this.appendGoogleKey(provider.llm_provider_url, provider.api_key);
    return {
      url,
      method: 'GET',
      headers: this.buildHeaders(provider, ''),
    };
  }

  override buildListModelsRequest(provider: LLMProviderRecord): HttpRequestOptions {
    const modelsPath = provider.models_path || 'models';
    const rawUrl = this.buildEndpoint(provider.llm_provider_url, modelsPath);
    const url = this.appendGoogleKey(rawUrl, provider.api_key);
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
    const chatPath = provider.chat_path || 'openai/chat/completions';
    const rawUrl = this.buildEndpoint(provider.llm_provider_url, chatPath);
    const url = this.appendGoogleKey(rawUrl, provider.api_key);

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
    let maxTokens = input.max_tokens !== undefined ? input.max_tokens : (model.max_tokens || undefined);
    if (maxTokens !== undefined && maxTokens > 0 && maxTokens < 1024) {
      
      
      maxTokens = 1024;
    }
    if (maxTokens !== undefined) {
      body.max_tokens = maxTokens;
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
    
    const standard = super.parseChatResponse(json, rawText);
    if (standard.content) {
      return standard;
    }

    
    if (json && typeof json === 'object') {
      const obj = json as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
        };
      };
      if (Array.isArray(obj.candidates) && obj.candidates[0]?.content?.parts) {
        const partsText = obj.candidates[0].content.parts
          .map((p) => p.text || '')
          .join('');
        return {
          content: partsText,
          inputTokens: obj.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: obj.usageMetadata?.candidatesTokenCount ?? 0,
        };
      }
    }

    return standard;
  }
}
