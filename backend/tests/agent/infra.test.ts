import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import {
  parseInput,
  validateInput,
  preprocess,
  extractContext,
} from '../../src/agent/infra/inputAdapter';
import {
  initState,
  updateState,
  createCheckpoint,
  restoreCheckpoint,
  listCheckpoints,
} from '../../src/agent/infra/stateManager';
import {
  formatOutput,
  formatAsText,
  formatAsJSON,
  formatAsMarkdown,
  applyTemplate,
} from '../../src/agent/infra/outputFormatter';
import { AgentLifecycle } from '../../src/agent/lifecycle';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';

const TEST_DATA_DIR = path.join(os.tmpdir(), `brian-test-infra-${Date.now()}`);

describe('InputAdapter', () => {
  describe('parseInput()', () => {
    it('detects text type', () => {
      const result = parseInput('Hello world');
      expect(result.type).toBe('text');
      expect(result.content).toBe('Hello world');
    });

    it('detects json type', () => {
      const result = parseInput('{"key": "value"}');
      expect(result.type).toBe('json');
    });

    it('detects code type', () => {
      const result = parseInput('```\nconst x = 1;\n```');
      expect(result.type).toBe('code');
    });

    it('handles empty input', () => {
      const result = parseInput('');
      expect(result.type).toBe('empty');
      expect(result.content).toBe('');
    });
  });

  describe('validateInput()', () => {
    it('validates correctly', () => {
      const result = validateInput({ type: 'text', content: 'Hello' });
      expect(result.valid).toBe(true);
    });

    it('rejects empty input', () => {
      const result = validateInput({ type: 'text', content: '' });
      expect(result.valid).toBe(false);
    });

    it('rejects too long input', () => {
      const result = validateInput({ type: 'text', content: 'x'.repeat(100001) });
      expect(result.valid).toBe(false);
    });

    it('rejects injection patterns', () => {
      const result = validateInput({ type: 'text', content: '<script>alert("xss")</script>' });
      expect(result.valid).toBe(false);
    });
  });

  describe('preprocess()', () => {
    it('tokenizes text', () => {
      const result = preprocess({ type: 'text', content: 'Hello world!' });
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.tokens).toContain('hello');
      expect(result.tokens).toContain('world');
    });
  });

  describe('extractContext()', () => {
    it('returns intent and entities', () => {
      const result = extractContext('How do I build a React component?');
      expect(result.intent).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.sentiment).toBeDefined();
    });

    it('detects creation intent', () => {
      const result = extractContext('Create a new function');
      expect(result.intent).toBe('creation');
    });

    it('detects explanation intent', () => {
      const result = extractContext('Explain how promises work');
      expect(result.intent).toBe('explanation');
    });

    it('extracts URLs', () => {
      const result = extractContext('Visit https://example.com for more info');
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities.some(e => e.includes('example.com'))).toBe(true);
    });

    it('detects positive sentiment', () => {
      const result = extractContext('This is great and helpful');
      expect(result.sentiment).toBe('positive');
    });

    it('detects negative sentiment', () => {
      const result = extractContext('This is terrible and broken');
      expect(result.sentiment).toBe('negative');
    });
  });
});

describe('StateManager', () => {
  describe('initState()', () => {
    it('creates initial state', () => {
      const state = initState('test message');
      expect(state.userMessage).toBe('test message');
      expect(state.taskPlan).toEqual([]);
      expect(state.iterationCount).toBe(0);
      expect(state.maxIterations).toBe(10);
      expect(state.currentStrategy).toBe('react');
      expect(state.qualityScore).toBe(0);
      expect(state.errors).toEqual([]);
      expect(state.trace).toEqual([]);
    });

    it('accepts custom maxIterations', () => {
      const state = initState('test', 5);
      expect(state.maxIterations).toBe(5);
    });
  });

  describe('updateState()', () => {
    it('merges partial updates', () => {
      const state = initState('original');
      const updated = updateState(state, { userMessage: 'updated' });
      expect(updated.userMessage).toBe('updated');
      expect(updated.iterationCount).toBe(0);
    });
  });

  describe('createCheckpoint()', () => {
    it('stores state snapshot', () => {
      const state = initState('test');
      state.qualityScore = 0.5;
      const id = createCheckpoint(state, 'test-label');
      expect(id).toBeDefined();
      expect(state.checkpoints.has(id)).toBe(true);
    });
  });

  describe('restoreCheckpoint()', () => {
    it('restores state', () => {
      const state = initState('test');
      state.qualityScore = 0.5;
      const id = createCheckpoint(state, 'test-label');

      state.qualityScore = 0.9;
      state.userMessage = 'changed';
      restoreCheckpoint(state, id);

      expect(state.qualityScore).toBe(0.5);
      expect(state.userMessage).toBe('test');
    });

    it('throws for non-existent checkpoint', () => {
      const state = initState('test');
      expect(() => restoreCheckpoint(state, 'non-existent')).toThrow('not found');
    });
  });

  describe('listCheckpoints()', () => {
    it('returns all checkpoints', () => {
      const state = initState('test');
      createCheckpoint(state, 'first');
      createCheckpoint(state, 'second');
      const list = listCheckpoints(state);
      expect(list).toHaveLength(2);
    });
  });
});

