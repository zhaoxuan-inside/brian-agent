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

export interface SQLiteRelationDBOptions {

  dbPath: string;

  wal?: boolean;

  autoCreateConfigTable?: boolean;
}

export class SQLiteRelationDBRepository
  extends SQLiteComponent
  implements RelationDBRepository
{

  constructor(options: SQLiteRelationDBOptions) {

    super({
      dbPath: options.dbPath,
      wal: options.wal,
      foreignKeys: true,
    });

    if (options.autoCreateConfigTable ?? true) {
      this.ensureConfigTable();
    }
  }

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

  insert(table: string, data: DataObject[]): number {
    if (data.length === 0) {
      return 0;
    }
    const { sql, params } = SqlBuilder.buildInsert(table, data);
    const stmt = this.prepare(sql);
    return stmt.run(...params).changes;
  }

  delete(table: string, conditions?: Condition[]): number {
    const where = SqlBuilder.buildWhere(conditions);
    const sql = `DELETE FROM ${this.quote(table)}${where.sql ? ' WHERE ' + where.sql : ''}`;
    const stmt = this.prepare(sql);
    return stmt.run(...where.params).changes;
  }

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

  selectOne(queryParam: QueryParam): Record<string, unknown> | null {
    const limitedParam: QueryParam = {
      ...queryParam,
      page: { current: 1, size: 1 },
    };
    const rows = this.select(limitedParam);
    return rows.length > 0 ? rows[0] : null;
  }

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

  transaction(operations: Operation[]): boolean {
    if (operations.length === 0) {
      return true;
    }

    const txn = this.getDatabase().transaction(() => {
      for (const op of operations) {
        const upperOpType = String(op.type).toUpperCase();
        const opType = (Object.values(OperationType) as string[]).includes(upperOpType)
          ? (upperOpType as OperationType)
          : OperationType.INSERT;
        switch (opType) {
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

  executeRaw(sql: string, params?: unknown[]): number {
    const stmt = this.prepare(sql);
    return stmt.run(...(params ?? [])).changes;
  }

  queryRaw<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): T[] {
    const stmt = this.prepare(sql);
    return stmt.all(...(params ?? [])) as T[];
  }

  private quote(name: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new DatabaseError(`标识符包含非法字符: ${name}`);
    }
    return `"${name}"`;
  }

}
