/**
 * @fileoverview LogProvider 应用服务层。
 *
 * 日志只写入本地文件，按模块分目录存储，文件采用滚动方式（每个文件最大 200MB）。
 * 日志规则（log_rule）和配置项（log_config）存储于关系数据库。
 *
 * 实现所有用例：addLog / getLog / soLog / delLog / countLog / visualizedLog / enableLog。
 */

import { existsSync, mkdirSync, appendFileSync, statSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import { ComponentDisabledError, ValidationError } from '../../shared/errors';
import { IdGenerator } from '../../shared/id/IdGenerator';
import { Operator } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
import {
  LogContext,
  LogData,
  LogRecord,
  LogRule,
  LogLevel,
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
  LOG_RULE_TABLE,
  LOG_CONFIG_TABLE,
  LOG_RECORD_TABLE,
  LOG_DEFAULT_CONFIGS,
  type WriteMode,
} from '../domain/types';

/** 200MB（字节） */
const DEFAULT_MAX_FILE_SIZE = 200 * 1024 * 1024;

/**
 * LogProvider 应用服务。
 *
 * 日志只写入本地文件，不存储于数据库。
 * 日志规则与配置项存储于关系数据库（log_rule / log_config 表）。
 */
export class LogService {
  private enabled = true;
  private readonly config: ConfigService;
  private rules: LogRule[] = [];
  /** 日志文件根目录（从配置读取，缓存） */
  private logDir = './data/logs';
  /** 单文件最大大小（字节，从配置读取，缓存） */
  private maxFileSize = DEFAULT_MAX_FILE_SIZE;
  /** 日志保留天数（从配置读取，缓存） */
  private retentionDays = 14;
  /** 日志写入模式 */
  private writeMode: WriteMode = 'BOTH';

  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, LOG_CONFIG_TABLE);
  }

  /** 初始化：写入默认配置、恢复 enabled 状态、加载日志规则、读取文件路径配置 */
  async initialize(): Promise<void> {
    await this.config.initDefaults([...LOG_DEFAULT_CONFIGS]);
    this.enabled = await this.config.getBoolean('enabled', true);
    this.logDir = await this.config.getString('file_path', './data/logs') ?? './data/logs';
    this.maxFileSize = await this.config.getInt('max_file_size', DEFAULT_MAX_FILE_SIZE);
    this.retentionDays = await this.config.getInt('retention_days', 14);
    const modeStr = await this.config.getString('write_mode', 'BOTH') ?? 'BOTH';
    this.writeMode = (modeStr === 'BOTH' || modeStr === 'SQLITE' || modeStr === 'FILE') ? modeStr : 'BOTH';
    await this.loadRules();
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
  // 文件操作工具
  // -------------------------------------------------------------------------

  /** 获取模块日志目录路径 */
  private getModuleDir(source: string): string {
    return join(this.logDir, source);
  }

  /** 格式化日志行为字符串 */
  private formatLogLine(data: LogData): string {
    const ts = new Date().toISOString();
    const trace = data.trace_id ? `[${data.trace_id}]` : '[-]';
    const meta = data.metadata ? JSON.stringify(data.metadata) : '-';
    const elapsed = data.elapsed_ms !== undefined ? `${data.elapsed_ms}` : '-';
    return `[${ts}] [${data.level}] [${data.source}] ${trace} ${data.message} | ${meta} | ${elapsed}\n`;
  }

  /** 解析日志行为 LogRecord */
  private parseLogLine(line: string, source: string): LogRecord | null {
    const match = line.match(/^\[(.+?)\] \[(.+?)\] \[(.+?)\] \[(.+?)\] (.+?) \| (.+?) \| (.+?)$/);
    if (!match) {
      return null;
    }
    const [, ts, level, src, traceId, message, metaStr, elapsedStr] = match;
    let metadata: Record<string, unknown> | undefined;
    if (metaStr && metaStr !== '-') {
      try {
        metadata = JSON.parse(metaStr) as Record<string, unknown>;
      } catch {
        // 忽略解析失败
      }
    }
    return {
      id: `${ts}|${source}|${message}`,
      created: new Date(ts).getTime(),
      updated: new Date(ts).getTime(),
      level,
      source: src,
      message,
      trace_id: traceId !== '-' ? traceId : undefined,
      metadata,
      elapsed_ms: elapsedStr !== '-' ? parseInt(elapsedStr, 10) : undefined,
    };
  }

  /**
   * 获取模块的唯一日志文件路径。
   *
   * 每个模块只有一个日志文件：`{logDir}/{source}/{source}.log`
   * 若目录不存在则创建。
   */
  private getModuleLogFile(source: string): string {
    const dir = this.getModuleDir(source);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return join(dir, `${source}.log`);
  }

  /**
   * 清理日志文件。
   *
   * 1. 删除超过 retentionDays 天的日志行；
   * 2. 若清理后文件仍超过 maxFileSize，从头部截断仅保留最近内容；
   *
   * @param filePath 日志文件路径
   */
  private cleanLogFile(filePath: string): void {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      return;
    }

    const lines = content.split('\n').filter((l) => l.trim());
    if (lines.length === 0) {
      return;
    }

    // 1. 删除超过保留天数的日志行
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const filtered = lines.filter((line) => {
      const record = this.parseLogLine(line, '');
      // 保留无法解析的行和未过期的行
      return record ? record.created >= cutoff : true;
    });

    // 2. 若仍超过 maxFileSize，从头部截断
    let result = filtered.join('\n') + '\n';
    while (Buffer.byteLength(result, 'utf-8') > this.maxFileSize && filtered.length > 1) {
      filtered.shift();
      result = filtered.join('\n') + '\n';
    }

    // 重写文件
    try {
      writeFileSync(filePath, result, 'utf-8');
    } catch {
      // 忽略写入失败
    }
  }

  /** 获取指定模块的所有日志文件路径 */
  private getModuleFiles(source: string): string[] {
    const dir = this.getModuleDir(source);
    if (!existsSync(dir)) {
      return [];
    }
    return readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .sort()
      .map((f) => join(dir, f));
  }

  /** 获取所有模块的日志文件路径 */
  private getAllModuleFiles(): Array<{ source: string; file: string }> {
    if (!existsSync(this.logDir)) {
      return [];
    }
    const result: Array<{ source: string; file: string }> = [];
    const modules = readdirSync(this.logDir).filter((f) => {
      const stat = statSync(join(this.logDir, f));
      return stat.isDirectory();
    });
    for (const mod of modules) {
      const files = this.getModuleFiles(mod);
      for (const file of files) {
        result.push({ source: mod, file });
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // 日志管理
  // -------------------------------------------------------------------------

  /** 写入日志到本地文件（addLog），同时支持 SQLite 持久化 */
  async addLog(
    input: AddLogInput,
    _context: LogContext,
    output: AddLogOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.level) {
      throw new ValidationError('level 不能为空');
    }
    if (!data.source) {
      throw new ValidationError('source 不能为空');
    }
    if (!data.message) {
      throw new ValidationError('message 不能为空');
    }

    const logId = IdGenerator.generate();
    const now = IdGenerator.now();

    // 文件写入（FILE / BOTH 模式）
    if (this.writeMode === 'FILE' || this.writeMode === 'BOTH') {
      const line = this.formatLogLine(data);
      const filePath = this.getModuleLogFile(data.source);
      appendFileSync(filePath, line, 'utf-8');

      try {
        const size = statSync(filePath).size;
        if (size >= this.maxFileSize) {
          this.cleanLogFile(filePath);
        }
      } catch {
        // 忽略
      }
    }

    // SQLite 写入（SQLITE / BOTH 模式）
    if (this.writeMode === 'SQLITE' || this.writeMode === 'BOTH') {
      try {
        await this.relationDb.insert(LOG_RECORD_TABLE, [
          { field: 'id', value: logId },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'level', value: data.level },
          { field: 'source', value: data.source },
          { field: 'message', value: data.message },
          { field: 'trace_id', value: data.trace_id ?? null },
          { field: 'caller', value: data.caller ?? null },
          { field: 'metadata', value: data.metadata ? JSON.stringify(data.metadata) : null },
          { field: 'elapsed_ms', value: data.elapsed_ms ?? null },
        ]);
      } catch {
        // SQLite 写入失败不影响业务
      }
    }

    output.id = logId;
    return true;
  }

  /** 获取日志（getLog）- 从文件中搜索第一条匹配 */
  async getLog(
    input: GetLogInput,
    _context: LogContext,
    output: GetLogOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    // getLog 在文件模式下通过 soLog 逻辑查找第一条
    const soOutput = new SoLogOutput();
    const soInput = new SoLogInput();
    if (input.conditions) {
      // 将简单条件转为搜索参数
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
    await this.soLog(soInput, _context, soOutput);
    output.log = soOutput.list.length > 0 ? soOutput.list[0] : null;
    return true;
  }

  /** 搜索日志（soLog）- 从文件中读取并过滤 */
  async soLog(
    input: SoLogInput,
    _context: LogContext,
    output: SoLogOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    // 确定搜索范围
    const files: Array<{ source: string; file: string }> = input.source
      ? this.getModuleFiles(input.source).map((f) => ({ source: input.source!, file: f }))
      : this.getAllModuleFiles();

    const results: LogRecord[] = [];
    for (const { source, file } of files) {
      let content: string;
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      const lines = content.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        const record = this.parseLogLine(line, source);
        if (!record) {
          continue;
        }
        // 过滤
        if (input.level && record.level !== input.level) {
          continue;
        }
        if (input.source && record.source !== input.source) {
          continue;
        }
        if (input.trace_id && record.trace_id !== input.trace_id) {
          continue;
        }
        if (input.keyword && !record.message.includes(input.keyword)) {
          continue;
        }
        if (input.start_time !== undefined && record.created < input.start_time) {
          continue;
        }
        if (input.end_time !== undefined && record.created > input.end_time) {
          continue;
        }
        results.push(record);
      }
    }

    // 排序（默认 created DESC）
    results.sort((a, b) => b.created - a.created);

    // 分页
    const page = input.page ?? { current: 1, size: 50 };
    const offset = (page.current - 1) * page.size;
    output.list = results.slice(offset, offset + page.size);
    output.total = results.length;
    return true;
  }

  /** 删除日志（delLog）- 删除日志文件 */
  async delLog(
    input: DelLogInput,
    _context: LogContext,
    output: DelLogOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    let deletedCount = 0;

    // 按模块删除
    if (input.ids) {
      // ids 在文件模式下视为模块名，删除该模块的所有日志文件
      for (const moduleName of input.ids) {
        const files = this.getModuleFiles(moduleName);
        for (const file of files) {
          try {
            unlinkSync(file);
            deletedCount++;
          } catch {
            // 忽略
          }
        }
      }
    }

    // 按时间删除（before_time 之前的日志行）
    if (input.before_time !== undefined) {
      const allFiles = this.getAllModuleFiles();
      for (const { file } of allFiles) {
        try {
          const content = readFileSync(file, 'utf-8');
          const lines = content.split('\n').filter((l) => l.trim());
          const kept = lines.filter((line) => {
            const record = this.parseLogLine(line, '');
            // 保留无法解析的行和未过期的行
            return record ? record.created >= input.before_time! : true;
          });
          if (kept.length < lines.length) {
            deletedCount += lines.length - kept.length;
            writeFileSync(file, kept.join('\n') + '\n', 'utf-8');
          }
        } catch {
          // 忽略
        }
      }
    }

    output.affected_rows = deletedCount;
    return true;
  }

  /** 统计日志数量（countLog）- 从文件中统计 */
  async countLog(
    input: CountLogInput,
    _context: LogContext,
    output: CountLogOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    const files = input.source
      ? this.getModuleFiles(input.source)
      : this.getAllModuleFiles().map((f) => f.file);

    let count = 0;
    for (const file of files) {
      let content: string;
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      const lines = content.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        const record = this.parseLogLine(line, '');
        if (!record) {
          continue;
        }
        if (input.level && record.level !== input.level) {
          continue;
        }
        if (input.start_time !== undefined && record.created < input.start_time) {
          continue;
        }
        if (input.end_time !== undefined && record.created > input.end_time) {
          continue;
        }
        count++;
      }
    }
    output.count = count;
    return true;
  }

  // -------------------------------------------------------------------------
  // 可视化
  // -------------------------------------------------------------------------

  /** 可视化数据（visualizedLog） */
  async visualizedLog(
    input: VisualizedLogInput,
    _context: LogContext,
    output: VisualizedLogOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const scope = String(input.scope);

    if (scope === 'health') {
      output.data = {
        enabled: this.enabled,
        log_dir: this.logDir,
        dir_exists: existsSync(this.logDir),
        max_file_size: this.maxFileSize,
      };
    } else if (scope === 'volume') {
      const allFiles = this.getAllModuleFiles();
      let totalSize = 0;
      for (const { file } of allFiles) {
        try {
          totalSize += statSync(file).size;
        } catch {
          // 忽略
        }
      }
      output.data = {
        file_count: allFiles.length,
        total_size_bytes: totalSize,
        total_size_mb: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
      };
    } else if (scope === 'levelDistribution') {
      const allFiles = this.getAllModuleFiles();
      const distribution: Record<string, number> = {
        DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0,
      };
      for (const { file } of allFiles) {
        let content: string;
        try {
          content = readFileSync(file, 'utf-8');
        } catch {
          continue;
        }
        const lines = content.split('\n').filter((l) => l.trim());
        for (const line of lines) {
          const record = this.parseLogLine(line, '');
          if (record && record.level in distribution) {
            distribution[record.level]++;
          }
        }
      }
      output.data = { distribution };
    } else if (scope === 'sourceDistribution') {
      if (!existsSync(this.logDir)) {
        output.data = { modules: [] };
      } else {
        const modules = readdirSync(this.logDir).filter((f) => {
          try {
            return statSync(join(this.logDir, f)).isDirectory();
          } catch {
            return false;
          }
        });
        const sources = modules.map((mod) => {
          const files = this.getModuleFiles(mod);
          let size = 0;
          for (const file of files) {
            try {
              size += statSync(file).size;
            } catch {
              // 忽略
            }
          }
          return { module: mod, file_count: files.length, size_bytes: size };
        });
        output.data = { sources };
      }
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
  async enableLog(
    input: EnableLogInput,
    _context: LogContext,
    _output: EnableLogOutput,
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
        await this.relationDb.insert(LOG_RULE_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'source', value: rule.source },
          { field: 'method', value: rule.method },
          { field: 'enable', value: rule.enable ? 1 : 0 },
        ]);
      }
    }
    await this.loadRules();
    return true;
  }

  /** 从 SQLite 查询日志记录（queryLogs） */
  async queryLogs(options: {
    level?: string;
    source?: string;
    keyword?: string;
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
    if (options.start_time !== undefined) {
      conditions.push({ field: 'created', operator: Operator.GE, value: options.start_time });
    }
    if (options.end_time !== undefined) {
      conditions.push({ field: 'created', operator: Operator.LE, value: options.end_time });
    }

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;

    const selectOpts: Record<string, unknown> = {
      order_by: [{ field: 'created', direction: 'DESC' }],
      page: { current: page, size: pageSize },
    };
    if (conditions.length > 0) {
      selectOpts.conditions = conditions;
    }

    const rows = await this.relationDb.select(LOG_RECORD_TABLE, selectOpts as any);
    const total = await this.relationDb.count(LOG_RECORD_TABLE, conditions);

    let logs: LogRecord[] = rows.map((r) => ({
      id: String(r.id),
      created: Number(r.created),
      updated: Number(r.updated),
      level: String(r.level),
      source: String(r.source),
      message: String(r.message),
      trace_id: r.trace_id ? String(r.trace_id) : undefined,
      caller: r.caller ? String(r.caller) : undefined,
      metadata: r.metadata ? (() => { try { return JSON.parse(String(r.metadata)) as Record<string, unknown>; } catch { return undefined; } })() : undefined,
      elapsed_ms: r.elapsed_ms ? Number(r.elapsed_ms) : undefined,
    }));

    if (options.keyword) {
      logs = logs.filter(l => l.message.includes(options.keyword!));
    }

    return { logs, total };
  }

  /** 从 SQLite 统计日志级别分布（getLogStats） */
  async getLogStats(options?: {
    start_time?: number;
    end_time?: number;
  }): Promise<{ distribution: Array<{ level: string; count: number }> }> {
    this.ensureEnabled();
    const conditions: Condition[] = [];
    if (options?.start_time !== undefined) {
      conditions.push({ field: 'created', operator: Operator.GE, value: options.start_time });
    }
    if (options?.end_time !== undefined) {
      conditions.push({ field: 'created', operator: Operator.LE, value: options.end_time });
    }

    const rows = await this.relationDb.select(LOG_RECORD_TABLE, {
      fields: ['level', 'COUNT(*) as count'],
      conditions: conditions.length > 0 ? conditions : undefined,
      group_by: 'level',
      order_by: [{ field: 'count', direction: 'DESC' }],
    } as any);

    return {
      distribution: rows.map((r: Record<string, unknown>) => ({
        level: String(r.level),
        count: Number(r.count),
      })),
    };
  }
}
