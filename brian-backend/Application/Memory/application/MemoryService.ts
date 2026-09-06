import { InfoType, Operator, Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, GraphDBAccess, Logger } from '@brian-agent/base';
import { ValidationError } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  InfoCoreContext,
  DelInfoGraphInput,
  DelInfoGraphOutput,
  ClearGraphInput,
  ClearGraphOutput,
} from '@brian-agent/core';
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
  type MemoryItemDto,
} from '../domain/types';

type CooccurGraph = {
  nodes: Array<{ id: string; name: string; weight: number; degree: number }>;
  edges: Array<{ source: string; target: string; weight: number }>;
};

type InfoRawRow = {
  id: string;
  info_id: string;
  info_type: string;
  info_creator_role: string;
  info: string;
  pin: number;
  created: number;
  updated: number;
};

export class MemoryService {
  private readonly graphCache = new Map<string, { data: CooccurGraph; ts: number }>();
  private readonly GRAPH_CACHE_TTL = 30_000;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly graphDBAccess: GraphDBAccess,
    private readonly logger?: Logger,
  ) {}

  async soMemoryList(input: ListMemoryInput, output: ListMemoryOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const limit = Math.min(Math.max(input.limit || 50, 1), 200);
    const cursor = (input.cursor || '').trim();
    const conds: string[] = [];
    const args: unknown[] = [];
    if (cursor) {
      const idx = cursor.indexOf(':');
      const cCreated = idx > 0 ? Number(cursor.slice(0, idx)) : NaN;
      const cId = idx > 0 ? cursor.slice(idx + 1) : '';
      if (!isNaN(cCreated)) {
        conds.push('("created" < ? OR ("created" = ? AND "id" < ?))');
        args.push(cCreated, cCreated, cId);
      }
    }
    const where = conds.length > 0 ? ` WHERE ${conds.join(' AND ')}` : '';
    const rows = this.relationDb.queryRaw<InfoRawRow>(
      `SELECT "id", "info_id", "info_type", "info_creator_role", "info", "pin", "created", "updated" FROM "info_raw"${where} ORDER BY "created" DESC, "id" DESC LIMIT ${limit + 1}`,
      args,
    );
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const tagMap = this.queryInfoTagsByInfoIds(pageRows.map((r) => r.info_id));
    const last = pageRows[pageRows.length - 1];
    output.memories = pageRows.map((r) => this.mapInfoToMemory(r, tagMap.get(r.info_id) || []));
    output.has_more = hasMore;
    output.next_cursor = hasMore && last ? `${last.created}:${last.id}` : null;
    return true;
  }

  async soMemoryByTag(input: GetMemoryByTagInput, output: GetMemoryByTagOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const tag = (input.tag || '').trim();
    const rows = this.relationDb.queryRaw<InfoRawRow>(
      'SELECT r."id", r."info_id", r."info_type", r."info_creator_role", r."info", r."pin", r."created", r."updated" FROM "info_raw" r INNER JOIN "info_tag" t ON t."info_id" = r."info_id" WHERE t."tag" = ? ORDER BY r."created" DESC LIMIT 200',
      [tag],
    );
    const tagMap = this.queryInfoTagsByInfoIds(rows.map((r) => r.info_id));
    output.memories = rows.map((r) => this.mapInfoToMemory(r, tagMap.get(r.info_id) || []));
    return true;
  }

  async searchMemory(input: SearchMemoryInput, output: SearchMemoryOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const kw = (input.keyword || '').trim();
    const type = (input.type || '').trim();
    const tag = (input.tag || '').trim();
    const startTime = input.start_time;
    const endTime = input.end_time;
    const cursor = (input.cursor || '').trim();
    const limit = Math.min(Math.max(input.limit || 50, 1), 200);
    const conds: string[] = [];
    const args: unknown[] = [];
    if (kw) {
      conds.push('("info" LIKE ? OR "info_id" IN (SELECT "info_id" FROM "info_tag" WHERE "tag" LIKE ?))');
      args.push(`%${kw}%`, `%${kw}%`);
    }
    if (type) {
      const typeToInfo: Record<string, string[]> = {
        semantic: ['RESPONSE'],
        episodic: ['REQUEST'],
        procedural: ['THINK', 'REFLECT', 'SKILL', 'MCP'],
        working: ['ACT'],
      };
      const infoTypes = typeToInfo[type] || [];
      if (infoTypes.length > 0) {
        conds.push(`"info_type" IN (${infoTypes.map(() => '?').join(',')})`);
        args.push(...infoTypes);
      }
    }
    if (tag) {
      conds.push('"info_id" IN (SELECT "info_id" FROM "info_tag" WHERE "tag" = ?)');
      args.push(tag);
    }
    if (startTime !== undefined) {
      conds.push('"created" >= ?');
      args.push(startTime);
    }
    if (endTime !== undefined) {
      conds.push('"created" < ?');
      args.push(endTime);
    }
    if (cursor) {
      const idx = cursor.indexOf(':');
      const cCreated = idx > 0 ? Number(cursor.slice(0, idx)) : NaN;
      const cId = idx > 0 ? cursor.slice(idx + 1) : '';
      if (!isNaN(cCreated)) {
        conds.push('("created" < ? OR ("created" = ? AND "id" < ?))');
        args.push(cCreated, cCreated, cId);
      }
    }
    const where = conds.length > 0 ? ` WHERE ${conds.join(' AND ')}` : '';
    const rows = this.relationDb.queryRaw<InfoRawRow>(
      `SELECT "id", "info_id", "info_type", "info_creator_role", "info", "pin", "created", "updated" FROM "info_raw"${where} ORDER BY "created" DESC, "id" DESC LIMIT ${limit + 1}`,
      args,
    );
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const tagMap = this.queryInfoTagsByInfoIds(pageRows.map((r) => r.info_id));
    const last = pageRows[pageRows.length - 1];
    output.memories = pageRows.map((r) => this.mapInfoToMemory(r, tagMap.get(r.info_id) || []));
    output.has_more = hasMore;
    output.next_cursor = hasMore && last ? `${last.created}:${last.id}` : null;
    return true;
  }

  async delMemory(input: DeleteMemoryInput, output: DeleteMemoryOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const infoIds = (input.info_ids || []).map((x) => String(x)).filter(Boolean);
    if (infoIds.length === 0) {
      throw new ValidationError('info_ids 必须为非空数组');
    }
    await this.relationDb.delete('info_tag', [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
    await this.relationDb.delete('info_summary', [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
    await this.relationDb.delete('info_keyword', [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
    await this.relationDb.delete('info_vector', [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
    await this.infoCore.delInfoGraph(
      Object.assign(new DelInfoGraphInput(), { info_ids: infoIds }),
      new DelInfoGraphOutput(),
      new InfoCoreContext(),
    );
    output.deleted_count = await this.relationDb.delete('info_raw', [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
    return true;
  }

  async soMemoryTags(_input: ListMemoryTagsInput, output: ListMemoryTagsOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const tagRows = this.relationDb.queryRaw<{ tag: string; cnt: number }>(
      'SELECT "tag", COUNT(*) AS "cnt" FROM "info_tag" GROUP BY "tag" ORDER BY "cnt" DESC',
    );
    output.tags = tagRows.map((r) => r.tag);
    return true;
  }

  async soTagGraph(input: GetCooccurGraphInput, output: GetCooccurGraphOutput, ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const limit = Math.min(500, Math.max(1, input.limit || 100));
    try {
      const g = await this.buildCooccurGraphFromGraphDBCached(ctx, 'Tag', 'tag', 'cooccur', limit);
      output.nodes = g.nodes;
      output.edges = g.edges;
      output.error = '';
    } catch (err) {
      output.nodes = [];
      output.edges = [];
      output.error = err instanceof Error ? err.message : '标签图谱加载失败';
      this.logger?.warn?.('[MemoryService] soTagGraph failed', { error: output.error });
    }
    return true;
  }

  async soKeywordGraph(input: GetCooccurGraphInput, output: GetCooccurGraphOutput, ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const limit = Math.min(500, Math.max(1, input.limit || 100));
    try {
      const g = await this.buildCooccurGraphFromGraphDBCached(ctx, 'keyword', 'keyword', 'keywordCooccur', limit);
      output.nodes = g.nodes;
      output.edges = g.edges;
      output.error = '';
    } catch (err) {
      output.nodes = [];
      output.edges = [];
      output.error = err instanceof Error ? err.message : '关键词图谱加载失败';
      this.logger?.warn?.('[MemoryService] soKeywordGraph failed', { error: output.error });
    }
    return true;
  }

  async delTagGraph(_input: ClearTagGraphInput, output: ClearTagGraphOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const out = new ClearGraphOutput();
    await this.infoCore.clearGraph(Object.assign(new ClearGraphInput(), { node_type: 'Tag' }), out, new InfoCoreContext());
    output.deleted_nodes = out.deleted_nodes;
    return true;
  }

  async delKeywordGraph(_input: ClearKeywordGraphInput, output: ClearKeywordGraphOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const out = new ClearGraphOutput();
    await this.infoCore.clearGraph(Object.assign(new ClearGraphInput(), { node_type: 'keyword' }), out, new InfoCoreContext());
    output.deleted_nodes = out.deleted_nodes;
    return true;
  }

  async graphSearchMemory(input: GraphSearchMemoryInput, output: GraphSearchMemoryOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const query = (input.query || '').trim();
    if (!query) {
      throw new ValidationError('query is required');
    }
    const maxDepth = typeof input.max_depth === 'number' && input.max_depth > 0 ? Math.min(input.max_depth, 5) : 2;
    const onlyActive = input.only_active !== false;
    const fanOutLimit = 500;

    try {
      const { GraphContext, SelectGraphOutput, GraphTarget } = await import('@brian-agent/base');

      const matchedTags = this.relationDb.queryRaw<{ tag: string; info_id: string }>(
        'SELECT DISTINCT "tag", "info_id" FROM "info_tag" WHERE "tag" LIKE ? LIMIT 20',
        [`%${query.replace(/%/g, '').replace(/'/g, '')}%`],
      );
      if (!matchedTags || matchedTags.length === 0) {
        output.root_tags = [];
        output.paths = [];
        return true;
      }

      const tagInfoMap = new Map<string, string[]>();
      for (const t of matchedTags) {
        const list = tagInfoMap.get(t.tag) ?? [];
        list.push(t.info_id);
        tagInfoMap.set(t.tag, list);
      }

      const findTagNodeId = async (tagText: string): Promise<string> => {
        const out = new SelectGraphOutput();
        await this.graphDBAccess.selectGraph(
          { target: GraphTarget.NODE, node_type: 'Tag' }, out, new GraphContext(),
        );
        for (const node of out.list as Array<{ id: string; content: Record<string, unknown> }>) {
          if (node.content?.['tag'] === tagText) return node.id;
        }
        return '';
      };

      const fetchEdges = async (frontier: string[]): Promise<Array<{ id: string; from_node_id: string; to_node_id: string; weight: number; is_active: boolean }>> => {
        const out = new SelectGraphOutput();
        await this.graphDBAccess.selectGraph({
          target: GraphTarget.EDGE,
          edge_type: 'similarTo',
          conditions: [
            { field: 'from_node_id', operator: Operator.IN, value: frontier },
            { field: 'to_node_id', operator: Operator.IN, value: frontier, logic: 'OR' },
          ],
        }, out, new GraphContext());
        return (out.list as Array<{ id: string; from_node_id: string; to_node_id: string; weight: number; is_active: boolean }>)
          .filter((e) => !onlyActive || e.is_active)
          .slice(0, fanOutLimit);
      };

      interface TraversalNode { id: string; tag: string; info_ids: string[]; depth: number }
      interface TraversalEdge { from_id: string; to_id: string; weight: number; active: boolean; compositeWeight: number }

      const paths: Array<{ root_tag: string; root_id: string; nodes: TraversalNode[]; edges: TraversalEdge[] }> = [];
      for (const [tagText, infoIds] of tagInfoMap) {
        const rootId = await findTagNodeId(tagText);
        if (!rootId) continue;
        const visited = new Set<string>([rootId]);
        const allNodes = new Map<string, TraversalNode>([[rootId, { id: rootId, tag: tagText, info_ids: [...infoIds], depth: 0 }]]);
        const allEdges: TraversalEdge[] = [];
        let frontier = [rootId];
        for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
          const edgeRows = await fetchEdges(frontier);
          if (edgeRows.length === 0) break;
          const nextFrontier: string[] = [];
          for (const e of edgeRows) {
            const neighborId = frontier.includes(e.from_node_id) ? e.to_node_id : e.from_node_id;
            if (!visited.has(neighborId)) {
              visited.add(neighborId);
              nextFrontier.push(neighborId);
              allNodes.set(neighborId, { id: neighborId, tag: neighborId.substring(0, 8), info_ids: [], depth: d + 1 });
            }
            let cw = e.weight;
            try { cw = await this.graphDBAccess.computeEdgeWeight(e.id, d + 1); } catch { /* keep weight */ }
            allEdges.push({ from_id: e.from_node_id, to_id: e.to_node_id, weight: e.weight, active: !!e.is_active, compositeWeight: cw });
          }
          frontier = nextFrontier;
        }
        paths.push({ root_tag: tagText, root_id: rootId, nodes: Array.from(allNodes.values()), edges: allEdges });
      }

      output.root_tags = Array.from(tagInfoMap, ([tag, info_ids]) => ({ tag, info_ids }));
      output.paths = paths;
      output.error = '';
    } catch (err) {
      output.root_tags = [];
      output.paths = [];
      output.error = err instanceof Error ? err.message : '图搜索失败';
      this.logger?.warn?.('[MemoryService] graphSearchMemory failed', { error: output.error });
    }
    return true;
  }

  async soMemoryStats(_input: GetMemoryStatsInput, output: GetMemoryStatsOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const totalRows = this.relationDb.queryRaw<{ cnt: number }>(
      'SELECT COUNT(*) AS "cnt" FROM "info_raw"',
    );
    const typeRows = this.relationDb.queryRaw<{ info_type: string; cnt: number }>(
      'SELECT "info_type", COUNT(*) AS "cnt" FROM "info_raw" GROUP BY "info_type"',
    );
    const byType: Record<string, number> = {};
    for (const r of typeRows) { byType[r.info_type || 'unknown'] = r.cnt; }
    output.totalMemories = totalRows[0]?.cnt || 0;
    output.byType = byType;
    return true;
  }

  async soMemoryHeatmap(input: GetMemoryHeatmapInput, output: GetMemoryHeatmapOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const year = input.year;
    const month = input.month;
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError('无效的年份或月份');
    }
    const start = new Date(year, month - 1, 1).getTime();
    const end = new Date(year, month, 1).getTime();
    const rows = this.relationDb.queryRaw<{ created: number }>(
      'SELECT "created" FROM "info_raw" WHERE "created" >= ? AND "created" < ?',
      [start, end],
    );
    const days: Record<string, number> = {};
    for (const r of rows) {
      const d = new Date(Number(r.created)).getDate();
      days[String(d)] = (days[String(d)] || 0) + 1;
    }
    output.year = year;
    output.month = month;
    output.days = days;
    return true;
  }

  async soMemoryDateCounts(input: GetMemoryDateCountsInput, output: GetMemoryDateCountsOutput, _ctx: MemoryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const tzMs = (input.tz || 0) * 60000;
    const rows = this.relationDb.queryRaw<{ day_num: number; cnt: number }>(
      'SELECT CAST(("created" + ?) / 86400000 AS INTEGER) AS day_num, COUNT(*) AS cnt FROM "info_raw" WHERE "created" IS NOT NULL GROUP BY day_num',
      [tzMs],
    );
    const dates: Record<string, number> = {};
    for (const r of rows) {
      if (r.day_num == null) continue;
      const d = new Date(r.day_num * 86400000);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      dates[key] = r.cnt;
    }
    output.dates = dates;
    return true;
  }

  private mapInfoToMemory(row: InfoRawRow, tags: string[] = []): MemoryItemDto {
    const typeMap: Record<string, string> = {
      [InfoType.REQUEST]: 'episodic',
      [InfoType.RESPONSE]: 'semantic',
      [InfoType.THINK]: 'procedural',
      [InfoType.REFLECT]: 'procedural',
      [InfoType.ACT]: 'working',
      [InfoType.SKILL]: 'procedural',
      [InfoType.MCP]: 'procedural',
      [InfoType.CDT]: 'procedural',
      [InfoType.SELF_LEARNING]: 'semantic',
      [InfoType.AGENT]: 'procedural',
    };
    const type = typeMap[row.info_type] || (row.info_creator_role === 'USER' ? 'episodic' : 'semantic');
    const info = row.info || '';
    return {
      id: row.info_id || row.id,
      type,
      content: info,
      tags,
      confidence: this.computeMemoryConfidence(row.info_type, tags, info.length, Number(row.pin) || 0),
      createdAt: Number(row.created) || 0,
      updatedAt: Number(row.updated) || 0,
    };
  }

  private computeMemoryConfidence(infoType: string, tags: string[], infoLength: number, pin: number): number {
    const baseReliability: Record<string, number> = {
      [InfoType.SELF_LEARNING]: 0.6,
      [InfoType.REQUEST]: 0.55,
      [InfoType.RESPONSE]: 0.5,
      [InfoType.SKILL]: 0.45,
      [InfoType.MCP]: 0.45,
      [InfoType.CDT]: 0.45,
      [InfoType.AGENT]: 0.45,
      [InfoType.ACT]: 0.4,
      [InfoType.REFLECT]: 0.35,
      [InfoType.THINK]: 0.3,
    };
    const base = baseReliability[infoType] ?? 0.5;
    const tagBoost = Math.min(tags.length, 5) * 0.04;
    const lengthBoost = infoLength >= 100 ? 0.05 : 0;
    const pinBoost = pin === 1 ? 0.1 : 0;
    const raw = base + tagBoost + lengthBoost + pinBoost;
    return Math.round(Math.min(0.95, Math.max(0.05, raw)) * 100) / 100;
  }

  private queryInfoTagsByInfoIds(infoIds: string[]): Map<string, string[]> {
    const tagMap = new Map<string, string[]>();
    if (infoIds.length === 0) return tagMap;
    const tagRows = this.relationDb.queryRaw<{ info_id: string; tag: string }>(
      `SELECT "info_id", "tag" FROM "info_tag" WHERE "info_id" IN (${infoIds.map(() => '?').join(',')})`,
      infoIds,
    );
    for (const t of tagRows) {
      if (!tagMap.has(t.info_id)) tagMap.set(t.info_id, []);
      tagMap.get(t.info_id)!.push(t.tag);
    }
    return tagMap;
  }

  private async buildCooccurGraphFromGraphDB(
    _ctx: MemoryContext,
    nodeType: string,
    textField: string,
    edgeType: string,
    limit = 100,
  ): Promise<CooccurGraph> {
    const { GraphContext, SelectGraphOutput, GraphTarget } = await import('@brian-agent/base');

    const nodeOut = new SelectGraphOutput();
    await this.graphDBAccess.selectGraph(
      { target: GraphTarget.NODE, node_type: nodeType },
      nodeOut,
      new GraphContext(),
    );
    const allNodes = (nodeOut.list as Array<{ id: string; content?: Record<string, unknown> }>)
      .map((n) => ({ id: n.id, text: String(n.content?.[textField] ?? ''), freq: Number(n.content?.['freq'] ?? 0) }))
      .filter((n) => n.text);

    const rawNodes = [...allNodes].sort((a, b) => b.freq - a.freq).slice(0, Math.max(1, Math.floor(limit)));
    const keptIds = new Set(rawNodes.map((n) => n.id));

    const edgeOut = new SelectGraphOutput();
    await this.graphDBAccess.selectGraph(
      { target: GraphTarget.EDGE, edge_type: edgeType },
      edgeOut,
      new GraphContext(),
    );
    const rawEdges = (edgeOut.list as Array<{ from_node_id: string; to_node_id: string; weight: number }>)
      .filter((e) => keptIds.has(e.from_node_id) && keptIds.has(e.to_node_id));

    const idToText = new Map(rawNodes.map((n) => [n.id, n.text]));

    const degreeMap = new Map<string, number>();
    for (const e of rawEdges) {
      const s = idToText.get(e.from_node_id);
      const t = idToText.get(e.to_node_id);
      if (!s || !t) continue;
      degreeMap.set(s, (degreeMap.get(s) || 0) + 1);
      degreeMap.set(t, (degreeMap.get(t) || 0) + 1);
    }

    const nodes = rawNodes.map((n) => ({
      id: n.text,
      name: n.text,
      weight: n.freq || 1,
      degree: degreeMap.get(n.text) || 0,
    }));
    const edges = rawEdges
      .map((e) => ({ source: idToText.get(e.from_node_id) ?? '', target: idToText.get(e.to_node_id) ?? '', weight: e.weight }))
      .filter((e) => e.source && e.target);

    return { nodes, edges };
  }

  private async buildCooccurGraphFromGraphDBCached(
    ctx: MemoryContext,
    nodeType: string,
    textField: string,
    edgeType: string,
    limit = 100,
  ): Promise<CooccurGraph> {
    const cacheKey = `${nodeType}:${edgeType}:${limit}`;
    const cached = this.graphCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.GRAPH_CACHE_TTL) {
      return cached.data;
    }
    const data = await this.buildCooccurGraphFromGraphDB(ctx, nodeType, textField, edgeType, limit);
    this.graphCache.set(cacheKey, { data, ts: Date.now() });
    return data;
  }
}
