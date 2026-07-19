import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-profile-${Date.now()}`);
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

describe('Profile API Routes', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
    app = createApp();
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /api/profile/:userId returns profile', async () => {
    const res = await request(app).get('/api/profile/user123');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user123');
    expect(res.body.createdAt).toBeDefined();
  });

  it('PUT /api/profile/:userId updates profile', async () => {
    const res = await request(app)
      .put('/api/profile/user123')
      .send({ name: 'Test User' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test User');
  });

  it('GET /api/profile/:userId/interests returns interests', async () => {
    const res = await request(app).get('/api/profile/user123/interests');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/profile/:userId/tags adds tag', async () => {
    const res = await request(app)
      .post('/api/profile/user123/tags')
      .send({ tag: 'developer' });
    expect(res.status).toBe(200);
    expect(res.body.tags).toContain('developer');
  });

  it('DELETE /api/profile/:userId/tags/:tag removes tag', async () => {
    await request(app)
      .post('/api/profile/user123/tags')
      .send({ tag: 'developer' });

    const res = await request(app).delete('/api/profile/user123/tags/developer');
    expect(res.status).toBe(200);
    expect(res.body.tags).not.toContain('developer');
  });
});