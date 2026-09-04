/**
 * @fileoverview LLMProvider 应用服务层。
 *
 * 依赖 RelationDBAccess（通过 IConfigStorage / executeRaw / queryRaw）操作关系数据库，
 * 依赖 ConfigService 管理 llm_config 配置表。
 *
 * 实现所有用例：addLLMProvider / updateLLMProvider / delLLMProvider / soLLMProvider /
 * testLLMProvider / listLLM / addLLM / delLLM / updateLLM / soLLM / execLLM /
 * visualizedLLM / enableLLM。
 *
 * LLMProvider 是 LLM 的唯一操作入口，上层不可直接调用 LLM 提供商 API。
 * 对外 API 调用采用 OpenAI 兼容协议（/v1/models、/v1/chat/completions），
 * 通过 HttpAccess 统一发起 HTTP 请求（代理/超时由 ToolProvider 集中处理）。
 */

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { Logger } from '../../shared/aop/AopProxy';
import type { PromptsAccess } from '../../PromptsProvider/access/PromptsAccess';
import { PromptContext, ExecPromptInput, ExecPromptOutput } from '../../PromptsProvider/domain/types';
import { PROMPT_IDS, getBuiltinTemplate, renderTemplate } from '../../PromptCatalog/catalog';
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
import { LLMEventsRunner, DEFAULT_IDLE_WATCHDOG_MS } from './llmevents/LLMEventsRunner';
import { LLMContext, LLMProviderRecord, LLMCacheRecord, LLMAvailableRecord, AddLLMProviderInput, AddLLMProviderOutput, UpdateLLMProviderInput, UpdateLLMProviderOutput, DelLLMProviderInput, DelLLMProviderOutput, SoLLMProviderInput, SoLLMProviderOutput, TestLLMProviderInput, TestLLMProviderOutput, ListLLMInput, ListLLMOutput, AddLLMInput, AddLLMOutput, DelLLMInput, DelLLMOutput, UpdateLLMInput, UpdateLLMOutput, SoLLMInput, SoLLMOutput, ExecLLMInput, ExecLLMOutput, ExecLLMEventsInput, ExecLLMEventsOutput, EmbedLLMInput, EmbedLLMOutput, GenLLMAttrInput, GenLLMAttrOutput, VisualizedLLMInput, VisualizedLLMOutput, EnableLLMInput, EnableLLMOutput, LLM_PROVIDER_TABLE, LLM_CACHE_TABLE, LLM_AVAILABLE_TABLE, LLM_USAGE_TABLE, LLM_CONFIG_TABLE } from '../domain/types';
import { LLMStrategyFactory } from './strategies';
import { newPatch, newRecord } from '../../shared/query';
import {
  isModelsCacheFresh,
  extractRemoteErrorDetail,
  toCacheInsertRecord,
  toCacheUpdatePatch,
} from '../domain/services/LLMCacheDomainService';

/** testLLMProvider 默认连接超时时间（毫秒） */
const TEST_TIMEOUT_MS = 10000;

/** 单次 execLLMEvents 尝试结果（模块内部） */
interface EventsSingleResult {
  ok: boolean;
  text?: string;
  reasoning?: string;
  finish_reason?: string;
  tool_calls?: Array<{ index: number; id: string; tool_id: string; arguments: string }>;
  input_tokens?: number;
  output_tokens?: number;
  error?: string;
  error_code?: string;
  aborted_reason?: AbortReasonKind;
  /** 本候选是否已向 on_event 产出过事件（修复②：已发事件则禁止降级） */
  emitted_events?: boolean;
}

/** listLLM 默认请求超时时间（毫秒） */
const LIST_TIMEOUT_MS = 30000;

/** 模型列表缓存有效期（毫秒），默认 1 小时 */

/** execLLM 默认请求超时时间（毫秒） */
const EXEC_TIMEOUT_MS = 120000;

/**
 * LLMProvider 应用服务。
 *
 * LLMProvider 是 LLM 的唯一操作入口，上层不可直接调用 LLM 提供商 API。
 * LLM 数据与配置项均存储于关系数据库（由 RelationDBProvider 管理）。
 */
export class LLMService {
  /** 运行时内存中的启用状态，供各操作快速校验 */
  private enabled = true;

  /** 是否已执行 closeLLM（终态标记） */
  private closed = false;

  private readonly config: ConfigService;
  private readonly http: HttpAccess;

