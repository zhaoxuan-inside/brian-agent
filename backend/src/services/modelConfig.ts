import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface ModelConfig {
  id: string;
  name: string;
  maxTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
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
  rateLimits?: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

export const DEFAULT_PROVIDERS: ModelProvider[] = [
  {
    id: 'openai', name: 'OpenAI', type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1', apiKey: '', enabled: true,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'anthropic', name: 'Anthropic', type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1', apiKey: '', enabled: false,
    models: [
      { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', maxTokens: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', maxTokens: 200000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'google', name: 'Google', type: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: '', enabled: false,
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', maxTokens: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', maxTokens: 1048576, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'deepseek', name: 'DeepSeek', type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1', apiKey: '', enabled: false,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', maxTokens: 65536, supportsVision: false, supportsTools: true },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', maxTokens: 65536, supportsVision: false, supportsTools: true },
    ]
  },
  {
    id: 'zhipu', name: '智谱AI (GLM)', type: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', enabled: false,
    models: [
      { id: 'glm-4-flash', name: 'GLM-4 Flash', maxTokens: 128000, supportsVision: true, supportsTools: true },
      { id: 'glm-4', name: 'GLM-4', maxTokens: 128000, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'moonshot', name: 'Moonshot (月之暗面)', type: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1', apiKey: '', enabled: false,
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', maxTokens: 8192, supportsVision: false, supportsTools: true },
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', maxTokens: 128000, supportsVision: false, supportsTools: true },
    ]
  },
  {
    id: 'qwen', name: '通义千问 (Qwen)', type: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', enabled: false,
    models: [
      { id: 'qwen-turbo', name: 'Qwen Turbo', maxTokens: 131072, supportsVision: false, supportsTools: true },
      { id: 'qwen-plus', name: 'Qwen Plus', maxTokens: 131072, supportsVision: true, supportsTools: true },
      { id: 'qwen-max', name: 'Qwen Max', maxTokens: 32768, supportsVision: true, supportsTools: true },
    ]
  },
  {
    id: 'custom', name: '自定义端点', type: 'custom',
    baseUrl: '', apiKey: '', enabled: false, models: []
  }
];

export const DEFAULT_CONFIG: AppConfig = {
  selectedProviderId: 'openai',
  selectedModelId: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 4096,
  providers: DEFAULT_PROVIDERS,
  rateLimits: {
    daily: 100000,
    weekly: 500000,
    monthly: 2000000,
  },
};

export class ModelConfigService {
  private filePath: string;
  private cache: AppConfig | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath || config.configFilePath;
  }

  getConfig(): AppConfig {
    if (this.cache) return this.cache;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const saved = JSON.parse(raw) as AppConfig;
        // Merge with defaults to add any new providers
        const merged = { ...DEFAULT_CONFIG, ...saved };
        merged.providers = DEFAULT_PROVIDERS.map(d => {
          const sp = saved.providers?.find((p: ModelProvider) => p.id === d.id);
          if (!sp) return d;
          return { ...d, ...sp, apiKey: sp.apiKey || d.apiKey };
        });
        // Also add any custom providers from saved that aren't in defaults
        if (saved.providers) {
          for (const sp of saved.providers) {
            if (!DEFAULT_PROVIDERS.find(d => d.id === sp.id)) {
              merged.providers.push(sp);
            }
          }
        }
        this.cache = merged;
        return merged;
      }
    } catch (e) {
      console.error('Failed to load model config:', e);
    }
    this.cache = { ...DEFAULT_CONFIG, providers: JSON.parse(JSON.stringify(DEFAULT_PROVIDERS)) };
    return this.cache;
  }

  saveConfig(data: AppConfig): AppConfig {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
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

  async verifyProvider(providerId: string): Promise<{ ok: boolean; message: string }> {
    const cfg = this.getConfig();
    const provider = cfg.providers.find(p => p.id === providerId);
    if (!provider) return { ok: false, message: 'Provider not found' };
    if (!provider.apiKey) return { ok: false, message: 'API Key 未配置' };
    if (!provider.baseUrl) return { ok: false, message: 'API 地址未配置' };

    try {
      const testModel = provider.models[0]?.id || 'test';
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return { ok: true, message: '连接成功' };
      }
      const text = await response.text();
      return { ok: false, message: `API 错误 (${response.status}): ${text.slice(0, 200)}` };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `连接失败: ${errMsg}` };
    }
  }

  async fetchQuota(providerId: string): Promise<{ used: number; total: number; currency: string } | null> {
    const cfg = this.getConfig();
    const provider = cfg.providers.find(p => p.id === providerId);
    if (!provider || !provider.apiKey) return null;

    try {
      // Try OpenAI-compatible billing endpoints
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
            // OpenAI billing format
            if (data.hard_limit_usd) {
              return { used: data.hard_limit_usd - (data.soft_limit_usd || 0), total: data.hard_limit_usd, currency: 'USD' };
            }
            if (data.total_usage !== undefined) {
              return { used: data.total_usage / 100, total: data.hard_limit_usd || 0, currency: 'USD' };
            }
            // Generic: look for usage/total patterns
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
    const dir = path.dirname(this.filePath);
    if (fs.existsSync(dir) && fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
    return this.getConfig();
  }
}
