import os from 'node:os';
import { Metrics, Report } from '@brian-agent/base';
import type {
  RelationDBAccess, LogAccess, LLMAccess, GraphDBAccess, VectorDBAccess, MQAccess,
  SystemMonitorAccess, Logger,
} from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError,
  GraphContext, VisualizedGraphInput, VisualizedGraphOutput,
  VectorContext, VisualizedVectorInput, VisualizedVectorOutput,
  LLMContext, VisualizedLLMInput, VisualizedLLMOutput,
  MQContext, GetQueueStatsInput, GetQueueStatsOutput,
  SoResourceInput, SoResourceOutput, SystemMonitorContext,
  LogContext, DelLogInput, DelLogOutput,
} from '@brian-agent/base';
import {
  MonitorContext,
  HealthComponent,
  GetHealthAllInput, GetHealthAllOutput,
  GetResourcesInput, GetResourcesOutput,
  GetTokenTrendInput, GetTokenTrendOutput,
  GetModelDistributionInput, GetModelDistributionOutput,
  GetTokenUsageInput, GetTokenUsageOutput,
  QueryLogsInput, QueryLogsOutput,
  GetLogStatsInput, GetLogStatsOutput,
  GetLogSourcesInput, GetLogSourcesOutput,
  DeleteLogsInput, DeleteLogsOutput,
  ClearLogsInput, ClearLogsOutput,
} from '../domain/types';

