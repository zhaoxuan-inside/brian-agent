/* eslint-disable no-console */
import type { Interceptor, InterceptContext } from './Interceptor';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Metrics } from '../base/Metrics';
import { Report } from '../base/Report';

export interface Logger {
  
  debug(message: string, meta?: Record<string, unknown>): void;
  
  info?(message: string, meta?: Record<string, unknown>): void;
  
  warn?(message: string, meta?: Record<string, unknown>): void;
  
  error(message: string, meta?: Record<string, unknown>): void;
  

  log?(level: string, message: string, meta?: Record<string, unknown>): void;
}

export class ConsoleLogger implements Logger {
  debug(message: string, meta?: Record<string, unknown>): void {
    const suffix = meta ? ' ' + JSON.stringify(meta) : '';
    console.log(`[DEBUG] ${message}${suffix}`);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    const suffix = meta ? ' ' + JSON.stringify(meta) : '';
    console.error(`[ERROR] ${message}${suffix}`);
  }

  
  log(level: string, message: string, meta?: Record<string, unknown>): void {
    const suffix = meta ? ' ' + JSON.stringify(meta) : '';
    const line = `[${level.toUpperCase()}] ${message}${suffix}`;
    if (level.toUpperCase() === 'ERROR') {
      console.error(line);
      return;
    }
    console.log(line);
  }
}

const CLASS_LAYER_MODULE_MAP: Record<string, { layer: string; module: string }> = {
  
  BookmarkService: { layer: 'Base', module: 'BookmarkProvider' },
  CDTService: { layer: 'Base', module: 'CDTProvider' },
  ChunkService: { layer: 'Base', module: 'ChunkProvider' },
  CronService: { layer: 'Base', module: 'CronProvider' },
  FeedbackService: { layer: 'Base', module: 'FeedbackHandler' },
  GraphDBService: { layer: 'Base', module: 'GraphDBProvider' },
  LLMService: { layer: 'Base', module: 'LLMProvider' },
  LogService: { layer: 'Base', module: 'LogProvider' },
  MCPService: { layer: 'Base', module: 'MCPProvider' },
  MQService: { layer: 'Base', module: 'MQProvider' },
  PromptsService: { layer: 'Base', module: 'PromptsProvider' },
  RelationDBService: { layer: 'Base', module: 'RelationDBProvider' },
  SkillService: { layer: 'Base', module: 'SkillProvider' },
  SoulService: { layer: 'Base', module: 'SoulProvider' },
  StreamService: { layer: 'Base', module: 'StreamProvider' },
  VectorDBService: { layer: 'Base', module: 'VectorDBProvider' },
  ToolProviderService: { layer: 'Base', module: 'ToolProvider' },

  
  CDTCoreService: { layer: 'Core', module: 'CDTCoreProvider' },
  InfoCoreService: { layer: 'Core', module: 'InfoCoreProvider' },
  LLMCoreService: { layer: 'Core', module: 'LLMCoreProvider' },
  MCPCoreService: { layer: 'Core', module: 'MCPCoreProvider' },
  MQCoreService: { layer: 'Core', module: 'MQCoreProvider' },
  SkillCoreService: { layer: 'Core', module: 'SkillCoreProvider' },
  SoulCoreService: { layer: 'Core', module: 'SoulCoreProvider' },

  
  AgentBuilderService: { layer: 'Agent', module: 'AgentBuilder' },
  AgentContextService: { layer: 'Agent', module: 'AgentContext' },
  AgentExecutionService: { layer: 'Agent', module: 'AgentExecution' },
  AgentLibraryService: { layer: 'Agent', module: 'AgentLibrary' },
  AgentStrategyService: { layer: 'Agent', module: 'AgentStrategy' },
  EvolutorAgentService: { layer: 'Agent', module: 'EvolutorAgent' },
  IntentAgentService: { layer: 'Agent', module: 'IntentAgent' },
  SummaryAgentService: { layer: 'Agent', module: 'SummaryAgent' },
  WriterAgentService: { layer: 'Agent', module: 'WriterAgent' },

  
  AgentDefService: { layer: 'Runtime', module: 'Agents' },
  AgentLoopService: { layer: 'Runtime', module: 'Loop' },
  RunGatewayService: { layer: 'Runtime', module: 'Runs' },
  SessionService: { layer: 'Runtime', module: 'Session' },
  ToolService: { layer: 'Runtime', module: 'Tools' },

  
  ChatService: { layer: 'Application', module: 'Chat' },
  ConfigService: { layer: 'Application', module: 'Config' },
  SelfLearningService: { layer: 'Application', module: 'SelfLearning' },
  UserProfileService: { layer: 'Application', module: 'UserProfile' },
  VisualizationService: { layer: 'Application', module: 'Visualization' },
};

