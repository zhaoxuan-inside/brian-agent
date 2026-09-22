/**
 * @fileoverview LogProvider 应用服务层。
 *
 * 日志只写入 SQLite（log_record 表），不写入本地文件。
 * 日志规则（log_rule）和配置项（log_config）存储于关系数据库。
 *
 * 日志老化策略（从 log_config 表读取，运行时实时生效）：
 * - retention_days：日志保留天数，默认 30 天，超过自动清理；
 * - max_log_count：日志最大保留条数，默认 70 万条，超过自动清理最旧记录。
 *
 * 实现所有用例：addLog / soLogById / soLog / delLog / countLog / visualizedLog / enableLog。
 */

import { Metrics } from '../../shared/base/Metrics';
import { newRecord } from '../../shared/query';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import { ComponentDisabledError, ValidationError } from '../../shared/errors';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator } from '../../shared/query';
import type { Condition } from '../../shared/query';
import { buildLogConditions, rowToLogRecord } from '../domain/services/LogDomainService';
import {
  LogContext,
  LogRecord,
  LogRule,
  AddLogInput,
  AddLogOutput,
  GetLogInput,
  GetLogOutput,
  SoLogInput,
  SoLogOutput,
  DelLogInput,
  DelLogOutput,
  CountLogInput,
  CountLogOutput,
  VisualizedLogInput,
  VisualizedLogOutput,
  EnableLogInput,
  EnableLogOutput,
  ConfigLogInput,
  ConfigLogOutput,
  LOG_RULE_TABLE,
  LOG_CONFIG_TABLE,
  LOG_RECORD_TABLE,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_MAX_LOG_COUNT,
  DEFAULT_MIN_LEVEL,
} from '../domain/types';

/**
 * LogProvider 应用服务。
 *
 * 日志只写入 SQLite，不写文件。
 * 日志规则与配置项存储于关系数据库（log_rule / log_config 表）。
 */
export class LogService {
  private enabled = true;
  private readonly config: ConfigService;
  private rules: LogRule[] = [];
  /** 日志保留天数（从配置读取，缓存） */
  private retentionDays = DEFAULT_RETENTION_DAYS;
  /** 日志最大保留条数（从配置读取，缓存） */
  private maxLogCount = DEFAULT_MAX_LOG_COUNT;
  /** 默认日志级别（addLog 未指定 level 时使用，从配置读取，缓存） */
  private defaultLevel = 'INFO';
  /** 最低日志级别（低于此级别的日志不记录，从配置读取，缓存） */
  private minLevel = DEFAULT_MIN_LEVEL;

  /** 老化执行最小间隔（毫秒），避免高频写入时频繁全表扫描 */
  private static readonly AGING_INTERVAL_MS = 60_000;
  /** 上次老化执行时间戳 */
  private lastAgingAt = 0;

