import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { initDatabase, closeDatabase } from '../../../src/infrastructure/database';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-chat-v3-${Date.now()}`);
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
  } catch { /* Table may not exist yet — initDatabase will create it */ }
}

let app: ReturnType<typeof createApp>;
let tmpDir: string;

describe('Chat API v3 Routes', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    writeModelConfig(path.join(tmpDir, 'model-config.json'));
    initDatabase();
    app = createApp();
    seedUserModelConfig(path.join(tmpDir, 'test.db'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Hello! I am Brian.' } }],
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

  it('POST /api/chat/send with valid message returns 200', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .send({ userId: 'user123', message: 'Hello, how are you?' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.chatId).toBeDefined();
    expect(res.body.content).toBeDefined();
    expect(res.body.role).toBe('assistant');
  });

  it('POST /api/chat/send with existing chatId returns same chatId', async () => {
    const chatId = 'test-chat-123';
    const res = await request(app)
      .post('/api/chat/send')
      .send({ userId: 'user123', message: 'Hello', chatId });
    expect(res.status).toBe(200);
    expect(res.body.chatId).toBe(chatId);
  });

  it('POST /api/chat/send without userId returns 400', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .send({ message: 'Hello' });
    expect(res.status).toBe(400);
  });

  it('GET /api/chat/history/:chatId returns messages', async () => {
    const chatId = 'test-chat-history';
    await request(app)
      .post('/api/chat/send')
      .send({ userId: 'user123', message: 'Hello', chatId });
    
    const res = await request(app)
      .get(`/api/chat/history/${chatId}`)
      .query({ userId: 'user123' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it('GET /api/chat/list returns chat list', async () => {
    await request(app)
      .post('/api/chat/send')
      .send({ userId: 'user123', message: 'Hello' });
    
    const res = await request(app)
      .get('/api/chat/list')
      .query({ userId: 'user123' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});