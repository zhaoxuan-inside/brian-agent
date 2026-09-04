/**
 * @fileoverview SQLite 关系数据库仓储实现。
 *
 * 继承 {@link SQLiteComponent} 组件，复用 SQLite 连接管理、DDL 执行等基础能力，
 * 在此基础上实现 {@link RelationDBRepository} 接口的业务方法（CURD、事务、查询）。
 *
 * PRD 1.8 条：集成的关系数据库为 SQLite。
 */
import type { RelationDBRepository } from '../domain/RelationDBRepository';
import type { Condition, DataObject, Operation, QueryParam } from '../../shared/query';
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
export declare class SQLiteRelationDBRepository extends SQLiteComponent implements RelationDBRepository {
    /**
     * @param options 选项
     */
    constructor(options: SQLiteRelationDBOptions);
    /**
     * 确保 relationdb_config 表存在。
     *
     * PRD 4.1 条：组件初始化时需要先确保 relationdb 库和 relationdb_config 表存在。
     */
    private ensureConfigTable;
    /** {@inheritDoc} */
    insert(table: string, data: DataObject[]): number;
    /** {@inheritDoc} */
    delete(table: string, conditions?: Condition[]): number;
    /** {@inheritDoc} */
    update(table: string, data: DataObject[], conditions?: Condition[]): number;
    /** {@inheritDoc} */
    select(queryParam: QueryParam): Array<Record<string, unknown>>;
    /** {@inheritDoc} */
    selectOne(queryParam: QueryParam): Record<string, unknown> | null;
    /** {@inheritDoc} */
    count(table: string, conditions?: Condition[]): number;
    /** {@inheritDoc} */
    transaction(operations: Operation[]): boolean;
    /** {@inheritDoc} */
    executeRaw(sql: string, params?: unknown[]): number;
    /** {@inheritDoc} */
    queryRaw<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
    /**
     * 标识符转义。
     */
    private quote;
}
//# sourceMappingURL=SQLiteRelationDBRepository.d.ts.map