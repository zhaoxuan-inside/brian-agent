import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import os from 'os';
import path from 'path';
import fs from 'fs';

function setupTempDir() {
  const tmpDir = path.join(os.tmpdir(), `brian-test-mcp-${Date.now()}`);
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

describe('MCP API Routes', () => {
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
  // GET /api/mcp/market
  // ============================================================

  it('GET /api/mcp/market returns package list', async () => {
    const res = await request(app).get('/api/mcp/market');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('packages');
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.packages)).toBe(true);
    expect(res.body.packages.length).toBeGreaterThan(0);
  });

  it('GET /api/mcp/market?search=xxx filters results', async () => {
    const res = await request(app)
      .get('/api/mcp/market')
      .query({ search: 'github' });
    expect(res.status).toBe(200);
    expect(res.body.packages.length).toBeGreaterThan(0);
    for (const pkg of res.body.packages) {
      const pkgStr = JSON.stringify(pkg).toLowerCase();
      expect(pkgStr).toContain('github');
    }
  });

  it('GET /api/mcp/market?search=nonexistent returns empty', async () => {
    const res = await request(app)
      .get('/api/mcp/market')
      .query({ search: 'zzzznonexistentpackage' });
    expect(res.status).toBe(200);
    expect(res.body.packages.length).toBe(0);
  });

  it('GET /api/mcp/market?category=xxx filters by category', async () => {
    const res = await request(app)
      .get('/api/mcp/market')
      .query({ category: 'database' });
    expect(res.status).toBe(200);
    for (const pkg of res.body.packages) {
      expect(pkg.category).toBe('database');
    }
  });

  // ============================================================
  // GET /api/mcp/market/:id
  // ============================================================

  it('GET /api/mcp/market/:id returns package detail', async () => {
    const res = await request(app).get('/api/mcp/market/mcp-github');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('mcp-github');
    expect(res.body.name).toBe('GitHub');
    expect(res.body).toHaveProperty('tools');
  });

  it('GET /api/mcp/market/:id for non-existent returns 404', async () => {
    const res = await request(app).get('/api/mcp/market/nonexistent-pkg');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  // ============================================================
  // POST /api/mcp/market/:id install
  // ============================================================

  it('POST /api/mcp/market/:id installs package', async () => {
    const res = await request(app)
      .post('/api/mcp/market/mcp-filesystem');
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('POST /api/mcp/market/:id for non-existent returns 404', async () => {
    const res = await request(app)
      .post('/api/mcp/market/nonexistent-pkg');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  // ============================================================
  // DELETE /api/mcp/market/:id uninstall
  // ============================================================

  it('DELETE /api/mcp/market/:id uninstalls package', async () => {
    await request(app).post('/api/mcp/market/mcp-fetch');
    const res = await request(app).delete('/api/mcp/market/mcp-fetch');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /api/mcp/market/:id for non-existent also succeeds', async () => {
    const res = await request(app).delete('/api/mcp/market/nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ============================================================
  // POST /api/mcp/market/sync
  // ============================================================

  it('POST /api/mcp/market/sync syncs market', async () => {
    const res = await request(app).post('/api/mcp/market/sync');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('synced');
  });

  // ============================================================
  // GET /api/mcp/installed
  // ============================================================

  it('GET /api/mcp/installed returns installed list', async () => {
    const res = await request(app).get('/api/mcp/installed');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('installed');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pageSize');
    expect(Array.isArray(res.body.installed)).toBe(true);
  });

  it('GET /api/mcp/installed reflects installed packages', async () => {
    // Install a package first
    await request(app).post('/api/mcp/market/mcp-brave-search');
    const res = await request(app).get('/api/mcp/installed');
    expect(res.status).toBe(200);
    const installed = res.body.installed;
    const pkgs = installed.map((i: any) => i.packageName);
    expect(pkgs).toContain('@modelcontextprotocol/server-brave-search');
  });
});