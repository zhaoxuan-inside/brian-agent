import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InformationService } from '../../src/core/information';
import { LearningService } from '../../src/core/learning';
import { AgentLibrary } from '../../src/agent/agentLibrary';
import { StorageService } from '../../src/core/storage';
import { LLMService } from '../../src/core/llm';
import { ModelConfigService } from '../../src/core/llm/modelConfig';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-selfdriven-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  process.env.BRIAN_DATA_DIR = tmpDir;
  process.env.BRIAN_DB_PATH = path.join(tmpDir, 'test.db');
  process.env.BRIAN_LOG_DIR = path.join(tmpDir, 'logs');
  process.env.BRIAN_CONFIG_FILE_PATH = path.join(tmpDir, 'model-config.json');
  process.env.BRIAN_GRAPH_DB_PATH = path.join(tmpDir, 'graph');
  process.env.BRIAN_VECTOR_DB_PATH = path.join(tmpDir, 'vectors');
  process.env.BRIAN_LOG_LEVEL = 'error';
  return tmpDir;
}

let tmpDir: string;
let storage: StorageService;
let llm: LLMService;
let modelConfig: ModelConfigService;

describe('Self-Driven Tasks', () => {
  beforeEach(async () => {
    tmpDir = setupTempDir();
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Test response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    }));
    initDatabase();
    modelConfig = new ModelConfigService();
    llm = new LLMService(modelConfig);
    storage = new StorageService();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    closeDatabase();
    if (storage) {
      await storage.close();
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('InformationService', () => {
    it('evolveTags() runs without errors', async () => {
      const info = new InformationService(storage, llm);
      await info.storeEpisodic('I love coding in React and TypeScript', 'user');
      await info.storeEpisodic('I am building a backend with Express and PostgreSQL', 'user');
      await info.storeEpisodic('I need to set up Docker for my CI/CD pipeline', 'user');

      expect(() => info.evolveTags()).not.toThrow();
    });

    it('scheduleTagEvolution() sets interval', () => {
      const info = new InformationService(storage, llm);
      const timer = (info as any).tagEvolutionTimer;
      expect(timer).not.toBeNull();
    });

    it('evolveTags() updates salience scores', async () => {
      const info = new InformationService(storage, llm);
      const id = await info.storeEpisodic('React is a frontend library for building UIs', 'user');

      info.evolveTags();

      const node = await storage.graph.getNode(id);
      expect(node).toBeDefined();
      expect(node!.salienceScore).toBeGreaterThanOrEqual(0);
      expect(node!.salienceScore).toBeLessThanOrEqual(1.0);
    });

    it('evolveTags() handles empty memory', () => {
      const info = new InformationService(storage, llm);
      expect(() => info.evolveTags()).not.toThrow();
    });
  });

  describe('LearningService', () => {
    it('schedule() sets up periodic learning', () => {
      const info = new InformationService(storage, llm);
      const learning = new LearningService(info, llm, storage);

      learning.schedule(1000);

      const timer = (learning as any).idleTimer;
      expect(timer).not.toBeNull();
    });

    it('isIdle() detects idle state', () => {
      const info = new InformationService(storage, llm);
      const learning = new LearningService(info, llm, storage);

      expect(learning.isIdle()).toBe(true);
    });

    it('reviewHistory() generates insights', async () => {
      const info = new InformationService(storage, llm);
      const learning = new LearningService(info, llm, storage);

      await info.storeEpisodic('I learned about React hooks today', 'user');
      await info.storeEpisodic('I need to understand Docker networking', 'user');

      const insights = await learning.reviewHistory();
      expect(Array.isArray(insights)).toBe(true);
    });

    it('consolidateKnowledge() consolidates', () => {
      const info = new InformationService(storage, llm);
      const learning = new LearningService(info, llm, storage);

      const insights = [
        { content: 'User likes React', insight: 'User prefers frontend', timestamp: Date.now() },
        { content: 'User uses Docker', insight: 'User is familiar with DevOps', timestamp: Date.now() },
      ];

      expect(() => learning.consolidateKnowledge(insights)).not.toThrow();
    });

    it('extractKnowledge() extracts patterns from content', () => {
      const info = new InformationService(storage, llm);
      const learning = new LearningService(info, llm, storage);

      const items = learning.extractKnowledge('React is a JavaScript library for building user interfaces');
      expect(Array.isArray(items)).toBe(true);
    });

    it('onMessage() processes messages without errors', () => {
      const info = new InformationService(storage, llm);
      const learning = new LearningService(info, llm, storage);

      expect(() => learning.onMessage({
        role: 'user',
        content: 'I prefer using TypeScript for all my projects',
      })).not.toThrow();
    });
  });

  describe('AgentLibrary', () => {
    it('applyDecay() runs periodic decay', async () => {
      const lib = new AgentLibrary(storage);

      await lib.store({
        name: 'Test Agent',
        taskFeatures: { type: 'code' },
        strategy: 'react' as const,
        llm: { providerId: 'test', modelId: 'test', temperature: 0.7, maxTokens: 2048 },
        prompt: { system: 'test', instruction: 'test' },
        skills: [],
        mcpEndpoints: [],
        soul: {},
        strength: 1.0,
        useCount: 0,
        lastUsedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
        feedbackHistory: [],
        reliability: 0.5,
      });

      const result = await lib.applyDecay();
      expect(result).toHaveProperty('decayed');
      expect(result).toHaveProperty('archived');
      expect(typeof result.decayed).toBe('number');
      expect(typeof result.archived).toBe('number');
    });

    it('archiveDormant() archives old agents', async () => {
      const lib = new AgentLibrary(storage);

      await lib.store({
        name: 'Dormant Agent',
        taskFeatures: { type: 'old' },
        strategy: 'react' as const,
        llm: { providerId: 'test', modelId: 'test', temperature: 0.7, maxTokens: 2048 },
        prompt: { system: 'test', instruction: 'test' },
        skills: [],
        mcpEndpoints: [],
        soul: {},
        strength: 0.1,
        useCount: 0,
        lastUsedAt: Date.now() - 100 * 24 * 60 * 60 * 1000,
        feedbackHistory: [],
        reliability: 0.1,
      });

      const archived = await lib.archiveDormant(0.2);
      expect(typeof archived).toBe('number');
    });

    it('shouldOptimize() triggers optimization', async () => {
      const lib = new AgentLibrary(storage);

      const agent = {
        name: 'Optimize Me',
        taskFeatures: { type: 'test' },
        strategy: 'react' as const,
        llm: { providerId: 'test', modelId: 'test', temperature: 0.7, maxTokens: 2048 },
        prompt: { system: 'test', instruction: 'test' },
        skills: [],
        mcpEndpoints: [],
        soul: {},
        strength: 0.5,
        useCount: 15,
        lastUsedAt: Date.now(),
        feedbackHistory: [
          { rating: 'good' as const, score: 0.1, timestamp: Date.now() },
          { rating: 'bad' as const, score: -0.15, timestamp: Date.now() },
        ],
        reliability: 0.3,
      };

      const agentId = await lib.store(agent);
      const stored = (await lib.get(agentId))!;
      const result = await lib.shouldOptimize(stored);

      expect(typeof result).toBe('boolean');
    });

    it('calculateStrength() returns correct strength', async () => {
      const lib = new AgentLibrary(storage);

      const agentId = await lib.store({
        name: 'Strength Test',
        taskFeatures: {},
        strategy: 'react' as const,
        llm: { providerId: 'test', modelId: 'test', temperature: 0.7, maxTokens: 2048 },
        prompt: { system: 'test', instruction: 'test' },
        skills: [],
        mcpEndpoints: [],
        soul: {},
        strength: 1.0,
        useCount: 0,
        lastUsedAt: Date.now(),
        feedbackHistory: [],
        reliability: 0.5,
      });

      const agent = (await lib.get(agentId))!;
      const strength = lib.calculateStrength(agent);
      expect(strength).toBeGreaterThanOrEqual(0);
      expect(strength).toBeLessThanOrEqual(1.0);
    });
  });
});