export interface AopProxyOptions {
  
  layer?: string;
  
  module?: string;
  
  logger?: Logger;
  
  enableAop?: boolean;
  
  interceptors?: Interceptor[];
}

export class AopProxy {
  

  static wrap<T extends object>(target: T, options?: AopProxyOptions): T {
    const enableAop = options?.enableAop ?? true;
    const interceptors = AopProxy.resolveInterceptors(options);

    return new Proxy(target, {
      get(obj: T, prop: string | symbol): unknown {
        return AopProxy.proxyGet(obj, prop, options, enableAop, interceptors);
      },
    });
  }

  private static resolveInterceptors(options?: AopProxyOptions): Interceptor[] {
    if (options?.interceptors && options.interceptors.length > 0) {
      return options.interceptors;
    }
    if (options?.logger) {
      return [AopProxy.createLoggerInterceptor(options.logger)];
    }
    return [AopProxy.createLoggerInterceptor(new ConsoleLogger())];
  }

  private static proxyGet<T extends object>(
    obj: T,
    prop: string | symbol,
    options: AopProxyOptions | undefined,
    enableAop: boolean,
    interceptors: Interceptor[],
  ): unknown {
    const value = Reflect.get(obj as Record<string, unknown>, prop);
    if (typeof value !== 'function') {
      return value;
    }
    const methodName = String(prop);
    const targetName = obj.constructor.name;
    const layer = options?.layer || CLASS_LAYER_MODULE_MAP[targetName]?.layer || 'Base';
    const module = options?.module || CLASS_LAYER_MODULE_MAP[targetName]?.module || targetName.replace(/Service$/, 'Provider');
    const timingPrefix = `${layer}.${module}.${targetName}.${methodName}`;
    const fn = value as (...args: unknown[]) => unknown;

    return function wrapped(this: unknown, ...args: unknown[]): unknown {
      return AopProxy.invokeWrapped(obj, fn, args, {
        enableAop,
        interceptors,
        targetName,
        methodName,
        timingPrefix,
        logger: options?.logger,
      });
    };
  }

  private static invokeWrapped(
    obj: unknown,
    fn: (...args: unknown[]) => unknown,
    args: unknown[],
    invocation: {
      enableAop: boolean;
      interceptors: Interceptor[];
      targetName: string;
      methodName: string;
      timingPrefix: string;
      logger?: Logger;
    },
  ): unknown {
    if (!invocation.enableAop) {
      return fn.apply(obj, args);
    }

    const prepared = AopProxy.prepareInvocationArgs(args);
    AopProxy.applyNewStyleDefaults(args, prepared.isNewStyle, prepared.effectiveTraceId, invocation.targetName, invocation.methodName, invocation.logger);

    const startedAt = Date.now();
    const metricsArg = prepared.isNewStyle ? (args[3] as Metrics | undefined) : undefined;
    const reportArg = prepared.isNewStyle ? (args[4] as unknown) : undefined;
    const span = metricsArg ? metricsArg.beginSpan(invocation.timingPrefix) : undefined;
    AopProxy.bindReportMetrics(prepared.isNewStyle, metricsArg, reportArg);
    const ctx: InterceptContext = {
      targetName: invocation.targetName,
      methodName: invocation.methodName,
      input: args[0],
      context: prepared.contextArg,
      output: prepared.outputArg,
      metrics: metricsArg,
      report: reportArg,
      traceId: prepared.effectiveTraceId,
      startedAt,
      elapsedMs: 0,
    };

    AopProxy.runBeforeExecute(invocation.interceptors, ctx);

    AopProxy.runPreExecute(invocation.interceptors, ctx);

    return AopProxy.invokeWithLifecycle(obj, fn, args, invocation.interceptors, ctx, metricsArg, span, startedAt);
  }

