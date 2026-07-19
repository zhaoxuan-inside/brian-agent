import { Request, Response, NextFunction } from 'express';
import { logger } from '../infrastructure/logger';
import { AppError } from '../shared/errors';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const traceId = (req.headers['x-trace-id'] as string) || 'unknown';

  if (err instanceof AppError) {
    logger.error('HTTP', `[${traceId}] ${err.code || 'ERROR'} ${err.message}`, {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Handle JSON parse errors
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: 'Invalid JSON in request body',
      code: 'INVALID_JSON',
    });
    return;
  }

  // Handle unexpected errors
  logger.error('HTTP', `[${traceId}] Unhandled error: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}