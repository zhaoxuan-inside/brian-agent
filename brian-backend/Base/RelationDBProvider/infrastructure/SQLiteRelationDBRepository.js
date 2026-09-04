"use strict";
/**
 * @fileoverview SQLite 关系数据库仓储实现。
 *
 * 继承 {@link SQLiteComponent} 组件，复用 SQLite 连接管理、DDL 执行等基础能力，
 * 在此基础上实现 {@link RelationDBRepository} 接口的业务方法（CURD、事务、查询）。
 *
 * PRD 1.8 条：集成的关系数据库为 SQLite。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteRelationDBRepository = void 0;
const query_1 = require("../../shared/query");
const errors_1 = require("../../shared/errors");
const SqlBuilder_1 = require("./SqlBuilder");
const SQLiteComponent_1 = require("../../components/SQLite/SQLiteComponent");
/**
 * SQLite 关系数据库仓储。
 *
 * 继承 {@link SQLiteComponent}，实现 {@link RelationDBRepository} 接口。
 * 连接管理、关闭、磁盘统计等基础能力由 SQLiteComponent 提供，
 * 本类专注于 SQL 生成与执行的业务逻辑。
 */
class SQLiteRelationDBRepository extends SQLiteComponent_1.SQLiteComponent {
    /**
     * @param options 选项
     */
    constructor(options) {
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
    ensureConfigTable() {
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
    insert(table, data) {
        if (data.length === 0) {
            return 0;
        }
        const { sql, params } = SqlBuilder_1.SqlBuilder.buildInsert(table, data);
        const stmt = this.prepare(sql);
        return stmt.run(...params).changes;
    }
    /** {@inheritDoc} */
    delete(table, conditions) {
        const where = SqlBuilder_1.SqlBuilder.buildWhere(conditions);
        const sql = `DELETE FROM ${this.quote(table)}${where.sql ? ' WHERE ' + where.sql : ''}`;
        const stmt = this.prepare(sql);
        return stmt.run(...where.params).changes;
    }
    /** {@inheritDoc} */
    update(table, data, conditions) {
        if (data.length === 0) {
            return 0;
        }
        const set = SqlBuilder_1.SqlBuilder.buildSet(data);
        const where = SqlBuilder_1.SqlBuilder.buildWhere(conditions);
        let sql = `UPDATE ${this.quote(table)} SET ${set.sql}`;
        if (where.sql) {
            sql += ' WHERE ' + where.sql;
        }
        const stmt = this.prepare(sql);
        return stmt.run(...set.params, ...where.params).changes;
    }
    /** {@inheritDoc} */
    select(queryParam) {
        const fields = SqlBuilder_1.SqlBuilder.buildFields(queryParam.fields);
        const where = SqlBuilder_1.SqlBuilder.buildWhere(queryParam.conditions);
        const orderBy = SqlBuilder_1.SqlBuilder.buildOrderBy(queryParam.order_by);
        const groupBy = SqlBuilder_1.SqlBuilder.buildGroupBy(queryParam.group_by);
        const limit = SqlBuilder_1.SqlBuilder.buildLimit(queryParam.page);
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
        return stmt.all(...where.params, ...limit.params);
    }
    /** {@inheritDoc} */
    selectOne(queryParam) {
        const limitedParam = {
            ...queryParam,
            page: { current: 1, size: 1 },
        };
        const rows = this.select(limitedParam);
        return rows.length > 0 ? rows[0] : null;
    }
    /** {@inheritDoc} */
    count(table, conditions) {
        const where = SqlBuilder_1.SqlBuilder.buildWhere(conditions);
        let sql = `SELECT COUNT(*) AS "count" FROM ${this.quote(table)}`;
        if (where.sql) {
            sql += ' WHERE ' + where.sql;
        }
        const stmt = this.prepare(sql);
        const row = stmt.get(...where.params);
        return row?.count ?? 0;
    }
    /** {@inheritDoc} */
    transaction(operations) {
        if (operations.length === 0) {
            return true;
        }
        const txn = this.getDatabase().transaction(() => {
            for (const op of operations) {
                const upperOpType = String(op.type).toUpperCase();
                const opType = Object.values(query_1.OperationType).includes(upperOpType)
                    ? upperOpType
                    : query_1.OperationType.INSERT;
                switch (opType) {
                    case query_1.OperationType.INSERT:
                        if (!op.data) {
                            throw new errors_1.DatabaseError(`事务 INSERT 操作缺少 data: table=${op.table}`);
                        }
                        this.insert(op.table, op.data);
                        break;
                    case query_1.OperationType.DELETE:
                        this.delete(op.table, op.conditions);
                        break;
                    case query_1.OperationType.UPDATE:
                        if (!op.data) {
                            throw new errors_1.DatabaseError(`事务 UPDATE 操作缺少 data: table=${op.table}`);
                        }
                        this.update(op.table, op.data, op.conditions);
                        break;
                    default:
                        throw new errors_1.DatabaseError(`未知事务操作类型: ${op.type}`);
                }
            }
        });
        try {
            txn();
            return true;
        }
        catch {
            return false;
        }
    }
    /** {@inheritDoc} */
    executeRaw(sql, params) {
        const stmt = this.prepare(sql);
        return stmt.run(...(params ?? [])).changes;
    }
    /** {@inheritDoc} */
    queryRaw(sql, params) {
        const stmt = this.prepare(sql);
        return stmt.all(...(params ?? []));
    }
    // close() / getDiskUsage() / getDatabase() 继承自 SQLiteComponent，无需重写
    /**
     * 标识符转义。
     */
    quote(name) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            throw new errors_1.DatabaseError(`标识符包含非法字符: ${name}`);
        }
        return `"${name}"`;
    }
}
exports.SQLiteRelationDBRepository = SQLiteRelationDBRepository;
//# sourceMappingURL=SQLiteRelationDBRepository.js.map