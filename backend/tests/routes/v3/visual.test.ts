import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-visual-${Date.now()}`);
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

describe('Visual API Routes', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
    app = createApp();
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /api/visual/memory-graph/:userId returns memory graph', async () => {
    const res = await request(app).get('/api/visual/memory-graph/user123');
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('GET /api/visual/chat-flow/:chatId returns chat flow', async () => {
    const res = await request(app)
      .get('/api/visual/chat-flow/test-chat')
      .query({ userId: 'user123' });
    expect(res.status).toBe(200);
    expect(res.body.chatId).toBe('test-chat');
    expect(res.body.flow).toBeDefined();
  });

  it('GET /api/visual/agent-status returns agent status', async () => {
    const res = await request(app).get('/api/visual/agent-status');
    expect(res.status).toBe(200);
    expect(res.body.agents).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });
});