import { getDatabase } from './database';

const CLEANUP_INTERVAL = 60_000;

class CacheService {
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  get<T>(key: string): T | null {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT value, expires_at FROM cache WHERE key = ?').get(key) as { value: string; expires_at: number | null } | undefined;
      if (!row) return null;
      if (row.expires_at && Date.now() > row.expires_at) {
        db.prepare('DELETE FROM cache WHERE key = ?').run(key);
        return null;
      }
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    try {
      const db = getDatabase();
      const expiresAt = ttlMs ? Date.now() + ttlMs : null;
      db.prepare('INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)').run(key, JSON.stringify(value), expiresAt);
    } catch {
      // silent
    }
  }

  delete(key: string): void {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM cache WHERE key = ?').run(key);
    } catch {
      // silent
    }
  }

  private cleanup(): void {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at <= ?').run(Date.now());
    } catch {
      // silent
    }
  }
}

export const cache = new CacheService();
