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

import type { RelationDBRepository } from '../domain/RelationDBRepository';
import {
  DBContext,
  InsertDBInput,
  InsertDBOutput,
  DeleteDBInput,
  DeleteDBOutput,
  UpdateDBInput,
  UpdateDBOutput,
  SelectDBInput,
  SelectDBOutput,
  SelectOneDBInput,
  SelectOneDBOutput,
  CountDBInput,
  CountDBOutput,
  TransactionDBInput,
  TransactionDBOutput,
  VisualizedDBInput,
  VisualizedDBOutput,
  EnableDBInput,
  EnableDBOutput,
  CloseDBInput,
  CloseDBOutput,
  RELATIONDB_CONFIG_TABLE,
  RELATIONDB_DEFAULT_CONFIGS,
} from '../domain/types';
import { ComponentDisabledError, DatabaseError } from '../../shared/errors';
import { Operator } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
import { IdGenerator } from '../../shared/id/IdGenerator';

/**
 * RelationDBProvider 应用服务。
 *
 * 通过 Repository 接口操作关系数据库，所有配置项（含启用/禁用状态）
 * 统一存储于 relationdb_config 配置表。
 */
export class RelationDBService {
  /** 运行时内存中的启用状态，供各操作快速校验 */
  private enabled = true;

  /** 是否已执行 closeDB（终态标记） */
  private closed = false;

  /**
   * @param repository 关系数据库仓储实现
   */
  constructor(private readonly repository: RelationDBRepository) {}

  // -------------------------------------------------------------------------
  // 初始化
  // -------------------------------------------------------------------------

  /**
   * 初始化组件：恢复 enabled 状态并写入默认配置。
   *
   * PRD 5.7 条：组件初始化时从 relationdb_config 读取 enabled 状态以恢复上次的可用状态。
   */
  async initialize(): Promise<void> {
    // 写入默认配置（不覆盖已有值）
    for (const item of RELATIONDB_DEFAULT_CONFIGS) {
      const exists = this.repository.count(RELATIONDB_CONFIG_TABLE, [
        { field: 'config_key', operator: Operator.EQ, value: item.config_key },
      ]);
      if (exists === 0) {
        const data: DataObject[] = [
          { field: 'config_key', value: item.config_key },
          { field: 'config_value', value: item.config_value },
          { field: 'value_type', value: item.value_type },
          { field: 'description', value: item.description },
          { field: 'updated', value: IdGenerator.now() },
        ];
        this.repository.insert(RELATIONDB_CONFIG_TABLE, data);
      }
    }

    // 恢复 enabled 状态
    const row = this.repository.selectOne({
      table: RELATIONDB_CONFIG_TABLE,
      conditions: [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ],
    });
    this.enabled = row ? String(row.config_value) === 'true' : true;
  }

  /**
   * 校验组件是否启用，未启用时抛出 ComponentDisabledError。
   */
  private ensureEnabled(): void {
    if (this.closed) {
      throw new DatabaseError('关系数据库已关闭（closeDB 为终态操作），需重新初始化组件');
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('DB');
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
  async insertDB(
    input: InsertDBInput,
    _context: DBContext,
    output: InsertDBOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.affected_rows = this.repository.insert(input.table, input.data);
    return true;
  }

  /**
   * 删除记录（deleteDB）。
   *
   * PRD 3.2 条。
   */
  async deleteDB(
    input: DeleteDBInput,
    _context: DBContext,
    output: DeleteDBOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.affected_rows = this.repository.delete(input.table, input.conditions);
    return true;
  }

  /**
   * 更新记录（updateDB）。
   *
   * PRD 3.3 条。
   */
  async updateDB(
    input: UpdateDBInput,
    _context: DBContext,
    output: UpdateDBOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.affected_rows = this.repository.update(
      input.table,
      input.data,
      input.conditions,
    );
    return true;
  }

  /**
   * 查询记录列表（selectDB）。
   *
   * PRD 3.4 条。
   */
  async selectDB(
    input: SelectDBInput,
    _context: DBContext,
    output: SelectDBOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.rows = this.repository.select(input.query_param);
    // 若有分页，同时查询不分页的总数
    output.total = this.repository.count(
      input.query_param.table,
      input.query_param.conditions,
    );
    return true;
  }

  /**
   * 查询单条记录（selectOneDB）。
   *
   * PRD 3.5 条。
   */
  async selectOneDB(
    input: SelectOneDBInput,
    _context: DBContext,
    output: SelectOneDBOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.row = this.repository.selectOne(input.query_param);
    return true;
  }

  /**
   * 统计记录数（countDB）。
   *
   * PRD 3.6 条。
   */
  async countDB(
    input: CountDBInput,
    _context: DBContext,
    output: CountDBOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    output.count = this.repository.count(input.table, input.conditions);
    return true;
  }

  /**
   * 执行事务（transactionDB）。
   *
   * PRD 3.7 条：在事务中执行多个操作，保证原子性。
   */
  async transactionDB(
    input: TransactionDBInput,
    _context: DBContext,
    output: TransactionDBOutput,
  ): Promise<boolean> {
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
  async visualizedDB(
    input: VisualizedDBInput,
    _context: DBContext,
    output: VisualizedDBOutput,
  ): Promise<boolean> {
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
    } else if (scope === 'volume') {
      // 数据量：各表记录数
      const tables = this.repository.queryRaw<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      );
      const volume: Record<string, number> = {};
      for (const t of tables) {
        volume[t.name] = this.repository.count(t.name);
      }
      output.data = { tables: volume };
    } else if (scope === 'diskUsage') {
      output.data = { disk_usage_bytes: this.repository.getDiskUsage() };
    } else {
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
  async enableDB(
    input: EnableDBInput,
    _context: DBContext,
    _output: EnableDBOutput,
  ): Promise<boolean> {
    if (this.closed) {
      throw new DatabaseError('关系数据库已关闭（closeDB 为终态操作），需重新初始化组件');
    }

    this.enabled = input.enable;
    // 持久化 enabled 状态
    const conditions: Condition[] = [
      { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
    ];
    const data: DataObject[] = [
      { field: 'config_value', value: String(input.enable) },
      { field: 'updated', value: IdGenerator.now() },
    ];
    this.repository.update(RELATIONDB_CONFIG_TABLE, data, conditions);
    return true;
  }

  /**
   * 关闭数据库连接（closeDB）。
   *
   * PRD 5.8 条：closeDB 为系统关闭时的终态释放（不可恢复，需重新初始化组件）。
   */
  async closeDB(
    _input: CloseDBInput,
    _context: DBContext,
    _output: CloseDBOutput,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    this.repository.close();
    return true;
  }
}
