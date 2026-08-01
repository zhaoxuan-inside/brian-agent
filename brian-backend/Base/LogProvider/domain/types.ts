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
// getLog
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
// 表名与默认配置
// ---------------------------------------------------------------------------

export const LOG_RULE_TABLE = 'log_rule';
export const LOG_CONFIG_TABLE = 'log_config';
export const LOG_RECORD_TABLE = 'log_record';

export type WriteMode = 'FILE' | 'BOTH' | 'SQLITE';

export const LOG_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: 'LogProvider 是否启用',
  },
  {
    config_key: 'default_level',
    config_value: 'INFO',
    value_type: 'STRING',
    description: '默认日志级别',
  },
  {
    config_key: 'file_path',
    config_value: './data/logs',
    value_type: 'STRING',
    description: '日志文件根目录',
  },
  {
    config_key: 'max_file_size',
    config_value: '209715200',
    value_type: 'INT',
    description: '单文件最大大小（字节，200MB = 200 * 1024 * 1024）',
  },
  {
    config_key: 'retention_days',
    config_value: '14',
    value_type: 'INT',
    description: '日志保留天数（两周，超过则自动清理）',
  },
  {
    config_key: 'write_mode',
    config_value: 'BOTH',
    value_type: 'STRING',
    description: '日志写入模式：FILE（仅文件）/ SQLITE（仅数据库）/ BOTH（双写，默认）',
  },
] as const;
