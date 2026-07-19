import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
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

describe('Stats API Routes', () => {
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
  // GET /api/system
  // ============================================================

  it('GET /api/system returns system stats', async () => {
    const res = await request(app).get('/api/system');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('system');
    expect(res.body).toHaveProperty('models');
    expect(res.body).toHaveProperty('tokenMatrix');
    expect(res.body).toHaveProperty('rateLimits');
    expect(res.body).toHaveProperty('storage');
  });

  it('GET /api/system includes system memory info', async () => {
    const res = await request(app).get('/api/system');
    expect(res.body.system).toHaveProperty('memory');
    expect(res.body.system.memory).toHaveProperty('heapUsed');
    expect(res.body.system.memory).toHaveProperty('heapTotal');
    expect(res.body.system.memory).toHaveProperty('rss');
  });

  it('GET /api/system includes rate limit info', async () => {
    const res = await request(app).get('/api/system');
    expect(res.body.rateLimits).toHaveProperty('daily');
    expect(res.body.rateLimits).toHaveProperty('weekly');
    expect(res.body.rateLimits).toHaveProperty('monthly');
    expect(res.body.rateLimits).toHaveProperty('used');
    expect(res.body.rateLimits).toHaveProperty('dailyRemaining');
  });

  it('GET /api/system includes storage info', async () => {
    const res = await request(app).get('/api/system');
    expect(res.body.storage).toHaveProperty('memoryNodes');
    expect(res.body.storage).toHaveProperty('conversations');
    expect(res.body.storage).toHaveProperty('relationalDb');
  });

  it('GET /api/system includes token matrix', async () => {
    const res = await request(app).get('/api/system');
    expect(Array.isArray(res.body.tokenMatrix)).toBe(true);
    expect(res.body.tokenMatrix.length).toBeGreaterThan(0);
    expect(res.body.tokenMatrix[0]).toHaveProperty('date');
    expect(res.body.tokenMatrix[0]).toHaveProperty('tokens');
  });

  it('GET /api/system includes node version and platform', async () => {
    const res = await request(app).get('/api/system');
    expect(res.body.system).toHaveProperty('nodeVersion');
    expect(res.body.system).toHaveProperty('platform');
    expect(res.body.system.nodeVersion).toBe(process.version);
  });

  it('GET /api/system includes uptime', async () => {
    const res = await request(app).get('/api/system');
    expect(res.body.system).toHaveProperty('uptime');
    expect(typeof res.body.system.uptime).toBe('number');
    expect(res.body.system.uptime).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/system models array is valid', async () => {
    const res = await request(app).get('/api/system');
    expect(Array.isArray(res.body.models)).toBe(true);
  });

  it('GET /api/system returns consistent structure across calls', async () => {
    const res1 = await request(app).get('/api/system');
    const res2 = await request(app).get('/api/system');
    expect(Object.keys(res1.body)).toEqual(Object.keys(res2.body));
  });

  it('GET /api/system dailyRemaining is non-negative', async () => {
    const res = await request(app).get('/api/system');
    expect(res.body.rateLimits.dailyRemaining).toBeGreaterThanOrEqual(0);
    expect(res.body.rateLimits.weeklyRemaining).toBeGreaterThanOrEqual(0);
    expect(res.body.rateLimits.monthlyRemaining).toBeGreaterThanOrEqual(0);
  });
});