  private static prepareInvocationArgs(args: unknown[]): {
    isNewStyle: boolean;
    contextArg: unknown;
    outputArg: unknown;
    effectiveTraceId: string | undefined;
  } {
    const isNewStyle = args.length >= 4;
    const contextArg = isNewStyle ? args[2] : args[1];
    const outputArg = isNewStyle ? args[1] : args[2];
    const metricsInstance = isNewStyle ? args[3] : undefined;
    let effectiveTraceId = metricsInstance instanceof Metrics ? metricsInstance.trace_id : undefined;
    if (!effectiveTraceId) effectiveTraceId = IdGenerator.generate();
    return { isNewStyle, contextArg, outputArg, effectiveTraceId };
  }

  private static applyNewStyleDefaults(
    args: unknown[],
    isNewStyle: boolean,
    effectiveTraceId: string | undefined,
    targetName: string,
    methodName: string,
    logger: Logger | undefined,
  ): void {
    if (!isNewStyle) {
      return;
    }
    if (!args[3]) {
      args[3] = new Metrics(logger, `${targetName}.${methodName}`, effectiveTraceId);
    }
    if (!args[4]) {
      args[4] = new Report({
        trace_id: effectiveTraceId,
        session_id: AopProxy.pickField(args[0], 'session_id'),
        session_key: AopProxy.pickField(args[0], 'session_key') || AopProxy.pickField(args[0], 'session_id'),
        run_id: AopProxy.pickField(args[0], 'run_id'),
        stream_endpoint_id: AopProxy.pickField(args[0], 'stream_endpoint_id'),
        work_id: AopProxy.pickField(args[0], 'work_id'),
      });
    }
    const fallbackMetrics = args[3] instanceof Metrics ? (args[3] as Metrics) : undefined;
    if (fallbackMetrics && !fallbackMetrics.trace_id) {
      fallbackMetrics.trace_id = effectiveTraceId;
    }
    if (fallbackMetrics && !fallbackMetrics.category) {
      fallbackMetrics.category = fallbackMetrics.category || `${targetName}.${methodName}`;
    }
  }

  private static bindReportMetrics(isNewStyle: boolean, metricsArg: Metrics | undefined, reportArg: unknown): void {
    if (
      isNewStyle &&
      metricsArg instanceof Metrics &&
      reportArg instanceof (Report as unknown as { new (): unknown }) &&
      typeof (reportArg as Report).bindMetrics === 'function'
    ) {
      (reportArg as Report).bindMetrics(metricsArg);
    }
  }

  private static invokeWithLifecycle(
    obj: unknown,
    fn: (...args: unknown[]) => unknown,
    args: unknown[],
    interceptors: Interceptor[],
    ctx: InterceptContext,
    metricsArg: Metrics | undefined,
    span: ReturnType<Metrics['beginSpan']> | undefined,
    startedAt: number,
  ): unknown {
    try {
      const result = fn.apply(obj, args);

      if (result instanceof Promise) {
        return result
          .then((res: unknown) => {
            AopProxy.finishInvocation(args, ctx, metricsArg, span, startedAt);
            AopProxy.runPostExecute(interceptors, ctx, res);
            AopProxy.runAfterExecute(interceptors, ctx);
            return res;
          })
          .catch((err: unknown) => {
            AopProxy.finishInvocation(args, ctx, metricsArg, span, startedAt);
            const error = err instanceof Error ? err : new Error(String(err));
            AopProxy.runAfterExecute(interceptors, ctx, error);
            throw err;
          });
      }

      AopProxy.finishInvocation(args, ctx, metricsArg, span, startedAt);
      AopProxy.runPostExecute(interceptors, ctx, result);
      AopProxy.runAfterExecute(interceptors, ctx);
      return result;
    } catch (err) {
      AopProxy.finishInvocation(args, ctx, metricsArg, span, startedAt);
      const error = err instanceof Error ? err : new Error(String(err));
      AopProxy.runAfterExecute(interceptors, ctx, error);
      throw err;
    }
  }

