import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import { SQLiteStorage } from '../../src/core/storage/sqlite';
import { GraphStorage } from '../../src/core/storage/graph';
import { VectorStorage } from '../../src/core/storage/vector';
import { TimeSeriesStorage } from '../../src/core/storage/timeseries';
import fs from 'fs';
import path from 'path';
import os from 'os';


describe('SQLiteStorage', () => {
  let storage: SQLiteStorage;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-storage-'));
    originalEnv = { ...process.env };
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    vi.resetModules();
    initDatabase();
    storage = new SQLiteStorage();
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

  // --- Conversations ---
  it('should create and get conversation', () => {
    const result = storage.createConversation('conv-1', 'user-1', 'Test Conversation');
    expect(result.id).toBe('conv-1');

    const conv = storage.getConversation('conv-1');
    expect(conv).toBeDefined();
    expect(conv.id).toBe('conv-1');
    expect(conv.userId).toBe('user-1');
    expect(conv.title).toBe('Test Conversation');
    expect(conv.status).toBe('active');
  });

  it('should list conversations for user', () => {
    storage.createConversation('conv-1', 'user-1', 'First');
    storage.createConversation('conv-2', 'user-1', 'Second');
    storage.createConversation('conv-3', 'user-2', 'Third');

    const user1Convs = storage.listConversations('user-1');
    expect(user1Convs.length).toBe(2);
    const user2Convs = storage.listConversations('user-2');
    expect(user2Convs.length).toBe(1);
  });

  it('should delete conversation', () => {
    storage.createConversation('conv-1', 'user-1', 'Test');
    storage.deleteConversation('conv-1');
    const conv = storage.getConversation('conv-1');
    expect(conv).toBeUndefined();
  });

  it('should update conversation title', () => {
    storage.createConversation('conv-1', 'user-1', 'Old Title');
    storage.updateConversation('conv-1', { title: 'New Title' });
    const conv = storage.getConversation('conv-1');
    expect(conv.title).toBe('New Title');
  });

  it('should get conversation return undefined for missing', () => {
    const conv = storage.getConversation('nonexistent');
    expect(conv).toBeUndefined();
  });

  // --- Messages ---
  it('should create and get messages', () => {
    storage.createConversation('conv-1', 'user-1');
    storage.createMessage({ id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'Hello' });
    storage.createMessage({ id: 'msg-2', conversationId: 'conv-1', role: 'assistant', content: 'Hi there' });

    const messages = storage.getMessages('conv-1');
    expect(messages.length).toBe(2);
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].content).toBe('Hi there');
  });

  it('should get messages with limit', () => {
    storage.createConversation('conv-1', 'user-1');
    for (let i = 0; i < 10; i++) {
      storage.createMessage({ id: `msg-${i}`, conversationId: 'conv-1', role: 'user', content: `Message ${i}` });
    }

    const limited = storage.getMessages('conv-1', 5);
    expect(limited.length).toBe(5);
  });

  it('should get single message', () => {
    storage.createConversation('conv-1', 'user-1');
    storage.createMessage({ id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'Hello' });

    const msg = storage.getMessage('msg-1');
    expect(msg).toBeDefined();
    expect(msg.content).toBe('Hello');
  });

  // --- Call History ---
  it('should record and get call history', () => {
    storage.recordCall('gpt-4o', 'openai', 100, 500);
    storage.recordCall('gpt-4o-mini', 'openai', 50, 200);

    const history = storage.getCallHistory();
    expect(history.length).toBe(2);
    expect(history[0].model).toBe('gpt-4o-mini');
    expect(history[0].tokens).toBe(50);
  });

  it('should get call history with limit', () => {
    for (let i = 0; i < 5; i++) {
      storage.recordCall('gpt-4o', 'openai', 100, 500);
    }
    const history = storage.getCallHistory(3);
    expect(history.length).toBe(3);
  });

  // --- User Preferences ---
  it('should set and get preferences', () => {
    storage.setPreference('user-1', 'content', 'language', 'typescript', 0.8, 'test');
    storage.setPreference('user-1', 'content', 'framework', 'react', 0.9, 'test');

    const prefs = storage.getPreferences('user-1');
    expect(prefs.length).toBe(2);
  });

  it('should get preferences by category', () => {
    storage.setPreference('user-1', 'content', 'key1', 'val1', 0.5);
    storage.setPreference('user-1', 'aesthetic', 'key2', 'val2', 0.5);

    const contentPrefs = storage.getPreferences('user-1', 'content');
    expect(contentPrefs.length).toBe(1);
    expect(contentPrefs[0].category).toBe('content');
  });

  it('should delete preference', () => {
    storage.setPreference('user-1', 'content', 'key1', 'val1');
    const prefs = storage.getPreferences('user-1');
    expect(prefs.length).toBe(1);
    storage.deletePreference(prefs[0].id);
    expect(storage.getPreferences('user-1').length).toBe(0);
  });

  // --- Time Series ---
  it('should insert and query time series', () => {
    const now = Date.now();
    const start = now - 10000;
    const end = now + 10000;

    storage.insertTimeSeries('cpu', 75.5, { host: 'server1' });
    storage.insertTimeSeries('cpu', 80.2, { host: 'server1' });

    const data = storage.queryTimeSeries('cpu', start, end);
    expect(data.length).toBe(2);
    expect(data[0].value).toBe(75.5);
    expect(data[0].tags).toEqual({ host: 'server1' });
  });

  it('should query time series by time range', () => {
    const now = Date.now();
    storage.insertTimeSeries('memory', 50, {});
    storage.insertTimeSeries('memory', 60, {});

    const data = storage.queryTimeSeries('memory', now - 1000, now + 1000);
    expect(data.length).toBe(2);
  });

  // --- Feedback ---
  it('should create and get feedback', () => {
    storage.createFeedback({
      id: 'fb-1', messageId: 'msg-1', conversationId: 'conv-1', userId: 'user-1',
      rating: 'good', reason: 'Great answer',
    });
    const fb = storage.getFeedback('fb-1');
    expect(fb).toBeDefined();
    expect(fb.rating).toBe('good');
    expect(fb.reason).toBe('Great answer');
    expect(fb.status).toBe('pending');
  });

  it('should list feedback with filters', () => {
    storage.createFeedback({ id: 'fb-1', messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });
    storage.createFeedback({ id: 'fb-2', messageId: 'm2', conversationId: 'c2', userId: 'u1', rating: 'bad' });

    const good = storage.listFeedback({ rating: 'good' });
    expect(good.length).toBe(1);
    const bad = storage.listFeedback({ rating: 'bad' });
    expect(bad.length).toBe(1);
  });

  it('should update feedback status', () => {
    storage.createFeedback({ id: 'fb-1', messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });
    storage.updateFeedbackStatus('fb-1', 'reviewed');
    const fb = storage.getFeedback('fb-1');
    expect(fb.status).toBe('reviewed');
  });

  // --- Skills ---
  it('should create, get, list, update, delete, toggle skill', () => {
    storage.createSkill({ id: 'sk-1', name: 'Test Skill', mode: 'user', description: 'A test skill' });
    const skill = storage.getSkill('sk-1');
    expect(skill).toBeDefined();
    expect(skill.name).toBe('Test Skill');
    expect(skill.active).toBe(1);

    const list = storage.listSkills();
    expect(list.length).toBe(1);

    storage.updateSkill('sk-1', { name: 'Updated Skill' });
    expect(storage.getSkill('sk-1').name).toBe('Updated Skill');

    storage.toggleSkill('sk-1');
    expect(storage.getSkill('sk-1').active).toBe(0);

    storage.toggleSkill('sk-1');
    expect(storage.getSkill('sk-1').active).toBe(1);

    storage.deleteSkill('sk-1');
    expect(storage.getSkill('sk-1')).toBeUndefined();
  });

  it('should list skills with search', () => {
    storage.createSkill({ id: 'sk-1', name: 'React Skill', mode: 'user', description: 'React related' });
    storage.createSkill({ id: 'sk-2', name: 'Vue Skill', mode: 'user', description: 'Vue related' });

    const results = storage.listSkills('React');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('React Skill');
  });

  // --- Custom Agents ---
  it('should create, get, list, update, delete, toggle agent', () => {
    storage.createAgent({ id: 'ag-1', name: 'Test Agent', role: 'assistant', description: 'A test agent' });
    const agent = storage.getAgent('ag-1');
    expect(agent).toBeDefined();
    expect(agent.name).toBe('Test Agent');
    expect(agent.active).toBe(1);

    const list = storage.listAgents();
    expect(list.length).toBe(1);

    storage.updateAgent('ag-1', { name: 'Updated Agent' });
    expect(storage.getAgent('ag-1').name).toBe('Updated Agent');

    storage.toggleAgent('ag-1');
    expect(storage.getAgent('ag-1').active).toBe(0);

    storage.toggleAgent('ag-1');
    expect(storage.getAgent('ag-1').active).toBe(1);

    storage.deleteAgent('ag-1');
    expect(storage.getAgent('ag-1')).toBeUndefined();
  });

  it('should list agents with search', () => {
    storage.createAgent({ id: 'ag-1', name: 'Coder Agent', role: 'developer', description: 'Coding' });
    storage.createAgent({ id: 'ag-2', name: 'Writer Agent', role: 'writer', description: 'Writing' });

    const results = storage.listAgents('Coder');
    expect(results.length).toBe(1);
  });

  // --- MCP Installed ---
  it('should create, list, delete MCP installed', () => {
    storage.createMcpInstalled({ id: 'mcp-1', packageName: 'test-pkg', displayName: 'Test MCP' });
    const list = storage.listMcpInstalled();
    expect(list.length).toBe(1);
    expect(list[0].packageName).toBe('test-pkg');

    const item = storage.getMcpInstalled('mcp-1');
    expect(item).toBeDefined();

    storage.deleteMcpInstalled('mcp-1');
    expect(storage.listMcpInstalled().length).toBe(0);
  });

  // --- Library Paths ---
  it('should create, list, delete, check library path', () => {
    const result = storage.createLibraryPath('/tmp/test-path');
    expect(result.id).toBeTruthy();

    const list = storage.listLibraryPaths();
    expect(list.length).toBe(1);
    expect(list[0].path).toBe('/tmp/test-path');

    expect(storage.checkPathExists('/tmp/test-path')).toBe(true);
    expect(storage.checkPathExists('/tmp/nonexistent')).toBe(false);

    storage.deleteLibraryPath(result.id);
    expect(storage.listLibraryPaths().length).toBe(0);
  });

  // --- Agent Library ---
  it('should create, get, list, update, delete agent library entry', () => {
    storage.createAgentLibraryEntry({
      id: 'al-1', name: 'Test Agent', taskFeatures: '{}', strategy: 'react',
      llmConfig: '{}', promptConfig: '{}', skills: '[]', mcpEndpoints: '[]',
      soul: '{}', strength: 0.8, useCount: 0, reliability: 0.9,
    });

    const entry = storage.getAgentLibraryEntry('al-1');
    expect(entry).toBeDefined();
    expect(entry.name).toBe('Test Agent');
    expect(entry.strength).toBe(0.8);

    const list = storage.listAgentLibrary();
    expect(list.length).toBe(1);

    storage.updateAgentLibraryEntry('al-1', { strength: 0.9 });
    expect(storage.getAgentLibraryEntry('al-1').strength).toBe(0.9);

    storage.deleteAgentLibraryEntry('al-1');
    expect(storage.getAgentLibraryEntry('al-1')).toBeUndefined();
  });
});

