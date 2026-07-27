import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess } from '@brian-agent/base';
import { ensureDefaultConfig, loadConfigRecord, requireRecord } from '../../shared/ConfigHelper';

describe('ConfigHelper', () => {
  let tempDir: string;
  let dbPath: string;
  let dbAccess: RelationDBAccess;

  const TEST_TABLE = 'test_config';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-config-helper-'));
    dbPath = path.join(tempDir, 'test.db');
    dbAccess = new RelationDBAccess({ dbPath });
    await dbAccess.initialize();

    await dbAccess.executeRaw(
      `CREATE TABLE IF NOT EXISTS "${TEST_TABLE}" (
        "id" TEXT PRIMARY KEY,
        "created" INTEGER NOT NULL DEFAULT 0,
        "updated" INTEGER NOT NULL DEFAULT 0,
        "key" TEXT,
        "value" TEXT
      )`,
    );
  });

  afterEach(async () => {
    try { await dbAccess.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('ensureDefaultConfig', () => {
    it('should insert default config when table is empty', async () => {
      const count = await dbAccess.count(TEST_TABLE);
      expect(count).toBe(0);

      await ensureDefaultConfig(dbAccess, TEST_TABLE, [
        { field: 'key', value: 'test_key' },
        { field: 'value', value: 'test_value' },
      ]);

      const newCount = await dbAccess.count(TEST_TABLE);
      expect(newCount).toBe(1);
    });

    it('should be idempotent - not insert if records exist', async () => {
      await ensureDefaultConfig(dbAccess, TEST_TABLE, [
        { field: 'key', value: 'first' },
      ]);

      await ensureDefaultConfig(dbAccess, TEST_TABLE, [
        { field: 'key', value: 'second' },
      ]);

      const count = await dbAccess.count(TEST_TABLE);
      expect(count).toBe(1);
    });
  });

  describe('loadConfigRecord', () => {
    it('should return null for empty table', async () => {
      const record = await loadConfigRecord(dbAccess, TEST_TABLE);
      expect(record).toBeNull();
    });

    it('should return first record', async () => {
      await ensureDefaultConfig(dbAccess, TEST_TABLE, [
        { field: 'key', value: 'my_key' },
      ]);

      const record = await loadConfigRecord(dbAccess, TEST_TABLE);
      expect(record).not.toBeNull();
      expect(record!['key']).toBe('my_key');
    });
  });

  describe('requireRecord', () => {
    it('should return record when not null', () => {
      const record = { name: 'test' };
      const result = requireRecord(record, 'Test');
      expect(result).toBe(record);
    });

    it('should throw when record is null', () => {
      expect(() => requireRecord(null, 'TestResource')).toThrow('TestResource 记录不存在');
    });

    it('should throw when record is undefined', () => {
      expect(() => requireRecord(undefined, 'TestResource')).toThrow('TestResource 记录不存在');
    });
  });
});
