/**
 * @fileoverview Schema 初始化公共件：消除各 SchemaInitializer 中重复的
 * ALTER TABLE ADD COLUMN / CREATE INDEX 手写样板（改造前 54 处 try/catch 包装）。
 */
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
/**
 * 确保表中存在指定列（不存在则 ALTER TABLE ADD COLUMN，失败静默忽略）。
 *
 * @param db 关系数据库接入实例
 * @param table 表名
 * @param column 列名
 * @param ddl 列定义（如 `"TEXT NOT NULL DEFAULT ''"`）
 */
export declare function ensureColumn(db: RelationDBAccess, table: string, column: string, ddl: string): Promise<void>;
/**
 * 确保索引存在（CREATE INDEX IF NOT EXISTS）。
 *
 * @param db 关系数据库接入实例
 * @param table 表名
 * @param columns 索引列（按顺序组合为 idx_{table}_{col1}_{col2}）
 * @param unique 是否唯一索引
 */
export declare function ensureIndex(db: RelationDBAccess, table: string, columns: string[], unique?: boolean): Promise<void>;
//# sourceMappingURL=SchemaHelpers.d.ts.map