describe('OutputFormatter', () => {
  describe('formatOutput()', () => {
    it('formats as text', () => {
      const result = formatOutput('Hello **world**', 'text');
      expect(result).toBe('Hello world');
    });

    it('formats as json', () => {
      const result = formatOutput('{"key":"value"}', 'json');
      const parsed = JSON.parse(result);
      expect(parsed.key).toBe('value');
    });

    it('formats as markdown', () => {
      const result = formatOutput('Hello world', 'markdown');
      expect(result).toBeTruthy();
    });
  });

  describe('formatAsJSON()', () => {
    it('handles invalid JSON gracefully', () => {
      const result = formatAsJSON('not json at all');
      expect(result).toBeDefined();
      expect(result.content).toBe('not json at all');
    });

    it('parses valid JSON', () => {
      const result = formatAsJSON('{"a": 1}');
      expect(result.a).toBe(1);
    });
  });

  describe('applyTemplate()', () => {
    it('replaces template variables', () => {
      const result = applyTemplate('Hello world', 'Output: {{output}}');
      expect(result).toBe('Output: Hello world');
    });

    it('replaces timestamp', () => {
      const result = applyTemplate('test', '{{timestamp}}');
      expect(result).not.toBe('{{timestamp}}');
      expect(result).toContain('T');
    });

    it('replaces date', () => {
      const result = applyTemplate('test', '{{date}}');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('AgentLifecycle', () => {
  let lifecycle: AgentLifecycle;

  beforeEach(() => {
    lifecycle = new AgentLifecycle();
  });

  it('create/activate/deactivate/getStatus/cancel/destroy', () => {
    lifecycle.createAgent('agent-1');
    expect(lifecycle.getStatus('agent-1')).toBe('idle');

    lifecycle.activate('agent-1');
    expect(lifecycle.getStatus('agent-1')).toBe('running');

    lifecycle.deactivate('agent-1');
    expect(lifecycle.getStatus('agent-1')).toBe('idle');

    lifecycle.cancel('agent-1');
    expect(lifecycle.getStatus('agent-1')).toBe('failed');
    expect(lifecycle.isCancelled('agent-1')).toBe(true);

    lifecycle.destroy('agent-1');
    expect(() => lifecycle.getStatus('agent-1')).toThrow('not found');
  });

  it('activate throws for non-existent agent', () => {
    expect(() => lifecycle.activate('non-existent')).toThrow('not found');
  });

  it('deactivate throws for non-existent agent', () => {
    expect(() => lifecycle.deactivate('non-existent')).toThrow('not found');
  });

  it('cancel throws for non-existent agent', () => {
    expect(() => lifecycle.cancel('non-existent')).toThrow('not found');
  });

  it('listAll returns all agents', () => {
    lifecycle.createAgent('agent-1');
    lifecycle.createAgent('agent-2');
    const all = lifecycle.listAll();
    expect(all).toHaveLength(2);
  });

  it('getByStatus filters by status', () => {
    lifecycle.createAgent('agent-1');
    lifecycle.createAgent('agent-2');
    lifecycle.activate('agent-1');
    const running = lifecycle.getByStatus('running');
    expect(running).toEqual(['agent-1']);
  });

  it('getAge returns time since creation', () => {
    lifecycle.createAgent('agent-1');
    const age = lifecycle.getAge('agent-1');
    expect(age).toBeGreaterThanOrEqual(0);
  });

  it('complete and fail', () => {
    lifecycle.createAgent('agent-1');
    lifecycle.activate('agent-1');
    lifecycle.complete('agent-1');
    expect(lifecycle.getStatus('agent-1')).toBe('completed');

    lifecycle.createAgent('agent-2');
    lifecycle.activate('agent-2');
    lifecycle.fail('agent-2');
    expect(lifecycle.getStatus('agent-2')).toBe('failed');
  });
});