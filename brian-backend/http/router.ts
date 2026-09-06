import type http from 'node:http';
import type { HttpRouteRequest, RouteContext, RouteHandler } from './types';
import { tryHandleMonitorRoutes } from './routes/monitor';
import { tryHandleFeedbackRoutes } from './routes/feedback';
import { tryHandleMemoryRoutes } from './routes/memory';

const handlers: RouteHandler[] = [
  tryHandleMonitorRoutes,
  tryHandleFeedbackRoutes,
  tryHandleMemoryRoutes,
];

export async function dispatchHttpRoutes(
  ctx: RouteContext,
  req: HttpRouteRequest,
  res: http.ServerResponse,
): Promise<boolean> {
  for (const handler of handlers) {
    if (await handler(ctx, req, res)) return true;
  }
  return false;
}
