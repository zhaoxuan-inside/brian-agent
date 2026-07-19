import { ChatMessage, LLMResponse, Tool, RegisteredModel } from '../../shared/types';
import { LLMError } from '../../shared/errors';
import { ModelConfigService } from './modelConfig';
import { ModelRegistry } from './registry';
import { EmbeddingService } from './embedding';
import { callOpenAI, streamOpenAI, callOpenAIWithTools } from './adapters/openai';
import { callAnthropic, streamAnthropic, callAnthropicWithTools } from './adapters/anthropic';
import { callGemini, streamGemini, callGeminiWithTools } from './adapters/google';
import { TimeSeriesStorage } from '../storage/timeseries';

/**
 * LLMService is the main entry point for all LLM operations.
 * It manages model registry, embedding, and provides a unified interface
 * for chat, streaming, tool calling, and embedding.
 */
export class LLMService {
  registry: ModelRegistry;
  embedding: EmbeddingService;
  private config: ModelConfigService;
  private timeSeries: TimeSeriesStorage;

  constructor(config: ModelConfigService) {
    this.config = config;
    this.registry = new ModelRegistry();
    this.embedding = new EmbeddingService();
    this.timeSeries = new TimeSeriesStorage();
    this.registry.syncFromConfig(config);
  }

  /**
   * Send a chat completion request (non-streaming).
   */
  async chat(
    messages: ChatMessage[],
    options?: {
      modelId?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<LLMResponse> {
    const { provider, model, registeredModel } = this.getProvider(options?.modelId);
    const temperature = options?.temperature ?? registeredModel.config.temperature;
    const maxTokens = options?.maxTokens ?? registeredModel.config.maxTokens;

    const startTime = Date.now();

    let response: LLMResponse;
    switch (registeredModel.providerType) {
      case 'anthropic':
        response = await callAnthropic(provider, model, messages, temperature, maxTokens);
        break;
      case 'google':
        response = await callGemini(provider, model, messages, temperature, maxTokens);
        break;
      case 'openai':
      default:
        response = await callOpenAI(provider, model, messages, temperature, maxTokens);
        break;
    }

    this.updateStats(registeredModel, response, Date.now() - startTime);
    return response;
  }

  /**
   * Send a streaming chat completion request.
   * Yields content delta strings as they arrive.
   * Returns the full LLMResponse on completion.
   */
  async *chatStream(
    messages: ChatMessage[],
    options?: {
      modelId?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<string, LLMResponse> {
    const { provider, model, registeredModel } = this.getProvider(options?.modelId);
    const temperature = options?.temperature ?? registeredModel.config.temperature;
    const maxTokens = options?.maxTokens ?? registeredModel.config.maxTokens;

    const startTime = Date.now();

    let streamResult: LLMResponse;
    switch (registeredModel.providerType) {
      case 'anthropic': {
        const gen = streamAnthropic(provider, model, messages, temperature, maxTokens);
        streamResult = yield* gen;
        break;
      }
      case 'google': {
        const gen = streamGemini(provider, model, messages, temperature, maxTokens);
        streamResult = yield* gen;
        break;
      }
      case 'openai':
      default: {
        const gen = streamOpenAI(provider, model, messages, temperature, maxTokens);
        streamResult = yield* gen;
        break;
      }
    }

    const elapsed = Date.now() - startTime;
    this.updateStats(registeredModel, streamResult, elapsed);
    return streamResult;
  }

  /**
   * Send a chat completion request with tool/function calling support.
   */
  async chatWithTools(
    messages: ChatMessage[],
    tools: Tool[],
    options?: {
      modelId?: string;
      temperature?: number;
    }
  ): Promise<LLMResponse> {
    const { provider, model, registeredModel } = this.getProvider(options?.modelId);
    const temperature = options?.temperature ?? registeredModel.config.temperature;

    const startTime = Date.now();

    let response: LLMResponse;
    switch (registeredModel.providerType) {
      case 'anthropic':
        response = await callAnthropicWithTools(provider, model, messages, tools, temperature);
        break;
      case 'google':
        response = await callGeminiWithTools(provider, model, messages, tools, temperature);
        break;
      case 'openai':
      default:
        response = await callOpenAIWithTools(provider, model, messages, tools, temperature);
        break;
    }

    const elapsed = Date.now() - startTime;
    this.updateStats(registeredModel, response, elapsed);
    return response;
  }

  /**
   * Generate embeddings for a batch of texts.
   * Uses remote embedding if configured, otherwise falls back to local TF-IDF.
   */
  async embed(texts: string[]): Promise<number[][]> {
    return this.embedding.embed(texts);
  }

  /**
   * Resolve a model ID to its provider configuration and adapter routing info.
   * If no modelId is provided, uses the selected model from the config.
   */
  private getProvider(modelId?: string): {
    provider: { baseUrl: string; apiKey: string };
    model: string;
    registeredModel: RegisteredModel;
  } {
    const appConfig = this.config.getConfig();

    // Resolve model ID
    const resolvedModelId = modelId || `${appConfig.selectedProviderId}:${appConfig.selectedModelId}`;

    // Try to find the model in the registry
    let registeredModel = this.registry.getModel(resolvedModelId);

    if (!registeredModel) {
      // Try to find by just the model name (without provider prefix)
      const allModels = this.registry.listAll();
      registeredModel = allModels.find(m => m.modelName === resolvedModelId || m.id === resolvedModelId);
    }

    if (!registeredModel) {
      // Fall back to the selected provider from config
      const provider = appConfig.providers.find(p => p.id === appConfig.selectedProviderId);
      if (!provider) {
        throw new LLMError('No LLM provider configured. Please configure at least one provider.');
      }

      const providerType = provider.type === 'anthropic' ? 'anthropic' :
        provider.type === 'google' ? 'google' : 'openai';

      registeredModel = {
        id: `${provider.id}:${appConfig.selectedModelId}`,
        providerId: provider.id,
        providerType,
        modelName: appConfig.selectedModelId,
        displayName: appConfig.selectedModelId,
        capabilities: {
          chat: true,
          stream: true,
          toolCall: true,
          embed: false,
        },
        config: {
          temperature: appConfig.temperature,
          maxTokens: appConfig.maxTokens,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
        },
        quota: {
          daily: appConfig.rateLimits?.daily || 100000,
          weekly: appConfig.rateLimits?.weekly || 500000,
          monthly: appConfig.rateLimits?.monthly || 2000000,
          used: 0,
        },
        stats: {
          totalCalls: 0,
          totalTokens: 0,
          avgLatency: 0,
          successRate: 1.0,
        },
        status: 'active',
        registeredAt: Date.now(),
      };
    }

    const provider = {
      baseUrl: registeredModel.config.baseUrl,
      apiKey: registeredModel.config.apiKey,
    };

    if (!provider.apiKey) {
      throw new LLMError(
        `API key not configured for provider "${registeredModel.providerId}". ` +
        `Please configure the API key in settings.`,
        registeredModel.providerId
      );
    }

    return {
      provider,
      model: registeredModel.modelName,
      registeredModel,
    };
  }

  /**
   * Update model statistics after a successful call.
   */
  private updateStats(
    model: RegisteredModel,
    response: LLMResponse,
    actualLatency: number
  ): void {
    const stats = model.stats;
    const prevTotalCalls = stats.totalCalls;

    stats.totalCalls += 1;
    stats.totalTokens += response.usage.totalTokens;

    // Update rolling average latency
    stats.avgLatency =
      (stats.avgLatency * prevTotalCalls + actualLatency) / stats.totalCalls;

    // Update success rate (assume success if we got here)
    stats.successRate =
      (stats.successRate * prevTotalCalls + 1) / stats.totalCalls;

    // Update quota usage
    model.quota.used += response.usage.totalTokens;

    // Record to time series
    try {
      this.timeSeries.insert('llm_tokens', response.usage.totalTokens, {
        modelId: model.id,
        providerId: model.providerId,
      });
      this.timeSeries.insert('llm_calls', 1, {
        modelId: model.id,
        providerId: model.providerId,
      });
      this.timeSeries.insert('llm_latency', actualLatency, {
        modelId: model.id,
        providerId: model.providerId,
      });
    } catch {
      // Ignore time series errors
    }
  }
}