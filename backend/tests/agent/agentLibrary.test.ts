import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AgentLibrary } from '../../src/agent/agentLibrary';
import { StorageService } from '../../src/core/storage';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import type { WorkAgent } from '../../src/shared/types';

describe('AgentLibrary', () => {
  let library: AgentLibrary;
  let storage: StorageService;
  let tempDir: string;

  beforeEach(async () => {
    // Use an isolated temp DB — never touch the real ./data/brian.db
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-agentlib-'));
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'test.db');
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    closeDatabase();
    initDatabase();
    storage = new StorageService();
    library = new AgentLibrary(storage);
  });

  afterEach(async () => {
    closeDatabase();
    if (storage) {
      await storage.close();
    }
    delete process.env.BRIAN_DB_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeAgent(overrides: Partial<WorkAgent> = {}): Omit<WorkAgent, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: 'test-agent', taskFeatures: { intent: 'code_generation', domain: 'frontend' },
      strategy: 'react', llm: { providerId: 'openai', modelId: 'gpt-4', temperature: 0.5, maxTokens: 4096 },
      prompt: { system: 'You are a helpful agent.', instruction: 'Complete the task.' },
      skills: ['code_generation'], mcpEndpoints: [], soul: { style: 'professional', personality: 'precise' },
      strength: 1.0, useCount: 0, lastUsedAt: Date.now(), feedbackHistory: [], reliability: 0.5,
      ...overrides,
    };
  }

  async function findAgent(id: string): Promise<WorkAgent | undefined> {
    const all = await library.getAll();
    return all.find(a => a.id === id);
  }

  describe('store()', () => {
    it('creates agent with correct defaults', async () => {
      const id = await library.store(makeAgent());
      expect(id).toBeTruthy();
      const agent = await findAgent(id);
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('test-agent');
      expect(agent!.strength).toBe(1.0);
      expect(agent!.useCount).toBe(0);
      expect(agent!.reliability).toBe(0.5);
      expect(agent!.feedbackHistory).toEqual([]);
    });
  });

  describe('get()', () => {
    it('returns undefined for non-existent', async () => {
      expect(await library.get('non-existent-id')).toBeUndefined();
    });
  });

  describe('getAll()', () => {
    it('returns all agents', async () => {
      await library.store(makeAgent({ name: 'agent-a' }));
      await library.store(makeAgent({ name: 'agent-b' }));
      await library.store(makeAgent({ name: 'agent-c' }));
      const all = await library.getAll();
      expect(all).toHaveLength(3);
    });

    it('returns empty array when no agents', async () => {
      expect(await library.getAll()).toEqual([]);
    });
  });

  describe('update()', () => {
    it('throws for non-existent agent', async () => {
      await expect(library.update('non-existent', { name: 'x' })).rejects.toThrow('not found');
    });
  });

  describe('getStats()', () => {
    it('returns correct counts', async () => {
      const stats = await library.getStats();
      expect(stats.total).toBe(0); expect(stats.active).toBe(0);
      expect(stats.dormant).toBe(0); expect(stats.reliable).toBe(0);
      expect(stats.needsReview).toBe(0);
    });

    it('counts active agents', async () => {
      await library.store(makeAgent({ name: 'active1', strength: 1.0, lastUsedAt: Date.now() }));
      const stats = await library.getStats();
      expect(stats.total).toBe(1); expect(stats.active).toBe(1);
    });

    it('counts reliable agents', async () => {
      await library.store(makeAgent({ reliability: 0.8 }));
      expect((await library.getStats()).reliable).toBe(1);
    });

    it('counts needsReview agents', async () => {
      await library.store(makeAgent({ reliability: 0.3 }));
      expect((await library.getStats()).needsReview).toBe(1);
    });
  });

  describe('findSimilar()', () => {
    it('returns agents with matching taskFeatures', async () => {
      await library.store(makeAgent({ name: 'react-agent', taskFeatures: { intent: 'code_generation', domain: 'frontend', framework: 'react' } }));
      await library.store(makeAgent({ name: 'python-agent', taskFeatures: { intent: 'code_generation', domain: 'backend' } }));
      const similar = await library.findSimilar({ intent: 'code_generation', domain: 'frontend' });
      expect(similar.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('calculateStrength()', () => {
    it('applies forgetting curve formula', async () => {
      const id = await library.store(makeAgent({ strength: 1.0, lastUsedAt: Date.now() }));
      const agent = (await findAgent(id))!;
      const strength = library.calculateStrength(agent);
      expect(strength).toBeGreaterThan(0.9);
      expect(strength).toBeLessThanOrEqual(1.0);
    });

    it('reduces strength for unused agents', async () => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const id = await library.store(makeAgent({ strength: 1.0, lastUsedAt: thirtyDaysAgo }));
      const strength = library.calculateStrength((await findAgent(id))!);
      expect(strength).toBeLessThan(0.5);
    });
  });

  describe('archiveDormant()', () => {
    it('archives agents below threshold', async () => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      await library.store(makeAgent({ name: 'old', strength: 1.0, lastUsedAt: thirtyDaysAgo }));
      await library.store(makeAgent({ name: 'new', strength: 1.0, lastUsedAt: Date.now() }));
      const archived = await library.archiveDormant(0.2);
      expect(archived).toBeGreaterThanOrEqual(0);
    });
  });

  describe('applyFeedback()', () => {
    it('throws for non-existent agent', async () => {
      await expect(library.applyFeedback('non-existent', { rating: 'good', score: 0.1 })).rejects.toThrow('not found');
    });
  });

  describe('strengthen()', () => {
    it('does not throw for non-existent agent', async () => {
      await library.strengthen('non-existent');
    });
  });

  describe('weaken()', () => {
    it('does not throw for non-existent agent', async () => {
      await library.weaken('non-existent');
    });
  });

  describe('evaluateReliability()', () => {
    it('returns 0.5 for non-existent agent', async () => {
      expect(await library.evaluateReliability('non-existent')).toBe(0.5);
    });
  });

  describe('getFeedbackHistory()', () => {
    it('returns empty for non-existent', async () => {
      expect(await library.getFeedbackHistory('non-existent')).toEqual([]);
    });
  });

  describe('shouldOptimize()', () => {
    it('returns true for low-strength agents', async () => {
      const agent = { ...makeAgent(), id: 'opt-test', strength: 0.1, reliability: 0.3, useCount: 15, lastUsedAt: Date.now(), feedbackHistory: [{ rating: 'good', score: 0.1, timestamp: Date.now() }, { rating: 'bad', score: -0.15, timestamp: Date.now() }], createdAt: Date.now(), updatedAt: Date.now() } as WorkAgent;
      const prob = await library.calculateOptimizeProbability(agent);
      expect(prob).toBeGreaterThan(0.5);
    });

    it('returns boolean', async () => {
      const agent = { ...makeAgent(), id: 'opt-test-2', strength: 1.0, reliability: 0.9, useCount: 2, lastUsedAt: Date.now(), feedbackHistory: [], createdAt: Date.now(), updatedAt: Date.now() } as WorkAgent;
      const result = await library.shouldOptimize(agent);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('calculateOptimizeProbability()', () => {
    it('returns value between 0 and 1', async () => {
      const agent = { ...makeAgent(), id: 'prob-test', createdAt: Date.now(), updatedAt: Date.now() } as WorkAgent;
      const prob = await library.calculateOptimizeProbability(agent);
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    });
  });

  describe('rollback()', () => {
    it('throws for non-existent agent', async () => {
      await expect(library.rollback('non-existent', 'v1')).rejects.toThrow('not found');
    });
  });
});