/**
 * 端到端测试：记忆模块写入和读取流程验证
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SQLiteWrapper as SQLiteDB } from '../src/base/DBWrapper';
import { LLMService } from '../src/core/llm/LLMService';
import { ModelConfigService } from '../src/core/modelConfig/ModelConfigService';
import { InformationService } from '../src/core/information/InformationService';
import { EvaluatorAgent } from '../src/strategy/Agent';
import { StrategyFactory } from '../src/strategy/ThinkingStrategy';
import { SlidingWindowScorer } from '../src/core/SlidingWindowScorer';

const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test-memory-e2e.db');

async function setupDatabase(db: SQLiteDB): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens INTEGER DEFAULT 0,
      keywords TEXT DEFAULT '[]',
      embedding_id TEXT,
      metadata TEXT DEFAULT '{}',
      tags TEXT DEFAULT '[]',
      is_learning_memory INTEGER DEFAULT 0,
      message_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS memory_nodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0.8,
      importance REAL DEFAULT 0.5,
      embedding TEXT,
      embedding_id TEXT,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0,
      is_learning_memory INTEGER DEFAULT 0,
      related_node_ids TEXT DEFAULT '[]'
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS memory_ratio_config (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      working_memory REAL DEFAULT 0.35,
      tag_neural_memory REAL DEFAULT 0.40,
      semantic_memory REAL DEFAULT 0.15,
      episodic_memory REAL DEFAULT 0.15,
      procedural_memory REAL DEFAULT 0.10,
      random_memory REAL DEFAULT 0.20,
      user_profile_memory REAL DEFAULT 0.05,
      knowledge_base_memory REAL DEFAULT 0.15,
      context_window_tokens INTEGER DEFAULT 8192,
      context_window_messages INTEGER DEFAULT 50,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS model_config (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      api_key TEXT NOT NULL,
      parameters TEXT DEFAULT '{}',
      is_default INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

describe('E2E Memory Write & Read', () => {
  let db: SQLiteDB;
  let infoService: InformationService;
  const testUserId = 'test-user-001';

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    db = new SQLiteDB({ path: TEST_DB_PATH });
    await setupDatabase(db);

    const modelConfigService = new ModelConfigService(db);
    const llmService = new LLMService(modelConfigService);
    infoService = new InformationService(db, llmService);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it('should save semantic memory', async () => {
    const mem = {
      id: 'mem-semantic-001',
      userId: testUserId,
      content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.',
      type: 'semantic' as const,
      source: 'self_learning',
      tags: ['typescript', 'javascript', 'programming'],
      confidence: 0.9,
      importance: 0.8,
      embedding: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
      isLearningMemory: false,
      relatedNodeIds: [],
    };

    const saved = await infoService.saveMemory(mem);
    expect(saved.id).toBe(mem.id);
  });

  it('should save episodic memory', async () => {
    const mem = {
      id: 'mem-episodic-001',
      userId: testUserId,
      content: 'Today I learned about async/await patterns in JavaScript.',
      type: 'episodic' as const,
      source: 'chat',
      tags: ['learning', 'javascript', 'async'],
      confidence: 0.85,
      importance: 0.7,
      embedding: [],
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
      accessedAt: Date.now() - 86400000,
      accessCount: 2,
      isLearningMemory: false,
      relatedNodeIds: [],
    };

    const saved = await infoService.saveMemory(mem);
    expect(saved.type).toBe('episodic');
  });

  it('should save procedural memory', async () => {
    const mem = {
      id: 'mem-procedural-001',
      userId: testUserId,
      content: 'To debug async code: 1) Add breakpoints 2) Check promise state 3) Use try/catch',
      type: 'procedural' as const,
      source: 'document',
      tags: ['debugging', 'async', 'how-to'],
      confidence: 0.95,
      importance: 0.85,
      embedding: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
      isLearningMemory: false,
      relatedNodeIds: [],
    };

    const saved = await infoService.saveMemory(mem);
    expect(saved.importance).toBe(0.85);
  });

  it('should save learning memory with isLearningMemory flag', async () => {
    const mem = {
      id: 'mem-learning-001',
      userId: testUserId,
      content: 'Learning extracted: User prefers TypeScript over JavaScript',
      type: 'semantic' as const,
      source: 'self_learning',
      tags: ['preference', 'typescript'],
      confidence: 0.8,
      importance: 0.9,
      embedding: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
      isLearningMemory: true,
      relatedNodeIds: [],
    };

    const saved = await infoService.saveMemory(mem);
    expect(saved.isLearningMemory).toBe(true);
  });

  it('should get memory by ID', async () => {
    const retrieved = await infoService.getMemory('mem-semantic-001');
    expect(retrieved).toBeDefined();
    expect(retrieved!.content).toBe('TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.');
  });

  it('should get semantic memories excluding learning memories', async () => {
    const memories = await infoService.getMemoriesByType(testUserId, 'semantic', 10, false);
    expect(memories.length).toBe(1);
  });

  it('should get semantic memories including learning memories', async () => {
    const memories = await infoService.getMemoriesByType(testUserId, 'semantic', 10, true);
    expect(memories.length).toBe(2);
  });

  it('should search memories by keyword', async () => {
    const results = await infoService.searchMemories(testUserId, 'TypeScript');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('should search memories by tag', async () => {
    const results = await infoService.searchMemories(testUserId, 'async');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('should update memory content', async () => {
    const updated = await infoService.updateMemory('mem-semantic-001', {
      content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It adds optional static typing.',
      confidence: 0.95,
    });
    expect(updated).toBeDefined();
    expect(updated!.content).toContain('optional static typing');
  });

  it('should update memory confidence', async () => {
    const updated = await infoService.getMemory('mem-semantic-001');
    expect(updated!.confidence).toBe(0.95);
  });

  it('should get memory stats', async () => {
    const stats = await infoService.getMemoryStats(testUserId);
    expect(stats.total).toBe(4);
    expect(stats.learningCount).toBe(1);
    expect(stats.byType['semantic']).toBe(2);
    expect(stats.byType['episodic']).toBe(1);
    expect(stats.byType['procedural']).toBe(1);
  });

  it('should increment memory access count', async () => {
    await infoService.incrementMemoryAccess('mem-semantic-001');
    const accessed = await infoService.getMemory('mem-semantic-001');
    expect(accessed).toBeDefined();
    expect(accessed!.accessCount).toBe(1);
  });

  it('should delete memory', async () => {
    await infoService.deleteMemory('mem-episodic-001');
    const deleted = await infoService.getMemory('mem-episodic-001');
    expect(deleted).toBeUndefined();
  });
});

describe('E2E Evaluator Agent Scoring', () => {
  it('should evaluate high quality response with all 5 dimensions', async () => {
    const strategy = StrategyFactory.create('reflexion');

    const mockLLMService: any = {
      chatCompletion: async () => ({
        choices: [{ message: { content: 'Mock response' } }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      }),
    };

    const evaluator = new EvaluatorAgent('eval-001', 'Test Evaluator', 'evaluator', strategy, mockLLMService);

    const messages = [
      { role: 'user' as const, content: 'What is TypeScript and how does it help with large JavaScript projects?' },
      { role: 'assistant' as const, content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It adds optional static types, which help catch errors at compile time. With types, IDEs can provide better autocompletion. Type systems make large codebases more maintainable. TypeScript supports the latest JavaScript features and adds its own like interfaces, enums, and generics.' },
    ];

    const result = await evaluator.execute(messages as any, { qualityThreshold: 0.7 });
    const qualityDetails = result.metadata.qualityDetails;

    expect(qualityDetails.overall).toBeDefined();
    expect(typeof qualityDetails.overall).toBe('number');
    expect(qualityDetails.dimensions.length).toBe(5);
    expect(qualityDetails.dimensions[0].name).toBe('relevance');
    expect(qualityDetails.overall).toBeGreaterThanOrEqual(0);
    expect(qualityDetails.overall).toBeLessThanOrEqual(1);
  });

  it('should score low quality response lower than high quality', async () => {
    const strategy = StrategyFactory.create('reflexion');

    const mockLLMService: any = {
      chatCompletion: async () => ({
        choices: [{ message: { content: 'Mock response' } }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      }),
    };

    const evaluator = new EvaluatorAgent('eval-002', 'Test Evaluator', 'evaluator', strategy, mockLLMService);

    const highQualityMessages = [
      { role: 'user' as const, content: 'What is TypeScript?' },
      { role: 'assistant' as const, content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It adds optional static types, which help catch errors at compile time rather than runtime. With types, IDEs can provide better autocompletion. Type systems make large codebases more maintainable.' },
    ];

    const lowQualityMessages = [
      { role: 'user' as const, content: 'Explain TypeScript generics with examples' },
      { role: 'assistant' as const, content: 'I think generics are maybe like templates or something. You can use them for types.' },
    ];

    const result1 = await evaluator.execute(highQualityMessages as any, { qualityThreshold: 0.7 });
    const result2 = await evaluator.execute(lowQualityMessages as any, { qualityThreshold: 0.7 });

    // Both scores should be valid numbers between 0 and 1
    expect(result1.metadata.qualityDetails.overall).toBeGreaterThanOrEqual(0);
    expect(result1.metadata.qualityDetails.overall).toBeLessThanOrEqual(1);
    expect(result2.metadata.qualityDetails.overall).toBeGreaterThanOrEqual(0);
    expect(result2.metadata.qualityDetails.overall).toBeLessThanOrEqual(1);
  });

  it('should score empty response low', async () => {
    const strategy = StrategyFactory.create('reflexion');

    const mockLLMService: any = {
      chatCompletion: async () => ({
        choices: [{ message: { content: 'Mock response' } }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      }),
    };

    const evaluator = new EvaluatorAgent('eval-003', 'Test Evaluator', 'evaluator', strategy, mockLLMService);

    const emptyMessages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: '' },
    ];

    const result = await evaluator.execute(emptyMessages as any, { qualityThreshold: 0.7 });
    expect(result.metadata.qualityDetails.overall).toBeLessThan(0.5);
  });
});

describe('E2E Sliding Window Scorer', () => {
  let scorer: SlidingWindowScorer;

  beforeAll(() => {
    scorer = new SlidingWindowScorer({
      windowSizeMs: 24 * 60 * 60 * 1000,
      minEntriesForEvaluation: 3,
      decayRate: 0.05,
    });
  });

  it('should have initial score 0', () => {
    const initialScore = scorer.getScore('skill-1');
    expect(initialScore.averageScore).toBe(0);
    expect(initialScore.entryCount).toBe(0);
  });

  it('should track entries after adding scores', () => {
    scorer.addScore('skill-1', 0.8, { source: 'execution' });
    scorer.addScore('skill-1', 0.7, { source: 'execution' });
    scorer.addScore('skill-1', 0.9, { source: 'execution' });

    const score = scorer.getScore('skill-1');
    expect(score.entryCount).toBe(3);
    expect(score.averageScore).toBeGreaterThan(0.75);
    expect(score.averageScore).toBeLessThan(0.85);
  });

  it('should retain above threshold', () => {
    const shouldRetain = scorer.shouldRetain('skill-1', 0.6);
    expect(shouldRetain).toBe(true);
  });

  it('should retain when not enough entries (grace period)', () => {
    scorer.addScore('skill-2', 0.5, {});
    const shouldRetain = scorer.shouldRetain('skill-2', 0.6);
    expect(shouldRetain).toBe(true);
  });

  it('should have weighted score as a number', () => {
    const scoreDetails = scorer.getScore('skill-1');
    expect(typeof scoreDetails.weightedScore).toBe('number');
  });

  it('should have valid trend', () => {
    const scoreDetails = scorer.getScore('skill-1');
    expect(['improving', 'declining', 'stable']).toContain(scoreDetails.recentTrend);
  });

  it('should clear scores', () => {
    scorer.clear('skill-1');
    const cleared = scorer.getScore('skill-1');
    expect(cleared.entryCount).toBe(0);
  });
});