/**
 * @fileoverview LogProvider 领域层类型定义。
 *
 * 依据 `LogProvider-PRD.md` 定义 LogContext、LogData 及各功能的 Input / Output 类型。
 */

import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

/**
 * 日志上下文（LogContext）。
 */
export class LogContext extends Context {}

/**
 * 日志级别枚举。
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * 日志来源枚举。
 */
export enum LogSource {
  AOP = 'AOP',
  MANUAL = 'MANUAL',
  SYSTEM = 'SYSTEM',
}

/**
 * 日志数据对象（LogData）。
 */
export interface LogData {
  /** 日志级别 */
  level: LogLevel | string;
  /** 日志来源（方法名或模块名） */
  source: string;
  /** 日志消息 */
  message: string;
  /** 请求追踪 ID */
  trace_id?: string;
  /** 调用方标识 */
  caller?: string;
  /** 工作 ID */
  work_id?: string;
  /** 交互 ID */
  run_id?: string;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
  /** 耗时（毫秒），AOP 切面使用 */
  elapsed_ms?: number;
}

/**
 * log_record 表记录。
 */
export interface LogRecord extends LogData {
  id: string;
  created: number;
  updated: number;
}

// ---------------------------------------------------------------------------
// addLog
// ---------------------------------------------------------------------------

export class AddLogInput extends Input {
  data!: LogData;
}

export class AddLogOutput extends Output {
  id = '';
}

// ---------------------------------------------------------------------------
// soLogById
// ---------------------------------------------------------------------------

export class GetLogInput extends Input {
  id?: string;
  conditions?: Condition[];
}

export class GetLogOutput extends Output {
  log: LogRecord | null = null;
}

// ---------------------------------------------------------------------------
// soLog
// ---------------------------------------------------------------------------

export class SoLogInput extends Input {
  keyword?: string;
  level?: string;
  source?: string;
  // trace_id 继承自 Input 基类
  work_id?: string;
  run_id?: string;
  start_time?: number;
  end_time?: number;
  order_by?: OrderBy[];
  page?: Page;
}

export class SoLogOutput extends Output {
  list: LogRecord[] = [];
  total = 0;
}

// ---------------------------------------------------------------------------
// delLog
// ---------------------------------------------------------------------------

export class DelLogInput extends Input {
  ids?: string[];
  conditions?: Condition[];
  before_time?: number;
}

export class DelLogOutput extends Output {
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// countLog
// ---------------------------------------------------------------------------

export class CountLogInput extends Input {
  level?: string;
  source?: string;
  start_time?: number;
  end_time?: number;
}

export class CountLogOutput extends Output {
  count = 0;
}

// ---------------------------------------------------------------------------
// visualizedLog
// ---------------------------------------------------------------------------

export class VisualizedLogInput extends Input {
  scope!: string;
}

export class VisualizedLogOutput extends Output {
  data: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// enableLog - 配置日志记录规则
// ---------------------------------------------------------------------------

/**
 * 日志规则（LogRule）。
 *
 * 控制哪些模块的哪些方法的日志被记录。
 */
export interface LogRule {
  /** 模块名（如 "SoulProvider"），`*` 表示所有模块 */
  source: string;
  /** 方法名（如 "addSoul"），`*` 表示该模块的所有方法 */
  method: string;
  /** 是否记录该模块/方法的日志 */
  enable: boolean;
}

export class EnableLogInput extends Input {
  /** 日志规则列表 */
  rules!: LogRule[];
}

export class EnableLogOutput extends Output {}

// ---------------------------------------------------------------------------
// configLog - 配置日志组件
// ---------------------------------------------------------------------------

export class ConfigLogInput extends Input {
  /** 日志组件是否启用 */
  enabled?: boolean;
  /** 默认日志级别（addLog 未指定 level 时使用） */
  default_level?: string;
  /** 最低日志级别（低于此级别的日志不记录） */
  min_level?: string;
  /** 日志保留天数（超过自动清理） */
  retention_days?: number;
  /** 日志最大保留条数（超过自动清理最旧记录） */
  max_log_count?: number;
}


export class ConfigLogOutput extends Output {
  config: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// 表名与默认配置
// ---------------------------------------------------------------------------

export const LOG_RULE_TABLE = 'log_rule';
export const LOG_CONFIG_TABLE = 'log_config';
export const LOG_RECORD_TABLE = 'log_record';

/** 默认日志保留天数（30 天） */
export const DEFAULT_RETENTION_DAYS = 30;
/** 默认日志最大保留条数（70 万条） */
export const DEFAULT_MAX_LOG_COUNT = 700000;
/** 默认最低日志级别（DEBUG，不过滤任何级别） */
export const DEFAULT_MIN_LEVEL = 'INFO';
