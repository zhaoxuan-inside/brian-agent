import { describe, it, expect, vi } from 'vitest';
import { createToggleHandler, createDirectToggleHandler } from '../../src/access/toggleHandler';

// ── Helpers: minimal mock Request & Response objects ──

interface MockRequest {
  params: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

interface MockResponse {
  statusCode: number;
  body: unknown;
  status(code: number): MockResponse;
  json(data: unknown): MockResponse;
}

function mockReq(params: Record<string, string>): MockRequest & { params: Record<string, string> } {
  return { params, query: {} };
}

function mockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// ── Types ──

interface TestEntity {
  id: string;
  name: string;
  enabled: boolean;
}

// ── createToggleHandler ──

describe('createToggleHandler (get→update pattern)', () => {
  it('should toggle enabled from true to false and return updated entity', async () => {
    const entity: TestEntity = { id: 'abc', name: 'test', enabled: true };
    const getter = vi.fn().mockResolvedValue(entity);
    const updater = vi.fn().mockImplementation((id: string, data: { enabled: boolean }) =>
      Promise.resolve({ ...entity, enabled: data.enabled })
    );

    const handler = createToggleHandler(getter, updater, 'Skill', 'SKILL_ERROR');
    const req = mockReq({ id: 'abc' });
    const res = mockRes();

    await handler(req as any, res as any, vi.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body as TestEntity).enabled).toBe(false);
    expect(updater).toHaveBeenCalledWith('abc', { enabled: false });
  });

  it('should toggle enabled from false to true and return updated entity', async () => {
    const entity: TestEntity = { id: 'xyz', name: 'test2', enabled: false };
    const getter = vi.fn().mockResolvedValue(entity);
    const updater = vi.fn().mockImplementation((id: string, data: { enabled: boolean }) =>
      Promise.resolve({ ...entity, enabled: data.enabled })
    );

    const handler = createToggleHandler(getter, updater, 'MCP', 'MCP_ERROR');
    const req = mockReq({ id: 'xyz' });
    const res = mockRes();

    await handler(req as any, res as any, vi.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body as TestEntity).enabled).toBe(true);
    expect(updater).toHaveBeenCalledWith('xyz', { enabled: true });
  });

  it('should return 404 when entity not found', async () => {
    const getter = vi.fn().mockResolvedValue(null);
    const updater = vi.fn();

    const handler = createToggleHandler(getter, updater, 'Skill', 'SKILL_ERROR');
    const req = mockReq({ id: 'missing' });
    const res = mockRes();

    await handler(req as any, res as any, vi.fn());

    expect(res.statusCode).toBe(404);
    expect((res.body as any).error).toContain('not found');
    expect(updater).not.toHaveBeenCalled();
  });

  it('should return 404 when getter returns undefined', async () => {
    const getter = vi.fn().mockResolvedValue(undefined);
    const updater = vi.fn();

    const handler = createToggleHandler(getter, updater, 'Skill', 'SKILL_ERROR');
    const req = mockReq({ id: 'missing' });
    const res = mockRes();

    await handler(req as any, res as any, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(updater).not.toHaveBeenCalled();
  });

  it('should return 500 when updater throws generic error', async () => {
    const entity: TestEntity = { id: 'abc', name: 'test', enabled: true };
    const getter = vi.fn().mockResolvedValue(entity);
    const updater = vi.fn().mockRejectedValue(new Error('DB write failed'));

    const handler = createToggleHandler(getter, updater, 'Skill', 'SKILL_TOGGLE_ERROR');
    const req = mockReq({ id: 'abc' });
    const res = mockRes();

    await handler(req as any, res as any, vi.fn());

    expect(res.statusCode).toBe(500);
    expect((res.body as any).error).toBe('DB write failed');
    expect((res.body as any).code).toBe('SKILL_TOGGLE_ERROR');
  });

  it('should return 404 when updater throws "not found" error', async () => {
    const entity: TestEntity = { id: 'abc', name: 'test', enabled: true };
    const getter = vi.fn().mockResolvedValue(entity);
    const updater = vi.fn().mockRejectedValue(new Error('Skill not found'));

    const handler = createToggleHandler(getter, updater, 'Skill', 'SKILL_TOGGLE_ERROR');
    const req = mockReq({ id: 'abc' });
    const res = mockRes();

    await handler(req as any, res as any, vi.fn());

    expect(res.statusCode).toBe(404);
    expect((res.body as any).error).toBe('Skill not found');
  });

  it('should throw 500 when getter throws error', async () => {
    const getter = vi.fn().mockRejectedValue(new Error('DB connection lost'));
    const updater = vi.fn();

    const handler = createToggleHandler(getter, updater, 'Skill', 'SKILL_TOGGLE_ERROR');
    const req = mockReq({ id: 'abc' });
    const res = mockRes();

    await handler(req as any, res as any, vi.fn());

    expect(res.statusCode).toBe(500);
    expect((res.body as any).error).toBe('DB connection lost');
  });
});

// ── createDirectToggleHandler ──

describe('createDirectToggleHandler (direct toggle pattern)', () => {
  it('should toggle via dedicated toggleFn and return result', async () => {
    const result = { id: 'agent-1', active: false };
    const toggleFn = vi.fn().mockResolvedValue(result);

    const handler = createDirectToggleHandler(toggleFn, 'Agent', 'AGENT_TOGGLE_ERROR');
    const req = mockReq({ id: 'agent-1' });
    const res = mockRes();

    await handler(req as any, res as any, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(result);
    expect(toggleFn).toHaveBeenCalledWith('agent-1');
  });

  it('should return 404 when toggleFn throws "not found"', async () => {
    const toggleFn = vi.fn().mockRejectedValue(new Error('Agent not found'));

    const handler = createDirectToggleHandler(toggleFn, 'Agent', 'AGENT_TOGGLE_ERROR');
    const req = mockReq({ id: 'missing' });
    const res = mockRes();

    await handler(req as any, res as any, vi.fn());

    expect(res.statusCode).toBe(404);
    expect((res.body as any).error).toBe('Agent not found');
  });

  it('should return 500 when toggleFn throws generic error', async () => {
    const toggleFn = vi.fn().mockRejectedValue(new Error('Toggle operation failed'));

    const handler = createDirectToggleHandler(toggleFn, 'Agent', 'AGENT_TOGGLE_ERROR');
    const req = mockReq({ id: 'agent-1' });
    const res = mockRes();

    await handler(req as any, res as any, vi.fn());

    expect(res.statusCode).toBe(500);
    expect((res.body as any).error).toBe('Toggle operation failed');
    expect((res.body as any).code).toBe('AGENT_TOGGLE_ERROR');
  });
});
