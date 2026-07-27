import { logger } from '../../infrastructure/logger';
import type { Input, Context, Output } from '../../shared/base';

export type InterceptorName = 'beforeExecute' | 'preExecute' | 'postExecute' | 'afterExecute';

export interface Interceptor {
  beforeExecute?(methodName: string, input: Input, context: Context): void;
  preExecute?(methodName: string, input: Input, context: Context): void;
  postExecute?(methodName: string, input: Input, context: Context, output: Output): void;
  afterExecute?(methodName: string, input: Input, context: Context, output: Output, elapsedMs: number, error?: Error): void;
}

export interface AopProxyOptions {
  logger?: { info: (module: string, msg: string) => void };
  interceptors?: Interceptor[];
}

const defaultLogger = {
  info: (module: string, msg: string) => logger.info(module, msg),
};

function createLogInterceptor(): Interceptor {
  return {
    beforeExecute(methodName) {
      defaultLogger.info('AOP', `[${methodName}] call start`);
    },
    afterExecute(methodName, _input, _context, _output, elapsedMs, error) {
      if (error) {
        defaultLogger.info('AOP', `[${methodName}] call failed: ${error.message} (${elapsedMs}ms)`);
      } else {
        defaultLogger.info('AOP', `[${methodName}] call completed (${elapsedMs}ms)`);
      }
    },
  };
}

function safeInvoke(interceptors: Interceptor[], hook: InterceptorName, ...args: unknown[]): void {
  for (const interceptor of interceptors) {
    try {
      const fn = interceptor[hook] as ((...a: unknown[]) => void) | undefined;
      if (fn) fn(...args);
    } catch {
      // Interceptor exceptions must not affect business method execution
    }
  }
}

export function AopProxy<T extends object>(
  raw: T,
  options: AopProxyOptions = {},
): T {
  const interceptors: Interceptor[] = [
    createLogInterceptor(),
    ...(options.interceptors || []),
  ];

  return new Proxy(raw, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      if (typeof original !== 'function' || typeof prop !== 'string') {
        return original;
      }

      return (...args: unknown[]) => {
        const input = args[0] as Input | undefined;
        const context = args[1] as Context | undefined;
        const output = args[2] as Output | undefined;

        const safeInput = input || {};
        const safeContext = context || {};
        const safeOutput = output || { success: true };

        safeInvoke(interceptors, 'beforeExecute', prop, safeInput, safeContext);
        safeInvoke(interceptors, 'preExecute', prop, safeInput, safeContext);

        const start = Date.now();
        let error: Error | undefined;

        try {
          const result = original.apply(target, args);
          const elapsedMs = Date.now() - start;

          if (safeOutput && typeof safeOutput === 'object') {
            (safeOutput as unknown as Record<string, unknown>).elapsed_ms = elapsedMs;
          }

          safeInvoke(interceptors, 'postExecute', prop, safeInput, safeContext, safeOutput);

          const handleAsync = (resolved: unknown) => {
            if (safeOutput && typeof safeOutput === 'object') {
              (safeOutput as unknown as Record<string, unknown>).elapsed_ms = Date.now() - start;
            }
            safeInvoke(interceptors, 'afterExecute', prop, safeInput, safeContext, safeOutput, Date.now() - start, error);
            return resolved;
          };

          const handleAsyncErr = (err: Error) => {
            error = err;
            const elapsedMs = Date.now() - start;
            safeInvoke(interceptors, 'afterExecute', prop, safeInput, safeContext, safeOutput, elapsedMs, error);
            throw err;
          };

          if (result instanceof Promise) {
            return result.then(handleAsync, handleAsyncErr);
          }

          return result;
        } catch (err) {
          error = err as Error;
          const elapsedMs = Date.now() - start;
          safeInvoke(interceptors, 'afterExecute', prop, safeInput, safeContext, safeOutput, elapsedMs, error);
          throw err;
        }
      };
    },
  });
}
