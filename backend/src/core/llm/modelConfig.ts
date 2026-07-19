import fs from 'fs';
import path from 'path';
import { getDatabase } from '../../infrastructure/database';

// ── Types ──

export interface ModelConfig {
  id: string;
  name: string;
  maxTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
}

export interface RateLimits {
  maxTokensPerDay: number;
  maxTokensPerWeek: number;
  maxTokensPerMonth: number;
  maxCallsPerDay: number;
  maxCallsPerWeek: number;
  maxCallsPerMonth: number;
}

export interface UserModelEntry {
  modelId: string;
  quota: RateLimits;
}

export interface ModelProvider {
  id: string;
  name: string;
  type: 'openai-compatible' | 'anthropic' | 'google' | 'custom';
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
  enabled: boolean;
}

export interface AppConfig {
  selectedProviderId: string;
  selectedModelId: string;
  temperature: number;
  maxTokens: number;
  providers: ModelProvider[];
  providerModels: Record<string, ModelConfig[]>;
  userModels: Record<string, UserModelEntry[]>;
  rateLimits?: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

// ── Defaults ──

export const DEFAULT_PROVIDERS: ModelProvider[] = [
  {
    id: 'openai', name: 'OpenAI', type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1', apiKey: '', enabled: false,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'o3', name: 'o3', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'o4-mini', name: 'o4-mini', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'gpt-4.1', name: 'GPT-4.1', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', maxTokens: 1048576, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'anthropic', name: 'Anthropic', type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1', apiKey: '', enabled: false,
    models: [
      { id: 'claude-4-sonnet-20250514', name: 'Claude 4 Sonnet', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-4-5-haiku-20250415', name: 'Claude 4.5 Haiku', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', maxTokens: 200000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'google', name: 'Google (Gemini)', type: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: '', enabled: false,
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', maxTokens: 1048576, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'mistral', name: 'Mistral AI', type: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1', apiKey: '', enabled: false,
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large 3', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'ministral-8b-latest', name: 'Ministral 3 8B', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'ministral-3b-latest', name: 'Ministral 3 3B', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'pixtral-large-latest', name: 'Pixtral Large', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'codestral-latest', name: 'Codestral', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'mistral-small-latest', name: 'Mistral Small 3', maxTokens: 32768, supportsVision: false, supportsTools: true },
    ]
  },
  {
    id: 'deepseek', name: 'DeepSeek', type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1', apiKey: '', enabled: false,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V4 Pro', maxTokens: 524288, supportsVision: true, supportsTools: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', maxTokens: 65536, supportsVision: false, supportsTools: true },
      { id: 'deepseek-chat-v3', name: 'DeepSeek V3.2', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', maxTokens: 128000, supportsVision: false, supportsTools: true },
    ]
  },
  {
    id: 'zhipu', name: '智谱AI (GLM)', type: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', enabled: false,
    models: [
      { id: 'glm-5', name: 'GLM-5', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'glm-5-flash', name: 'GLM-5 Flash', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'glm-4-plus', name: 'GLM-4 Plus', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'moonshot', name: 'Moonshot (月之暗面)', type: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1', apiKey: '', enabled: false,
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', maxTokens: 8192, supportsVision: false, supportsTools: true },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', maxTokens: 32768, supportsVision: false, supportsTools: true },
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'moonshot-v1-256k', name: 'Moonshot v1 256K', maxTokens: 256000, supportsVision: false, supportsTools: true },
      { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'qwen', name: '通义千问 (Qwen)', type: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', enabled: false,
    models: [
      { id: 'qwen3-plus', name: 'Qwen3 Plus', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'qwen3-max', name: 'Qwen3 Max', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'qwen3-turbo', name: 'Qwen3 Turbo', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'qwen-plus', name: 'Qwen Plus', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'qwen-max-2', name: 'Qwen Max 2', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'doubao', name: '豆包', type: 'openai-compatible',
    baseUrl: 'https://api.doubao.com/v1', apiKey: '', enabled: false,
    models: [
      { id: 'doubao-4.0', name: '豆包 4.0', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'doubao-3.0', name: '豆包 3.0', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'doubao-3.0-turbo', name: '豆包 3.0 Turbo', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'baidu', name: '百度文心一言', type: 'openai-compatible',
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat', apiKey: '', enabled: false,
    models: [
      { id: 'ernie-4.5', name: '文心一言 4.5', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'ernie-4.0-turbo', name: '文心一言 4.0 Turbo', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'ernie-4.0', name: '文心一言 4.0', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'cohere', name: 'Cohere', type: 'openai-compatible',
    baseUrl: 'https://api.cohere.com/v1', apiKey: '', enabled: false,
    models: [
      { id: 'command-r-plus-08-2024', name: 'Command R+', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'command-r-08-2024', name: 'Command R', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'c4ai-aya-expanse-32b', name: 'Aya Expanse 32B', maxTokens: 128000, supportsVision: false, supportsTools: true },
    ]
  },
  {
    id: 'huggingface', name: 'Hugging Face', type: 'openai-compatible',
    baseUrl: 'https://api-inference.huggingface.co/v1', apiKey: '', enabled: false,
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'deepseek-ai/DeepSeek-V4-Pro', name: 'DeepSeek V4 Pro', maxTokens: 524288, supportsVision: true, supportsTools: true },
      { id: 'Qwen/Qwen3-32B', name: 'Qwen3 32B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'mistralai/Mistral-Large-3-675B-Instruct', name: 'Mistral Large 3', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'microsoft/Phi-3.5-mini-instruct', name: 'Phi-3.5 Mini', maxTokens: 128000, supportsVision: false, supportsTools: true },
    ]
  },
  {
    id: 'openrouter', name: 'OpenRouter', type: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', enabled: false,
    models: [
      { id: 'openai/gpt-4o', name: 'GPT-4o', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'openai/o3', name: 'o3', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'anthropic/claude-4-sonnet', name: 'Claude 4 Sonnet', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', maxTokens: 524288, supportsVision: true, supportsTools: true },
      { id: 'mistralai/mistral-large-3', name: 'Mistral Large 3', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'meta-llama/llama-3.3-70b', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'siliconflow', name: 'SiliconFlow', type: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1', apiKey: '', enabled: false,
    models: [
      { id: 'deepseek-ai/DeepSeek-V4-Pro', name: 'DeepSeek V4 Pro', maxTokens: 524288, supportsVision: true, supportsTools: true },
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'Qwen/Qwen3-32B-Instruct', name: 'Qwen3 32B', maxTokens: 131072, supportsVision: false, supportsTools: true },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5 72B', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'mistralai/Mistral-Large-3-675B-Instruct', name: 'Mistral Large 3', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'ollama', name: 'Ollama (本地)', type: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1', apiKey: '', enabled: false,
    models: [
      { id: 'llama3.3:70b', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'qwen3:32b', name: 'Qwen3 32B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'qwen3:8b', name: 'Qwen3 8B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'llama3.2:3b', name: 'Llama 3.2 3B', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'llama3.2:11b-vision', name: 'Llama 3.2 11B Vision', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'gemma3:12b', name: 'Gemma 3 12B', maxTokens: 8192, supportsVision: true, supportsTools: true },
      { id: 'gemma3:4b', name: 'Gemma 3 4B', maxTokens: 8192, supportsVision: true, supportsTools: true },
      { id: 'phi3.5:3.8b', name: 'Phi-3.5 3.8B', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'mistral:7b', name: 'Mistral 7B', maxTokens: 8192, supportsVision: false, supportsTools: true },
    ]
  },
  {
    id: 'azure', name: 'Azure OpenAI', type: 'openai-compatible',
    baseUrl: '', apiKey: '', enabled: false,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'o3', name: 'o3', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'gpt-4.1', name: 'GPT-4.1', maxTokens: 1048576, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'aws', name: 'AWS Bedrock', type: 'openai-compatible',
    baseUrl: '', apiKey: '', enabled: false,
    models: [
      { id: 'us.anthropic.claude-4-sonnet-20250514-v1:0', name: 'Claude 4 Sonnet', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet v2', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'anthropic.claude-3-opus-20240229-v1:0', name: 'Claude 3 Opus', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'mistral.mistral-large-2407-v1:0', name: 'Mistral Large', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'amazon.nova-pro-v1:0', name: 'Nova Pro', maxTokens: 300000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'vertex', name: 'Google Vertex AI', type: 'openai-compatible',
    baseUrl: '', apiKey: '', enabled: false,
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', maxTokens: 1048576, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'cloudflare', name: 'Cloudflare AI', type: 'openai-compatible',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1', apiKey: '', enabled: false,
    models: [
      { id: '@cf/meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', maxTokens: 131072, supportsVision: false, supportsTools: true },
      { id: '@cf/deepseek-ai/deepseek-v4-pro', name: 'DeepSeek V4 Pro', maxTokens: 524288, supportsVision: true, supportsTools: true },
      { id: '@cf/qwen/qwen3-32b-instruct', name: 'Qwen3 32B', maxTokens: 131072, supportsVision: false, supportsTools: true },
    ]
  },
  {
    id: 'together', name: 'Together AI', type: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1', apiKey: '', enabled: false,
    models: [
      { id: 'deepseek-ai/DeepSeek-V4-Pro', name: 'DeepSeek V4 Pro', maxTokens: 524288, supportsVision: true, supportsTools: true },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', maxTokens: 65536, supportsVision: false, supportsTools: true },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout 17B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B', maxTokens: 65536, supportsVision: false, supportsTools: true },
      { id: 'Qwen/Qwen3-32B', name: 'Qwen3 32B', maxTokens: 131072, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'lepton', name: 'Lepton AI', type: 'openai-compatible',
    baseUrl: 'https://api.lepton.ai/v1', apiKey: '', enabled: false,
    models: [
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', maxTokens: 524288, supportsVision: true, supportsTools: true },
      { id: 'qwen-2.5-72b', name: 'Qwen 2.5 72B', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'fireworks', name: 'Fireworks AI', type: 'openai-compatible',
    baseUrl: 'https://api.fireworks.ai/inference/v1', apiKey: '', enabled: false,
    models: [
      { id: 'accounts/fireworks/models/kimi-k2-thinking', name: 'Kimi K2 Thinking', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'accounts/fireworks/models/glm-5-1', name: 'GLM 5.1', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'accounts/fireworks/models/kimi-k2-6', name: 'Kimi K2.6', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'accounts/fireworks/models/qwen3-32b', name: 'Qwen3 32B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'accounts/fireworks/models/llama-v3p1-405b-instruct', name: 'Llama 3.1 405B', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'accounts/fireworks/models/deepseek-v3-2', name: 'DeepSeek V3.2', maxTokens: 128000, supportsVision: false, supportsTools: true },
    ]
  },
  {
    id: 'anyscale', name: 'Anyscale Endpoints', type: 'openai-compatible',
    baseUrl: 'https://api.endpoints.anyscale.com/v1', apiKey: '', enabled: false,
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: false, supportsTools: true },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B', maxTokens: 65536, supportsVision: false, supportsTools: true },
      { id: 'Qwen/Qwen3-32B', name: 'Qwen3 32B', maxTokens: 131072, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'modal', name: 'Modal', type: 'openai-compatible',
    baseUrl: '', apiKey: '', enabled: false,
    models: [
      { id: 'deepseek-ai/DeepSeek-V4-Pro', name: 'DeepSeek V4 Pro', maxTokens: 524288, supportsVision: true, supportsTools: true },
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'mistralai/Mistral-Large-3-675B-Instruct', name: 'Mistral Large 3', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'runpod', name: 'RunPod', type: 'openai-compatible',
    baseUrl: '', apiKey: '', enabled: false,
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', maxTokens: 32768, supportsVision: false, supportsTools: true },
      { id: 'Qwen/Qwen3-32B', name: 'Qwen3 32B', maxTokens: 131072, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'groq', name: 'Groq', type: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1', apiKey: '', enabled: false,
    models: [
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'qwen/qwen3.6-27b', name: 'Qwen 3.6 27B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', maxTokens: 131072, supportsVision: false, supportsTools: true },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'whisper-large-v3', name: 'Whisper Large V3', maxTokens: 0, supportsVision: false, supportsTools: false },
    ]
  },
  {
    id: 'perplexity', name: 'Perplexity', type: 'openai-compatible',
    baseUrl: 'https://api.perplexity.ai', apiKey: '', enabled: false,
    models: [
      { id: 'sonar', name: 'Sonar', maxTokens: 127000, supportsVision: false, supportsTools: true },
      { id: 'sonar-pro', name: 'Sonar Pro', maxTokens: 127000, supportsVision: true, supportsTools: true },
      { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro', maxTokens: 127000, supportsVision: true, supportsTools: true },
      { id: 'sonar-deep-research', name: 'Sonar Deep Research', maxTokens: 127000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'volcano', name: '火山方舟', type: 'openai-compatible',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: '', enabled: false,
    models: [
      { id: 'doubao-3.0', name: '豆包 3.0', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'doubao-3.0-turbo', name: '豆包 3.0 Turbo', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'doubao-4.0', name: '豆包 4.0', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'deepseek-ai/deepseek-v4-pro', name: 'DeepSeek V4 Pro', maxTokens: 524288, supportsVision: true, supportsTools: true },
      { id: 'mistralai/mistral-large-3', name: 'Mistral Large 3', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', maxTokens: 1048576, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'custom', name: '自定义端点', type: 'custom',
    baseUrl: '', apiKey: '', enabled: false, models: []
  }
];

export const DEFAULT_CONFIG: AppConfig = {
  selectedProviderId: '',
  selectedModelId: '',
  temperature: 0.7,
  maxTokens: 4096,
  providers: DEFAULT_PROVIDERS,
  providerModels: {},
  userModels: {},
  rateLimits: {
    daily: 100000,
    weekly: 500000,
    monthly: 2000000,
  },
};

// ── ModelConfigService ──

export class ModelConfigService {
  private cache: AppConfig | null = null;

  private readConfig(): Record<string, string> {
    try {
      const db = getDatabase();
      const rows = db.prepare('SELECT key, value FROM model_config').all() as { key: string; value: string }[];
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      if (Object.keys(map).length > 0) return map;
    } catch { /* fall through to file fallback */ }
    // Fallback: seed from the config file when the DB has no saved config,
    // so the management UI reflects the same source the LLM runtime uses.
    try {
      const configPath = path.resolve(process.env.BRIAN_CONFIG_FILE_PATH || './data/model-config.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const map: Record<string, string> = {};
        if (raw.providers) map.providers = JSON.stringify(raw.providers);
        if (raw.selectedProviderId !== undefined) map.selectedProviderId = String(raw.selectedProviderId);
        if (raw.selectedModelId !== undefined) map.selectedModelId = String(raw.selectedModelId);
        if (raw.temperature !== undefined) map.temperature = String(raw.temperature);
        if (raw.maxTokens !== undefined) map.maxTokens = String(raw.maxTokens);
        if (raw.providerModels) map.providerModels = JSON.stringify(raw.providerModels);
        if (raw.userModels) map.userModels = JSON.stringify(raw.userModels);
        if (raw.rateLimits) map.rateLimits = JSON.stringify(raw.rateLimits);
        return map;
      }
    } catch { /* ignore */ }
    return {};
  }

  private writeConfig(key: string, value: string): void {
    const db = getDatabase();
    db.prepare('INSERT OR REPLACE INTO model_config (key, value) VALUES (?, ?)').run(key, value);
  }

  private deleteConfig(key: string): void {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM model_config WHERE key = ?').run(key);
    } catch { /* ignore */ }
  }

  getConfig(): AppConfig {
    if (this.cache) return this.cache;
    const raw = this.readConfig();
    const saved: Partial<AppConfig> = {};
    if (raw.providers) saved.providers = JSON.parse(raw.providers);
    if (raw.selectedProviderId !== undefined) saved.selectedProviderId = raw.selectedProviderId;
    if (raw.selectedModelId !== undefined) saved.selectedModelId = raw.selectedModelId;
    if (raw.temperature !== undefined) saved.temperature = Number(raw.temperature);
    if (raw.maxTokens !== undefined) saved.maxTokens = Number(raw.maxTokens);
    if (raw.providerModels) saved.providerModels = JSON.parse(raw.providerModels);
    if (raw.userModels) saved.userModels = JSON.parse(raw.userModels);
    if (raw.rateLimits) saved.rateLimits = JSON.parse(raw.rateLimits);

    let config = { ...DEFAULT_CONFIG };
    if (saved.providers) {
      config.providers = DEFAULT_PROVIDERS.map(d => {
        const sp = saved.providers!.find((p: ModelProvider) => p.id === d.id);
        if (!sp) return d;
        return { ...d, ...sp, apiKey: sp.apiKey || d.apiKey };
      });
      for (const sp of saved.providers) {
        if (!DEFAULT_PROVIDERS.find(d => d.id === sp.id)) {
          config.providers.push(sp);
        }
      }
    }
    if (saved.selectedProviderId) config.selectedProviderId = saved.selectedProviderId;
    if (saved.selectedModelId) config.selectedModelId = saved.selectedModelId;
    if (saved.temperature !== undefined) config.temperature = saved.temperature;
    if (saved.maxTokens !== undefined) config.maxTokens = saved.maxTokens;
    if (saved.providerModels) config.providerModels = { ...config.providerModels, ...saved.providerModels };
    if (saved.userModels) config.userModels = { ...config.userModels, ...saved.userModels };
    if (saved.rateLimits) config.rateLimits = { ...config.rateLimits, ...saved.rateLimits };

    const selectedProvider = config.providers.find(p => p.id === config.selectedProviderId);
    if (!selectedProvider || !selectedProvider.enabled || !selectedProvider.apiKey) {
      config.selectedProviderId = '';
      config.selectedModelId = '';
    }

    this.cache = config;
    return config;
  }

  saveConfig(data: AppConfig): AppConfig {
    this.writeConfig('providers', JSON.stringify(data.providers));
    this.writeConfig('selectedProviderId', data.selectedProviderId);
    this.writeConfig('selectedModelId', data.selectedModelId);
    this.writeConfig('temperature', String(data.temperature));
    this.writeConfig('maxTokens', String(data.maxTokens));
    this.writeConfig('providerModels', JSON.stringify(data.providerModels || {}));
    this.writeConfig('userModels', JSON.stringify(data.userModels || {}));
    if (data.rateLimits) this.writeConfig('rateLimits', JSON.stringify(data.rateLimits));
    this.cache = data;
    return data;
  }

  updateProvider(id: string, updates: Partial<ModelProvider>): ModelProvider | null {
    const cfg = this.getConfig();
    const idx = cfg.providers.findIndex(p => p.id === id);
    if (idx === -1) return null;
    cfg.providers[idx] = { ...cfg.providers[idx], ...updates };
    this.saveConfig(cfg);
    return cfg.providers[idx];
  }

  removeProvider(id: string): boolean {
    const cfg = this.getConfig();
    const isDefault = DEFAULT_PROVIDERS.find(d => d.id === id);
    const idx = cfg.providers.findIndex(p => p.id === id);
    if (idx === -1) return false;
    if (isDefault) {
      cfg.providers[idx] = { ...isDefault, apiKey: '', enabled: false };
    } else {
      cfg.providers.splice(idx, 1);
    }
    if (cfg.selectedProviderId === id) {
      cfg.selectedProviderId = '';
      cfg.selectedModelId = '';
    }
    this.saveConfig(cfg);
    return true;
  }

  /**
   * 调用提供商 API 获取模型列表，更新 DB 并返回结果
   * 返回格式：
   *   成功: { code: 200, msg: "获取成功", models: ModelConfig[] }
   *   失败: { code: 4xx/5xx, msg: "获取失败", content: "错误详情" }
   */
  async fetchModels(providerId: string): Promise<{ code: number; msg: string; content?: string; models?: ModelConfig[] }> {
    const cfg = this.getConfig();
    const provider = cfg.providers.find(p => p.id === providerId);
    if (!provider) return { code: 404, msg: '获取失败', content: '提供商不存在' };
    if (!provider.apiKey || provider.apiKey.startsWith('••••')) {
      return { code: 400, msg: '获取失败', content: 'API Key 未配置或不可用（掩码值），请先保存真实的 API Key' };
    }
    if (!provider.baseUrl) return { code: 400, msg: '获取失败', content: 'API 地址未配置' };

    const url = provider.baseUrl.replace(/\/+$/, '') + '/models';
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err: any) {
      return { code: 500, msg: '获取失败', content: `请求失败: ${err.message || '网络错误'}` };
    }

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.text()).slice(0, 200); } catch { /* ignore */ }
      return { code: response.status, msg: '获取失败', content: `HTTP ${response.status}: ${response.statusText}${detail ? ' - ' + detail : ''}` };
    }

    let json: any;
    try {
      json = await response.json();
    } catch {
      return { code: 500, msg: '获取失败', content: '响应解析失败：非 JSON 格式' };
    }

    const rawModels: any[] = json.data || json.models || json.model_list || [];
    if (!Array.isArray(rawModels) || rawModels.length === 0) {
      return { code: 500, msg: '获取失败', content: '提供商返回的模型列表为空' };
    }

    const models: ModelConfig[] = rawModels.map((m: any) => {
      const id: string = m.id || m.name || m.model || '';
      const name: string = m.name || m.display_name || m.id || id;
      const cleanId = id.replace(/^models\//, '');
      return {
        id: cleanId,
        name: name.replace(/^models\//, ''),
        maxTokens: m.max_tokens || m.maxTokens || m.context_window || 128000,
        supportsVision: m.supports_vision ?? m.vision ?? false,
        supportsTools: m.supports_tools ?? m.tool_use ?? m.tools ?? true,
      };
    }).filter(m => m.id);

    if (models.length === 0) {
      return { code: 500, msg: '获取失败', content: '解析后无有效模型' };
    }

    const idx = cfg.providers.findIndex(p => p.id === providerId);
    cfg.providers[idx] = { ...provider, models };
    this.saveConfig(cfg);

    return { code: 200, msg: '获取成功', models };
  }

  async verifyProvider(providerId: string, modelId?: string): Promise<{ ok: boolean; message: string }> {
    const cfg = this.getConfig();
    const provider = cfg.providers.find(p => p.id === providerId);
    if (!provider) return { ok: false, message: 'Provider not found' };
    if (!provider.apiKey) return { ok: false, message: 'API Key 未配置' };
    if (!provider.baseUrl) return { ok: false, message: 'API 地址未配置' };

    const errors: string[] = [];
    const testModels = modelId
      ? [modelId]
      : [...new Set([...(provider.models.map(m => m.id)), provider.models[0]?.id || 'gpt-3.5-turbo'].filter(Boolean))];

    const authHeaders: Record<string, string>[] = [
      { 'Authorization': `Bearer ${provider.apiKey}` },
      { 'x-api-key': provider.apiKey },
      { 'Authorization': provider.apiKey },
    ];

    for (const testModel of testModels.slice(0, 3)) {
      for (const authHeader of authHeaders) {
        try {
          const response = await fetch(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeader,
            },
            body: JSON.stringify({
              model: testModel,
              messages: [{ role: 'user', content: 'Hi' }],
              max_tokens: 5,
            }),
            signal: AbortSignal.timeout(8000),
          });

          if (response.ok) {
            return { ok: true, message: '连接成功' };
          }
          const text = await response.text();
          const snippet = text.slice(0, 150);
          errors.push(`${testModel} (${response.status}): ${snippet}`);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          errors.push(`${testModel}: ${errMsg}`);
        }
      }
    }

    const unique = [...new Set(errors)];
    return { ok: false, message: `连接失败: ${unique[0] || '未知错误'}` };
  }

  getProviderModels(providerId: string): ModelConfig[] {
    const cfg = this.getConfig();
    return cfg.providerModels?.[providerId] || [];
  }

  setProviderModels(providerId: string, models: ModelConfig[]): void {
    const cfg = this.getConfig();
    if (!cfg.providerModels) cfg.providerModels = {};
    cfg.providerModels[providerId] = models;
    this.saveConfig(cfg);
  }

  getUserModels(providerId: string): UserModelEntry[] {
    const cfg = this.getConfig();
    return cfg.userModels?.[providerId] || [];
  }

  setUserModels(providerId: string, models: UserModelEntry[]): void {
    const cfg = this.getConfig();
    if (!cfg.userModels) cfg.userModels = {};
    cfg.userModels[providerId] = models;
    this.saveConfig(cfg);
  }

  clearUserModels(providerId: string): void {
    const cfg = this.getConfig();
    if (cfg.userModels) {
      delete cfg.userModels[providerId];
      this.saveConfig(cfg);
    }
  }

  clearAllUserModels(): void {
    const cfg = this.getConfig();
    cfg.userModels = {};
    this.saveConfig(cfg);
  }

  async fetchProviderModels(providerId: string): Promise<{ ok: boolean; message: string; models?: { id: string; name: string; maxTokens: number; supportsVision: boolean; supportsTools: boolean }[] }> {
    const cfg = this.getConfig();
    const provider = cfg.providers.find(p => p.id === providerId);
    if (!provider) return { ok: false, message: 'Provider not found' };
    if (!provider.apiKey) return { ok: false, message: 'API Key 未配置' };
    if (!provider.baseUrl) return { ok: false, message: 'API 地址未配置' };

    try {
      const response = await fetch(`${provider.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const text = await response.text();
        return { ok: false, message: `API 错误 (${response.status}): ${text.slice(0, 200)}` };
      }

      const json = await response.json() as Record<string, any>;
      const apiModels = json.data || json.models || [];

      if (!Array.isArray(apiModels) || apiModels.length === 0) {
        return { ok: false, message: 'API 返回的模型列表为空' };
      }

      const models = apiModels.map((m: any) => ({
        id: m.id || m.model || '',
        name: m.name || m.id || m.model || '未知模型',
        maxTokens: m.max_tokens || m.context_window || m.contextLength || 4096,
        supportsVision: false,
        supportsTools: true,
      })).filter((m: any) => m.id);

      this.setProviderModels(providerId, models);

      return { ok: true, message: `成功获取 ${models.length} 个模型`, models };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `获取失败: ${errMsg}` };
    }
  }

  async fetchRemoteProviders(url: string): Promise<{ ok: boolean; message: string; added: number }> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return { ok: false, message: `HTTP 错误 ${response.status}`, added: 0 };
      }

      const data = await response.json() as { providers?: ModelProvider[] };
      if (!data.providers || !Array.isArray(data.providers)) {
        return { ok: false, message: '无效的配置格式', added: 0 };
      }

      const cfg = this.getConfig();
      let added = 0;

      for (const remoteProvider of data.providers) {
        const existing = cfg.providers.find(p => p.id === remoteProvider.id);
        if (!existing) {
          cfg.providers.push(remoteProvider);
          added++;
        }
      }

      if (added > 0) {
        this.saveConfig(cfg);
      }

      return { ok: true, message: `成功加载 ${added} 个新提供商`, added };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `加载失败: ${errMsg}`, added: 0 };
    }
  }

  async fetchQuota(providerId: string): Promise<{ used: number; total: number; currency: string } | null> {
    const cfg = this.getConfig();
    const provider = cfg.providers.find(p => p.id === providerId);
    if (!provider || !provider.apiKey) return null;

    try {
      const urls = [
        `${provider.baseUrl}/dashboard/billing/subscription`,
        provider.baseUrl.replace(/\/v\d+$/, '') + '/dashboard/billing/usage?date=' + new Date().toISOString().slice(0, 7) + '-01',
      ];

      for (const url of urls) {
        try {
          const resp = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${provider.apiKey}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(8000),
          });
          if (resp.ok) {
            const data = await resp.json() as Record<string, any>;
            if (data.hard_limit_usd) {
              return { used: data.hard_limit_usd - (data.soft_limit_usd || 0), total: data.hard_limit_usd, currency: 'USD' };
            }
            if (data.total_usage !== undefined) {
              return { used: data.total_usage / 100, total: data.hard_limit_usd || 0, currency: 'USD' };
            }
            if (data.data?.used) {
              return { used: data.data.used, total: data.data.total || data.data.limit || 0, currency: data.data.currency || 'USD' };
            }
          }
        } catch {
          // Try next URL
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  resetToDefaults(): AppConfig {
    this.cache = null;
    const keys = ['providers', 'selectedProviderId', 'selectedModelId', 'temperature', 'maxTokens', 'providerModels', 'userModels', 'rateLimits'];
    for (const k of keys) this.deleteConfig(k);
    return this.getConfig();
  }
}