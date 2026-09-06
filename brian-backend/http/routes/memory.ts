import type http from 'node:http';
import { ValidationError } from '@brian-agent/base';
import type { HttpRouteRequest, RouteContext, RouteHandler } from '../types';
import { sendJson } from '../response';
import {
  MemoryContext,
  ListMemoryInput,
  ListMemoryOutput,
  SearchMemoryInput,
  SearchMemoryOutput,
  GetMemoryByTagInput,
  GetMemoryByTagOutput,
  DeleteMemoryInput,
  DeleteMemoryOutput,
  ListMemoryTagsInput,
  ListMemoryTagsOutput,
  GetCooccurGraphInput,
  GetCooccurGraphOutput,
  ClearTagGraphInput,
  ClearTagGraphOutput,
  ClearKeywordGraphInput,
  ClearKeywordGraphOutput,
  GraphSearchMemoryInput,
  GraphSearchMemoryOutput,
  GetMemoryStatsInput,
  GetMemoryStatsOutput,
  GetMemoryHeatmapInput,
  GetMemoryHeatmapOutput,
  GetMemoryDateCountsInput,
  GetMemoryDateCountsOutput,
} from '../../Application/Memory/domain/types';

export const tryHandleMemoryRoutes: RouteHandler = async (
  ctx: RouteContext,
  req: HttpRouteRequest,
  res: http.ServerResponse,
): Promise<boolean> => {
  const { method, pathname, params, body } = req;

  if (method === 'GET' && pathname === '/api/memory/list') {
    const out = new ListMemoryOutput();
    await ctx.memoryAccess.soMemoryList(
      Object.assign(new ListMemoryInput(), {
        limit: Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 200),
        cursor: (params.get('cursor') || '').trim(),
      }),
      out,
      new MemoryContext(),
    );
    sendJson(res, 200, {
      memories: out.memories,
      has_more: out.has_more,
      next_cursor: out.next_cursor,
    });
    return true;
  }

  if (method === 'GET' && /\/api\/memory\/tag\//.test(pathname)) {
    const parts = pathname.split('/');
    const tag = decodeURIComponent(parts[parts.length - 1] || '');
    const out = new GetMemoryByTagOutput();
    await ctx.memoryAccess.soMemoryByTag(
      Object.assign(new GetMemoryByTagInput(), { tag }),
      out,
      new MemoryContext(),
    );
    sendJson(res, 200, out.memories);
    return true;
  }

  if (method === 'GET' && pathname === '/api/memory/search') {
    const out = new SearchMemoryOutput();
    await ctx.memoryAccess.searchMemory(
      Object.assign(new SearchMemoryInput(), {
        keyword: (params.get('keyword') || '').trim(),
        type: (params.get('type') || '').trim(),
        tag: (params.get('tag') || '').trim(),
        start_time: params.get('start_time') ? parseInt(params.get('start_time')!, 10) : undefined,
        end_time: params.get('end_time') ? parseInt(params.get('end_time')!, 10) : undefined,
        cursor: (params.get('cursor') || '').trim(),
        limit: Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 200),
      }),
      out,
      new MemoryContext(),
    );
    sendJson(res, 200, {
      memories: out.memories,
      has_more: out.has_more,
      next_cursor: out.next_cursor,
    });
    return true;
  }

  if (method === 'DELETE' && pathname === '/api/memory') {
    try {
      const rawIds = body.info_ids;
      const infoIds = Array.isArray(rawIds)
        ? (rawIds as unknown[]).map((x) => String(x)).filter(Boolean)
        : [];
      if (infoIds.length === 0) {
        sendJson(res, 400, { error: 'info_ids 必须为非空数组' });
        return true;
      }
      const out = new DeleteMemoryOutput();
      await ctx.memoryAccess.delMemory(
        Object.assign(new DeleteMemoryInput(), { info_ids: infoIds }),
        out,
        new MemoryContext(),
      );
      sendJson(res, 200, { deleted_count: out.deleted_count });
    } catch (e: unknown) {
      const status = e instanceof ValidationError ? 400 : 500;
      sendJson(res, status, { error: e instanceof Error ? e.message : '删除记忆失败' });
    }
    return true;
  }

  if (method === 'GET' && pathname === '/api/memory/tags') {
    const out = new ListMemoryTagsOutput();
    await ctx.memoryAccess.soMemoryTags(new ListMemoryTagsInput(), out, new MemoryContext());
    sendJson(res, 200, { tags: out.tags });
    return true;
  }

  if (method === 'GET' && pathname === '/api/memory/tag-graph') {
    const out = new GetCooccurGraphOutput();
    await ctx.memoryAccess.soTagGraph(
      Object.assign(new GetCooccurGraphInput(), {
        limit: Math.min(500, Math.max(1, parseInt(params.get('limit') || '100', 10) || 100)),
      }),
      out,
      new MemoryContext(),
    );
    sendJson(res, out.error ? 503 : 200, out);
    return true;
  }

  if (method === 'GET' && pathname === '/api/memory/keyword-graph') {
    const out = new GetCooccurGraphOutput();
    await ctx.memoryAccess.soKeywordGraph(
      Object.assign(new GetCooccurGraphInput(), {
        limit: Math.min(500, Math.max(1, parseInt(params.get('limit') || '100', 10) || 100)),
      }),
      out,
      new MemoryContext(),
    );
    sendJson(res, out.error ? 503 : 200, out);
    return true;
  }

  if (method === 'DELETE' && pathname === '/api/memory/tag-graph') {
    try {
      const out = new ClearTagGraphOutput();
      await ctx.memoryAccess.delTagGraph(new ClearTagGraphInput(), out, new MemoryContext());
      sendJson(res, 200, { deleted_nodes: out.deleted_nodes });
    } catch (e: unknown) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : '清理失败' });
    }
    return true;
  }

  if (method === 'DELETE' && pathname === '/api/memory/keyword-graph') {
    try {
      const out = new ClearKeywordGraphOutput();
      await ctx.memoryAccess.delKeywordGraph(new ClearKeywordGraphInput(), out, new MemoryContext());
      sendJson(res, 200, { deleted_nodes: out.deleted_nodes });
    } catch (e: unknown) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : '清理失败' });
    }
    return true;
  }

  if (method === 'POST' && pathname === '/api/memory/graph-search') {
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) {
      sendJson(res, 400, { error: 'query is required' });
      return true;
    }
    const out = new GraphSearchMemoryOutput();
    await ctx.memoryAccess.graphSearchMemory(
      Object.assign(new GraphSearchMemoryInput(), {
        query,
        max_depth: typeof body.max_depth === 'number' && body.max_depth > 0 ? Math.min(body.max_depth, 5) : 2,
        only_active: body.only_active !== false,
      }),
      out,
      new MemoryContext(),
    );
    sendJson(res, out.error ? 503 : 200, { root_tags: out.root_tags, paths: out.paths, error: out.error || undefined });
    return true;
  }

  if (method === 'GET' && /\/api\/memory\/stats\//.test(pathname)) {
    const out = new GetMemoryStatsOutput();
    await ctx.memoryAccess.soMemoryStats(new GetMemoryStatsInput(), out, new MemoryContext());
    sendJson(res, 200, { totalMemories: out.totalMemories, byType: out.byType });
    return true;
  }

  if (method === 'GET' && pathname === '/api/memory/heatmap') {
    const year = parseInt(params.get('year') || '', 10);
    const month = parseInt(params.get('month') || '', 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      sendJson(res, 400, { error: '无效的年份或月份' });
      return true;
    }
    const out = new GetMemoryHeatmapOutput();
    await ctx.memoryAccess.soMemoryHeatmap(
      Object.assign(new GetMemoryHeatmapInput(), { year, month }),
      out,
      new MemoryContext(),
    );
    sendJson(res, 200, { year: out.year, month: out.month, days: out.days });
    return true;
  }

  if (method === 'GET' && pathname === '/api/memory/date-counts') {
    const out = new GetMemoryDateCountsOutput();
    await ctx.memoryAccess.soMemoryDateCounts(
      Object.assign(new GetMemoryDateCountsInput(), {
        tz: parseInt(params.get('tz') || '0', 10) || 0,
      }),
      out,
      new MemoryContext(),
    );
    sendJson(res, 200, { dates: out.dates });
    return true;
  }

  return false;
};
