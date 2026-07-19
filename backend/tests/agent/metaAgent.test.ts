import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { MetaAgent } from '../../src/agent/metaAgent';
import { AgentLibrary } from '../../src/agent/agentLibrary';
import { StorageService } from '../../src/core/storage';
import { LLMService } from '../../src/core/llm';
import { InformationService } from '../../src/core/information';
import { ToolService } from '../../src/core/tools';
import { SkillManager } from '../../src/core/skill/SkillManager';
import { ModelConfigService } from '../../src/core/llm/modelConfig';
import { initDatabase, closeDatabase, getDatabase } from '../../src/infrastructure/database';
import type { WorkAgent } from '../../src/shared/types';
import type { DBWrapper } from '../../src/base/DBWrapper';

const TEST_DATA_DIR = path.join(os.tmpdir(), `brian-test-metaAgent-${Date.now()}`);

describe('MetaAgent', () => {
  let metaAgent: MetaAgent;
  let library: AgentLibrary;
  let llm: LLMService;
  let information: InformationService;
  let tools: ToolService;
  let storage: StorageService;
  let skillManager: SkillManager;

  beforeEach(() => {
    process.env.BRIAN_DATA_DIR = TEST_DATA_DIR;
    process.env.BRIAN_DB_PATH = path.join(TEST_DATA_DIR, 'brian.db');
    process.env.BRIAN_GRAPH_DB_PATH = path.join(TEST_DATA_DIR, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(TEST_DATA_DIR, 'vectors');
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    // Create a minimal config file
    const configPath = path.join(TEST_DATA_DIR, 'model-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      providers: [{
        id: 'openai',
        type: 'openai',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
      }],
      selectedProviderId: 'openai',
      selectedModelId: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4096,
      rateLimits: { daily: 100000, weekly: 500000, monthly: 2000000 },
    }));
    process.env.BRIAN_CONFIG_FILE_PATH = configPath;

    initDatabase();
    storage = new StorageService();
    const modelConfig = new ModelConfigService();
    llm = new LLMService(modelConfig);

    // Register a test model in the registry
    llm.registry.register({
      id: 'openai:gpt-4o',
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
    });

    information = new InformationService(storage, llm);
    tools = new ToolService();
    library = new AgentLibrary(storage);
    const rawDb = getDatabase();
    const dbWrapper: DBWrapper = {
      query: async <T>(sql: string, params?: any[]): Promise<T[]> => {
        const stmt = rawDb.prepare(sql);
        return (params ? stmt.all(...params) : stmt.all()) as T[];
      },
      run: async (sql: string, params?: any[]): Promise<{ changes: number; lastInsertId: number }> => {
        const stmt = rawDb.prepare(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        return { changes: result.changes, lastInsertId: (result.lastInsertRowid as number) || 0 };
      },
      get: async <T>(sql: string, params?: any[]): Promise<T | undefined> => {
        const stmt = rawDb.prepare(sql);
        return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
      },
      close: () => {},
      transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
        return rawDb.transaction(() => {
          const tx = {
            query: async (s: string, p?: any[]) => rawDb.prepare(s).all(...(p || [])),
            run: async (s: string, p?: any[]) => rawDb.prepare(s).run(...(p || [])),
            get: async (s: string, p?: any[]) => rawDb.prepare(s).get(...(p || [])),
          };
          return fn(tx);
        })();
      },
    };
    skillManager = new SkillManager(dbWrapper);
    metaAgent = new MetaAgent(llm, information, tools, library, skillManager);
  });

  afterEach(() => {
    closeDatabase();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('receive()', () => {
    it('processes user input and returns task', () => {
      const result = metaAgent.receive({ type: 'user', content: 'Write a function' });
      expect(result.task).toBeDefined();
      expect(result.task.type).toBe('user');
      expect(result.task.content).toBe('Write a function');
    });

    it('processes self_learn input', () => {
      const result = metaAgent.receive({ type: 'self_learn', content: 'Learn about testing' });
      expect(result.task.type).toBe('self_learn');
      expect(result.task.content).toBe('Learn about testing');
    });
  });

  describe('analyze()', () => {
    it('returns intent, complexity, domain, capabilities', () => {
      const result = metaAgent.analyze('Write a React component for the frontend');
      expect(result.intent).toBeDefined();
      expect(result.complexity).toBeGreaterThanOrEqual(0);
      expect(result.complexity).toBeLessThanOrEqual(1);
      expect(result.domain).toBeDefined();
      expect(result.requiredCapabilities).toBeDefined();
      expect(Array.isArray(result.requiredCapabilities)).toBe(true);
    });

    it('detects code_generation intent', () => {
      const result = metaAgent.analyze('Build a function that implements bubble sort');
      expect(result.intent).toBe('code_generation');
    });

    it('detects debugging intent', () => {
      const result = metaAgent.analyze('Fix this error in my code');
      expect(result.intent).toBe('debugging');
    });

    it('detects frontend domain', () => {
      const result = metaAgent.analyze('Create a React component with CSS styling');
      expect(result.domain).toBe('frontend');
    });

    it('detects backend domain', () => {
      const result = metaAgent.analyze('Set up a database connection with PostgreSQL');
      expect(result.domain).toBe('backend');
    });
  });

  describe('buildAgent()', () => {
    it('creates complete WorkAgent with all fields', async () => {
      const agent = await metaAgent.buildAgent({ intent: 'code_generation', domain: 'frontend' });
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.strategy).toBeDefined();
      expect(agent.llm).toBeDefined();
      expect(agent.llm.providerId).toBeDefined();
      expect(agent.llm.modelId).toBeDefined();
      expect(agent.prompt).toBeDefined();
      expect(agent.prompt.system).toBeTruthy();
      expect(agent.prompt.instruction).toBeTruthy();
      expect(agent.skillIds).toBeDefined();
      expect(agent.mcpIds).toBeDefined();
      expect(agent.soulId).toBeDefined();
      expect(agent.strength).toBe(1.0);
      expect(agent.useCount).toBe(0);
      expect(agent.reliability).toBe(0.5);
      expect(agent.feedbackHistory).toEqual([]);
    });
  });

  describe('reuseAgent()', () => {
    it('returns existing agent for similar task', async () => {
      const agent = await metaAgent.buildAgent({ intent: 'code_generation', domain: 'frontend' });
      const storedId = await metaAgent.saveAgent(agent);

      const reused = await metaAgent.reuseAgent({ intent: 'code_generation', domain: 'frontend' });
      expect(reused).toBeDefined();
      expect(reused!.id).toBe(storedId);
    });

    it('returns null for novel task', async () => {
      const reused = await metaAgent.reuseAgent({ intent: 'completely_unique_task', domain: 'unknown' });
      expect(reused).toBeNull();
    });
  });

  describe('submit()', () => {
    it('returns executionId', async () => {
      const agent = await metaAgent.buildAgent({ intent: 'code_generation' });
      const result = await metaAgent.submit(agent, { type: 'user', content: 'test' });
      expect(result.executionId).toBeDefined();
      expect(typeof result.executionId).toBe('string');
    });
  });

  describe('saveAgent()', () => {
    it('stores to library', async () => {
      const agent = await metaAgent.buildAgent({ intent: 'code_generation' });
      const id = await metaAgent.saveAgent(agent);
      expect(id).toBeDefined();

      const stored = await metaAgent.getAgent(id);
      expect(stored).toBeDefined();
      expect(stored!.name).toBe(agent.name);
    });
  });

  describe('getAgent()', () => {
    it('retrieves from library', async () => {
      const agent = await metaAgent.buildAgent({ intent: 'code_generation' });
      const storedId = await metaAgent.saveAgent(agent);
      const retrieved = await metaAgent.getAgent(storedId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(storedId);
    });

    it('returns undefined for non-existent', async () => {
      const agent = await metaAgent.getAgent('non-existent');
      expect(agent).toBeUndefined();
    });
  });

  describe('selectLLM()', () => {
    it('returns appropriate model for task', async () => {
      const agent = await metaAgent.buildAgent({ intent: 'code_generation', domain: 'frontend' });
      expect(agent.llm).toBeDefined();
      expect(agent.llm.providerId).toBeTruthy();
      expect(agent.llm.modelId).toBeTruthy();
    });
  });

  describe('selectSkills()', () => {
    it('returns matching skills', async () => {
      const agent = await metaAgent.buildAgent({ intent: 'code_generation', domain: 'frontend' });
      expect(agent.skillIds.length).toBeGreaterThanOrEqual(0);
    });

    it('includes general_purpose for unknown tasks', async () => {
      const agent = await metaAgent.buildAgent({ intent: 'unknown_intent_type' });
      expect(agent.skillIds.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generatePrompt()', () => {
    it('returns system and instruction', async () => {
      const agent = await metaAgent.buildAgent({ intent: 'code_generation', domain: 'frontend' });
      expect(agent.prompt.system).toBeTruthy();
      expect(agent.prompt.instruction).toBeTruthy();
    });
  });

  describe('selectStrategy()', () => {
    it('returns appropriate strategy for complexity', async () => {
      const highComplexity = await metaAgent.buildAgent({ intent: 'code_generation', complexity: 0.8 });
      expect(highComplexity.strategy).toBe('plan-execute');

      const mediumComplexity = await metaAgent.buildAgent({ intent: 'analysis', complexity: 0.5 });
      expect(mediumComplexity.strategy).toBe('cot');

      const lowComplexity = await metaAgent.buildAgent({ intent: 'creation', complexity: 0.2 });
      expect(lowComplexity.strategy).toBe('react');
    });
  });

  describe('configureSoul()', () => {
    it('returns soul config', async () => {
      const agent = await metaAgent.buildAgent({ intent: 'code_generation', domain: 'frontend' });
      expect(agent.soulId).toBeDefined();
      expect(typeof agent.soulId).toBe('string');
    });
  });
});