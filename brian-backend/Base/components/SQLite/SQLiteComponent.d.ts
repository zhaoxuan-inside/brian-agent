/**
 * @fileoverview SQLite 数据库组件。
 *
 * 封装 better-sqlite3，提供底层数据库连接管理能力。
 * RelationDBProvider 的 SQLiteRelationDBRepository 继承此组件，
 * 复用连接管理、DDL 执行等基础能力。
 *
 * 设计目标：
 * - 将 SQLite 驱动的连接管理、初始化、关闭等通用逻辑抽取为独立组件；
 * - Provider 通过继承此组件获得 SQLite 操作能力，关注业务逻辑而非连接管理；
 * - 组件可独立使用，也可被多个 Provider 共享。
 */
import type { Database, Statement } from 'better-sqlite3';
/**
 * SQLite 组件选项。
 */
export interface SQLiteComponentOptions {
    /** 数据库文件路径 */
    dbPath: string;
    /** 是否启用 WAL 模式（默认 true） */
    wal?: boolean;
    /** 是否启用外键约束（默认 true） */
    foreignKeys?: boolean;
    /** 是否启用 verbose 日志（默认 false） */
    verbose?: boolean;
}
/**
 * SQLite 数据库组件。
 *
 * 封装 better-sqlite3 的连接管理、执行、查询等基础能力。
 * 作为 RelationDBProvider 的基类，也可独立使用。
 *
 * 用法示例（独立使用）：
 * ```typescript
 * const sqlite = new SQLiteComponent({ dbPath: './data/app.db' });
 * sqlite.exec('CREATE TABLE IF NOT EXISTS foo (id TEXT PRIMARY KEY)');
 * const stmt = sqlite.prepare('INSERT INTO foo (id) VALUES (?)');
 * stmt.run('bar');
 * sqlite.close();
 * ```
 *
 * 用法示例（继承使用）：
 * ```typescript
 * class MyRepository extends SQLiteComponent {
 *   constructor() { super({ dbPath: './data/app.db' }); }
 *   // 业务方法...
 * }
 * ```
 */
export declare class SQLiteComponent {
    /** 底层数据库实例 */
    protected readonly db: Database;
    /** 数据库文件路径 */
    protected readonly dbPath: string;
    /**
     * @param options 组件选项
     */
    constructor(options: SQLiteComponentOptions);
    /**
     * 执行 SQL 语句（DDL、批量操作等无返回值语句）。
     *
     * @param sql SQL 语句
     */
    exec(sql: string): void;
    /**
     * 预编译 SQL 语句，返回 Statement 对象。
     *
     * @param sql SQL 语句
     * @returns 预编译语句
     */
    prepare(sql: string): Statement;
    /**
     * 执行 PRAGMA 语句。
     *
     * @param pragma PRAGMA 语句
     * @returns PRAGMA 结果
     */
    pragma(pragma: string): unknown;
    /**
     * 获取数据库文件磁盘占用大小（字节）。
     *
     * @returns 文件大小（字节）
     */
    getDiskUsage(): number;
    /**
     * 获取底层数据库实例（供高级用法使用）。
     *
     * @returns better-sqlite3 Database 实例
     */
    getDatabase(): Database;
    /**
     * 关闭数据库连接，释放资源。
     *
     * 注：此为终态操作，执行后不可恢复，需重新创建组件实例。
     */
    close(): void;
    /**
     * 执行 WAL checkpoint 以回收 WAL 文件磁盘空间。
     *
     * 在 WAL 模式下，写事务会追加到 WAL 文件；长时间不 checkpoint 会导致 WAL 文件
     * 持续膨胀（已观测到 graph.db-wal 达 608MB）。在批量写入后调用此方法可回收磁盘。
     *
     * @param mode checkpoint 模式：PASSIVE（默认，不阻塞）、FULL（阻塞写事务）、
     *   RESTART（阻塞写事务）、TRUNCATE（阻塞写事务，截断 WAL 文件至 0）
     * @returns checkpoint 结果（busy: 是否有未完成的读事务阻塞了 checkpoint）
     */
    walCheckpoint(mode?: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE'): {
        busy: boolean;
        log: number;
        checkpointed: number;
    };
}
//# sourceMappingURL=SQLiteComponent.d.ts.map