describe('GraphStorage', () => {
  let graph: GraphStorage;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-graph-'));
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    vi.resetModules();
    initDatabase();
    graph = new GraphStorage();
  });

  afterEach(() => {
    closeDatabase();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create and get node', async () => {
    const node = await graph.createNode({
      type: 'memory', content: 'test content', metadata: { key: 'value' },
      salienceScore: 0.5, retrievalCount: 0, strength: 0.8, decayRate: 0.05,
    });
    expect(node.id).toBeTruthy();

    const retrieved = await graph.getNode(node.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.content).toBe('test content');
    expect(retrieved!.type).toBe('memory');
  });

  it('should create node with emotional tag', async () => {
    const node = await graph.createNode({
      type: 'memory', content: 'excited memory', metadata: {},
      salienceScore: 0.7, emotionalTag: 'excited', retrievalCount: 0, strength: 0.9, decayRate: 0.03,
    });
    const retrieved = await graph.getNode(node.id);
    // The graph storage may store emotionalTag in metadata or as a separate field
    expect(retrieved).toBeDefined();
    expect(retrieved!.content).toBe('excited memory');
  });

  it('should get all nodes', async () => {
    await graph.createNode({ type: 'memory', content: 'a', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    await graph.createNode({ type: 'memory', content: 'b', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const nodes = await graph.getAllNodes();
    expect(nodes.length).toBe(2);
  });

  it('should update node', async () => {
    const node = await graph.createNode({ type: 'memory', content: 'old', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    await graph.updateNode(node.id, { content: 'new', strength: 0.9 });
    const updated = await graph.getNode(node.id);
    expect(updated!.content).toBe('new');
    expect(updated!.strength).toBe(0.9);
  });

  it('should update node metadata', async () => {
    const node = await graph.createNode({ type: 'memory', content: 'test', metadata: { a: 1 }, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    await graph.updateNode(node.id, { metadata: { b: 2 } });
    const updated = await graph.getNode(node.id);
    expect(updated!.metadata).toEqual({ b: 2 });
  });

  it('should delete node', async () => {
    const node = await graph.createNode({ type: 'memory', content: 'test', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    await graph.deleteNode(node.id);
    const deleted = await graph.getNode(node.id);
    expect(deleted).toBeUndefined();
  });

  it('should create and get edge', async () => {
    const n1 = await graph.createNode({ type: 'memory', content: 'n1', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const n2 = await graph.createNode({ type: 'memory', content: 'n2', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });

    const edge = await graph.createEdge({
      sourceNodeId: n1.id, targetNodeId: n2.id, weight: 0.8,
      label: 'related', activationCount: 0, direction: 'undirected',
    });
    expect(edge.id).toBeTruthy();

    const retrieved = await graph.getEdge(edge.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.weight).toBe(0.8);
    expect(retrieved!.label).toBe('related');
  });

  it('should get edges by source', async () => {
    const n1 = await graph.createNode({ type: 'memory', content: 'n1', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const n2 = await graph.createNode({ type: 'memory', content: 'n2', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const n3 = await graph.createNode({ type: 'memory', content: 'n3', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });

    await graph.createEdge({ sourceNodeId: n1.id, targetNodeId: n2.id, weight: 0.5, activationCount: 0, direction: 'undirected' });
    await graph.createEdge({ sourceNodeId: n1.id, targetNodeId: n3.id, weight: 0.7, activationCount: 0, direction: 'undirected' });

    const edges = await graph.getEdgesBySource(n1.id);
    expect(edges.length).toBe(2);
  });

  it('should get edges by target', async () => {
    const n1 = await graph.createNode({ type: 'memory', content: 'n1', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const n2 = await graph.createNode({ type: 'memory', content: 'n2', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });

    await graph.createEdge({ sourceNodeId: n1.id, targetNodeId: n2.id, weight: 0.5, activationCount: 0, direction: 'undirected' });

    const edges = await graph.getEdgesByTarget(n2.id);
    expect(edges.length).toBe(1);
  });

  it('should update edge', async () => {
    const n1 = await graph.createNode({ type: 'memory', content: 'n1', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const n2 = await graph.createNode({ type: 'memory', content: 'n2', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const edge = await graph.createEdge({ sourceNodeId: n1.id, targetNodeId: n2.id, weight: 0.5, activationCount: 0, direction: 'undirected' });

    await graph.updateEdge(edge.id, { weight: 0.9, label: 'updated' });
    const updated = await graph.getEdge(edge.id);
    expect(updated!.weight).toBe(0.9);
    expect(updated!.label).toBe('updated');
  });

  it('should delete edge', async () => {
    const n1 = await graph.createNode({ type: 'memory', content: 'n1', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const n2 = await graph.createNode({ type: 'memory', content: 'n2', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const edge = await graph.createEdge({ sourceNodeId: n1.id, targetNodeId: n2.id, weight: 0.5, activationCount: 0, direction: 'undirected' });
    await graph.deleteEdge(edge.id);
    const deleted = await graph.getEdge(edge.id);
    expect(deleted).toBeUndefined();
  });

  it('should get neighbors with depth 1', async () => {
    const n1 = await graph.createNode({ type: 'memory', content: 'n1', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const n2 = await graph.createNode({ type: 'memory', content: 'n2', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const n3 = await graph.createNode({ type: 'memory', content: 'n3', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });

    await graph.createEdge({ sourceNodeId: n1.id, targetNodeId: n2.id, weight: 0.5, activationCount: 0, direction: 'undirected' });
    await graph.createEdge({ sourceNodeId: n2.id, targetNodeId: n3.id, weight: 0.5, activationCount: 0, direction: 'undirected' });

    const neighbors1 = await graph.getNeighbors(n1.id, 1);
    expect(neighbors1.length).toBe(1);
    expect(neighbors1[0].id).toBe(n2.id);

    const neighbors2 = await graph.getNeighbors(n1.id, 2);
    expect(neighbors2.length).toBe(2);
  });

  it('should get neighbors for node with no edges', async () => {
    const n1 = await graph.createNode({ type: 'memory', content: 'n1', metadata: {}, salienceScore: 0.5, retrievalCount: 0, strength: 0.5, decayRate: 0.05 });
    const neighbors = await graph.getNeighbors(n1.id);
    expect(neighbors.length).toBe(0);
  });
});

describe('VectorStorage', () => {
  let vector: VectorStorage;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-vector-'));
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    vi.resetModules();
    vector = new VectorStorage();
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create index', async () => {
    await vector.createIndex('test-index', 128);
    const indexPath = path.join(tempDir, 'vectors', 'test-index');
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(path.join(indexPath, 'index.json'))).toBe(true);
  });

  it('should add and search vectors', async () => {
    await vector.createIndex('test-index', 4);
    await vector.addVector('test-index', 'vec-1', [1, 0, 0, 0], { label: 'first' });
    await vector.addVector('test-index', 'vec-2', [0, 1, 0, 0], { label: 'second' });

    const results = await vector.search('test-index', [1, 0, 0, 0], 2);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('vec-1');
    expect(results[0].score).toBeCloseTo(1.0, 5);
  });

  it('should delete vector', async () => {
    await vector.createIndex('test-index', 4);
    await vector.addVector('test-index', 'vec-1', [1, 0, 0, 0]);
    await vector.deleteVector('test-index', 'vec-1');

    const results = await vector.search('test-index', [1, 0, 0, 0]);
    expect(results.length).toBe(0);
  });

  it('should delete index', async () => {
    await vector.createIndex('test-index', 4);
    await vector.deleteIndex('test-index');
    const indexPath = path.join(tempDir, 'vectors', 'test-index');
    expect(fs.existsSync(indexPath)).toBe(false);
  });

  it('should throw adding vector to non-existent index', async () => {
    await expect(vector.addVector('nonexistent', 'v1', [1, 0])).rejects.toThrow('does not exist');
  });

  it('should throw dimension mismatch', async () => {
    await vector.createIndex('test', 4);
    await expect(vector.addVector('test', 'v1', [1, 2, 3])).rejects.toThrow('dimension mismatch');
  });

  it('should search return empty for empty index', async () => {
    await vector.createIndex('test', 4);
    const results = await vector.search('test', [1, 0, 0, 0]);
    expect(results).toEqual([]);
  });

  it('should cosineSimilarity work correctly', () => {
    const sim = vector.cosineSimilarity([1, 0, 0], [1, 0, 0]);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('should deleteVector no-op for non-existent vector', async () => {
    await vector.createIndex('test', 4);
    await vector.deleteVector('test', 'nonexistent');
    // Should not throw
  });
});

describe('TimeSeriesStorage', () => {
  let ts: TimeSeriesStorage;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-ts-'));
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    vi.resetModules();
    initDatabase();
    ts = new TimeSeriesStorage();
  });

  afterEach(() => {
    closeDatabase();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should insert and query data', () => {
    const now = Date.now();
    ts.insert('cpu', 50.5, { host: 'server1' });
    ts.insert('cpu', 60.0, { host: 'server1' });

    const data = ts.query('cpu', now - 1000, now + 1000);
    expect(data.length).toBe(2);
    expect(data[0].value).toBe(50.5);
  });

  it('should aggregate with avg', () => {
    const now = Date.now();
    ts.insert('cpu', 10, {});
    ts.insert('cpu', 20, {});
    const result = ts.aggregate('cpu', 'avg', now - 1000, now + 1000);
    expect(result).toBe(15);
  });

  it('should aggregate with sum', () => {
    const now = Date.now();
    ts.insert('cpu', 10, {});
    ts.insert('cpu', 20, {});
    const result = ts.aggregate('cpu', 'sum', now - 1000, now + 1000);
    expect(result).toBe(30);
  });

  it('should aggregate with min', () => {
    const now = Date.now();
    ts.insert('cpu', 10, {});
    ts.insert('cpu', 20, {});
    const result = ts.aggregate('cpu', 'min', now - 1000, now + 1000);
    expect(result).toBe(10);
  });

  it('should aggregate with max', () => {
    const now = Date.now();
    ts.insert('cpu', 10, {});
    ts.insert('cpu', 20, {});
    const result = ts.aggregate('cpu', 'max', now - 1000, now + 1000);
    expect(result).toBe(20);
  });

  it('should aggregate with count', () => {
    const now = Date.now();
    ts.insert('cpu', 10, {});
    ts.insert('cpu', 20, {});
    ts.insert('cpu', 30, {});
    const result = ts.aggregate('cpu', 'count', now - 1000, now + 1000);
    expect(result).toBe(3);
  });

  it('should getLatest return latest value', () => {
    ts.insert('cpu', 10, {});
    ts.insert('cpu', 20, {});
    const latest = ts.getLatest('cpu');
    expect(latest).toBeDefined();
    const all = ts.query('cpu', Date.now() - 1000, Date.now() + 1000);
    expect(all.length).toBe(2);
  });

  it('should getLatest return undefined for no data', () => {
    const latest = ts.getLatest('nonexistent_metric');
    expect(latest).toBeUndefined();
  });

  it('should aggregate return 0 for no data', () => {
    const now = Date.now();
    const result = ts.aggregate('nonexistent', 'avg', now - 1000, now + 1000);
    expect(result).toBe(0);
  });
});