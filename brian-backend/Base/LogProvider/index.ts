/**
 * @fileoverview LogProvider 模块统一导出。
 */

// access 层
export { LogAccess } from './access/LogAccess';

// interceptor
export { LogInterceptor } from './interceptor/LogInterceptor';

// domain 层类型
export {
  LogContext,
  LogLevel,
  LogSource,
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
  LOG_DEFAULT_CONFIGS,
} from './domain/types';

export type { LogData, LogRecord, LogRule } from './domain/types';
