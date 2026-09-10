/**
 * @fileoverview Google Gemini 提供商策略。
 *
 * 针对 Google Gemini 提供商的特殊路径与鉴权机制：
 * 1. 默认 OpenAI 兼容对话路径为 `openai/chat/completions`，默认模型列表路径为 `models`；
 * 2. 原生 REST（`/models`）只用 `x-goog-api-key` 与 URL `?key=`；
 *    OpenAI 兼容路径才额外带 `Authorization: Bearer`。
 *    原生接口若带 Bearer API Key，Google 会按 OAuth2 校验并返回 401；
 * 3. 支持 Google 特有的 `json.models` 模型列表字段及 Token 限制字段解析；
 * 4. 兼容 Google 原生返回与 OpenAI 兼容返回格式。
 */

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

  private isOpenAiCompatPath(apiPath: string): boolean {
    return /(^|\/)openai(\/|$)/i.test(apiPath);
  }

  /**
   * 构造 Google 专用请求头。
   * 原生 REST 禁止带 Bearer，否则 /models 会被当成 OAuth 而 401。
   */
  protected override buildHeaders(
    provider: LLMProviderRecord,
    contentType = 'application/json',
    useBearer = false,
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    if (provider.api_key) {
      headers['x-goog-api-key'] = provider.api_key;
      if (useBearer) {
        headers['Authorization'] = `Bearer ${provider.api_key}`;
      }
    }
    return headers;
  }

  /**
   * 确保 URL 附带 Google API Key 查询参数。
   */
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
      headers: this.buildHeaders(provider, '', this.isOpenAiCompatPath(modelsPath)),
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
      // Gemini 2.5 / 3.7 等思考模型在 OpenAI 兼容模式下思考过程会占用 Token 预算，
      // 保障至少 1024 Token 避免因长度被截断导致正文为空
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
      headers: this.buildHeaders(provider, 'application/json', this.isOpenAiCompatPath(chatPath)),
      body: JSON.stringify(body),
    };
  }

  override parseChatResponse(json: unknown, rawText: string): ParsedChatResult {
    // 优先尝试标准 OpenAI 兼容格式
    const standard = super.parseChatResponse(json, rawText);
    if (standard.content) {
      return standard;
    }

    // 兼容 Google 原生 generateContent 返回格式
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
