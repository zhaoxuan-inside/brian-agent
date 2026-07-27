/**
 * @fileoverview PromptsProvider 应用服务层。
 *
 * 依赖 RelationDBAccess（通过 IConfigStorage / executeRaw）操作关系数据库，
 * 依赖 ConfigService 管理 prompts_config 配置表。
 *
 * 实现所有用例：addPrompt / delPrompt / updatePrompt / getPrompt / soPrompt /
 * execPrompt / enablePrompts / closePrompts。
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
import { Operator, Logic } from '../../shared/query';
import type { Condition, DataObject, OrderBy, Page } from '../../shared/query';
import {
  PromptContext,
  PromptTemplateData,
  PromptTemplateRecord,
  AddPromptInput,
  AddPromptOutput,
  DelPromptInput,
  DelPromptOutput,
  UpdatePromptInput,
  UpdatePromptOutput,
  GetPromptInput,
  GetPromptOutput,
  SoPromptInput,
  SoPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  EnablePromptsInput,
  EnablePromptsOutput,
  ClosePromptInput,
  ClosePromptOutput,
  PROMPT_TEMPLATE_TABLE,
  PROMPT_TEMPLATE_USAGE_TABLE,
  PROMPTS_CONFIG_TABLE,
  PROMPTS_DEFAULT_CONFIGS,
} from '../domain/types';

/**
 * PromptsProvider 应用服务。
 *
 * PromptsProvider 是 Prompt 模板的唯一操作入口，上层不可直接操作数据库。
 */
export class PromptsService {
  /** 运行时启用状态 */
  private enabled = true;

  /** 是否已执行 closePrompts（终态标记） */
  private closed = false;

  private readonly config: ConfigService;

