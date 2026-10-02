import type { RelationDBAccess } from '../../RelationDBProvider';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import type { Metrics, Report } from '../../shared/base';
import {
  TraceContext,
  RecordUsageInput, RecordUsageOutput,
  SoDailyUsageInput, SoDailyUsageOutput,
  SoUsageEventsInput, SoUsageEventsOutput,
  SoEntityUsageTotalInput, SoEntityUsageTotalOutput,
  SoProviderTokenUsageInput, SoProviderTokenUsageOutput,
  USAGE_ENTITY_TABLES, USAGE_EVENT_TABLE,
  type UsageEntityType,
} from '../domain/types';

/**
 * TraceBase 统一统计服务(ADR-012):
 * recordUsage 写 usage_event_record 事件流水并按 (entity, usage_date) UPSERT 日聚合 org 表;
 * 各模块(Soul/Skill/MCP/LLM Core、AgentLibrary 等)一律经本服务记录用量,禁止自建统计表。
 */
export class TraceService {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async recordUsage(
    input: RecordUsageInput, output: RecordUsageOutput, _context: TraceContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.entity_type || !input.entity_id) {
      output.error = 'recordUsage 需要 entity_type 与 entity_id';
      output.error_code = 'VALIDATION_ERROR';
      return false;
    }
    const now = IdGenerator.now();
    const eventId = IdGenerator.generate();
    this.relationDb.insert(USAGE_EVENT_TABLE, [
      { field: 'id', value: eventId },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'trace_id', value: input.trace_id ?? '' },
      { field: 'entity_type', value: input.entity_type },
      { field: 'entity_id', value: input.entity_id },
      { field: 'agent_id', value: input.agent_id ?? '' },
      { field: 'work_id', value: input.work_id ?? '' },
      { field: 'run_id', value: input.run_id ?? '' },
      { field: 'session_id', value: input.session_id ?? '' },
      { field: 'usage_context', value: input.usage_context ?? '' },
      { field: 'input_tokens', value: input.input_tokens ?? 0 },
      { field: 'output_tokens', value: input.output_tokens ?? 0 },
    ]);
    await this.upsertDailyOrg(input);
    output.event_id = eventId;
    return true;
  }

  /** 日聚合 UPSERT:冲突按 (实体列, usage_date) 累加,失败(无唯一索引等)时降级 select-update-insert */
  private async upsertDailyOrg(input: RecordUsageInput): Promise<void> {
    const spec = USAGE_ENTITY_TABLES[input.entity_type as UsageEntityType];
    const usageDate = IdGenerator.today();
    const now = IdGenerator.now();
    const isLlm = input.entity_type === 'llm';
    const columns = ['id', 'created', 'updated', 'trace_id', spec.idColumn, 'usage_date', 'usage_count'];
    const values: unknown[] = [IdGenerator.generate(), now, now, '', input.entity_id, usageDate, 1];
    if (isLlm) {
      columns.push('input_tokens', 'output_tokens');
      values.push(input.input_tokens ?? 0, input.output_tokens ?? 0);
    }
    const updateSet = isLlm
      ? `"usage_count" = "usage_count" + 1, "updated" = ${now}, "input_tokens" = "input_tokens" + ${input.input_tokens ?? 0}, "output_tokens" = "output_tokens" + ${input.output_tokens ?? 0}`
      : `"usage_count" = "usage_count" + 1, "updated" = ${now}`;
    try {
      this.relationDb.executeRaw(
        `INSERT INTO "${spec.table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${values.map((v) => (typeof v === 'string' ? `'${this.esc(v)}'` : String(v))).join(', ')}) ON CONFLICT(${spec.idColumn}, usage_date) DO UPDATE SET ${updateSet}`,
      );
    } catch {
      await this.fallbackDailyUpsert(spec.table, spec.idColumn, input.entity_id, usageDate, now, input);
    }
  }

  private async fallbackDailyUpsert(
    table: string, idColumn: string, entityId: string, usageDate: string, now: number, input: RecordUsageInput,
  ): Promise<void> {
    const existing = await this.relationDb.selectOne(table, [
      { field: idColumn, operator: '=', value: entityId },
      { field: 'usage_date', operator: '=', value: usageDate },
    ]);
    if (existing) {
      const patch: Array<{ field: string; value: unknown }> = [
        { field: 'usage_count', value: (Number(existing.usage_count) || 0) + 1 },
        { field: 'updated', value: now },
      ];
      if (input.entity_type === 'llm') {
        patch.push({ field: 'input_tokens', value: (Number(existing.input_tokens) || 0) + (input.input_tokens ?? 0) });
        patch.push({ field: 'output_tokens', value: (Number(existing.output_tokens) || 0) + (input.output_tokens ?? 0) });
      }
      this.relationDb.update(table, patch, [
        { field: idColumn, operator: '=', value: entityId },
        { field: 'usage_date', operator: '=', value: usageDate },
      ]);
    } else {
      const row: Array<{ field: string; value: unknown }> = [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: idColumn, value: entityId },
        { field: 'usage_date', value: usageDate },
        { field: 'usage_count', value: 1 },
      ];
      if (input.entity_type === 'llm') {
        row.push({ field: 'input_tokens', value: input.input_tokens ?? 0 });
        row.push({ field: 'output_tokens', value: input.output_tokens ?? 0 });
      }
      this.relationDb.insert(table, row);
    }
  }

  private esc(value: string): string {
    return String(value ?? '').replace(/'/g, "''");
  }

  async soDailyUsage(
    input: SoDailyUsageInput, output: SoDailyUsageOutput, _context: TraceContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const spec = USAGE_ENTITY_TABLES[input.entity_type as UsageEntityType];
    const conds: string[] = [];
    const params: unknown[] = [];
    if (input.entity_ids && input.entity_ids.length > 0) {
      conds.push(`"${spec.idColumn}" IN (${input.entity_ids.map(() => '?').join(',')})`);
      params.push(...input.entity_ids);
    }
    if (input.since_date) { conds.push(`"usage_date" >= ?`); params.push(input.since_date); }
    if (input.until_date) { conds.push(`"usage_date" <= ?`); params.push(input.until_date); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    // 仅 llm_usage_org 有 token 列,其余实体 org 表无此列,聚合时如实置 0
    const isLlm = input.entity_type === 'llm';
    const rows = await this.relationDb.queryRaw<Record<string, unknown>>(
      `SELECT "${spec.idColumn}" AS entity_id, "usage_date", "usage_count", COALESCE(${isLlm ? '"input_tokens"' : '0'}, 0) AS input_tokens, COALESCE(${isLlm ? '"output_tokens"' : '0'}, 0) AS output_tokens FROM "${spec.table}" ${where} ORDER BY "usage_date" DESC`,
      params,
    );
    output.items = (rows ?? []).map((r) => ({
      entity_id: String(r.entity_id ?? ''),
      usage_date: String(r.usage_date ?? ''),
      usage_count: Number(r.usage_count ?? 0),
      input_tokens: Number(r.input_tokens ?? 0),
      output_tokens: Number(r.output_tokens ?? 0),
    }));
    return true;
  }

  async soUsageEvents(
    input: SoUsageEventsInput, output: SoUsageEventsOutput, _context: TraceContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (input.entity_type) { conds.push(`"entity_type" = ?`); params.push(input.entity_type); }
    if (input.entity_id) { conds.push(`"entity_id" = ?`); params.push(input.entity_id); }
    if (input.agent_id) { conds.push(`"agent_id" = ?`); params.push(input.agent_id); }
    if (input.run_id) { conds.push(`"run_id" = ?`); params.push(input.run_id); }
    if (input.work_id) { conds.push(`"work_id" = ?`); params.push(input.work_id); }
    if (input.since_created) { conds.push(`"created" >= ?`); params.push(input.since_created); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 1000) : 200;
    const rows = await this.relationDb.queryRaw<Record<string, unknown>>(
      `SELECT * FROM "${USAGE_EVENT_TABLE}" ${where} ORDER BY "created" DESC LIMIT ${limit}`,
      params,
    );
    output.events = (rows ?? []).map((r) => this.toEvent(r));
    output.total = output.events.length;
    return true;
  }

  async soEntityUsageTotal(
    input: SoEntityUsageTotalInput, output: SoEntityUsageTotalOutput, _context: TraceContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const conds = [`entity_type = '${this.esc(input.entity_type)}'`, `entity_id = '${this.esc(input.entity_id)}'`];
    if (input.agent_id) conds.push(`agent_id = '${this.esc(input.agent_id)}'`);
    const rows = this.relationDb.queryRaw<{ total: number }>(
      `SELECT COALESCE(SUM(1), 0) AS total FROM "${USAGE_EVENT_TABLE}" WHERE ${conds.join(' AND ')}`,
    );
    output.total_count = Number(rows?.[0]?.total ?? 0);
    return true;
  }

  /** 供应商维度 Token 用量(配额检查用):usage_event(llm) JOIN llm_available_record 归属 provider */
  async soProviderTokenUsage(
    input: SoProviderTokenUsageInput, output: SoProviderTokenUsageOutput, _context: TraceContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const since = input.since_ts && input.since_ts > 0 ? `AND e."created" >= ${Math.floor(input.since_ts)}` : '';
    const rows = this.relationDb.queryRaw<{ tokens: number; calls: number }>(
      `SELECT COALESCE(SUM(e."input_tokens" + e."output_tokens"), 0) AS tokens, COUNT(*) AS calls
       FROM "${USAGE_EVENT_TABLE}" e
       JOIN "llm_available_record" a ON a."id" = e."entity_id"
       WHERE e."entity_type" = 'llm' AND a."llm_provider_id" = '${this.esc(input.llm_provider_id)}' ${since}`,
    );
    output.tokens_used = Number(rows?.[0]?.tokens ?? 0);
    output.call_count = Number(rows?.[0]?.calls ?? 0);
    return true;
  }

  private toEvent(r: Record<string, unknown>) {
    return {
      id: String(r.id ?? ''),
      created: Number(r.created ?? 0),
      updated: Number(r.updated ?? 0),
      trace_id: String(r.trace_id ?? ''),
      entity_type: String(r.entity_type ?? '') as UsageEntityType,
      entity_id: String(r.entity_id ?? ''),
      agent_id: String(r.agent_id ?? ''),
      work_id: String(r.work_id ?? ''),
      run_id: String(r.run_id ?? ''),
      session_id: String(r.session_id ?? ''),
      usage_context: String(r.usage_context ?? ''),
      input_tokens: Number(r.input_tokens ?? 0),
      output_tokens: Number(r.output_tokens ?? 0),
    };
  }
}
