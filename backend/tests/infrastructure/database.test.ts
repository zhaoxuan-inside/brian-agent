import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Database', () => {
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-db-'));
    originalEnv = { ...process.env };
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    fs.mkdirSync(process.env.BRIAN_LOG_DIR!, { recursive: true });
  });

  afterEach(async () => {
    // Close any open database
    try {
      const { closeDatabase } = await import('../../src/infrastructure/database');
      closeDatabase();
    } catch { /* ignore */ }

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

  async function initDb() {
    vi.resetModules();
    const { initDatabase } = await import('../../src/infrastructure/database');
    return initDatabase();
  }

  async function getDb() {
    const { getDatabase } = await import('../../src/infrastructure/database');
    return getDatabase();
  }

  it('should create the database file', async () => {
    await initDb();
    const dbPath = path.join(tempDir, 'brian.db');
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('should return the same instance from getDatabase', async () => {
    const db = await initDb();
    const db2 = await getDb();
    expect(db).toBe(db2);
  });

  it('should enable WAL mode', async () => {
    const db = await initDb();
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe('wal');
  });

  it('should enable foreign keys', async () => {
    const db = await initDb();
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
  });

  const expectedTables = [
    'conversations', 'messages', 'memory_nodes', 'memory_edges',
    'agent_chains', 'call_history', 'user_preferences', 'time_series_data',
    'feedback', 'skills', 'custom_agents', 'mcp_installed',
    'library_paths', 'agent_library', 'user_messages', 'memory_ratio_config',
    'documents', 'model_config', 'cache', 'provider_configs', 'provider_models',
    'user_models', 'souls', 'works', 'call_traces', 'graph_nodes', 'graph_edges',
    'graph_activation_events', 'vector_embeddings', 'queue_messages', 'user_profiles',
  ];

  it('should create all tables', async () => {
    const db = await initDb();
    
    const foundTables: string[] = [];
    for (const table of expectedTables) {
      const columns = db.prepare(`PRAGMA table_info('${table}')`).all();
      if (columns.length > 0) {
        foundTables.push(table);
      }
    }
    
    expect(foundTables.length).toBeGreaterThanOrEqual(expectedTables.length);
    for (const expected of expectedTables) {
      expect(foundTables).toContain(expected);
    }
  });

  it('should have conversations table with correct columns', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('conversations')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('user_id');
    expect(colNames).toContain('title');
    expect(colNames).toContain('messages');
    expect(colNames).toContain('agent_chain');
    expect(colNames).toContain('summary');
    expect(colNames).toContain('status');
    expect(colNames).toContain('metadata');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
  });

  it('should have messages table with correct columns', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('messages')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('conversation_id');
    expect(colNames).toContain('role');
    expect(colNames).toContain('content');
    expect(colNames).toContain('agent_id');
    expect(colNames).toContain('feedback_rating');
    expect(colNames).toContain('tokens_used');
    expect(colNames).toContain('latency_ms');
    expect(colNames).toContain('created_at');
  });

  it('should have memory_nodes table with correct columns', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('memory_nodes')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('user_id');
    expect(colNames).toContain('content');
    expect(colNames).toContain('type');
    expect(colNames).toContain('source');
    expect(colNames).toContain('tags');
    expect(colNames).toContain('confidence');
    expect(colNames).toContain('importance');
    expect(colNames).toContain('embedding');
    expect(colNames).toContain('metadata');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
    expect(colNames).toContain('accessed_at');
    expect(colNames).toContain('access_count');
    expect(colNames).toContain('is_learning_memory');
    expect(colNames).toContain('related_node_ids');
  });

  it('should have memory_edges table with correct columns', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('memory_edges')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('source_node_id');
    expect(colNames).toContain('target_node_id');
    expect(colNames).toContain('weight');
    expect(colNames).toContain('label');
    expect(colNames).toContain('activation_count');
    expect(colNames).toContain('direction');
  });

  it('should have agent_chains table', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('agent_chains')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('conversation_id');
    expect(colNames).toContain('root_agent_id');
    expect(colNames).toContain('agents');
  });

  it('should have call_history table', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('call_history')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('provider_id');
    expect(colNames).toContain('model_id');
    expect(colNames).toContain('tokens');
    expect(colNames).toContain('latency_ms');
    expect(colNames).toContain('success');
    expect(colNames).toContain('timestamp');
  });

  it('should have user_preferences table', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('user_preferences')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('user_id');
    expect(colNames).toContain('category');
    expect(colNames).toContain('key');
    expect(colNames).toContain('value');
    expect(colNames).toContain('confidence');
  });

  it('should have time_series_data table', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('time_series_data')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('metric');
    expect(colNames).toContain('value');
    expect(colNames).toContain('timestamp');
    expect(colNames).toContain('tags');
  });

  it('should have feedback table', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('feedback')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('message_id');
    expect(colNames).toContain('conversation_id');
    expect(colNames).toContain('user_id');
    expect(colNames).toContain('rating');
    expect(colNames).toContain('status');
  });

  it('should have skills table', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('skills')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('description');
    expect(colNames).toContain('mode');
    expect(colNames).toContain('enabled');
  });

  it('should have custom_agents table', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('custom_agents')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('role');
    expect(colNames).toContain('description');
    expect(colNames).toContain('strategy');
    expect(colNames).toContain('active');
  });

  it('should have mcp_installed table', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('mcp_installed')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('package_name');
    expect(colNames).toContain('display_name');
    expect(colNames).toContain('version');
    expect(colNames).toContain('tools');
    expect(colNames).toContain('server_status');
  });

  it('should have library_paths table', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('library_paths')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('path');
    expect(colNames).toContain('category');
    expect(colNames).toContain('active');
  });

  it('should have agent_library table', async () => {
    const db = await initDb();
    const columns = db.prepare("PRAGMA table_info('agent_library')").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('task_features');
    expect(colNames).toContain('strategy');
    expect(colNames).toContain('llm_config');
    expect(colNames).toContain('prompt');
    expect(colNames).toContain('strength');
    expect(colNames).toContain('use_count');
    expect(colNames).toContain('reliability');
  });

  it('should close database and allow re-init', async () => {
    const { initDatabase, closeDatabase, getDatabase } = await import('../../src/infrastructure/database');
    const db1 = initDatabase();
    expect(db1.open).toBe(true);
    closeDatabase();
    // After close, getDatabase should re-init
    const db2 = getDatabase();
    expect(db2).toBeDefined();
    expect(db2.open).toBe(true);
    closeDatabase();
  });

  it('should closeDatabase set instance to null', async () => {
    const { initDatabase, closeDatabase } = await import('../../src/infrastructure/database');
    initDatabase();
    closeDatabase();
    // After close, getDatabase creates a new instance
    const { getDatabase } = await import('../../src/infrastructure/database');
    const db = getDatabase();
    expect(db.open).toBe(true);
    closeDatabase();
  });

  it('should handle initDatabase being called twice', async () => {
    const { initDatabase } = await import('../../src/infrastructure/database');
    const db1 = initDatabase();
    const db2 = initDatabase();
    expect(db1).toBe(db2);
  });

  it('should have conversations status constraint', async () => {
    const db = await initDb();
    // Verify status has CHECK constraint by trying invalid insert
    expect(() => {
      db.prepare(
        `INSERT INTO conversations (id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
      ).run('test-id', 'user1', 'invalid_status', Date.now(), Date.now());
    }).toThrow();
  });
});