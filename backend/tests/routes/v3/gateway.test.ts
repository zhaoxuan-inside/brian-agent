import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-gateway-${Date.now()}`);
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

function writeModelConfig(cfgPath: string) {
  const config = {
    selectedProviderId: 'openai',
    selectedModelId: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 4096,
    providers: [{
      id: 'openai', name: 'OpenAI', type: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test-key-for-testing',
      enabled: true,
      models: [{ id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 128000, supportsVision: true, supportsTools: true }],
    }],
    rateLimits: { daily: 100000, weekly: 500000, monthly: 2000000 },
  };
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
}

function seedUserModelConfig(dbPath: string) {
  try {
    const sqlite3 = require('better-sqlite3');
    const db = sqlite3(dbPath);
    const id = require('uuid').v4();
    const now = Date.now();
    db.prepare(`
      INSERT INTO user_model_config (id, user_id, provider_id, provider_name, model_id, model_name, max_tokens, is_default, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'default', 'openai', 'OpenAI', 'gpt-4o-mini', 'GPT-4o Mini', 128000, 1, 'active', now, now);
    db.close();
  } catch { /* Table may not exist yet */ }
}

let app: ReturnType<typeof createApp>;
let tmpDir: string;

describe('Gateway API Routes', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
    writeModelConfig(path.join(tmpDir, 'model-config.json'));
    app = createApp();
    seedUserModelConfig(path.join(tmpDir, 'test.db'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Gateway response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    }));
    app = createApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('POST /api/gateway/message returns 200', async () => {
    const res = await request(app)
      .post('/api/gateway/message')
      .send({ userId: 'user123', message: 'Hello from gateway' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.content).toBeDefined();
  });

  it('GET /api/gateway/health returns 200', async () => {
    const res = await request(app).get('/api/gateway/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});