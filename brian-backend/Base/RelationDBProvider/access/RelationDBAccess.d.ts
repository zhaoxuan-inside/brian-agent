/**
 * @fileoverview RelationDBProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 2. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 3. 实现 {@link IConfigStorage} 接口，供其他 Provider 操作各自的配置表；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用（方法签名保持 input/output 序列化友好）。
 *
 * 其他 Provider（LLMProvider、MCPProvider 等）通过本层访问关系数据库，
 * 不直接接触 Service 或 Repository。
 */
import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { SQLiteRelationDBOptions } from '../infrastructure/SQLiteRelationDBRepository';
import { DBContext, InsertDBInput, InsertDBOutput, DeleteDBInput, DeleteDBOutput, UpdateDBInput, UpdateDBOutput, SelectDBInput, SelectDBOutput, SelectOneDBInput, SelectOneDBOutput, CountDBInput, CountDBOutput, TransactionDBInput, TransactionDBOutput, VisualizedDBInput, VisualizedDBOutput, EnableDBInput, EnableDBOutput, CloseDBInput, CloseDBOutput } from '../domain/types';
import { type Logger } from '../../shared/aop/AopProxy';
import type { IConfigStorage } from '../../shared/config/ConfigService';
import type { Condition } from '../../shared/query';
/**
 * RelationDBProvider 接入层。
 *
 * 作为关系数据库的唯一操作入口，上层（其他 Provider、application 层）
 * 通过本类访问关系数据库。
 *
 * 用法示例：
 * ```typescript
 * const access = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await access.initialize();
 *
 * const output = new InsertDBOutput();
 * await access.insertDB(
 *   { table: 'soul', data: [{ field: 'id', value: 'xxx' }] },
 *   output, new DBContext(),
 * );
 * ```
 */
export declare class RelationDBAccess implements IConfigStorage {
    private readonly repository;
    private readonly service;
    /**
     * @param options SQLite 选项
     * @param logger 可选日志记录器
     */
    constructor(options: SQLiteRelationDBOptions, logger?: Logger);
    /**
     * 初始化组件：创建配置表、恢复 enabled 状态、写入默认配置。
     *
     * 必须在首次使用前调用。
     */
    initialize(): Promise<void>;
    /** 新增记录 */
    insertDB(input: InsertDBInput, output: InsertDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>;
    /** 删除记录 */
    deleteDB(input: DeleteDBInput, output: DeleteDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>;
    /** 更新记录 */
    updateDB(input: UpdateDBInput, output: UpdateDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>;
    /** 查询记录列表 */
    selectDB(input: SelectDBInput, output: SelectDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>;
    /** 查询单条记录 */
    selectOneDB(input: SelectOneDBInput, output: SelectOneDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>;
    /** 统计记录数 */
    countDB(input: CountDBInput, output: CountDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>;
    /** 执行事务 */
    transactionDB(input: TransactionDBInput, output: TransactionDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>;
    /** 可视化数据 */
    visualizedDB(input: VisualizedDBInput, output: VisualizedDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>;
    /** 启用/禁用关系数据库 */
    enableDB(input: EnableDBInput, output: EnableDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>;
    /** 关闭数据库连接（终态操作） */
    closeDB(input: CloseDBInput, output: CloseDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>;
    /** {@inheritDoc} */
    selectOne(table: string, conditions: Condition[]): Promise<Record<string, unknown> | null>;
    /**
     * 查询记录列表（便捷方法，供依赖 Provider 使用）。
     *
     * @param table 表名
     * @param options 查询选项（conditions / order_by / page / fields）
     * @returns 匹配记录列表
     */
    select(table: string, options?: {
        conditions?: Condition[];
        order_by?: import('../../shared/query').OrderBy[];
        page?: import('../../shared/query').Page;
        fields?: string[];
    }): Promise<Array<Record<string, unknown>>>;
    /** {@inheritDoc} */
    insert(table: string, data: Array<{
        field: string;
        value: unknown;
    }>): Promise<number>;
    /** {@inheritDoc} */
    update(table: string, data: Array<{
        field: string;
        value: unknown;
    }>, conditions: Condition[]): Promise<number>;
    /**
     * 删除记录（便捷方法，供依赖 Provider 使用）。
     *
     * @param table 表名
     * @param conditions 删除条件（可选，不指定则删除全表）
     * @returns 影响行数
     */
    delete(table: string, conditions?: Condition[]): Promise<number>;
    /** {@inheritDoc} */
    count(table: string, conditions?: Condition[]): Promise<number>;
    /**
     * 执行原生 DDL 语句（建表等）。
     *
     * 供各 Provider 的 infrastructure 层初始化表结构使用。
     */
    executeRaw(sql: string, params?: unknown[]): number;
    /**
     * 执行原生查询 SQL。
     */
    queryRaw<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
    /**
     * 在事务中执行多个操作。
     *
     * 供各 Provider 在 infrastructure 层执行复杂事务使用。
     */
    transactionRaw(operations: import('../../shared/query').Operation[]): boolean;
    /**
     * 执行 WAL checkpoint 以回收 WAL 文件磁盘空间。
     *
     * 在 WAL 模式下，写事务会追加到 WAL 文件；长时间不 checkpoint 会导致 WAL 文件
     * 持续膨胀。在批量写入后调用此方法可回收磁盘空间。
     *
     * @param mode checkpoint 模式：PASSIVE（默认，不阻塞）、TRUNCATE（截断 WAL 文件至 0）
     * @returns checkpoint 结果
     */
    walCheckpoint(mode?: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE'): {
        busy: boolean;
        log: number;
        checkpointed: number;
    };
}
//# sourceMappingURL=RelationDBAccess.d.ts.map