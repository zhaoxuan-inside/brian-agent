/**
 * @fileoverview RelationDBProvider 仓储接口。
 *
 * DDD 中 Repository 接口定义于 domain 层，由 infrastructure 层提供具体实现。
 * 上层（application 层）依赖此接口而非具体实现，实现数据库方言的解耦。
 */
import type { Condition, DataObject, Operation, QueryParam } from '../../shared/query';
/**
 * 关系数据库仓储接口。
 *
 * 定义 RelationDBProvider 的底层数据操作契约，
 * infrastructure 层通过 {@link SQLiteRelationDBRepository} 实现。
 */
export interface RelationDBRepository {
    /**
     * 向指定表中新增一条或多条记录。
     *
     * @param table 表名
     * @param data 数据对象列表
     * @returns 影响行数
     */
    insert(table: string, data: DataObject[]): number;
    /**
     * 删除指定表中符合条件的记录。
     *
     * @param table 表名
     * @param conditions 条件对象列表，不指定则删除全表
     * @returns 影响行数
     */
    delete(table: string, conditions?: Condition[]): number;
    /**
     * 更新指定表中符合条件的记录。
     *
     * @param table 表名
     * @param data 待更新字段
     * @param conditions 条件对象列表，不指定则更新全表
     * @returns 影响行数
     */
    update(table: string, data: DataObject[], conditions?: Condition[]): number;
    /**
     * 查询记录列表，支持字段过滤、排序、分页。
     *
     * @param queryParam 查询参数对象
     * @returns 查询结果列表
     */
    select(queryParam: QueryParam): Array<Record<string, unknown>>;
    /**
     * 查询单条记录（自动追加 LIMIT 1）。
     *
     * @param queryParam 查询参数对象
     * @returns 第一条匹配记录，无匹配返回 null
     */
    selectOne(queryParam: QueryParam): Record<string, unknown> | null;
    /**
     * 统计符合条件的记录总数。
     *
     * @param table 表名
     * @param conditions 条件对象列表
     * @returns 记录数
     */
    count(table: string, conditions?: Condition[]): number;
    /**
     * 在事务中执行多个操作，保证原子性。
     *
     * @param operations 事务操作对象列表
     * @returns 事务是否执行成功
     */
    transaction(operations: Operation[]): boolean;
    /**
     * 执行原生 SQL（用于 DDL 建表等场景）。
     *
     * @param sql SQL 语句
     * @param params 绑定参数
     * @returns 影响行数
     */
    executeRaw(sql: string, params?: unknown[]): number;
    /**
     * 执行原生查询 SQL 并返回结果。
     *
     * @param sql 查询 SQL
     * @param params 绑定参数
     * @returns 查询结果列表
     */
    queryRaw<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
    /**
     * 获取数据库文件磁盘占用大小（字节）。
     */
    getDiskUsage(): number;
    /**
     * 关闭数据库连接，释放资源。
     *
     * 注：closeDB 为终态操作，执行后不可通过 enableDB(true) 恢复，需重新初始化组件。
     */
    close(): void;
}
//# sourceMappingURL=RelationDBRepository.d.ts.map