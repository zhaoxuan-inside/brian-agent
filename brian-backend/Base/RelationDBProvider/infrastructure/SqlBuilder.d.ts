/**
 * @fileoverview SQL 构建器。
 *
 * 将公共查询对象（Condition / OrderBy / Page / DataObject）转换为 SQLite 兼容的
 * SQL 片段与参数化绑定值。上层不接触 SQL，由本工具完成对象到 SQL 的映射，
 * 实现 PRD 第 1.3 条「由 Provider 内部完成对象到 SQL 的映射」。
 *
 * 安全性：所有值均通过参数化绑定（?占位符）传递，杜绝 SQL 注入。
 */
import type { Condition, DataObject, OrderBy, Page } from '../../shared/query';
/**
 * WHERE 子句构建结果。
 */
interface WhereClause {
    /** SQL 片段（不含 "WHERE" 关键字），为空字符串表示无条件 */
    sql: string;
    /** 绑定参数值列表 */
    params: unknown[];
}
/**
 * SQL 构建器。
 *
 * 提供静态方法，将查询对象转换为 SQL 片段。无状态、线程安全。
 */
export declare class SqlBuilder {
    /**
     * 构建 WHERE 子句。
     *
     * 多个条件之间通过 Condition.logic 字段组合（AND 默认 / OR）。
     *
     * @param conditions 条件列表
     * @returns WHERE 子句（sql 不含 "WHERE" 关键字）与参数
     */
    static buildWhere(conditions?: Condition[]): WhereClause;
    /**
     * 构建单个条件的 SQL 片段。
     */
    private static buildConditionFragment;
    /**
     * 构建 ORDER BY 子句。
     *
     * @param order_by 排序字段列表
     * @returns ORDER BY 子句（不含 "ORDER BY" 关键字），为空表示不排序
     */
    static buildOrderBy(order_by?: OrderBy[]): string;
    /**
     * 构建 LIMIT / OFFSET 子句。
     *
     * @param page 分页参数
     * @returns LIMIT / OFFSET 子句及参数
     */
    static buildLimit(page?: Page): {
        sql: string;
        params: number[];
    };
    /**
     * 构建 INSERT 语句。
     *
     * @param table 表名
     * @param data 数据对象列表
     * @returns 完整 INSERT SQL 与参数
     */
    static buildInsert(table: string, data: DataObject[]): {
        sql: string;
        params: unknown[];
    };
    /**
     * 构建 UPDATE 语句的 SET 子句。
     *
     * @param data 待更新字段
     * @returns SET 子句（不含 "SET" 关键字）与参数
     */
    static buildSet(data: DataObject[]): {
        sql: string;
        params: unknown[];
    };
    /**
     * 构建字段列表（SELECT 字段过滤）。
     *
     * @param fields 字段列表，不指定则返回 *
     */
    static buildFields(fields?: string[]): string;
    /**
     * 构建 GROUP BY 子句。
     */
    static buildGroupBy(group_by?: string[]): string;
    /**
     * 标识符转义（防 SQL 注入）。
     *
     * SQLite 使用双引号包裹标识符，内部双引号通过重复转义。
     */
    private static quoteIdentifier;
}
export {};
//# sourceMappingURL=SqlBuilder.d.ts.map