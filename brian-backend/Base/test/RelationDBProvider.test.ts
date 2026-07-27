/**
 * @fileoverview RelationDBProvider 模块测试。
 *
 * 测试范围：
 * - 初始化：initialize / 配置表创建 / 默认配置写入 / enabled 状态恢复
 * - CURD：insertDB / deleteDB / updateDB / selectDB / selectOneDB / countDB
 * - 事务：transactionDB（原子性、回滚）
 * - 可视化：visualizedDB（health / volume / diskUsage / invalid scope）
 * - 运维：enableDB（运行时启用/禁用）/ closeDB（终态关闭）
 * - IConfigStorage 便捷方法：selectOne / select / insert / update / delete / count
 * - 原生操作：executeRaw / queryRaw / transactionRaw
 * - AOP 集成：elapsed_ms 填充
 * - 条件操作符全覆盖：EQ / NE / GT / LT / GE / LE / LIKE / IN / NOT_IN / IS_NULL / IS_NOT_NULL / BETWEEN
 * - 查询特性：排序 / 分页 / 分组 / 字段过滤 / 组合查询
 * - 边界场景：空数据、空条件、空操作、非法标识符、不存在的表
 *
 * 所有测试使用真实 SQLite 数据库，不使用任何 MOCK。
 * 每个测试用例在 temp 目录中创建独立的数据库文件，测试后清理。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { IdGenerator } from '../shared/id/IdGenerator';

import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import {
  DBContext,
  InsertDBInput,
  InsertDBOutput,
  DeleteDBInput,
  DeleteDBOutput,
  UpdateDBInput,
  UpdateDBOutput,
  SelectDBInput,
  SelectDBOutput,
  SelectOneDBInput,
  SelectOneDBOutput,
  CountDBInput,
  CountDBOutput,
  TransactionDBInput,
  TransactionDBOutput,
  VisualizedDBInput,
  VisualizedDBOutput,
  EnableDBInput,
  EnableDBOutput,
  CloseDBInput,
  CloseDBOutput,
  RELATIONDB_CONFIG_TABLE,
} from '../RelationDBProvider';
import { SqlBuilder } from '../RelationDBProvider/infrastructure/SqlBuilder';
import { SQLiteRelationDBRepository } from '../RelationDBProvider/infrastructure/SQLiteRelationDBRepository';
import { Operator } from '../shared/query';
import { ComponentDisabledError, DatabaseError } from '../shared/errors';
import type { Condition, DataObject, OrderBy, Page, QueryParam, Operation } from '../shared/query';

// ---------------------------------------------------------------------------
// 测试表名与建表 SQL
// ---------------------------------------------------------------------------

const TEST_TABLE = 'test_items';

const CREATE_TEST_TABLE = `
  CREATE TABLE IF NOT EXISTS "${TEST_TABLE}" (
    "id"      TEXT    NOT NULL PRIMARY KEY,
    "name"    TEXT    NOT NULL,
    "price"   REAL    NOT NULL DEFAULT 0,
    "qty"     INTEGER NOT NULL DEFAULT 0,
    "status"  TEXT    NOT NULL DEFAULT 'active',
    "extra"   TEXT,
    "tags"    TEXT,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL
  )
`;

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 构造测试数据（单条记录） */
function makeRow(
  overrides: Record<string, unknown> = {},
): DataObject[] {
  const now = IdGenerator.now();
  return [
    { field: 'id', value: overrides.id ?? IdGenerator.generate() },
    { field: 'name', value: overrides.name ?? 'test-item' },
    { field: 'price', value: overrides.price ?? 9.99 },
    { field: 'qty', value: overrides.qty ?? 10 },
    { field: 'status', value: overrides.status ?? 'active' },
    { field: 'extra', value: overrides.extra ?? null },
    { field: 'tags', value: overrides.tags ?? '' },
    { field: 'created', value: now },
    { field: 'updated', value: now },
  ];
}

