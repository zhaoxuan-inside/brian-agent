import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, stopTestServer, cleanupE2ETempDirs, type E2ETestContext } from './e2e-server';
import type * as http from 'node:http';

let apiBase: string;
let server: http.Server;
let ctx: E2ETestContext;

beforeAll(async () => {
  const setup = await startTestServer();
  server = setup.server;
  ctx = setup.ctx;
  apiBase = `http://127.0.0.1:${setup.port}`;
}, 60000);

afterAll(async () => {
  await stopTestServer(server);
  cleanupE2ETempDirs();
});

function api(path: string, init?: RequestInit): Promise<any> {
  return fetch(`${apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  }).then(async (res) => {
    const body = res.ok ? await res.json() : null;
    return { status: res.status, ok: res.ok, body };
  });
}

describe('Info Page - Memory Tab (QA Memory) E2E', () => {
  it('TC-INFO-005: should list memory/works', async () => {
    const res = await api('/api/memory/list');
    expect(res.status).toBe(200);
    expect(res.body.memories).toBeTruthy();
    expect(Array.isArray(res.body.memories)).toBe(true);
  });

  it('should search memory by keyword', async () => {
    const res = await api('/api/memory/search?keyword=test&userId=e2e-test-user');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('TC-INFO-050: should get memory stats', async () => {
    const res = await api('/api/memory/stats/e2e-test-user');
    expect(res.status).toBe(200);
    expect(typeof res.body.totalMemories).toBe('number');
    expect(res.body.byType).toBeTruthy();
  });
});

describe('Info Page - Knowledge Base Tab E2E', () => {
  it('TC-INFO-020/021: should list library paths (empty initially)', async () => {
    const res = await api('/api/library/paths');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.paths)).toBe(true);
  });

  it('TC-INFO-026: should add a library path', async () => {
    const res = await api('/api/library/paths', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Knowledge Base',
        path: '/tmp/test-knowledge',
        category: 'documentation',
        description: 'Test KB for E2E',
      }),
    });
    expect(res.status).toBe(200);
    expect(res.body.id || res.body.name).toBeTruthy();
  });

  it('TC-INFO-027: should check library path', async () => {
    const res = await api('/api/library/check-path', {
      method: 'POST',
      body: JSON.stringify({ path: '/tmp/test-path' }),
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.exists).toBe('boolean');
    expect(typeof res.body.isReadable).toBe('boolean');
  });
});

describe('Info Page - Tag Graph Tab E2E', () => {
  it('TC-INFO-039: should get tag graph', async () => {
    const res = await api('/api/memory/tag-graph');
    expect(res.status).toBe(200);
    expect(res.body.nodes !== undefined).toBe(true);
    expect(res.body.edges !== undefined).toBe(true);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);
  });

  it('should get tags list', async () => {
    const res = await api('/api/memory/tags');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tags)).toBe(true);
  });

  it('should get tag-related info', async () => {
    const res = await api('/api/memory/tag/e2e-test-user/test-tag');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Info Page - Keyword Graph Tab E2E', () => {
  it('TC-INFO-050: should get keyword graph', async () => {
    const res = await api('/api/memory/keyword-graph');
    expect(res.status).toBe(200);
    expect(res.body.nodes !== undefined).toBe(true);
    expect(res.body.edges !== undefined).toBe(true);
  });
});

describe('Info Page - Cross-Module Linkage E2E', () => {
  it('should handle deep linking with work_id', async () => {
    const res = await api('/api/memory/list');
    expect(res.status).toBe(200);
  });

  it('should search with type filter', async () => {
    const res = await api('/api/memory/search?userId=e2e-test-user&keyword=test&type=chat&limit=10');
    expect(res.status).toBe(200);
  });
});
