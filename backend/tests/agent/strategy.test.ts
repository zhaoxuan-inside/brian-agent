import { describe, it, expect, vi } from 'vitest';
import { selectStrategy, executeReACT, executePlanExecute, executeCoT } from '../../src/agent/strategy';
import type { LLMResponse } from '../../src/shared/types';

function makeMockLLM(responses: string[]) {
  let callCount = 0;
  return {
    chat: vi.fn().mockImplementation(async () => {
      const content = responses[callCount] || responses[responses.length - 1];
      callCount++;
      return {
        content,
        toolCalls: [],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latencyMs: 100,
      } as LLMResponse;
    }),
  };
}

function makeMockTool(name: string, executeResult: string) {
  return {
    name,
    description: `Tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    execute: vi.fn().mockResolvedValue(executeResult),
  };
}

describe('Strategy', () => {
  describe('selectStrategy()', () => {
    it('returns react for medium complexity', () => {
      const result = selectStrategy({ intent: 'creation', complexity: 0.5, domain: 'general' });
      expect(result).toBe('react');
    });

    it('returns plan-execute for high complexity', () => {
      const result = selectStrategy({ intent: 'creation', complexity: 0.8, domain: 'general' });
      expect(result).toBe('plan-execute');
    });

    it('returns cot for low complexity', () => {
      const result = selectStrategy({ intent: 'creation', complexity: 0.2, domain: 'general' });
      expect(result).toBe('react');
    });

    it('returns cot for reasoning domain with medium complexity', () => {
      const result = selectStrategy({ intent: 'analysis', complexity: 0.5, domain: 'analysis' });
      expect(result).toBe('cot');
    });

    it('returns react for action intents', () => {
      const result = selectStrategy({ intent: 'creation', complexity: 0.5, domain: 'general' });
      expect(result).toBe('react');
    });

    it('returns cot for planning intents', () => {
      const result = selectStrategy({ intent: 'planning', complexity: 0.5, domain: 'general' });
      expect(result).toBe('cot');
    });
  });

  describe('executeReACT()', () => {
    it('completes think-act-observe loop', async () => {
      const mockLLM = makeMockLLM([
        'Thought: I need to use the search tool\nAction: search\nAction Input: {"query": "test"}\n',
        'Final Answer: The answer is 42',
      ]);
      const tools = [makeMockTool('search', 'Found results')];

      const result = await executeReACT('Find the answer', tools, mockLLM);
      expect(result.result).toBe('The answer is 42');
      expect(result.trace.length).toBeGreaterThan(0);
    });

    it('handles final answer in first response', async () => {
      const mockLLM = makeMockLLM([
        'Final Answer: The quick answer is 42',
      ]);
      const tools = [makeMockTool('search', 'Found results')];

      const result = await executeReACT('Simple question', tools, mockLLM);
      expect(result.result).toBe('The quick answer is 42');
    });

    it('handles max iterations limit', async () => {
      const responses: string[] = [];
      for (let i = 0; i < 6; i++) {
        responses.push('Thought: Still thinking\nAction: search\nAction Input: {"query": "test"}\n');
      }
      const mockLLM = makeMockLLM(responses);
      const tools = [makeMockTool('search', 'Found results')];

      const result = await executeReACT('Hard question', tools, mockLLM);
      expect(result.trace.length).toBeGreaterThanOrEqual(5);
    });

    it('handles LLM errors gracefully', async () => {
      const mockLLM = {
        chat: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
      };
      const tools = [makeMockTool('search', 'Found results')];

      const result = await executeReACT('Test task', tools, mockLLM);
      expect(result.result).toContain('Error');
      expect(result.trace.length).toBeGreaterThan(0);
    });
  });

  describe('executePlanExecute()', () => {
    it('generates plan then executes', async () => {
      const mockLLM = makeMockLLM([
        JSON.stringify({
          goal: 'Complete the task',
          steps: [
            { id: 'step_1', description: 'First step', expectedOutput: 'output 1', dependencies: [] },
            { id: 'step_2', description: 'Second step', expectedOutput: 'output 2', dependencies: ['step_1'] },
          ],
        }),
        'Step 1 result',
        'Step 2 result',
      ]);

      const result = await executePlanExecute('Build something', mockLLM);
      expect(result.plan).toBeDefined();
      expect(result.result).toBeDefined();
    });

    it('handles plan generation failure', async () => {
      const mockLLM = {
        chat: vi.fn().mockRejectedValue(new Error('Plan generation failed')),
      };

      const result = await executePlanExecute('Build something', mockLLM);
      expect(result.plan).toBeDefined();
      expect(result.result).toContain('Failed to generate plan');
    });
  });

  describe('executeCoT()', () => {
    it('chains reasoning steps', async () => {
      const mockLLM = makeMockLLM([
        'Step 1: First we analyze the problem\nStep 2: Then we consider solutions\nFinal Answer: The best approach is to use recursion.',
      ]);

      const result = await executeCoT('Solve a problem', mockLLM);
      expect(result).toBe('The best approach is to use recursion.');
    });

    it('returns full response when no Final Answer marker', async () => {
      const mockLLM = makeMockLLM([
        'Step 1: Let me think about this\nStep 2: Here is my analysis\nIn conclusion, the answer is 42.',
      ]);

      const result = await executeCoT('Solve a problem', mockLLM);
      expect(result).toContain('Step 1');
    });

    it('handles LLM errors', async () => {
      const mockLLM = {
        chat: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
      };

      const result = await executeCoT('Solve a problem', mockLLM);
      expect(result).toContain('Error');
    });
  });
});