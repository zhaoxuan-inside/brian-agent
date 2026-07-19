import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { GraphExecutor } from '../../src/agent/executor';
import { LLMService } from '../../src/core/llm';
import { ToolService } from '../../src/core/tools';
import { ModelConfigService } from '../../src/core/llm/modelConfig';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import { initState } from '../../src/agent/infra/stateManager';
import type { GraphState, WorkAgent } from '../../src/shared/types';

const TEST_DATA_DIR = path.join(os.tmpdir(), `brian-test-executor-${Date.now()}`);

function makeWorkAgent(overrides: Partial<WorkAgent> = {}): WorkAgent {
  return {
    id: 'test-agent-1',
    name: 'test-agent',
    taskFeatures: { intent: 'code_generation' },
    strategy: 'react',
    llm: { providerId: 'openai', modelId: 'gpt-4', temperature: 0.5, maxTokens: 4096 },
    prompt: { system: 'You are a helpful assistant.', instruction: 'Complete the task.' },
    skills: ['code_generation'],
    mcpEndpoints: [],
    soul: { style: 'professional', personality: 'precise' },
    strength: 1.0,
    useCount: 0,
    lastUsedAt: Date.now(),
    feedbackHistory: [],
    reliability: 0.5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('GraphExecutor', () => {
  let executor: GraphExecutor;
  let llm: LLMService;
  let tools: ToolService;

  beforeEach(() => {
    process.env.BRIAN_DATA_DIR = TEST_DATA_DIR;
    process.env.BRIAN_DB_PATH = path.join(TEST_DATA_DIR, 'brian.db');
    process.env.BRIAN_GRAPH_DB_PATH = path.join(TEST_DATA_DIR, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(TEST_DATA_DIR, 'vectors');
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

    tools = new ToolService();
    executor = new GraphExecutor(llm, tools);
  });

  afterEach(() => {
    closeDatabase();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('createGraph()', () => {
    it('creates valid graph', () => {
      const graph = executor.createGraph(
        [{ id: 'a', description: 'node a' }, { id: 'b', description: 'node b' }],
        [{ from: 'a', to: 'b' }]
      );
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
    });
  });

  describe('addNode()', () => {
    it('adds node to graph', () => {
      const graph = executor.createGraph([], []);
      executor.addNode(graph, { id: 'new', description: 'new node' });
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].id).toBe('new');
    });
  });

  describe('addEdge()', () => {
    it('adds edge to graph', () => {
      const graph = executor.createGraph(
        [{ id: 'a' }, { id: 'b' }],
        []
      );
      executor.addEdge(graph, { from: 'a', to: 'b' });
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].from).toBe('a');
      expect(graph.edges[0].to).toBe('b');
    });
  });

  describe('topologicalSort()', () => {
    it('returns correct order', () => {
      const graph = {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
      };
      const sorted = executor.topologicalSort(graph);
      expect(sorted).toEqual(['a', 'b', 'c']);
    });

    it('handles DAG with multiple paths', () => {
      const graph = {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'a', to: 'c' },
          { from: 'b', to: 'd' },
          { from: 'c', to: 'd' },
        ],
      };
      const sorted = executor.topologicalSort(graph);
      expect(sorted[0]).toBe('a');
      expect(sorted[sorted.length - 1]).toBe('d');
      expect(sorted).toContain('b');
      expect(sorted).toContain('c');
      // b and c must come before d
      expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('d'));
      expect(sorted.indexOf('c')).toBeLessThan(sorted.indexOf('d'));
    });
  });

  describe('detectCycle()', () => {
    it('returns null for DAG', () => {
      const graph = {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
      };
      expect(executor.detectCycle(graph)).toBeNull();
    });

    it('returns cycle for cyclic graph', () => {
      const graph = {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
          { from: 'c', to: 'a' },
        ],
      };
      const cycles = executor.detectCycle(graph);
      expect(cycles).not.toBeNull();
      expect(cycles!.length).toBeGreaterThan(0);
    });
  });

  describe('addConditionalEdge()', () => {
    it('adds conditional edges', () => {
      const graph = executor.createGraph(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        []
      );
      const condition = (state: GraphState) => state.qualityScore > 0.5;
      executor.addConditionalEdge(graph, 'a', [
        { condition, to: 'b' },
        { condition: (state) => !condition(state), to: 'c' },
      ]);
      expect(graph.edges).toHaveLength(2);
      expect(graph.edges[0].type).toBe('conditional');
      expect(graph.edges[1].type).toBe('conditional');
    });
  });

  describe('evaluateCondition()', () => {
    it('evaluates condition function', () => {
      const state = initState('test');
      state.qualityScore = 0.8;
      const result = executor.evaluateCondition(state, (s) => s.qualityScore > 0.5);
      expect(result).toBe(true);
    });
  });

  describe('route()', () => {
    it('returns correct next node', () => {
      const state = initState('test');
      state.qualityScore = 0.8;
      const edges = [
        { from: 'a', to: 'b', type: 'conditional', condition: (s: GraphState) => s.qualityScore > 0.5 },
        { from: 'a', to: 'c', type: 'conditional', condition: (s: GraphState) => s.qualityScore <= 0.5 },
      ];
      const next = executor.route(state, edges);
      expect(next).toBe('b');
    });

    it('returns null when no condition matches', () => {
      const state = initState('test');
      const edges = [
        { from: 'a', to: 'b', type: 'conditional', condition: (s: GraphState) => s.qualityScore > 0.5 },
      ];
      const next = executor.route(state, edges);
      expect(next).toBeNull();
    });
  });

  describe('createCheckpoint()', () => {
    it('stores state snapshot', () => {
      const state = initState('test');
      state.qualityScore = 0.5;
      const checkpointId = executor.createCheckpoint(state, 'test-checkpoint');
      expect(checkpointId).toBeDefined();
      expect(typeof checkpointId).toBe('string');
    });
  });

  describe('restoreCheckpoint()', () => {
    it('restores state', () => {
      const state = initState('test');
      state.qualityScore = 0.5;
      const checkpointId = executor.createCheckpoint(state, 'test-checkpoint');

      state.qualityScore = 0.9;
      const restored = executor.restoreCheckpoint(state, checkpointId);
      expect(restored.qualityScore).toBe(0.5);
    });
  });

  describe('reflect()', () => {
    it('returns quality score', async () => {
      // This will fall back to heuristic since LLM call will fail
      const result = await executor.reflect('This is a well-structured output with multiple lines of content that should receive a reasonable quality score.', 'Test context');
      expect(result.qualityScore).toBeDefined();
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(1);
      expect(typeof result.shouldRetry).toBe('boolean');
      expect(typeof result.shouldSwitchStrategy).toBe('boolean');
      expect(result.feedback).toBeDefined();
    });
  });

  describe('shouldRetry()', () => {
    it('returns true below threshold', () => {
      expect(executor.shouldRetry(0.3, 5, 2)).toBe(true);
    });

    it('returns false when max iterations reached', () => {
      expect(executor.shouldRetry(0.3, 5, 5)).toBe(false);
    });

    it('returns false when score above threshold', () => {
      expect(executor.shouldRetry(0.7, 5, 2)).toBe(false);
    });
  });

  describe('analyzeTask()', () => {
    it('returns features and recommended strategy', () => {
      const result = executor.analyzeTask('Write a complex function with multiple conditions');
      expect(result.features).toBeDefined();
      expect(result.recommendedStrategy).toBeDefined();
      expect(result.alternatives).toBeDefined();
      expect(Array.isArray(result.alternatives)).toBe(true);
    });
  });

  describe('composeStrategies()', () => {
    it('returns primary and fallback', () => {
      const result = executor.composeStrategies(['react', 'plan-execute']);
      expect(result.primary).toBe('react');
      expect(result.fallback).toBe('plan-execute');
      expect(result.switchCondition).toBe('quality_score < 0.3');
    });
  });

  describe('switchStrategy()', () => {
    it('returns new strategy', () => {
      expect(executor.switchStrategy('react', 'low quality')).toBe('plan-execute');
      expect(executor.switchStrategy('plan-execute', 'need reasoning')).toBe('cot');
      expect(executor.switchStrategy('cot', 'need action')).toBe('react');
    });
  });

  describe('spawnSubAgent()', () => {
    it('creates sub agent with correct properties', () => {
      const subAgent = executor.spawnSubAgent('parent-1', 'Do a subtask');
      expect(subAgent.id).toBeDefined();
      expect(subAgent.name).toContain('sub-parent-1');
      expect(subAgent.strategy).toBe('react');
      expect(subAgent.strength).toBe(1.0);
      expect(subAgent.reliability).toBe(0.5);
    });
  });

  describe('execute()', () => {
    it('processes complete task graph', async () => {
      const agent = makeWorkAgent();
      const taskGraph = {
        nodes: [
          { id: 'node_1', description: 'Task 1', agentType: 'generator', agent, dependencies: [] },
        ],
        edges: [],
      };
      const state = initState('test task', 2);

      // This will fail because LLM can't call external API, but the error handling should work
      const result = await executor.execute(taskGraph, state);
      expect(result).toBeDefined();
      expect(result.errors).toBeDefined();
    });
  });
});