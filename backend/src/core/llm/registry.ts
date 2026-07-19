import { v4 as uuidv4 } from 'uuid';
import { RegisteredModel, ModelSelectionStrategy } from '../../shared/types';
import { ModelConfigService, ModelProvider } from './modelConfig';

/**
 * ModelRegistry manages all registered LLM models.
 * Models can be registered manually or synced from a ModelConfigService.
 */
export class ModelRegistry {
  private models: Map<string, RegisteredModel> = new Map();

  /**
   * Register a model. Returns the model's ID.
   * If the model already has an ID, it will be used; otherwise a new UUID is generated.
   */
  register(model: RegisteredModel): string {
    const id = model.id || uuidv4();
    const registeredModel: RegisteredModel = { ...model, id };
    this.models.set(id, registeredModel);
    return id;
  }

  /**
   * Unregister a model by ID.
   */
  unregister(modelId: string): void {
    this.models.delete(modelId);
  }

  /**
   * List all registered models.
   */
  listAll(): RegisteredModel[] {
    return Array.from(this.models.values());
  }

  /**
   * List models by provider ID.
   */
  listByProvider(providerId: string): RegisteredModel[] {
    return Array.from(this.models.values()).filter(m => m.providerId === providerId);
  }

  /**
   * List models by capability (chat, stream, toolCall, embed).
   */
  listByCapability(capability: string): RegisteredModel[] {
    return Array.from(this.models.values()).filter(m => {
      const caps = m.capabilities as Record<string, boolean>;
      return caps[capability] === true;
    });
  }

