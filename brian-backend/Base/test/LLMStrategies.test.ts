/**
 * @fileoverview LLM 提供商策略模式单元测试。
 *
 * 验证 LLMStrategyFactory、BaseLLMStrategy、OpenAIStrategy、GoogleStrategy、
 * AnthropicStrategy、OllamaStrategy、VolcanoEngineStrategy 的请求构造与响应解析多态行为。
 */

import { describe, it, expect } from 'vitest';
import {
  LLMStrategyFactory,
  BaseLLMStrategy,
  OpenAIStrategy,
  GoogleStrategy,
  AnthropicStrategy,
  OllamaStrategy,
  VolcanoEngineStrategy,
} from '../LLMProvider/application/strategies';
import type { LLMProviderRecord, LLMAvailableRecord, ExecLLMInput } from '../LLMProvider/domain/types';

function createMockProvider(overrides?: Partial<LLMProviderRecord>): LLMProviderRecord {
  return {
    id: 'prov-1',
    created: Date.now(),
    updated: Date.now(),
    llm_provider_url: 'https://api.openai.com/v1',
    llm_provider_title: 'OpenAI',
    llm_provider_brief: '',
    enable: true,
    api_key: 'sk-test-key-123',
    ...overrides,
  };
}

function createMockModel(overrides?: Partial<LLMAvailableRecord>): LLMAvailableRecord {
  return {
    id: 'model-1',
    created: Date.now(),
    updated: Date.now(),
    llm_provider_id: 'prov-1',
    llm_title: 'gpt-4o',
    llm_brief: 'GPT-4o model',
    llm_type: 'text',
    enable: true,
    is_default: false,
    max_tokens: 4096,
    ...overrides,
  };
}

