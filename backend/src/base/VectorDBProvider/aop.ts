import { Input, Output, Context } from '../../shared/base';
import { logger } from '../../infrastructure/logger';

export function aopProxy<T extends object>(target: T, moduleName: string): T {
  return new Proxy(target, {
    get(target: T, prop: string | symbol, receiver: any) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function' || prop === 'constructor') {
        return original;
      }

      return function (...args: any[]) {
        const methodName = String(prop);
        const startTime = Date.now();
        const traceId = (args[0] as Input)?.traceId || '-';

        logger.info(moduleName, `[${methodName}] start`, { traceId });

        try {
          const result = original.apply(target, args);

          if (result instanceof Promise) {
            return result.then(
              (resolved) => {
                const elapsed = Date.now() - startTime;
                logger.info(moduleName, `[${methodName}] completed in ${elapsed}ms`, { traceId });
                if (resolved === false && args[2] instanceof Output) {
                  logger.warn(moduleName, `[${methodName}] returned false`, {
                    traceId,
                    error: args[2].error,
                  });
                }
                return resolved;
              },
              (err: unknown) => {
                const elapsed = Date.now() - startTime;
                const errorMessage = err instanceof Error ? err.message : String(err);
                logger.error(moduleName, `[${methodName}] error after ${elapsed}ms: ${errorMessage}`, { traceId });
                throw err;
              }
            );
          }

          const elapsed = Date.now() - startTime;
          logger.info(moduleName, `[${methodName}] completed in ${elapsed}ms`, { traceId });

          if (result === false && args[2] instanceof Output) {
            logger.warn(moduleName, `[${methodName}] returned false`, {
              traceId,
              error: args[2].error,
            });
          }

          return result;
        } catch (err: unknown) {
          const elapsed = Date.now() - startTime;
          const errorMessage = err instanceof Error ? err.message : String(err);
          logger.error(moduleName, `[${methodName}] error after ${elapsed}ms: ${errorMessage}`, { traceId });
          throw err;
        }
      };
    },
  });
}