  /**
   * @param relationDb RelationDBProvider 接入层
   */
  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, PROMPTS_CONFIG_TABLE);
  }

  /**
   * 初始化：写入默认配置并恢复 enabled 状态。
   */
  async initialize(): Promise<void> {
    await this.config.initDefaults([...PROMPTS_DEFAULT_CONFIGS]);
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  /**
   * 校验组件是否启用。
   */
  private ensureEnabled(): void {
    if (this.closed) {
      throw new DatabaseError(
        'Prompts 组件已关闭（closePrompts 为终态操作），需重新初始化组件',
      );
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('Prompts');
    }
  }

  /**
   * 转义正则特殊字符，用于变量名安全匹配。
   */
  private escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // -------------------------------------------------------------------------
  // Prompt 管理
  // -------------------------------------------------------------------------

  /**
   * 新增 Prompt（addPrompt）。
   *
   * PRD 3.1.1 条。
   */
  async addPrompt(
    input: AddPromptInput,
    _context: PromptContext,
    output: AddPromptOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.prompt_template_title) {
      throw new ValidationError('prompt_template_title 不能为空');
    }
    if (!data.prompt_template) {
      throw new ValidationError('prompt_template 不能为空');
    }

    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'prompt_template_title', value: data.prompt_template_title },
      { field: 'prompt_template_brief', value: data.prompt_template_brief ?? null },
      { field: 'prompt_template', value: data.prompt_template },
      { field: 'enable', value: data.enable !== false ? 1 : 0 },
    ];
    await this.relationDb.insert(PROMPT_TEMPLATE_TABLE, dataObjects);
    output.id = id;
    return true;
  }

  /**
   * 删除 Prompt（delPrompt）。
   *
   * PRD 3.1.2 条：支持按 ID 批量删除或按条件删除。
   */
  async delPrompt(
    input: DelPromptInput,
    _context: PromptContext,
    output: DelPromptOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    const affected = await this.relationDb.delete(PROMPT_TEMPLATE_TABLE, conditions);
    output.affected_rows = affected;

    // 清理 prompt_template_usage 表中引用该 Prompt 的记录
    if (input.ids) {
      await this.relationDb.delete(PROMPT_TEMPLATE_USAGE_TABLE, [
        { field: 'prompt_template_id', operator: Operator.IN, value: input.ids },
      ]);
    }

    return true;
  }

  /**
   * 更新 Prompt（updatePrompt）。
   *
   * PRD 3.1.3 条：支持按 ID 或按条件更新。
   * 资源级启用/禁用通过本方法修改 enable 字段实现。
   */
  async updatePrompt(
    input: UpdatePromptInput,
    _context: PromptContext,
    output: UpdatePromptOutput,
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
    if (patch.prompt_template_title !== undefined) {
      data.push({ field: 'prompt_template_title', value: patch.prompt_template_title });
    }
    if (patch.prompt_template_brief !== undefined) {
      data.push({ field: 'prompt_template_brief', value: patch.prompt_template_brief });
    }
    if (patch.prompt_template !== undefined) {
      data.push({ field: 'prompt_template', value: patch.prompt_template });
    }
    if (patch.enable !== undefined) {
      data.push({ field: 'enable', value: patch.enable ? 1 : 0 });
    }

    output.affected_rows = await this.relationDb.update(
      PROMPT_TEMPLATE_TABLE,
      data,
      conditions,
    );
    return true;
  }

  /**
   * 获取 Prompt（getPrompt）。
   *
   * PRD 3.1.4 条：按 ID 或按条件获取第一条。
   */
  async getPrompt(
    input: GetPromptInput,
    _context: PromptContext,
    output: GetPromptOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;

    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, conditions);
    output.prompt = row ? (row as unknown as PromptTemplateRecord) : null;
    return true;
  }

  /**
   * 搜索 Prompt（soPrompt）。
   *
   * PRD 3.1.5 条：支持关键词、条件过滤、排序、分页。
   * 关键词匹配 prompt_template_title 与 prompt_template_brief。
   * 若按使用频率排序，联表查询 prompt_template_usage 统计表。
   */
  async soPrompt(
    input: SoPromptInput,
    _context: PromptContext,
    output: SoPromptOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    // 构建条件
    const conditions: Condition[] = [];
    if (input.conditions) {
      conditions.push(...input.conditions);
    }
    if (input.keyword) {
      conditions.push({
        field: 'prompt_template_title',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
      });
      conditions.push({
        field: 'prompt_template_brief',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
        logic: Logic.OR,
      });
    }

    // 检查是否需要按使用频率排序
    const hasUsageSorting = input.order_by?.some(
      (ob) => typeof ob.field === 'string' && ob.field.startsWith('usage_'),
    );

    if (hasUsageSorting) {
      return this.soPromptWithUsageSorting(
        conditions.length > 0 ? conditions : undefined,
        input.order_by!,
        input.page,
        output,
      );
    }

    const rows = await this.relationDb.select(PROMPT_TEMPLATE_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      PROMPT_TEMPLATE_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );

    output.list = rows as unknown as PromptTemplateRecord[];
    output.total = total;
    return true;
  }

  /**
   * 获取 N 天前的日期字符串（YYYY-MM-DD）。
   */
  private daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 按使用频率排序的搜索实现。
   *
   * 联表查询 prompt_template_usage，计算今日/最近7天/最近30天/总使用次数，
   * 在内存中完成排序与分页。
   */
  private async soPromptWithUsageSorting(
    conditions: Condition[] | undefined,
    orderBy: OrderBy[],
    page: Page | undefined,
    output: SoPromptOutput,
  ): Promise<boolean> {
    const today = IdGenerator.today();
    const sevenDaysAgo = this.daysAgo(7);
    const thirtyDaysAgo = this.daysAgo(30);

    // 获取基础模板列表（不含分页，后续在内存中处理）
    const rows = await this.relationDb.select(PROMPT_TEMPLATE_TABLE, {
      conditions,
    });
    const templates = rows as unknown as PromptTemplateRecord[];
    const total = templates.length;

    if (templates.length === 0) {
      output.list = [];
      output.total = 0;
      return true;
    }

    // 批量查询所有模板的使用统计
    const usageRows = await this.relationDb.select(PROMPT_TEMPLATE_USAGE_TABLE, {});
    const usageMap = new Map<
      string,
      { today: number; week: number; month: number; total: number }
    >();
    for (const row of usageRows) {
      const ptId = row.prompt_template_id as string;
      const cnt = (row.usage_count as number) ?? 0;
      const date = row.usage_date as string;
      let stats = usageMap.get(ptId);
      if (!stats) {
        stats = { today: 0, week: 0, month: 0, total: 0 };
        usageMap.set(ptId, stats);
      }
      stats.total += cnt;
      if (date === today) stats.today += cnt;
      if (date >= sevenDaysAgo) stats.week += cnt;
      if (date >= thirtyDaysAgo) stats.month += cnt;
    }

    const getUsageValue = (
      tpl: PromptTemplateRecord,
      field: string,
    ): number => {
      const stats = usageMap.get(tpl.id);
      if (!stats) return 0;
      switch (field) {
        case 'usage_today_count':
          return stats.today;
        case 'usage_7d_count':
          return stats.week;
        case 'usage_30d_count':
          return stats.month;
        case 'usage_total_count':
          return stats.total;
        default:
          return 0;
      }
    };

    // 排序
    templates.sort((a, b) => {
      for (const ob of orderBy) {
        const isDesc = ob.direction === 'DESC';
        let valA: unknown;
        let valB: unknown;

        if (typeof ob.field === 'string' && ob.field.startsWith('usage_')) {
          valA = getUsageValue(a, ob.field);
          valB = getUsageValue(b, ob.field);
        } else {
          valA = (a as Record<string, unknown>)[ob.field];
          valB = (b as Record<string, unknown>)[ob.field];
        }

        // 处理 null/undefined：null 排最后（升序）或最前（降序）
        if (valA === null || valA === undefined) {
          return valB === null || valB === undefined ? 0 : (isDesc ? 1 : -1);
        }
        if (valB === null || valB === undefined) {
          return isDesc ? -1 : 1;
        }

        if (valA < valB) return isDesc ? 1 : -1;
        if (valA > valB) return isDesc ? -1 : 1;
      }
      return 0;
    });

    // 分页
    let sliced = templates;
    if (page) {
      const start = (page.current - 1) * page.size;
      sliced = templates.slice(start, start + page.size);
    }

    output.list = sliced;
    output.total = total;
    return true;
  }

  // -------------------------------------------------------------------------
  // Prompt 执行
  // -------------------------------------------------------------------------

  /**
   * 执行/渲染 Prompt（execPrompt）。
   *
   * PRD 3.2.1 条：接收 Prompt 模板 ID 及变量参数，生成最终的完整 Prompt。
   *
   * 处理流程：
   * 1. 根据 ID 获取 Prompt 模板内容；
   * 2. 完成变量替换（{{variable}} 格式）；
   * 3. 生成最终的完整 Prompt 字符串；
   * 4. 调用成功后更新 prompt_template_usage 表当天的 usage_count + 1。
   */
  async execPrompt(
    input: ExecPromptInput,
    _context: PromptContext,
    output: ExecPromptOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }
    if (!input.variables || typeof input.variables !== 'object') {
      throw new ValidationError('variables 不能为空且必须为对象');
    }

    // 1. 根据 ID 获取 Prompt 模板内容
    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!row) {
      throw new NotFoundError('Prompt', input.id);
    }
    const record = row as unknown as PromptTemplateRecord;
    if (!record.enable) {
      throw new ValidationError(`Prompt ${input.id} 已禁用`);
    }

    // 2. 变量替换：将 {{variable_name}} 替换为 variables 中对应的值
    let rendered = record.prompt_template;
    for (const [key, value] of Object.entries(input.variables)) {
      const pattern = new RegExp(
        `\\{\\{\\s*${this.escapeRegExp(key)}\\s*\\}\\}`,
        'g',
      );
      rendered = rendered.replace(pattern, () => String(value));
    }

    // 3. 生成最终的完整 Prompt 字符串
    output.prompt = rendered;

    // 4. 更新 prompt_template_usage 表当天的 usage_count + 1
    await this.upsertUsage(input.id);

    return true;
  }

  /**
   * 更新 Prompt 模板当日使用次数（upsert 语义）。
   *
   * 若当天记录已存在则 usage_count + 1，否则新增一条记录。
   */
  private async upsertUsage(promptTemplateId: string): Promise<void> {
    const today = IdGenerator.today();
    const now = IdGenerator.now();

    const existing = await this.relationDb.selectOne(PROMPT_TEMPLATE_USAGE_TABLE, [
      { field: 'prompt_template_id', operator: Operator.EQ, value: promptTemplateId },
      { field: 'usage_date', operator: Operator.EQ, value: today },
    ]);

    if (existing) {
      const currentCount = (existing.usage_count as number) ?? 0;
      await this.relationDb.update(
        PROMPT_TEMPLATE_USAGE_TABLE,
        [
          { field: 'usage_count', value: currentCount + 1 },
          { field: 'updated', value: now },
        ],
        [
          { field: 'prompt_template_id', operator: Operator.EQ, value: promptTemplateId },
          { field: 'usage_date', operator: Operator.EQ, value: today },
        ],
      );
    } else {
      const usageId = IdGenerator.generate();
      await this.relationDb.insert(PROMPT_TEMPLATE_USAGE_TABLE, [
        { field: 'id', value: usageId },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'prompt_template_id', value: promptTemplateId },
        { field: 'usage_date', value: today },
        { field: 'usage_count', value: 1 },
      ]);
    }
  }

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /**
   * 启用/禁用 Prompts 组件（enablePrompts）。
   *
   * PRD 3.3.1 条：运行时控制 Prompts 组件的可用状态。
   * 状态持久化到 prompts_config，组件初始化时恢复。
   *
   * 注：closePrompts 为终态操作，执行后不可通过本方法恢复，需重新初始化组件。
   */
  async enablePrompts(
    input: EnablePromptsInput,
    _context: PromptContext,
    _output: EnablePromptsOutput,
  ): Promise<boolean> {
    if (this.closed) {
      throw new DatabaseError(
        'Prompts 组件已关闭（closePrompts 为终态操作），需重新初始化组件',
      );
    }
    this.enabled = input.enable;
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      'Prompts 组件是否启用（enablePrompts 读写）',
    );
    return true;
  }

  /**
   * 关闭 Prompts 组件（closePrompts）。
   *
   * PRD 5.9 条：系统关闭时的终态释放，执行后不可通过 enablePrompts 恢复，
   * 需重新初始化组件。
   *
   * PromptsProvider 不持有独立数据库连接（使用 RelationDBProvider 的共享连接），
   * 本方法仅标记终态，后续所有操作将抛出错误。
   */
  async closePrompts(
    _input: ClosePromptInput,
    _context: PromptContext,
    _output: ClosePromptOutput,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    return true;
  }
}
