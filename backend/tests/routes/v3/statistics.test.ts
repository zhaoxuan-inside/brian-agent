import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-stats-${Date.now()}`);
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

describe('Statistics API Routes', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
    app = createApp();
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /api/analytics/token-usage returns token stats', async () => {
    const res = await request(app).get('/api/analytics/token-usage');
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('GET /api/analytics/token-usage/:userId returns user token stats', async () => {
    const res = await request(app).get('/api/analytics/token-usage/user123');
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('GET /api/analytics/memory-stats returns memory stats', async () => {
    const res = await request(app)
      .get('/api/analytics/memory-stats')
      .query({ userId: 'user123' });
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('GET /api/analytics/message-stats returns message stats', async () => {
    const res = await request(app)
      .get('/api/analytics/message-stats')
      .query({ userId: 'user123' });
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('GET /api/analytics/summary returns summary stats', async () => {
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(200);
    expect(res.body.tokenUsage).toBeDefined();
    expect(res.body.memoryStats).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });
});