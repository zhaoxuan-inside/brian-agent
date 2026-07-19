import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { AgentBuilder } from '../../src/agent/agentBuilder';
import { LLMService } from '../../src/core/llm';
import { StorageService } from '../../src/core/storage';
import { ModelConfigService } from '../../src/core/llm/modelConfig';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';

const TEST_DATA_DIR = path.join(os.tmpdir(), `brian-test-builder-${Date.now()}`);

describe('AgentBuilder', () => {
  let builder: AgentBuilder;
  let llm: LLMService;
  let storage: StorageService;

  async function createTestAgent(name: string, role: string = 'generator') {
    return await builder.create({
      name,
      role,
      description: `A test agent for ${name}`,
      strategy: { type: 'react', maxIterations: 10, stopConditions: [] },
      llm: { providerId: 'openai', modelId: 'gpt-4', temperature: 0.5, maxTokens: 4096 },
      prompt: { system: 'You are a helpful agent.', instruction: 'Complete the task.', variables: [] },
      skillIds: ['skill-1'],
      mcpIds: ['mcp-filesystem'],
      soulId: 'soul-professional',
      workId: '',
      sources: { knowledgeBase: [], webSearch: false },
    });
  }

  beforeEach(async () => {
    process.env.BRIAN_DATA_DIR = TEST_DATA_DIR;
    process.env.BRIAN_DB_PATH = path.join(TEST_DATA_DIR, 'brian.db');
    process.env.BRIAN_GRAPH_DB_PATH = path.join(TEST_DATA_DIR, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(TEST_DATA_DIR, 'vectors');
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    const configPath = path.join(TEST_DATA_DIR, 'model-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      providers: [{ id: 'openai', type: 'openai', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }],
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
    builder = new AgentBuilder(storage, llm);
  });

  afterEach(async () => {
    closeDatabase();
    if (storage) {
      await storage.close();
    }
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('list()', () => {
    it('returns all agents', async () => {
      await createTestAgent('agent-a');
      await createTestAgent('agent-b');
      const agents = await builder.list();
      expect(agents.length).toBe(2);
    });

    it('with search filter', async () => {
      await createTestAgent('code-generator', 'generator');
      await createTestAgent('data-analyzer', 'analyst');
      const agents = await builder.list('code');
      expect(agents.length).toBe(1);
      expect(agents[0].name).toBe('code-generator');
    });
  });

  describe('get()', () => {
    it('returns agent by id', async () => {
      const created = await createTestAgent('test-agent');
      const agent = await builder.get(created.id);
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('test-agent');
    });

    it('returns undefined for non-existent', async () => {
      expect(await builder.get('non-existent')).toBeUndefined();
    });
  });

  describe('create()', () => {
    it('creates agent with all fields', async () => {
      const agent = await createTestAgent('full-agent');
      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('full-agent');
      expect(agent.role).toBe('generator');
      expect(agent.description).toBeDefined();
      expect(agent.strategy.type).toBe('react');
      expect(agent.strategy.maxIterations).toBe(10);
      expect(agent.llm.providerId).toBe('openai');
      expect(agent.llm.modelId).toBe('gpt-4');
      expect(agent.llm.temperature).toBe(0.5);
      expect(agent.prompt.system).toBeTruthy();
      expect(agent.prompt.instruction).toBeTruthy();
      expect(agent.skillIds.length).toBe(1);
      expect(agent.mcpIds.length).toBe(1);
      expect(agent.soulId).toBeDefined();
      expect(agent.active).toBe(true);
      expect(agent.createdAt).toBeDefined();
      expect(agent.updatedAt).toBeDefined();
    });
  });

  describe('update()', () => {
    it('modifies agent', async () => {
      const created = await createTestAgent('update-test');
      const updated = await builder.update(created.id, { name: 'updated-name' });
      expect(updated.name).toBe('updated-name');
    });

    it('throws for non-existent', async () => {
      await expect(builder.update('non-existent', { name: 'x' })).rejects.toThrow('not found');
    });
  });

  describe('delete()', () => {
    it('removes agent', async () => {
      const created = await createTestAgent('to-delete');
      expect(await builder.get(created.id)).toBeDefined();
      await builder.delete(created.id);
      expect(await builder.get(created.id)).toBeUndefined();
    });
  });

  describe('toggle()', () => {
    it('toggles active status', async () => {
      const created = await createTestAgent('toggle-test');
      expect(created.active).toBe(true);

      const toggled = await builder.toggle(created.id);
      expect(toggled.active).toBe(false);

      const toggledAgain = await builder.toggle(created.id);
      expect(toggledAgain.active).toBe(true);
    });

    it('throws for non-existent', async () => {
      await expect(builder.toggle('non-existent')).rejects.toThrow('not found');
    });
  });

  describe('getAvailableModels()', () => {
    it('returns providers with models', () => {
      const result = builder.getAvailableModels();
      expect(result.providers).toBeDefined();
      expect(Array.isArray(result.providers)).toBe(true);
    });
  });

  describe('generatePrompt()', () => {
    it('returns system prompt and instruction', async () => {
      const result = await builder.generatePrompt('Generate code for a React component', 'Must be TypeScript');
      expect(result.system).toBeDefined();
      expect(result.instruction).toBeDefined();
      expect(result.variables).toBeDefined();
      expect(Array.isArray(result.variables)).toBe(true);
    });
  });

  describe('generateSoul()', () => {
    it('returns soul config', async () => {
      const result = await builder.generateSoul('Creative writing assistant', 'friendly');
      expect(result.style).toBeDefined();
      expect(result.personality).toBeDefined();
      expect(result.contentRules).toBeDefined();
      expect(result.constraints).toBeDefined();
      expect(result.temperatureProfile).toBeDefined();
      expect(result.temperatureProfile.creative).toBeDefined();
      expect(result.temperatureProfile.analytical).toBeDefined();
      expect(result.temperatureProfile.factual).toBeDefined();
    });
  });

  describe('suggestSkills()', () => {
    it('returns skill suggestions', async () => {
      const result = await builder.suggestSkills('code generation', 'Generate React components');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('suggestMcps()', () => {
    it('returns MCP suggestions', async () => {
      const result = await builder.suggestMcps('search the web for information', 'web search agent');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('validateAgent()', () => {
    it('returns valid for correct config', () => {
      const result = builder.validateAgent({
        name: 'valid-agent',
        role: 'generator',
        description: 'A valid agent',
        strategy: { type: 'react' },
        llm: { temperature: 0.5, maxTokens: 4096 },
        prompt: { system: 'You are a helpful agent.' },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns errors for invalid config', () => {
      const result = builder.validateAgent({
        name: '',
        role: '',
        description: '',
        strategy: { type: 'invalid-strategy' },
        llm: { temperature: 3, maxTokens: 0 },
        prompt: { system: '' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('clone()', () => {
    it('creates copy of agent', async () => {
      const original = await createTestAgent('original-agent');
      const cloned = await builder.clone(original.id);
      expect(cloned.id).not.toBe(original.id);
      expect(cloned.name).toBe('original-agent (Copy)');
      expect(cloned.role).toBe(original.role);
      expect(cloned.active).toBe(false);
    });

    it('throws for non-existent', async () => {
      await expect(builder.clone('non-existent')).rejects.toThrow('not found');
    });
  });
});