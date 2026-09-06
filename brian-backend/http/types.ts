import type http from 'node:http';
import type { RelationDBAccess } from '../Base/RelationDBProvider/access/RelationDBAccess';
import type { GraphDBAccess } from '../Base/GraphDBProvider/access/GraphDBAccess';
import type { InfoCoreAccess } from '../Core/InfoCoreProvider/access/InfoCoreAccess';
import type { MonitorAccess } from '../Application/Monitor/access/MonitorAccess';
import type { FeedbackAccess } from '../Application/Feedback/access/FeedbackAccess';
import type { MemoryAccess } from '../Application/Memory/access/MemoryAccess';

export interface HttpRouteRequest {
  method: string;
  pathname: string;
  params: URLSearchParams;
  body: Record<string, unknown>;
}

/** dev-server buildContext 返回值中路由层所需字段 */
export interface RouteContext {
  relationDb: RelationDBAccess;
  infoCore: InfoCoreAccess;
  graphDBAccess: GraphDBAccess;
  monitorAccess: MonitorAccess;
  feedbackAccess: FeedbackAccess;
  memoryAccess: MemoryAccess;
}

export type RouteHandler = (
  ctx: RouteContext,
  req: HttpRouteRequest,
  res: http.ServerResponse,
) => Promise<boolean>;
