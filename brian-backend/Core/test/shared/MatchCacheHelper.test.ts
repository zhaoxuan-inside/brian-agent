import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess, Operator, IdGenerator } from '@brian-agent/base';
import {
  checkMatchCache,
  clearMatchCache,
  persistMatchBinding,
} from '../../shared/MatchCacheHelper';

describe('MatchCacheHelper', () => {
  let tempDir: string;
  let dbPath: string;
  let dbAccess: RelationDBAccess;

  const CACHE_TABLE = 'agent_cache_test';
  const ENTITY_COL = 'entity_id';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-match-cache-'));
    dbPath = path.join(tempDir, 'test.db');
    dbAccess = new RelationDBAccess({ dbPath });
    await dbAccess.initialize();

    await dbAccess.executeRaw(
      `CREATE TABLE IF NOT EXISTS "${CACHE_TABLE}" (
        "id" TEXT PRIMARY KEY,
        "created" INTEGER NOT NULL DEFAULT 0,
        "updated" INTEGER NOT NULL DEFAULT 0,
        "agent_id" TEXT NOT NULL,
        "${ENTITY_COL}" TEXT NOT NULL
      )`,
    );
  });

  afterEach(async () => {
    try { await dbAccess.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('checkMatchCache', () => {
    it('should return miss when table is empty', async () => {
      const result = await checkMatchCache(
        dbAccess, CACHE_TABLE, 'agent-1', 75, 'random', ENTITY_COL,
      );
      expect(result.hit).toBe(false);
    });

    it('should return miss when no entries for agent', async () => {
      await persistMatchBinding(dbAccess, CACHE_TABLE, 'agent-other', 'entity-1', ENTITY_COL);
      const result = await checkMatchCache(
        dbAccess, CACHE_TABLE, 'agent-1', 75, 'random', ENTITY_COL,
      );
      expect(result.hit).toBe(false);
    });

    it('should return hit with entries when agent has bindings and regen miss (random, 0%)', async () => {
      await persistMatchBinding(dbAccess, CACHE_TABLE, 'agent-1', 'entity-1', ENTITY_COL);
      const result = await checkMatchCache(
        dbAccess, CACHE_TABLE, 'agent-1', 0, 'random', ENTITY_COL,
      );
      expect(result.hit).toBe(true);
      expect(result.entries).toHaveLength(1);
      expect(result.entries![0].entity_id).toBe('entity-1');
    });

    it('should return miss when regen_rate=100 (random mode)', async () => {
      await persistMatchBinding(dbAccess, CACHE_TABLE, 'agent-1', 'entity-1', ENTITY_COL);
      const result = await checkMatchCache(
        dbAccess, CACHE_TABLE, 'agent-1', 100, 'random', ENTITY_COL,
      );
      expect(result.hit).toBe(false);
    });

    it('should handle time mode with fresh entries', async () => {
      await persistMatchBinding(dbAccess, CACHE_TABLE, 'agent-1', 'entity-1', ENTITY_COL);
      const result = await checkMatchCache(
        dbAccess, CACHE_TABLE, 'agent-1', 3600000, 'time', ENTITY_COL,
      );
      expect(result.hit).toBe(true);
    });

    it('should return miss in time mode with very short window', async () => {
      await persistMatchBinding(dbAccess, CACHE_TABLE, 'agent-1', 'entity-1', ENTITY_COL);
      const result = await checkMatchCache(
        dbAccess, CACHE_TABLE, 'agent-1', 0, 'time', ENTITY_COL,
      );
      expect(result.hit).toBe(false);
    });

    it('should return multiple entries', async () => {
      await persistMatchBinding(dbAccess, CACHE_TABLE, 'agent-1', 'entity-a', ENTITY_COL);
      await persistMatchBinding(dbAccess, CACHE_TABLE, 'agent-1', 'entity-b', ENTITY_COL);
      const result = await checkMatchCache(
        dbAccess, CACHE_TABLE, 'agent-1', 0, 'random', ENTITY_COL,
      );
      expect(result.hit).toBe(true);
      expect(result.entries).toHaveLength(2);
    });
  });

  describe('clearMatchCache', () => {
    it('should remove agent bindings', async () => {
      await persistMatchBinding(dbAccess, CACHE_TABLE, 'agent-1', 'entity-1', ENTITY_COL);
      await persistMatchBinding(dbAccess, CACHE_TABLE, 'agent-2', 'entity-2', ENTITY_COL);

      await clearMatchCache(dbAccess, CACHE_TABLE, 'agent-1');

      const result1 = await checkMatchCache(
        dbAccess, CACHE_TABLE, 'agent-1', 0, 'random', ENTITY_COL,
      );
      expect(result1.hit).toBe(false);

      const result2 = await checkMatchCache(
        dbAccess, CACHE_TABLE, 'agent-2', 0, 'random', ENTITY_COL,
      );
      expect(result2.hit).toBe(true);
    });

    it('should not throw when no entries exist', async () => {
      await expect(
        clearMatchCache(dbAccess, CACHE_TABLE, 'agent-nonexistent'),
      ).resolves.not.toThrow();
    });
  });

  describe('persistMatchBinding', () => {
    it('should persist a binding and return id', async () => {
      const id = await persistMatchBinding(
        dbAccess, CACHE_TABLE, 'agent-1', 'entity-1', ENTITY_COL,
      );
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should allow multiple bindings for same agent', async () => {
      const id1 = await persistMatchBinding(
        dbAccess, CACHE_TABLE, 'agent-1', 'entity-a', ENTITY_COL,
      );
      const id2 = await persistMatchBinding(
        dbAccess, CACHE_TABLE, 'agent-1', 'entity-b', ENTITY_COL,
      );
      expect(id1).not.toBe(id2);
    });
  });
});
