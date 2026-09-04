"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelationDBService = void 0;
const types_1 = require("../domain/types");
const errors_1 = require("../../shared/errors");
const query_1 = require("../../shared/query");
const IdGenerator_1 = require("../../ToolProvider/IdGenerator");
/**
 * RelationDBProvider 应用服务。
 *
 * 通过 Repository 接口操作关系数据库，所有配置项（含启用/禁用状态）
 * 统一存储于 relationdb_config 配置表。
 */
class RelationDBService {
    repository;
    /** 运行时内存中的启用状态，供各操作快速校验 */
    enabled = true;
    /** 是否已执行 closeDB（终态标记） */
    closed = false;
    /**
     * @param repository 关系数据库仓储实现
     */
    constructor(repository) {
        this.repository = repository;
    }
    // -------------------------------------------------------------------------
    // 初始化
    // -------------------------------------------------------------------------
    /**
     * 初始化组件：恢复 enabled 状态并写入默认配置。
     *
     * PRD 5.7 条：组件初始化时从 relationdb_config 读取 enabled 状态以恢复上次的可用状态。
     */
    async initialize() {
        // 首次初始化时写入默认 enabled 配置（幂等，不覆盖已有值）
        const existing = this.repository.selectOne({
            table: types_1.RELATIONDB_CONFIG_TABLE,
            conditions: [
                { field: 'config_key', operator: query_1.Operator.EQ, value: 'enabled' },
            ],
        });
        if (!existing) {
            this.repository.insert(types_1.RELATIONDB_CONFIG_TABLE, [
                { field: 'config_key', value: 'enabled' },
                { field: 'config_value', value: 'true' },
                { field: 'value_type', value: 'BOOLEAN' },
                { field: 'description', value: '关系数据库组件是否启用' },
                { field: 'updated', value: IdGenerator_1.IdGenerator.now() },
            ]);
        }
        // 恢复 enabled 状态
        const row = this.repository.selectOne({
            table: types_1.RELATIONDB_CONFIG_TABLE,
            conditions: [
                { field: 'config_key', operator: query_1.Operator.EQ, value: 'enabled' },
            ],
        });
        this.enabled = row ? String(row.config_value) === 'true' : true;
    }
    /**
     * 校验组件是否启用，未启用时抛出 ComponentDisabledError。
     */
    ensureEnabled() {
        if (this.closed) {
            throw new errors_1.DatabaseError('关系数据库已关闭（closeDB 为终态操作），需重新初始化组件');
        }
        if (!this.enabled) {
            throw new errors_1.ComponentDisabledError('DB');
        }
    }
    // -------------------------------------------------------------------------
    // CURD 操作
    // -------------------------------------------------------------------------
    /**
     * 新增记录（insertDB）。
     *
     * PRD 3.1 条。
     */
    async insertDB(input, output, _context, _metrics, _report) {
        this.ensureEnabled();
        output.affected_rows = this.repository.insert(input.table, input.data);
        return true;
    }
    /**
     * 删除记录（deleteDB）。
     *
     * PRD 3.2 条。
     */
    async deleteDB(input, output, _context, _metrics, _report) {
        this.ensureEnabled();
        output.affected_rows = this.repository.delete(input.table, input.conditions);
        return true;
    }
    /**
     * 更新记录（updateDB）。
     *
     * PRD 3.3 条。
     */
    async updateDB(input, output, _context, _metrics, _report) {
        this.ensureEnabled();
        output.affected_rows = this.repository.update(input.table, input.data, input.conditions);
        return true;
    }
    /**
     * 查询记录列表（selectDB）。
     *
     * PRD 3.4 条。
     */
    async selectDB(input, output, _context, _metrics, _report) {
        this.ensureEnabled();
        output.rows = this.repository.select(input.query_param);
        // 若有分页，同时查询不分页的总数
        output.total = this.repository.count(input.query_param.table, input.query_param.conditions);
        return true;
    }
    /**
     * 查询单条记录（selectOneDB）。
     *
     * PRD 3.5 条。
     */
    async selectOneDB(input, output, _context, _metrics, _report) {
        this.ensureEnabled();
        output.row = this.repository.selectOne(input.query_param);
        return true;
    }
    /**
     * 统计记录数（countDB）。
     *
     * PRD 3.6 条。
     */
    async countDB(input, output, _context, _metrics, _report) {
        this.ensureEnabled();
        output.count = this.repository.count(input.table, input.conditions);
        return true;
    }
    /**
     * 执行事务（transactionDB）。
     *
     * PRD 3.7 条：在事务中执行多个操作，保证原子性。
     */
    async transactionDB(input, output, _context, _metrics, _report) {
        this.ensureEnabled();
        const ok = this.repository.transaction(input.operations);
        if (!ok) {
            output.error = '事务执行失败，已回滚';
            output.error_code = 'TRANSACTION_FAILED';
        }
        return ok;
    }
    // -------------------------------------------------------------------------
    // 可视化与运维
    // -------------------------------------------------------------------------
    /**
     * 可视化数据（visualizedDB）。
     *
     * PRD 3.8 条。
     */
    async visualizedDB(input, output, _context, _metrics, _report) {
        this.ensureEnabled();
        const scope = String(input.scope);
        if (scope === 'health') {
            // 健康状态：连接状态、响应时间
            const start = Date.now();
            this.repository.queryRaw('SELECT 1');
            output.data = {
                connected: true,
                response_time_ms: Date.now() - start,
            };
        }
        else if (scope === 'volume') {
            // 数据量：各表记录数
            const tables = this.repository.queryRaw("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            const volume = {};
            for (const t of tables) {
                volume[t.name] = this.repository.count(t.name);
            }
            output.data = { tables: volume };
        }
        else if (scope === 'diskUsage') {
            output.data = { disk_usage_bytes: this.repository.getDiskUsage() };
        }
        else {
            output.error = `未知的可视化范围: ${scope}`;
            output.error_code = 'INVALID_SCOPE';
            return false;
        }
        return true;
    }
    /**
     * 启用/禁用关系数据库（enableDB）。
     *
     * PRD 5.8 条：enableDB 为运行时启用/禁用（可恢复）。
     * 状态同步持久化到 relationdb_config，组件初始化时恢复。
     */
    async enableDB(input, _output, _context, _metrics, _report) {
        if (this.closed) {
            throw new errors_1.DatabaseError('关系数据库已关闭（closeDB 为终态操作），需重新初始化组件');
        }
        this.enabled = input.enable;
        // 持久化 enabled 状态
        const conditions = [
            { field: 'config_key', operator: query_1.Operator.EQ, value: 'enabled' },
        ];
        const data = [
            { field: 'config_value', value: String(input.enable) },
            { field: 'updated', value: IdGenerator_1.IdGenerator.now() },
        ];
        this.repository.update(types_1.RELATIONDB_CONFIG_TABLE, data, conditions);
        return true;
    }
    /**
     * 关闭数据库连接（closeDB）。
     *
     * PRD 5.8 条：closeDB 为系统关闭时的终态释放（不可恢复，需重新初始化组件）。
     */
    async closeDB(_input, _output, _context, _metrics, _report) {
        this.enabled = false;
        this.closed = true;
        this.repository.close();
        return true;
    }
}
exports.RelationDBService = RelationDBService;
//# sourceMappingURL=RelationDBService.js.map