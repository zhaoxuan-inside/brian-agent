import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InformationService } from '../../src/core/information';
import { StorageService } from '../../src/core/storage';
import { ModelConfigService } from '../../src/core/llm/modelConfig';
import { LLMService } from '../../src/core/llm';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('InformationService', () => {
  let info: InformationService;
  let storage: StorageService;
  let llm: LLMService;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-info-'));
    originalEnv = { ...process.env };
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    process.env.BRIAN_CONFIG_FILE_PATH = path.join(tempDir, 'model-config.json');
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    vi.resetModules();
    initDatabase();
    storage = new StorageService();
    const config = new ModelConfigService();
    llm = new LLMService(config);
    info = new InformationService(storage, llm);
  });

  afterEach(async () => {
    closeDatabase();
    if (storage) {
      await storage.close();
    }
    try { (info as any).tagEvolutionTimer && clearInterval((info as any).tagEvolutionTimer); } catch { /* Ignore timer cleanup errors */ }
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

  it('should add to working memory', () => {
    const id = info.addToWorking('conv-1', { content: 'test content', type: 'user_message', relevance: 0.8 });
    expect(id).toBeTruthy();

    const working = info.getWorking('conv-1');
    expect(working.length).toBe(1);
    expect(working[0].content).toBe('test content');
    expect(working[0].type).toBe('user_message');
  });

  it('should get working memory sorted by relevance', () => {
    info.addToWorking('conv-1', { content: 'low', type: 'message', relevance: 0.3 });
    info.addToWorking('conv-1', { content: 'high', type: 'message', relevance: 0.9 });
    info.addToWorking('conv-1', { content: 'mid', type: 'message', relevance: 0.5 });

    const working = info.getWorking('conv-1');
    expect(working[0].relevance).toBe(0.9);
    expect(working[1].relevance).toBe(0.5);
    expect(working[2].relevance).toBe(0.3);
  });

  it('should clear working memory', () => {
    info.addToWorking('conv-1', { content: 'test', type: 'message', relevance: 0.5 });
    info.clearWorking('conv-1');
    expect(info.getWorking('conv-1')).toEqual([]);
  });

  it('should keep working memory bounded', () => {
    for (let i = 0; i < 60; i++) {
      info.addToWorking('conv-1', { content: `item${i}`, type: 'message', relevance: Math.random() });
    }
    const working = info.getWorking('conv-1');
    expect(working.length).toBeLessThanOrEqual(50);
  });

  it('should store episodic memory', async () => {
    const id = await info.storeEpisodic('I visited a website yesterday', 'user');
    expect(id).toBeTruthy();

    const node = await storage.graph.getNode(id);
    expect(node).toBeDefined();
    const item = JSON.parse(node!.content);
    expect(item.type).toBe('episodic');
    expect(item.rawContent).toBe('I visited a website yesterday');
  });

  it('should store semantic memory', async () => {
    const id = await info.storeSemantic('React is a JavaScript library for building UIs', 'assistant');
    expect(id).toBeTruthy();

    const node = await storage.graph.getNode(id);
    expect(node).toBeDefined();
    const item = JSON.parse(node!.content);
    expect(item.type).toBe('semantic');
  });

  it('should store procedural memory', async () => {
    const id = await info.storeProcedural('To create a React component, use the function keyword', 'assistant');
    expect(id).toBeTruthy();
    const node = await storage.graph.getNode(id);
    expect(node).toBeDefined();
  });

  it('should check duplicate for exact match', async () => {
    await info.storeEpisodic('exact unique content for testing', 'user');
    const result = await info.checkDuplicate('exact unique content for testing');
    expect(result.isDuplicate).toBe(true);
    expect(result.existingId).toBeTruthy();
  });

  it('should check duplicate for non-duplicate', async () => {
    await info.storeEpisodic('original content', 'user');
    const result = await info.checkDuplicate('completely different content');
    expect(result.isDuplicate).toBe(false);
  });

  it('should merge memories', async () => {
    const id = await info.storeEpisodic('original memory', 'user');
    await info.mergeMemories(id, 'additional content');

    const node = await storage.graph.getNode(id);
    const item = JSON.parse(node!.content);
    expect(item.rawContent).toContain('original memory');
    expect(item.rawContent).toContain('additional content');
  });

  it('should calculate activity score', async () => {
    const memory = {
      id: 'test-id',
      retrievalCount: 5,
      accessHistory: [{ timestamp: Date.now(), context: 'test', score: 0.8 }],
      lastAccessedAt: Date.now(),
      rawContent: 'test content',
    };
    const score = await info.calculateActivityScore(memory);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('should calculate activity score with query', async () => {
    const memory = {
      id: 'test-id',
      retrievalCount: 0,
      accessHistory: [],
      lastAccessedAt: Date.now(),
      rawContent: 'React is a JavaScript library',
    };
    const score = await info.calculateActivityScore(memory, 'React library');
    expect(score).toBeGreaterThan(0);
  });

  it('should extract tags with domain', () => {
    const tags = info.extractTags('I want to build a React component with TypeScript');
    expect(tags.domain).toBeDefined();
    expect(tags.domain.length).toBeGreaterThan(0);
    expect(tags.domain).toContain('frontend');
  });

  it('should extract tags with industry', () => {
    const tags = info.extractTags('We need to implement a payment gateway for the ecommerce platform');
    expect(tags.industry).toBeDefined();
    expect(tags.industry).toContain('ecommerce');
  });

  it('should extract tags with concept', () => {
    const tags = info.extractTags('We use microservices architecture with event-driven design');
    expect(tags.concept).toBeDefined();
    expect(tags.concept).toContain('architecture');
  });

  it('should extract tags with action', () => {
    const tags = info.extractTags('I need to debug and optimize the code');
    expect(tags.action).toBeDefined();
    expect(tags.action).toContain('analyze');
  });

  it('should extract sentiment', () => {
    const tags = info.extractTags('This is an amazing and excellent solution');
    expect(tags.sentiment).toBe('positive');
  });

  it('should extract negative sentiment', () => {
    const tags = info.extractTags('This is terrible and broken');
    expect(tags.sentiment).toBe('negative');
  });

  it('should build tag graph', async () => {
    await info.storeEpisodic('I use React with TypeScript for frontend', 'user');
    await info.storeSemantic('Docker is a containerization tool', 'assistant');

    const graph = await info.buildTagGraph();
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThanOrEqual(0);
  });

  it('should get tag neighbors', async () => {
    await info.storeEpisodic('I use React and TypeScript for frontend development', 'user');
    await info.storeSemantic('Node.js is used for backend with Express', 'assistant');

    const neighbors = await info.getTagNeighbors('frontend', 2);
    expect(neighbors).toBeDefined();
  });

  it('should spreading activation work', async () => {
    await info.storeEpisodic('I use React with TypeScript and Webpack', 'user');
    await info.storeSemantic('Docker is used with Kubernetes', 'assistant');

    const activations = await info.spreadingActivation(['frontend'], 2);
    expect(activations.length).toBeGreaterThan(0);
    expect(activations[0].activation).toBe(1.0);
  });

  it('should retrieve by query', async () => {
    await info.storeEpisodic('I work with React and TypeScript every day', 'user');
    await info.storeEpisodic('I enjoy playing guitar in my free time', 'user');

    const results = await info.retrieve('React TypeScript');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should retrieve by tag', async () => {
    await info.storeEpisodic('I use React for building UIs', 'user');
    await info.storeEpisodic('Docker is great for containerization', 'user');

    const results = await info.retrieveByTag('frontend');
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('should retrieve by time range', async () => {
    const now = Date.now();
    await info.storeEpisodic('test memory', 'user');
    const results = await info.retrieveByTimeRange(now - 1000, now + 1000);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should retrieve by time range return empty for no matches', async () => {
    const results = await info.retrieveByTimeRange(0, 1);
    expect(results).toEqual([]);
  });

  it('should pin and unpin memory', async () => {
    const id = await info.storeEpisodic('important memory', 'user');
    info.pinMemory(id);
    expect(info.isPinned(id)).toBe(true);

    const pinned = await info.getPinnedMemories();
    expect(pinned.length).toBe(1);

    info.unpinMemory(id);
    expect(info.isPinned(id)).toBe(false);
    const unpinned = await info.getPinnedMemories();
    expect(unpinned.length).toBe(0);
  });

  it('should getPinnedMemories return empty when none pinned', async () => {
    const result = await info.getPinnedMemories();
    expect(result).toEqual([]);
  });

  it('should build context', async () => {
    storage.sqlite.createConversation('conv-ctx', 'user-1', 'Test');
    storage.sqlite.createMessage({ id: 'm1', conversationId: 'conv-ctx', role: 'user', content: 'Hello' });
    storage.sqlite.createMessage({ id: 'm2', conversationId: 'conv-ctx', role: 'assistant', content: 'Hi! How can I help?' });

    await info.storeEpisodic('I am a React developer', 'user');

    const context = await info.buildContext('I need help with React', 'conv-ctx', 3);
    expect(context).toContain('[Current Message]');
    expect(context).toContain('I need help with React');
    expect(context).toContain('[Recent Conversation]');
  });

  it('should build context include pinned memories', async () => {
    storage.sqlite.createConversation('conv-ctx', 'user-1');
    const id = await info.storeEpisodic('My favorite framework is React', 'user');
    info.pinMemory(id);

    const context = await info.buildContext('test', 'conv-ctx');
    expect(context).toContain('[Pinned Memories]');
    expect(context).toContain('React');
  });

  it('should consolidate working memory', async () => {
    info.addToWorking('conv-1', { content: 'User said: I like React', type: 'user_message', relevance: 0.9 });
    info.addToWorking('conv-1', { content: 'React is a JS library', type: 'knowledge', relevance: 0.8 });

    await info.consolidateWorking('conv-1');

    expect(info.getWorking('conv-1').length).toBe(0);

    const allNodes = await storage.graph.getAllNodes();
    expect(allNodes.length).toBeGreaterThan(0);
  });

  it('should consolidateWorking do nothing for empty working memory', async () => {
    await info.consolidateWorking('empty-conv');
  });

  it('should get recent messages', () => {
    storage.sqlite.createConversation('conv-1', 'user-1');
    for (let i = 0; i < 15; i++) {
      storage.sqlite.createMessage({ id: `m${i}`, conversationId: 'conv-1', role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` });
    }

    const recent = info.getRecentMessages('conv-1', 5);
    expect(recent.length).toBe(5);
    expect(recent[4].content).toBe('msg 14');
  });
});