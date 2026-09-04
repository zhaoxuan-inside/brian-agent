/**
 * @fileoverview shared 共享内核统一导出。
 *
 * 本模块为所有 Base 层 Provider 提供公共基础能力：
 * - base：Input / Context / Output 基类
 * - query：Condition / OrderBy / Page / DataObject / QueryParam / Operation 公共查询对象
 * - errors：统一错误类型
 * - aop：代理模式切面注入（日志记录、耗时统计）
 * - config：配置服务（基于关系数据库配置表的键值对读写）
 * - native：跨平台原生模块加载器（自动检测 OS/架构/ABI）
 *
 * 说明：ID 生成器（IdGenerator）与 JSON / XML 解析工具（JsonParser / XmlParser）
 * 已迁移至 ToolProvider 模块，经 `@brian-agent/base` 统一导出。
 */

// 基类与全局枚举
export { Input } from './base/Input';
export { Context } from './base/Context';
export { Output } from './base/Output';
export { Metrics } from './base/Metrics';
export type { MetricsLogger } from './base/Metrics';
export { Report } from './base/Report';
export type { ReportChannel, ReportMeta } from './base/Report';
export { InfoType, CollectionSource, ContextSource } from './base/InfoEnums';
export {
  HandleResultType,
  DEFAULT_HANDLE_RESULT_TYPE,
  classifyHandleResult,
} from './base/InfoEnums';
export type { HandleErrorSource } from './base/InfoEnums';

// 查询对象
export {
  Operator,
  Logic,
  Direction,
  OperationType,
  VisualScope,
} from './query/QueryObjects';
export type {
  Condition,
  OrderBy,
  Page,
  DataObject,
  QueryParam,
  Operation,
} from './query/QueryObjects';

// 记录组装件（newRecord/newPatch 自动填充 id/created/updated）
export { toDataObject, newRecord, newPatch } from './query/RecordBuilder';

// 错误类型
export {
  ProviderError,
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  ProcessingError,
  AbortedError,
} from './errors';
export type { AbortReasonKind } from './errors';

// AOP 代理
export { AopProxy, ConsoleLogger } from './aop/AopProxy';
export type { Logger, AopProxyOptions } from './aop/AopProxy';
export type { Interceptor, InterceptContext } from './aop/Interceptor';

// 配置服务
export { ConfigService, ValueType } from './config/ConfigService';
export type { ConfigItem, IConfigStorage } from './config/ConfigService';

// 跨平台原生模块加载器
export { NativeLoader } from './native/NativeLoader';
export type { PlatformInfo, LoadResult } from './native/NativeLoader';

// Prompt 模板配置键常量
export { PROMPT_SLOTS } from './prompt/PromptConfigKeys';
export type { PromptSlot } from './prompt/PromptConfigKeys';

// LLM 调用 + JSON 解析公共封装
export { callLLMJson } from './llm/CallLLMJson';
export type { CallLLMJsonOptions } from './llm/CallLLMJson';

// LLMEvent 归一化流事件类型（Runtime v2 · Loop-PRD §2）
export type {
  LLMEvent,
  LLMMessage,
  LLMMessageRole,
  LLMToolSpec,
  LLMToolCallWire,
  ParsedToolCall,
  TokenUsage,
} from './llm/LLMEvent';
