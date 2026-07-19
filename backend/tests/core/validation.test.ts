import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ValidationService } from '../../src/core/validation';
import { ModelConfigService } from '../../src/core/llm/modelConfig';
import { LLMService } from '../../src/core/llm';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ValidationService', () => {
  let validation: ValidationService;
  let llm: LLMService;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-validation-'));
    originalEnv = { ...process.env };
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    process.env.BRIAN_CONFIG_FILE_PATH = path.join(tempDir, 'model-config.json');
    vi.resetModules();
    initDatabase();
    const config = new ModelConfigService();
    llm = new LLMService(config);
    validation = new ValidationService(llm, 70);
  });

  afterEach(() => {
    closeDatabase();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('BRIAN_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // --- Score Answer ---
  it('should scoreAnswer with mock LLM response', async () => {
    const mockResponse = {
      content: JSON.stringify({
        accuracy: 18,
        completeness: 16,
        relevance: 19,
        depth: 15,
        clarity: 17,
        feedback: 'Good answer overall.',
        suggestions: ['Add more examples', 'Improve depth'],
      }),
      toolCalls: undefined,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 200,
    };

    // Mock the chat method
    const chatSpy = vi.spyOn(llm, 'chat').mockResolvedValue(mockResponse);

    const result = await validation.scoreAnswer('What is React?', 'React is a JavaScript library for building user interfaces.');
    expect(result.totalScore).toBe(85);
    expect(result.breakdown.accuracy).toBe(18);
    expect(result.breakdown.completeness).toBe(16);
    expect(result.breakdown.relevance).toBe(19);
    expect(result.breakdown.depth).toBe(15);
    expect(result.breakdown.clarity).toBe(17);
    expect(result.needsRetry).toBe(false);
    expect(result.suggestions.length).toBe(2);

    chatSpy.mockRestore();
  });

  it('should scoreAnswer set needsRetry when score below threshold', async () => {
    const mockResponse = {
      content: JSON.stringify({
        accuracy: 5,
        completeness: 5,
        relevance: 5,
        depth: 5,
        clarity: 5,
        feedback: 'Poor answer.',
        suggestions: ['Improve everything'],
      }),
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 200,
    };

    const chatSpy = vi.spyOn(llm, 'chat').mockResolvedValue(mockResponse as any);
    const result = await validation.scoreAnswer('What is React?', 'Bad answer');
    expect(result.needsRetry).toBe(true);
    chatSpy.mockRestore();
  });

  it('should scoreAnswer fallback to heuristic when LLM fails', async () => {
    const chatSpy = vi.spyOn(llm, 'chat').mockRejectedValue(new Error('LLM error'));
    const result = await validation.scoreAnswer('What is React?', 'React is a JavaScript library for building user interfaces.');
    expect(result.totalScore).toBeGreaterThan(0);
    expect(result.breakdown).toBeDefined();
    chatSpy.mockRestore();
  });

  it('should scoreAnswer parse JSON from markdown code block', async () => {
    const mockResponse = {
      content: '```json\n{"accuracy":18,"completeness":16,"relevance":19,"depth":15,"clarity":17,"feedback":"Good","suggestions":["S1"]}\n```',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 200,
    };
    const chatSpy = vi.spyOn(llm, 'chat').mockResolvedValue(mockResponse as any);
    const result = await validation.scoreAnswer('Q', 'A');
    expect(result.totalScore).toBe(85);
    chatSpy.mockRestore();
  });

  // --- Validate and Improve ---
  it('should validateAndImprove with good answer', async () => {
    const mockResponse = {
      content: JSON.stringify({
        accuracy: 18,
        completeness: 18,
        relevance: 18,
        depth: 18,
        clarity: 18,
        feedback: 'Great answer.',
        suggestions: [],
      }),
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 200,
    };
    const chatSpy = vi.spyOn(llm, 'chat').mockResolvedValue(mockResponse as any);

    const result = await validation.validateAndImprove('What is React?', 'React is a library');
    expect(result.finalAnswer).toBe('React is a library');
    expect(result.retryCount).toBe(0);
    chatSpy.mockRestore();
  });

  it('should validateAndImprove retry when score low', async () => {
    let callCount = 0;
    const chatSpy = vi.spyOn(llm, 'chat').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: JSON.stringify({
            accuracy: 5, completeness: 5, relevance: 5, depth: 5, clarity: 5,
            feedback: 'Poor', suggestions: ['Fix'],
          }),
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          latencyMs: 200,
        } as any;
      }
      return {
        content: 'Improved answer with more detail and examples',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latencyMs: 200,
      } as any;
    });

    const result = await validation.validateAndImprove('What is React?', 'Bad');
    expect(result.retryCount).toBeGreaterThan(0);
    chatSpy.mockRestore();
  });

  it('should generateImprovedAnswer', async () => {
    const chatSpy = vi.spyOn(llm, 'chat').mockResolvedValue({
      content: 'Improved version of the answer.',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 200,
    } as any);

    const scoreResult = {
      totalScore: 50,
      breakdown: { accuracy: 10, completeness: 10, relevance: 10, depth: 10, clarity: 10 },
      feedback: 'Needs improvement',
      suggestions: ['Add more detail'],
      needsRetry: true,
    };
    const improved = await validation.generateImprovedAnswer('Q', 'A', scoreResult);
    expect(improved).toBe('Improved version of the answer.');
    chatSpy.mockRestore();
  });

  it('should generateImprovedAnswer return original on LLM failure', async () => {
    const chatSpy = vi.spyOn(llm, 'chat').mockRejectedValue(new Error('LLM error'));
    const scoreResult = {
      totalScore: 50,
      breakdown: { accuracy: 10, completeness: 10, relevance: 10, depth: 10, clarity: 10 },
      feedback: 'Needs improvement',
      suggestions: ['Add more detail'],
      needsRetry: true,
    };
    const improved = await validation.generateImprovedAnswer('Q', 'Original Answer', scoreResult);
    expect(improved).toBe('Original Answer');
    chatSpy.mockRestore();
  });

  // --- Threshold ---
  it('should getThreshold return configured value', () => {
    expect(validation.getThreshold()).toBe(70);
  });

  it('should getThreshold return custom value', () => {
    const customValidation = new ValidationService(llm, 80);
    expect(customValidation.getThreshold()).toBe(80);
  });

  // --- Memory Policy ---
  it('should shouldWriteToMemory return true for always policy', async () => {
    validation.setPolicy('always');
    const result = await validation.shouldWriteToMemory('Q', 'A');
    expect(result).toBe(true);
  });

  it('should shouldWriteToMemory with auto_high_score when score high', async () => {
    validation.setPolicy('auto_high_score');
    const chatSpy = vi.spyOn(llm, 'chat').mockResolvedValue({
      content: JSON.stringify({
        accuracy: 18, completeness: 18, relevance: 18, depth: 18, clarity: 18,
        feedback: 'Great', suggestions: [],
      }),
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 200,
    } as any);
    const result = await validation.shouldWriteToMemory('Q', 'Great detailed answer with examples');
    expect(result).toBe(true);
    chatSpy.mockRestore();
  });

  it('should shouldWriteToMemory with auto_high_score when score low', async () => {
    validation.setPolicy('auto_high_score');
    const chatSpy = vi.spyOn(llm, 'chat').mockResolvedValue({
      content: JSON.stringify({
        accuracy: 5, completeness: 5, relevance: 5, depth: 5, clarity: 5,
        feedback: 'Poor', suggestions: ['Fix'],
      }),
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 200,
    } as any);
    const result = await validation.shouldWriteToMemory('Q', 'Bad');
    expect(result).toBe(false);
    chatSpy.mockRestore();
  });

  it('should shouldWriteToMemory with user_approved return true when approved', async () => {
    validation.setPolicy('user_approved');
    const result = await validation.shouldWriteToMemory('Q', 'A', undefined, true);
    expect(result).toBe(true);
  });

  it('should shouldWriteToMemory with user_approved return false when not approved', async () => {
    validation.setPolicy('user_approved');
    const result = await validation.shouldWriteToMemory('Q', 'A', undefined, false);
    expect(result).toBe(false);
  });

  it('should setPolicy and getPolicy', () => {
    validation.setPolicy('always');
    expect(validation.getPolicy()).toBe('always');

    validation.setPolicy('user_approved');
    expect(validation.getPolicy()).toBe('user_approved');

    validation.setPolicy('auto_high_score');
    expect(validation.getPolicy()).toBe('auto_high_score');
  });

  it('should default policy be auto_high_score', () => {
    expect(validation.getPolicy()).toBe('auto_high_score');
  });

  // --- Heuristic Scoring ---
  it('should scoreAnswer use heuristic for short answers', async () => {
    const chatSpy = vi.spyOn(llm, 'chat').mockRejectedValue(new Error('fail'));
    const result = await validation.scoreAnswer('What is React?', 'React');
    expect(result.totalScore).toBeLessThan(70);
    chatSpy.mockRestore();
  });

  it('should scoreAnswer use heuristic for long answers', async () => {
    const chatSpy = vi.spyOn(llm, 'chat').mockRejectedValue(new Error('fail'));
    const longAnswer = 'A'.repeat(600);
    const result = await validation.scoreAnswer('What is React?', longAnswer);
    expect(result.totalScore).toBeGreaterThan(50);
    chatSpy.mockRestore();
  });

  it('should scoreAnswer heuristic detect structure', async () => {
    const chatSpy = vi.spyOn(llm, 'chat').mockRejectedValue(new Error('fail'));
    const result = await validation.scoreAnswer('What is React?', '1. First point\n2. Second point\n3. Third point');
    expect(result.breakdown.clarity).toBeGreaterThan(10);
    chatSpy.mockRestore();
  });
});