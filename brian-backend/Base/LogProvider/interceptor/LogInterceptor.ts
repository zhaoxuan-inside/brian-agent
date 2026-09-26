import type { Interceptor, InterceptContext } from '../../shared/aop/Interceptor';
import type { LogService } from '../application/LogService';
import type { LogData } from '../domain/types';
import { LogLevel, LogSource } from '../domain/types';

export class LogInterceptor implements Interceptor {
  

  constructor(private readonly logService: LogService) {}

  

  afterExecute(ctx: InterceptContext, error?: Error): void {
    
    if (!this.logService.shouldLog(ctx.targetName, ctx.methodName)) {
      return;
    }

    
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

    const metricsTraceId = (ctx.metrics as { trace_id?: string } | undefined)?.trace_id;
    const inputTraceId = ctx.input && typeof ctx.input === 'object' && 'trace_id' in ctx.input
      ? (ctx.input as { trace_id?: string }).trace_id
      : undefined;
    
    
    
    const traceId = metricsTraceId || inputTraceId || ctx.traceId || undefined;
    if (traceId) {
      data.trace_id = traceId;
    }

    
    if (ctx.context && typeof ctx.context === 'object' && 'caller' in ctx.context) {
      const caller = (ctx.context as { caller?: string }).caller;
      if (caller) {
        data.caller = caller;
      }
    }

    
    if (ctx.input && typeof ctx.input === 'object') {
      const input = ctx.input as { work_id?: string; run_id?: string };
      if (input.work_id) data.work_id = input.work_id;
      if (input.run_id) data.run_id = input.run_id;
    }

    
    this.logService.addLog({ data }, {} as never, {} as never).catch(() => {});
  }
}
