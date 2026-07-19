import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
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

  // ============================================================
  // POST /api/feedback
  // ============================================================

  it('POST /api/feedback with rating creates feedback', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({
        messageId: 'msg-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        rating: 'positive',
        comment: 'Very helpful',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('id');
  });

  it('POST /api/feedback with errorInfo creates error feedback', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({
        messageId: 'msg-2',
        conversationId: 'conv-2',
        userId: 'user-1',
        rating: 'negative',
        comment: 'It crashed',
        errorInfo: 'Request timed out',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('id');
  });

  it('POST /api/feedback with neutral rating', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({
        messageId: 'msg-3',
        conversationId: 'conv-3',
        userId: 'user-1',
        rating: 'neutral',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('id');
  });

  it('POST /api/feedback with missing rating returns 400', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({
        messageId: 'msg-4',
        conversationId: 'conv-4',
        userId: 'user-1',
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/feedback with invalid rating returns 400', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({
        messageId: 'msg-5',
        conversationId: 'conv-5',
        userId: 'user-1',
        rating: 'invalid',
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/feedback with missing messageId returns 400', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({
        conversationId: 'conv-6',
        userId: 'user-1',
        rating: 'positive',
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // ============================================================
  // GET /api/feedback/:id
  // ============================================================

  it('GET /api/feedback/:id returns feedback detail', async () => {
    const createRes = await request(app)
      .post('/api/feedback')
      .send({
        messageId: 'msg-7',
        conversationId: 'conv-7',
        userId: 'user-1',
        rating: 'positive',
        comment: 'Great job',
      });
    const res = await request(app).get(`/api/feedback/${createRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.messageId).toBe('msg-7');
    expect(res.body.rating).toBe('positive');
  });

  it('GET /api/feedback/:id for non-existent returns 404', async () => {
    const res = await request(app).get('/api/feedback/nonexistent-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Feedback not found');
  });

  // ============================================================
  // GET /api/feedback
  // ============================================================

  it('GET /api/feedback returns list', async () => {
    const res = await request(app).get('/api/feedback');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/feedback?status=pending filters', async () => {
    const res = await request(app)
      .get('/api/feedback')
      .query({ status: 'pending' });
    expect(res.status).toBe(200);
    for (const fb of res.body) {
      expect(fb.status).toBe('pending');
    }
  });

  it('GET /api/feedback?userId= filters', async () => {
    const res = await request(app)
      .get('/api/feedback')
      .query({ userId: 'user-1' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ============================================================
  // PUT /api/feedback/:id/status
  // ============================================================

  it('PUT /api/feedback/:id/status updates status', async () => {
    const createRes = await request(app)
      .post('/api/feedback')
      .send({
        messageId: 'msg-8',
        conversationId: 'conv-8',
        userId: 'user-1',
        rating: 'positive',
      });
    const res = await request(app)
      .put(`/api/feedback/${createRes.body.id}/status`)
      .send({ status: 'reviewed' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PUT /api/feedback/:id/status with invalid status returns 400', async () => {
    const createRes = await request(app)
      .post('/api/feedback')
      .send({
        messageId: 'msg-9',
        conversationId: 'conv-9',
        userId: 'user-1',
        rating: 'positive',
      });
    const res = await request(app)
      .put(`/api/feedback/${createRes.body.id}/status`)
      .send({ status: 'invalid_status' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid status');
  });

  // ============================================================
  // GET /api/feedback/stats
  // ============================================================

  it('GET /api/feedback/stats returns statistics', async () => {
    const res = await request(app).get('/api/feedback/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('positive');
    expect(res.body).toHaveProperty('negative');
    expect(res.body).toHaveProperty('neutral');
  });

  it('GET /api/feedback/stats includes distribution', async () => {
    // Create some feedback first
    await request(app)
      .post('/api/feedback')
      .send({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'positive' });
    await request(app)
      .post('/api/feedback')
      .send({ messageId: 'm2', conversationId: 'c2', userId: 'u2', rating: 'negative', comment: 'bad' });

    const res = await request(app).get('/api/feedback/stats');
    expect(res.status).toBe(200);
    expect(res.body.positive).toBeGreaterThanOrEqual(1);
    expect(res.body.negative).toBeGreaterThanOrEqual(1);
  });
});