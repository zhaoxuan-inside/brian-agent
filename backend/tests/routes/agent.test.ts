import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { StorageService } from '../../src/core/storage';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-agent-${Date.now()}`);
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
let storage: StorageService;

describe('Agent API Routes', () => {
  beforeEach(async () => {
    tmpDir = setupTempDir();
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '{"system":"You are a helpful agent.","instruction":"Task: {{task}}","variables":[{"name":"task","description":"The task","required":true}]}' } }],
        usage: { total_tokens: 10 },
      }),
    }));
    initDatabase();
    storage = new StorageService();
    app = createApp();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    closeDatabase();
    if (storage) {
      await storage.close();
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /api/agent returns agent list', async () => {
    const res = await request(app).get('/api/agent');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agents');
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  it('GET /api/agent?search=xxx filters', async () => {
    const res = await request(app)
      .get('/api/agent')
      .query({ search: 'code' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  it('GET /api/agent/:id returns agent detail', async () => {
    const createRes = await request(app)
      .post('/api/agent/create')
      .send({
        name: 'Detail Agent',
        role: 'assistant',
        description: 'For detail test',
        strategy: { type: 'react', maxIterations: 10, stopConditions: [] },
        llm: {},
        prompt: { system: 'You are helpful', instruction: '', variables: [] },
        skills: [],
        mcpEndpoints: [],
        soul: {},
        sources: { knowledgeBase: [], webSearch: false },
      });
    const res = await request(app).get(`/api/agent/${createRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Detail Agent');
  });

  it('GET /api/agent/:id for non-existent returns 404', async () => {
    const res = await request(app).get('/api/agent/nonexistent-id');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('POST /api/agent/create with valid data creates agent', async () => {
    const res = await request(app)
      .post('/api/agent/create')
      .send({
        name: 'Test Agent',
        role: 'coder',
        description: 'A test agent for coding',
        strategy: { type: 'react', maxIterations: 10, stopConditions: [] },
        llm: { providerId: 'openai', modelId: 'gpt-4o' },
        prompt: { system: 'You are a coder', instruction: 'Write code', variables: [] },
        skills: [],
        mcpEndpoints: [],
        soul: { style: 'technical' },
        sources: { knowledgeBase: [], webSearch: false },
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Agent');
    expect(res.body.role).toBe('coder');
    expect(res.body.active).toBe(true);
  });

  it('POST /api/agent/create with missing name returns 400', async () => {
    const res = await request(app)
      .post('/api/agent/create')
      .send({
        role: 'coder',
        description: 'Missing name',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/agent/create with missing role returns 400', async () => {
    const res = await request(app)
      .post('/api/agent/create')
      .send({
        name: 'No Role',
        description: 'Missing role',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/agent/create with missing description returns 400', async () => {
    const res = await request(app)
      .post('/api/agent/create')
      .send({
        name: 'No Desc',
        role: 'coder',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/agent/create with invalid strategy fails validation', async () => {
    const res = await request(app)
      .post('/api/agent/create')
      .send({
        name: 'Bad Strategy',
        role: 'coder',
        description: 'Invalid strategy',
        strategy: { type: 'invalid-strategy' },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('PUT /api/agent/:id updates agent', async () => {
    const createRes = await request(app)
      .post('/api/agent/create')
      .send({
        name: 'Update Me',
        role: 'assistant',
        description: 'Before update',
        strategy: { type: 'react', maxIterations: 10, stopConditions: [] },
        llm: {},
        prompt: { system: 'sys', instruction: '', variables: [] },
        skills: [],
        mcpEndpoints: [],
        soul: {},
        sources: { knowledgeBase: [], webSearch: false },
      });
    const res = await request(app)
      .put(`/api/agent/${createRes.body.id}`)
      .send({ name: 'Updated Agent', role: 'developer' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Agent');
    expect(res.body.role).toBe('developer');
  });

  it('DELETE /api/agent/:id deletes agent', async () => {
    const createRes = await request(app)
      .post('/api/agent/create')
      .send({
        name: 'Delete Me',
        role: 'assistant',
        description: 'To be deleted',
        strategy: { type: 'react', maxIterations: 10, stopConditions: [] },
        llm: {},
        prompt: { system: 'sys', instruction: '', variables: [] },
        skills: [],
        mcpEndpoints: [],
        soul: {},
        sources: { knowledgeBase: [], webSearch: false },
      });
    const res = await request(app).delete(`/api/agent/${createRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/agent/:id/toggle toggles active', async () => {
    const createRes = await request(app)
      .post('/api/agent/create')
      .send({
        name: 'Toggle Me',
        role: 'assistant',
        description: 'Toggle test',
        strategy: { type: 'react', maxIterations: 10, stopConditions: [] },
        llm: {},
        prompt: { system: 'sys', instruction: '', variables: [] },
        skills: [],
        mcpEndpoints: [],
        soul: {},
        sources: { knowledgeBase: [], webSearch: false },
      });
    const res = await request(app).post(`/api/agent/${createRes.body.id}/toggle`);
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it('POST /api/agent/generate-prompt returns generated prompt', async () => {
    const res = await request(app)
      .post('/api/agent/generate-prompt')
      .send({ purpose: 'code review assistant' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('system');
    expect(res.body).toHaveProperty('instruction');
    expect(res.body).toHaveProperty('variables');
  });

  it('POST /api/agent/generate-prompt with missing purpose returns 400', async () => {
    const res = await request(app)
      .post('/api/agent/generate-prompt')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/agent/generate-soul returns generated soul', async () => {
    const res = await request(app)
      .post('/api/agent/generate-soul')
      .send({ purpose: 'customer support bot' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('style');
    expect(res.body).toHaveProperty('personality');
    expect(res.body).toHaveProperty('contentRules');
    expect(res.body).toHaveProperty('constraints');
    expect(res.body).toHaveProperty('temperatureProfile');
  });

  it('POST /api/agent/generate-soul with missing purpose returns 400', async () => {
    const res = await request(app)
      .post('/api/agent/generate-soul')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/agent/suggest-skills returns suggestions', async () => {
    const res = await request(app)
      .post('/api/agent/suggest-skills')
      .send({ purpose: 'code review' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('skills');
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.skills)).toBe(true);
  });

  it('POST /api/agent/suggest-skills with missing purpose returns 400', async () => {
    const res = await request(app)
      .post('/api/agent/suggest-skills')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/agent/suggest-mcps returns suggestions', async () => {
    const res = await request(app)
      .post('/api/agent/suggest-mcps')
      .send({ purpose: 'web scraping' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mcps');
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.mcps)).toBe(true);
  });

  it('POST /api/agent/suggest-mcps with missing purpose returns 400', async () => {
    const res = await request(app)
      .post('/api/agent/suggest-mcps')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/agent/models returns available models', async () => {
    const res = await request(app).get('/api/agent/models');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('providers');
    expect(Array.isArray(res.body.providers)).toBe(true);
  });
});