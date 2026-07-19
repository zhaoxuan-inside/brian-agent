import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Auth', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    process.env.BRIAN_DATA_DIR = path.join(os.tmpdir(), 'brian-test-auth');
    process.env.BRIAN_LOG_DIR = path.join(os.tmpdir(), 'brian-test-auth-logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_AUTH_ENABLED = 'false';
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('BRIAN_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  async function getAuth() {
    const auth = await import('../../src/infrastructure/auth');
    return auth;
  }

  it('should hashPassword return a bcrypt hash', async () => {
    const { hashPassword } = await getAuth();
    const hash = await hashPassword('my-secret-password');
    expect(hash).toBeTruthy();
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('should hashPassword produce different hashes for same password', async () => {
    const { hashPassword } = await getAuth();
    const hash1 = await hashPassword('password123');
    const hash2 = await hashPassword('password123');
    expect(hash1).not.toBe(hash2);
  });

  it('should verifyPassword return true for correct password', async () => {
    const { hashPassword, verifyPassword } = await getAuth();
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('correct-password', hash);
    expect(result).toBe(true);
  });

  it('should verifyPassword return false for incorrect password', async () => {
    const { hashPassword, verifyPassword } = await getAuth();
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('wrong-password', hash);
    expect(result).toBe(false);
  });

  it('should createSession return session with id', async () => {
    const { createSession } = await getAuth();
    const session = createSession('user-1', 'testuser');
    expect(session.id).toBeTruthy();
    expect(session.userId).toBe('user-1');
    expect(session.username).toBe('testuser');
  });

  it('should createSession return session with createdAt and expiresAt', async () => {
    const { createSession } = await getAuth();
    const session = createSession('user-1', 'testuser');
    expect(session.createdAt).toBeGreaterThan(0);
    expect(session.expiresAt).toBeGreaterThan(session.createdAt);
    expect(session.expiresAt - session.createdAt).toBe(24 * 60 * 60 * 1000);
  });

  it('should createSession with custom data', async () => {
    const { createSession } = await getAuth();
    const session = createSession('user-1', 'testuser', { role: 'admin' });
    expect(session.data).toEqual({ role: 'admin' });
  });

  it('should validateSession return session for valid id', async () => {
    const { createSession, validateSession } = await getAuth();
    const session = createSession('user-1', 'testuser');
    const validated = validateSession(session.id);
    expect(validated).not.toBeNull();
    expect(validated!.userId).toBe('user-1');
    expect(validated!.username).toBe('testuser');
  });

  it('should validateSession return null for invalid id', async () => {
    const { validateSession } = await getAuth();
    const result = validateSession('non-existent-id');
    expect(result).toBeNull();
  });

  it('should destroySession remove session', async () => {
    const { createSession, destroySession, validateSession } = await getAuth();
    const session = createSession('user-1', 'testuser');
    const existed = destroySession(session.id);
    expect(existed).toBe(true);

    const validated = validateSession(session.id);
    expect(validated).toBeNull();
  });

  it('should destroySession return false for non-existent session', async () => {
    const { destroySession } = await getAuth();
    const result = destroySession('non-existent');
    expect(result).toBe(false);
  });

  it('should getUserSessions return sessions for user', async () => {
    const { createSession, getUserSessions } = await getAuth();
    createSession('user-1', 'testuser');
    createSession('user-1', 'testuser2');
    createSession('user-2', 'otheruser');

    const sessions = getUserSessions('user-1');
    expect(sessions.length).toBe(2);
    expect(sessions[0].userId).toBe('user-1');
    expect(sessions[1].userId).toBe('user-1');
  });

  it('should getUserSessions return empty array for unknown user', async () => {
    const { getUserSessions } = await getAuth();
    const sessions = getUserSessions('unknown-user');
    expect(sessions).toEqual([]);
  });

  it('should authMiddleware allow request when authEnabled=false', async () => {
    process.env.BRIAN_AUTH_ENABLED = 'false';
    vi.resetModules();
    const { authMiddleware } = await import('../../src/infrastructure/auth');
    const req = { headers: {} } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should authMiddleware reject request without auth header when authEnabled=true', async () => {
    process.env.BRIAN_AUTH_ENABLED = 'true';
    vi.resetModules();
    const { authMiddleware } = await import('../../src/infrastructure/auth');

    const req = { headers: {} } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should authMiddleware reject request with invalid session when authEnabled=true', async () => {
    process.env.BRIAN_AUTH_ENABLED = 'true';
    vi.resetModules();
    const { authMiddleware } = await import('../../src/infrastructure/auth');

    const req = { headers: { authorization: 'Bearer invalid-session' } } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_INVALID' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should authMiddleware allow request with valid session when authEnabled=true', async () => {
    process.env.BRIAN_AUTH_ENABLED = 'true';
    vi.resetModules();
    const { createSession, authMiddleware } = await import('../../src/infrastructure/auth');

    const session = createSession('user-1', 'testuser');
    const req = { headers: { authorization: `Bearer ${session.id}` }, session: undefined } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.session).toBeDefined();
    expect(req.session!.userId).toBe('user-1');
  });
});