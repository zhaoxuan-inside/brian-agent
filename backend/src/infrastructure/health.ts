import type { Request, Response } from 'express';
import { getDatabase } from './database.js';
import { logger } from './logger.js';

export function checkLiveness(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
  });
}

export function checkReadiness(_req: Request, res: Response): void {
  const checks: Record<string, boolean> = {
    database: false,
    llm: true,
  };

  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();
    checks.database = true;
  } catch (err) {
    logger.error('Health', 'Database readiness check failed', { error: String(err) });
    checks.database = false;
  }

  const allHealthy = Object.values(checks).every(v => v === true);

  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'ok' : 'degraded',
    timestamp: Date.now(),
    checks,
    uptime: process.uptime(),
  });
}

export function healthRouter(req: Request, res: Response): void {
  const path = req.path;

  switch (path) {
    case '/health/live':
    case '/health/liveness':
      checkLiveness(req, res);
      break;
    case '/health/ready':
    case '/health/readiness':
      checkReadiness(req, res);
      break;
    default:
      checkLiveness(req, res);
      break;
  }
}