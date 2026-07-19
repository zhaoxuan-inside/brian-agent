import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-library-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  process.env.BRIAN_DATA_DIR = tmpDir;
  process.env.BRIAN_DB_PATH = path.join(tmpDir, 'test.db');
  process.env.BRIAN_LOG_DIR = path.join(tmpDir, 'logs');
  process.env.BRIAN_CONFIG_FILE_PATH = path.join(tmpDir, 'model-config.json');
  process.env.BRIAN_GRAPH_DB_PATH = path.join(tmpDir, 'graph');
  process.env.BRIAN_VECTOR_DB_PATH = path.join(tmpDir, 'vectors');
  process.env.BRIAN_LOG_LEVEL = 'error';
  process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
  return tmpDir;
}

let app: ReturnType<typeof createApp>;
let tmpDir: string;

describe('Library API Routes', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
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
  // GET /api/library/paths
  // ============================================================

  it('GET /api/library/paths returns path list', async () => {
    const res = await request(app).get('/api/library/paths');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('paths');
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.paths)).toBe(true);
  });

  // ============================================================
  // POST /api/library/paths
  // ============================================================

  it('POST /api/library/paths adds path', async () => {
    const res = await request(app)
      .post('/api/library/paths')
      .send({
        name: 'Test Library',
        path: '/tmp/test-lib',
        category: 'development',
        description: 'A test library path',
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Library');
    expect(res.body.path).toBe('/tmp/test-lib');
    expect(res.body.category).toBe('development');
  });

  it('POST /api/library/paths with missing name returns 400', async () => {
    const res = await request(app)
      .post('/api/library/paths')
      .send({
        path: '/tmp/test',
        category: 'development',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/library/paths with missing path returns 400', async () => {
    const res = await request(app)
      .post('/api/library/paths')
      .send({
        name: 'No Path',
        category: 'development',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/library/paths with missing category returns 400', async () => {
    const res = await request(app)
      .post('/api/library/paths')
      .send({
        name: 'No Category',
        path: '/tmp/test',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/library/paths accepts duplicate paths', async () => {
    await request(app)
      .post('/api/library/paths')
      .send({ name: 'First', path: '/tmp/same-path', category: 'development' });
    const res = await request(app)
      .post('/api/library/paths')
      .send({ name: 'Second', path: '/tmp/same-path', category: 'development' });
    // The route doesn't check for duplicate paths, so it will succeed
    expect(res.status).toBe(201);
  });

  // ============================================================
  // DELETE /api/library/paths/:id
  // ============================================================

  it('DELETE /api/library/paths/:id removes path', async () => {
    const createRes = await request(app)
      .post('/api/library/paths')
      .send({ name: 'Delete Me', path: '/tmp/delete-me', category: 'development' });
    const res = await request(app).delete(`/api/library/paths/${createRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /api/library/paths/:id for non-existent returns 200', async () => {
    // The route uses soft delete (sets active=0), so it doesn't return 404 for non-existent
    const res = await request(app).delete('/api/library/paths/nonexistent-id');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ============================================================
  // POST /api/library/check-path
  // ============================================================

  it('POST /api/library/check-path checks existing path', async () => {
    const tmpTestDir = path.join(tmpDir, 'check-test');
    fs.mkdirSync(tmpTestDir, { recursive: true });
    const res = await request(app)
      .post('/api/library/check-path')
      .send({ path: tmpTestDir });
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.isDirectory).toBe(true);
  });

  it('POST /api/library/check-path for non-existent path returns error', async () => {
    const res = await request(app)
      .post('/api/library/check-path')
      .send({ path: '/nonexistent/path/that/does/not/exist' });
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(false);
  });

  it('POST /api/library/check-path with missing path returns 400', async () => {
    const res = await request(app)
      .post('/api/library/check-path')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});