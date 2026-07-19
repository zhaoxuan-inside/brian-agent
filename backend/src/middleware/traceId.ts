import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

const traceIdStorage = new AsyncLocalStorage<string>();

export function traceIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceId = (req.headers['x-trace-id'] as string) || uuidv4();
  res.setHeader('X-Trace-Id', traceId);
  traceIdStorage.run(traceId, () => {
    next();
  });
}

export function getTraceId(): string | undefined {
  return traceIdStorage.getStore();
}