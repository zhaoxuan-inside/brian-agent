import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
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

describe('Memory API Routes', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
    app = createApp();
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /api/memory/working/:userId/:chatId returns working memory', async () => {
    const res = await request(app)
      .get('/api/memory/working/user123/chat123');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/memory/semantic/:userId returns semantic memory', async () => {
    const res = await request(app)
      .get('/api/memory/semantic/user123')
      .query({ query: 'test' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/memory/episodic/:userId returns episodic memory', async () => {
    const res = await request(app)
      .get('/api/memory/episodic/user123');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/memory/procedural/:userId returns procedural memory', async () => {
    const res = await request(app)
      .get('/api/memory/procedural/user123');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/memory/tag/:userId/:tag returns memory by tag', async () => {
    const res = await request(app)
      .get('/api/memory/tag/user123/test-tag');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/memory/ratio/:userId returns memory ratios', async () => {
    const res = await request(app)
      .get('/api/memory/ratio/user123');
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('PUT /api/memory/ratio/:userId updates memory ratios', async () => {
    const res = await request(app)
      .put('/api/memory/ratio/user123')
      .send({ working: 30, semantic: 25 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/memory/:userId returns all memory', async () => {
    const res = await request(app)
      .get('/api/memory/user123');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});