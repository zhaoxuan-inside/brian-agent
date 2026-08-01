import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { TaskPlanner } from '../../src/agent/planner';
import { LLMService } from '../../src/core/llm';
import { InformationService } from '../../src/core/information';
import { StorageService } from '../../src/core/storage';
import { ModelConfigService } from '../../src/core/llm/modelConfig';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';

const TEST_DATA_DIR = path.join(os.tmpdir(), `brian-test-planner-${Date.now()}`);

describe('TaskPlanner', () => {
  let planner: TaskPlanner;
  let llm: LLMService;
  let information: InformationService;
  let storage: StorageService;

  beforeEach(() => {
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
    planner = new TaskPlanner(llm, information);
  });

  afterEach(() => {
    closeDatabase();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('analyzeIntent()', () => {
    it('returns intent with confidence', async () => {
      const result = await planner.analyzeIntent('Write a function to sort an array');
      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('extracts entities', async () => {
      const result = await planner.analyzeIntent('Build a React component at https://example.com');
      expect(result.entities).toBeDefined();
      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('detects code generation intent', async () => {
      const result = await planner.analyzeIntent('Write a function that implements quicksort');
      expect(result.intent).toBe('code_generation');
    });

    it('detects debugging intent', async () => {
      const result = await planner.analyzeIntent('Fix the error in the login page');
      expect(result.intent).toBe('debugging');
    });

    it('detects search intent', async () => {
      const result = await planner.analyzeIntent('Find the best practices for React hooks');
      expect(result.intent).toBe('search');
    });
  });

  describe('decompose()', () => {
    it('breaks complex task into sub-tasks', () => {
      const tasks = planner.decompose({ intent: 'code_generation', entities: [] });
      expect(tasks.length).toBeGreaterThan(1);
      expect(tasks[0].id).toBeDefined();
      expect(tasks[0].description).toBeDefined();
      expect(tasks[0].agentType).toBeDefined();
    });

    it('handles debugging task', () => {
      const tasks = planner.decompose({ intent: 'debugging', entities: [] });
      expect(tasks.length).toBeGreaterThan(1);
      const hasVerify = tasks.some(t => t.description.toLowerCase().includes('verify'));
      expect(hasVerify).toBe(true);
    });

    it('handles simple task (single sub-task) - general', () => {
      const tasks = planner.decompose({ intent: 'general', entities: [] });
      expect(tasks.length).toBeGreaterThanOrEqual(1);
    });

    it('handles analysis task', () => {
      const tasks = planner.decompose({ intent: 'analysis', entities: [] });
      expect(tasks.length).toBeGreaterThan(1);
      const hasGather = tasks.some(t => t.description.toLowerCase().includes('gather'));
      expect(hasGather).toBe(true);
    });

    it('handles search task', () => {
      const tasks = planner.decompose({ intent: 'search', entities: [] });
      expect(tasks.length).toBeGreaterThan(1);
    });
  });

  describe('buildTaskGraph()', () => {
    it('creates correct dependency graph', () => {
      const subTasks = [
        { id: 'task_1', description: 'Analyze', agentType: 'custom', dependencies: [] },
        { id: 'task_2', description: 'Search', agentType: 'searcher', dependencies: [] },
        { id: 'task_3', description: 'Generate', agentType: 'generator', dependencies: ['task_1', 'task_2'] },
      ];
      const graph = planner.buildTaskGraph(subTasks);
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges.length).toBe(2);
      const edgeTargets = graph.edges.map(e => e.to);
      expect(edgeTargets).toContain('task_3');
    });

    it('handles independent tasks (no edges)', () => {
      const subTasks = [
        { id: 'task_1', description: 'Task 1', agentType: 'searcher', dependencies: [] },
        { id: 'task_2', description: 'Task 2', agentType: 'searcher', dependencies: [] },
      ];
      const graph = planner.buildTaskGraph(subTasks);
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(0);
    });
  });

  describe('assignAgents()', () => {
    it('matches tasks to agents', () => {
      const subTasks = [
        { id: 'task_1', description: 'Generate code', agentType: 'generator', dependencies: [] },
        { id: 'task_2', description: 'Search', agentType: 'searcher', dependencies: [] },
      ];
      const agents = [
        { id: 'agent_1', agentType: 'generator', role: 'generator' },
        { id: 'agent_2', agentType: 'searcher', role: 'searcher' },
      ];
      const assignments = planner.assignAgents(subTasks, agents);
      expect(assignments).toHaveLength(2);
      const task1Assign = assignments.find(a => a.taskId === 'task_1');
      expect(task1Assign!.agentId).toBe('agent_1');
    });

    it('uses fallback agent when no match', () => {
      const subTasks = [
        { id: 'task_1', description: 'Do something', agentType: 'unknown', dependencies: [] },
      ];
      const agents = [{ id: 'agent_1', role: 'general' }];
      const assignments = planner.assignAgents(subTasks, agents);
      expect(assignments).toHaveLength(1);
      expect(assignments[0].agentId).toBe('agent_1');
    });
  });

  describe('estimateComplexity()', () => {
    it('returns value between 0 and 1', () => {
      const subTasks = [
        { id: 'task_1', description: 'Task', agentType: 'generator', dependencies: [] },
      ];
      const complexity = planner.estimateComplexity(subTasks);
      expect(complexity).toBeGreaterThanOrEqual(0);
      expect(complexity).toBeLessThanOrEqual(1);
    });

    it('returns 0 for empty tasks', () => {
      expect(planner.estimateComplexity([])).toBe(0);
    });

    it('returns higher complexity for more tasks', () => {
      const few = [{ id: 't1', description: 'a', agentType: 'searcher', dependencies: [] }];
      const many = Array.from({ length: 10 }, (_, i) => ({
        id: `t${i}`, description: 'x', agentType: 'generator', dependencies: i > 0 ? [`t${i - 1}`] : [],
      }));
      expect(planner.estimateComplexity(many)).toBeGreaterThanOrEqual(planner.estimateComplexity(few));
    });
  });

  describe('selectStrategy()', () => {
    it('returns react for medium complexity', () => {
      expect(planner.selectStrategy(0.5, 'creation')).toBe('react');
    });

    it('returns plan-execute for high complexity', () => {
      expect(planner.selectStrategy(0.8, 'code_generation')).toBe('plan-execute');
    });

    it('returns cot for low complexity', () => {
      expect(planner.selectStrategy(0.2, 'analysis')).toBe('cot');
    });

    it('returns cot for medium complexity with reasoning intents', () => {
      expect(planner.selectStrategy(0.5, 'analysis')).toBe('cot');
    });
  });

  describe('plan()', () => {
    it('returns complete task graph with nodes and edges', async () => {
      const result = await planner.plan('Write a React component', {});
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(Array.isArray(result.edges)).toBe(true);
    });
  });
});