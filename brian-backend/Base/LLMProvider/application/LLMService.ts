import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import { BusinessEvent } from '../../shared/base/BusinessEvent';
import { Context } from '../../shared/base/Context';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { Logger } from '../../shared/aop/AopProxy';
import type { PromptsAccess } from '../../PromptsProvider/access/PromptsAccess';
import { PromptContext, ExecPromptInput, ExecPromptOutput, SoPromptInput, SoPromptOutput } from '../../PromptsProvider/domain/types';
import { ConfigService } from '../../shared/config/ConfigService';
import { HttpAccess } from '../../ToolProvider/access/HttpAccess';
import { TOOL_CONFIG_TABLE } from '../../ToolProvider/domain/types';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  AbortedError,
  ProviderError,
  type AbortReasonKind,
} from '../../shared/errors';
import { ExecRequestInput, ExecRequestOutput, HttpContext } from '../../ToolProvider/domain/HttpTypes';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator, Direction } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
import type { LLMMessage } from '../../shared/llm/LLMEvent';
import { LLMEventsRunner, DEFAULT_IDLE_WATCHDOG_MS, type LLMEventsRunResult } from './llmevents/LLMEventsRunner';
import { LLMContext, LLMProviderRecord, LLMCacheRecord, LLMAvailableRecord, AddLLMProviderInput, AddLLMProviderOutput, UpdateLLMProviderInput, UpdateLLMProviderOutput, DelLLMProviderInput, DelLLMProviderOutput, SoLLMProviderInput, SoLLMProviderOutput, TestLLMProviderInput, TestLLMProviderOutput, ListLLMInput, ListLLMOutput, AddLLMInput, AddLLMOutput, DelLLMInput, DelLLMOutput, UpdateLLMInput, UpdateLLMOutput, SoLLMInput, SoLLMOutput, ExecLLMInput, ExecLLMOutput, ExecLLMEventsInput, ExecLLMEventsOutput, EmbedLLMInput, EmbedLLMOutput, GenLLMAttrInput, GenLLMAttrOutput, VisualizedLLMInput, VisualizedLLMOutput, EnableLLMInput, EnableLLMOutput, SoTokenUsageInput, SoTokenUsageOutput, SoModelTokenStatsInput, SoModelTokenStatsOutput, LLM_PROVIDER_TABLE, LLM_CACHE_TABLE, LLM_AVAILABLE_TABLE, LLM_CALL_RECORD_TABLE, LLM_CALL_DETAIL_TABLE, LLM_RECORD_TEXT_MAX_CHARS, LLM_CONFIG_TABLE } from '../domain/types';
import { LLMStrategyFactory } from './strategies';
import type { ILLMProviderStrategy, HttpRequestOptions } from './strategies';
import { newRecord } from '../../shared/query';
import { TraceService, RecordUsageInput, RecordUsageOutput, TraceContext, LLM_USAGE_ORG_TABLE } from '../../TraceBase';
import {
  isModelsCacheFresh,
  extractRemoteErrorDetail,
  toCacheInsertRecord,
  toCacheUpdatePatch,
} from '../domain/services/LLMCacheDomainService';

const TEST_TIMEOUT_MS = 10000;

interface EventsSingleResult {
  ok: boolean;
  call_id?: string;
  text?: string;
  reasoning?: string;
  finish_reason?: string;
  tool_calls?: Array<{ index: number; id: string; tool_id: string; arguments: string }>;
  input_tokens?: number;
  output_tokens?: number;
  error?: string;
  error_code?: string;
  aborted_reason?: AbortReasonKind;

  emitted_events?: boolean;

  connect_ms?: number;

  ttft_ms?: number;

  stream_ms?: number;

  first_text_ms?: number;

  thinking_ms?: number;

  response_ms?: number;
}

const LIST_TIMEOUT_MS = 30000;

const EXEC_TIMEOUT_DEFAULT_MS = 120000;

/** llm.invoked 事件携带的原始输出截断上限（全文在 llm_call_detail_record） */
const LLM_INVOKED_OUTPUT_MAX_CHARS = 2000;

const EMBED_TIMEOUT_DEFAULT_MS = 15000;

export class LLMService {

  private enabled = true;

  private closed = false;

  private execTimeoutMs = EXEC_TIMEOUT_DEFAULT_MS;

  private embedTimeoutMs = EMBED_TIMEOUT_DEFAULT_MS;

