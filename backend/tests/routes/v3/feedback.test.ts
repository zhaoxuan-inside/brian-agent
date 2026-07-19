import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { initDatabase, closeDatabase } from '../../../src/infrastructure/database';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-feedback-${Date.now()}`);
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

describe('Feedback API Routes', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    initDatabase();
    app = createApp();
  });

  afterEach(() => {
    closeDatabase();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('POST /api/feedback creates feedback', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({
        userId: 'user123',
        messageId: 'msg123',
        rating: 'positive',
        comment: 'Great response!',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/feedback with invalid rating returns 400', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({
        userId: 'user123',
        messageId: 'msg123',
        rating: 'invalid',
      });
    expect(res.status).toBe(400);
  });

  it('GET /api/feedback returns all feedback', async () => {
    await request(app)
      .post('/api/feedback')
      .send({ userId: 'user123', messageId: 'msg123', rating: 'positive' });

    const res = await request(app).get('/api/feedback');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/feedback filtered by userId', async () => {
    await request(app)
      .post('/api/feedback')
      .send({ userId: 'user123', messageId: 'msg123', rating: 'positive' });
    await request(app)
      .post('/api/feedback')
      .send({ userId: 'user456', messageId: 'msg456', rating: 'negative' });

    const res = await request(app).get('/api/feedback').query({ userId: 'user123' });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].userId).toBe('user123');
  });

  it('GET /api/feedback/:id returns single feedback', async () => {
    const createRes = await request(app)
      .post('/api/feedback')
      .send({ userId: 'user123', messageId: 'msg123', rating: 'positive' });

    const res = await request(app).get(`/api/feedback/${createRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user123');
  });

  it('GET /api/feedback/stats returns stats', async () => {
    await request(app)
      .post('/api/feedback')
      .send({ userId: 'user123', messageId: 'msg123', rating: 'positive' });
    await request(app)
      .post('/api/feedback')
      .send({ userId: 'user456', messageId: 'msg456', rating: 'negative' });
    await request(app)
      .post('/api/feedback')
      .send({ userId: 'user789', messageId: 'msg789', rating: 'neutral' });

    const res = await request(app).get('/api/feedback/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.positive).toBe(1);
    expect(res.body.negative).toBe(1);
    expect(res.body.neutral).toBe(1);
  });
});