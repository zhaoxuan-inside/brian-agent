import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { StorageService } from '../../src/core/storage';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-memory-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  process.env.BRIAN_DATA_DIR = tmpDir;
  process.env.BRIAN_DB_PATH = path.join(tmpDir, 'test.db');
  process.env.BRIAN_LOG_DIR = path.join(tmpDir, 'logs');
  process.env.BRIAN_CONFIG_FILE_PATH = path.join(tmpDir, 'model-config.json');
  process.env.BRIAN_GRAPH_DB_PATH = path.join(tmpDir, 'graph');
  process.env.BRIAN_VECTOR_DB_PATH = path.join(tmpDir, 'vectors');
  process.env.BRIAN_LOG_LEVEL = 'error';
  return tmpDir;
}

let app: ReturnType<typeof createApp>;
let tmpDir: string;
let storage: StorageService;

describe('Memory API Routes', () => {
  beforeEach(async () => {
    tmpDir = setupTempDir();
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    initDatabase();
    storage = new StorageService();
    app = createApp();
  });

  afterEach(async () => {
    closeDatabase();
    if (storage) {
      await storage.close();
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /api/memory returns memory list', async () => {
    const res = await request(app).get('/api/memory');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('memories');
    expect(Array.isArray(res.body.memories)).toBe(true);
  });

  it('GET /api/memory with query parameter returns filtered results', async () => {
    const res = await request(app).get('/api/memory');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('memories');
    expect(Array.isArray(res.body.memories)).toBe(true);
  });

  it('GET /api/memory with tag parameter returns tagged memories', async () => {
    const res = await request(app).get('/api/memory');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('memories');
    expect(Array.isArray(res.body.memories)).toBe(true);
  });

  it('GET /api/memory with start and end returns time-range results', async () => {
    const res = await request(app).get('/api/memory');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('memories');
    expect(Array.isArray(res.body.memories)).toBe(true);
  });

  it('GET /api/memory/tags returns tag list', async () => {
    const res = await request(app).get('/api/memory/tags');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tags');
    expect(Array.isArray(res.body.tags)).toBe(true);
  });

  it('GET /api/memory/tag-graph returns graph data', async () => {
    const res = await request(app).get('/api/memory/tag-graph');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('nodes');
    expect(res.body).toHaveProperty('edges');
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);
  });

  it('GET /api/memory/groups returns tag groups', async () => {
    const res = await request(app).get('/api/memory/groups');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('groups');
  });

  it('GET /api/memory/:userId returns user memories', async () => {
    const res = await request(app).get('/api/memory/default-user');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});