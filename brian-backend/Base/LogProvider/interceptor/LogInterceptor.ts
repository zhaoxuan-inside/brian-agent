/**
 * @fileoverview 日志拦截器（LogInterceptor）。
 *
 * 实现 {@link Interceptor} 接口，在四个切入点中的两个（beforeExecute 和 afterExecute）
 * 调用 LogProvider 记录日志。
 *
 * 设计要点：
 * - 使用原始 LogService（未经 AOP 包装），避免与 AOP 代理产生递归调用；
 * - 日志写入采用 fire-and-forget 模式（不 await），不阻塞业务方法执行；
 * - 通过 shouldLog(targetName, methodName) 检查日志规则，仅记录被启用的模块/方法；
 * - beforeExecute 记录方法调用开始（level=DEBUG）；
 * - afterExecute 记录方法执行完成（level=INFO 或 ERROR）；
 */

import type { Interceptor, InterceptContext } from '../../shared/aop/Interceptor';
import type { LogService } from '../application/LogService';
import type { LogData } from '../domain/types';
import { LogLevel, LogSource } from '../domain/types';

/**
 * 日志拦截器。
 *
 * 作为 AOP 切面之一，在方法执行前后自动记录日志。
 * 通过 LogService.shouldLog() 检查日志规则，仅记录被启用的模块/方法。
 *
 * 用法示例：
 * ```typescript
 * const logAccess = new LogAccess(relationDb);
 * await logAccess.initialize();
 *
 * const logInterceptor = new LogInterceptor(logAccess.getRawService());
 *
 * // 配置只记录 SoulProvider 的日志
 * await logAccess.enableLog(
 *   { rules: [{ source: '*', method: '*', enable: false }, { source: 'SoulService', method: '*', enable: true }] },
 *   new LogContext(),
 *   new EnableLogOutput(),
 * );
 *
 * // 将拦截器注入到其他 Provider 的 AOP 代理中
 * const soulAccess = new SoulAccess(relationDb, {
 *   interceptors: [logInterceptor],
 * });
 * ```
 */
export class LogInterceptor implements Interceptor {
  /**
   * @param logService 原始 LogService（未经 AOP 包装）
   */
  constructor(private readonly logService: LogService) {}

  /**
   * 切入点 1（方法执行前）：记录方法调用开始。
   *
   * 日志级别 DEBUG，来源为模块名（targetName），消息格式 "{methodName} invoke"。
   * 通过 shouldLog 检查规则，未启用的模块/方法跳过记录。
   */
  beforeExecute(ctx: InterceptContext): void {
    // 检查日志规则
    if (!this.logService.shouldLog(ctx.targetName, ctx.methodName)) {
      return;
    }

    const data: LogData = {
      level: LogLevel.DEBUG,
      source: ctx.targetName,
      message: `${ctx.methodName} invoke`,
      metadata: { log_source: LogSource.AOP },
    };

    // 从 input 中提取 trace_id
    if (ctx.input && typeof ctx.input === 'object' && 'trace_id' in ctx.input) {
      const traceId = (ctx.input as { trace_id?: string }).trace_id;
      if (traceId) {
        data.trace_id = traceId;
      }
    }

    // fire-and-forget：不阻塞业务方法
    this.logService.addLog({ data }, {} as never, {} as never).catch(() => {});
  }

  /**
   * 切入点 4（方法执行后）：记录方法执行完成。
   *
   * 成功时日志级别 INFO，失败时日志级别 ERROR。
   * 消息格式 "{methodName} done" 或 "{methodName} failed"。
   * 通过 shouldLog 检查规则，未启用的模块/方法跳过记录。
   */
  afterExecute(ctx: InterceptContext, error?: Error): void {
    // 检查日志规则
    if (!this.logService.shouldLog(ctx.targetName, ctx.methodName)) {
      return;
    }

    const data: LogData = {
      level: error ? LogLevel.ERROR : LogLevel.INFO,
      source: ctx.targetName,
      message: error
        ? `${ctx.methodName} failed: ${error.message}`
        : `${ctx.methodName} done`,
      elapsed_ms: ctx.elapsedMs,
      metadata: { log_source: LogSource.AOP },
    };

    // 从 input 中提取 trace_id
    if (ctx.input && typeof ctx.input === 'object' && 'trace_id' in ctx.input) {
      const traceId = (ctx.input as { trace_id?: string }).trace_id;
      if (traceId) {
        data.trace_id = traceId;
      }
    }

    // 从 context 中提取 caller
    if (ctx.context && typeof ctx.context === 'object' && 'caller' in ctx.context) {
      const caller = (ctx.context as { caller?: string }).caller;
      if (caller) {
        data.caller = caller;
      }
    }

    // fire-and-forget：不阻塞业务方法
    this.logService.addLog({ data }, {} as never, {} as never).catch(() => {});
  }
}
