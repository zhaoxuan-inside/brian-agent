import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess, Operator, IdGenerator } from '@brian-agent/base';
import { AgingEngine } from '../../shared/AgingEngine';

describe('AgingEngine', () => {
  let tempDir: string;
  let dbPath: string;
  let dbAccess: RelationDBAccess;

  const RULE_TABLE = 'aging_rule';
  const BINDING_TABLE = 'aging_binding';
  const USAGE_TABLE = 'aging_usage';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-aging-'));
    dbPath = path.join(tempDir, 'test.db');
    dbAccess = new RelationDBAccess({ dbPath });
    await dbAccess.initialize();

    await dbAccess.executeRaw(
      `CREATE TABLE IF NOT EXISTS "${RULE_TABLE}" (
        "id" TEXT PRIMARY KEY,
        "created" INTEGER NOT NULL DEFAULT 0,
        "updated" INTEGER NOT NULL DEFAULT 0,
        "days" INTEGER NOT NULL DEFAULT 0,
        "min_usage_count" INTEGER NOT NULL DEFAULT 0
      )`,
    );
    await dbAccess.executeRaw(
      `CREATE TABLE IF NOT EXISTS "${BINDING_TABLE}" (
        "id" TEXT PRIMARY KEY,
        "created" INTEGER NOT NULL DEFAULT 0,
        "updated" INTEGER NOT NULL DEFAULT 0,
        "entity_id" TEXT NOT NULL
      )`,
    );
    await dbAccess.executeRaw(
      `CREATE TABLE IF NOT EXISTS "${USAGE_TABLE}" (
        "id" TEXT PRIMARY KEY,
        "created" INTEGER NOT NULL DEFAULT 0,
        "binding_id" TEXT NOT NULL
      )`,
    );
  });

  afterEach(async () => {
    try { await dbAccess.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  async function seedRule(days: number, minUsageCount: number): Promise<string> {
    const id = IdGenerator.generate();
    await dbAccess.insert(RULE_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: IdGenerator.now() },
      { field: 'updated', value: IdGenerator.now() },
      { field: 'days', value: days },
      { field: 'min_usage_count', value: minUsageCount },
    ]);
    return id;
  }

  async function seedBinding(entityId: string): Promise<string> {
    const id = IdGenerator.generate();
    await dbAccess.insert(BINDING_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: IdGenerator.now() },
      { field: 'updated', value: IdGenerator.now() },
      { field: 'entity_id', value: entityId },
    ]);
    return id;
  }

  async function seedUsage(bindingId: string, timestamp: number): Promise<void> {
    await dbAccess.insert(USAGE_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: timestamp },
      { field: 'binding_id', value: bindingId },
    ]);
  }

  describe('age', () => {
    it('should return 0 when no rules exist', async () => {
      const engine = new AgingEngine(dbAccess);
      const disabler = vi.fn();
      const count = await engine.age({
        ruleTable: RULE_TABLE,
        bindingTable: BINDING_TABLE,
        bindingEntityIdColumn: 'entity_id',
        usageBindingIdColumn: 'binding_id',
        usageTable: USAGE_TABLE,
        disabler,
      });
      expect(count).toBe(0);
      expect(disabler).not.toHaveBeenCalled();
    });

    it('should return 0 when no bindings exist', async () => {
      await seedRule(30, 5);
      const engine = new AgingEngine(dbAccess);
      const disabler = vi.fn();
      const count = await engine.age({
        ruleTable: RULE_TABLE,
        bindingTable: BINDING_TABLE,
        bindingEntityIdColumn: 'entity_id',
        usageBindingIdColumn: 'binding_id',
        usageTable: USAGE_TABLE,
        disabler,
      });
      expect(count).toBe(0);
    });

    it('should not age entities with sufficient usage', async () => {
      await seedRule(30, 3);
      const bindingId = await seedBinding('entity-active');
      const now = IdGenerator.now();
      await seedUsage(bindingId, now);
      await seedUsage(bindingId, now - 1000);
      await seedUsage(bindingId, now - 2000);

      const engine = new AgingEngine(dbAccess);
      const disabler = vi.fn();
      const count = await engine.age({
        ruleTable: RULE_TABLE,
        bindingTable: BINDING_TABLE,
        bindingEntityIdColumn: 'entity_id',
        usageBindingIdColumn: 'binding_id',
        usageTable: USAGE_TABLE,
        disabler,
      });
      expect(count).toBe(0);
      expect(disabler).not.toHaveBeenCalled();
    });

    it('should age entities with insufficient usage', async () => {
      await seedRule(1, 100);
      const bindingId = await seedBinding('entity-stale');
      await seedUsage(bindingId, IdGenerator.now());

      const engine = new AgingEngine(dbAccess);
      const disabler = vi.fn();
      const count = await engine.age({
        ruleTable: RULE_TABLE,
        bindingTable: BINDING_TABLE,
        bindingEntityIdColumn: 'entity_id',
        usageBindingIdColumn: 'binding_id',
        usageTable: USAGE_TABLE,
        disabler,
      });
      expect(count).toBe(1);
      expect(disabler).toHaveBeenCalledWith('entity-stale');
    });

    it('should age multiple entities when all rules met', async () => {
      await seedRule(7, 10);
      const b1 = await seedBinding('entity-1');
      const b2 = await seedBinding('entity-2');
      const now = IdGenerator.now();
      await seedUsage(b1, now);
      await seedUsage(b2, now);

      const engine = new AgingEngine(dbAccess);
      const disabler = vi.fn();
      const count = await engine.age({
        ruleTable: RULE_TABLE,
        bindingTable: BINDING_TABLE,
        bindingEntityIdColumn: 'entity_id',
        usageBindingIdColumn: 'binding_id',
        usageTable: USAGE_TABLE,
        disabler,
      });
      expect(count).toBe(2);
      expect(disabler).toHaveBeenCalledTimes(2);
    });

    it('should not age entity if any rule is met', async () => {
      await seedRule(30, 1);
      await seedRule(7, 100);
      const bindingId = await seedBinding('entity-partial');
      await seedUsage(bindingId, IdGenerator.now());

      const engine = new AgingEngine(dbAccess);
      const disabler = vi.fn();
      const count = await engine.age({
        ruleTable: RULE_TABLE,
        bindingTable: BINDING_TABLE,
        bindingEntityIdColumn: 'entity_id',
        usageBindingIdColumn: 'binding_id',
        usageTable: USAGE_TABLE,
        disabler,
      });
      expect(count).toBe(0);
    });

    it('should handle multiple rules correctly (OR logic - age when all rules fail)', async () => {
      await seedRule(1, 50);
      await seedRule(7, 50);
      const bindingId = await seedBinding('entity-test');
      for (let i = 0; i < 30; i++) {
        await seedUsage(bindingId, IdGenerator.now() - i * 1000);
      }

      const engine = new AgingEngine(dbAccess);
      const disabler = vi.fn();
      const count = await engine.age({
        ruleTable: RULE_TABLE,
        bindingTable: BINDING_TABLE,
        bindingEntityIdColumn: 'entity_id',
        usageBindingIdColumn: 'binding_id',
        usageTable: USAGE_TABLE,
        disabler,
      });
      expect(count).toBe(1);
    });
  });
});
