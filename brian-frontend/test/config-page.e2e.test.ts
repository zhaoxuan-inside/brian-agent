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

describe('Config Page - Global Config E2E', () => {
  it('TC-CONFIG-001: should retrieve config detail', async () => {
    const res = await api('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    expect(res.body.config).toBeTruthy();
  });

  it('TC-CONFIG-029: should update config', async () => {
    const res = await api('/api/config', {
      method: 'PUT',
      body: JSON.stringify({ testKey: 'testValue' }),
    });
    expect(res.status).toBe(200);
  });

  it('should update config with nested values', async () => {
    const res = await api('/api/config', {
      method: 'PUT',
      body: JSON.stringify({
        llm: { defaultProvider: 'openai', temperature: 0.7 },
        chat: { maxMessagesPerSession: 100 },
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe('Config Page - Model Management E2E', () => {
  it('TC-CONFIG-045: should list models', async () => {
    const res = await api('/api/config/model');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should get model by id', async () => {
    const res = await api('/api/config/model/mock-model-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('mock-model-1');
  });
});

describe('Config Page - Provider Management E2E', () => {
  it('should list providers', async () => {
    const res = await api('/api/config/provider');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Config Page - Soul Management E2E', () => {
  it('TC-CONFIG-038: should list souls', async () => {
    const res = await api('/api/config/soul');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should handle soul update', async () => {
    const res = await api('/api/config/soul/test-soul', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Soul', traits: ['analytical'] }),
    });
    expect(res.status === 200 || res.status === 404).toBe(true);
  });

  it('should handle soul delete', async () => {
    const res = await api('/api/config/soul/test-soul', {
      method: 'DELETE',
    });
    expect(res.status === 200 || res.status === 404).toBe(true);
  });
});

describe('Config Page - Work Config E2E', () => {
  it('should list work configs', async () => {
    const res = await api('/api/config/work');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Config Page - MCP Config E2E', () => {
  it('should list MCP configs', async () => {
    const res = await api('/api/config/mcp');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Config Page - Skill Management E2E', () => {
  it('should list skills', async () => {
    const res = await api('/api/skill');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    expect(Array.isArray(res.body.skills)).toBe(true);
  });

  it('should create a new skill', async () => {
    const res = await api('/api/skill', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Skill', description: 'A test skill' }),
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
  });

  it('should delete a skill', async () => {
    const res = await api('/api/skill/test-skill-id', {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });
});

describe('Config Page - Agent Management E2E', () => {
  it('should list agents', async () => {
    const res = await api('/api/agent');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  it('should create a new agent', async () => {
    const res = await api('/api/agent', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Agent', agent_type: 'work' }),
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
  });

  it('should delete an agent', async () => {
    const res = await api('/api/agent/test-agent-id', {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });
});

describe('Config Page - MCP Management E2E', () => {
  it('should list installed MCPs', async () => {
    const res = await api('/api/mcp');
    expect(res.status).toBe(200);
    expect(res.body.installed).toBeTruthy();
  });

  it('should list MCP market', async () => {
    const res = await api('/api/mcp/market');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.market)).toBe(true);
  });
});

describe('Config Page - User Profile E2E', () => {
  it('should get user profile', async () => {
    const res = await api('/api/profile/e2e-test-user');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });

  it('should update user profile', async () => {
    const res = await api('/api/profile/e2e-test-user', {
      method: 'PUT',
      body: JSON.stringify({ language: 'en-US', style: 'concise' }),
    });
    expect(res.status).toBe(200);
  });
});
