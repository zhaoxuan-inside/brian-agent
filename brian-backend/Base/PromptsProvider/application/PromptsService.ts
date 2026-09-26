import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from '../../shared/errors';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator, Logic } from '../../shared/query';
import type { Condition, DataObject, OrderBy, Page } from '../../shared/query';
import { PromptContext, PromptTemplateRecord, PromptTemplateData, AddPromptInput, AddPromptOutput, DelPromptInput, DelPromptOutput, UpdatePromptInput, UpdatePromptOutput, GetPromptInput, GetPromptOutput, SoPromptInput, SoPromptOutput, ExecPromptInput, ExecPromptOutput, EnablePromptsInput, EnablePromptsOutput, ClosePromptInput, ClosePromptOutput, PROMPT_TEMPLATE_TABLE, PROMPT_TEMPLATE_USAGE_TABLE, PROMPTS_CONFIG_TABLE } from '../domain/types';
import { renderPromptTemplate } from '../domain/services/PromptDomainService';

export class PromptsService {
  
  private enabled = true;

  
  private closed = false;

  private readonly config: ConfigService;

  

  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, PROMPTS_CONFIG_TABLE);
  }

  

  async initialize(): Promise<void> {
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  

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

  

  private escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  
  
  

  

  async addPrompt(input: AddPromptInput, output: AddPromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report,
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
      
      { field: 'is_system', value: 0 },
      { field: 'enable', value: data.enable !== false ? 1 : 0 },
    ];
    await this.relationDb.insert(PROMPT_TEMPLATE_TABLE, dataObjects);
    output.id = id;
    return true;
  }

  

  async delPrompt(input: DelPromptInput, output: DelPromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    await this.assertNotDeleteSystem(conditions);
    const affected = await this.relationDb.delete(PROMPT_TEMPLATE_TABLE, conditions);
    output.affected_rows = affected;

    
    if (input.ids) {
      await this.relationDb.delete(PROMPT_TEMPLATE_USAGE_TABLE, [
        { field: 'prompt_template_id', operator: Operator.IN, value: input.ids },
      ]);
    }

    return true;
  }

  
  
  private async assertNotDeleteSystem(conditions: Condition[]): Promise<void> {
    const rows = await this.relationDb.select(PROMPT_TEMPLATE_TABLE, { conditions });
    const systemHit = (rows ?? []).some((row) => Number(row.is_system ?? 0) === 1);
    if (systemHit) {
      throw new ValidationError('系统内置 Prompt 模板不允许删除');
    }
  }

  
  
  private async assertNotUnmarkSystem(conditions: Condition[], patch: Partial<PromptTemplateData>): Promise<void> {
    if (patch.is_system !== false) {
      return;
    }
    const rows = await this.relationDb.select(PROMPT_TEMPLATE_TABLE, { conditions });
    const systemHit = (rows ?? []).some((row) => Number(row.is_system ?? 0) === 1);
    if (systemHit) {
      throw new ValidationError('系统内置 Prompt 模板不允许解除系统标记');
    }
  }

  

  async updatePrompt(input: UpdatePromptInput, output: UpdatePromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;

    const patch = input.data;
    await this.assertNotUnmarkSystem(conditions, patch);
    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
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

  

  async soPromptById(input: GetPromptInput, output: GetPromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report,
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

  

  async soPrompt(input: SoPromptInput, output: SoPromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    
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

  

  private daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  

  private async soPromptWithUsageSorting(
    conditions: Condition[] | undefined,
    orderBy: OrderBy[],
    page: Page | undefined,
    output: SoPromptOutput,
  ): Promise<boolean> {
    const today = IdGenerator.today();
    const sevenDaysAgo = this.daysAgo(7);
    const thirtyDaysAgo = this.daysAgo(30);

    const templates = await this.fetchPromptTemplates(conditions);
    const total = templates.length;

    if (templates.length === 0) {
      output.list = [];
      output.total = 0;
      return true;
    }

    const usageMap = await this.buildUsageMap(today, sevenDaysAgo, thirtyDaysAgo);
    this.sortTemplatesByOrder(templates, orderBy, usageMap);

    output.list = this.applyPageSlice(templates, page);
    output.total = total;
    return true;
  }

  private async fetchPromptTemplates(conditions: Condition[] | undefined): Promise<PromptTemplateRecord[]> {
    const rows = await this.relationDb.select(PROMPT_TEMPLATE_TABLE, {
      conditions,
    });
    return rows as unknown as PromptTemplateRecord[];
  }

  private async buildUsageMap(
    today: string,
    sevenDaysAgo: string,
    thirtyDaysAgo: string,
  ): Promise<Map<string, { today: number; week: number; month: number; total: number }>> {
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
    return usageMap;
  }

  private getUsageValue(
    usageMap: Map<string, { today: number; week: number; month: number; total: number }>,
    tpl: PromptTemplateRecord,
    field: string,
  ): number {
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
  }

  private sortTemplatesByOrder(
    templates: PromptTemplateRecord[],
    orderBy: OrderBy[],
    usageMap: Map<string, { today: number; week: number; month: number; total: number }>,
  ): void {
    templates.sort((a, b) => {
      for (const ob of orderBy) {
        const isDesc = ob.direction === 'DESC';
        let valA: unknown;
        let valB: unknown;
        if (typeof ob.field === 'string' && ob.field.startsWith('usage_')) {
          valA = this.getUsageValue(usageMap, a, ob.field);
          valB = this.getUsageValue(usageMap, b, ob.field);
        } else {
          valA = (a as unknown as Record<string, unknown>)[ob.field];
          valB = (b as unknown as Record<string, unknown>)[ob.field];
        }
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
  }

  private applyPageSlice(templates: PromptTemplateRecord[], page: Page | undefined): PromptTemplateRecord[] {
    let sliced = templates;
    if (page) {
      const start = (page.current - 1) * page.size;
      sliced = templates.slice(start, start + page.size);
    }
    return sliced;
  }

  
  
  

  

  async execPrompt(input: ExecPromptInput, output: ExecPromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }
    if (!input.variables || typeof input.variables !== 'object') {
      throw new ValidationError('variables 不能为空且必须为对象');
    }

    
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

    
    output.prompt = renderPromptTemplate(
      record.prompt_template,
      input.variables as Record<string, unknown>,
    );

    
    await this.upsertUsage(input.id);

    return true;
  }

  

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

  
  
  

  

  async enablePrompts(input: EnablePromptsInput, _output: EnablePromptsOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report,
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

  

  async closePrompts(_input: ClosePromptInput, _output: ClosePromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    return true;
  }
}
