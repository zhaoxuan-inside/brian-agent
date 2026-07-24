import { z } from 'zod';
import { LLMProvider, LLMWrapper, ChatCompletionRequest, ChatCompletionResponse, EmbeddingRequest, EmbeddingResponse, OpenAIWrapper, AnthropicWrapper, GoogleWrapper, DBWrapper } from '../../base';
import { logger } from '../../infrastructure/logger';
import { generateUUIDv7 } from '../../infrastructure/uuid';

export const TokenUsageSchema = z.object({
  modelId: z.string(),
  date: z.string(),
  totalTokens: z.number().default(0),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  callCount: z.number().default(0),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export type LLMConfig = ModelConfig;
export type ProviderType = 'openai' | 'anthropic' | 'google';

export interface ModelConfig {
  id: string;
  userId: string;
  name: string;
  providerId?: string;
  modelId?: string;
  type: 'openai' | 'anthropic' | 'google';
  endpoint: string;
  apiKey: string;
  defaultParameters: {
    temperature: number;
    maxTokens: number;
    contextWindow: number;
  };
  status: 'active' | 'disabled' | 'error';
  priority: number;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ModelConfigProvider {
  listConfigs(userId?: string): Promise<ModelConfig[]>;
  getConfig(id: string): Promise<ModelConfig | undefined>;
  createConfig(config: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModelConfig>;
  updateConfig(id: string, updates: Partial<ModelConfig>): Promise<ModelConfig | undefined>;
  deleteConfig(id: string): Promise<void>;
  setDefault(id: string): Promise<void>;
  getDefaultConfig(): Promise<ModelConfig | undefined>;
}

export interface FallbackConfigProvider {
  getConfig(): {
    selectedProviderId: string;
    selectedModelId: string;
    temperature: number;
    maxTokens: number;
    providers: Array<{
      id: string;
      type: string;
      baseUrl: string;
      apiKey: string;
      enabled: boolean;
    }>;
  };
}

export class LLMService {
  private wrappers: Map<string, LLMWrapper> = new Map();
  private defaultModelId: string | null = null;
  private fallbackConfigProvider: FallbackConfigProvider | null = null;

  constructor(
    private configProvider: ModelConfigProvider,
    private db?: DBWrapper
  ) {}

  setFallbackConfigProvider(provider: FallbackConfigProvider): void {
    this.fallbackConfigProvider = provider;
  }

  async init(): Promise<void> {
    await this.loadModelConfigs();
  }

  private async loadModelConfigs(): Promise<void> {
    const configs = await this.configProvider.listConfigs();
    for (const config of configs) {
      if (config.status === 'active') {
        const wrapper = this.createWrapper(config);
        this.wrappers.set(config.id, wrapper);
        if (config.isDefault) {
          this.defaultModelId = config.id;
        }
      }
    }
  }

  private async ensureWrappersLoaded(): Promise<void> {
    if (this.wrappers.size > 0) return;

    logger.info('LLMService', '[ensureWrappersLoaded] Loading wrappers from user model configs...');
    const configs = await this.configProvider.listConfigs();
    logger.info('LLMService', `[ensureWrappersLoaded] Found ${configs.length} model configs`);

    const activeConfigs = configs.filter(c => c.status === 'active');
    logger.info('LLMService', `[ensureWrappersLoaded] Active configs: ${activeConfigs.length}`);

    if (activeConfigs.length === 0) {
      logger.warn('LLMService', '[ensureWrappersLoaded] No active model configs — LLM calls will be rejected');
      return;
    }

    for (const config of activeConfigs) {
      const resolved = this.resolveCredentials(config);
      if (!resolved.apiKey || !resolved.endpoint) {
        logger.warn('LLMService', `[ensureWrappersLoaded] Skipping model "${config.modelId || config.name}" — provider "${config.providerId}" has no credentials`);
        continue;
      }
      logger.info('LLMService', `[ensureWrappersLoaded] Creating wrapper: id=${config.id} provider=${config.providerId} model=${config.modelId || config.name} type=${resolved.type}`);
      const wrapper = this.createWrapper(resolved);
      this.wrappers.set(config.id, wrapper);
      if (config.isDefault) {
        this.defaultModelId = config.id;
        logger.info('LLMService', `[ensureWrappersLoaded] Default model set: id=${config.id} model=${config.modelId || config.name}`);
      }
    }

    if (!this.defaultModelId && this.wrappers.size > 0) {
      const firstId = this.wrappers.keys().next().value as string;
      this.defaultModelId = firstId;
      logger.info('LLMService', `[ensureWrappersLoaded] No model marked as default — using first: id=${firstId}`);
    }

    logger.info('LLMService', `[ensureWrappersLoaded] Loaded ${this.wrappers.size} wrappers, defaultModelId=${this.defaultModelId}`);
  }

  private resolveCredentials(config: ModelConfig): ModelConfig {
    if (config.apiKey && config.endpoint) return config;

    const providerId = (config as any).providerId as string | undefined;
    if (!providerId) {
      logger.warn('LLMService', `[resolveCredentials] No providerId on config id=${config.id}, using config as-is`);
      return config;
    }

    if (!this.fallbackConfigProvider) {
      logger.warn('LLMService', `[resolveCredentials] No fallbackConfigProvider, using config as-is for provider=${providerId}`);
      return config;
    }

    try {
      const providerCfg = this.fallbackConfigProvider.getConfig();
      const provider = providerCfg.providers.find(p => p.id === providerId);
      if (provider && provider.enabled && provider.apiKey && provider.baseUrl) {
        const providerType = provider.type === 'anthropic' ? 'anthropic' as const :
          provider.type === 'google' ? 'google' as const : 'openai' as const;
        logger.info('LLMService', `[resolveCredentials] Resolved: provider=${providerId} type=${providerType} baseUrl=${provider.baseUrl}`);
        return {
          ...config,
          type: providerType,
          endpoint: provider.baseUrl,
          apiKey: provider.apiKey,
        };
      }
      logger.warn('LLMService', `[resolveCredentials] Provider "${providerId}" not found / disabled / no key in provider config`);
    } catch (e: any) {
      logger.warn('LLMService', `[resolveCredentials] Failed to resolve provider "${providerId}": ${e.message || e}`);
    }
    return config;
  }

  invalidateModelCache(): void {
    logger.info('LLMService', `[invalidateModelCache] Clearing ${this.wrappers.size} wrappers, defaultModelId=${this.defaultModelId}`);
    this.wrappers.clear();
    this.defaultModelId = null;
  }

  private createWrapper(config: ModelConfig): LLMWrapper {
    switch (config.type) {
      case 'openai':
        return new OpenAIWrapper(config.apiKey, config.endpoint);
      case 'anthropic':
        return new AnthropicWrapper(config.apiKey, config.endpoint);
      case 'google':
        return new GoogleWrapper(config.apiKey, config.endpoint);
      default:
        throw new Error(`Unsupported LLM provider: ${config.type}`);
    }
  }

  async chatCompletion(request: ChatCompletionRequest, modelId?: string, signal?: AbortSignal): Promise<ChatCompletionResponse> {
    const wrapper = await this.getWrapper(modelId);
    const config = await this.getModelConfig(modelId);
    const startTime = Date.now();
    const effectiveModelId = modelId || this.defaultModelId;

    logger.info('LLMService', `[chatCompletion] modelId=${effectiveModelId}, msgCount=${request.messages.length}, temperature=${request.temperature}, maxTokens=${request.maxTokens}`);

    try {
      const response = await wrapper.chatCompletion(request, signal);
      const latency = Date.now() - startTime;
      const tokens = response.usage?.totalTokens || 0;
      logger.info('LLMService', `[chatCompletion] success: latency=${latency}ms, tokens=${tokens} (in=${response.usage?.promptTokens}, out=${response.usage?.completionTokens}), modelId=${effectiveModelId}`);
      await this.recordCallHistory(config, tokens, latency, true);
      return response;
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error('LLMService', `[chatCompletion] failed: latency=${latency}ms, modelId=${effectiveModelId}, error=${(error as Error).message}`);
      await this.recordCallHistory(config, 0, latency, false, (error as Error).message);
      throw error;
    }
  }

  async* streamChatCompletion(request: ChatCompletionRequest, modelId?: string): AsyncIterable<string> {
    const wrapper = await this.getWrapper(modelId);
    const config = await this.getModelConfig(modelId);
    const startTime = Date.now();
    const effectiveModelId = modelId || this.defaultModelId;
    let totalContent = '';
    let hasError = false;

    // Override model name with the actual configured model ID if the request has a generic model
    const actualModelName = config.modelId || config.name;
    if (actualModelName && actualModelName !== 'fallback' && request.model !== actualModelName) {
      logger.info('LLMService', `[streamChatCompletion] overriding model: ${request.model} -> ${actualModelName}`);
      request = { ...request, model: actualModelName };
    }

    logger.info('LLMService', `[streamChatCompletion] modelId=${effectiveModelId}, model=${request.model}, msgCount=${request.messages.length}`);

    try {
      for await (const chunk of wrapper.streamChatCompletion(request)) {
        totalContent += chunk;
        yield chunk;
      }
      logger.info('LLMService', `[streamChatCompletion] completed: latency=${Date.now() - startTime}ms, totalChars=${totalContent.length}, modelId=${effectiveModelId}`);
    } catch (e) {
      hasError = true;
      logger.error('LLMService', `[streamChatCompletion] failed: latency=${Date.now() - startTime}ms, modelId=${effectiveModelId}, error=${(e as Error).message}`);
      throw e;
    } finally {
      const latency = Date.now() - startTime;
      const estimatedTokens = Math.ceil(totalContent.length / 4);
      await this.recordCallHistory(config, estimatedTokens, latency, !hasError);
    }
  }

  async generateEmbedding(request: EmbeddingRequest, modelId?: string): Promise<EmbeddingResponse> {
    const wrapper = await this.getWrapper(modelId);
    const config = await this.getModelConfig(modelId);
    const startTime = Date.now();

    try {
      const response = await wrapper.generateEmbedding(request);
      const latency = Date.now() - startTime;
      await this.recordCallHistory(config, response.usage?.totalTokens || 0, latency, true);
      return response;
    } catch (error) {
      const latency = Date.now() - startTime;
      await this.recordCallHistory(config, 0, latency, false, (error as Error).message);
      throw error;
    }
  }

  async getWrapper(modelId?: string): Promise<LLMWrapper> {
    await this.ensureWrappersLoaded();
    const id = modelId || this.defaultModelId;
    if (!id) {
      logger.error('LLMService', '[getWrapper] No model configured — rejected. Please configure at least one model in Settings.');
      throw new Error('No LLM model configured. Please configure a model provider in Settings.');
    }
    let wrapper = this.wrappers.get(id);
    if (!wrapper && this.defaultModelId && id !== this.defaultModelId) {
      wrapper = this.wrappers.get(this.defaultModelId);
      if (wrapper) {
        logger.info('LLMService', `[getWrapper] model "${id}" not found, falling back to default "${this.defaultModelId}"`);
      }
    }
    if (!wrapper) {
      logger.error('LLMService', `[getWrapper] Model "${id}" not found in loaded wrappers (${this.wrappers.size} available)`);
      throw new Error(`LLM model not found: ${id}. Please configure a model provider in Settings.`);
    }
    return wrapper;
  }

  private async getModelConfig(modelId?: string): Promise<ModelConfig> {
    await this.ensureWrappersLoaded();
    const id = modelId || this.defaultModelId;
    if (!id) {
      throw new Error('No LLM model configured. Please configure a model provider in Settings.');
    }
    const config = await this.configProvider.getConfig(id);
    if (!config) {
      const wrapper = this.wrappers.get(id);
      if (wrapper) {
        logger.info('LLMService', `[getModelConfig] Using in-memory wrapper for id=${id}`);
        return {
          id,
          userId: 'default',
          name: id,
          type: wrapper.provider,
          endpoint: wrapper.baseUrl,
          apiKey: wrapper.apiKey,
          defaultParameters: {
            temperature: 0.7,
            maxTokens: 4096,
            contextWindow: 4096,
          },
          status: 'active',
          priority: 0,
          isDefault: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }
      throw new Error(`Model config not found: ${id}. Please configure a model provider in Settings.`);
    }
    return config;
  }

  private async recordCallHistory(
    config: ModelConfig,
    tokens: number,
    latencyMs: number,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    if (!this.db) return;

    try {
      const id = generateUUIDv7();
      await this.db.run(
        `INSERT INTO call_history (id, provider_id, model_id, tokens, latency_ms, success, error_message, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, config.id, config.name, tokens, latencyMs, success ? 1 : 0, errorMessage || null, Math.floor(Date.now() / 1000)]
      );
    } catch {
      // non-critical: silently ignore recording failures
    }
  }

  async listModels(userId?: string): Promise<ModelConfig[]> {
    return this.configProvider.listConfigs(userId);
  }

  async getModel(id: string): Promise<ModelConfig | undefined> {
    return this.configProvider.getConfig(id);
  }

  async createModel(config: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModelConfig> {
    const model = await this.configProvider.createConfig(config);
    if (model.status === 'active') {
      const wrapper = this.createWrapper(model);
      this.wrappers.set(model.id, wrapper);
    }
    if (model.isDefault) {
      this.defaultModelId = model.id;
    }
    return model;
  }

  async updateModel(id: string, updates: Partial<ModelConfig>): Promise<ModelConfig | undefined> {
    const updated = await this.configProvider.updateConfig(id, updates);
    if (!updated) return undefined;

    if (updated.status === 'active') {
      const wrapper = this.createWrapper(updated);
      this.wrappers.set(id, wrapper);
    } else {
      this.wrappers.delete(id);
    }

    if (updated.isDefault) {
      this.defaultModelId = id;
    }

    return updated;
  }

  async deleteModel(id: string): Promise<void> {
    await this.configProvider.deleteConfig(id);
    this.wrappers.delete(id);
    if (this.defaultModelId === id) {
      this.defaultModelId = null;
    }
  }

  async setDefaultModel(id: string): Promise<void> {
    await this.configProvider.setDefault(id);
    this.defaultModelId = id;
  }

  async testModel(id: string): Promise<{ success: boolean; message: string; latency: number }> {
    const wrapper = this.wrappers.get(id);
    if (!wrapper) {
      return { success: false, message: 'Model not found', latency: 0 };
    }

    const start = Date.now();
    const result = await wrapper.validateConfig();
    const latency = Date.now() - start;

    return { ...result, latency };
  }

  async getTokenUsage(modelId: string, dateRange?: { start: string; end: string }): Promise<TokenUsage[]> {
    if (!this.db) return [];

    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db.query<any>(
      `SELECT model_id, SUM(tokens) as total_tokens, COUNT(*) as call_count, SUM(latency_ms) as total_latency
       FROM call_history
       WHERE model_id = ? AND success = 1
       ${dateRange ? 'AND timestamp >= ? AND timestamp <= ?' : ''}
       GROUP BY model_id`,
      dateRange ? [modelId, dateRange.start, dateRange.end] : [modelId]
    );

    return rows.map((r: any) => ({
      modelId: r.model_id || modelId,
      date: today,
      totalTokens: r.total_tokens || 0,
      inputTokens: Math.floor((r.total_tokens || 0) * 0.3),
      outputTokens: Math.floor((r.total_tokens || 0) * 0.7),
      callCount: r.call_count || 0,
    }));
  }

  getTokenStats(): { totalCalls: number; totalTokens: number; byModel: Record<string, { calls: number; tokens: number }> } {
    return { totalCalls: 0, totalTokens: 0, byModel: {} };
  }

  async getTokenStatsAsync(): Promise<{ totalCalls: number; totalTokens: number; byModel: Record<string, { calls: number; tokens: number }> }> {
    if (!this.db) {
      return { totalCalls: 0, totalTokens: 0, byModel: {} };
    }

    const rows = await this.db.query<any>(
      `SELECT model_id, COUNT(*) as calls, SUM(tokens) as total_tokens
       FROM call_history
       WHERE success = 1
       GROUP BY model_id`
    );

    const byModel: Record<string, { calls: number; tokens: number }> = {};
    let totalCalls = 0;
    let totalTokens = 0;

    for (const row of rows) {
      byModel[row.model_id] = { calls: row.calls, tokens: row.total_tokens || 0 };
      totalCalls += row.calls;
      totalTokens += row.total_tokens || 0;
    }

    return { totalCalls, totalTokens, byModel };
  }

  getUserTokenStats(userId: string): { totalCalls: number; totalTokens: number; byModel: Record<string, { calls: number; tokens: number }> } {
    return { totalCalls: 0, totalTokens: 0, byModel: {} };
  }

  async getAllConfigs(): Promise<ModelConfig[]> {
    return this.listModels();
  }

  async addConfig(config: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModelConfig> {
    return this.createModel(config);
  }

  async updateConfig(id: string, updates: Partial<ModelConfig>): Promise<ModelConfig | undefined> {
    return this.updateModel(id, updates);
  }

  async removeConfig(id: string): Promise<void> {
    return this.deleteModel(id);
  }
}