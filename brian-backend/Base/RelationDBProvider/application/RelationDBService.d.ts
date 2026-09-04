/**
 * @fileoverview RelationDBProvider 应用服务层。
 *
 * DDD 中 application 层编排领域逻辑，依赖 domain 层的 Repository 接口，
 * 不直接依赖具体的 infrastructure 实现。
 *
 * 实现所有用例：insertDB / deleteDB / updateDB / selectDB / selectOneDB /
 * countDB / transactionDB / visualizedDB / enableDB / closeDB。
 *
 * 所有方法返回 Promise<boolean>，true 表示执行完成；
 * 实际数据通过 output 参数（引用传递）回传。
 */
import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBRepository } from '../domain/RelationDBRepository';
import { DBContext, InsertDBInput, InsertDBOutput, DeleteDBInput, DeleteDBOutput, UpdateDBInput, UpdateDBOutput, SelectDBInput, SelectDBOutput, SelectOneDBInput, SelectOneDBOutput, CountDBInput, CountDBOutput, TransactionDBInput, TransactionDBOutput, VisualizedDBInput, VisualizedDBOutput, EnableDBInput, EnableDBOutput, CloseDBInput, CloseDBOutput } from '../domain/types';
/**
 * RelationDBProvider 应用服务。
 *
 * 通过 Repository 接口操作关系数据库，所有配置项（含启用/禁用状态）
 * 统一存储于 relationdb_config 配置表。
 */
export declare class RelationDBService {
    private readonly repository;
    /** 运行时内存中的启用状态，供各操作快速校验 */
    private enabled;
    /** 是否已执行 closeDB（终态标记） */
    private closed;
    /**
     * @param repository 关系数据库仓储实现
     */
    constructor(repository: RelationDBRepository);
    /**
     * 初始化组件：恢复 enabled 状态并写入默认配置。
     *
     * PRD 5.7 条：组件初始化时从 relationdb_config 读取 enabled 状态以恢复上次的可用状态。
     */
    initialize(): Promise<void>;
    /**
     * 校验组件是否启用，未启用时抛出 ComponentDisabledError。
     */
    private ensureEnabled;
    /**
     * 新增记录（insertDB）。
     *
     * PRD 3.1 条。
     */
    insertDB(input: InsertDBInput, output: InsertDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>;
    /**
     * 删除记录（deleteDB）。
     *
     * PRD 3.2 条。
     */
    deleteDB(input: DeleteDBInput, output: DeleteDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>;
    /**
     * 更新记录（updateDB）。
     *
     * PRD 3.3 条。
     */
    updateDB(input: UpdateDBInput, output: UpdateDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>;
    /**
     * 查询记录列表（selectDB）。
     *
     * PRD 3.4 条。
     */
    selectDB(input: SelectDBInput, output: SelectDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>;
    /**
     * 查询单条记录（selectOneDB）。
     *
     * PRD 3.5 条。
     */
    selectOneDB(input: SelectOneDBInput, output: SelectOneDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>;
    /**
     * 统计记录数（countDB）。
     *
     * PRD 3.6 条。
     */
    countDB(input: CountDBInput, output: CountDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>;
    /**
     * 执行事务（transactionDB）。
     *
     * PRD 3.7 条：在事务中执行多个操作，保证原子性。
     */
    transactionDB(input: TransactionDBInput, output: TransactionDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>;
    /**
     * 可视化数据（visualizedDB）。
     *
     * PRD 3.8 条。
     */
    visualizedDB(input: VisualizedDBInput, output: VisualizedDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>;
    /**
     * 启用/禁用关系数据库（enableDB）。
     *
     * PRD 5.8 条：enableDB 为运行时启用/禁用（可恢复）。
     * 状态同步持久化到 relationdb_config，组件初始化时恢复。
     */
    enableDB(input: EnableDBInput, _output: EnableDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>;
    /**
     * 关闭数据库连接（closeDB）。
     *
     * PRD 5.8 条：closeDB 为系统关闭时的终态释放（不可恢复，需重新初始化组件）。
     */
    closeDB(_input: CloseDBInput, _output: CloseDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>;
}
//# sourceMappingURL=RelationDBService.d.ts.map