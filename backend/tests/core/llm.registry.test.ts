import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry } from '../../src/core/llm/registry';
import { ModelConfigService } from '../../src/core/llm/modelConfig';
import { RegisteredModel } from '../../src/shared/types';

function makeModel(overrides: Partial<RegisteredModel> = {}): RegisteredModel {
  return {
    id: '',
    providerId: 'openai',
    providerType: 'openai',
    modelName: 'gpt-4o',
    displayName: 'GPT-4o',
    capabilities: { chat: true, stream: true, toolCall: true, embed: false },
    config: { temperature: 0.7, maxTokens: 4096, apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' },
    quota: { daily: 100000, weekly: 500000, monthly: 2000000, used: 0 },
    stats: { totalCalls: 0, totalTokens: 0, avgLatency: 0, successRate: 1.0 },
    status: 'active',
    registeredAt: Date.now(),
    ...overrides,
  };
}

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  it('should register a model and return its id', () => {
    const model = makeModel();
    const id = registry.register(model);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('should register a model with existing id', () => {
    const model = makeModel({ id: 'my-custom-id' });
    const id = registry.register(model);
    expect(id).toBe('my-custom-id');
  });

  it('should unregister a model', () => {
    const model = makeModel();
    const id = registry.register(model);
    registry.unregister(id);
    expect(registry.getModel(id)).toBeUndefined();
  });

  it('should listAll return all registered models', () => {
    registry.register(makeModel({ modelName: 'model-a', id: 'a' }));
    registry.register(makeModel({ modelName: 'model-b', id: 'b' }));
    const all = registry.listAll();
    expect(all.length).toBe(2);
    const names = all.map(m => m.modelName).sort();
    expect(names).toEqual(['model-a', 'model-b']);
  });

  it('should listByProvider filter correctly', () => {
    registry.register(makeModel({ modelName: 'gpt-4o', providerId: 'openai', id: 'o1' }));
    registry.register(makeModel({ modelName: 'claude', providerId: 'anthropic', providerType: 'anthropic', id: 'a1' }));
    registry.register(makeModel({ modelName: 'gpt-4o-mini', providerId: 'openai', id: 'o2' }));

    const openai = registry.listByProvider('openai');
    expect(openai.length).toBe(2);
    expect(openai.every(m => m.providerId === 'openai')).toBe(true);

    const anthropic = registry.listByProvider('anthropic');
    expect(anthropic.length).toBe(1);
  });

  it('should listByCapability filter by chat', () => {
    registry.register(makeModel({ modelName: 'chat-model', capabilities: { chat: true, stream: false, toolCall: false, embed: false }, id: 'c1' }));
    registry.register(makeModel({ modelName: 'embed-model', capabilities: { chat: false, stream: false, toolCall: false, embed: true }, id: 'e1' }));

    const chatModels = registry.listByCapability('chat');
    expect(chatModels.length).toBe(1);
    expect(chatModels[0].modelName).toBe('chat-model');
  });

  it('should listByCapability filter by stream', () => {
    registry.register(makeModel({ modelName: 'stream-model', capabilities: { chat: true, stream: true, toolCall: false, embed: false }, id: 's1' }));
    registry.register(makeModel({ modelName: 'no-stream-model', capabilities: { chat: true, stream: false, toolCall: false, embed: false }, id: 'ns1' }));

    const streamModels = registry.listByCapability('stream');
    expect(streamModels.length).toBe(1);
    expect(streamModels[0].modelName).toBe('stream-model');
  });

  it('should listByCapability filter by toolCall', () => {
    registry.register(makeModel({ modelName: 'tool-model', capabilities: { chat: true, stream: true, toolCall: true, embed: false }, id: 't1' }));
    registry.register(makeModel({ modelName: 'no-tool-model', capabilities: { chat: true, stream: true, toolCall: false, embed: false }, id: 'nt1' }));

    const toolModels = registry.listByCapability('toolCall');
    expect(toolModels.length).toBe(1);
    expect(toolModels[0].modelName).toBe('tool-model');
  });

  it('should select with best_quality prefer toolCall', () => {
    registry.register(makeModel({ modelName: 'basic', id: 'b1', capabilities: { chat: true, stream: false, toolCall: false, embed: false }, status: 'active' }));
    registry.register(makeModel({ modelName: 'advanced', id: 'a1', capabilities: { chat: true, stream: true, toolCall: true, embed: false }, status: 'active' }));

    const selected = registry.select({ strategy: 'best_quality' });
    expect(selected.modelName).toBe('advanced');
  });

  it('should select with fastest strategy', () => {
    registry.register(makeModel({ modelName: 'gpt-4o-mini', id: 'm1', status: 'active' }));
    registry.register(makeModel({ modelName: 'gpt-4o', id: 'm2', status: 'active' }));

    const selected = registry.select({ strategy: 'fastest' });
    expect(selected.modelName).toBe('gpt-4o-mini');
  });

  it('should select with lowest_cost strategy', () => {
    registry.register(makeModel({ modelName: 'gpt-4o', id: 'm1', status: 'active' }));
    registry.register(makeModel({ modelName: 'gpt-4o-mini', id: 'm2', status: 'active' }));

    const selected = registry.select({ strategy: 'lowest_cost' });
    expect(selected.modelName).toBe('gpt-4o-mini');
  });

  it('should select with most_available strategy', () => {
    registry.register(makeModel({ modelName: 'low-rate', id: 'lr', stats: { totalCalls: 100, totalTokens: 1000, avgLatency: 100, successRate: 0.5 }, status: 'active' }));
    registry.register(makeModel({ modelName: 'high-rate', id: 'hr', stats: { totalCalls: 100, totalTokens: 1000, avgLatency: 100, successRate: 0.99 }, status: 'active' }));

    const selected = registry.select({ strategy: 'most_available' });
    expect(selected.modelName).toBe('high-rate');
  });

  it('should select with auto strategy for coding tasks', () => {
    registry.register(makeModel({ modelName: 'gpt-4o', id: 'g1', capabilities: { chat: true, stream: true, toolCall: true, embed: false }, status: 'active' }));
    registry.register(makeModel({ modelName: 'gpt-4o-mini', id: 'g2', capabilities: { chat: true, stream: true, toolCall: false, embed: false }, status: 'active' }));

    const selected = registry.select({ strategy: 'auto', task: 'implement a new feature in React' });
    expect(selected.modelName).toBe('gpt-4o');
  });

  it('should select with auto strategy for simple tasks prefer cheap models', () => {
    registry.register(makeModel({ modelName: 'gpt-4o', id: 'g1', status: 'active' }));
    registry.register(makeModel({ modelName: 'gpt-4o-mini', id: 'g2', status: 'active' }));

    const selected = registry.select({ strategy: 'auto', task: 'summarize this text' });
    expect(selected.modelName).toBe('gpt-4o-mini');
  });

  it('should throw when selecting with no models', () => {
    expect(() => registry.select({ strategy: 'best_quality' })).toThrow('No models registered');
  });

  it('should fall back to any model when no active models', () => {
    registry.register(makeModel({ modelName: 'inactive', id: 'i1', status: 'inactive' }));
    const selected = registry.select({ strategy: 'best_quality' });
    expect(selected).toBeDefined();
    expect(selected.modelName).toBe('inactive');
  });

  it('should getModel return correct model', () => {
    const model = makeModel({ id: 'test-id', modelName: 'test-model' });
    registry.register(model);
    const found = registry.getModel('test-id');
    expect(found).toBeDefined();
    expect(found!.modelName).toBe('test-model');
  });

  it('should getModel return undefined for missing model', () => {
    expect(registry.getModel('nonexistent')).toBeUndefined();
  });

  it('should getQuota return quota info', () => {
    const model = makeModel({ id: 'q1', quota: { daily: 100, weekly: 200, monthly: 300, used: 50 } });
    registry.register(model);
    const quota = registry.getQuota('q1');
    expect(quota).toEqual({ used: 50, total: 600 });
  });

  it('should getQuota return null for missing model', () => {
    expect(registry.getQuota('nonexistent')).toBeNull();
  });

  it('should getStats return usage stats', () => {
    const model = makeModel({
      id: 's1',
      stats: { totalCalls: 10, totalTokens: 5000, avgLatency: 150, successRate: 0.95 },
    });
    registry.register(model);
    const stats = registry.getStats('s1');
    expect(stats.totalCalls).toBe(10);
    expect(stats.totalTokens).toBe(5000);
    expect(stats.avgLatency).toBe(150);
    expect(stats.successRate).toBe(0.95);
  });

  it('should getStats return zeros for missing model', () => {
    const stats = registry.getStats('nonexistent');
    expect(stats).toEqual({ totalCalls: 0, totalTokens: 0, avgLatency: 0, successRate: 0 });
  });

  it('should syncFromConfig register models', () => {
    const configService = new ModelConfigService();
    const config = configService.getConfig();
    config.providers[0].enabled = true;
    config.providers[0].apiKey = 'sk-test-key';
    configService.saveConfig(config);

    registry.syncFromConfig(configService);
    const all = registry.listAll();
    expect(all.length).toBeGreaterThan(0);
    const openaiModels = all.filter(m => m.providerId === 'openai');
    expect(openaiModels.length).toBeGreaterThan(0);
  });

  it('should syncFromConfig preserve existing stats', () => {
    const configService = new ModelConfigService();
    const config = configService.getConfig();
    config.providers[0].enabled = true;
    config.providers[0].apiKey = 'sk-test-key';
    configService.saveConfig(config);

    // First sync
    registry.syncFromConfig(configService);
    const firstModel = registry.listAll()[0];
    const firstStats = registry.getStats(firstModel.id);

    // Second sync should preserve stats
    registry.syncFromConfig(configService);
    const secondStats = registry.getStats(firstModel.id);
    expect(secondStats.totalCalls).toBe(firstStats.totalCalls);
  });
});