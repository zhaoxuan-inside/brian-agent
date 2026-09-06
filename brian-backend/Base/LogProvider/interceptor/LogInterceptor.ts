/**
 * @fileoverview 日志拦截器（LogInterceptor）—— AOP 切面日志的 DB 直写实现。
 *
 * 实现 {@link Interceptor} 接口：在方法**返回或抛异常**时（切入点 4）调用 LogProvider
 * 保存调用记录——采集方法调用的全部参数（Input/Output/Context/Metrics/Report）及参数内容，
 * 以 JSON 格式写入 log_record.metadata（invocation_json）。
 *
 * 设计要点：
 * - 使用原始 LogService（未经 AOP 包装），避免与 AOP 代理产生递归调用；
 * - 日志写入采用 fire-and-forget 模式（不 await），不阻塞业务方法执行；
 * - 通过 shouldLog(targetName, methodName) 检查日志规则，仅记录被启用的模块/方法
 *   （每次方法调用产生 1 条记录，体量由 log_rule 白名单与日志老化共同约束）；
 * - 有 Metrics 实例时优先经 Metrics.saveInvocation 保存（与内置日志切面同语义），
 *   旧式 3 参签名退化为仅错误日志。
 */

import type { Interceptor, InterceptContext } from '../../shared/aop/Interceptor';
import type { LogService } from '../application/LogService';
import type { LogData } from '../domain/types';
import { LogLevel, LogSource } from '../domain/types';

/**
 * 日志拦截器。
 *
 * 作为 AOP 切面之一，在方法执行失败时自动记录 ERROR 日志。
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
 *   new EnableLogOutput(), new LogContext(),
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
   * 切入点 4（方法执行后）：方法**返回或抛异常**时保存调用记录。
   *
   * 经 Metrics.saveInvocation（或直接 addLog）以 JSON 采集全部参数内容；
   * 通过 shouldLog 检查日志规则，未启用的模块/方法跳过记录。
   */
  afterExecute(ctx: InterceptContext, error?: Error): void {
    // 检查日志规则
    if (!this.logService.shouldLog(ctx.targetName, ctx.methodName)) {
      return;
    }

    // 有 Metrics 实例（新式 5 参）时经 Metrics 保存（JSON 调用记录，与内置切面同语义）
    const metrics = ctx.metrics as { saveInvocation?: (r: unknown) => void; elapsed_ms?: number } | undefined;
    if (metrics && typeof metrics.saveInvocation === 'function') {
      metrics.elapsed_ms = ctx.elapsedMs;
      metrics.saveInvocation({
        targetName: ctx.targetName,
        methodName: ctx.methodName,
        status: error ? 'error' : 'ok',
        error: error?.message,
        args: { input: ctx.input, output: ctx.output, context: ctx.context, metrics: ctx.metrics, report: ctx.report },
      });
      return;
    }

    // 旧式 3 参签名兜底:仅错误日志(保持旧行为)
    if (!error) {
      return;
    }
    const data: LogData = {
      level: LogLevel.ERROR,
      source: ctx.targetName,
      message: `${ctx.methodName} failed: ${error.message}`,
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

    // 从 input 中提取 work_id 和 interact_id
    if (ctx.input && typeof ctx.input === 'object') {
      const input = ctx.input as { work_id?: string; interact_id?: string };
      if (input.work_id) data.work_id = input.work_id;
      if (input.interact_id) data.interact_id = input.interact_id;
    }

    // fire-and-forget：不阻塞业务方法
    this.logService.addLog({ data }, {} as never, {} as never).catch(() => {});
  }
}
