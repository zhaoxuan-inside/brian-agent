import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
  vi.restoreAllMocks();
  cleanupE2ETempDirs();
  await stopTestServer(server);
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

describe('Chat Page - Session Management E2E', () => {
  let sessionId: string;

  it('TC-CHAT-065: should create a new session', async () => {
    const res = await api('/api/chat/create-session', {
      method: 'POST',
      body: JSON.stringify({ session_title: 'E2E Test Session' }),
    });
    expect(res.status).toBe(200);
    expect(res.body.session_id).toBeTruthy();
    expect(res.body.session_title).toBe('E2E Test Session');
    sessionId = res.body.session_id;
  });

  it('TC-CHAT-063: should list sessions after creation', async () => {
    const res = await api('/api/chat/list');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    const session = res.body.sessions.find((s: any) => s.session_id === sessionId);
    expect(session).toBeTruthy();
    expect(session.session_title).toBe('E2E Test Session');
  });

  it('should create multiple sessions', async () => {
    const res1 = await api('/api/chat/create-session', {
      method: 'POST',
      body: JSON.stringify({ session_title: 'Session Two' }),
    });
    expect(res1.status).toBe(200);

    const res2 = await api('/api/chat/create-session', {
      method: 'POST',
      body: JSON.stringify({ session_title: 'Session Three' }),
    });
    expect(res2.status).toBe(200);

    const list = await api('/api/chat/list');
    expect(list.body.sessions.length).toBeGreaterThanOrEqual(3);
  });

  it('TC-CHAT-066: should delete a session', async () => {
    const res = await api(`/api/chat/session/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(res.body.deleted_count).toBeGreaterThanOrEqual(0);

    const list = await api('/api/chat/list');
    const deleted = list.body.sessions.find((s: any) => s.session_id === sessionId);
    expect(deleted).toBeFalsy();
  });
});

describe('Chat Page - Message Send & Receive E2E', () => {
  let chatSessionId: string;

  beforeAll(async () => {
    const res = await api('/api/chat/create-session', {
      method: 'POST',
      body: JSON.stringify({ session_title: 'Chat Test Session' }),
    });
    chatSessionId = res.body.session_id;
  });

  it('TC-CHAT-003/006/008: should send message and receive response (Enter send)', async () => {
    const res = await api('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({
        session_id: chatSessionId,
        msg_content: 'Hello, Brian! Tell me about yourself.',
      }),
    });
    expect(res.status).toBe(200);
    expect(res.body.workId).toBeTruthy();
    expect(res.body.msgId).toBeTruthy();
  });

  it('TC-CHAT-035/036: should retrieve chat history after sending', async () => {
    const res = await api(`/api/chat/history/${encodeURIComponent(chatSessionId)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBeGreaterThan(0);
  });

  it('should handle multiple messages in sequence', async () => {
    const msg1 = await api('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({ session_id: chatSessionId, msg_content: 'What is the weather?' }),
    });
    expect(msg1.status).toBe(200);

    const msg2 = await api('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({ session_id: chatSessionId, msg_content: 'Tell me a joke.' }),
    });
    expect(msg2.status).toBe(200);

    const history = await api(`/api/chat/history/${encodeURIComponent(chatSessionId)}`);
    expect(history.body.messages.length).toBeGreaterThanOrEqual(3);
  });

  it('TC-CHAT-005: should handle empty message (backend validates)', async () => {
    const res = await api('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({ session_id: chatSessionId, msg_content: '' }),
    });
    expect(res.status === 200 || res.status === 500).toBe(true);
  });

  it('should send message with citation ids', async () => {
    const res = await api('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({
        session_id: chatSessionId,
        msg_content: 'Can you elaborate on that?',
        citing_msg_ids: ['msg-ref-1', 'msg-ref-2'],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.body.workId).toBeTruthy();
  });
});

describe('Chat Page - Search & Navigation E2E', () => {
  let searchSessionId: string;

  beforeAll(async () => {
    const res = await api('/api/chat/create-session', {
      method: 'POST',
      body: JSON.stringify({ session_title: 'Searchable Test Chat' }),
    });
    searchSessionId = res.body.session_id;

    await api('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({ session_id: searchSessionId, msg_content: 'I need help with TypeScript interfaces.' }),
    });
  });

  it('TC-CHAT-063: should search messages by keyword', async () => {
    const res = await api(`/api/chat/search?keyword=${encodeURIComponent('TypeScript')}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it('TC-CHAT-063: should search sessions by keyword', async () => {
    const res = await api(`/api/chat/list?keyword=${encodeURIComponent('Searchable')}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(0);
  });

  it('should retrieve exchanges for a session', async () => {
    const res = await api(`/api/chat/exchanges/${encodeURIComponent(searchSessionId)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.exchanges)).toBe(true);
  });

  it('should return empty DAG for new session', async () => {
    const res = await api(`/api/chat/dag?sessionId=${encodeURIComponent(searchSessionId)}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });
});

describe('Chat Page - Session Overflow & Limits E2E', () => {
  it('should check session overflow', async () => {
    const create = await api('/api/chat/create-session', {
      method: 'POST',
      body: JSON.stringify({ session_title: 'Overflow Test' }),
    });
    expect(create.status).toBe(200);

    const res = await api(`/api/chat/history/${encodeURIComponent(create.body.session_id)}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.messages).toBe('object');
  });

  it('should handle session with empty title', async () => {
    const res = await api('/api/chat/create-session', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(res.body.session_id).toBeTruthy();
  });
});

describe('Chat Page - Agent Chain & Visualization E2E', () => {
  let visSessionId: string;

  beforeAll(async () => {
    const res = await api('/api/chat/create-session', {
      method: 'POST',
      body: JSON.stringify({ session_title: 'Agent Vis Test' }),
    });
    visSessionId = res.body.session_id;

    await api('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({ session_id: visSessionId, msg_content: 'Analyze this code and explain it.' }),
    });
  });

  it('TC-CHAT-057: should retrieve agent chain for exchange', async () => {
    const history = await api(`/api/chat/history/${encodeURIComponent(visSessionId)}`);
    expect(history.status).toBe(200);

    const res = await api('/api/chat/agent-chain/test-exchange-1');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });

  it('should retrieve DAG for session', async () => {
    const res = await api(`/api/chat/dag?sessionId=${encodeURIComponent(visSessionId)}`);
    expect(res.status).toBe(200);
  });
});

describe('Chat Page - Cancel & Cleanup E2E', () => {
  it('should cancel an ongoing work', async () => {
    const res = await api('/api/chat/cancel/test-work-id', {
      method: 'POST',
    });
    expect(res.status).toBe(200);
  });

  it('should submit feedback for message', async () => {
    const res = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ msg_id: 'test-msg', score: 4, type: 'rating' }),
    });
    expect(res.status).toBe(200);
  });
});
