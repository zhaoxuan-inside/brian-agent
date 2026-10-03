import type { LLMProviderRecord } from './types';

/** 内置提供商目录条目（仅配置模板，不含任何密钥） */
export interface ProviderCatalogEntry {
  llm_provider_title: string;
  llm_provider_brief: string;
  llm_provider_url: string;
  models_path: string;
  chat_path: string;
}

/**
 * 常见模型提供商目录（官方默认地址与路径）。
 * 由 LLMSchemaInitializer.importProviderCatalog 幂等预置进 llm_provider_record
 * （enable=0，用户编辑填入 API Key 后启用）。
 */
export const PROVIDER_CATALOG_VERSION = '1';

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    llm_provider_title: 'OpenAI',
    llm_provider_brief: 'GPT 系列模型官方接口（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://api.openai.com/v1',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: 'Anthropic',
    llm_provider_brief: 'Claude 系列模型官方接口（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://api.anthropic.com/v1',
    models_path: 'models',
    chat_path: 'messages',
  },
  {
    llm_provider_title: 'Google Gemini',
    llm_provider_brief: 'Gemini 系列模型官方接口（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://generativelanguage.googleapis.com/v1beta',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: 'DeepSeek',
    llm_provider_brief: 'DeepSeek V3 / R1 系列模型（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://api.deepseek.com/v1',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: '智谱 GLM',
    llm_provider_brief: 'GLM-4 系列模型开放平台（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://open.bigmodel.cn/api/paas/v4',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: '阿里云百炼（通义）',
    llm_provider_brief: '通义 Qwen 系列模型，OpenAI 兼容模式（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: '火山方舟（豆包）',
    llm_provider_brief: '豆包 / Doubao 系列模型（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://ark.cn-beijing.volces.com/api/v3',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: 'Moonshot（Kimi）',
    llm_provider_brief: 'Kimi 系列模型开放平台（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://api.moonshot.cn/v1',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: 'MiniMax',
    llm_provider_brief: 'MiniMax 大模型开放平台（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://api.minimaxi.com/v1',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: '硅基流动 SiliconFlow',
    llm_provider_brief: '开源模型聚合平台（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://api.siliconflow.cn/v1',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: 'OpenRouter',
    llm_provider_brief: '多模型聚合路由（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://openrouter.ai/api/v1',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: 'xAI（Grok）',
    llm_provider_brief: 'Grok 系列模型官方接口（内置目录，填入 API Key 后启用）',
    llm_provider_url: 'https://api.x.ai/v1',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
  {
    llm_provider_title: 'Ollama（本机）',
    llm_provider_brief: '本机 Ollama 服务，无需 API Key（内置目录，启用即可使用）',
    llm_provider_url: 'http://127.0.0.1:11434/v1',
    models_path: 'models',
    chat_path: 'chat/completions',
  },
];

/** 目录条目 → 提供商记录插入字段（enable=0，由用户填 key 后启用） */
export function toProviderRecord(entry: ProviderCatalogEntry, id: string, now: number): Record<string, string | number> {
  return {
    id,
    created: now,
    updated: now,
    llm_provider_title: entry.llm_provider_title,
    llm_provider_brief: entry.llm_provider_brief,
    llm_provider_url: entry.llm_provider_url,
    enable: 0,
    models_path: entry.models_path,
    chat_path: entry.chat_path,
  };
}
