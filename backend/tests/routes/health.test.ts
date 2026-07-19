import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-health-${Date.now()}`);
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

describe('Health API', () => {
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

  it('GET /api/health returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/health includes version', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.version).toBeDefined();
    expect(res.body.version).toBe('3.0.0');
  });

  it('GET /api/health includes uptime', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.uptime).toBeDefined();
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThan(0);
  });

  it('GET /api/health includes timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.timestamp).toBeDefined();
    expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
  });

  it('GET /api/health returns valid JSON', async () => {
    const res = await request(app).get('/api/health');
    expect(res.type).toMatch(/json/);
    expect(res.body).toBeInstanceOf(Object);
  });

  it('GET /api/health returns consistent status', async () => {
    const res1 = await request(app).get('/api/health');
    const res2 = await request(app).get('/api/health');
    expect(res1.body.status).toBe(res2.body.status);
    expect(res1.body.version).toBe(res2.body.version);
  });

  it('GET /api/health uptime increases between calls', async () => {
    const res1 = await request(app).get('/api/health');
    // Small delay to ensure uptime difference
    await new Promise(resolve => setTimeout(resolve, 100));
    const res2 = await request(app).get('/api/health');
    expect(res2.body.uptime).toBeGreaterThanOrEqual(res1.body.uptime);
  });

  it('POST /api/health returns 404 (no POST endpoint)', async () => {
    const res = await request(app).post('/api/health');
    // Express returns 404 for unknown method on a GET-only route
    expect(res.status).toBe(404);
  });

  it('GET /api/health returns 200 on multiple concurrent requests', async () => {
    const results = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/health'),
      request(app).get('/api/health'),
    ]);
    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    }
  });
});