  private readonly config: ConfigService;
  private readonly http: HttpAccess;
  private readonly trace: TraceService;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logger?: Logger,
    private readonly promptsAccess?: PromptsAccess,
  ) {
    this.config = new ConfigService(relationDb, LLM_CONFIG_TABLE);
    this.http = new HttpAccess(new ConfigService(relationDb, TOOL_CONFIG_TABLE));
    this.trace = new TraceService(relationDb);
  }

  async initialize(): Promise<void> {
    this.enabled = await this.config.getBoolean('enabled', true);

    const execMs = await this.config.getInt('exec_timeout_ms', EXEC_TIMEOUT_DEFAULT_MS);
    const embedMs = await this.config.getInt('embed_timeout_ms', EMBED_TIMEOUT_DEFAULT_MS);
    this.execTimeoutMs = execMs > 0 ? execMs : EXEC_TIMEOUT_DEFAULT_MS;
    this.embedTimeoutMs = embedMs > 0 ? embedMs : EMBED_TIMEOUT_DEFAULT_MS;
  }

  private ensureEnabled(): void {
    if (this.closed) {
      throw new DatabaseError(
        'LLM 组件已关闭（closeLLM 为终态操作），需重新初始化组件',
      );
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('LLM');
    }
  }

  private buildEndpoint(baseUrl: string, apiPath: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${apiPath.replace(/^\/+/, '')}`;
  }

  private async upsertUsage(llmEnableId: string, inputTokens = 0, outputTokens = 0): Promise<void> {
    const usageInput = new RecordUsageInput();
    usageInput.entity_type = 'llm';
    usageInput.entity_id = llmEnableId;
    usageInput.input_tokens = inputTokens;
    usageInput.output_tokens = outputTokens;
    await this.trace.recordUsage(usageInput, new RecordUsageOutput(), new TraceContext());
  }


  private clipRecordText(text: string | undefined): string {
    const raw = String(text ?? '');
    return raw.length > LLM_RECORD_TEXT_MAX_CHARS ? `${raw.slice(0, LLM_RECORD_TEXT_MAX_CHARS)}…(已截断)` : raw;
  }

  private async logCall(args: {
    llmId: string; session_id?: string; run_id?: string; work_id?: string; caller?: string;
    input_tokens?: number; output_tokens?: number; duration_ms?: number;
    status?: string; error_code?: string;
    input_prompt?: string; output_content?: string;
  }): Promise<string> {
    try {
      const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
        { field: 'id', operator: Operator.EQ, value: args.llmId },
      ]);
      const llm = llmRow as unknown as { llm_title?: string; llm_type?: string } | null;
      const callId = IdGenerator.generate();
      await this.relationDb.insert(
        LLM_CALL_RECORD_TABLE,
        newRecord({
          id: callId,
          llm_available_id: args.llmId,
          session_id: args.session_id ?? '',
          run_id: args.run_id ?? '',
          work_id: args.work_id ?? '',
          caller: args.caller ?? '',
          llm_title: String(llm?.llm_title ?? ''),
          llm_type: String(llm?.llm_type ?? ''),
          status: args.status ?? 'ok',
          error_code: args.error_code ?? '',
          input_tokens: Number(args.input_tokens ?? 0) || 0,
          output_tokens: Number(args.output_tokens ?? 0) || 0,
          duration_ms: Number(args.duration_ms ?? 0) || 0,
        }),
      );
      // 原文明细(ADR-012):1:1 落 llm_call_detail_record,记录真实输入 Prompt 与模型输出全文
      const inputText = this.clipRecordText(args.input_prompt);
      const outputText = this.clipRecordText(args.output_content);
      if (inputText || outputText) {
        await this.relationDb.insert(
          LLM_CALL_DETAIL_TABLE,
          newRecord({
            llm_call_id: callId,
            llm_available_id: args.llmId,
            session_id: args.session_id ?? '',
            run_id: args.run_id ?? '',
            work_id: args.work_id ?? '',
            input: inputText,
            input_length: inputText.length,
            output: outputText,
            output_length: outputText.length,
          }),
        );
      }
      return callId;
    } catch (err) {

      this.logger?.warn?.('LLMService.logCall 明细账落账失败（best-effort 不阻断主流程）', {
        error: err instanceof Error ? err.message : String(err),
        llm_id: args.llmId,
      });
      return '';
    }
  }

  private applyDims(
    input: { session_id?: string; run_id?: string; work_id?: string; caller?: string },
    context?: Context,
  ): void {
    input.session_id = input.session_id || context?.session_id || '';
    input.run_id = input.run_id || context?.run_id || '';
    input.work_id = input.work_id || context?.work_id || '';
    input.caller = input.caller || context?.caller || '';
  }

  async soTokenUsage(
    input: SoTokenUsageInput, output: SoTokenUsageOutput,
    _context: LLMContext,
  ): Promise<boolean> {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (input.session_id) {
      conds.push('"session_id" = ?');
      params.push(input.session_id);
    }
    if (input.run_id) {
      conds.push('"run_id" = ?');
      params.push(input.run_id);
    }
    if (input.work_id) {
      conds.push('"work_id" = ?');
      params.push(input.work_id);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = this.relationDb.queryRaw<{ input_tokens: number; output_tokens: number; call_count: number }>(
      `SELECT COALESCE(SUM("input_tokens"),0) AS "input_tokens", COALESCE(SUM("output_tokens"),0) AS "output_tokens", COUNT(*) AS "call_count" FROM "${LLM_CALL_RECORD_TABLE}" ${where}`,
      params,
    );
    const row = rows?.[0];
    output.input_tokens = Number(row?.input_tokens ?? 0) || 0;
    output.output_tokens = Number(row?.output_tokens ?? 0) || 0;
    output.call_count = Number(row?.call_count ?? 0) || 0;
    return true;
  }

  /** R7:按 llm_available_id 聚合全量输入/输出 tokens(llm_usage_org 日聚合表),模型卡片 Token 仪表盘数据源 */
  async soModelTokenStats(
    input: SoModelTokenStatsInput, output: SoModelTokenStatsOutput,
    _context: LLMContext,
  ): Promise<boolean> {
    const rows = this.relationDb.queryRaw<{ llm_available_id: string; input_tokens: number; output_tokens: number; call_count: number }>(
      `SELECT "llm_available_id", COALESCE(SUM("input_tokens"),0) AS "input_tokens", COALESCE(SUM("output_tokens"),0) AS "output_tokens", COUNT(*) AS "call_count" FROM "${LLM_USAGE_ORG_TABLE}" GROUP BY "llm_available_id"`,
    );
    for (const r of rows ?? []) {
      const inTok = Number(r.input_tokens ?? 0) || 0;
      const outTok = Number(r.output_tokens ?? 0) || 0;
      output.stats[String(r.llm_available_id)] = {
        input_tokens: inTok,
        output_tokens: outTok,
        total_tokens: inTok + outTok,
        call_count: Number(r.call_count ?? 0) || 0,
      };
    }
    return true;
  }

  async addLLMProvider(input: AddLLMProviderInput, output: AddLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.llm_provider_url) {
      throw new ValidationError('llm_provider_url 不能为空');
    }
    if (!data.llm_provider_title) {
      throw new ValidationError('llm_provider_title 不能为空');
    }

    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    const [dTokensDay, dTokensWeek, dTokensMonth, dCallsDay, dCallsWeek, dCallsMonth] = await Promise.all([
      this.config.getInt('default_quota_tokens_per_day', 0),
      this.config.getInt('default_quota_tokens_per_week', 0),
      this.config.getInt('default_quota_tokens_per_month', 0),
      this.config.getInt('default_quota_calls_per_day', 0),
      this.config.getInt('default_quota_calls_per_week', 0),
      this.config.getInt('default_quota_calls_per_month', 0),
    ]);

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'llm_provider_url', value: data.llm_provider_url },
      { field: 'llm_provider_title', value: data.llm_provider_title },
      { field: 'llm_provider_brief', value: data.llm_provider_brief ?? null },
      { field: 'enable', value: data.enable === true ? 1 : 0 },
      { field: 'api_key', value: data.api_key ?? null },
      { field: 'models_path', value: data.models_path ?? null },
      { field: 'chat_path', value: data.chat_path ?? null },
      { field: 'quota_tokens_per_day', value: data.quota_tokens_per_day ?? dTokensDay },
      { field: 'quota_tokens_per_week', value: data.quota_tokens_per_week ?? dTokensWeek },
      { field: 'quota_tokens_per_month', value: data.quota_tokens_per_month ?? dTokensMonth },
      { field: 'quota_calls_per_day', value: data.quota_calls_per_day ?? dCallsDay },
      { field: 'quota_calls_per_week', value: data.quota_calls_per_week ?? dCallsWeek },
      { field: 'quota_calls_per_month', value: data.quota_calls_per_month ?? dCallsMonth },
    ];
    await this.relationDb.insert(LLM_PROVIDER_TABLE, dataObjects);
    output.id = id;
    return true;
  }

  async updateLLMProvider(input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;

    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    const patch = input.data;
    if (patch.llm_provider_url !== undefined) {
      data.push({ field: 'llm_provider_url', value: patch.llm_provider_url });
    }
    if (patch.llm_provider_title !== undefined) {
      data.push({
        field: 'llm_provider_title',
        value: patch.llm_provider_title,
      });
    }
    if (patch.llm_provider_brief !== undefined) {
      data.push({
        field: 'llm_provider_brief',
        value: patch.llm_provider_brief,
      });
    }
    if (patch.enable !== undefined) {
      data.push({ field: 'enable', value: patch.enable ? 1 : 0 });
    }
    if (patch.api_key !== undefined) {
      data.push({ field: 'api_key', value: patch.api_key });
    }
    if (patch.models_path !== undefined) {
      data.push({ field: 'models_path', value: patch.models_path });
    }
    if (patch.chat_path !== undefined) {
      data.push({ field: 'chat_path', value: patch.chat_path });
    }
    if (patch.models_fetched_at !== undefined) {
      data.push({ field: 'models_fetched_at', value: patch.models_fetched_at });
    }
    for (const qf of ['quota_tokens_per_day', 'quota_tokens_per_week', 'quota_tokens_per_month',
      'quota_calls_per_day', 'quota_calls_per_week', 'quota_calls_per_month'] as const) {
      if (patch[qf] !== undefined) {
        data.push({ field: qf, value: patch[qf] });
      }
    }

    output.affected_rows = await this.relationDb.update(
      LLM_PROVIDER_TABLE,
      data,
      conditions,
    );
    return true;
  }

  async delLLMProvider(input: DelLLMProviderInput, output: DelLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    let providerIds: string[] = [];
    if (input.ids) {
      providerIds = input.ids;
    } else {
      const rows = await this.relationDb.select(LLM_PROVIDER_TABLE, {
        conditions: input.conditions!,
        fields: ['id'],
      });
      providerIds = rows.map((r) => String(r.id));
    }

    const affected = await this.relationDb.delete(
      LLM_PROVIDER_TABLE,
      conditions,
    );
    output.affected_rows = affected;

    if (providerIds.length > 0) {
      await this.relationDb.delete(LLM_CACHE_TABLE, [
        { field: 'llm_provider_id', operator: Operator.IN, value: providerIds },
      ]);
      const availableRows = await this.relationDb.select(LLM_AVAILABLE_TABLE, {
        conditions: [
          { field: 'llm_provider_id', operator: Operator.IN, value: providerIds },
        ],
        fields: ['id'],
      });
      const availableIds = availableRows.map((r) => String(r.id));
      if (availableIds.length > 0) {
        await this.relationDb.delete(LLM_USAGE_ORG_TABLE, [
          { field: 'llm_available_id', operator: Operator.IN, value: availableIds },
        ]);
      }
      await this.relationDb.delete(LLM_AVAILABLE_TABLE, [
        { field: 'llm_provider_id', operator: Operator.IN, value: providerIds },
      ]);
    }

    return true;
  }

  async soLLMProvider(input: SoLLMProviderInput, output: SoLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    const conditions: Condition[] = [];
    if (input.conditions) {
      conditions.push(...input.conditions);
    }
    if (input.keyword) {
      conditions.push({
        field: 'llm_provider_title',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
      });
    }

    const rows = await this.relationDb.select(LLM_PROVIDER_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      LLM_PROVIDER_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );

    output.list = rows as unknown as LLMProviderRecord[];
    output.total = total;
    return true;
  }

  async testLLMProvider(input: TestLLMProviderInput, output: TestLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const row = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!row) {
      throw new NotFoundError('LLMProvider', input.id);
    }
    const provider = row as unknown as LLMProviderRecord;

    const start = Date.now();
    const strategy = LLMStrategyFactory.soStrategyById(provider);
    const req = strategy.buildTestRequest(provider);

    try {
      const httpInput = Object.assign(new ExecRequestInput(), {
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body,
        timeout_ms: TEST_TIMEOUT_MS,
      });
      const httpOutput = new ExecRequestOutput();
      await this.http.execRequest(httpInput, httpOutput, new HttpContext());
      const res = httpOutput.response;
      output.response_time_ms = Date.now() - start;
      output.status_code = res.status;

      output.connected = true;
    } catch (err) {
      output.response_time_ms = Date.now() - start;
      output.connected = false;
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
    }
    return true;
  }

  async listLLM(input: ListLLMInput, output: ListLLMOutput, _context: LLMContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.llm_provider_id) {
      throw new ValidationError('llm_provider_id 不能为空');
    }
    const provider = await this.soProviderRow(input.llm_provider_id);

    if (isModelsCacheFresh(provider.models_fetched_at, input.force, IdGenerator.now())) {
      await this.soCachedModels(input.llm_provider_id, output);
      output.cached = true;
      return true;
    }
    const parsedModels = await this.fetchRemoteModels(provider, output);
    if (!parsedModels) {
      return false;
    }
    await this.syncModelCache(input.llm_provider_id, parsedModels, metrics);
    await this.updateModelsCacheTimestamp(input.llm_provider_id);
    await this.soCachedModels(input.llm_provider_id, output);
    output.cached = false;
    return true;
  }

  private async soProviderRow(providerId: string): Promise<LLMProviderRecord> {
    const row = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: providerId },
    ]);
    if (!row) {
      throw new NotFoundError('LLMProvider', providerId);
    }
    return row as unknown as LLMProviderRecord;
  }

  private async soCachedModels(providerId: string, output: ListLLMOutput): Promise<void> {
    const rows = await this.relationDb.select(LLM_CACHE_TABLE, {
      conditions: [
        { field: 'llm_provider_id', operator: Operator.EQ, value: providerId },
      ],
      order_by: [{ field: 'llm_title', direction: Direction.ASC }],
    });
    output.list = rows as unknown as LLMCacheRecord[];
  }

  private async fetchRemoteModels(
    provider: LLMProviderRecord,
    output: ListLLMOutput,
  ): Promise<Array<{ modelId: string; displayName?: string; description?: string; maxTokens?: number; raw: Record<string, unknown> }> | null> {
    const strategy = LLMStrategyFactory.soStrategyById(provider);
    const req = strategy.buildListModelsRequest(provider);
    try {
      const httpInput = Object.assign(new ExecRequestInput(), {
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body,
        timeout_ms: LIST_TIMEOUT_MS,
      });
      const httpOutput = new ExecRequestOutput();
      await this.http.execRequest(httpInput, httpOutput, new HttpContext());
      const res = httpOutput.response;
      if (!res.ok) {
        const errDetail = extractRemoteErrorDetail(res.status, res.bodyText);
        output.error = `获取模型列表失败: ${errDetail}`;
        output.error_code = 'REMOTE_ERROR';
        return null;
      }
      let json: unknown = {};
      try {
        json = JSON.parse(res.bodyText);
      } catch {
        json = {};
      }
      return strategy.parseListModelsResponse(json, res.bodyText);
    } catch (err) {
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
      return null;
    }
  }

  private async syncModelCache(
    providerId: string,
    parsedModels: Array<{ modelId: string; displayName?: string; description?: string; maxTokens?: number; raw: Record<string, unknown> }>,
    metrics?: Metrics,
  ): Promise<void> {
    for (const m of parsedModels) {
      if (!m.modelId) continue;
      await this.upsertModelCacheRow(providerId, m, metrics);
    }

    const freshIds = parsedModels.map((m) => m.modelId).filter((id) => !!id);
    if (freshIds.length > 0) {
      await this.relationDb.delete(LLM_CACHE_TABLE, [
        { field: 'llm_provider_id', operator: Operator.EQ, value: providerId },
        { field: 'llm_title', operator: Operator.NOT_IN, value: freshIds },
      ]);
    }
  }

  private async upsertModelCacheRow(
    providerId: string,
    m: { modelId: string; displayName?: string; description?: string; maxTokens?: number; raw: Record<string, unknown> },
    metrics?: Metrics,
  ): Promise<void> {
    const existing = await this.relationDb.selectOne(LLM_CACHE_TABLE, [
      { field: 'llm_provider_id', operator: Operator.EQ, value: providerId },
      { field: 'llm_title', operator: Operator.EQ, value: m.modelId },
    ]);
    if (existing) {
      await this.relationDb.update(
        LLM_CACHE_TABLE,
        toCacheUpdatePatch(m),
        [
          { field: 'llm_provider_id', operator: Operator.EQ, value: providerId },
          { field: 'llm_title', operator: Operator.EQ, value: m.modelId },
        ],
      );
      return;
    }
    try {
      await this.relationDb.insert(LLM_CACHE_TABLE, toCacheInsertRecord(providerId, m));
    } catch (err) {

      metrics?.warn('LLMService.listLLM 模型缓存写入失败（可能重复，跳过该条）', {
        error: err instanceof Error ? err.message : String(err),
        llm_provider_id: providerId,
        model: m.modelId,
      });
    }
  }

  private async updateModelsCacheTimestamp(providerId: string): Promise<void> {
    await this.relationDb.update(
      LLM_PROVIDER_TABLE,
      [{ field: 'models_fetched_at', value: IdGenerator.now() }],
      [{ field: 'id', operator: Operator.EQ, value: providerId }],
    );
  }

  async addLLM(input: AddLLMInput, output: AddLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.llm_provider_id) {
      throw new ValidationError('llm_provider_id 不能为空');
    }
    if (!data.llm_title) {
      throw new ValidationError('llm_title 不能为空');
    }

    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'llm_provider_id', value: data.llm_provider_id },
      { field: 'llm_title', value: data.llm_title },
      { field: 'llm_brief', value: data.llm_brief ?? null },
      { field: 'llm_type', value: data.llm_type || 'text' },
      { field: 'enable', value: data.enable === false ? 0 : 1 },
      { field: 'is_default', value: data.is_default ? 1 : 0 },
      { field: 'max_tokens', value: data.max_tokens ?? 0 },
    ];
    await this.relationDb.insert(LLM_AVAILABLE_TABLE, dataObjects);
    output.id = id;
    return true;
  }

  async delLLM(input: DelLLMInput, output: DelLLMOutput, _context: LLMContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    let modelIds: string[] = [];
    if (input.ids) {
      modelIds = input.ids;
    } else {
      const rows = await this.relationDb.select(LLM_AVAILABLE_TABLE, {
        conditions: input.conditions!,
        fields: ['id'],
      });
      modelIds = rows.map((r) => String(r.id));
    }

    if (modelIds.length > 0) {
      await this.relationDb.delete(LLM_USAGE_ORG_TABLE, [
        { field: 'llm_available_id', operator: Operator.IN, value: modelIds },
      ]);
      try {
        // ADR-012:agent_llm 退役,删模型时清 agent_record.llm_id 绑定
        await this.relationDb.update('agent_record', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch {  }
      try {
        await this.relationDb.update('evolutor_agent_config_record', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch {  }
      try {
        await this.relationDb.update('writer_agent_config_record', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch {  }
      try {
        await this.relationDb.update('self_learning_config_record', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch {  }
      try {
        await this.relationDb.update('self_learning_config_record', [
          { field: 'document_query_llm_id', value: '' },
        ], [
          { field: 'document_query_llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch {  }
      try {
        await this.relationDb.update('user_profiles', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch {  }
      try {
        await this.relationDb.update('soul_core_config_record', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch (err) {

        metrics?.warn('LLMService.delLLM 清理 soul_core_config 引用失败（表可能不存在）', {
          error: err instanceof Error ? err.message : String(err),
          llm_ids: modelIds.join(','),
        });
      }
    }

    output.affected_rows = await this.relationDb.delete(
      LLM_AVAILABLE_TABLE,
      conditions,
    );
    return true;
  }

  async updateLLM(input: UpdateLLMInput, output: UpdateLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;

    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    const patch = input.data;
    if (patch.llm_title !== undefined) {
      data.push({ field: 'llm_title', value: patch.llm_title });
    }
    if (patch.llm_brief !== undefined) {
      data.push({ field: 'llm_brief', value: patch.llm_brief });
    }
    if (patch.llm_type !== undefined) {
      data.push({ field: 'llm_type', value: patch.llm_type });
    }
    if (patch.enable !== undefined) {
      data.push({ field: 'enable', value: patch.enable ? 1 : 0 });
    }
    if (patch.max_tokens !== undefined) {
      data.push({ field: 'max_tokens', value: patch.max_tokens });
    }

    output.affected_rows = await this.relationDb.update(
      LLM_AVAILABLE_TABLE,
      data,
      conditions,
    );
    return true;
  }

  async soLLM(input: SoLLMInput, output: SoLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    const conditions: Condition[] = [];
    if (input.conditions) {
      conditions.push(...input.conditions);
    }
    if (input.keyword) {
      conditions.push({
        field: 'llm_title',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
      });
    }

    const rows = await this.relationDb.select(LLM_AVAILABLE_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      LLM_AVAILABLE_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );

    output.list = rows as unknown as LLMAvailableRecord[];
    output.total = total;
    return true;
  }

  private recordLLMCallMetrics(metrics?: Metrics, usage?: {
    llm_id?: string;
    attempt?: number;
    input_tokens: number;
    output_tokens: number;
    duration_ms: number;
    connect_ms?: number;
    ttft_ms?: number;
    stream_ms?: number;
  }): void {
    if (!metrics || !usage) {
      return;
    }
    try {
      metrics.recordLLMUsage({
        llm_id: usage.llm_id,
        attempt: usage.attempt,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        duration_ms: usage.duration_ms,
        connect_ms: usage.connect_ms,
        ttft_ms: usage.ttft_ms,
        stream_ms: usage.stream_ms,
      });
      metrics.info(`LLM call: ${usage.input_tokens} in / ${usage.output_tokens} out tokens in ${usage.duration_ms}ms (connect=${usage.connect_ms ?? 0}ms ttft=${usage.ttft_ms ?? 0}ms stream=${usage.stream_ms ?? 0}ms)`, {
        log_source: 'LLM',
        llm_id: usage.llm_id,
        attempt: usage.attempt,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        duration_ms: usage.duration_ms,
        connect_ms: usage.connect_ms ?? 0,
        ttft_ms: usage.ttft_ms ?? 0,
        stream_ms: usage.stream_ms ?? 0,
      });
    } catch {

    }
  }

  private reportLlmInvoked(report: Report | undefined, payload: {
    caller?: string; llm_id: string; attempt?: number; status: 'ok' | 'error';
    input_tokens?: number; output_tokens?: number; duration_ms?: number;
    connect_ms?: number; ttft_ms?: number; stream_ms?: number;
    thinking_ms?: number; response_ms?: number; output?: string; error?: string;
  }): void {
    if (!report) return;
    report.emit(BusinessEvent.LlmInvoked, {
      caller: payload.caller ?? '',
      llm_id: payload.llm_id,
      attempt: payload.attempt ?? 1,
      status: payload.status,
      input_tokens: payload.input_tokens ?? 0,
      output_tokens: payload.output_tokens ?? 0,
      duration_ms: payload.duration_ms ?? 0,
      connect_ms: payload.connect_ms ?? 0,
      ttft_ms: payload.ttft_ms ?? 0,
      stream_ms: payload.stream_ms ?? 0,
      thinking_ms: payload.thinking_ms ?? 0,
      response_ms: payload.response_ms ?? 0,
      output: payload.output,
      error: payload.error,
    });
  }

  async execLLM(input: ExecLLMInput, output: ExecLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    this.applyDims(input, context);
    const prompt = String(input.prompt ?? '');
    if (!prompt) {
      throw new ValidationError('prompt 不能为空');
    }

    const candidateIds = await this.resolveCandidateModels(input.id, metrics);
    if (candidateIds.length === 0) {
      if (input.id) {
        throw new NotFoundError('LLM', input.id);
      }
      throw new ValidationError('id 不能为空，且无可用模型');
    }

    const startTime = Date.now();
    let lastError = '';
    let lastErrorCode = '';

    const maxAttempts = input.no_fallback ? 1 : candidateIds.length;

    for (let i = 0; i < maxAttempts; i++) {
      const currentId = candidateIds[i];
      const singleOutput = new ExecLLMOutput();
      const ok = await this.executeSingleLLM(currentId, input, startTime, singleOutput, metrics);
      if (ok) {
        Object.assign(output, singleOutput);

        this.recordLLMCallMetrics(metrics, {
          llm_id: currentId,
          attempt: i + 1,
          input_tokens: Number(output.input_tokens ?? 0) || 0,
          output_tokens: Number(output.output_tokens ?? 0) || 0,
          duration_ms: Number(output.duration_ms ?? 0) || (Date.now() - startTime),
          connect_ms: output.connect_ms,
          ttft_ms: output.ttft_ms,
          stream_ms: output.stream_ms,
        });
        this.reportLlmInvoked(report, {
          caller: input.caller, llm_id: currentId, attempt: i + 1, status: 'ok',
          input_tokens: output.input_tokens, output_tokens: output.output_tokens,
          duration_ms: output.duration_ms, connect_ms: output.connect_ms,
          ttft_ms: output.ttft_ms, stream_ms: output.stream_ms,
          thinking_ms: output.thinking_ms, response_ms: output.response_ms,
          output: output.result.slice(0, LLM_INVOKED_OUTPUT_MAX_CHARS),
        });
        if (i > 0) {
          this.logger?.debug(
            `LLM failover: 模型 ${candidateIds[0]} 调用失败，自动降级至候选模型 ${currentId} 成功 (尝试第 ${i + 1} 个)`,
            {
              original_id: candidateIds[0],
              fallback_id: currentId,
              attempt_index: i + 1,
            },
          );
        }
        return true;
      }

      lastError = singleOutput.error || 'Unknown error';
      lastErrorCode = singleOutput.error_code || 'EXEC_FAILED';
      this.logger?.debug(
        `LLM candidate ${currentId} (${i + 1}/${candidateIds.length}) failed: ${lastError}`,
        {
          model_id: currentId,
          error: lastError,
        },
      );
    }

    if (candidateIds.length === 1 && (lastErrorCode === 'NOT_FOUND' || lastErrorCode === 'VALIDATION_ERROR')) {
      if (lastErrorCode === 'NOT_FOUND') {
        throw new NotFoundError('LLM', candidateIds[0]);
      }
      throw new ValidationError(lastError);
    }

    if (input.no_fallback) {
      output.error = lastError || '模型调用失败';
      output.error_code = lastErrorCode || 'EXEC_FAILED';
      output.duration_ms = Date.now() - startTime;
      return false;
    }

    output.error = `所有可用模型均调用失败 (尝试了 ${maxAttempts} 个模型): ${lastError}`;
    output.error_code = lastErrorCode || 'ALL_MODELS_FAILED';
    output.duration_ms = Date.now() - startTime;
    this.reportLlmInvoked(report, {
      caller: input.caller, llm_id: candidateIds[0] ?? '', status: 'error',
      duration_ms: output.duration_ms, error: lastError,
    });
    return false;
  }

  async execLLMEvents(input: ExecLLMEventsInput, output: ExecLLMEventsOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    this.applyDims(input, context);
    this.validateEventsInput(input);
    const candidateIds = await this.resolveCandidateModels(input.id, metrics);
    if (candidateIds.length === 0) {
      throw new ValidationError('id 不能为空，且无可用模型');
    }
    const startTime = Date.now();
    const maxAttempts = input.no_fallback ? 1 : candidateIds.length;
    let lastError = '';
    let lastErrorCode = '';
    for (let i = 0; i < maxAttempts; i++) {
      const single = await this.executeEventsSingle(candidateIds[i], input, input.signal, metrics);
      if (single.ok) {
        this.fillEventsOutput(output, single, startTime, input);

        this.recordLLMCallMetrics(metrics, {
          llm_id: candidateIds[i],
          attempt: i + 1,
          input_tokens: Number(output.input_tokens ?? 0) || 0,
          output_tokens: Number(output.output_tokens ?? 0) || 0,
          duration_ms: Number(output.duration_ms ?? 0) || (Date.now() - startTime),
          connect_ms: output.connect_ms,
          ttft_ms: output.ttft_ms,
          stream_ms: output.stream_ms,
        });
        this.reportLlmInvoked(report, {
          caller: input.caller, llm_id: candidateIds[i], attempt: i + 1, status: 'ok',
          input_tokens: output.input_tokens, output_tokens: output.output_tokens,
          duration_ms: output.duration_ms, connect_ms: output.connect_ms,
          ttft_ms: output.ttft_ms, stream_ms: output.stream_ms,
          thinking_ms: output.thinking_ms, response_ms: output.response_ms,
          output: output.result.slice(0, LLM_INVOKED_OUTPUT_MAX_CHARS),
        });
        return true;
      }
      lastError = single.error || 'Unknown error';
      lastErrorCode = single.error_code || 'EXEC_FAILED';
      if (single.aborted_reason) {
        throw new AbortedError(single.aborted_reason, lastError);
      }

      if (single.emitted_events) {
        this.logger?.debug(`LLMEvents candidate ${candidateIds[i]} 已产出流事件，禁止降级`);
        break;
      }
      this.logger?.debug(`LLMEvents candidate ${candidateIds[i]} (${i + 1}/${maxAttempts}) failed: ${lastError}`);
    }
    output.error = `所有可用模型均调用失败 (尝试了 ${maxAttempts} 个模型): ${lastError}`;
    output.error_code = lastErrorCode || 'ALL_MODELS_FAILED';
    output.duration_ms = Date.now() - startTime;
    this.reportLlmInvoked(report, {
      caller: input.caller, llm_id: candidateIds[0] ?? '', status: 'error',
      duration_ms: output.duration_ms, error: lastError,
    });
    return false;
  }

  private validateEventsInput(input: ExecLLMEventsInput): void {
    const hasMessages = Array.isArray(input.messages) && input.messages.length > 0;
    const hasPrompt = typeof input.prompt === 'string' && input.prompt.length > 0;
    if (!hasMessages && !hasPrompt) {
      throw new ValidationError('messages 与 prompt 至少提供一个');
    }
    if (input.tool_choice && input.tool_choice !== 'none' && !(input.tools?.length)) {
      throw new ValidationError('tool_choice 需与 tools 同时提供');
    }
  }

  private async executeEventsSingle(
    llmId: string,
    input: ExecLLMEventsInput,
    signal?: AbortSignal,
    metrics?: Metrics,
  ): Promise<EventsSingleResult> {
    let emitted = false;
    const startedAt = Date.now();

    const onEvent = input.on_event
      ? (event: Parameters<NonNullable<ExecLLMEventsInput['on_event']>>[0]) => {
          emitted = true;
          input.on_event!(event);
        }
      : undefined;
    try {
      const result = await this.runEventsStream(llmId, input, signal, metrics, onEvent);
      const callId = await this.recordEventsCallSuccess(llmId, input, result, startedAt);
      const success = this.toEventsSuccess(result, emitted);
      success.call_id = callId;
      return success;
    } catch (err) {
      return await this.toEventsFailure(llmId, input, err, startedAt, emitted);
    }
  }

  private async runEventsStream(
    llmId: string,
    input: ExecLLMEventsInput,
    signal: AbortSignal | undefined,
    metrics: Metrics | undefined,
    onEvent?: (event: Parameters<NonNullable<ExecLLMEventsInput['on_event']>>[0]) => void,
  ): Promise<LLMEventsRunResult> {
    const request = await this.buildEventsRequestWithSpan(llmId, input, metrics);
    const runner = new LLMEventsRunner({
      request,
      signal,
      idle_watchdog_ms: input.idle_watchdog_ms ?? DEFAULT_IDLE_WATCHDOG_MS,
      on_event: onEvent,
      logger: this.logger,
    });
    const streamSpan = metrics?.beginSpan('Base.LLMProvider.LLMService.streamChat');
    try {
      return await runner.run();
    } finally {
      if (metrics && streamSpan) metrics.endSpan(streamSpan);
    }
  }

  /** events 调用的输入原文:prompt 优先,否则序列化 messages/system */
  private eventsInputPrompt(input: ExecLLMEventsInput): string {
    if (input.prompt) return String(input.prompt);
    if (Array.isArray(input.messages) && input.messages.length > 0) {
      return input.messages.map((m) => `[${(m as { role?: string }).role ?? 'user'}]\n${String((m as { content?: string }).content ?? '')}`).join('\n\n');
    }
    return String(input.system ?? '');
  }

  private async recordEventsCallSuccess(
    llmId: string,
    input: ExecLLMEventsInput,
    result: LLMEventsRunResult,
    startedAt: number,
  ): Promise<string> {
    await this.upsertUsage(llmId, result.input_tokens, result.output_tokens);
    const callId = await this.logCall({
      llmId,
      session_id: input.session_id,
      run_id: input.run_id,
      work_id: input.work_id,
      caller: input.caller,
      status: 'ok',
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      duration_ms: Date.now() - startedAt,
      input_prompt: this.eventsInputPrompt(input),
      output_content: result.text,
    });
    return callId;
  }

  private toEventsSuccess(result: LLMEventsRunResult, emitted: boolean): EventsSingleResult {
    return {
      ok: true,
      text: result.text,
      reasoning: result.reasoning,
      finish_reason: result.finish_reason,
      tool_calls: result.tool_calls,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      emitted_events: emitted || result.emitted_events,
      connect_ms: result.connect_ms,
      ttft_ms: result.ttft_ms,
      stream_ms: result.stream_ms,
      first_text_ms: result.first_text_ms,
      thinking_ms: result.thinking_ms,
      response_ms: result.response_ms,
    };
  }

  private async toEventsFailure(
    llmId: string,
    input: ExecLLMEventsInput,
    err: unknown,
    startedAt: number,
    emitted: boolean,
  ): Promise<EventsSingleResult> {
    const errorCode = err instanceof AbortedError ? err.error_code
      : (err instanceof ProviderError ? err.error_code : 'CONNECT_ERROR');
    await this.logCall({
      llmId, session_id: input.session_id, run_id: input.run_id, work_id: input.work_id, caller: input.caller,
      duration_ms: Date.now() - startedAt, status: 'error', error_code: errorCode,
      input_prompt: this.eventsInputPrompt(input),
    });
    if (err instanceof AbortedError) {
      return { ok: false, error: err.message, error_code: err.error_code, aborted_reason: err.reason, emitted_events: emitted };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      error_code: errorCode,
      emitted_events: emitted,
    };
  }

  private async buildEventsRequestWithSpan(
    llmId: string,
    input: ExecLLMEventsInput,
    metrics?: Metrics,
  ): Promise<{ url: string; method: string; headers: Record<string, string>; body?: string }> {
    const span = metrics?.beginSpan('Base.LLMProvider.LLMService.buildEventsRequest');
    try {
      return await this.buildEventsRequest(llmId, input);
    } finally {
      if (metrics && span) metrics.endSpan(span);
    }
  }

  private async buildEventsRequest(
    llmId: string,
    input: ExecLLMEventsInput,
  ): Promise<{ url: string; method: string; headers: Record<string, string>; body?: string }> {
    const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llmId },
    ]);
    const llm = llmRow as unknown as LLMAvailableRecord | null;
    if (!llm) {
      throw new NotFoundError('LLM', llmId);
    }
    if (!llm.enable || (llm.llm_type ?? 'text') === 'embedding') {
      throw new ValidationError(`LLM ${llmId} 已禁用或是 ${llm.llm_type ?? '未知'} 模型`);
    }
    const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llm.llm_provider_id },
    ]);
    const provider = providerRow as unknown as LLMProviderRecord | null;
    if (!provider) {
      throw new NotFoundError('LLMProvider', llm.llm_provider_id);
    }
    if (!provider.enable) {
      throw new ValidationError(`LLMProvider ${provider.id} 已禁用`);
    }
    const strategy = LLMStrategyFactory.soStrategyById(provider);
    return strategy.buildChatEventsRequest(provider, llm, input);
  }

  private fillEventsOutput(
    output: ExecLLMEventsOutput,
    single: EventsSingleResult,
    startTime: number,
    input?: ExecLLMEventsInput,
  ): void {
    output.result = single.text ?? '';
    output.reasoning = single.reasoning ?? '';
    output.finish_reason = single.finish_reason ?? 'stop';
    output.tool_calls = single.tool_calls ?? [];
    output.call_id = single.call_id ?? '';
    output.input_tokens = single.input_tokens ?? 0;
    output.output_tokens = single.output_tokens ?? 0;
    output.duration_ms = Date.now() - startTime;
    output.connect_ms = single.connect_ms ?? 0;
    output.ttft_ms = single.ttft_ms ?? 0;
    output.stream_ms = single.stream_ms ?? 0;
    output.thinking_ms = single.thinking_ms ?? 0;
    output.response_ms = single.response_ms ?? 0;
    output.wire_messages = input ? this.prepareWireMessages(input) : [];
  }

  private prepareWireMessages(input: ExecLLMEventsInput): LLMMessage[] {
    const messages: LLMMessage[] = input.messages?.length ? [...input.messages] : [];
    if (input.system) {
      if (messages[0]?.role === 'system') {
        messages[0] = { role: 'system', content: input.system };
      } else {
        messages.unshift({ role: 'system', content: input.system });
      }
    }
    if (!messages.length) {
      messages.push({ role: 'user', content: String(input.prompt ?? '') });
    }
    return messages;
  }

  private async resolveCandidateModels(specifiedId?: string, metrics?: Metrics): Promise<string[]> {
    const candidates: string[] = [];
    const added = new Set<string>();

    const addCandidate = (id?: string) => {
      if (id && !added.has(id)) {
        candidates.push(id);
        added.add(id);
      }
    };

    if (specifiedId) {
      addCandidate(specifiedId);
    }

    try {
      const defaultRows = await this.relationDb.select(LLM_AVAILABLE_TABLE, {
        conditions: [
          { field: 'is_default', operator: Operator.EQ, value: 1 },
          { field: 'enable', operator: Operator.EQ, value: 1 },
          { field: 'llm_type', operator: Operator.NE, value: 'embedding' },
        ],
      });
      for (const row of defaultRows) {
        addCandidate((row as unknown as LLMAvailableRecord).id);
      }
    } catch (err) {

      metrics?.warn('LLMService.resolveCandidateModels 读取默认模型失败，跳过默认候选', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const allEnabledRows = await this.relationDb.select(LLM_AVAILABLE_TABLE, {
        conditions: [
          { field: 'enable', operator: Operator.EQ, value: 1 },
          { field: 'llm_type', operator: Operator.NE, value: 'embedding' },
        ],
      });
      for (const row of allEnabledRows) {
        addCandidate((row as unknown as LLMAvailableRecord).id);
      }
    } catch (err) {

      metrics?.warn('LLMService.resolveCandidateModels 读取启用模型列表失败，跳过该批候选', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return candidates;
  }

  private async executeSingleLLM(
    llmId: string,
    input: ExecLLMInput,
    startTime: number,
    output: ExecLLMOutput,
    metrics?: Metrics,
  ): Promise<boolean> {
    const llm = await this.soValidatedLLM(llmId, output);
    if (!llm) return false;
    const provider = await this.soValidatedLLMProvider(llm, output);
    if (!provider) return false;
    const strategy = LLMStrategyFactory.soStrategyById(provider);
    const req = strategy.buildChatRequest(provider, llm, input);
    const ok = (input.stream && typeof input.onDelta === 'function')
      ? await this.executeSingleLLMStreaming(llmId, input, startTime, output, metrics)
      : await this.executeSingleLLMRequest(llmId, strategy, req, input, startTime, output, metrics);
    if (!ok) return false;
    await this.recordChatSuccess(llmId, input, output);
    return true;
  }

  private async soValidatedLLM(llmId: string, output: ExecLLMOutput): Promise<LLMAvailableRecord | null> {
    const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llmId },
    ]);
    if (!llmRow) {
      output.error = `LLM ${llmId} 不存在`;
      output.error_code = 'NOT_FOUND';
      return null;
    }
    const llm = llmRow as unknown as LLMAvailableRecord;
    if (!llm.enable) {
      output.error = `LLM ${llmId} 已禁用`;
      output.error_code = 'VALIDATION_ERROR';
      return null;
    }
    if ((llm.llm_type ?? 'text') === 'embedding') {
      output.error = `LLM ${llmId} 是 ${llm.llm_type ?? '未知'} 模型，无法用于文本生成`;
      output.error_code = 'VALIDATION_ERROR';
      return null;
    }
    return llm;
  }

  private async soValidatedLLMProvider(llm: LLMAvailableRecord, output: ExecLLMOutput): Promise<LLMProviderRecord | null> {
    const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llm.llm_provider_id },
    ]);
    if (!providerRow) {
      output.error = `LLMProvider ${llm.llm_provider_id} 不存在`;
      output.error_code = 'NOT_FOUND';
      return null;
    }
    const provider = providerRow as unknown as LLMProviderRecord;
    if (!provider.enable) {
      output.error = `LLMProvider ${provider.id} 已禁用`;
      output.error_code = 'VALIDATION_ERROR';
      return null;
    }
    return provider;
  }

  private async executeSingleLLMStreaming(
    llmId: string,
    input: ExecLLMInput,
    startTime: number,
    output: ExecLLMOutput,
    metrics?: Metrics,
  ): Promise<boolean> {
    const single = await this.executeEventsSingle(llmId, this.soSingleEventsInput(llmId, input), undefined, metrics);
    if (!single.ok) {
      output.error = single.error || 'LLM 流式调用失败';
      output.error_code = single.error_code || 'EXEC_FAILED';
      output.duration_ms = Date.now() - startTime;
      return false;
    }
    output.raw_response = single.text ?? '';
    output.result = single.text ?? '';
    output.input_prompt = String(input.prompt ?? '');
    output.input_tokens = single.input_tokens ?? 0;
    output.output_tokens = single.output_tokens ?? 0;
    output.duration_ms = Date.now() - startTime;
    output.connect_ms = single.connect_ms ?? 0;
    output.ttft_ms = single.ttft_ms ?? 0;
    output.stream_ms = single.stream_ms ?? 0;
    output.thinking_ms = single.thinking_ms ?? 0;
    output.response_ms = single.response_ms ?? 0;
    return true;
  }

  private soSingleEventsInput(llmId: string, input: ExecLLMInput): ExecLLMEventsInput {
    return Object.assign(new ExecLLMEventsInput(), {
      id: llmId,
      prompt: input.prompt,
      system: input.system,
      temperature: input.temperature,
      max_tokens: input.max_tokens,
      no_fallback: true,
      extra: input.extra,
      session_id: input.session_id,
      run_id: input.run_id,
      work_id: input.work_id,
      on_event: (ev: Parameters<NonNullable<ExecLLMEventsInput['on_event']>>[0]) => {
        if (ev.type === 'text_delta' && ev.delta) {
          input.onDelta!(ev.delta);
        }
      },
    });
  }

  private async executeSingleLLMRequest(
    llmId: string,
    strategy: ILLMProviderStrategy,
    req: HttpRequestOptions,
    input: ExecLLMInput,
    startTime: number,
    output: ExecLLMOutput,
    metrics?: Metrics,
  ): Promise<boolean> {
    const httpSpan = metrics?.beginSpan('Base.LLMProvider.LLMService.chatHttpRequest');
    const httpStartedAt = Date.now();
    try {
      const res = await this.execChatHttpRequest(req);
      output.connect_ms = Date.now() - httpStartedAt;
      if (!res.ok) {
        output.error = `LLM 调用失败: HTTP ${res.status} ${res.bodyText}`;
        output.error_code = 'REMOTE_ERROR';
        output.duration_ms = Date.now() - startTime;
        await this.logChatError(llmId, input, output);
        return false;
      }
      this.fillChatResponse(res.bodyText, strategy, String(input.prompt ?? ''), startTime, output);
      // 非流式调用：全量响应一次性到达，TTFT 即 HTTP 往返，response_ms 为解析耗时（否则恒为 0 造成假象）
      output.ttft_ms = output.connect_ms;
      output.response_ms = Math.max(0, output.duration_ms - output.connect_ms);
    } catch (err) {
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
      output.duration_ms = Date.now() - startTime;
      await this.logChatError(llmId, input, output);
      return false;
    } finally {
      if (metrics && httpSpan) metrics.endSpan(httpSpan);
    }
    return true;
  }

  private async execChatHttpRequest(req: HttpRequestOptions) {
    const httpInput = Object.assign(new ExecRequestInput(), {
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: req.body,
      timeout_ms: this.execTimeoutMs,
    });
    const httpOutput = new ExecRequestOutput();
    await this.http.execRequest(httpInput, httpOutput, new HttpContext());
    return httpOutput.response;
  }

  private fillChatResponse(
    rawText: string,
    strategy: ILLMProviderStrategy,
    prompt: string,
    startTime: number,
    output: ExecLLMOutput,
  ): void {
    output.raw_response = rawText;
    let json: unknown = {};
    try {
      json = JSON.parse(rawText);
    } catch {
      json = {};
    }
    const parsed = strategy.parseChatResponse(json, rawText);
    output.result = parsed.content;
    output.input_prompt = prompt;
    output.input_tokens = parsed.inputTokens;
    output.output_tokens = parsed.outputTokens;
    output.duration_ms = Date.now() - startTime;
  }

  private async logChatError(llmId: string, input: ExecLLMInput, output: ExecLLMOutput): Promise<void> {
    await this.logCall({
      llmId, session_id: input.session_id, run_id: input.run_id, work_id: input.work_id, caller: input.caller,
      duration_ms: output.duration_ms, status: 'error', error_code: output.error_code,
      input_prompt: String(input.prompt ?? ''),
      output_content: String(output.error ?? ''),
    });
  }

  private async recordChatSuccess(llmId: string, input: ExecLLMInput, output: ExecLLMOutput): Promise<void> {

    await this.upsertUsage(llmId, output.input_tokens, output.output_tokens);
    await this.logCall({
      llmId,
      session_id: input.session_id,
      run_id: input.run_id,
      work_id: input.work_id,
      caller: input.caller,
      status: 'ok',
      input_tokens: output.input_tokens,
      output_tokens: output.output_tokens,
      duration_ms: output.duration_ms,
      input_prompt: String(input.prompt ?? ''),
      output_content: output.result,
    });
  }

  async embedLLM(input: EmbedLLMInput, output: EmbedLLMOutput, context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    this.applyDims(input, context);
    await this.resolveEmbedInputId(input);
    const text = String(input.input ?? '');
    if (!text) {
      throw new ValidationError('input 不能为空');
    }

    const startTime = Date.now();

    const llm = await this.soEmbeddingLLM(input.id);
    const provider = await this.soEnabledEmbedProvider(llm.llm_provider_id);
    const strategy = LLMStrategyFactory.soStrategyById(provider);
    const req = strategy.buildEmbedRequest(provider, llm, input);

    try {
      const res = await this.execEmbedHttpRequest(req);
      if (!res.ok) {
        return await this.failEmbedCall(input, output, startTime, 'REMOTE_ERROR', `向量化调用失败: HTTP ${res.status} ${res.bodyText}`);
      }
      this.fillEmbedResponse(res.bodyText, strategy, startTime, output);
    } catch (err) {
      return await this.failEmbedCall(input, output, startTime, 'CONNECT_ERROR', err instanceof Error ? err.message : String(err));
    }

    await this.recordEmbedSuccess(input, output);
    return true;
  }

  private async resolveEmbedInputId(input: EmbedLLMInput): Promise<void> {
    if (input.id) {
      return;
    }
    const defaultEmbedding = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
      { field: 'llm_type', operator: Operator.EQ, value: 'embedding' },
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ]);
    if (!defaultEmbedding) {
      throw new ValidationError('id 不能为空，且无可用默认 embedding 模型');
    }
    input.id = (defaultEmbedding as unknown as LLMAvailableRecord).id;
  }

  private async soEmbeddingLLM(llmId: string): Promise<LLMAvailableRecord> {
    const llm = await this.soExistingLLM(llmId);
    if (!llm.enable) {
      throw new ValidationError(`LLM ${llmId} 已禁用`);
    }
    if (llm.llm_type !== 'embedding') {
      throw new ValidationError(`LLM ${llmId} 类型为 ${llm.llm_type}，不支持向量化调用`);
    }
    return llm;
  }

  private async soExistingLLM(llmId: string): Promise<LLMAvailableRecord> {
    const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llmId },
    ]);
    if (!llmRow) {
      throw new NotFoundError('LLM', llmId);
    }
    return llmRow as unknown as LLMAvailableRecord;
  }

  private async soEnabledEmbedProvider(llmProviderId: string): Promise<LLMProviderRecord> {
    const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llmProviderId },
    ]);
    if (!providerRow) {
      throw new NotFoundError('LLMProvider', llmProviderId);
    }
    const provider = providerRow as unknown as LLMProviderRecord;
    if (!provider.enable) {
      throw new ValidationError(`LLMProvider ${provider.id} 已禁用`);
    }
    return provider;
  }

  private async execEmbedHttpRequest(req: HttpRequestOptions) {
    const httpInput = Object.assign(new ExecRequestInput(), {
      url: req.url,
      method: req.headers ? req.method : req.method,
      headers: req.headers,
      body: req.body,

      timeout_ms: this.embedTimeoutMs,
    });
    const httpOutput = new ExecRequestOutput();
    await this.http.execRequest(httpInput, httpOutput, new HttpContext());
    return httpOutput.response;
  }

  private async failEmbedCall(
    input: EmbedLLMInput,
    output: EmbedLLMOutput,
    startTime: number,
    errorCode: string,
    error: string,
  ): Promise<boolean> {
    output.error = error;
    output.error_code = errorCode;
    output.duration_ms = Date.now() - startTime;
    await this.logCall({
      llmId: input.id, session_id: input.session_id, run_id: input.run_id, work_id: input.work_id, caller: input.caller,
      duration_ms: output.duration_ms, status: 'error', error_code: output.error_code,
      input_prompt: String(input.input ?? ''),
    });
    return false;
  }

  private fillEmbedResponse(
    rawText: string,
    strategy: ILLMProviderStrategy,
    startTime: number,
    output: EmbedLLMOutput,
  ): void {
    output.raw_response = rawText;
    let json: unknown = {};
    try {
      json = JSON.parse(rawText);
    } catch {
      json = {};
    }
    const parsed = strategy.parseEmbedResponse(json, rawText);
    output.embedding = parsed.embedding;
    output.input_tokens = parsed.inputTokens;
    output.duration_ms = Date.now() - startTime;
  }

  private async recordEmbedSuccess(input: EmbedLLMInput, output: EmbedLLMOutput): Promise<void> {
    await this.upsertUsage(input.id, output.input_tokens, 0);
    await this.logCall({
      llmId: input.id,
      session_id: input.session_id,
      run_id: input.run_id,
      work_id: input.work_id,
      input_tokens: output.input_tokens,
      output_tokens: 0,
      duration_ms: output.duration_ms,
      input_prompt: String(input.input ?? ''),
    });
  }

  async genLLMAttr(input: GenLLMAttrInput, output: GenLLMAttrOutput, _context: LLMContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const llm = await this.soExistingLLM(input.id);
    const providerTitle = await this.soGenAttrProviderTitle(llm.llm_provider_id, input.id, metrics);
    const prompt = await this.soGenAttrPrompt(llm, providerTitle);
    if (!prompt) {
      throw new ValidationError('模型属性生成 Prompt 不可用');
    }

    const execInput = Object.assign(new ExecLLMInput(), { id: '', prompt, caller: 'LLMService.genLLMAttr' });
    const execOutput = new ExecLLMOutput();
    const ok = await this.execLLM(execInput, execOutput, new LLMContext());
    if (!ok || !execOutput.result) {
      output.error = execOutput.error || '大模型生成模型属性失败';
      output.error_code = execOutput.error_code || 'GEN_ATTR_FAILED';
      return false;
    }

    let brief = '';
    let usage = '';
    try {
      const attrs = this.parseGenAttrAttrs(execOutput.result);
      brief = attrs.brief;
      usage = attrs.usage;
    } catch {
      output.error = '解析大模型返回的模型属性失败';
      output.error_code = 'PARSE_ERROR';
      return false;
    }

    return this.saveGenAttrResult(input, brief, usage, output);
  }

  private async soGenAttrProviderTitle(providerId: string, llmId: string, metrics?: Metrics): Promise<string> {
    try {
      const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
        { field: 'id', operator: Operator.EQ, value: providerId },
      ]);
      return (providerRow as unknown as LLMProviderRecord | null)?.llm_provider_title ?? '';
    } catch (err) {
      metrics?.warn('LLMService.genLLMAttr 读取提供商名称失败，使用空值继续生成属性', {
        error: err instanceof Error ? err.message : String(err),
        llm_id: llmId,
      });
      return '';
    }
  }

  private async soGenAttrPrompt(llm: LLMAvailableRecord, providerTitle: string): Promise<string> {
    if (!this.promptsAccess) {
      return '';
    }
    const soPromptOut = new SoPromptOutput();
    await this.promptsAccess.soPrompt(
      Object.assign(new SoPromptInput(), { keyword: '模型属性生成' }),
      soPromptOut,
      new PromptContext(),
    );
    const templateId = soPromptOut.list?.find((p) => p.enable !== false)?.id;
    if (!templateId) {
      return '';
    }
    const execPromptInput = Object.assign(new ExecPromptInput(), {
      id: templateId,
      variables: {
        model_name: llm.llm_title,
        llm_type: llm.llm_type || 'text',
        provider_title: providerTitle,
      },
    });
    const execPromptOutput = new ExecPromptOutput();
    await this.promptsAccess.execPrompt(
      execPromptInput,
      execPromptOutput, new PromptContext(),
    );
    return execPromptOutput.prompt || '';
  }

  private parseGenAttrAttrs(result: string): { brief: string; usage: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(result);
    } catch {
      const cleaned = result
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    }
    const obj = parsed as Record<string, unknown>;
    return {
      brief: typeof obj.llm_brief === 'string' ? obj.llm_brief.trim() : '',
      usage: typeof obj.model_usage === 'string' ? obj.model_usage.trim() : '',
    };
  }

  private async saveGenAttrResult(
    input: GenLLMAttrInput,
    brief: string,
    usage: string,
    output: GenLLMAttrOutput,
  ): Promise<boolean> {
    if (!brief && !usage) {
      output.error = '大模型未返回有效的模型属性';
      output.error_code = 'EMPTY_RESULT';
      return false;
    }
    await this.relationDb.update(
      LLM_AVAILABLE_TABLE,
      [
        { field: 'llm_brief', value: brief },
        { field: 'model_usage', value: usage },
        { field: 'updated', value: IdGenerator.now() },
      ],
      [{ field: 'id', operator: Operator.EQ, value: input.id }],
    );
    output.llm_brief = brief;
    output.model_usage = usage;
    return true;
  }

  async visualizedLLM(input: VisualizedLLMInput, output: VisualizedLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const scope = String(input.scope);

    if (scope === 'health') {
      const start = Date.now();
      this.relationDb.queryRaw('SELECT 1');
      output.data = {
        connected: true,
        response_time_ms: Date.now() - start,
        enabled: this.enabled,
        provider_count: await this.relationDb.count(LLM_PROVIDER_TABLE),
        enabled_llm_count: await this.relationDb.count(LLM_AVAILABLE_TABLE, [
          { field: 'enable', operator: Operator.EQ, value: 1 },
        ]),
      };
    } else if (scope === 'volume') {
      output.data = {
        provider_count: await this.relationDb.count(LLM_PROVIDER_TABLE),
        model_count: await this.relationDb.count(LLM_CACHE_TABLE),
        enabled_llm_count: await this.relationDb.count(LLM_AVAILABLE_TABLE),
        usage_record_count: await this.relationDb.count(LLM_USAGE_ORG_TABLE),
      };
    } else if (scope === 'diskUsage') {
      const pageSizes = this.relationDb.queryRaw<{ page_size: number }>(
        'PRAGMA page_size',
      );
      const pageCounts = this.relationDb.queryRaw<{ page_count: number }>(
        'PRAGMA page_count',
      );
      const pageSize =
        pageSizes.length > 0 ? Number(pageSizes[0].page_size) : 0;
      const pageCount =
        pageCounts.length > 0 ? Number(pageCounts[0].page_count) : 0;
      output.data = {
        disk_usage_bytes: pageSize * pageCount,
        page_size: pageSize,
        page_count: pageCount,
      };
    } else {
      output.error = `未知的可视化范围: ${scope}`;
      output.error_code = 'INVALID_SCOPE';
      return false;
    }
    return true;
  }

  async enableLLM(input: EnableLLMInput, _output: EnableLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (this.closed) {
      throw new DatabaseError(
        'LLM 组件已关闭（closeLLM 为终态操作），需重新初始化组件',
      );
    }
    this.enabled = input.enable;
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      'LLM 组件是否启用（enableLLM 读写）',
    );
    return true;
  }
}