describe('LLM Strategies & Factory', () => {
  describe('LLMStrategyFactory', () => {
    it('应该将 Google 提供商正确路由到 GoogleStrategy', () => {
      const p1 = createMockProvider({ llm_provider_title: 'Google', llm_provider_url: 'https://generativelanguage.googleapis.com/v1beta' });
      expect(LLMStrategyFactory.soStrategyById(p1)).toBeInstanceOf(GoogleStrategy);

      const p2 = createMockProvider({ llm_provider_title: 'Custom', llm_provider_url: 'https://my-proxy.googleapis.com' });
      expect(LLMStrategyFactory.soStrategyById(p2)).toBeInstanceOf(GoogleStrategy);
    });

    it('应该将 Anthropic 提供商正确路由到 AnthropicStrategy', () => {
      const p1 = createMockProvider({ llm_provider_title: 'Anthropic', llm_provider_url: 'https://api.anthropic.com/v1' });
      expect(LLMStrategyFactory.soStrategyById(p1)).toBeInstanceOf(AnthropicStrategy);

      const p2 = createMockProvider({ llm_provider_title: 'Claude Gateway', llm_provider_url: 'https://api.custom.com' });
      expect(LLMStrategyFactory.soStrategyById(p2)).toBeInstanceOf(AnthropicStrategy);
    });

    it('应该将 Ollama 提供商正确路由到 OllamaStrategy', () => {
      const p1 = createMockProvider({ llm_provider_title: 'Ollama', llm_provider_url: 'http://127.0.0.1:11434' });
      expect(LLMStrategyFactory.soStrategyById(p1)).toBeInstanceOf(OllamaStrategy);
    });

    it('通用或 DeepSeek / Moonshot 提供商应路由到通用 OpenAIStrategy', () => {
      const p1 = createMockProvider({ llm_provider_title: 'DeepSeek', llm_provider_url: 'https://api.deepseek.com/v1' });
      expect(LLMStrategyFactory.soStrategyById(p1)).toBeInstanceOf(OpenAIStrategy);

      const p2 = createMockProvider({ llm_provider_title: 'Moonshot', llm_provider_url: 'https://api.moonshot.cn/v1' });
      expect(LLMStrategyFactory.soStrategyById(p2)).toBeInstanceOf(OpenAIStrategy);
    });

    it('应该将 Volcano Engine 提供商正确路由到 VolcanoEngineStrategy', () => {
      const p1 = createMockProvider({ llm_provider_title: 'Volcano Engine', llm_provider_url: 'https://ark.cn-beijing.volces.com/api/v3' });
      expect(LLMStrategyFactory.soStrategyById(p1)).toBeInstanceOf(VolcanoEngineStrategy);

      const p2 = createMockProvider({ llm_provider_title: 'Custom', llm_provider_url: 'https://ark.cn-beijing.volces.com/api/v3' });
      expect(LLMStrategyFactory.soStrategyById(p2)).toBeInstanceOf(VolcanoEngineStrategy);
    });
  });

  describe('GoogleStrategy', () => {
    const strategy = new GoogleStrategy();
    const provider = createMockProvider({
      llm_provider_title: 'Google',
      llm_provider_url: 'https://generativelanguage.googleapis.com/v1beta',
      api_key: 'AIzaSyTestKey',
    });
    const model = createMockModel({ llm_title: 'gemini-1.5-pro' });

    it('buildListModelsRequest 原生 /models 不应携带 Bearer，避免 Google 按 OAuth 返回 401', () => {
      const req = strategy.buildListModelsRequest(provider);
      expect(req.url).toContain('/v1beta/models');
      expect(req.url).toContain('key=AIzaSyTestKey');
      expect(req.headers['x-goog-api-key']).toBe('AIzaSyTestKey');
      expect(req.headers['Authorization']).toBeUndefined();
    });

    it('buildChatRequest 应该正确构造请求头与带 key 的 URL，并默认使用 openai/chat/completions', () => {
      const input = { prompt: 'Hello', system: 'You are helpful' } as ExecLLMInput;
      const req = strategy.buildChatRequest(provider, model, input);

      expect(req.url).toContain('/v1beta/openai/chat/completions');
      expect(req.url).toContain('key=AIzaSyTestKey');
      expect(req.headers['Authorization']).toBe('Bearer AIzaSyTestKey');
      expect(req.headers['x-goog-api-key']).toBe('AIzaSyTestKey');

      const body = JSON.parse(req.body!);
      expect(body.model).toBe('gemini-1.5-pro');
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('parseChatResponse 应该兼容解析 Google 原生 generateContent 返回', () => {
      const nativeJson = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Google 原生回复' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 30,
        },
      };
      const res = strategy.parseChatResponse(nativeJson, JSON.stringify(nativeJson));
      expect(res.content).toBe('Google 原生回复');
      expect(res.inputTokens).toBe(15);
      expect(res.outputTokens).toBe(30);
    });

    it('parseChatResponse 应该正常解析 OpenAI 兼容格式', () => {
      const openAiJson = {
        choices: [{ message: { content: 'Gemini OpenAI 兼容回复' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      };
      const res = strategy.parseChatResponse(openAiJson, JSON.stringify(openAiJson));
      expect(res.content).toBe('Gemini OpenAI 兼容回复');
      expect(res.inputTokens).toBe(10);
      expect(res.outputTokens).toBe(20);
    });
  });

  describe('AnthropicStrategy', () => {
    const strategy = new AnthropicStrategy();
    const provider = createMockProvider({
      llm_provider_title: 'Anthropic',
      llm_provider_url: 'https://api.anthropic.com/v1',
      api_key: 'sk-ant-test-key',
    });
    const model = createMockModel({ llm_title: 'claude-3-5-sonnet-20241022', max_tokens: 8192 });

    it('buildChatRequest 应该注入 x-api-key、anthropic-version，并将 system 提升为顶层字段', () => {
      const input = { prompt: 'Explain quantum physics', system: 'Be concise' } as ExecLLMInput;
      const req = strategy.buildChatRequest(provider, model, input);

      expect(req.url).toContain('/v1/v1/messages');
      expect(req.headers['x-api-key']).toBe('sk-ant-test-key');
      expect(req.headers['anthropic-version']).toBe('2023-06-01');

      const body = JSON.parse(req.body!);
      expect(body.model).toBe('claude-3-5-sonnet-20241022');
      expect(body.system).toBe('Be concise');
      expect(body.messages).toEqual([{ role: 'user', content: 'Explain quantum physics' }]);
      expect(body.max_tokens).toBe(8192);
    });

    it('parseChatResponse 应该正确解析 Anthropic content 数组结构', () => {
      const anthropicJson = {
        content: [{ type: 'text', text: 'Claude 回复内容' }],
        usage: { input_tokens: 50, output_tokens: 120 },
      };
      const res = strategy.parseChatResponse(anthropicJson, JSON.stringify(anthropicJson));
      expect(res.content).toBe('Claude 回复内容');
      expect(res.inputTokens).toBe(50);
      expect(res.outputTokens).toBe(120);
    });
  });

  describe('OllamaStrategy', () => {
    const strategy = new OllamaStrategy();
    const provider = createMockProvider({
      llm_provider_title: 'Ollama',
      llm_provider_url: 'http://127.0.0.1:11434',
    });

    it('parseListModelsResponse 应该支持解析 Ollama 原生 /api/tags 返回格式', () => {
      const tagsJson = {
        models: [
          {
            name: 'llama3:latest',
            model: 'llama3:latest',
            details: { family: 'llama', parameter_size: '8.0B' },
          },
          {
            name: 'qwen2.5:7b',
            model: 'qwen2.5:7b',
            details: { family: 'qwen2', parameter_size: '7.6B' },
          },
        ],
      };
      const list = strategy.parseListModelsResponse(tagsJson, JSON.stringify(tagsJson));
      expect(list).toHaveLength(2);
      expect(list[0].modelId).toBe('llama3:latest');
      expect(list[0].description).toBe('llama 8.0B');
      expect(list[1].modelId).toBe('qwen2.5:7b');
      expect(list[1].description).toBe('qwen2 7.6B');
    });
  });

  describe('VolcanoEngineStrategy', () => {
    const strategy = new VolcanoEngineStrategy();

    it('parseListModelsResponse 应该优先取带版本号的 id 而非裸族名 name', () => {
      const json = {
        data: [
          { id: 'deepseek-v4-flash-260425', name: 'deepseek-v4-flash', version: '260425' },
          { id: 'deepseek-v4-pro-260425', name: 'deepseek-v4-pro', version: '260425' },
        ],
      };
      const list = strategy.parseListModelsResponse(json, JSON.stringify(json));
      expect(list).toHaveLength(2);
      expect(list[0].modelId).toBe('deepseek-v4-flash-260425');
      expect(list[1].modelId).toBe('deepseek-v4-pro-260425');
    });

    it('parseListModelsResponse 在缺少 id 时应回退到 name', () => {
      const json = {
        data: [{ name: 'some-bare-model' }],
      };
      const list = strategy.parseListModelsResponse(json, JSON.stringify(json));
      expect(list).toHaveLength(1);
      expect(list[0].modelId).toBe('some-bare-model');
    });

    it('parseListModelsResponse 应该过滤掉已下线 / 即将下线的模型', () => {
      const json = {
        data: [
          { id: 'doubao-pro-32k-241215', name: 'doubao-pro-32k', status: 'Shutdown' },
          { id: 'doubao-seed-1-8-251228', name: 'doubao-seed-1-8', status: 'Retiring' },
          { id: 'doubao-seed-2-1-pro-260628', name: 'doubao-seed-2-1-pro' },
          { id: 'glm-5-2-260617', name: 'glm-5-2', status: '' },
        ],
      };
      const list = strategy.parseListModelsResponse(json, JSON.stringify(json));
      expect(list.map((m) => m.modelId)).toEqual([
        'doubao-seed-2-1-pro-260628',
        'glm-5-2-260617',
      ]);
    });
  });
});
