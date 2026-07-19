import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-config-${Date.now()}`);
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

describe('Config API Routes', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    }));
    initDatabase();
    app = createApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    closeDatabase();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ============================================================
  // GET /api/config
  // ============================================================

  it('GET /api/config returns current config', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('selectedProviderId');
    expect(res.body).toHaveProperty('selectedModelId');
    expect(res.body.providers).toBeDefined();
    expect(Array.isArray(res.body.providers)).toBe(true);
  });

  it('GET /api/config masks API keys', async () => {
    const res = await request(app).get('/api/config');
    for (const provider of res.body.providers) {
      if (provider.apiKey) {
        expect(provider.apiKey).toMatch(/^••••••••/);
      }
    }
  });

  it('GET /api/config returns temperature and maxTokens', async () => {
    const res = await request(app).get('/api/config');
    expect(res.body.temperature).toBeDefined();
    expect(res.body.maxTokens).toBeDefined();
  });

  // ============================================================
  // GET /api/config/defaults
  // ============================================================

  it('GET /api/config/defaults returns rate limit defaults', async () => {
    const res = await request(app).get('/api/config/defaults');
    expect(res.status).toBe(200);
    expect(res.body.dailyTokens).toBeDefined();
    expect(res.body.weeklyTokens).toBeDefined();
    expect(res.body.monthlyTokens).toBeDefined();
    expect(res.body.dailyCalls).toBeDefined();
    expect(res.body.weeklyCalls).toBeDefined();
    expect(res.body.monthlyCalls).toBeDefined();
  });

  // ============================================================
  // PUT /api/config/defaults
  // ============================================================

  it('PUT /api/config/defaults updates rate limit defaults', async () => {
    const res = await request(app)
      .put('/api/config/defaults')
      .send({
        dailyTokens: 200000,
        weeklyTokens: 1000000,
        monthlyTokens: 4000000,
        dailyCalls: 2000,
        weeklyCalls: 10000,
        monthlyCalls: 40000,
      });
    expect(res.status).toBe(200);
    expect(res.body.dailyTokens).toBe(200000);
    expect(res.body.weeklyTokens).toBe(1000000);
    expect(res.body.dailyCalls).toBe(2000);
    expect(res.body.weeklyCalls).toBe(10000);
  });

  it('PUT /api/config/defaults persists and is reflected in GET', async () => {
    await request(app)
      .put('/api/config/defaults')
      .send({ dailyTokens: 99999, dailyCalls: 999 });
    const res = await request(app).get('/api/config/defaults');
    expect(res.status).toBe(200);
    expect(res.body.dailyTokens).toBe(99999);
    expect(res.body.dailyCalls).toBe(999);
  });

  // ============================================================
  // POST /api/config/provider
  // ============================================================

  it('POST /api/config/provider adds new provider', async () => {
    const uniqueId = `test-provider-${Date.now()}`;
    const res = await request(app)
      .post('/api/config/provider')
      .send({
        id: uniqueId,
        name: 'Test Provider',
        type: 'openai-compatible',
        baseUrl: 'https://test.example.com/v1',
        apiKey: 'sk-test-key',
        models: [{ id: 'test-model', name: 'Test Model', maxTokens: 4096 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(uniqueId);
    expect(res.body.name).toBe('Test Provider');
    expect(res.body.apiKey).toMatch(/^••••••••/);
  });

  it('POST /api/config/provider with missing required fields returns 400', async () => {
    const res = await request(app)
      .post('/api/config/provider')
      .send({ name: 'No ID' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/config/provider with duplicate id returns 409', async () => {
    const dupId = `dup-provider-${Date.now()}`;
    await request(app)
      .post('/api/config/provider')
      .send({ id: dupId, name: 'First', type: 'custom' });
    const res = await request(app)
      .post('/api/config/provider')
      .send({ id: dupId, name: 'Second', type: 'custom' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_PROVIDER');
  });

  // ============================================================
  // PUT /api/config/provider/:id
  // ============================================================

  it('PUT /api/config/provider/:id updates provider', async () => {
    const updId = `upd-provider-${Date.now()}`;
    await request(app)
      .post('/api/config/provider')
      .send({ id: updId, name: 'Update Me', type: 'custom' });
    const res = await request(app)
      .put(`/api/config/provider/${updId}`)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
  });

  it('PUT /api/config/provider/:id for non-existent returns 404', async () => {
    const res = await request(app)
      .put('/api/config/provider/nonexistent')
      .send({ name: 'Nope' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  // ============================================================
  // DELETE /api/config/provider/:id
  // ============================================================

  it('DELETE /api/config/provider/:id removes provider', async () => {
    const delId = `del-provider-${Date.now()}`;
    await request(app)
      .post('/api/config/provider')
      .send({ id: delId, name: 'Delete Me', type: 'custom' });
    const res = await request(app)
      .delete(`/api/config/provider/${delId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /api/config/provider/:id for non-existent returns 404', async () => {
    const res = await request(app)
      .delete('/api/config/provider/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  // ============================================================
  // POST /api/config/provider/:id/test
  // ============================================================

  it('POST /api/config/provider/:id/test tests connection', async () => {
    // Mock fetch to return models list for the test endpoint
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 'gpt-4o', object: 'model' }] }),
      text: () => Promise.resolve(''),
    }));
    const res = await request(app)
      .post('/api/config/provider/openai/test');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success');
    expect(res.body).toHaveProperty('message');
  });

  it('POST /api/config/provider/:id/test for non-existent provider returns 404', async () => {
    const res = await request(app)
      .post('/api/config/provider/nonexistent/test');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  // ============================================================
  // POST /api/config/model/batch
  // ============================================================

  it('POST /api/config/model/batch syncs models', async () => {
    const res = await request(app)
      .post('/api/config/model/batch')
      .send({
        providerId: 'openai',
        modelIds: ['gpt-4o-mini'],
        userId: 'test-user',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('added');
    expect(res.body).toHaveProperty('removed');
  });

  it('POST /api/config/model/batch with missing required fields returns 400', async () => {
    const res = await request(app)
      .post('/api/config/model/batch')
      .send({ modelIds: ['gpt-4o'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/config/model/batch with non-existent provider returns 200 with no changes', async () => {
    const res = await request(app)
      .post('/api/config/model/batch')
      .send({ providerId: 'nonexistent', modelIds: ['m'] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ============================================================
  // PUT /api/config/model/:id/default
  // ============================================================

  it('PUT /api/config/model/:id/default sets default model', async () => {
    // First batch save a model, then set it as default
    await request(app)
      .post('/api/config/model/batch')
      .send({ providerId: 'openai', modelIds: ['gpt-4o-mini'], userId: 'test-user' });
    const res = await request(app)
      .put('/api/config/model/gpt-4o-mini/default')
      .send({ userId: 'test-user' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ============================================================
  // DELETE /api/config/model/:id
  // ============================================================

  it('DELETE /api/config/model/:id removes model config', async () => {
    await request(app)
      .post('/api/config/model/batch')
      .send({ providerId: 'openai', modelIds: ['gpt-4o-mini'], userId: 'test-user' });
    const res = await request(app)
      .delete('/api/config/model/gpt-4o-mini');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ============================================================
  // GET /api/config/model/defaults
  // ============================================================

  it('GET /api/config/model/defaults returns model defaults from config service', async () => {
    const res = await request(app).get('/api/config/model/defaults');
    expect(res.status).toBe(200);
    expect(res.body.maxTokens).toBeDefined();
    expect(res.body.temperature).toBeDefined();
    expect(res.body.quotaTokensPerDay).toBeDefined();
    expect(res.body.quotaTokensPerWeek).toBeDefined();
    expect(res.body.quotaTokensPerMonth).toBeDefined();
    expect(res.body.quotaCallsPerDay).toBeDefined();
    expect(res.body.quotaCallsPerWeek).toBeDefined();
    expect(res.body.quotaCallsPerMonth).toBeDefined();
    expect(res.body.contextWindow).toBeDefined();
  });

  it('GET /api/config/model/defaults reflects updated rate limits', async () => {
    // Update rate limits via PUT /defaults
    await request(app)
      .put('/api/config/defaults')
      .send({ dailyTokens: 88888, monthlyTokens: 7777777 });
    // model/defaults should reflect the new values
    const res = await request(app).get('/api/config/model/defaults');
    expect(res.status).toBe(200);
    expect(res.body.quotaTokensPerDay).toBe(88888);
    expect(res.body.quotaTokensPerMonth).toBe(7777777);
  });
});