import type http from 'node:http';
import { ValidationError } from '@brian-agent/base';
import type { HttpRouteRequest, RouteContext, RouteHandler } from '../types';
import { sendJson } from '../response';
import {
  MonitorContext,
  GetHealthAllInput,
  GetHealthAllOutput,
  GetResourcesInput,
  GetResourcesOutput,
  GetTokenTrendInput,
  GetTokenTrendOutput,
  GetModelDistributionInput,
  GetModelDistributionOutput,
  GetTokenUsageInput,
  GetTokenUsageOutput,
  GetLogSourcesInput,
  GetLogSourcesOutput,
  GetLogStatsInput,
  GetLogStatsOutput,
  QueryLogsInput,
  QueryLogsOutput,
  DeleteLogsInput,
  DeleteLogsOutput,
  ClearLogsInput,
  ClearLogsOutput,
} from '../../Application/Monitor/domain/types';

export const tryHandleMonitorRoutes: RouteHandler = async (
  ctx: RouteContext,
  req: HttpRouteRequest,
  res: http.ServerResponse,
): Promise<boolean> => {
  const { method, pathname, params, body } = req;

  if (method === 'GET' && pathname === '/api/monitor/health-all') {
    const out = new GetHealthAllOutput();
    await ctx.monitorAccess.soHealthAll(new GetHealthAllInput(), out, new MonitorContext());
    sendJson(res, 200, out);
    return true;
  }

  if (method === 'GET' && pathname === '/api/monitor/resources') {
    const out = new GetResourcesOutput();
    await ctx.monitorAccess.soResources(new GetResourcesInput(), out, new MonitorContext());
    sendJson(res, 200, out);
    return true;
  }

  if (method === 'GET' && pathname === '/api/analytics/token-trend') {
    const out = new GetTokenTrendOutput();
    await ctx.monitorAccess.soTokenTrend(new GetTokenTrendInput(), out, new MonitorContext());
    sendJson(res, 200, { points: out.points });
    return true;
  }

  if (method === 'GET' && pathname === '/api/analytics/model-distribution') {
    const out = new GetModelDistributionOutput();
    await ctx.monitorAccess.soModelDistribution(new GetModelDistributionInput(), out, new MonitorContext());
    sendJson(res, 200, { models: out.models });
    return true;
  }

  if (method === 'GET' && pathname === '/api/analytics/token-usage') {
    const out = new GetTokenUsageOutput();
    await ctx.monitorAccess.soTokenUsage(new GetTokenUsageInput(), out, new MonitorContext());
    sendJson(res, 200, out);
    return true;
  }

  if (method === 'GET' && pathname === '/api/monitor/logs/sources') {
    try {
      const out = new GetLogSourcesOutput();
      await ctx.monitorAccess.soLogSources(new GetLogSourcesInput(), out, new MonitorContext());
      sendJson(res, 200, { sources: out.sources });
    } catch (e: unknown) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : '日志来源查询失败' });
    }
    return true;
  }

  if (method === 'GET' && pathname === '/api/monitor/logs/stats') {
    try {
      const out = new GetLogStatsOutput();
      await ctx.monitorAccess.soLogStats(
        Object.assign(new GetLogStatsInput(), {
          start_time: params.get('start_time') ? Number(params.get('start_time')) : undefined,
          end_time: params.get('end_time') ? Number(params.get('end_time')) : undefined,
        }),
        out,
        new MonitorContext(),
      );
      sendJson(res, 200, { distribution: out.distribution });
    } catch (e: unknown) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : '日志统计失败' });
    }
    return true;
  }

  if (method === 'GET' && pathname === '/api/monitor/logs/query') {
    try {
      const out = new QueryLogsOutput();
      await ctx.monitorAccess.soLogs(
        Object.assign(new QueryLogsInput(), {
          level: params.get('level') || undefined,
          source: params.get('source') || undefined,
          keyword: params.get('keyword') || undefined,
          trace_id: params.get('trace_id') || undefined,
          work_id: params.get('work_id') || undefined,
          interact_id: params.get('interact_id') || undefined,
          log_source: params.get('log_source') || undefined,
          start_time: params.get('start_time') ? Number(params.get('start_time')) : undefined,
          end_time: params.get('end_time') ? Number(params.get('end_time')) : undefined,
          page: params.get('page') ? Number(params.get('page')) : undefined,
          pageSize: params.get('pageSize') ? Number(params.get('pageSize')) : (params.get('limit') ? Number(params.get('limit')) : undefined),
        }),
        out,
        new MonitorContext(),
      );
      sendJson(res, 200, out);
    } catch (e: unknown) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : '日志查询失败' });
    }
    return true;
  }

  if (method === 'DELETE' && pathname === '/api/monitor/logs') {
    try {
      const rawIds = body.ids;
      const out = new DeleteLogsOutput();
      await ctx.monitorAccess.delLogs(
        Object.assign(new DeleteLogsInput(), {
          ids: Array.isArray(rawIds) ? rawIds.map((x) => String(x)).filter(Boolean) : [],
        }),
        out,
        new MonitorContext(),
      );
      sendJson(res, 200, { deleted_count: out.deleted_count });
    } catch (e: unknown) {
      const status = e instanceof ValidationError ? 400 : 500;
      sendJson(res, status, { error: e instanceof Error ? e.message : '删除日志失败' });
    }
    return true;
  }

  if (method === 'DELETE' && pathname === '/api/monitor/logs/all') {
    const out = new ClearLogsOutput();
    await ctx.monitorAccess.clearLogs(new ClearLogsInput(), out, new MonitorContext());
    sendJson(res, 200, { deleted_count: out.deleted_count });
    return true;
  }

  return false;
};
