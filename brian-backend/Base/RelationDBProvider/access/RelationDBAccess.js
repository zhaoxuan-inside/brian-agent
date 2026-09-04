"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelationDBAccess = void 0;
const SQLiteRelationDBRepository_1 = require("../infrastructure/SQLiteRelationDBRepository");
const RelationDBService_1 = require("../application/RelationDBService");
const types_1 = require("../domain/types");
const AopProxy_1 = require("../../shared/aop/AopProxy");
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
class RelationDBAccess {
    repository;
    service;
    /**
     * @param options SQLite 选项
     * @param logger 可选日志记录器
     */
    constructor(options, logger) {
        this.repository = new SQLiteRelationDBRepository_1.SQLiteRelationDBRepository(options);
        const rawService = new RelationDBService_1.RelationDBService(this.repository);
        // 通过代理模式增加切面注入能力（日志记录、耗时统计）
        this.service = AopProxy_1.AopProxy.wrap(rawService, { logger });
    }
    /**
     * 初始化组件：创建配置表、恢复 enabled 状态、写入默认配置。
     *
     * 必须在首次使用前调用。
     */
    async initialize() {
        await this.service.initialize();
    }
    // -------------------------------------------------------------------------
    // CURD 操作（委托 Service）
    // -------------------------------------------------------------------------
    /** 新增记录 */
    async insertDB(input, output, context, metrics, report) {
        return this.service.insertDB(input, output, context, metrics, report);
    }
    /** 删除记录 */
    async deleteDB(input, output, context, metrics, report) {
        return this.service.deleteDB(input, output, context, metrics, report);
    }
    /** 更新记录 */
    async updateDB(input, output, context, metrics, report) {
        return this.service.updateDB(input, output, context, metrics, report);
    }
    /** 查询记录列表 */
    async selectDB(input, output, context, metrics, report) {
        return this.service.selectDB(input, output, context, metrics, report);
    }
    /** 查询单条记录 */
    async selectOneDB(input, output, context, metrics, report) {
        return this.service.selectOneDB(input, output, context, metrics, report);
    }
    /** 统计记录数 */
    async countDB(input, output, context, metrics, report) {
        return this.service.countDB(input, output, context, metrics, report);
    }
    /** 执行事务 */
    async transactionDB(input, output, context, metrics, report) {
        return this.service.transactionDB(input, output, context, metrics, report);
    }
    // -------------------------------------------------------------------------
    // 可视化与运维
    // -------------------------------------------------------------------------
    /** 可视化数据 */
    async visualizedDB(input, output, context, metrics, report) {
        return this.service.visualizedDB(input, output, context, metrics, report);
    }
    /** 启用/禁用关系数据库 */
    async enableDB(input, output, context, metrics, report) {
        return this.service.enableDB(input, output, context, metrics, report);
    }
    /** 关闭数据库连接（终态操作） */
    async closeDB(input, output, context, metrics, report) {
        return this.service.closeDB(input, output, context, metrics, report);
    }
    // -------------------------------------------------------------------------
    // IConfigStorage 实现（供其他 Provider 的 ConfigService 使用）
    // -------------------------------------------------------------------------
    /** {@inheritDoc} */
    async selectOne(table, conditions) {
        const output = new types_1.SelectOneDBOutput();
        const ok = await this.service.selectOneDB({ query_param: { table, conditions } }, output, new types_1.DBContext());
        return ok ? output.row : null;
    }
    /**
     * 查询记录列表（便捷方法，供依赖 Provider 使用）。
     *
     * @param table 表名
     * @param options 查询选项（conditions / order_by / page / fields）
     * @returns 匹配记录列表
     */
    async select(table, options) {
        const output = new types_1.SelectDBOutput();
        await this.service.selectDB({
            query_param: {
                table,
                conditions: options?.conditions,
                order_by: options?.order_by,
                page: options?.page,
                fields: options?.fields,
            },
        }, output, new types_1.DBContext());
        return output.rows;
    }
    /** {@inheritDoc} */
    async insert(table, data) {
        const output = new types_1.InsertDBOutput();
        await this.service.insertDB({ table, data }, output, new types_1.DBContext());
        return output.affected_rows;
    }
    /** {@inheritDoc} */
    async update(table, data, conditions) {
        const output = new types_1.UpdateDBOutput();
        await this.service.updateDB({ table, data, conditions }, output, new types_1.DBContext());
        return output.affected_rows;
    }
    /**
     * 删除记录（便捷方法，供依赖 Provider 使用）。
     *
     * @param table 表名
     * @param conditions 删除条件（可选，不指定则删除全表）
     * @returns 影响行数
     */
    async delete(table, conditions) {
        const output = new types_1.DeleteDBOutput();
        await this.service.deleteDB({ table, conditions }, output, new types_1.DBContext());
        return output.affected_rows;
    }
    /** {@inheritDoc} */
    async count(table, conditions) {
        const output = new types_1.CountDBOutput();
        await this.service.countDB({ table, conditions }, output, new types_1.DBContext());
        return output.count;
    }
    /**
     * 执行原生 DDL 语句（建表等）。
     *
     * 供各 Provider 的 infrastructure 层初始化表结构使用。
     */
    executeRaw(sql, params) {
        return this.repository.executeRaw(sql, params);
    }
    /**
     * 执行原生查询 SQL。
     */
    queryRaw(sql, params) {
        return this.repository.queryRaw(sql, params);
    }
    /**
     * 在事务中执行多个操作。
     *
     * 供各 Provider 在 infrastructure 层执行复杂事务使用。
     */
    transactionRaw(operations) {
        return this.repository.transaction(operations);
    }
    /**
     * 执行 WAL checkpoint 以回收 WAL 文件磁盘空间。
     *
     * 在 WAL 模式下，写事务会追加到 WAL 文件；长时间不 checkpoint 会导致 WAL 文件
     * 持续膨胀。在批量写入后调用此方法可回收磁盘空间。
     *
     * @param mode checkpoint 模式：PASSIVE（默认，不阻塞）、TRUNCATE（截断 WAL 文件至 0）
     * @returns checkpoint 结果
     */
    walCheckpoint(mode = 'PASSIVE') {
        return this.repository.walCheckpoint(mode);
    }
}
exports.RelationDBAccess = RelationDBAccess;
//# sourceMappingURL=RelationDBAccess.js.map