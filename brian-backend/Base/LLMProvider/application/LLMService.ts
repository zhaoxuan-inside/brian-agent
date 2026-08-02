/**
 * @fileoverview LLMProvider 应用服务层。
 *
 * 依赖 RelationDBAccess（通过 IConfigStorage / executeRaw / queryRaw）操作关系数据库，
 * 依赖 ConfigService 管理 llm_config 配置表。
 *
 * 实现所有用例：addLLMProvider / updateLLMProvider / delLLMProvider / soLLMProvider /
 * testLLMProvider / listLLM / addLLM / delLLM / updateLLM / getLLM / soLLM / execLLM /
 * visualizedLLM / enableLLM / closeLLM。
 *
 * LLMProvider 是 LLM 的唯一操作入口，上层不可直接调用 LLM 提供商 API。
 * 对外 API 调用采用 OpenAI 兼容协议（/v1/models、/v1/chat/completions），
 * 通过 Node.js 全局 fetch 实现。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from '../../shared/errors';
import { IdGenerator } from '../../shared/id/IdGenerator';
import { Operator, Logic, Direction } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
import {
  LLMContext,
  LLMProviderData,
  LLMData,
  LLMProviderRecord,
  LLMModelRecord,
  LLMEnableRecord,
  AddLLMProviderInput,
  AddLLMProviderOutput,
  UpdateLLMProviderInput,
  UpdateLLMProviderOutput,
  DelLLMProviderInput,
  DelLLMProviderOutput,
  SoLLMProviderInput,
  SoLLMProviderOutput,
  TestLLMProviderInput,
  TestLLMProviderOutput,
  ListLLMInput,
  ListLLMOutput,
  AddLLMInput,
  AddLLMOutput,
  DelLLMInput,
  DelLLMOutput,
  UpdateLLMInput,
  UpdateLLMOutput,
  GetLLMInput,
  GetLLMOutput,
  SoLLMInput,
  SoLLMOutput,
  ExecLLMInput,
  ExecLLMOutput,
  VisualizedLLMInput,
  VisualizedLLMOutput,
  EnableLLMInput,
  EnableLLMOutput,
  CloseLLMInput,
  CloseLLMOutput,
  LLM_PROVIDER_TABLE,
  LLM_MODEL_TABLE,
  LLM_ENABLE_TABLE,
  LLM_USAGE_TABLE,
  LLM_CONFIG_TABLE,
  LLM_DEFAULT_CONFIGS,
} from '../domain/types';

/** testLLMProvider 默认连接超时时间（毫秒） */
const TEST_TIMEOUT_MS = 10000;

/** listLLM 默认请求超时时间（毫秒） */
const LIST_TIMEOUT_MS = 30000;

/** execLLM 默认请求超时时间（毫秒） */
const EXEC_TIMEOUT_MS = 120000;

/** OpenAI 兼容 API 路径：模型列表 */
const MODELS_PATH = 'v1/models';