  /**
   * @param relationDb RelationDBProvider 接入层
   * @param logger 可选日志记录器
   * @param promptsAccess 可选 PromptsProvider 接入层（genLLMAttr 依赖）
   */
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logger?: Logger,
    private readonly promptsAccess?: PromptsAccess,
  ) {
    this.config = new ConfigService(relationDb, LLM_CONFIG_TABLE);
    this.http = new HttpAccess(new ConfigService(relationDb, TOOL_CONFIG_TABLE));
  }

  // -------------------------------------------------------------------------
  // 初始化
  // -------------------------------------------------------------------------

  /**
   * 初始化组件：写入默认配置并恢复 enabled 状态。
   *
   * PRD 3.4.2 注：组件初始化时从 llm_config 读取 enabled 状态以恢复上次的可用状态。
   */
  async initialize(): Promise<void> {
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  /**
   * 校验组件是否启用，未启用时抛出 ComponentDisabledError。
   */
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

  // -------------------------------------------------------------------------
  // 工具方法
  // -------------------------------------------------------------------------

  /**
   * 构造 LLM 提供商 API 端点地址。
   *
   * 自动处理基址是否包含 /v1 后缀的情况：
   * - 基址为 `https://api.openai.com` + `v1/models` -> `https://api.openai.com/v1/models`
   * - 基址为 `https://api.openai.com/v1` + `v1/models` -> `https://api.openai.com/v1/models`
   *
   * @param baseUrl 提供商基址
   * @param apiPath API 路径（如 'v1/models'、'v1/chat/completions'）
   * @returns 完整端点地址
   */
  private buildEndpoint(baseUrl: string, apiPath: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${apiPath.replace(/^\/+/, '')}`;
  }

  /**
    * 更新 LLM 当日使用次数与 Token 用量（upsert 语义）。
    *
    * 若当天记录已存在则 usage_count + 1 且累计 input_tokens / output_tokens，
    * 否则新增一条记录。
    * 仅当 execLLM / embedLLM 调用成功时调用本方法。
    *
    * @param llmEnableId 启用的 LLM ID（llm_available.id）
    * @param inputTokens 本次调用输入 Token 数
    * @param outputTokens 本次调用输出 Token 数
    */
  private async upsertUsage(
    llmEnableId: string,
    inputTokens = 0,
    outputTokens = 0,
  ): Promise<void> {
    const today = IdGenerator.today();
    const existing = await this.relationDb.selectOne(LLM_USAGE_TABLE, [
      { field: 'llm_available_id', operator: Operator.EQ, value: llmEnableId },
      { field: 'usage_date', operator: Operator.EQ, value: today },
    ]);

    if (existing) {
      await this.relationDb.update(
        LLM_USAGE_TABLE,
        newPatch({
          usage_count: ((existing.usage_count as number) ?? 0) + 1,
          input_tokens: ((existing.input_tokens as number) ?? 0) + inputTokens,
          output_tokens: ((existing.output_tokens as number) ?? 0) + outputTokens,
        }),
        [
          { field: 'llm_available_id', operator: Operator.EQ, value: llmEnableId },
          { field: 'usage_date', operator: Operator.EQ, value: today },
        ],
      );
    } else {
      await this.relationDb.insert(
        LLM_USAGE_TABLE,
        newRecord({
          llm_available_id: llmEnableId,
          usage_date: today,
          usage_count: 1,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        }),
      );
    }
  }

  // -------------------------------------------------------------------------
  // LLM 提供商管理
  // -------------------------------------------------------------------------

  /**
   * 新增 LLM 提供商（addLLMProvider）。
   *
   * PRD 3.1.1 条：向系统中新增一个 LLM 提供商。
   */
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

    // 未显式指定配额时，从 llm_config 读取全局默认配额（0 = 不限制）
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

  /**
   * 更新 LLM 提供商（updateLLMProvider）。
   *
   * PRD 3.1.2 条：支持按 ID 或按条件更新。
   * 资源级启用/禁用通过本方法修改 enable 字段实现。
   */
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

  /**
   * 删除 LLM 提供商（delLLMProvider）。
   *
   * PRD 3.1.3 条：支持按 ID 批量删除或按条件删除。
   * 级联清理该提供商下关联的 LLM 模型记录（llm_model 表）。
   */
  async delLLMProvider(input: DelLLMProviderInput, output: DelLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    // 先确定待删除的 provider IDs（用于级联清理 llm_model）
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

    // 级联清理关联记录
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
        await this.relationDb.delete(LLM_USAGE_TABLE, [
          { field: 'llm_available_id', operator: Operator.IN, value: availableIds },
        ]);
      }
      await this.relationDb.delete(LLM_AVAILABLE_TABLE, [
        { field: 'llm_provider_id', operator: Operator.IN, value: providerIds },
      ]);
    }

    return true;
  }

  /**
   * 搜索 LLM 提供商（soLLMProvider）。
   *
   * PRD 3.1.4 条：支持关键词、条件过滤、排序、分页。
   * 关键词匹配 llm_provider_title。
   */
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

  /**
   * 测试 LLM 提供商连接（testLLMProvider）。
   *
   * PRD 3.1.5 条：向提供商地址发起网络连通性测试，返回连通状态和响应时间。
   * 使用 HTTP GET 请求，只要收到响应即视为连通（connected=true），
   * 网络错误或超时视为不可达（connected=false）。
   */
  // ===== 修改后的方法 =====
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
      // 只要收到 HTTP 响应即视为连通（即使状态码非 2xx）
      output.connected = true;
    } catch (err) {
      output.response_time_ms = Date.now() - start;
      output.connected = false;
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
    }
    return true;
  }

  // ===== 修改后的方法 =====
  /**
   * 获取 LLM 模型列表（listLLM）。
   *
   * PRD 3.1.6 条：从 LLM 提供商 API 获取可用的模型列表并缓存到本地。
   * 支持 OpenAI 兼容格式 (json.data) 与 Google / 统一格式 (json.models) 的动态解析。
   * 仅在请求成功时更新缓存时间戳。
   */
  async listLLM(input: ListLLMInput, output: ListLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.llm_provider_id) {
      throw new ValidationError('llm_provider_id 不能为空');
    }

    const row = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.llm_provider_id },
    ]);
    if (!row) {
      throw new NotFoundError('LLMProvider', input.llm_provider_id);
    }
    const provider = row as unknown as LLMProviderRecord;

    // 缓存命中：仅在未指定 force 且缓存未过期时直接返回本地模型列表
    if (isModelsCacheFresh(provider.models_fetched_at, input.force, IdGenerator.now())) {
      const rows = await this.relationDb.select(LLM_CACHE_TABLE, {
        conditions: [
          { field: 'llm_provider_id', operator: Operator.EQ, value: input.llm_provider_id },
        ],
        order_by: [{ field: 'llm_title', direction: Direction.ASC }],
      });
      output.list = rows as unknown as LLMCacheRecord[];
      output.cached = true;
      return true;
    }

    const strategy = LLMStrategyFactory.soStrategyById(provider);
    const req = strategy.buildListModelsRequest(provider);
    let parsedModels: Array<{
      modelId: string;
      displayName?: string;
      description?: string;
      maxTokens?: number;
      raw: Record<string, unknown>;
    }> = [];

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
        // 请求失败时不写入/更新缓存时间戳
        return false;
      }
      const rawText = res.bodyText;
      let json: unknown = {};
      try {
        json = JSON.parse(rawText);
      } catch {
        json = {};
      }
      parsedModels = strategy.parseListModelsResponse(json, rawText);
    } catch (err) {
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
      // 异常时不写入/更新缓存时间戳
      return false;
    }

    // upsert 到 llm_cache 表（按 llm_provider_id + llm_title 判重）
    for (const m of parsedModels) {
      const modelId = m.modelId;
      if (!modelId) continue;

      const existing = await this.relationDb.selectOne(LLM_CACHE_TABLE, [
        {
          field: 'llm_provider_id',
          operator: Operator.EQ,
          value: input.llm_provider_id,
        },
        { field: 'llm_title', operator: Operator.EQ, value: modelId },
      ]);

      if (existing) {
        await this.relationDb.update(
          LLM_CACHE_TABLE,
          toCacheUpdatePatch(m),
          [
            {
              field: 'llm_provider_id',
              operator: Operator.EQ,
              value: input.llm_provider_id,
            },
            { field: 'llm_title', operator: Operator.EQ, value: modelId },
          ],
        );
      } else {
        try {
          await this.relationDb.insert(LLM_CACHE_TABLE, toCacheInsertRecord(input.llm_provider_id, m));
        } catch {
          // skip duplicate insert
        }
      }
    }

    // 清理缓存中已失效的模型（本次拉取结果中已不存在的模型，如已下线的 Shutdown / Retiring）
    const freshIds = parsedModels.map((m) => m.modelId).filter((id) => !!id);
    if (freshIds.length > 0) {
      await this.relationDb.delete(LLM_CACHE_TABLE, [
        {
          field: 'llm_provider_id',
          operator: Operator.EQ,
          value: input.llm_provider_id,
        },
        {
          field: 'llm_title',
          operator: Operator.NOT_IN,
          value: freshIds,
        },
      ]);
    }

    // 仅在成功获取并保存模型后更新模型列表缓存时间
    // 刷新模型列表缓存时间戳
    await this.relationDb.update(
      LLM_PROVIDER_TABLE,
      [{ field: 'models_fetched_at', value: IdGenerator.now() }],
      [{ field: 'id', operator: Operator.EQ, value: input.llm_provider_id }],
    );

    // 返回该提供商下所有模型
    const rows = await this.relationDb.select(LLM_CACHE_TABLE, {
      conditions: [
        {
          field: 'llm_provider_id',
          operator: Operator.EQ,
          value: input.llm_provider_id,
        },
      ],
      order_by: [{ field: 'llm_title', direction: Direction.ASC }],
    });
    output.list = rows as unknown as LLMCacheRecord[];
    output.cached = false;
    return true;
  }

  private async updateModelsCacheTimestamp(providerId: string): Promise<void> {
    await this.relationDb.update(
      LLM_PROVIDER_TABLE,
      [{ field: 'models_fetched_at', value: IdGenerator.now() }],
      [{ field: 'id', operator: Operator.EQ, value: providerId }],
    );
  }

  // -------------------------------------------------------------------------
  // LLM 模型管理
  // -------------------------------------------------------------------------

  /**
   * 新增 LLM（addLLM）。
   *
   * PRD 3.2.1 条：将一个 LLM 模型添加到启用列表（llm_enable 表）。
   */
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

  /**
   * 删除 LLM（delLLM）。
   *
   * PRD 3.2.2 条：支持按 ID 批量删除或按条件删除。
   */
  async delLLM(input: DelLLMInput, output: DelLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
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
      await this.relationDb.delete(LLM_USAGE_TABLE, [
        { field: 'llm_available_id', operator: Operator.IN, value: modelIds },
      ]);
      try {
        await this.relationDb.delete('agent_llm', [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch { /* 表可能不存在 */ }
      try {
        await this.relationDb.update('planner_agent_config', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch { /* ignore */ }
      try {
        await this.relationDb.update('evolutor_agent_config', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch { /* ignore */ }
      try {
        await this.relationDb.update('writer_agent_config', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch { /* ignore */ }
      try {
        await this.relationDb.update('self_learning_config', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch { /* ignore */ }
      try {
        await this.relationDb.update('self_learning_config', [
          { field: 'document_query_llm_id', value: '' },
        ], [
          { field: 'document_query_llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch { /* ignore */ }
      try {
        await this.relationDb.update('user_profiles', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch { /* ignore */ }
      try {
        await this.relationDb.update('soul_core_config', [
          { field: 'llm_id', value: '' },
        ], [
          { field: 'llm_id', operator: Operator.IN, value: modelIds },
        ]);
      } catch { /* ignore */ }
    }

    output.affected_rows = await this.relationDb.delete(
      LLM_AVAILABLE_TABLE,
      conditions,
    );
    return true;
  }

  /**
   * 更新 LLM（updateLLM）。
   *
   * PRD 3.2.3 条：支持按 ID 或按条件更新，仅允许更新 llm_enable 表中的信息。
   * 资源级启用/禁用通过本方法修改 enable 字段实现。
   * llm_provider_id 为引用字段，不可通过本方法修改。
   */
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

  /**
   * 搜索可用模型（soLLM）。
   *
   * 支持关键词搜索 llm_title、条件过滤、排序、分页。
   * 合并了原 soLLMById 的功能。
   */
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

  // -------------------------------------------------------------------------
  // LLM 调用
  // -------------------------------------------------------------------------

  /**
   * 调用 LLM（execLLM）。
   *
   * 处理流程：
   * 1. 若未传 ID，自动查找 is_default=1 且 enable=1 的默认模型；
   * 2. 根据 ID 获取可用模型（llm_available）及提供商（llm_provider）；
   * 3. 构造 OpenAI 兼容 POST 请求，调用提供商 chat API；
   * 4. 提取 result、input_tokens、output_tokens、duration_ms；
   * 5. 更新 llm_usage 表当天 usage_count。
   *
   * 支持的入参字段：
   * - prompt: 用户消息内容（必填）
   * - system: 系统提示词（可选，前置为 system 消息）
   * - temperature: 采样温度（可选）
   * - max_tokens: 最大 Token 数（可选，未指定时使用模型默认 max_tokens）
   * - extra: 其他参数原样传入请求体
   */
  // ===== 修改后的方法：支持模型故障自动降级回退（指定模型 -> 默认模型 -> 启用模型1 -> 启用模型2 ...） =====
  // 当 input.no_fallback 为 true 时，仅尝试指定模型，不降级到其他模型
  async execLLM(input: ExecLLMInput, output: ExecLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const prompt = String(input.prompt ?? '');
    if (!prompt) {
      throw new ValidationError('prompt 不能为空');
    }

    // 解析候选模型队列（按优先级排序并去重）
    const candidateIds = await this.resolveCandidateModels(input.id);
    if (candidateIds.length === 0) {
      if (input.id) {
        throw new NotFoundError('LLM', input.id);
      }
      throw new ValidationError('id 不能为空，且无可用模型');
    }

    const startTime = Date.now();
    let lastError = '';
    let lastErrorCode = '';

    // no_fallback 模式：仅尝试第一个候选模型（即指定的模型），不降级
    const maxAttempts = input.no_fallback ? 1 : candidateIds.length;

    for (let i = 0; i < maxAttempts; i++) {
      const currentId = candidateIds[i];
      const singleOutput = new ExecLLMOutput();
      const ok = await this.executeSingleLLM(currentId, input, startTime, singleOutput);
      if (ok) {
        Object.assign(output, singleOutput);
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

    // 若仅传入了一个 ID 且无任何其他候选模型可用，且属于特定异常类型
    if (candidateIds.length === 1 && (lastErrorCode === 'NOT_FOUND' || lastErrorCode === 'VALIDATION_ERROR')) {
      if (lastErrorCode === 'NOT_FOUND') {
        throw new NotFoundError('LLM', candidateIds[0]);
      }
      throw new ValidationError(lastError);
    }

    // no_fallback 模式（如模型测试）仅调用指定模型，直接回传该模型自身的调用错误，
    // 不包装成"所有可用模型均调用失败"的降级语义
    if (input.no_fallback) {
      output.error = lastError || '模型调用失败';
      output.error_code = lastErrorCode || 'EXEC_FAILED';
      output.duration_ms = Date.now() - startTime;
      return false;
    }

    output.error = `所有可用模型均调用失败 (尝试了 ${maxAttempts} 个模型): ${lastError}`;
    output.error_code = lastErrorCode || 'ALL_MODELS_FAILED';
    output.duration_ms = Date.now() - startTime;
    return false;
  }

  /**
   * 调用 LLM 原生消息 + 原生工具调用流（execLLMEvents，Runtime v2 · 阶段 0）。
   *
   * 处理流程（Loop-PRD §4）：
   * 1. 校验入参（messages 优先，兼容 prompt/system）；
   * 2. 解析候选模型队列（复用 resolveCandidateModels 故障降级语义）；
   * 3. 每个候选经 LLMEventsRunner 发起 SSE 流，归一化事件经 input.on_event 回调；
   * 4. 成功后聚合 result/reasoning/tool_calls/finish_reason/usage 并记 usage；
   * 5. **真取消**：外部 signal 触发 → AbortedError 立即上抛（不触发降级）；
   *    空闲看门狗（默认 30s 连续无 chunk）→ AbortedError('timeout') 同样上抛。
   */
  async execLLMEvents(input: ExecLLMEventsInput, output: ExecLLMEventsOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    this.validateEventsInput(input);
    const candidateIds = await this.resolveCandidateModels(input.id);
    if (candidateIds.length === 0) {
      throw new ValidationError('id 不能为空，且无可用模型');
    }
    const startTime = Date.now();
    const maxAttempts = input.no_fallback ? 1 : candidateIds.length;
    let lastError = '';
    let lastErrorCode = '';
    for (let i = 0; i < maxAttempts; i++) {
      const single = await this.executeEventsSingle(candidateIds[i], input, input.signal);
      if (single.ok) {
        this.fillEventsOutput(output, single, startTime, input);
        return true;
      }
      lastError = single.error || 'Unknown error';
      lastErrorCode = single.error_code || 'EXEC_FAILED';
      if (single.aborted_reason) {
        throw new AbortedError(single.aborted_reason, lastError);
      }
      // 修复②：候选已向 on_event 产出过事件 → 禁止降级（避免跨候选混合流，消费方无法区分）
      if (single.emitted_events) {
        this.logger?.debug(`LLMEvents candidate ${candidateIds[i]} 已产出流事件，禁止降级`);
        break;
      }
      this.logger?.debug(`LLMEvents candidate ${candidateIds[i]} (${i + 1}/${maxAttempts}) failed: ${lastError}`);
    }
    output.error = `所有可用模型均调用失败 (尝试了 ${maxAttempts} 个模型): ${lastError}`;
    output.error_code = lastErrorCode || 'ALL_MODELS_FAILED';
    output.duration_ms = Date.now() - startTime;
    return false;
  }

  /**
   * 校验 execLLMEvents 入参（数据处理）。
   */
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

  /**
   * 执行单候选模型的事件流（逻辑控制）：请求构造 → Runner → usage 记账。
   */
  private async executeEventsSingle(
    llmId: string,
    input: ExecLLMEventsInput,
    signal?: AbortSignal,
  ): Promise<EventsSingleResult> {
    let emitted = false;
    // 修复②：包装 on_event 记录产出标志（成功与异常路径均可判定是否禁止降级）
    const onEvent = input.on_event
      ? (event: Parameters<NonNullable<ExecLLMEventsInput['on_event']>>[0]) => {
          emitted = true;
          input.on_event!(event);
        }
      : undefined;
    try {
      const request = await this.buildEventsRequest(llmId, input);
      const runner = new LLMEventsRunner({
        request,
        signal,
        idle_watchdog_ms: input.idle_watchdog_ms ?? DEFAULT_IDLE_WATCHDOG_MS,
        on_event: onEvent,
        logger: this.logger,
      });
      const result = await runner.run();
      await this.upsertUsage(llmId, result.input_tokens, result.output_tokens);
      return {
        ok: true,
        text: result.text,
        reasoning: result.reasoning,
        finish_reason: result.finish_reason,
        tool_calls: result.tool_calls,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        emitted_events: emitted || result.emitted_events,
      };
    } catch (err) {
      if (err instanceof AbortedError) {
        return { ok: false, error: err.message, error_code: err.error_code, aborted_reason: err.reason, emitted_events: emitted };
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        error_code: err instanceof ProviderError ? err.error_code : 'CONNECT_ERROR',
        emitted_events: emitted,
      };
    }
  }

  /**
   * 构造 execLLMEvents 请求（数据处理）：模型/提供商查库校验 → 策略构造。
   */
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

  /**
   * 成功路径填充输出（数据处理）。
   */
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
    output.input_tokens = single.input_tokens ?? 0;
    output.output_tokens = single.output_tokens ?? 0;
    output.duration_ms = Date.now() - startTime;
    output.wire_messages = input ? this.prepareWireMessages(input) : [];
  }

  /**
   * 准备实际发往模型的 wire 消息（数据处理，与策略侧拼装语义一致；system 前置/替换首条）。
   */
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

  /**
   * 构建候选模型队列（按优先级排序并去重）：
   * 1. 显式指定的模型 (input.id)
   * 2. 默认模型 (is_default = 1 且 enable = 1)
   * 3. 数据库中其余所有启用的模型 (enable = 1)
   *
   * 所有候选均过滤掉 embedding 向量模型：execLLM 面向文本/多模态生成，
   * 向量模型（如 nomic-embed-text）不具备对话能力，不可作为文本生成候选。
   */
  private async resolveCandidateModels(specifiedId?: string): Promise<string[]> {
    const candidates: string[] = [];
    const added = new Set<string>();

    const addCandidate = (id?: string) => {
      if (id && !added.has(id)) {
        candidates.push(id);
        added.add(id);
      }
    };

    // 1. 显式指定的模型
    if (specifiedId) {
      addCandidate(specifiedId);
    }

    // 2. 系统默认模型（仅文本/多模态，排除 embedding）
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
    } catch {
      /* ignore */
    }

    // 3. 其余所有已启用的模型（仅文本/多模态，排除 embedding）
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
    } catch {
      /* ignore */
    }

    return candidates;
  }

  /**
   * 判断模型是否具备对话/文本生成能力。
   *
   * execLLM 走 OpenAI 兼容 chat 接口，仅 text / vision 类型模型可用；
   * embedding 向量模型（如 nomic-embed-text）不支持 chat 补全，必须排除。
   * 历史数据可能缺少 llm_type，视为默认 text 以保证向后兼容。
   */
  /**
   * 单个模型的底层推理请求执行
   */
  private async executeSingleLLM(
    llmId: string,
    input: ExecLLMInput,
    startTime: number,
    output: ExecLLMOutput,
  ): Promise<boolean> {
    const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llmId },
    ]);
    if (!llmRow) {
      output.error = `LLM ${llmId} 不存在`;
      output.error_code = 'NOT_FOUND';
      return false;
    }
    const llm = llmRow as unknown as LLMAvailableRecord;
    if (!llm.enable) {
      output.error = `LLM ${llmId} 已禁用`;
      output.error_code = 'VALIDATION_ERROR';
      return false;
    }
    if ((llm.llm_type ?? 'text') === 'embedding') {
      output.error = `LLM ${llmId} 是 ${llm.llm_type ?? '未知'} 模型，无法用于文本生成`;
      output.error_code = 'VALIDATION_ERROR';
      return false;
    }

    const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llm.llm_provider_id },
    ]);
    if (!providerRow) {
      output.error = `LLMProvider ${llm.llm_provider_id} 不存在`;
      output.error_code = 'NOT_FOUND';
      return false;
    }
    const provider = providerRow as unknown as LLMProviderRecord;
    if (!provider.enable) {
      output.error = `LLMProvider ${provider.id} 已禁用`;
      output.error_code = 'VALIDATION_ERROR';
      return false;
    }

    const prompt = String(input.prompt ?? '');
    const body: Record<string, unknown> = {
      model: llm.llm_title,
      messages: [{ role: 'user', content: prompt }],
    };
    if (input.system) {
      (body.messages as Array<Record<string, unknown>>).unshift(
        { role: 'system', content: input.system },
      );
    }
    if (input.temperature !== undefined) {
      body.temperature = input.temperature;
    }
    if (input.max_tokens !== undefined) {
      body.max_tokens = input.max_tokens;
    } else if (llm.max_tokens) {
      body.max_tokens = llm.max_tokens > 100000 ? 4096 : llm.max_tokens;
    }
    // 透传其他参数（extra 中的参数原样进入请求体）
    if (input.extra) {
      for (const [k, v] of Object.entries(input.extra)) {
        if (!['prompt', 'system', 'temperature', 'max_tokens', 'model', 'messages', 'api_key'].includes(k)) {
          body[k] = v;
        }
      }
    }

    const strategy = LLMStrategyFactory.soStrategyById(provider);
    const req = strategy.buildChatRequest(provider, llm, input);

    // 流式调用：使用 SSE 解析逐 token 推送
    if (input.stream && typeof input.onDelta === 'function') {
      try {
        const streamBody = JSON.parse(req.body as string);
        streamBody.stream = true;
        const streamBodyStr = JSON.stringify(streamBody);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), EXEC_TIMEOUT_MS);

        const res = await fetch(req.url, {
          method: req.method || 'POST',
          headers: req.headers,
          body: streamBodyStr,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          output.error = `LLM 调用失败: HTTP ${res.status} ${errorText}`;
          output.error_code = 'REMOTE_ERROR';
          output.duration_ms = Date.now() - startTime;
          return false;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          output.error = 'LLM 流式响应无 body';
          output.error_code = 'CONNECT_ERROR';
          output.duration_ms = Date.now() - startTime;
          return false;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        while (true) { // eslint-disable-line no-constant-condition
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                input.onDelta!(delta);
              }
            } catch {
              /* 忽略半包/心跳帧 */
            }
          }
        }

        output.raw_response = fullContent;
        output.result = fullContent;
        output.input_prompt = prompt;
        output.input_tokens = 0;
        output.output_tokens = 0;
        output.duration_ms = Date.now() - startTime;
      } catch (err) {
        output.error = err instanceof Error ? err.message : String(err);
        output.error_code = 'CONNECT_ERROR';
        output.duration_ms = Date.now() - startTime;
        return false;
      }
    } else {
      // 非流式调用（原有逻辑）
      try {
        const httpInput = Object.assign(new ExecRequestInput(), {
          url: req.url,
          method: req.method,
          headers: req.headers,
          body: req.body,
          timeout_ms: EXEC_TIMEOUT_MS,
        });
        const httpOutput = new ExecRequestOutput();
        await this.http.execRequest(httpInput, httpOutput, new HttpContext());
        const res = httpOutput.response;
        if (!res.ok) {
          const text = res.bodyText;
          output.error = `LLM 调用失败: HTTP ${res.status} ${text}`;
          output.error_code = 'REMOTE_ERROR';
          output.duration_ms = Date.now() - startTime;
          return false;
        }
        const rawText = res.bodyText;
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
      } catch (err) {
        output.error = err instanceof Error ? err.message : String(err);
        output.error_code = 'CONNECT_ERROR';
        output.duration_ms = Date.now() - startTime;
        return false;
      }
    }

    // 成功后更新 llm_usage 表当天的 usage_count 与 token 用量
    await this.upsertUsage(llmId, output.input_tokens, output.output_tokens);
    return true;
  }

  /**
   * 调用 LLM 生成向量（embedLLM）。
   *
   * 面向 llm_type = 'embedding' 的模型，调用 OpenAI 兼容的
   * `POST {base}/v1/embeddings` 接口，请求体为 `{ model, input }`。
   *
   * 处理流程：
   * 1. 若未传 ID，自动查找 llm_type='embedding' 且 enable=1 的模型；
   * 2. 根据 ID 获取可用模型及提供商；
   * 3. 校验模型类型为 embedding；
   * 4. 调用向量化 API，解析 data[0].embedding 作为结果；
   * 5. 更新 llm_usage 表当天 usage_count。
   */
  async embedLLM(input: EmbedLLMInput, output: EmbedLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      const defaultEmbedding = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
        { field: 'llm_type', operator: Operator.EQ, value: 'embedding' },
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ]);
      if (!defaultEmbedding) {
        throw new ValidationError('id 不能为空，且无可用默认 embedding 模型');
      }
      input.id = (defaultEmbedding as unknown as LLMAvailableRecord).id;
    }
    const text = String(input.input ?? '');
    if (!text) {
      throw new ValidationError('input 不能为空');
    }

    const startTime = Date.now();

    const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!llmRow) {
      throw new NotFoundError('LLM', input.id);
    }
    const llm = llmRow as unknown as LLMAvailableRecord;
    if (!llm.enable) {
      throw new ValidationError(`LLM ${input.id} 已禁用`);
    }
    if (llm.llm_type !== 'embedding') {
      throw new ValidationError(`LLM ${input.id} 类型为 ${llm.llm_type}，不支持向量化调用`);
    }

    const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: llm.llm_provider_id },
    ]);
    if (!providerRow) {
      throw new NotFoundError('LLMProvider', llm.llm_provider_id);
    }
    const provider = providerRow as unknown as LLMProviderRecord;
    if (!provider.enable) {
      throw new ValidationError(`LLMProvider ${provider.id} 已禁用`);
    }

    const strategy = LLMStrategyFactory.soStrategyById(provider);
    const req = strategy.buildEmbedRequest(provider, llm, input);

    try {
      const httpInput = Object.assign(new ExecRequestInput(), {
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body,
        timeout_ms: EXEC_TIMEOUT_MS,
      });
      const httpOutput = new ExecRequestOutput();
      await this.http.execRequest(httpInput, httpOutput, new HttpContext());
      const res = httpOutput.response;
      if (!res.ok) {
        const errText = res.bodyText;
        output.error = `向量化调用失败: HTTP ${res.status} ${errText}`;
        output.error_code = 'REMOTE_ERROR';
        output.duration_ms = Date.now() - startTime;
        return false;
      }
      const rawText = res.bodyText;
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
    } catch (err) {
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
      output.duration_ms = Date.now() - startTime;
      return false;
    }

    await this.upsertUsage(input.id, output.input_tokens, 0);
    return true;
  }

  /**
   * 一键补全模型属性（genLLMAttr）。
   *
   * 流程：
   * 1. 读取待补全的模型（llm_available）及其提供商名称；
   * 2. 调用 PromptsProvider 渲染内置「模型属性生成」Prompt；
   * 3. 调用大模型生成「简介」与「模型用途」（模型选择：默认模型 → 启用的第一个模型）；
   * 4. 解析 JSON 结果并保存到 llm_available（llm_brief / model_usage）。
   */
  async genLLMAttr(input: GenLLMAttrInput, output: GenLLMAttrOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    // 1. 读取待补全的模型信息
    const llmRow = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!llmRow) {
      throw new NotFoundError('LLM', input.id);
    }
    const llm = llmRow as unknown as LLMAvailableRecord;

    // 2. 读取提供商名称
    let providerTitle = '';
    try {
      const providerRow = await this.relationDb.selectOne(LLM_PROVIDER_TABLE, [
        { field: 'id', operator: Operator.EQ, value: llm.llm_provider_id },
      ]);
      providerTitle =
        (providerRow as unknown as LLMProviderRecord | null)?.llm_provider_title ?? '';
    } catch {
      /* ignore */
    }

    // 3. 通过 PromptsProvider 渲染 Prompt
    let prompt = '';
    if (this.promptsAccess) {
      const execPromptInput = Object.assign(new ExecPromptInput(), {
        id: PROMPT_IDS.llmAttrGen,
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
      prompt = execPromptOutput.prompt || '';
    }
    // 兜底：PromptsProvider 未注入或模板缺失时，用内存内置模板渲染
    if (!prompt) {
      const template = getBuiltinTemplate(PROMPT_IDS.llmAttrGen);
      if (template) {
        prompt = renderTemplate(template, {
          model_name: llm.llm_title,
          llm_type: llm.llm_type || 'text',
          provider_title: providerTitle,
        });
      }
    }
    if (!prompt) {
      throw new ValidationError('模型属性生成 Prompt 不可用');
    }

    // 4. 调用大模型生成属性（空 id 复用 execLLM 的默认模型 → 启用模型降级顺序）
    const execInput = Object.assign(new ExecLLMInput(), { id: '', prompt });
    const execOutput = new ExecLLMOutput();
    const ok = await this.execLLM(execInput, execOutput, new LLMContext());
    if (!ok || !execOutput.result) {
      output.error = execOutput.error || '大模型生成模型属性失败';
      output.error_code = execOutput.error_code || 'GEN_ATTR_FAILED';
      return false;
    }

    // 5. 解析 JSON 结果（容忍 Markdown 代码块包裹）
    let brief = '';
    let usage = '';
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(execOutput.result);
      } catch {
        const cleaned = execOutput.result
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();
        parsed = JSON.parse(cleaned);
      }
      const obj = parsed as Record<string, unknown>;
      brief = typeof obj.llm_brief === 'string' ? obj.llm_brief.trim() : '';
      usage = typeof obj.model_usage === 'string' ? obj.model_usage.trim() : '';
    } catch {
      output.error = '解析大模型返回的模型属性失败';
      output.error_code = 'PARSE_ERROR';
      return false;
    }

    if (!brief && !usage) {
      output.error = '大模型未返回有效的模型属性';
      output.error_code = 'EMPTY_RESULT';
      return false;
    }

    // 6. 保存到 llm_available
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

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /**
   * 可视化数据（visualizedLLM）。
   *
   * PRD 3.4.1 条：根据 scope 获取 LLM 服务的可视化信息。
   * - health：LLM 服务健康状态（连接状态、响应时间、启用状态）；
   * - volume：数据量（提供商数、模型数、启用 LLM 数、调用记录数）；
   * - diskUsage：占用磁盘空间（基于 SQLite page_size * page_count）。
   */
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
        usage_record_count: await this.relationDb.count(LLM_USAGE_TABLE),
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

  /**
   * 启用/禁用 LLM 组件（enableLLM）。
   *
   * PRD 3.4.2 条：运行时控制 LLM 组件的可用状态。
   * 状态同步持久化到 llm_config，组件初始化时恢复。
   * 禁用期间所有 LLM 操作将返回失败（LLM 组件未启用）。
   *
   * 注：closeLLM 为终态操作，执行后不可通过本方法恢复，需重新初始化组件。
   */
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

