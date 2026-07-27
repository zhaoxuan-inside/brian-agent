/**
 * @fileoverview SQLite 关系数据库仓储实现。
 *
 * 继承 {@link SQLiteComponent} 组件，复用 SQLite 连接管理、DDL 执行等基础能力，
 * 在此基础上实现 {@link RelationDBRepository} 接口的业务方法（CURD、事务、查询）。
 *
 * PRD 1.8 条：集成的关系数据库为 SQLite。
 */

import type { RelationDBRepository } from '../domain/RelationDBRepository';
import type {
  Condition,
  DataObject,
  Operation,
  QueryParam,
} from '../../shared/query';
import { OperationType } from '../../shared/query';
import { DatabaseError } from '../../shared/errors';
import { SqlBuilder } from './SqlBuilder';
import { SQLiteComponent } from '../../components/SQLite/SQLiteComponent';

/**
 * SQLite 仓储实现选项。
 */
export interface SQLiteRelationDBOptions {
  /** 数据库文件路径 */
  dbPath: string;
  /** 是否启用 WAL 模式（默认 true，提升并发读性能） */
  wal?: boolean;
  /** 是否在初始化时创建 relationdb_config 表（默认 true） */
  autoCreateConfigTable?: boolean;
}

/**
 * SQLite 关系数据库仓储。
 *
 * 继承 {@link SQLiteComponent}，实现 {@link RelationDBRepository} 接口。
 * 连接管理、关闭、磁盘统计等基础能力由 SQLiteComponent 提供，
 * 本类专注于 SQL 生成与执行的业务逻辑。
 */
export class SQLiteRelationDBRepository
  extends SQLiteComponent
  implements RelationDBRepository
{
  /**
   * @param options 选项
   */
  constructor(options: SQLiteRelationDBOptions) {
    // 调用父类 SQLiteComponent 构造函数，初始化数据库连接
    super({
      dbPath: options.dbPath,
      wal: options.wal,
      foreignKeys: true,
    });

    if (options.autoCreateConfigTable ?? true) {
      this.ensureConfigTable();
    }
  }

  /**
   * 确保 relationdb_config 表存在。
   *
   * PRD 4.1 条：组件初始化时需要先确保 relationdb 库和 relationdb_config 表存在。
   */
  private ensureConfigTable(): void {
    this.exec(`
      CREATE TABLE IF NOT EXISTS "relationdb_config" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }

  /** {@inheritDoc} */
  insert(table: string, data: DataObject[]): number {
    if (data.length === 0) {
      return 0;
    }
    const { sql, params } = SqlBuilder.buildInsert(table, data);
    const stmt = this.prepare(sql);
    return stmt.run(...params).changes;
  }

  /** {@inheritDoc} */
  delete(table: string, conditions?: Condition[]): number {
    const where = SqlBuilder.buildWhere(conditions);
    const sql = `DELETE FROM ${this.quote(table)}${where.sql ? ' WHERE ' + where.sql : ''}`;
    const stmt = this.prepare(sql);
    return stmt.run(...where.params).changes;
  }

  /** {@inheritDoc} */
  update(table: string, data: DataObject[], conditions?: Condition[]): number {
    if (data.length === 0) {
      return 0;
    }
    const set = SqlBuilder.buildSet(data);
    const where = SqlBuilder.buildWhere(conditions);
    let sql = `UPDATE ${this.quote(table)} SET ${set.sql}`;
    if (where.sql) {
      sql += ' WHERE ' + where.sql;
    }
    const stmt = this.prepare(sql);
    return stmt.run(...set.params, ...where.params).changes;
  }

  /** {@inheritDoc} */
  select(queryParam: QueryParam): Array<Record<string, unknown>> {
    const fields = SqlBuilder.buildFields(queryParam.fields);
    const where = SqlBuilder.buildWhere(queryParam.conditions);
    const orderBy = SqlBuilder.buildOrderBy(queryParam.order_by);
    const groupBy = SqlBuilder.buildGroupBy(queryParam.group_by);
    const limit = SqlBuilder.buildLimit(queryParam.page);

    let sql = `SELECT ${fields} FROM ${this.quote(queryParam.table)}`;
    if (where.sql) {
      sql += ' WHERE ' + where.sql;
    }
    if (groupBy) {
      sql += ' GROUP BY ' + groupBy;
    }
    if (orderBy) {
      sql += ' ORDER BY ' + orderBy;
    }
    if (limit.sql) {
      sql += ' ' + limit.sql;
    }

    const stmt = this.prepare(sql);
    return stmt.all(...where.params, ...limit.params) as Array<
      Record<string, unknown>
    >;
  }

  /** {@inheritDoc} */
  selectOne(queryParam: QueryParam): Record<string, unknown> | null {
    const limitedParam: QueryParam = {
      ...queryParam,
      page: { current: 1, size: 1 },
    };
    const rows = this.select(limitedParam);
    return rows.length > 0 ? rows[0] : null;
  }

  /** {@inheritDoc} */
  count(table: string, conditions?: Condition[]): number {
    const where = SqlBuilder.buildWhere(conditions);
    let sql = `SELECT COUNT(*) AS "count" FROM ${this.quote(table)}`;
    if (where.sql) {
      sql += ' WHERE ' + where.sql;
    }
    const stmt = this.prepare(sql);
    const row = stmt.get(...where.params) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /** {@inheritDoc} */
  transaction(operations: Operation[]): boolean {
    if (operations.length === 0) {
      return true;
    }

    const txn = this.getDatabase().transaction(() => {
      for (const op of operations) {
        switch (this.normalizeOpType(op.type)) {
          case OperationType.INSERT:
            if (!op.data) {
              throw new DatabaseError(
                `事务 INSERT 操作缺少 data: table=${op.table}`,
              );
            }
            this.insert(op.table, op.data);
            break;
          case OperationType.DELETE:
            this.delete(op.table, op.conditions);
            break;
          case OperationType.UPDATE:
            if (!op.data) {
              throw new DatabaseError(
                `事务 UPDATE 操作缺少 data: table=${op.table}`,
              );
            }
            this.update(op.table, op.data, op.conditions);
            break;
          default:
            throw new DatabaseError(`未知事务操作类型: ${op.type}`);
        }
      }
    });

    try {
      txn();
      return true;
    } catch {
      return false;
    }
  }

  /** {@inheritDoc} */
  executeRaw(sql: string, params?: unknown[]): number {
    const stmt = this.prepare(sql);
    return stmt.run(...(params ?? [])).changes;
  }

  /** {@inheritDoc} */
  queryRaw<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): T[] {
    const stmt = this.prepare(sql);
    return stmt.all(...(params ?? [])) as T[];
  }

  // close() / getDiskUsage() / getDatabase() 继承自 SQLiteComponent，无需重写

  /**
   * 标识符转义。
   */
  private quote(name: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new DatabaseError(`标识符包含非法字符: ${name}`);
    }
    return `"${name}"`;
  }

  /**
   * 规范化操作类型。
   */
  private normalizeOpType(type: string): OperationType {
    const upper = String(type).toUpperCase();
    return (Object.values(OperationType) as string[]).includes(upper)
      ? (upper as OperationType)
      : OperationType.INSERT;
  }
}
