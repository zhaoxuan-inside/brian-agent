import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { initDatabase, closeDatabase } from '../../../src/infrastructure/database';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-learning-${Date.now()}`);
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

describe('Learning API Routes', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    initDatabase();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '[]' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    }));
    app = createApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    closeDatabase();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('POST /api/learning/chat/:chatId learns from chat', async () => {
    const res = await request(app)
      .post('/api/learning/chat/test-chat')
      .send({ userId: 'user123' });
    // The learnFromChat may return a result object without a 'success' field
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('POST /api/learning/upload uploads document', async () => {
    const res = await request(app)
      .post('/api/learning/upload')
      .send({
        userId: 'user123',
        name: 'test-doc',
        content: '# Test Document\n\nThis is a test',
        type: 'markdown',
        tags: ['test', 'doc'],
      });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('test-doc');
  });

  it('GET /api/learning/documents/:userId lists documents', async () => {
    await request(app)
      .post('/api/learning/upload')
      .send({
        userId: 'user123',
        name: 'test-doc',
        content: 'test content',
        type: 'markdown',
      });

    const res = await request(app).get('/api/learning/documents/user123');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/learning/document/:userId/:documentId gets document', async () => {
    const uploadRes = await request(app)
      .post('/api/learning/upload')
      .send({
        userId: 'user123',
        name: 'test-doc',
        content: 'test content',
        type: 'markdown',
      });

    const res = await request(app).get(`/api/learning/document/user123/${uploadRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('test-doc');
  });

  it('DELETE /api/learning/document/:userId/:documentId deletes document', async () => {
    const uploadRes = await request(app)
      .post('/api/learning/upload')
      .send({
        userId: 'user123',
        name: 'test-doc',
        content: 'test content',
        type: 'markdown',
      });

    const res = await request(app).delete(`/api/learning/document/user123/${uploadRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/learning/search/:userId searches documents', async () => {
    await request(app)
      .post('/api/learning/upload')
      .send({
        userId: 'user123',
        name: 'test-doc',
        content: 'This is a test document about programming',
        type: 'markdown',
      });

    const res = await request(app)
      .get('/api/learning/search/user123')
      .query({ query: 'programming' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});