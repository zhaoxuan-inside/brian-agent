import { serviceFactory } from '../core/abstractions/ServiceFactory';
import { getConfig } from './config.js';
import { logger } from './logger.js';

const SALT_ROUNDS = 12;
const idGenerator = serviceFactory.getIdGenerator();
const hashProvider = serviceFactory.getHashProvider();

const sessionStore = new Map<string, SessionData>();

interface SessionData {
  id: string;
  userId: string;
  username: string;
  createdAt: number;
  expiresAt: number;
  data: Record<string, unknown>;
}

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function cleanupSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessionStore) {
    if (session.expiresAt < now) {
      sessionStore.delete(id);
    }
  }
}

setInterval(cleanupSessions, 60 * 60 * 1000);

export async function hashPassword(password: string): Promise<string> {
  return hashProvider.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return hashProvider.compare(password, hash);
}

export function createSession(userId: string, username: string, data?: Record<string, unknown>): SessionData {
  const now = Date.now();
  const session: SessionData = {
    id: idGenerator.generate(),
    userId,
    username,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
    data: data || {},
  };

  sessionStore.set(session.id, session);
  logger.info('Auth', `Session created for ${username}`, { sessionId: session.id });
  return session;
}

export function validateSession(sessionId: string): SessionData | null {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    sessionStore.delete(sessionId);
    return null;
  }

  return session;
}

export function destroySession(sessionId: string): boolean {
  const existed = sessionStore.has(sessionId);
  sessionStore.delete(sessionId);
  if (existed) {
    logger.info('Auth', `Session destroyed: ${sessionId}`);
  }
  return existed;
}

export function getUserSessions(userId: string): SessionData[] {
  const sessions: SessionData[] = [];
  for (const session of sessionStore.values()) {
    if (session.userId === userId && session.expiresAt > Date.now()) {
      sessions.push(session);
    }
  }
  return sessions;
}

import type { Request, Response, NextFunction } from 'express';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      session?: SessionData;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();
  if (!config.authEnabled) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }

  const sessionId = authHeader.slice(7);
  const session = validateSession(sessionId);
  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid', code: 'SESSION_INVALID' });
    return;
  }

  req.session = session;
  next();
}