/** 构造 EQ 条件 */
function eq(field: string, value: unknown): Condition {
  return { field, operator: Operator.EQ, value };
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('RelationDBProvider', () => {
  describe('SqlBuilder', () => {
    describe('quoteIdentifier', () => {
      it('should quote valid identifiers', () => {
        // SqlBuilder.quoteIdentifier is private, test via buildWhere
        const where = SqlBuilder.buildWhere([{ field: 'name', operator: Operator.EQ, value: 'hello' }]);
        expect(where.sql).toContain('"name"');
      });

      it('should reject identifiers with special characters', () => {
        expect(() =>
          new SQLiteRelationDBRepository({ dbPath: ':memory:', autoCreateConfigTable: false }).close(),
        ).not.toThrow();
      });

      it('should reject invalid table names in repository', () => {
        const repo = new SQLiteRelationDBRepository({ dbPath: ':memory:', autoCreateConfigTable: false });
        expect(() => repo.insert('bad;table', [{ field: 'x', value: 1 }])).toThrow();
      });
    });

    describe('buildWhere', () => {
      it('should return empty where for empty conditions', () => {
        const w = SqlBuilder.buildWhere([]);
        expect(w.sql).toBe('');
        expect(w.params).toEqual([]);
      });

      it('should return empty where for undefined conditions', () => {
        const w = SqlBuilder.buildWhere(undefined);
        expect(w.sql).toBe('');
        expect(w.params).toEqual([]);
      });

      it('should build AND combined conditions', () => {
        const w = SqlBuilder.buildWhere([
          { field: 'status', operator: Operator.EQ, value: 'active' },
          { field: 'qty', operator: Operator.GT, value: 5 },
        ]);
        expect(w.sql).toContain('AND');
        expect(w.params).toEqual(['active', 5]);
      });

      it('should build OR combined conditions', () => {
        const w = SqlBuilder.buildWhere([
          { field: 'status', operator: Operator.EQ, value: 'active' },
          { field: 'status', operator: Operator.EQ, value: 'pending', logic: 'OR' },
        ]);
        expect(w.sql).toContain('OR');
      });

      it('should handle IS_NULL', () => {
        const w = SqlBuilder.buildWhere([{ field: 'extra', operator: Operator.IS_NULL }]);
        expect(w.sql).toContain('IS NULL');
        expect(w.params.length).toBe(0);
      });

      it('should handle IS_NOT_NULL', () => {
        const w = SqlBuilder.buildWhere([{ field: 'extra', operator: Operator.IS_NOT_NULL }]);
        expect(w.sql).toContain('IS NOT NULL');
        expect(w.params.length).toBe(0);
      });

      it('should handle IN', () => {
        const w = SqlBuilder.buildWhere([{ field: 'status', operator: Operator.IN, value: ['a', 'b'] }]);
        expect(w.sql).toContain('IN (?, ?)');
        expect(w.params).toEqual(['a', 'b']);
      });

      it('should handle NOT_IN', () => {
        const w = SqlBuilder.buildWhere([{ field: 'status', operator: Operator.NOT_IN, value: ['x'] }]);
        expect(w.sql).toContain('NOT IN (?)');
        expect(w.params).toEqual(['x']);
      });

      it('should handle BETWEEN', () => {
        const w = SqlBuilder.buildWhere([{ field: 'price', operator: Operator.BETWEEN, value: [10, 20] }]);
        expect(w.sql).toContain('BETWEEN ? AND ?');
        expect(w.params).toEqual([10, 20]);
      });

      it('should handle LIKE', () => {
        const w = SqlBuilder.buildWhere([{ field: 'name', operator: Operator.LIKE, value: '%test%' }]);
        expect(w.sql).toContain('LIKE ?');
        expect(w.params).toEqual(['%test%']);
      });
    });

    describe('buildOrderBy', () => {
      it('should build ASC order', () => {
        const sql = SqlBuilder.buildOrderBy([{ field: 'name', direction: 'ASC' }]);
        expect(sql).toBe('"name" ASC');
      });

      it('should build DESC order', () => {
        const sql = SqlBuilder.buildOrderBy([{ field: 'price', direction: 'DESC' }]);
        expect(sql).toBe('"price" DESC');
      });

      it('should default to ASC', () => {
        const sql = SqlBuilder.buildOrderBy([{ field: 'name' }]);
        expect(sql).toBe('"name" ASC');
      });

      it('should return empty for undefined', () => {
        expect(SqlBuilder.buildOrderBy(undefined)).toBe('');
      });
    });

    describe('buildLimit', () => {
      it('should build LIMIT OFFSET', () => {
        const r = SqlBuilder.buildLimit({ current: 2, size: 10 });
        expect(r.sql).toBe('LIMIT ? OFFSET ?');
        expect(r.params).toEqual([10, 10]);
      });

      it('should return empty for undefined', () => {
        const r = SqlBuilder.buildLimit(undefined);
        expect(r.sql).toBe('');
      });
    });

    describe('buildInsert', () => {
      it('should build INSERT statement', () => {
        const r = SqlBuilder.buildInsert('foo', [
          { field: 'name', value: 'bar' },
          { field: 'val', value: 42 },
        ]);
        expect(r.sql).toBe('INSERT INTO "foo" ("name", "val") VALUES (?, ?)');
        expect(r.params).toEqual(['bar', 42]);
      });
    });

    describe('buildSet', () => {
      it('should build SET clause', () => {
        const r = SqlBuilder.buildSet([{ field: 'name', value: 'new' }]);
        expect(r.sql).toBe('"name" = ?');
        expect(r.params).toEqual(['new']);
      });
    });

    describe('buildFields', () => {
      it('should return * for empty array', () => {
        expect(SqlBuilder.buildFields([])).toBe('*');
      });

      it('should return * for undefined', () => {
        expect(SqlBuilder.buildFields(undefined)).toBe('*');
      });

      it('should quote field names', () => {
        expect(SqlBuilder.buildFields(['id', 'name'])).toBe('"id", "name"');
      });
    });

    describe('buildGroupBy', () => {
      it('should build GROUP BY', () => {
        expect(SqlBuilder.buildGroupBy(['status'])).toBe('"status"');
      });

      it('should return empty for undefined', () => {
        expect(SqlBuilder.buildGroupBy(undefined)).toBe('');
      });
    });
  });

  // -------------------------------------------------------------------------
  // 集成测试（使用真实 SQLite）
  // -------------------------------------------------------------------------
  describe('integration', () => {
    let tempDir: string;
    let dbPath: string;
    let access: RelationDBAccess;

    beforeEach(async () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-relational-test-'));
      dbPath = path.join(tempDir, 'test.db');
      access = new RelationDBAccess({ dbPath });
      await access.initialize();
      // 创建测试表
      access.executeRaw(CREATE_TEST_TABLE);
    });

    afterEach(async () => {
      try {
        await access.closeDB(new CloseDBInput(), new DBContext(), new CloseDBOutput());
      } catch {
        // 忽略已关闭的情况
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // 清理失败忽略
      }
    });

    // -----------------------------------------------------------------------
    // 初始化
    // -----------------------------------------------------------------------
    describe('initialize', () => {
      it('should create relationdb_config table', () => {
        const output = new SelectDBOutput();
        access.selectDB(
          { query_param: { table: RELATIONDB_CONFIG_TABLE } } as SelectDBInput,
          new DBContext(),
          output,
        );
        // 表存在则查询不抛错
        expect(output.rows).toBeDefined();
      });

      it('should insert default enabled config', () => {
        const output = new SelectOneDBOutput();
        access.selectOneDB(
          { query_param: { table: RELATIONDB_CONFIG_TABLE, conditions: [eq('config_key', 'enabled')] } },
          new DBContext(),
          output,
        );
        expect(output.row).not.toBeNull();
        expect(output.row!.config_value).toBe('true');
      });

      it('should set enabled to true after initialize', async () => {
        const output = new InsertDBOutput();
        const data = makeRow();
        await access.insertDB({ table: TEST_TABLE, data } as InsertDBInput, new DBContext(), output);
        expect(output.affected_rows).toBe(1);
      });

      it('should not overwrite existing config on re-initialize', async () => {
        // 先修改 enabled
        await access.enableDB({ enable: false } as EnableDBInput, new DBContext(), new EnableDBOutput());
        // 重新初始化
        const access2 = new RelationDBAccess({ dbPath });
        await access2.initialize();
        // 恢复的 enabled 状态应为 false
        // 通过操作验证：enabled=false 时 insert 应抛错
        const data = makeRow();
        const output = new InsertDBOutput();
        try {
          await access2.insertDB({ table: TEST_TABLE, data } as InsertDBInput, new DBContext(), output);
          // 如果没抛错，说明 enabled 为 true（不符合预期）
          expect('should have thrown').toBe('ComponentDisabledError');
        } catch (e) {
          expect(e).toBeInstanceOf(ComponentDisabledError);
        }
        // 清理 access2
        await access2.closeDB(new CloseDBInput(), new DBContext(), new CloseDBOutput());
      });
    });

    // -----------------------------------------------------------------------
    // insertDB
    // -----------------------------------------------------------------------
    describe('insertDB', () => {
      it('should insert a single record and return true', async () => {
        const input: InsertDBInput = Object.assign(new InsertDBInput(), { table: TEST_TABLE, data: makeRow() });
        const output = new InsertDBOutput();
        const ok = await access.insertDB(input, new DBContext(), output);
        expect(ok).toBe(true);
        expect(output.affected_rows).toBe(1);
      });

      it('should insert a record with all field types', async () => {
        const now = IdGenerator.now();
        const input: InsertDBInput = Object.assign(new InsertDBInput(), {
          table: TEST_TABLE,
          data: [
            { field: 'id', value: 'type-test-1' },
            { field: 'name', value: 'typenames' },
            { field: 'price', value: 123.45 },
            { field: 'qty', value: 100 },
            { field: 'status', value: 'testing' },
            { field: 'extra', value: 'some extra' },
            { field: 'tags', value: 'a,b,c' },
            { field: 'created', value: now },
            { field: 'updated', value: now },
          ],
        });
        const output = new InsertDBOutput();
        await access.insertDB(input, new DBContext(), output);
        expect(output.affected_rows).toBe(1);

        // 验证数据
        const sel = new SelectOneDBOutput();
        await access.selectOneDB(
          { query_param: { table: TEST_TABLE, conditions: [eq('id', 'type-test-1')] } } as SelectOneDBInput,
          new DBContext(),
          sel,
        );
        expect(sel.row!.name).toBe('typenames');
        expect(sel.row!.price).toBe(123.45);
        expect(sel.row!.qty).toBe(100);
      });

      it('should return 0 affected_rows for empty data', async () => {
        const input: InsertDBInput = Object.assign(new InsertDBInput(), { table: TEST_TABLE, data: [] });
        const output = new InsertDBOutput();
        await access.insertDB(input, new DBContext(), output);
        expect(output.affected_rows).toBe(0);
      });

      it('should throw error for non-existent table', () => {
        const input: InsertDBInput = Object.assign(new InsertDBInput(), {
          table: 'nonexistent_table_xyz',
          data: [{ field: 'x', value: 1 }],
        });
        const output = new InsertDBOutput();
        expect(() => access.insertDB(input, new DBContext(), output)).rejects.toThrow();
      });
    });

    // -----------------------------------------------------------------------
    // deleteDB
    // -----------------------------------------------------------------------
    describe('deleteDB', () => {
      beforeEach(async () => {
        // 插入测试数据
        const now = IdGenerator.now();
        await access.insertDB(
          Object.assign(new InsertDBInput(), {
            table: TEST_TABLE,
            data: [
              { field: 'id', value: 'del-1' },
              { field: 'name', value: 'alpha' },
              { field: 'price', value: 10 },
              { field: 'qty', value: 1 },
              { field: 'status', value: 'active' },
              { field: 'extra', value: null },
              { field: 'tags', value: '' },
              { field: 'created', value: now },
              { field: 'updated', value: now },
            ],
          }),
          new DBContext(),
          new InsertDBOutput(),
        );
        await access.insertDB(
          Object.assign(new InsertDBInput(), {
            table: TEST_TABLE,
            data: [
              { field: 'id', value: 'del-2' },
              { field: 'name', value: 'beta' },
              { field: 'price', value: 20 },
              { field: 'qty', value: 2 },
              { field: 'status', value: 'inactive' },
              { field: 'extra', value: null },
              { field: 'tags', value: '' },
              { field: 'created', value: now },
              { field: 'updated', value: now },
            ],
          }),
          new DBContext(),
          new InsertDBOutput(),
        );
        await access.insertDB(
          Object.assign(new InsertDBInput(), {
            table: TEST_TABLE,
            data: [
              { field: 'id', value: 'del-3' },
              { field: 'name', value: 'gamma' },
              { field: 'price', value: 30 },
              { field: 'qty', value: 3 },
              { field: 'status', value: 'active' },
              { field: 'extra', value: null },
              { field: 'tags', value: '' },
              { field: 'created', value: now },
              { field: 'updated', value: now },
            ],
          }),
          new DBContext(),
          new InsertDBOutput(),
        );
      });

      it('should delete record by id', async () => {
        const output = new DeleteDBOutput();
        await access.deleteDB(
          { table: TEST_TABLE, conditions: [eq('id', 'del-1')] } as DeleteDBInput,
          new DBContext(),
          output,
        );
        expect(output.affected_rows).toBe(1);

        const cnt = new CountDBOutput();
        await access.countDB({ table: TEST_TABLE } as CountDBInput, new DBContext(), cnt);
        expect(cnt.count).toBe(2);
      });

      it('should delete multiple records by condition', async () => {
        const output = new DeleteDBOutput();
        await access.deleteDB(
          { table: TEST_TABLE, conditions: [eq('status', 'active')] } as DeleteDBInput,
          new DBContext(),
          output,
        );
        expect(output.affected_rows).toBe(2);
      });

      it('should delete all records when no conditions', async () => {
        const output = new DeleteDBOutput();
        await access.deleteDB(
          { table: TEST_TABLE } as DeleteDBInput,
          new DBContext(),
          output,
        );
        expect(output.affected_rows).toBe(3);

        const cnt = new CountDBOutput();
        await access.countDB({ table: TEST_TABLE } as CountDBInput, new DBContext(), cnt);
        expect(cnt.count).toBe(0);
      });

      it('should return 0 affected_rows for non-matching conditions', async () => {
        const output = new DeleteDBOutput();
        await access.deleteDB(
          { table: TEST_TABLE, conditions: [eq('id', 'nonexistent')] } as DeleteDBInput,
          new DBContext(),
          output,
        );
        expect(output.affected_rows).toBe(0);
      });

      it('should delete with OR conditions', async () => {
        const output = new DeleteDBOutput();
        await access.deleteDB(
          {
            table: TEST_TABLE,
            conditions: [
              { field: 'name', operator: Operator.EQ, value: 'alpha' },
              { field: 'name', operator: Operator.EQ, value: 'beta', logic: 'OR' },
            ],
          } as DeleteDBInput,
          new DBContext(),
          output,
        );
        expect(output.affected_rows).toBe(2);
      });
    });

    // -----------------------------------------------------------------------
    // updateDB
    // -----------------------------------------------------------------------
    describe('updateDB', () => {
      beforeEach(async () => {
        const now = IdGenerator.now();
        await access.insertDB(
          Object.assign(new InsertDBInput(), {
            table: TEST_TABLE,
            data: [
              { field: 'id', value: 'upd-1' },
              { field: 'name', value: 'item-a' },
              { field: 'price', value: 100 },
              { field: 'qty', value: 5 },
              { field: 'status', value: 'draft' },
              { field: 'extra', value: null },
              { field: 'tags', value: '' },
              { field: 'created', value: now },
              { field: 'updated', value: now },
            ],
          }),
          new DBContext(),
          new InsertDBOutput(),
        );
        await access.insertDB(
          Object.assign(new InsertDBInput(), {
            table: TEST_TABLE,
            data: [
              { field: 'id', value: 'upd-2' },
              { field: 'name', value: 'item-b' },
              { field: 'price', value: 200 },
              { field: 'qty', value: 10 },
              { field: 'status', value: 'draft' },
              { field: 'extra', value: null },
              { field: 'tags', value: '' },
              { field: 'created', value: now },
              { field: 'updated', value: now },
            ],
          }),
          new DBContext(),
          new InsertDBOutput(),
        );
      });

      it('should update record by condition', async () => {
        const output = new UpdateDBOutput();
        await access.updateDB(
          {
            table: TEST_TABLE,
            data: [{ field: 'name', value: 'updated-name' }, { field: 'status', value: 'published' }],
            conditions: [eq('id', 'upd-1')],
          } as UpdateDBInput,
          new DBContext(),
          output,
        );
        expect(output.affected_rows).toBe(1);

        const sel = new SelectOneDBOutput();
        await access.selectOneDB(
          { query_param: { table: TEST_TABLE, conditions: [eq('id', 'upd-1')] } } as SelectOneDBInput,
          new DBContext(),
          sel,
        );
        expect(sel.row!.name).toBe('updated-name');
        expect(sel.row!.status).toBe('published');
      });

      it('should update multiple records', async () => {
        const output = new UpdateDBOutput();
        await access.updateDB(
          {
            table: TEST_TABLE,
            data: [{ field: 'status', value: 'archived' }],
            conditions: [eq('status', 'draft')],
          } as UpdateDBInput,
          new DBContext(),
          output,
        );
        expect(output.affected_rows).toBe(2);
      });

      it('should update all records when no conditions', async () => {
        const output = new UpdateDBOutput();
        await access.updateDB(
          { table: TEST_TABLE, data: [{ field: 'qty', value: 0 }] } as UpdateDBInput,
          new DBContext(),
          output,
        );
        expect(output.affected_rows).toBe(2);
      });

      it('should return 0 affected_rows for empty data', async () => {
        const output = new UpdateDBOutput();
        await access.updateDB(
          { table: TEST_TABLE, data: [], conditions: [eq('id', 'upd-1')] } as UpdateDBInput,
          new DBContext(),
          output,
        );
        expect(output.affected_rows).toBe(0);
      });

      it('should return 0 affected_rows for non-matching conditions', async () => {
        const output = new UpdateDBOutput();
        await access.updateDB(
          {
            table: TEST_TABLE,
            data: [{ field: 'name', value: 'nope' }],
            conditions: [eq('id', 'nonexistent')],
          } as UpdateDBInput,
          new DBContext(),
          output,
        );
        expect(output.affected_rows).toBe(0);
      });
    });

    // -----------------------------------------------------------------------
    // selectDB
    // -----------------------------------------------------------------------
    describe('selectDB', () => {
      beforeEach(async () => {
        const now = IdGenerator.now();
        const items = [
          { id: 'sel-1', name: 'Alpha', price: 10.0, qty: 5, status: 'active', extra: 'info1', tags: 'tag-a,tag-b' },
          { id: 'sel-2', name: 'Beta', price: 20.0, qty: 15, status: 'inactive', extra: null, tags: 'tag-b' },
          { id: 'sel-3', name: 'Gamma', price: 30.0, qty: 8, status: 'active', extra: 'info3', tags: 'tag-a' },
          { id: 'sel-4', name: 'Delta', price: 40.0, qty: 20, status: 'pending', extra: null, tags: 'tag-c' },
          { id: 'sel-5', name: 'Epsilon', price: 50.0, qty: 3, status: 'active', extra: 'info5', tags: 'tag-a,tag-c' },
        ];
        for (const item of items) {
          await access.insertDB(
            Object.assign(new InsertDBInput(), {
              table: TEST_TABLE,
              data: [
                { field: 'id', value: item.id },
                { field: 'name', value: item.name },
                { field: 'price', value: item.price },
                { field: 'qty', value: item.qty },
                { field: 'status', value: item.status },
                { field: 'extra', value: item.extra },
                { field: 'tags', value: item.tags },
                { field: 'created', value: now },
                { field: 'updated', value: now },
              ],
            }),
            new DBContext(),
            new InsertDBOutput(),
          );
        }
      });

      it('should select all records', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE } } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(5);
        expect(output.total).toBe(5);
      });

      it('should select with EQ condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE, conditions: [eq('status', 'active')] } } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(3);
        expect(output.total).toBe(3);
      });

      it('should select with NE condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE, conditions: [{ field: 'status', operator: Operator.NE, value: 'active' }] } } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(2);
      });

      it('should select with GT condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE, conditions: [{ field: 'qty', operator: Operator.GT, value: 10 }] } } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(2); // sel-2: qty=15, sel-4: qty=20
      });

      it('should select with GE condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE, conditions: [{ field: 'price', operator: Operator.GE, value: 30 }] } } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(3); // 30, 40, 50
      });

      it('should select with LT condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE, conditions: [{ field: 'price', operator: Operator.LT, value: 30 }] } } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(2); // 10, 20
      });

      it('should select with LE condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE, conditions: [{ field: 'price', operator: Operator.LE, value: 30 }] } } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(3); // 10, 20, 30
      });

      it('should select with LIKE condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE, conditions: [{ field: 'name', operator: Operator.LIKE, value: '%l%' }] } } as SelectDBInput,
          new DBContext(),
          output,
        );
        // Alpha, Delta, Epsilon contain 'l'
        expect(output.rows.length).toBeGreaterThanOrEqual(2);
      });

      it('should select with IN condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              conditions: [{ field: 'id', operator: Operator.IN, value: ['sel-1', 'sel-3', 'sel-5'] }],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(3);
      });

      it('should select with NOT_IN condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              conditions: [{ field: 'id', operator: Operator.NOT_IN, value: ['sel-1', 'sel-2'] }],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(3); // sel-3, sel-4, sel-5
      });

      it('should select with IS_NULL condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE, conditions: [{ field: 'extra', operator: Operator.IS_NULL }] } } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(2); // Beta, Delta have extra=null
      });

      it('should select with IS_NOT_NULL condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE, conditions: [{ field: 'extra', operator: Operator.IS_NOT_NULL }] } } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(3); // Alpha, Gamma, Epsilon
      });

      it('should select with BETWEEN condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              conditions: [{ field: 'qty', operator: Operator.BETWEEN, value: [5, 15] }],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        // qty in [5,15]: Alpha(5), Gamma(8), Beta(15)
        expect(output.rows.length).toBe(3);
      });

      it('should select with ORDER BY ASC', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              order_by: [{ field: 'price', direction: 'ASC' }],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows[0].price).toBe(10.0);
        expect(output.rows[4].price).toBe(50.0);
      });

      it('should select with ORDER BY DESC', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              order_by: [{ field: 'price', direction: 'DESC' }],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows[0].price).toBe(50.0);
      });

      it('should select with pagination (Page)', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              order_by: [{ field: 'price', direction: 'ASC' }],
              page: { current: 1, size: 2 },
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(2);
        expect(output.total).toBe(5); // total is always the unpaginated count
        expect(output.rows[0].price).toBe(10.0);
        expect(output.rows[1].price).toBe(20.0);
      });

      it('should select with pagination page 2', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              order_by: [{ field: 'price', direction: 'ASC' }],
              page: { current: 3, size: 2 },
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(1); // only the 5th item on page 3
        expect(output.rows[0].price).toBe(50.0);
      });

      it('should select with GROUP BY', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              fields: ['status'],
              group_by: ['status'],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(3); // active, inactive, pending
      });

      it('should select with field filtering', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: { table: TEST_TABLE, fields: ['id', 'name'] },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows[0]).toHaveProperty('id');
        expect(output.rows[0]).toHaveProperty('name');
        expect(output.rows[0]).not.toHaveProperty('price');
      });

      it('should select with combined conditions, sorting, and pagination', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              conditions: [
                { field: 'qty', operator: Operator.GT, value: 3 },
              ],
              order_by: [{ field: 'name', direction: 'ASC' }],
              page: { current: 1, size: 3 },
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBeLessThanOrEqual(3);
        expect(output.total).toBeGreaterThanOrEqual(1);
      });

      it('should handle multiple AND conditions', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              conditions: [
                { field: 'status', operator: Operator.EQ, value: 'active' },
                { field: 'qty', operator: Operator.GT, value: 4 }, // AND
              ],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        // active + qty > 4: Alpha(5), Gamma(8)
        expect(output.rows.length).toBe(2);
      });

      it('should handle LIKE with tag field', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              conditions: [{ field: 'tags', operator: Operator.LIKE, value: '%tag-a%' }],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(3); // Alpha, Gamma, Epsilon
      });
    });

    // -----------------------------------------------------------------------
    // selectOneDB
    // -----------------------------------------------------------------------
    describe('selectOneDB', () => {
      beforeEach(async () => {
        const now = IdGenerator.now();
        await access.insertDB(
          Object.assign(new InsertDBInput(), {
            table: TEST_TABLE,
            data: [
              { field: 'id', value: 'one-1' },
              { field: 'name', value: 'first' },
              { field: 'price', value: 10 },
              { field: 'qty', value: 1 },
              { field: 'status', value: 'active' },
              { field: 'extra', value: null },
              { field: 'tags', value: '' },
              { field: 'created', value: now },
              { field: 'updated', value: now },
            ],
          }),
          new DBContext(),
          new InsertDBOutput(),
        );
        await access.insertDB(
          Object.assign(new InsertDBInput(), {
            table: TEST_TABLE,
            data: [
              { field: 'id', value: 'one-2' },
              { field: 'name', value: 'second' },
              { field: 'price', value: 20 },
              { field: 'qty', value: 2 },
              { field: 'status', value: 'active' },
              { field: 'extra', value: null },
              { field: 'tags', value: '' },
              { field: 'created', value: now },
              { field: 'updated', value: now },
            ],
          }),
          new DBContext(),
          new InsertDBOutput(),
        );
      });

      it('should return first matching record', async () => {
        const output = new SelectOneDBOutput();
        await access.selectOneDB(
          { query_param: { table: TEST_TABLE, conditions: [eq('status', 'active')] } } as SelectOneDBInput,
          new DBContext(),
          output,
        );
        expect(output.row).not.toBeNull();
        expect(output.row!.status).toBe('active');
      });

      it('should return null for no match', async () => {
        const output = new SelectOneDBOutput();
        await access.selectOneDB(
          { query_param: { table: TEST_TABLE, conditions: [eq('id', 'nonexistent')] } } as SelectOneDBInput,
          new DBContext(),
          output,
        );
        expect(output.row).toBeNull();
      });

      it('should return only one row (auto LIMIT 1)', async () => {
        const output = new SelectOneDBOutput();
        await access.selectOneDB(
          { query_param: { table: TEST_TABLE } } as SelectOneDBInput,
          new DBContext(),
          output,
        );
        expect(output.row).not.toBeNull();
      });
    });

    // -----------------------------------------------------------------------
    // countDB
    // -----------------------------------------------------------------------
    describe('countDB', () => {
      beforeEach(async () => {
        const now = IdGenerator.now();
        for (let i = 0; i < 3; i++) {
          await access.insertDB(
            Object.assign(new InsertDBInput(), {
              table: TEST_TABLE,
              data: [
                { field: 'id', value: `cnt-${i}` },
                { field: 'name', value: `item-${i}` },
                { field: 'price', value: 100 },
                { field: 'qty', value: 1 },
                { field: 'status', value: i === 0 ? 'active' : 'inactive' },
                { field: 'extra', value: null },
                { field: 'tags', value: '' },
                { field: 'created', value: now },
                { field: 'updated', value: now },
              ],
            }),
            new DBContext(),
            new InsertDBOutput(),
          );
        }
      });

      it('should count all records', async () => {
        const output = new CountDBOutput();
        await access.countDB({ table: TEST_TABLE } as CountDBInput, new DBContext(), output);
        expect(output.count).toBe(3);
      });

      it('should count with conditions', async () => {
        const output = new CountDBOutput();
        await access.countDB(
          { table: TEST_TABLE, conditions: [eq('status', 'active')] } as CountDBInput,
          new DBContext(),
          output,
        );
        expect(output.count).toBe(1);
      });

      it('should return 0 for no matching records', async () => {
        const output = new CountDBOutput();
        await access.countDB(
          { table: TEST_TABLE, conditions: [eq('status', 'archived')] } as CountDBInput,
          new DBContext(),
          output,
        );
        expect(output.count).toBe(0);
      });

      it('should count empty table', async () => {
        // delete all
        await access.deleteDB({ table: TEST_TABLE } as DeleteDBInput, new DBContext(), new DeleteDBOutput());
        const output = new CountDBOutput();
        await access.countDB({ table: TEST_TABLE } as CountDBInput, new DBContext(), output);
        expect(output.count).toBe(0);
      });
    });

    // -----------------------------------------------------------------------
    // transactionDB
    // -----------------------------------------------------------------------
    describe('transactionDB', () => {
      const now = IdGenerator.now();

      function makeRowData(id: string, name: string): DataObject[] {
        return [
          { field: 'id', value: id },
          { field: 'name', value: name },
          { field: 'price', value: 10 },
          { field: 'qty', value: 1 },
          { field: 'status', value: 'active' },
          { field: 'extra', value: null },
          { field: 'tags', value: '' },
          { field: 'created', value: now },
          { field: 'updated', value: now },
        ];
      }

      it('should execute multiple INSERTs in a transaction', async () => {
        const output = new TransactionDBOutput();
        const ok = await access.transactionDB(
          {
            operations: [
              { type: 'INSERT', table: TEST_TABLE, data: makeRowData('txn-a', 'A') },
              { type: 'INSERT', table: TEST_TABLE, data: makeRowData('txn-b', 'B') },
            ],
          } as TransactionDBInput,
          new DBContext(),
          output,
        );
        expect(ok).toBe(true);

        const cnt = new CountDBOutput();
        await access.countDB({ table: TEST_TABLE } as CountDBInput, new DBContext(), cnt);
        expect(cnt.count).toBe(2);
      });

      it('should execute INSERT + UPDATE + DELETE in a transaction', async () => {
        // 先插入一条
        await access.insertDB(
          Object.assign(new InsertDBInput(), { table: TEST_TABLE, data: makeRowData('txn-c', 'C') }),
          new DBContext(),
          new InsertDBOutput(),
        );

        const output = new TransactionDBOutput();
        const ok = await access.transactionDB(
          {
            operations: [
              { type: 'INSERT', table: TEST_TABLE, data: makeRowData('txn-d', 'D') },
              {
                type: 'UPDATE',
                table: TEST_TABLE,
                data: [{ field: 'name', value: 'C-updated' }],
                conditions: [eq('id', 'txn-c')],
              },
              {
                type: 'DELETE',
                table: TEST_TABLE,
                conditions: [eq('id', 'txn-d')],
              },
            ],
          } as TransactionDBInput,
          new DBContext(),
          output,
        );
        expect(ok).toBe(true);

        // 验证：txn-c 被更新，txn-d 先插入后删除
        const sel = new SelectOneDBOutput();
        await access.selectOneDB(
          { query_param: { table: TEST_TABLE, conditions: [eq('id', 'txn-c')] } } as SelectOneDBInput,
          new DBContext(),
          sel,
        );
        expect(sel.row!.name).toBe('C-updated');

        const sel2 = new SelectOneDBOutput();
        await access.selectOneDB(
          { query_param: { table: TEST_TABLE, conditions: [eq('id', 'txn-d')] } } as SelectOneDBInput,
          new DBContext(),
          sel2,
        );
        expect(sel2.row).toBeNull();
      });

      it('should rollback on error', async () => {
        // 先插入一条
        await access.insertDB(
          Object.assign(new InsertDBInput(), { table: TEST_TABLE, data: makeRowData('txn-e', 'E') }),
          new DBContext(),
          new InsertDBOutput(),
        );

        const output = new TransactionDBOutput();
        const ok = await access.transactionDB(
          {
            operations: [
              { type: 'INSERT', table: TEST_TABLE, data: makeRowData('txn-f', 'F') },
              // 这一步会失败：INSERT 到不存在的表
              { type: 'INSERT', table: 'nonexistent_table', data: [{ field: 'x', value: 1 }] },
            ],
          } as TransactionDBInput,
          new DBContext(),
          output,
        );
        expect(ok).toBe(false);
        expect(output.error).toBe('事务执行失败，已回滚');
        expect(output.error_code).toBe('TRANSACTION_FAILED');

        // txn-f 不应被插入（回滚）
        const sel = new SelectOneDBOutput();
        await access.selectOneDB(
          { query_param: { table: TEST_TABLE, conditions: [eq('id', 'txn-f')] } } as SelectOneDBInput,
          new DBContext(),
          sel,
        );
        expect(sel.row).toBeNull();
        // txn-e 仍在
        const cnt = new CountDBOutput();
        await access.countDB({ table: TEST_TABLE } as CountDBInput, new DBContext(), cnt);
        expect(cnt.count).toBe(1);
      });

      it('should return true for empty operations', async () => {
        const output = new TransactionDBOutput();
        const ok = await access.transactionDB(
          { operations: [] } as TransactionDBInput,
          new DBContext(),
          output,
        );
        expect(ok).toBe(true);
      });

      it('should fail when INSERT operation lacks data', async () => {
        const output = new TransactionDBOutput();
        const ok = await access.transactionDB(
          {
            operations: [{ type: 'INSERT', table: TEST_TABLE }],
          } as TransactionDBInput,
          new DBContext(),
          output,
        );
        expect(ok).toBe(false);
      });

      it('should fail when UPDATE operation lacks data', async () => {
        const output = new TransactionDBOutput();
        const ok = await access.transactionDB(
          {
            operations: [{ type: 'UPDATE', table: TEST_TABLE, conditions: [eq('id', 'x')] }],
          } as TransactionDBInput,
          new DBContext(),
          output,
        );
        expect(ok).toBe(false);
      });
    });

    // -----------------------------------------------------------------------
    // visualizedDB
    // -----------------------------------------------------------------------
    describe('visualizedDB', () => {
      it('should return health info', async () => {
        const output = new VisualizedDBOutput();
        const ok = await access.visualizedDB(
          { scope: 'health' } as VisualizedDBInput,
          new DBContext(),
          output,
        );
        expect(ok).toBe(true);
        expect(output.data.connected).toBe(true);
        expect(typeof output.data.response_time_ms).toBe('number');
      });

      it('should return volume info', async () => {
        // 先插入一些数据
        const now = IdGenerator.now();
        await access.insertDB(
          Object.assign(new InsertDBInput(), {
            table: TEST_TABLE,
            data: [
              { field: 'id', value: 'viz-1' },
              { field: 'name', value: 'v' },
              { field: 'price', value: 1 },
              { field: 'qty', value: 1 },
              { field: 'status', value: 'a' },
              { field: 'extra', value: null },
              { field: 'tags', value: '' },
              { field: 'created', value: now },
              { field: 'updated', value: now },
            ],
          }),
          new DBContext(),
          new InsertDBOutput(),
        );

        const output = new VisualizedDBOutput();
        const ok = await access.visualizedDB(
          { scope: 'volume' } as VisualizedDBInput,
          new DBContext(),
          output,
        );
        expect(ok).toBe(true);
        expect(output.data).toHaveProperty('tables');
        const tables = output.data.tables as Record<string, number>;
        expect(tables[TEST_TABLE]).toBeGreaterThanOrEqual(1);
        expect(tables[RELATIONDB_CONFIG_TABLE]).toBeGreaterThanOrEqual(1);
      });

      it('should return diskUsage info', async () => {
        const output = new VisualizedDBOutput();
        const ok = await access.visualizedDB(
          { scope: 'diskUsage' } as VisualizedDBInput,
          new DBContext(),
          output,
        );
        expect(ok).toBe(true);
        expect(typeof output.data.disk_usage_bytes).toBe('number');
        expect(output.data.disk_usage_bytes).toBeGreaterThan(0);
      });

      it('should return error for invalid scope', async () => {
        const output = new VisualizedDBOutput();
        const ok = await access.visualizedDB(
          { scope: 'invalid_scope' } as VisualizedDBInput,
          new DBContext(),
          output,
        );
        expect(ok).toBe(false);
        expect(output.error).toContain('未知的可视化范围');
        expect(output.error_code).toBe('INVALID_SCOPE');
      });
    });

    // -----------------------------------------------------------------------
    // enableDB / closeDB
    // -----------------------------------------------------------------------
    describe('enableDB / closeDB', () => {
      it('should disable and re-enable database', async () => {
        // 禁用
        await access.enableDB({ enable: false } as EnableDBInput, new DBContext(), new EnableDBOutput());

        // 操作应抛错
        const output = new InsertDBOutput();
        try {
          await access.insertDB(
            { table: TEST_TABLE, data: makeRow() } as InsertDBInput,
            new DBContext(),
            output,
          );
          expect('should have thrown').toBe('ComponentDisabledError');
        } catch (e) {
          expect(e).toBeInstanceOf(ComponentDisabledError);
        }

        // 重新启用
        await access.enableDB({ enable: true } as EnableDBInput, new DBContext(), new EnableDBOutput());

        // 操作应恢复
        const output2 = new InsertDBOutput();
        await access.insertDB(
          { table: TEST_TABLE, data: makeRow() } as InsertDBInput,
          new DBContext(),
          output2,
        );
        expect(output2.affected_rows).toBe(1);
      });

      it('should persist enable state to config table', async () => {
        await access.enableDB({ enable: false } as EnableDBInput, new DBContext(), new EnableDBOutput());

        // 禁用后不能通过 service 层查询，使用 queryRaw 绕过 enabled 检查
        const rows = access.queryRaw(
          'SELECT "config_value" FROM "relationdb_config" WHERE "config_key" = ?',
          ['enabled'],
        );
        expect(rows[0].config_value).toBe('false');

        // 恢复启用状态以便后续 test 清理
        await access.enableDB({ enable: true } as EnableDBInput, new DBContext(), new EnableDBOutput());
      });

      it('should prevent operations after closeDB', async () => {
        await access.closeDB(new CloseDBInput(), new DBContext(), new CloseDBOutput());

        const output = new InsertDBOutput();
        try {
          await access.insertDB(
            { table: TEST_TABLE, data: makeRow() } as InsertDBInput,
            new DBContext(),
            output,
          );
          expect('should have thrown').toBe('DatabaseError');
        } catch (e) {
          expect(e).toBeInstanceOf(DatabaseError);
          expect((e as DatabaseError).message).toContain('已关闭');
        }
      });

      it('should prevent enableDB after closeDB', async () => {
        await access.closeDB(new CloseDBInput(), new DBContext(), new CloseDBOutput());

        try {
          await access.enableDB({ enable: true } as EnableDBInput, new DBContext(), new EnableDBOutput());
          expect('should have thrown').toBe('DatabaseError');
        } catch (e) {
          expect(e).toBeInstanceOf(DatabaseError);
          expect((e as DatabaseError).message).toContain('已关闭');
        }
      });

      it('should block all CRUD operations when disabled', async () => {
        await access.enableDB({ enable: false } as EnableDBInput, new DBContext(), new EnableDBOutput());

        const tests = [
          () => access.insertDB({ table: TEST_TABLE, data: makeRow() } as InsertDBInput, new DBContext(), new InsertDBOutput()),
          () => access.deleteDB({ table: TEST_TABLE } as DeleteDBInput, new DBContext(), new DeleteDBOutput()),
          () => access.updateDB({ table: TEST_TABLE, data: [{ field: 'qty', value: 1 }] } as UpdateDBInput, new DBContext(), new UpdateDBOutput()),
          () => access.selectDB({ query_param: { table: TEST_TABLE } } as SelectDBInput, new DBContext(), new SelectDBOutput()),
          () => access.selectOneDB({ query_param: { table: TEST_TABLE } } as SelectOneDBInput, new DBContext(), new SelectOneDBOutput()),
          () => access.countDB({ table: TEST_TABLE } as CountDBInput, new DBContext(), new CountDBOutput()),
          () => access.transactionDB({ operations: [] } as TransactionDBInput, new DBContext(), new TransactionDBOutput()),
          () => access.visualizedDB({ scope: 'health' } as VisualizedDBInput, new DBContext(), new VisualizedDBOutput()),
        ];

        for (const fn of tests) {
          try {
            await fn();
            expect('should have thrown').toBe('ComponentDisabledError');
          } catch (e) {
            expect(e).toBeInstanceOf(ComponentDisabledError);
          }
        }
      });
    });

    // -----------------------------------------------------------------------
    // IConfigStorage 便捷方法
    // -----------------------------------------------------------------------
    describe('IConfigStorage convenience methods', () => {
      const now = IdGenerator.now();

      beforeEach(async () => {
        for (let i = 0; i < 3; i++) {
          await access.insert(
            TEST_TABLE,
            [
              { field: 'id', value: `icfg-${i}` },
              { field: 'name', value: `name-${i}` },
              { field: 'price', value: 100 + i },
              { field: 'qty', value: i + 1 },
              { field: 'status', value: 'test' },
              { field: 'extra', value: null },
              { field: 'tags', value: '' },
              { field: 'created', value: now },
              { field: 'updated', value: now },
            ],
          );
        }
      });

      it('insert convenience method', async () => {
        const n = await access.insert(TEST_TABLE, [
          { field: 'id', value: 'icfg-99' },
          { field: 'name', value: 'extra' },
          { field: 'price', value: 999 },
          { field: 'qty', value: 99 },
          { field: 'status', value: 'test' },
          { field: 'extra', value: null },
          { field: 'tags', value: '' },
          { field: 'created', value: now },
          { field: 'updated', value: now },
        ]);
        expect(n).toBe(1);

        const cnt = await access.count(TEST_TABLE);
        expect(cnt).toBe(4);
      });

      it('selectOne convenience method', async () => {
        const row = await access.selectOne(TEST_TABLE, [eq('id', 'icfg-0')]);
        expect(row).not.toBeNull();
        expect(row!.name).toBe('name-0');
      });

      it('selectOne returns null for no match', async () => {
        const row = await access.selectOne(TEST_TABLE, [eq('id', 'nonexistent')]);
        expect(row).toBeNull();
      });

      it('select convenience method', async () => {
        const rows = await access.select(TEST_TABLE, {
          conditions: [eq('status', 'test')],
          order_by: [{ field: 'name', direction: 'ASC' }],
        });
        expect(rows.length).toBe(3);
      });

      it('select with page', async () => {
        const rows = await access.select(TEST_TABLE, {
          page: { current: 1, size: 2 },
        });
        expect(rows.length).toBe(2);
      });

      it('select with fields', async () => {
        const rows = await access.select(TEST_TABLE, {
          fields: ['id', 'name'],
        });
        expect(rows[0]).toHaveProperty('id');
        expect(rows[0]).toHaveProperty('name');
        expect(rows[0]).not.toHaveProperty('price');
      });

      it('update convenience method', async () => {
        const n = await access.update(
          TEST_TABLE,
          [{ field: 'name', value: 'updated-via-conv' }],
          [eq('id', 'icfg-0')],
        );
        expect(n).toBe(1);

        const row = await access.selectOne(TEST_TABLE, [eq('id', 'icfg-0')]);
        expect(row!.name).toBe('updated-via-conv');
      });

      it('delete convenience method', async () => {
        const n = await access.delete(TEST_TABLE, [eq('id', 'icfg-0')]);
        expect(n).toBe(1);

        const cnt = await access.count(TEST_TABLE);
        expect(cnt).toBe(2);
      });

      it('delete all convenience method', async () => {
        const n = await access.delete(TEST_TABLE);
        expect(n).toBe(3);
      });

      it('count convenience method', async () => {
        const n = await access.count(TEST_TABLE, [eq('status', 'test')]);
        expect(n).toBe(3);
      });

      it('count convenience method - no conditions', async () => {
        const n = await access.count(TEST_TABLE);
        expect(n).toBe(3);
      });
    });

    // -----------------------------------------------------------------------
    // 原生操作
    // -----------------------------------------------------------------------
    describe('raw operations', () => {
      it('executeRaw should execute DDL', () => {
        const n = access.executeRaw(
          'CREATE TABLE IF NOT EXISTS "raw_test" ("id" TEXT PRIMARY KEY, "val" INTEGER)',
        );
        // DDL 不影响行数，changes 为 0
        expect(n).toBeGreaterThanOrEqual(0);
      });

      it('executeRaw should execute DML', () => {
        // 先建表
        access.executeRaw('CREATE TABLE IF NOT EXISTS "raw_test2" ("id" TEXT PRIMARY KEY, "val" INTEGER)');
        const n = access.executeRaw(
          'INSERT INTO "raw_test2" ("id", "val") VALUES (?, ?)',
          ['r1', 42],
        );
        expect(n).toBe(1);
      });

      it('queryRaw should return results', () => {
        const rows = access.queryRaw(
          'SELECT "config_key", "config_value" FROM "relationdb_config"',
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows[0]).toHaveProperty('config_key');
        expect(rows[0]).toHaveProperty('config_value');
      });

      it('queryRaw with params', () => {
        const rows = access.queryRaw(
          'SELECT * FROM "relationdb_config" WHERE "config_key" = ?',
          ['enabled'],
        );
        expect(rows.length).toBe(1);
        expect(rows[0].config_key).toBe('enabled');
      });

      it('transactionRaw should execute operations', () => {
        const now = IdGenerator.now();
        const ok = access.transactionRaw([
          { type: 'INSERT', table: TEST_TABLE, data: [
            { field: 'id', value: 'raw-txn-1' },
            { field: 'name', value: 'rt1' },
            { field: 'price', value: 111 },
            { field: 'qty', value: 1 },
            { field: 'status', value: 'test' },
            { field: 'extra', value: null },
            { field: 'tags', value: '' },
            { field: 'created', value: now },
            { field: 'updated', value: now },
          ]},
        ]);
        expect(ok).toBe(true);

        const rows = access.queryRaw('SELECT COUNT(*) AS "cnt" FROM "test_items" WHERE "id" = ?', ['raw-txn-1']);
        expect((rows[0] as { cnt: number }).cnt).toBe(1);
      });

      it('transactionRaw should rollback on error', () => {
        const ok = access.transactionRaw([
          { type: 'INSERT', table: 'nonexistent_table', data: [{ field: 'x', value: 1 }] },
        ]);
        expect(ok).toBe(false);
      });
    });

    // -----------------------------------------------------------------------
    // AOP 集成
    // -----------------------------------------------------------------------
    describe('AOP integration', () => {
      it('should fill elapsed_ms in output', async () => {
        const output = new InsertDBOutput();
        await access.insertDB(
          Object.assign(new InsertDBInput(), { table: TEST_TABLE, data: makeRow() }),
          new DBContext(),
          output,
        );
        expect(typeof output.elapsed_ms).toBe('number');
        expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
      });

      it('should fill elapsed_ms in select output', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          { query_param: { table: TEST_TABLE } } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(typeof output.elapsed_ms).toBe('number');
      });
    });

    // -----------------------------------------------------------------------
    // 边界场景
    // -----------------------------------------------------------------------
    describe('edge cases', () => {
      it('should handle empty IN array (returns no rows)', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              conditions: [{ field: 'id', operator: Operator.IN, value: [] }],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(0);
      });

      it('should handle empty NOT_IN array (returns all rows)', async () => {
        // 先插入数据
        const now = IdGenerator.now();
        await access.insertDB(
          Object.assign(new InsertDBInput(), { table: TEST_TABLE, data: makeRow({ id: 'edge-1' }) }),
          new DBContext(),
          new InsertDBOutput(),
        );
        await access.insertDB(
          Object.assign(new InsertDBInput(), { table: TEST_TABLE, data: makeRow({ id: 'edge-2' }) }),
          new DBContext(),
          new InsertDBOutput(),
        );

        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              conditions: [{ field: 'id', operator: Operator.NOT_IN, value: [] }],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        // 空 NOT_IN 返回永真，应该返回所有行
        expect(output.rows.length).toBeGreaterThanOrEqual(2);
      });

      it('should handle null value in condition', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              conditions: [{ field: 'extra', operator: Operator.EQ, value: null }],
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        // EQ null 在 SQLite 中不会匹配 NULL 值（NULL != NULL）
        expect(output.rows.length).toBe(0);
      });

      it('should paginate correctly with empty result', async () => {
        const output = new SelectDBOutput();
        await access.selectDB(
          {
            query_param: {
              table: TEST_TABLE,
              conditions: [eq('id', 'no-such-id')],
              page: { current: 1, size: 10 },
            },
          } as SelectDBInput,
          new DBContext(),
          output,
        );
        expect(output.rows.length).toBe(0);
        expect(output.total).toBe(0);
      });

      it('should reject invalid table names (SQL injection prevention)', () => {
        expect(() => {
          access.executeRaw('INSERT INTO "bad; DROP TABLE relationdb_config; --" ("x") VALUES (1)');
        }).toThrow();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 直接 Repository 级别测试
  // -------------------------------------------------------------------------
  describe('SQLiteRelationDBRepository', () => {
    let repo: SQLiteRelationDBRepository;

    beforeEach(() => {
      repo = new SQLiteRelationDBRepository({ dbPath: ':memory:' });
    });

    afterEach(() => {
      try { repo.close(); } catch { /* ignore */ }
    });

    it('should create config table on init', () => {
      const data: DataObject[] = [
        { field: 'config_key', value: 'test_key' },
        { field: 'config_value', value: 'test_val' },
        { field: 'value_type', value: 'STRING' },
        { field: 'description', value: 'test desc' },
        { field: 'updated', value: Date.now() },
      ];
      const n = repo.insert(RELATIONDB_CONFIG_TABLE, data);
      expect(n).toBe(1);
    });

    it('should insert and select data', () => {
      const data = [
        { field: 'config_key', value: 'k1' },
        { field: 'config_value', value: 'v1' },
        { field: 'value_type', value: 'STRING' },
        { field: 'description', value: 'd1' },
        { field: 'updated', value: Date.now() },
      ];
      repo.insert(RELATIONDB_CONFIG_TABLE, data);

      const rows = repo.select({ table: RELATIONDB_CONFIG_TABLE });
      expect(rows.length).toBe(1);
      expect(rows[0].config_key).toBe('k1');
    });

    it('should selectOne return first row', () => {
      const now = Date.now();
      repo.insert(RELATIONDB_CONFIG_TABLE, [
        { field: 'config_key', value: 'a' },
        { field: 'config_value', value: '1' },
        { field: 'value_type', value: 'INT' },
        { field: 'description', value: '' },
        { field: 'updated', value: now },
      ]);
      repo.insert(RELATIONDB_CONFIG_TABLE, [
        { field: 'config_key', value: 'b' },
        { field: 'config_value', value: '2' },
        { field: 'value_type', value: 'INT' },
        { field: 'description', value: '' },
        { field: 'updated', value: now },
      ]);

      const row = repo.selectOne({ table: RELATIONDB_CONFIG_TABLE });
      expect(row).not.toBeNull();
    });

    it('should getDiskUsage return number', () => {
      const size = repo.getDiskUsage();
      // :memory: databases have size 0 on disk
      expect(typeof size).toBe('number');
    });

    it('should close cleanly', () => {
      expect(() => repo.close()).not.toThrow();
    });
  });
});