  private static finishInvocation(
    args: unknown[],
    ctx: InterceptContext,
    metricsArg: Metrics | undefined,
    span: ReturnType<Metrics['beginSpan']> | undefined,
    startedAt: number,
  ): void {
    const finishedAt = Date.now();
    ctx.elapsedMs = finishedAt - startedAt;
    if (metricsArg && span) metricsArg.endSpan(span);
    AopProxy.fillElapsed(args, ctx.elapsedMs);
  }

  
  
  

  

  private static runBeforeExecute(
    interceptors: Interceptor[],
    ctx: InterceptContext,
  ): void {
    for (const interceptor of interceptors) {
      try {
        interceptor.beforeExecute?.(ctx);
      } catch (err) {
        
        console.warn(`AopProxy.runBeforeExecute 拦截器异常已忽略（不影响业务）: ${interceptor?.constructor?.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  

  private static runPreExecute(
    interceptors: Interceptor[],
    ctx: InterceptContext,
  ): void {
    for (const interceptor of interceptors) {
      try {
        interceptor.preExecute?.(ctx);
      } catch (err) {
        
        console.warn(`AopProxy.runPreExecute 拦截器异常已忽略（不影响业务）: ${interceptor?.constructor?.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  

  private static runPostExecute(
    interceptors: Interceptor[],
    ctx: InterceptContext,
    result: unknown,
  ): void {
    for (const interceptor of interceptors) {
      try {
        interceptor.postExecute?.(ctx, result);
      } catch (err) {
        
        console.warn(`AopProxy.runPostExecute 拦截器异常已忽略（不影响业务）: ${interceptor?.constructor?.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  

  private static runAfterExecute(
    interceptors: Interceptor[],
    ctx: InterceptContext,
    error?: Error,
  ): void {
    for (const interceptor of interceptors) {
      try {
        interceptor.afterExecute?.(ctx, error);
      } catch (err) {
        
        console.warn(`AopProxy.runAfterExecute 拦截器异常已忽略（不影响业务）: ${interceptor?.constructor?.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  
  
  

  

  private static fillElapsed(args: unknown[], elapsed: number): void {
    const isNewStyle = args.length >= 4;
    const output = isNewStyle ? args[1] : args[2];
    if (
      output !== null &&
      typeof output === 'object' &&
      !Array.isArray(output)
    ) {
      (output as { elapsed_ms?: number }).elapsed_ms = elapsed;
    }
    if (isNewStyle && args[3] instanceof Metrics) {
      (args[3] as Metrics).elapsed_ms = elapsed;
    }
  }

  

  

  private static createLoggerInterceptor(logger: Logger): Interceptor {
    return {
      afterExecute(ctx: InterceptContext, error?: Error): void {
        const metrics = ctx.metrics as Metrics | undefined;
        if (metrics && typeof metrics.saveInvocation === 'function') {
          if (error && ctx.elapsedMs !== undefined) {
            metrics.elapsed_ms = ctx.elapsedMs;
          }
          metrics.saveInvocation({
            targetName: ctx.targetName,
            methodName: ctx.methodName,
            status: error ? 'error' : 'ok',
            error: error?.message,
            args: {
              input: ctx.input,
              output: ctx.output,
              context: ctx.context,
              metrics: ctx.metrics,
              report: ctx.report,
            },
          });
          return;
        }
        
        if (error) {
          logger.error(`${ctx.methodName} failed`, {
            source: ctx.targetName,
            elapsed_ms: ctx.elapsedMs,
            trace_id: AopProxy.pickTraceId(ctx),
            error: error.message,
          });
        }
      },
    };
  }

  

  private static pickTraceId(ctx: InterceptContext): string | undefined {
    const metrics = ctx.metrics as Metrics | undefined;
    return metrics?.trace_id ?? AopProxy.pickField(ctx.input, 'trace_id');
  }

  

  private static pickField(input: unknown, field: string): string | undefined {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const value = (input as Record<string, unknown>)[field];
      if (typeof value === 'string' && value) return value;
    }
    return undefined;
  }

}
