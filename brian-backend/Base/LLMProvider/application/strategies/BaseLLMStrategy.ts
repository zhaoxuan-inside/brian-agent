/**
 * @fileoverview LLM 提供商策略基类（通用 OpenAI 兼容实现）。
 *
 * 实现了标准的 OpenAI 兼容协议（/v1/models、/v1/chat/completions、/v1/embeddings），
 * 并提供通用的 URL 端点拼接、Headers 填充和 JSON 响应解析逻辑。
 * 各异模型提供商可通过继承此类重写特定方法。
 */

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

/** 默认路径常量 */
export const DEFAULT_MODELS_PATH = 'v1/models';
export const DEFAULT_CHAT_PATH = 'v1/chat/completions';
export const DEFAULT_EMBED_PATH = 'v1/embeddings';

/** execLLMEvents 请求体透传字段黑名单（与 buildChatRequest 约定一致并扩展工具字段） */
const EVENTS_EXTRA_BLOCKLIST = [
  'messages', 'prompt', 'system', 'temperature', 'max_tokens',
  'model', 'tools', 'tool_choice', 'api_key',
];

export class BaseLLMStrategy implements ILLMProviderStrategy {
  readonly name: string = 'openai-compatible';

  /**
   * 默认作为兜底策略匹配所有提供商。
   */
  supports(_provider: LLMProviderRecord): boolean {
    return true;
  }

  /**
   * 安全拼接基础 URL 与 API 路径。
   */
  protected buildEndpoint(baseUrl: string, apiPath: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${apiPath.replace(/^\/+/, '')}`;
  }

  /**
   * 构造通用的认证与请求头。
   */
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

  /**
   * 构造连通性测试请求（默认 GET baseUrl）。
   */
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

  /**
   * 构造获取模型列表请求。
   */
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

  /**
   * 解析模型列表 API 响应。
   */
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

  /**
   * 构造标准 OpenAI 兼容对话请求。
   */
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

  /**
   * 解析标准 OpenAI 格式对话响应。
   */
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

  /**
   * 构造 execLLMEvents（原生消息 + 原生 tool_calls）请求（OpenAI 兼容）。
   */
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

  /**
   * 准备 execLLMEvents 请求体（数据处理）。
   *
   * 注意：events API 面向 SSE 流，body 必须显式 `stream: true`
   * （旧 execLLM 流式路径是事后向 strategy body 注入 stream，本方法在构造期即固化）。
   */
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

  /**
   * 准备 execLLMEvents 消息数组（数据处理）。
   *
   * system 语义（修复：messages 路径此前丢失 system，导致编排层系统提示从未到达模型）：
   * - messages 非空 → 以 input.system **前置/替换首条 system 消息**；
   * - messages 为空 → 兼容 prompt/system 单轮拼装。
   */
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

  /**
   * 准备 execLLMEvents max_tokens（数据处理）：入参优先，模型默认截断 4096。
   */
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

  /**
   * 准备工具规格（数据处理）：内部 tool_id 映射为 wire function.name（边界唯一映射点）。
   */
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

  /**
   * 构造标准 OpenAI 格式向量化请求。
   */
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

  /**
   * 解析标准 OpenAI 格式向量化响应。
   */
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
