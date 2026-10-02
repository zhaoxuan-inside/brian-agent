import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

export class LogContext extends Context {}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export enum LogSource {
  AOP = 'AOP',
  MANUAL = 'MANUAL',
  SYSTEM = 'SYSTEM',
}

export interface LogData {
  
  level: LogLevel | string;
  
  source: string;
  
  message: string;
  
  trace_id?: string;
  
  caller?: string;
  
  work_id?: string;
  
  run_id?: string;
  
  metadata?: Record<string, unknown>;
  
  elapsed_ms?: number;
}

export interface LogRecord extends LogData {
  id: string;
  created: number;
  updated: number;
}

export class AddLogInput extends Input {
  data!: LogData;
}

export class AddLogOutput extends Output {
  id = '';
}

export class GetLogInput extends Input {
  id?: string;
  conditions?: Condition[];
}

export class GetLogOutput extends Output {
  log: LogRecord | null = null;
}

export class SoLogInput extends Input {
  keyword?: string;
  level?: string;
  source?: string;
  
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

export class DelLogInput extends Input {
  ids?: string[];
  conditions?: Condition[];
  before_time?: number;
}

export class DelLogOutput extends Output {
  affected_rows = 0;
}

export class CountLogInput extends Input {
  level?: string;
  source?: string;
  start_time?: number;
  end_time?: number;
}

export class CountLogOutput extends Output {
  count = 0;
}

export class VisualizedLogInput extends Input {
  scope!: string;
}

export class VisualizedLogOutput extends Output {
  data: Record<string, unknown> = {};
}

export interface LogRule {
  
  source: string;
  
  method: string;
  
  enable: boolean;
}

export class EnableLogInput extends Input {
  
  rules!: LogRule[];
}

export class EnableLogOutput extends Output {}

export class ConfigLogInput extends Input {
  
  enabled?: boolean;
  
  default_level?: string;
  
  min_level?: string;
  
  retention_days?: number;
  
  max_log_count?: number;
}

export class ConfigLogOutput extends Output {
  config: Record<string, unknown> = {};
}

export const LOG_RULE_TABLE = 'log_rule_record';
export const LOG_CONFIG_TABLE = 'log_config_record';
export const LOG_RECORD_TABLE = 'log_record';

export const DEFAULT_RETENTION_DAYS = 30;

export const DEFAULT_MAX_LOG_COUNT = 700000;

export const DEFAULT_MIN_LEVEL = 'INFO';