/** OpenAI 兼容 API 路径：对话补全 */
const CHAT_PATH = 'v1/chat/completions';

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

  /**
   * @param relationDb RelationDBProvider 接入层
   */
  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, LLM_CONFIG_TABLE);
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
    await this.config.initDefaults([...LLM_DEFAULT_CONFIGS]);
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
    const base = baseUrl.replace(/\/+$/, '');
    if (base.toLowerCase().endsWith('/v1')) {
      const suffix = apiPath.replace(/^v1\/?/, '');
      return suffix ? `${base}/${suffix}` : base;
    }
    return `${base}/${apiPath}`;
  }

  /**
   * 带超时的 fetch 请求。
   *
   * 使用 AbortController 实现超时控制，超时后中止请求并抛出错误。
   *
   * @param url 请求地址
   * @param options fetch 选项
   * @param timeoutMs 超时时间（毫秒）
   * @returns fetch 响应
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 更新 LLM 当日使用次数（upsert 语义）。
   *
   * 若当天记录已存在则 usage_count + 1，否则新增一条记录。
   * 仅当 execLLM 调用成功时调用本方法。
   *
   * @param llmEnableId 启用的 LLM ID（llm_enable.id）
   */
  private async upsertUsage(llmEnableId: string): Promise<void> {
    const today = IdGenerator.today();
    const now = IdGenerator.now();

    const existing = await this.relationDb.selectOne(LLM_USAGE_TABLE, [
      { field: 'llm_enable_id', operator: Operator.EQ, value: llmEnableId },
      { field: 'usage_date', operator: Operator.EQ, value: today },
    ]);

    if (existing) {
      const currentCount = (existing.usage_count as number) ?? 0;
      await this.relationDb.update(
        LLM_USAGE_TABLE,
        [
          { field: 'usage_count', value: currentCount + 1 },
          { field: 'updated', value: now },
        ],
        [
          { field: 'llm_enable_id', operator: Operator.EQ, value: llmEnableId },
          { field: 'usage_date', operator: Operator.EQ, value: today },
        ],
      );
    } else {
      const usageId = IdGenerator.generate();
      await this.relationDb.insert(LLM_USAGE_TABLE, [
        { field: 'id', value: usageId },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'llm_enable_id', value: llmEnableId },
        { field: 'usage_date', value: today },
        { field: 'usage_count', value: 1 },
      ]);
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
  async addLLMProvider(
    input: AddLLMProviderInput,
    _context: LLMContext,
    output: AddLLMProviderOutput,
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

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'llm_provider_url', value: data.llm_provider_url },
      { field: 'llm_provider_title', value: data.llm_provider_title },
      { field: 'llm_provider_brief', value: data.llm_provider_brief ?? null },
      { field: 'enable', value: data.enable === false ? 0 : 1 },
      { field: 'api_key', value: data.api_key ?? null },
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
  async updateLLMProvider(
    input: UpdateLLMProviderInput,
    _context: LLMContext,
    output: UpdateLLMProviderOutput,
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
  async delLLMProvider(
    input: DelLLMProviderInput,
    _context: LLMContext,
    output: DelLLMProviderOutput,
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

    // 级联清理 llm_model 表中引用该提供商的记录
    if (providerIds.length > 0) {
      await this.relationDb.delete(LLM_MODEL_TABLE, [
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
  async soLLMProvider(
    input: SoLLMProviderInput,
    _context: LLMContext,
    output: SoLLMProviderOutput,
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
  async testLLMProvider(
    input: TestLLMProviderInput,
    _context: LLMContext,
    output: TestLLMProviderOutput,
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
    try {
      const res = await this.fetchWithTimeout(
        provider.llm_provider_url,
        { method: 'GET' },
        TEST_TIMEOUT_MS,
      );
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

  /**
   * 获取 LLM 模型列表（listLLM）。
   *
   * PRD 3.1.6 条：从 LLM 提供商 API 获取可用的模型列表并保存到本地。
   * 采用 OpenAI 兼容协议 GET /v1/models，将模型信息 upsert 到 llm_model 表。
   */
  async listLLM(
    input: ListLLMInput,
    _context: LLMContext,
    output: ListLLMOutput,
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

    const url = this.buildEndpoint(provider.llm_provider_url, MODELS_PATH);

    let models: Array<{
      id?: string;
      owned_by?: string;
      created?: number;
    }> = [];
    try {
      const res = await this.fetchWithTimeout(
        url,
        { method: 'GET' },
        LIST_TIMEOUT_MS,
      );
      if (!res.ok) {
        output.error = `获取模型列表失败: HTTP ${res.status}`;
        output.error_code = 'REMOTE_ERROR';
        return false;
      }
      const json = (await res.json()) as {
        data?: Array<{
          id?: string;
          owned_by?: string;
          created?: number;
        }>;
      };
      models = json.data ?? [];
    } catch (err) {
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
      return false;
    }

    // upsert 到 llm_model 表（按 llm_provider_id + llm_title 判重）
    const now = IdGenerator.now();
    for (const m of models) {
      const modelId = m.id ?? '';
      if (!modelId) {
        continue;
      }
      const brief = m.owned_by ? `owned_by: ${m.owned_by}` : null;

      const existing = await this.relationDb.selectOne(LLM_MODEL_TABLE, [
        {
          field: 'llm_provider_id',
          operator: Operator.EQ,
          value: input.llm_provider_id,
        },
        { field: 'llm_title', operator: Operator.EQ, value: modelId },
      ]);

      if (existing) {
        await this.relationDb.update(
          LLM_MODEL_TABLE,
          [
            { field: 'llm_brief', value: brief },
            { field: 'updated', value: now },
          ],
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
        const id = IdGenerator.generate();
        await this.relationDb.insert(LLM_MODEL_TABLE, [
          { field: 'id', value: id },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'llm_provider_id', value: input.llm_provider_id },
          { field: 'llm_title', value: modelId },
          { field: 'llm_brief', value: brief },
        ]);
      }
    }

    // 返回该提供商下所有模型
    const rows = await this.relationDb.select(LLM_MODEL_TABLE, {
      conditions: [
        {
          field: 'llm_provider_id',
          operator: Operator.EQ,
          value: input.llm_provider_id,
        },
      ],
      order_by: [{ field: 'llm_title', direction: Direction.ASC }],
    });
    output.list = rows as unknown as LLMModelRecord[];
    return true;
  }

  // -------------------------------------------------------------------------
  // LLM 模型管理
  // -------------------------------------------------------------------------

  /**
   * 新增 LLM（addLLM）。
   *
   * PRD 3.2.1 条：将一个 LLM 模型添加到启用列表（llm_enable 表）。
   */
  async addLLM(
    input: AddLLMInput,
    _context: LLMContext,
    output: AddLLMOutput,
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
      { field: 'llm_usage', value: data.llm_usage ?? '' },
      { field: 'enable', value: data.enable === false ? 0 : 1 },
    ];
    await this.relationDb.insert(LLM_ENABLE_TABLE, dataObjects);
    output.id = id;
    return true;
  }

  /**
   * 删除 LLM（delLLM）。
   *
   * PRD 3.2.2 条：支持按 ID 批量删除或按条件删除。
   */
  async delLLM(
    input: DelLLMInput,
    _context: LLMContext,
    output: DelLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    output.affected_rows = await this.relationDb.delete(
      LLM_ENABLE_TABLE,
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
  async updateLLM(
    input: UpdateLLMInput,
    _context: LLMContext,
    output: UpdateLLMOutput,
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
    if (patch.llm_usage !== undefined) {
      data.push({ field: 'llm_usage', value: patch.llm_usage });
    }
    if (patch.enable !== undefined) {
      data.push({ field: 'enable', value: patch.enable ? 1 : 0 });
    }

    output.affected_rows = await this.relationDb.update(
      LLM_ENABLE_TABLE,
      data,
      conditions,
    );
    return true;
  }

  /**
   * 获取 LLM（getLLM）。
   *
   * PRD 3.2.4 条：按 ID 或按条件获取第一条。
   */
  async getLLM(
    input: GetLLMInput,
    _context: LLMContext,
    output: GetLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;

    const row = await this.relationDb.selectOne(LLM_ENABLE_TABLE, conditions);
    output.llm = row ? (row as unknown as LLMEnableRecord) : null;
    return true;
  }

  /**
   * 搜索 LLM（soLLM）。
   *
   * PRD 3.2.5 条：支持关键词（名称和摘要）、条件过滤、排序、分页。
   * 关键词匹配 llm_title 与 llm_brief。
   */
  async soLLM(
    input: SoLLMInput,
    _context: LLMContext,
    output: SoLLMOutput,
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
      conditions.push({
        field: 'llm_brief',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
        logic: Logic.OR,
      });
    }

    const rows = await this.relationDb.select(LLM_ENABLE_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      LLM_ENABLE_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );

    output.list = rows as unknown as LLMEnableRecord[];
    output.total = total;
    return true;
  }

  // -------------------------------------------------------------------------
  // LLM 调用
  // -------------------------------------------------------------------------

  /**
   * 调用 LLM（execLLM）。
   *
   * PRD 3.3.1 条：调用指定的 LLM 执行推理。
   *
   * 处理流程：
   * 1. 根据 ID 获取 LLM 配置（llm_enable）及提供商信息（llm_provider）；
   * 2. 构造 OpenAI 兼容请求（POST /v1/chat/completions）调用 LLM 提供商 API；
   * 3. 调用成功后，通过 RelationDBProvider 更新 llm_usage 表当天的 usage_count + 1；
   * 4. 推理结果通过 output.result 返回。
   *
   * params 支持的参数：
   * - api_key: API 密钥（作为 Bearer Token 传入 Authorization 头）
   * - model: 覆盖默认模型名（默认取 llm_enable.llm_title）
   * - messages: 自定义消息列表（默认根据 prompt 构造单条 user 消息）
   * - system: 系统提示词（追加为 system 消息）
   * - temperature / max_tokens: 采样参数
   * - 其他参数原样传入请求体
   */
  async execLLM(
    input: ExecLLMInput,
    _context: LLMContext,
    output: ExecLLMOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }
    if (!input.prompt) {
      throw new ValidationError('prompt 不能为空');
    }

    // 1. 获取 LLM 配置
    const llmRow = await this.relationDb.selectOne(LLM_ENABLE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!llmRow) {
      throw new NotFoundError('LLM', input.id);
    }
    const llm = llmRow as unknown as LLMEnableRecord;
    if (!llm.enable) {
      throw new ValidationError(`LLM ${input.id} 已禁用`);
    }

    // 2. 获取提供商信息
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

    // 3. 构造请求体
    const params = input.params ?? {};
    const model = (params.model as string | undefined) ?? llm.llm_title;
    const hasCustomMessages = Array.isArray(params.messages);
    const messages = hasCustomMessages
      ? (params.messages as Array<{ role: string; content: string }>)
      : [{ role: 'user', content: input.prompt }];

    const body: Record<string, unknown> = { model, messages };
    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }
    if (params.max_tokens !== undefined) {
      body.max_tokens = params.max_tokens;
    }
    // 若提供了 system 提示词且未自定义 messages，则前置 system 消息
    if (params.system !== undefined && !hasCustomMessages) {
      body.messages = [
        { role: 'system', content: params.system },
        ...messages,
      ];
    }
    // 透传其他参数（排除已处理的保留字段）
    const reservedKeys = [
      'model',
      'messages',
      'temperature',
      'max_tokens',
      'system',
      'api_key',
    ];
    for (const [k, v] of Object.entries(params)) {
      if (!reservedKeys.includes(k)) {
        body[k] = v;
      }
    }

    // 构造请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (params.api_key !== undefined && params.api_key !== '') {
      headers['Authorization'] = `Bearer ${String(params.api_key)}`;
    }

    // 4. 调用 API
    const url = this.buildEndpoint(provider.llm_provider_url, CHAT_PATH);
    try {
      const res = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
        EXEC_TIMEOUT_MS,
      );
      if (!res.ok) {
        const text = await res.text();
        output.error = `LLM 调用失败: HTTP ${res.status} ${text}`;
        output.error_code = 'REMOTE_ERROR';
        return false;
      }
      const json = (await res.json()) as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string;
        }>;
        usage?: Record<string, unknown>;
      };
      const content = json.choices?.[0]?.message?.content ?? '';
      output.result = content;
      if (json.usage) {
        output.usage = json.usage;
      }
    } catch (err) {
      output.error = err instanceof Error ? err.message : String(err);
      output.error_code = 'CONNECT_ERROR';
      return false;
    }

    // 5. 成功后更新 llm_usage 表当天的 usage_count + 1
    await this.upsertUsage(input.id);
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
  async visualizedLLM(
    input: VisualizedLLMInput,
    _context: LLMContext,
    output: VisualizedLLMOutput,
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
        enabled_llm_count: await this.relationDb.count(LLM_ENABLE_TABLE, [
          { field: 'enable', operator: Operator.EQ, value: 1 },
        ]),
      };
    } else if (scope === 'volume') {
      output.data = {
        provider_count: await this.relationDb.count(LLM_PROVIDER_TABLE),
        model_count: await this.relationDb.count(LLM_MODEL_TABLE),
        enabled_llm_count: await this.relationDb.count(LLM_ENABLE_TABLE),
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
  async enableLLM(
    input: EnableLLMInput,
    _context: LLMContext,
    _output: EnableLLMOutput,
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

  /**
   * 关闭 LLM 组件连接（closeLLM）。
   *
   * PRD 3.4.3 条：系统关闭时的终态释放，执行后不可通过 enableLLM 恢复，
   * 需重新初始化组件。
   *
   * LLM 调用采用无状态 HTTP 请求（fetch），无独立连接需释放，
   * 本方法仅标记终态。
   */
  async closeLLM(
    _input: CloseLLMInput,
    _context: LLMContext,
    _output: CloseLLMOutput,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    return true;
  }
}
