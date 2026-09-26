import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  DatabaseError,
} from '../../shared/errors';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { newPatch, newRecord } from '../../shared/query';
import { Operator } from '../../shared/query';
import type { Condition, OrderBy, Page } from '../../shared/query';
import {
  SoulContext, SoulRecord, AddSoulInput, AddSoulOutput, DelSoulInput, DelSoulOutput, UpdateSoulInput, UpdateSoulOutput, GetSoulInput, GetSoulOutput, SoSoulInput, SoSoulOutput, EnableSoulInput, EnableSoulOutput, CloseSoulInput, CloseSoulOutput, RecordSoulUsageInput, RecordSoulUsageOutput, SOUL_TABLE, SOUL_USAGE_TABLE, SOUL_CONFIG_TABLE,
} from '../domain/types';
import {
  aggregateUsageStats,
  buildKeywordConditions,
  hasUsageSorting,
  paginate,
  resolveTargetConditions,
  sortByOrder,
} from '../domain/services/SoulDomainService';
import type { SoulUsageRow } from '../domain/services/SoulDomainService';

export class SoulService {
  
  private enabled = true;

  
  private closed = false;

  private readonly config: ConfigService;

  

  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, SOUL_CONFIG_TABLE);
  }

  

  async initialize(): Promise<void> {
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  

  private ensureEnabled(): void {
    if (this.closed) {
      throw new DatabaseError(
        'Soul 组件已关闭（closeSoul 为终态操作），需重新初始化组件',
      );
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('Soul');
    }
  }

  

  async addSoul(input: AddSoulInput, output: AddSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    const id = IdGenerator.generate();
    await this.relationDb.insert(
      SOUL_TABLE,
      newRecord({
        id,
        soul_content: data.soul_content,
        soul_brief: data.soul_brief,
        soul_usage: data.soul_usage,
        enable: data.enable !== false ? 1 : 0,
      }),
    );
    output.id = id;
    return true;
  }

  

  async delSoul(input: DelSoulInput, output: DelSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions = resolveTargetConditions(input);
    if (!conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    output.affected_rows = await this.relationDb.delete(SOUL_TABLE, conditions);

    
    if (input.ids) {
      await this.relationDb.delete(SOUL_USAGE_TABLE, [
        { field: 'soul_id', operator: Operator.IN, value: input.ids },
      ]);
    }
    return true;
  }

  

  async updateSoul(input: UpdateSoulInput, output: UpdateSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions = resolveTargetConditions(input);
    if (!conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const patch = input.data;
    const data = newPatch({
      soul_content: patch.soul_content,
      soul_brief: patch.soul_brief,
      soul_usage: patch.soul_usage,
      enable: patch.enable !== undefined ? (patch.enable ? 1 : 0) : undefined,
    });

    output.affected_rows = await this.relationDb.update(SOUL_TABLE, data, conditions);
    return true;
  }

  

  async soSoulById(input: GetSoulInput, output: GetSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions = resolveTargetConditions(input);
    if (!conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const row = await this.relationDb.selectOne(SOUL_TABLE, conditions);
    output.soul = row ? (row as unknown as SoulRecord) : null;
    return true;
  }

  

  async soSoul(input: SoSoulInput, output: SoSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    
    
    let keywordIds: string[] | undefined;
    if (input.keyword) {
      const keywordRows = await this.relationDb.select(SOUL_TABLE, {
        conditions: buildKeywordConditions(input.keyword),
        fields: ['id'],
      });
      keywordIds = keywordRows.map((r) => r.id as string);
      if (keywordIds.length === 0) {
        output.list = [];
        output.total = 0;
        return true;
      }
    }

    const conditions: Condition[] = [];
    if (keywordIds) {
      conditions.push({ field: 'id', operator: Operator.IN, value: keywordIds });
    }
    if (input.conditions) {
      conditions.push(...input.conditions);
    }

    if (hasUsageSorting(input.order_by)) {
      await this.soSoulWithUsageSorting(
        conditions.length > 0 ? conditions : undefined,
        input.order_by!,
        input.page,
        output,
      );
      return true;
    }

    const rows = await this.relationDb.select(SOUL_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    output.list = rows as unknown as SoulRecord[];
    output.total = await this.relationDb.count(
      SOUL_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );
    return true;
  }

  

  private async soSoulWithUsageSorting(
    conditions: Condition[] | undefined,
    orderBy: OrderBy[],
    page: Page | undefined,
    output: SoSoulOutput,
  ): Promise<void> {
    const rows = await this.relationDb.select(SOUL_TABLE, { conditions });
    const souls = rows as unknown as SoulRecord[];
    if (souls.length === 0) {
      output.list = [];
      output.total = 0;
      return;
    }

    const usageRows = await this.relationDb.select(SOUL_USAGE_TABLE, {});
    const usageMap = aggregateUsageStats(
      usageRows as unknown as SoulUsageRow[],
      IdGenerator.today(),
      this.daysAgo(7),
      this.daysAgo(30),
    );

    sortByOrder(souls, orderBy, usageMap);
    output.list = paginate(souls, page);
    output.total = souls.length;
  }

  

  private daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  
  
  

  

  async enableSoul(input: EnableSoulInput, _output: EnableSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (this.closed) {
      throw new DatabaseError(
        'Soul 组件已关闭（closeSoul 为终态操作），需重新初始化组件',
      );
    }
    this.enabled = input.enable;
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      'Soul 组件是否启用（enableSoul 读写）',
    );
    return true;
  }

  

  async closeSoul(_input: CloseSoulInput, _output: CloseSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    return true;
  }

  
  
  

  

  async recordSoulUsage(input: RecordSoulUsageInput, _output: RecordSoulUsageOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.soul_id) {
      throw new ValidationError('soul_id 不能为空');
    }

    const usageDate = IdGenerator.today();

    const existing = await this.relationDb.selectOne(SOUL_USAGE_TABLE, [
      { field: 'soul_id', operator: Operator.EQ, value: input.soul_id },
      { field: 'usage_date', operator: Operator.EQ, value: usageDate },
    ]);

    if (existing) {
      const currentCount = (existing.usage_count as number) ?? 0;
      await this.relationDb.update(
        SOUL_USAGE_TABLE,
        newPatch({ usage_count: currentCount + 1 }),
        [
          { field: 'soul_id', operator: Operator.EQ, value: input.soul_id },
          { field: 'usage_date', operator: Operator.EQ, value: usageDate },
        ],
      );
    } else {
      await this.relationDb.insert(
        SOUL_USAGE_TABLE,
        newRecord({ soul_id: input.soul_id, usage_date: usageDate, usage_count: 1 }),
      );
    }
    return true;
  }
}
