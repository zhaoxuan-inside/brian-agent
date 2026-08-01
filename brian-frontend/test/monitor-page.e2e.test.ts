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

describe('Monitor Page - Component Health E2E', () => {
  it('TC-MONITOR-015: should get component health status', async () => {
    const res = await api('/api/monitor/health-all');
    expect(res.status).toBe(200);
    expect(res.body.components).toBeTruthy();
    expect(Array.isArray(res.body.components)).toBe(true);

    const componentNames = res.body.components.map((c: any) => c.name);
    expect(componentNames).toContain('LLM Provider');
    expect(componentNames).toContain('MCP');
    expect(componentNames).toContain('RelationDB');
    expect(componentNames).toContain('GraphDB');
    expect(componentNames).toContain('VectorDB');
    expect(componentNames).toContain('MQ');
  });

  it('TC-MONITOR-016: each component should have status and response time', async () => {
    const res = await api('/api/monitor/health-all');
    for (const comp of res.body.components) {
      expect(comp.name).toBeTruthy();
      expect(comp.status).toBeTruthy();
      expect(typeof comp.responseTime).toBe('number');
    }
  });

  it('all components should show HEALTHY status', async () => {
    const res = await api('/api/monitor/health-all');
    for (const comp of res.body.components) {
      expect(comp.status).toBe('HEALTHY');
    }
  });
});

describe('Monitor Page - System Resources E2E', () => {
  it('TC-MONITOR-028: should get system resources', async () => {
    const res = await api('/api/monitor/resources');
    expect(res.status).toBe(200);
    expect(typeof res.body.cpu).toBe('number');
    expect(typeof res.body.memory).toBe('number');
    expect(typeof res.body.disk).toBe('number');
    expect(res.body.cpu).toBeGreaterThanOrEqual(0);
    expect(res.body.memory).toBeGreaterThanOrEqual(0);
    expect(res.body.disk).toBeGreaterThanOrEqual(0);
  });

  it('resource values should be within valid range', async () => {
    const res = await api('/api/monitor/resources');
    expect(res.body.cpu).toBeLessThanOrEqual(100);
    expect(res.body.memory).toBeLessThanOrEqual(100);
    expect(res.body.disk).toBeLessThanOrEqual(100);
  });
});

describe('Monitor Page - Token Analytics E2E', () => {
  it('TC-MONITOR-037: should get token trend data', async () => {
    const res = await api('/api/analytics/token-trend');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.points)).toBe(true);
    if (res.body.points.length > 0) {
      const point = res.body.points[0];
      expect(typeof point.date).toBe('string');
      expect(typeof point.tokens).toBe('number');
    }
  });

  it('TC-MONITOR-037: should get model distribution data', async () => {
    const res = await api('/api/analytics/model-distribution');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.models)).toBe(true);
  });

  it('token trend data points should be ordered by date', async () => {
    const res = await api('/api/analytics/token-trend');
    const points = res.body.points || [];
    if (points.length >= 2) {
      for (let i = 1; i < points.length; i++) {
        expect(points[i].date >= points[i - 1].date).toBe(true);
      }
    }
  });
});

describe('Monitor Page - Log Visualization E2E', () => {
  it('TC-MONITOR-046: should query logs', async () => {
    const res = await api('/api/monitor/logs/query');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('should filter logs by level', async () => {
    const res = await api('/api/monitor/logs/query?level=ERROR&limit=50');
    expect(res.status).toBe(200);
    expect(res.body.entries).toBeTruthy();
  });

  it('should handle logs pagination with limit', async () => {
    const res = await api('/api/monitor/logs/query?limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('TC-MONITOR-049: log entries should have correct fields', async () => {
    const res = await api('/api/monitor/logs/query');
    if (res.body.entries && res.body.entries.length > 0) {
      const entry = res.body.entries[0];
      expect(typeof entry.timestamp).toBe('number');
      expect(typeof entry.level).toBe('string');
      expect(typeof entry.source).toBe('string');
      expect(typeof entry.message).toBe('string');
    }
  });
});

describe('Monitor Page - Refresh & Polling E2E', () => {
  it('TC-MONITOR-008: should handle rapid successive requests (simulating auto-refresh)', async () => {
    const [health, resources, logs] = await Promise.all([
      api('/api/monitor/health-all'),
      api('/api/monitor/resources'),
      api('/api/monitor/logs/query'),
    ]);
    expect(health.status).toBe(200);
    expect(resources.status).toBe(200);
    expect(logs.status).toBe(200);
  });

  it('should handle consecutive health checks without degradation', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await api('/api/monitor/health-all');
      expect(res.status).toBe(200);
    }
  });

  it('should handle concurrent analytics requests', async () => {
    const [trend, distribution] = await Promise.all([
      api('/api/analytics/token-trend'),
      api('/api/analytics/model-distribution'),
    ]);
    expect(trend.status).toBe(200);
    expect(distribution.status).toBe(200);
  });
});
