"use strict";
/**
 * @fileoverview Schema 初始化公共件：消除各 SchemaInitializer 中重复的
 * ALTER TABLE ADD COLUMN / CREATE INDEX 手写样板（改造前 54 处 try/catch 包装）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureColumn = ensureColumn;
exports.ensureIndex = ensureIndex;
/**
 * 确保表中存在指定列（不存在则 ALTER TABLE ADD COLUMN，失败静默忽略）。
 *
 * @param db 关系数据库接入实例
 * @param table 表名
 * @param column 列名
 * @param ddl 列定义（如 `"TEXT NOT NULL DEFAULT ''"`）
 */
async function ensureColumn(db, table, column, ddl) {
    try {
        await db.executeRaw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${ddl}`, []);
    }
    catch {
        /* 列已存在时 SQLite 报错，视为成功 */
    }
}
/**
 * 确保索引存在（CREATE INDEX IF NOT EXISTS）。
 *
 * @param db 关系数据库接入实例
 * @param table 表名
 * @param columns 索引列（按顺序组合为 idx_{table}_{col1}_{col2}）
 * @param unique 是否唯一索引
 */
async function ensureIndex(db, table, columns, unique = false) {
    const name = `idx_${table}_${columns.join('_')}`;
    const kind = unique ? 'UNIQUE INDEX' : 'INDEX';
    await db.executeRaw(`CREATE ${kind} IF NOT EXISTS "${name}" ON "${table}" ("${columns.join('", "')}")`, []);
}
//# sourceMappingURL=SchemaHelpers.js.map