  /** 日志级别权重（用于 min_level 过滤比较，数值越大级别越高） */
  private static readonly LEVEL_WEIGHT: Record<string, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  };

  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, LOG_CONFIG_TABLE);
  }

  /** 初始化：写入默认配置、恢复 enabled 状态、加载日志规则、读取老化参数 */
  async initialize(): Promise<void> {
    // 写入默认配置项（仅在配置项不存在时写入，不覆盖已有值）
    await this.config.initDefaults([
      { config_key: 'enabled', config_value: 'true', value_type: 'BOOLEAN', description: 'LogProvider 是否启用' },
      { config_key: 'default_level', config_value: 'INFO', value_type: 'STRING', description: '默认日志级别' },
      { config_key: 'min_level', config_value: DEFAULT_MIN_LEVEL, value_type: 'STRING', description: '最低日志级别' },
      { config_key: 'retention_days', config_value: String(DEFAULT_RETENTION_DAYS), value_type: 'INT', description: '日志保留天数' },
      { config_key: 'max_log_count', config_value: String(DEFAULT_MAX_LOG_COUNT), value_type: 'INT', description: '日志最大保留条数' },
    ]);

    this.enabled = await this.config.getBoolean('enabled', true);
    this.defaultLevel = await this.config.getString('default_level', 'INFO') ?? 'INFO';
    this.minLevel = await this.config.getString('min_level', DEFAULT_MIN_LEVEL) ?? DEFAULT_MIN_LEVEL;
    this.retentionDays = await this.config.getInt('retention_days', DEFAULT_RETENTION_DAYS);
    this.maxLogCount = await this.config.getInt('max_log_count', DEFAULT_MAX_LOG_COUNT);
    await this.loadRules();
    await this.applyAging();
  }

  /** 从 log_rule 表加载规则到内存缓存 */
  private async loadRules(): Promise<void> {
    const rows = await this.relationDb.select(LOG_RULE_TABLE, {
      order_by: [{ field: 'source', direction: 'ASC' }],
    });
    this.rules = rows.map((r) => ({
      source: String(r.source),
      method: String(r.method),
      enable: Number(r.enable) === 1,
    }));
  }

  /**
   * 判断指定模块/方法的日志是否应该被记录。
   *
   * 匹配优先级：精确匹配 > 通配符匹配（`*`）。
   * 无规则时默认全量记录。
   */
  shouldLog(source: string, method: string): boolean {
    if (this.rules.length === 0) {
      return true;
    }
    let bestMatch: LogRule | null = null;
    let bestScore = -1;
    for (const rule of this.rules) {
      const sourceMatch = rule.source === source || rule.source === '*';
      const methodMatch = rule.method === method || rule.method === '*';
      if (!sourceMatch || !methodMatch) {
        continue;
      }
      let score = 0;
      if (rule.source === source) {
        score += 2;
      }
      if (rule.method === method) {
        score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = rule;
      }
    }
    return bestMatch ? bestMatch.enable : true;
  }

  // -------------------------------------------------------------------------
  // 老化策略
  // -------------------------------------------------------------------------

  /**
   * 执行日志老化：
   * 1. 删除超过 retention_days 天的日志；
   * 2. 若仍超过 max_log_count，删除最旧记录直至条数达标。
   *
   * @returns 被清理的日志条数
   */
  async applyAging(metrics?: Metrics): Promise<number> {
    let deleted = 0;

    // 1. 删除超过保留天数的日志
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    try {
      deleted += await this.relationDb.delete(LOG_RECORD_TABLE, [
        { field: 'created', operator: Operator.LT, value: cutoff },
      ]);
    } catch (err) {
      // 忽略异常
      metrics?.warn('LogService.applyAging 按保留天数清理过期日志失败', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2. 裁剪到最大条数（删除最旧记录）
    try {
      const total = await this.relationDb.count(LOG_RECORD_TABLE);
      const excess = total - this.maxLogCount;
      if (excess > 0) {
        this.relationDb.executeRaw(
          `DELETE FROM "${LOG_RECORD_TABLE}" WHERE "id" IN (SELECT "id" FROM "${LOG_RECORD_TABLE}" ORDER BY "created" ASC, "id" ASC LIMIT ?)`,
          [excess],
        );
        deleted += excess;
      }
    } catch (err) {
      // 忽略异常
      metrics?.warn('LogService.applyAging 按最大条数裁剪日志失败', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return deleted;
  }

  /** 节流触发老化，避免高频写入时频繁全表扫描 */
  private scheduleAging(metrics?: Metrics): void {
    const now = Date.now();
    if (now - this.lastAgingAt >= LogService.AGING_INTERVAL_MS) {
      this.lastAgingAt = now;
      this.applyAging(metrics).catch(() => {});
    }
  }

  // -------------------------------------------------------------------------
  // 日志管理
  // -------------------------------------------------------------------------

  /** 写入日志到 SQLite（addLog） */
  // ===== 修改后的方法（增加 min_level 过滤）=====
  async addLog(input: AddLogInput, output: AddLogOutput, _context: LogContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.level) {
      data.level = this.defaultLevel;
    }
    if (!data.source) {
      throw new ValidationError('source 不能为空');
    }
    if (!data.message) {
      throw new ValidationError('message 不能为空');
    }

    // 低于 min_level 的日志静默丢弃，不写入
    if (this.shouldDropByMinLevel(data.level)) {
      return true;
    }

    const logId = IdGenerator.generate();

    try {
      await this.relationDb.insert(
        LOG_RECORD_TABLE,
        newRecord({
          id: logId,
          level: data.level,
          source: data.source,
          message: data.message,
          trace_id: data.trace_id ?? null,
          caller: data.caller ?? null,
          work_id: data.work_id ?? null,
          run_id: data.run_id ?? null,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          elapsed_ms: data.elapsed_ms ?? null,
        }),
      );
    } catch {
      // SQLite 写入失败不影响业务。
      // 注意：LogService 自身是全系统日志落库通道，此处禁止再调用 metrics/logger
      // （会经 logger.warn → addLog 递归回本方法，写失败时无限递归），故保持静默。
    }

    this.scheduleAging(metrics);

    output.id = logId;
    return true;
  }

  /** 判断某级别日志是否应被 min_level 过滤丢弃 */
  private shouldDropByMinLevel(level: string): boolean {
    const weight = LogService.LEVEL_WEIGHT[level.toUpperCase()];
    if (weight === undefined) {
      return false;
    }
    const minWeight = LogService.LEVEL_WEIGHT[this.minLevel] ?? 0;
    return weight < minWeight;
  }

  /** 将数据库行转换为 LogRecord */
  private rowToLogRecord(row: Record<string, unknown>): LogRecord {
    return rowToLogRecord(row);
  }

  /** 获取日志（soLogById）- 从 SQLite 中查找第一条匹配记录 */
  async soLogById(input: GetLogInput, output: GetLogOutput, _context: LogContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    if (input.id) {
      const row = await this.relationDb.selectOne(LOG_RECORD_TABLE, [
        { field: 'id', operator: Operator.EQ, value: input.id },
      ]);
      if (row) {
        output.log = this.rowToLogRecord(row);
        return true;
      }
    }

    const soOutput = new SoLogOutput();
    const soInput = new SoLogInput();
    if (input.conditions) {
      for (const cond of input.conditions) {
        if (cond.field === 'source' && cond.operator === Operator.EQ) {
          soInput.source = String(cond.value);
        }
        if (cond.field === 'level' && cond.operator === Operator.EQ) {
          soInput.level = String(cond.value);
        }
      }
    }
    soInput.page = { current: 1, size: 1 };
    await this.soLog(soInput, soOutput, _context, metrics, report);
    output.log = soOutput.list.length > 0 ? soOutput.list[0] : null;
    return true;
  }

  /** 搜索日志（soLog）- 从 SQLite 查询并过滤 */
  async soLog(input: SoLogInput, output: SoLogOutput, _context: LogContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    const queryConditions = buildLogConditions(input);
    const orderBy = input.order_by ?? [{ field: 'created', direction: 'DESC' }];
    const page = input.page ?? { current: 1, size: 50 };

    const rows = await this.relationDb.select(LOG_RECORD_TABLE, {
      conditions: queryConditions,
      order_by: orderBy,
      page,
    });
    const total = await this.relationDb.count(LOG_RECORD_TABLE, queryConditions);

    output.list = rows.map((r) => this.rowToLogRecord(r));
    output.total = total;
    return true;
  }

  /** 删除日志（delLog）- 从 SQLite 删除 */
  async delLog(input: DelLogInput, output: DelLogOutput, _context: LogContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    let deletedCount = 0;
    try {
      if (input.ids && input.ids.length > 0) {
        for (const idOrSource of input.ids) {
          deletedCount += await this.relationDb.delete(LOG_RECORD_TABLE, [
            { field: 'id', operator: Operator.EQ, value: idOrSource },
          ]);
          deletedCount += await this.relationDb.delete(LOG_RECORD_TABLE, [
            { field: 'source', operator: Operator.EQ, value: idOrSource },
          ]);
        }
      }

      if (input.before_time !== undefined) {
        deletedCount += await this.relationDb.delete(LOG_RECORD_TABLE, [
          { field: 'created', operator: Operator.LT, value: input.before_time },
        ]);
      }

      if (input.conditions && input.conditions.length > 0) {
        deletedCount += await this.relationDb.delete(LOG_RECORD_TABLE, input.conditions);
      }
    } catch (err) {
      // 忽略异常
      metrics?.warn('LogService.delLog 删除日志失败（已删除部分计数见 affected_rows）', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    output.affected_rows = deletedCount;
    return true;
  }

  /** 统计日志数量（countLog）- 从 SQLite 统计 */
  async countLog(input: CountLogInput, output: CountLogOutput, _context: LogContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    const conditions: Condition[] = [];
    if (input.level) {
      conditions.push({ field: 'level', operator: Operator.EQ, value: input.level });
    }
    if (input.source) {
      conditions.push({ field: 'source', operator: Operator.EQ, value: input.source });
    }
    if (input.start_time !== undefined) {
      conditions.push({ field: 'created', operator: Operator.GE, value: input.start_time });
    }
    if (input.end_time !== undefined) {
      conditions.push({ field: 'created', operator: Operator.LE, value: input.end_time });
    }

    output.count = await this.relationDb.count(
      LOG_RECORD_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );
    return true;
  }

  // -------------------------------------------------------------------------
  // 可视化
  // -------------------------------------------------------------------------

  /** 可视化数据（visualizedLog） */
  async visualizedLog(input: VisualizedLogInput, output: VisualizedLogOutput, _context: LogContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const scope = String(input.scope);

    if (scope === 'health') {
      const total = await this.relationDb.count(LOG_RECORD_TABLE);
      output.data = {
        enabled: this.enabled,
        retention_days: this.retentionDays,
        max_log_count: this.maxLogCount,
        total_count: total,
      };
    } else if (scope === 'volume') {
      const total = await this.relationDb.count(LOG_RECORD_TABLE);
      output.data = {
        record_count: total,
      };
    } else if (scope === 'levelDistribution') {
      const rows = this.relationDb.queryRaw<{ level: string; count: number }>(
        `SELECT "level", COUNT(*) AS "count" FROM "${LOG_RECORD_TABLE}" GROUP BY "level"`,
      );
      const distribution: Record<string, number> = {
        DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0,
      };
      for (const r of rows) {
        const level = String(r.level);
        if (level in distribution) {
          distribution[level] = Number(r.count);
        }
      }
      output.data = { distribution };
    } else if (scope === 'sourceDistribution') {
      const rows = this.relationDb.queryRaw<{ source: string; count: number }>(
        `SELECT "source", COUNT(*) AS "count" FROM "${LOG_RECORD_TABLE}" GROUP BY "source" ORDER BY "count" DESC`,
      );
      output.data = {
        sources: rows.map((r) => ({
          module: String(r.source),
          record_count: Number(r.count),
        })),
      };
    } else {
      output.error = `未知的可视化范围: ${scope}`;
      output.error_code = 'INVALID_SCOPE';
      return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // 运维
  // -------------------------------------------------------------------------

  /** 校验组件是否启用 */
  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new ComponentDisabledError('Log');
    }
  }

  /** 配置日志记录规则（enableLog） */
  async enableLog(input: EnableLogInput, _output: EnableLogOutput, _context: LogContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.rules || input.rules.length === 0) {
      throw new ValidationError('rules 不能为空');
    }
    const now = IdGenerator.now();
    for (const rule of input.rules) {
      if (!rule.source || !rule.method) {
        throw new ValidationError('rule.source 和 rule.method 不能为空');
      }
      const existing = await this.relationDb.selectOne(LOG_RULE_TABLE, [
        { field: 'source', operator: Operator.EQ, value: rule.source },
        { field: 'method', operator: Operator.EQ, value: rule.method },
      ]);
      if (existing) {
        await this.relationDb.update(
          LOG_RULE_TABLE,
          [
            { field: 'enable', value: rule.enable ? 1 : 0 },
            { field: 'updated', value: now },
          ],
          [
            { field: 'source', operator: Operator.EQ, value: rule.source },
            { field: 'method', operator: Operator.EQ, value: rule.method },
          ],
        );
      } else {
        await this.relationDb.insert(
          LOG_RULE_TABLE,
          newRecord({
            source: rule.source,
            method: rule.method,
            enable: rule.enable ? 1 : 0,
          }),
        );
      }
    }
    await this.loadRules();
    return true;
  }

  /** 配置日志组件（configLog） */
  async configLog(input: ConfigLogInput, output: ConfigLogOutput, _context: LogContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    let agingChanged = false;
    if (input.enabled !== undefined) {
      this.enabled = input.enabled;
      await this.config.set('enabled', input.enabled, 'BOOLEAN', 'LogProvider 是否启用');
    }
    if (input.default_level !== undefined) {
      if (!['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(input.default_level)) {
        throw new ValidationError('default_level must be DEBUG/INFO/WARN/ERROR');
      }
      this.defaultLevel = input.default_level;
      await this.config.set('default_level', input.default_level, 'STRING', '默认日志级别');
    }
    if (input.min_level !== undefined) {
      if (!['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(input.min_level)) {
        throw new ValidationError('min_level must be DEBUG/INFO/WARN/ERROR');
      }
      this.minLevel = input.min_level;
      await this.config.set('min_level', input.min_level, 'STRING', '最低日志级别');
    }
    if (input.retention_days !== undefined) {
      if (!Number.isInteger(input.retention_days) || input.retention_days < 0) {
        throw new ValidationError('retention_days must be a non-negative integer');
      }
      this.retentionDays = input.retention_days;
      await this.config.set('retention_days', input.retention_days, 'INT', '日志保留天数');
      agingChanged = true;
    }
    if (input.max_log_count !== undefined) {
      if (!Number.isInteger(input.max_log_count) || input.max_log_count < 0) {
        throw new ValidationError('max_log_count must be a non-negative integer');
      }
      this.maxLogCount = input.max_log_count;
      await this.config.set('max_log_count', input.max_log_count, 'INT', '日志最大保留条数');
      agingChanged = true;
    }

    // 老化参数变更后立即执行一次清理，使新配置即时生效
    if (agingChanged) {
      await this.applyAging();
    }

    output.config = {
      enabled: this.enabled,
      default_level: this.defaultLevel,
      min_level: this.minLevel,
      retention_days: this.retentionDays,
      max_log_count: this.maxLogCount,
    };
    return true;
  }

  /** 从 SQLite 查询日志记录（queryLogs） */
  async queryLogs(options: {
    level?: string;
    source?: string;
    keyword?: string;
    trace_id?: string;
    work_id?: string;
    run_id?: string;
    log_source?: string;
    start_time?: number;
    end_time?: number;
    page?: number;
    pageSize?: number;
  }): Promise<{ logs: LogRecord[]; total: number }> {
    this.ensureEnabled();
    const conditions: Condition[] = [];
    if (options.level) {
      conditions.push({ field: 'level', operator: Operator.EQ, value: options.level.toUpperCase() });
    }
    if (options.source) {
      conditions.push({ field: 'source', operator: Operator.LIKE, value: `%${options.source}%` });
    }
    if (options.keyword) {
      conditions.push({ field: 'message', operator: Operator.LIKE, value: `%${options.keyword}%` });
    }
    if (options.trace_id) {
      conditions.push({ field: 'trace_id', operator: Operator.LIKE, value: `%${options.trace_id}%` });
    }
    if (options.work_id) {
      conditions.push({ field: 'work_id', operator: Operator.EQ, value: options.work_id });
    }
    if (options.run_id) {
      conditions.push({ field: 'run_id', operator: Operator.EQ, value: options.run_id });
    }
    if (options.log_source) {
      conditions.push({ field: 'metadata', operator: Operator.LIKE, value: `%"log_source":"${options.log_source}"%` });
    }
    if (options.start_time !== undefined) {
      conditions.push({ field: 'created', operator: Operator.GE, value: options.start_time });
    }
    if (options.end_time !== undefined) {
      conditions.push({ field: 'created', operator: Operator.LE, value: options.end_time });
    }

    // 分页参数钳制：pageSize 上限 500，防止异常入参一次性物化大量行
    // 阻塞事件循环（log_record 为高频写入大表，全量拉取代价高）
    const page = Math.max(1, Math.floor(options.page ?? 1) || 1);
    const pageSize = Math.min(500, Math.max(1, Math.floor(options.pageSize ?? 50) || 50));

    const selectOpts: Record<string, unknown> = {
      order_by: [{ field: 'created', direction: 'DESC' }],
      page: { current: page, size: pageSize },
    };
    if (conditions.length > 0) {
      selectOpts.conditions = conditions;
    }

    const rows = await this.relationDb.select(LOG_RECORD_TABLE, selectOpts as any);
    const total = await this.relationDb.count(LOG_RECORD_TABLE, conditions);

    const logs: LogRecord[] = rows.map((r) => this.rowToLogRecord(r));

    return { logs, total };
  }

  /** 从 SQLite 统计日志级别分布（soLogStats） */
  async soLogStats(options?: {
    start_time?: number;
    end_time?: number;
  }): Promise<{ distribution: Array<{ level: string; count: number }> }> {
    this.ensureEnabled();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (options?.start_time !== undefined) {
      conditions.push(`"created" >= ?`);
      params.push(options.start_time);
    }
    if (options?.end_time !== undefined) {
      conditions.push(`"created" <= ?`);
      params.push(options.end_time);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.relationDb.queryRaw<{ level: string; count: number }>(
      `SELECT "level", COUNT(*) AS "count" FROM "${LOG_RECORD_TABLE}"${where} GROUP BY "level" ORDER BY "count" DESC`,
      params,
    );

    return {
      distribution: rows.map((r) => ({
        level: String(r.level),
        count: Number(r.count),
      })),
    };
  }

  /** 从 SQLite 查询所有出现过的日志来源模块（source 去重列表，用于筛选下拉菜单） */
  async listSources(): Promise<string[]> {
    this.ensureEnabled();
    const rows = this.relationDb.queryRaw<{ source: string }>(
      `SELECT DISTINCT "source" FROM "${LOG_RECORD_TABLE}" WHERE "source" IS NOT NULL AND "source" != '' ORDER BY "source" ASC`,
      [],
    );
    return rows.map((r) => String(r.source));
  }
}