export class MonitorService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logAccess: LogAccess,
    private readonly llmAccess: LLMAccess,
    private readonly graphDBAccess: GraphDBAccess,
    private readonly vectorDBAccess: VectorDBAccess,
    private readonly mqAccess: MQAccess,
    private readonly systemMonitorAccess: SystemMonitorAccess,
    private readonly logger?: Logger,
  ) {}

  async soHealthAll(_input: GetHealthAllInput, output: GetHealthAllOutput, _ctx: MonitorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const components = await Promise.all([
      this.probeRelationDb(),
      this.probeGraphDb(),
      this.probeVectorDb(),
      this.probeLlm(),
      this.probeMcp(),
      this.probeMq(),
    ]);
    output.components = components;
    output.uptime = Math.round(process.uptime());
    output.status = this.aggregateStatus(components);
    return true;
  }

  async soResources(_input: GetResourcesInput, output: GetResourcesOutput, _ctx: MonitorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const resOut = new SoResourceOutput();
    await this.systemMonitorAccess.soResource(new SoResourceInput(), resOut, new SystemMonitorContext());
    const metrics = resOut.metrics;
    const load = os.loadavg();
    output.cpu = metrics.cpu;
    output.memory = metrics.memory;
    output.disk = metrics.disk;
    output.cores = os.cpus().length;
    output.load1 = Number(load[0]?.toFixed(2)) || 0;
    output.load5 = Number(load[1]?.toFixed(2)) || 0;
    output.load15 = Number(load[2]?.toFixed(2)) || 0;
    output.timestamp = IdGenerator.now();
    return true;
  }

  async soTokenTrend(_input: GetTokenTrendInput, output: GetTokenTrendOutput, _ctx: MonitorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = this.safeQuery<{ date: string; tokens: number }>(
      'SELECT "usage_date" AS "date", SUM(COALESCE("input_tokens",0) + COALESCE("output_tokens",0)) AS "tokens" FROM "llm_usage" GROUP BY "usage_date" ORDER BY "usage_date" ASC',
    );
    output.points = rows.map((r) => ({ date: r.date, tokens: Number(r.tokens) || 0 }));
    return true;
  }

  async soModelDistribution(_input: GetModelDistributionInput, output: GetModelDistributionOutput, _ctx: MonitorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = this.safeQuery<{ model: string; tokens: number; input_tokens: number; output_tokens: number; deleted: number; type: string }>(
      'SELECT COALESCE(e."llm_title", u."llm_available_id") AS "model", COALESCE(e."llm_type", \'deleted\') AS "type", (e."llm_title" IS NULL) AS "deleted", SUM(COALESCE(u."input_tokens",0) + COALESCE(u."output_tokens",0)) AS "tokens", SUM(COALESCE(u."input_tokens",0)) AS "input_tokens", SUM(COALESCE(u."output_tokens",0)) AS "output_tokens" FROM "llm_usage" u LEFT JOIN "llm_available" e ON e."id" = u."llm_available_id" GROUP BY u."llm_available_id" ORDER BY "tokens" DESC',
    );
    output.models = rows.map((r) => ({
      model: r.model,
      type: r.type || 'deleted',
      tokens: Number(r.tokens) || 0,
      input_tokens: Number(r.input_tokens) || 0,
      output_tokens: Number(r.output_tokens) || 0,
      deleted: !!r.deleted,
    }));
    return true;
  }

  async soTokenUsage(_input: GetTokenUsageInput, output: GetTokenUsageOutput, _ctx: MonitorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const today = IdGenerator.today();
    const monthPrefix = today.slice(0, 7);
    output.today = this.sumUsage(`"usage_date" = ?`, [today]);
    output.month = this.sumUsage(`"usage_date" LIKE ?`, [`${monthPrefix}%`]);
    return true;
  }

  async soLogs(input: QueryLogsInput, output: QueryLogsOutput, _ctx: MonitorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const page = input.page && input.page > 0 ? input.page : 1;
    const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : 50;
    const result = await this.logAccess.queryLogs({
      level: input.level,
      source: input.source,
      keyword: input.keyword,
      trace_id: input.trace_id,
      work_id: input.work_id,
      interact_id: input.interact_id,
      log_source: input.log_source,
      start_time: input.start_time,
      end_time: input.end_time,
      page,
      pageSize,
    });
    output.page = page;
    output.pageSize = pageSize;
    output.total = result.total;
    output.entries = (result.logs || []).map((l) => ({
      id: l.id,
      timestamp: l.created,
      level: String(l.level).toLowerCase(),
      source: l.source,
      message: l.message,
      trace_id: l.trace_id || '',
      caller: l.caller || '',
      work_id: l.work_id || '',
      interact_id: l.interact_id || '',
    }));
    return true;
  }

  async soLogStats(input: GetLogStatsInput, output: GetLogStatsOutput, _ctx: MonitorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const result = await this.logAccess.soLogStats({
      start_time: input.start_time,
      end_time: input.end_time,
    });
    output.distribution = result.distribution || [];
    return true;
  }

  async soLogSources(_input: GetLogSourcesInput, output: GetLogSourcesOutput, _ctx: MonitorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.sources = (await this.logAccess.listSources()) || [];
    return true;
  }

  async delLogs(input: DeleteLogsInput, output: DeleteLogsOutput, _ctx: MonitorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const ids = (input.ids || []).map((x) => String(x)).filter(Boolean);
    if (ids.length === 0) {
      throw new ValidationError('ids 必须为非空数组');
    }
    const delOut = new DelLogOutput();
    await this.logAccess.delLog(Object.assign(new DelLogInput(), { ids }), delOut, new LogContext());
    output.deleted_count = delOut.affected_rows;
    return true;
  }

  async clearLogs(_input: ClearLogsInput, output: ClearLogsOutput, _ctx: MonitorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const delOut = new DelLogOutput();
    await this.logAccess.delLog(
      Object.assign(new DelLogInput(), { before_time: IdGenerator.now() + 86400000 }),
      delOut,
      new LogContext(),
    );
    output.deleted_count = delOut.affected_rows;
    return true;
  }

  private aggregateStatus(components: HealthComponent[]): GetHealthAllOutput['status'] {
    if (components.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (components.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }

  private async probeRelationDb(): Promise<HealthComponent> {
    try {
      const start = Date.now();
      this.relationDb.queryRaw('SELECT 1');
      const tables = this.relationDb.queryRaw<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      );
      return {
        name: 'RelationDB', status: 'healthy', message: `${Date.now() - start}ms`,
        details: { '数据表': tables.length },
      };
    } catch (e: unknown) {
      return { name: 'RelationDB', status: 'unhealthy', message: this.errMsg(e, '连接失败') };
    }
  }

  private async probeGraphDb(): Promise<HealthComponent> {
    try {
      const o = new VisualizedGraphOutput();
      await this.graphDBAccess.visualizedGraph(Object.assign(new VisualizedGraphInput(), { scope: 'health' }), o, new GraphContext());
      const d = (o.data && !Array.isArray(o.data)) ? o.data : {};
      const vo = new VisualizedGraphOutput();
      await this.graphDBAccess.visualizedGraph(Object.assign(new VisualizedGraphInput(), { scope: 'volume' }), vo, new GraphContext());
      const vd = (vo.data && !Array.isArray(vo.data)) ? vo.data : {};
      return {
        name: 'GraphDB',
        status: d.connected === false ? 'unhealthy' : (d.enabled === false ? 'degraded' : 'healthy'),
        message: d.connected === false ? '未连接' : `${d.response_time_ms ?? 0}ms`,
        details: { '节点': Number(vd.total_nodes) || 0, '边': Number(vd.total_edges) || 0 },
      };
    } catch (e: unknown) {
      return { name: 'GraphDB', status: 'unhealthy', message: this.errMsg(e, '连接失败') };
    }
  }

  private async probeVectorDb(): Promise<HealthComponent> {
    try {
      const o = new VisualizedVectorOutput();
      await this.vectorDBAccess.visualizedVector(Object.assign(new VisualizedVectorInput(), { scope: 'health' }), o, new VectorContext());
      const d = (o.data && !Array.isArray(o.data)) ? o.data : {};
      const vo = new VisualizedVectorOutput();
      await this.vectorDBAccess.visualizedVector(Object.assign(new VisualizedVectorInput(), { scope: 'volume' }), vo, new VectorContext());
      const vd = (vo.data && !Array.isArray(vo.data)) ? vo.data : {};
      return {
        name: 'VectorDB',
        status: d.connected === false ? 'unhealthy' : (d.enabled === false ? 'degraded' : 'healthy'),
        message: d.connected === false ? '未连接' : `${d.response_time_ms ?? 0}ms`,
        details: { '向量': Number(vd.total_vectors) || 0, '维度': Number(vd.dimension) || 0 },
      };
    } catch (e: unknown) {
      return { name: 'VectorDB', status: 'unhealthy', message: this.errMsg(e, '连接失败') };
    }
  }

  private async probeLlm(): Promise<HealthComponent> {
    try {
      const o = new VisualizedLLMOutput();
      await this.llmAccess.visualizedLLM(Object.assign(new VisualizedLLMInput(), { scope: 'health' }), o, new LLMContext());
      const d = (o.data && !Array.isArray(o.data)) ? o.data : {};
      const enabledProviderCount = await this.relationDb.count('llm_provider', [
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ]);
      return {
        name: 'LLM Provider',
        status: d.connected === false ? 'unhealthy' : (d.enabled === false ? 'degraded' : 'healthy'),
        message: d.connected === false ? '未连接' : `${d.response_time_ms ?? 0}ms`,
        details: { '启用提供商': enabledProviderCount, '启用模型': Number(d.enabled_llm_count) || 0 },
      };
    } catch (e: unknown) {
      return { name: 'LLM Provider', status: 'unhealthy', message: this.errMsg(e, '连接失败') };
    }
  }

  private async probeMcp(): Promise<HealthComponent> {
    try {
      const enabledProviderCount = await this.relationDb.count('mcp_provider', [
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ]);
      const enabledMcpCount = await this.relationDb.count('mcp_install', [
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ]);
      return {
        name: 'MCP',
        status: 'healthy',
        message: `${enabledMcpCount} 个启用 MCP`,
        details: { '启用提供商': enabledProviderCount, '启用 MCP': enabledMcpCount },
      };
    } catch (e: unknown) {
      return { name: 'MCP', status: 'unhealthy', message: this.errMsg(e, '连接失败') };
    }
  }

  private async probeMq(): Promise<HealthComponent> {
    try {
      const o = new GetQueueStatsOutput();
      await this.mqAccess.soQueueStats(new GetQueueStatsInput(), o, new MQContext());
      const s = o.stats || {};
      return {
        name: 'MQ', status: 'healthy', message: `${s.total ?? 0} 条消息`,
        details: { '待处理': s.pending ?? 0, '处理中': s.processing ?? 0, '完成': s.completed ?? 0, '失败': s.failed ?? 0 },
      };
    } catch (e: unknown) {
      return { name: 'MQ', status: 'unhealthy', message: this.errMsg(e, '连接失败') };
    }
  }

  private sumUsage(where: string, params: unknown[]): { tokens: number; requests: number } {
    const rows = this.safeQuery<{ tokens: number; requests: number }>(
      `SELECT SUM(COALESCE("input_tokens",0) + COALESCE("output_tokens",0)) AS "tokens", SUM(COALESCE("usage_count",0)) AS "requests" FROM "llm_usage" WHERE ${where}`,
      params,
    );
    const row = rows[0];
    return { tokens: Number(row?.tokens) || 0, requests: Number(row?.requests) || 0 };
  }

  private safeQuery<T>(sql: string, params: unknown[] = []): T[] {
    try {
      return this.relationDb.queryRaw<T>(sql, params) || [];
    } catch (err) {
      this.logger?.debug?.('[MonitorService] query failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  private errMsg(e: unknown, fallback: string): string {
    return e instanceof Error ? (e.message || fallback) : fallback;
  }
}