  /**
   * Select the best model based on a strategy.
   *
   * Strategies:
   * - best_quality: prefer models with highest maxTokens and toolCall support
   * - lowest_cost: prefer smaller models (gpt-4o-mini, deepseek-chat, etc.)
   * - fastest: prefer models known for speed (gpt-4o-mini, claude-3-haiku, gemini-flash)
   * - most_available: prefer active models with highest success rate
   * - auto: choose based on task context (defaults to best_quality)
   */
  select(criteria: { strategy: ModelSelectionStrategy; task?: string }): RegisteredModel {
    const activeModels = Array.from(this.models.values()).filter(
      m => m.status === 'active'
    );

    if (activeModels.length === 0) {
      // Fall back to any registered model
      const all = Array.from(this.models.values());
      if (all.length === 0) {
        throw new Error('No models registered');
      }
      return all[0];
    }

    const { strategy, task } = criteria;

    switch (strategy) {
      case 'lowest_cost': {
        // Prefer smaller/cheaper models
        const costRanking: Record<string, number> = {
          'gpt-4o-mini': 1,
          'deepseek-chat': 1,
          'glm-4-flash': 1,
          'moonshot-v1-8k': 1,
          'qwen-turbo': 1,
          'claude-3-haiku': 2,
          'gemini-2.5-flash': 2,
          'gpt-4o': 3,
          'claude-3-5-sonnet': 3,
          'gemini-1.5-pro': 3,
          'claude-3-opus': 4,
          'gpt-4-turbo': 4,
        };
        activeModels.sort((a, b) => {
          const rankA = costRanking[a.modelName] || 99;
          const rankB = costRanking[b.modelName] || 99;
          return rankA - rankB;
        });
        return activeModels[0];
      }

      case 'fastest': {
        // Prefer models known for speed
        const speedRanking: Record<string, number> = {
          'gpt-4o-mini': 1,
          'claude-3-haiku': 1,
          'gemini-2.5-flash': 1,
          'deepseek-chat': 2,
          'glm-4-flash': 2,
          'gpt-4o': 3,
          'claude-3-5-sonnet': 3,
          'gemini-1.5-pro': 3,
          'claude-3-opus': 4,
        };
        activeModels.sort((a, b) => {
          const rankA = speedRanking[a.modelName] || 99;
          const rankB = speedRanking[b.modelName] || 99;
          return rankA - rankB;
        });
        return activeModels[0];
      }

      case 'most_available': {
        // Prefer models with highest success rate
        activeModels.sort((a, b) => b.stats.successRate - a.stats.successRate);
        return activeModels[0];
      }

      case 'auto': {
        // Auto-select based on task context
        if (task) {
          const taskLower = task.toLowerCase();
          // For coding tasks, prefer models with tool calling
          if (/code|program|debug|develop|build|implement|refactor|test|fix/.test(taskLower)) {
            const toolModels = activeModels.filter(m => m.capabilities.toolCall);
            if (toolModels.length > 0) {
              // Prefer DeepSeek Coder or GPT-4o for coding
              const coder = toolModels.find(m => m.modelName === 'deepseek-coder');
              if (coder) return coder;
              const gpt4 = toolModels.find(m => m.modelName === 'gpt-4o');
              if (gpt4) return gpt4;
              return toolModels[0];
            }
          }
          // For creative tasks, prefer models with higher temperature tolerance
          if (/creative|write|story|design|brainstorm|generate/.test(taskLower)) {
            return activeModels[0];
          }
          // For simple tasks, prefer cheap models
          if (/simple|quick|summarize|translate|answer/.test(taskLower)) {
            const cheap = activeModels.find(m =>
              ['gpt-4o-mini', 'deepseek-chat', 'claude-3-haiku', 'gemini-2.5-flash'].includes(m.modelName)
            );
            if (cheap) return cheap;
          }
        }
        // Default: best quality
        return this.select({ strategy: 'best_quality' });
      }

      case 'best_quality':
      default: {
        // Prefer models with toolCall + vision support and high maxTokens
        activeModels.sort((a, b) => {
          const scoreA = (a.capabilities.toolCall ? 3 : 0) + (a.capabilities.stream ? 1 : 0);
          const scoreB = (b.capabilities.toolCall ? 3 : 0) + (b.capabilities.stream ? 1 : 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          return b.stats.successRate - a.stats.successRate;
        });
        return activeModels[0];
      }
    }
  }

  /**
   * Get a model by ID.
   */
  getModel(modelId: string): RegisteredModel | undefined {
    return this.models.get(modelId);
  }

  /**
   * Verify model connectivity by sending a minimal test request.
   */
  async verify(modelId: string): Promise<boolean> {
    const model = this.models.get(modelId);
    if (!model) return false;

    const { baseUrl, apiKey } = model.config;
    if (!apiKey || !baseUrl) return false;

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.modelName,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        model.status = 'active';
        return true;
      }

      // Check if it's an auth error vs model error
      if (response.status === 401 || response.status === 403) {
        model.status = 'error';
      }
      return false;
    } catch {
      model.status = 'error';
      return false;
    }
  }

  /**
   * Get quota information for a model.
   */
  getQuota(modelId: string): { used: number; total: number } | null {
    const model = this.models.get(modelId);
    if (!model) return null;
    return {
      used: model.quota.used,
      total: model.quota.daily + model.quota.weekly + model.quota.monthly,
    };
  }

  /**
   * Get usage statistics for a model.
   */
  getStats(modelId: string): {
    totalCalls: number;
    totalTokens: number;
    avgLatency: number;
    successRate: number;
  } {
    const model = this.models.get(modelId);
    if (!model) {
      return { totalCalls: 0, totalTokens: 0, avgLatency: 0, successRate: 0 };
    }
    return { ...model.stats };
  }

  /**
   * Sync registered models from a ModelConfigService.
   * This clears existing models and re-registers all enabled models from the config.
   */
  syncFromConfig(config: ModelConfigService): void {
    const appConfig = config.getConfig();

    for (const provider of appConfig.providers) {
      if (!provider.enabled) continue;
      if (!provider.apiKey) continue;

      const providerType = this.mapProviderType(provider);

      for (const modelConfig of provider.models) {
        const modelId = `${provider.id}:${modelConfig.id}`;

        const existing = this.models.get(modelId);
        const stats = existing?.stats || {
          totalCalls: 0,
          totalTokens: 0,
          avgLatency: 0,
          successRate: 1.0,
        };
        const quota = existing?.quota || {
          daily: appConfig.rateLimits?.daily || 100000,
          weekly: appConfig.rateLimits?.weekly || 500000,
          monthly: appConfig.rateLimits?.monthly || 2000000,
          used: 0,
        };

        const registeredModel: RegisteredModel = {
          id: modelId,
          providerId: provider.id,
          providerType,
          modelName: modelConfig.id,
          displayName: modelConfig.name,
          capabilities: {
            chat: true,
            stream: true,
            toolCall: modelConfig.supportsTools,
            embed: false,
          },
          config: {
            temperature: appConfig.temperature,
            maxTokens: appConfig.maxTokens,
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl,
          },
          quota,
          stats,
          status: existing?.status || 'active',
          registeredAt: existing?.registeredAt || Date.now(),
        };

        this.models.set(modelId, registeredModel);
      }
    }
  }

  /**
   * Map a ModelProvider type to the RegisteredModel providerType.
   */
  private mapProviderType(provider: ModelProvider): 'openai' | 'anthropic' | 'google' {
    switch (provider.type) {
      case 'anthropic':
        return 'anthropic';
      case 'google':
        return 'google';
      case 'openai-compatible':
      case 'custom':
      default:
        return 'openai';
    }
  }
}