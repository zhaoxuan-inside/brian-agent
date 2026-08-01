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

describe('Learning Page - Control E2E', () => {
  it('TC-LEARN-001/003: should start learning', async () => {
    const res = await api('/api/learning/start', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('TC-LEARN-002: should stop learning', async () => {
    const res = await api('/api/learning/stop', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('start → stop → start sequence', async () => {
    const start = await api('/api/learning/start', { method: 'POST' });
    expect(start.status).toBe(200);
    expect(start.body.success).toBe(true);

    const stop = await api('/api/learning/stop', { method: 'POST' });
    expect(stop.status).toBe(200);
    expect(stop.body.success).toBe(true);

    const startAgain = await api('/api/learning/start', { method: 'POST' });
    expect(startAgain.status).toBe(200);
    expect(startAgain.body.success).toBe(true);
  });
});

describe('Learning Page - Mode & Config E2E', () => {
  it('TC-LEARN-010: should set learning mode', async () => {
    const res = await api('/api/learning/mode', {
      method: 'PUT',
      body: JSON.stringify({ mode: 'from_conversations' }),
    });
    expect(res.status).toBe(200);
  });

  it('TC-LEARN-006: should set driver weights (random factor)', async () => {
    const res = await api('/api/learning/driver-weights', {
      method: 'PUT',
      body: JSON.stringify({ randomFactor: 50 }),
    });
    expect(res.status).toBe(200);
  });

  it('should switch between all learning modes', async () => {
    const modes = ['from_conversations', 'from_documents', 'tag_graph_maintenance'];
    for (const mode of modes) {
      const res = await api('/api/learning/mode', {
        method: 'PUT',
        body: JSON.stringify({ mode }),
      });
      expect(res.status).toBe(200);
    }
  });

  it('should set driver weights with boundary values', async () => {
    const min = await api('/api/learning/driver-weights', {
      method: 'PUT', body: JSON.stringify({ randomFactor: 0 }),
    });
    expect(min.status).toBe(200);

    const max = await api('/api/learning/driver-weights', {
      method: 'PUT', body: JSON.stringify({ randomFactor: 100 }),
    });
    expect(max.status).toBe(200);
  });
});

describe('Learning Page - Stats E2E', () => {
  it('TC-LEARN-014: should get learning stats', async () => {
    const res = await api('/api/learning/stats');
    expect(res.status).toBe(200);
    expect(typeof res.body.totalLearnCount).toBe('number');
    expect(typeof res.body.knowledgeCount).toBe('number');
  });
});

describe('Learning Page - Progress E2E', () => {
  it('TC-LEARN-019: should get learning progress', async () => {
    const res = await api('/api/learning/progress-enhanced');
    expect(res.status).toBe(200);
    expect(res.body.status !== undefined).toBe(true);
    expect(Array.isArray(res.body.queue)).toBe(true);
  });

  it('should get learning queue', async () => {
    const res = await api('/api/learning/queue');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });

  it('should poll progress consistently', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await api('/api/learning/progress-enhanced');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.queue)).toBe(true);
    }
  });
});

describe('Learning Page - Results E2E', () => {
  it('TC-LEARN-032: should get knowledge items', async () => {
    const res = await api('/api/learning/knowledge');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('TC-LEARN-032: should get insight items', async () => {
    const res = await api('/api/learning/insights');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});
