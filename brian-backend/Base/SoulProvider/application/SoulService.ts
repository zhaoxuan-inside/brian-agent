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
import { TraceService, RecordUsageInput, RecordUsageOutput, USAGE_EVENT_TABLE, SOUL_USAGE_ORG_TABLE } from '../../TraceBase';
import { Context } from '../../shared/base/Context';
import {
  syncComponentEmbedding,
  deleteComponentEmbedding,
  syncComponentExamples,
  buildFunnelDocText,
} from '../../shared/match';
import {
  resolveComponentSemantics,
  type SemanticsTaskFn,
} from '../../shared/semantics';
import {
  SoulContext, SoulRecord, SoulData, AddSoulInput, AddSoulOutput, DelSoulInput, DelSoulOutput, UpdateSoulInput, UpdateSoulOutput, GetSoulInput, GetSoulOutput, SoSoulInput, SoSoulOutput, EnableSoulInput, EnableSoulOutput, CloseSoulInput, CloseSoulOutput, RecordSoulUsageInput, RecordSoulUsageOutput, SOUL_TABLE, SOUL_EMBEDDING_TABLE, SOUL_EXAMPLE_EMBEDDING_TABLE, SOUL_CONFIG_TABLE,
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

  private readonly trace: TraceService;
  private embedFn?: (text: string, context?: Context) => Promise<number[]>;
  private semanticsFn?: SemanticsTaskFn;



  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, SOUL_CONFIG_TABLE);
    this.trace = new TraceService(relationDb);
  }

  setEmbedFn(fn: (text: string, context?: Context) => Promise<number[]>): void {
    this.embedFn = fn;
  }

  setSemanticsFn(fn: SemanticsTaskFn): void {
    this.semanticsFn = fn;
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
    const sem = await this.resolveSoulSemantics(data, _metrics);
    const id = IdGenerator.generate();
    await this.relationDb.insert(
      SOUL_TABLE,
      newRecord({
        id,
        title: sem.title,
        content: data.soul_content,
        brief: sem.brief,
        soul_usage: data.soul_usage,
        enable: data.enable !== false ? 1 : 0,
      }),
    );
    output.id = id;
    await this.syncSoulVector(id, sem.title, sem.brief, data.soul_usage, data.soul_content, _metrics);
    await this.syncSoulExamples(id, sem.positive_examples, sem.negative_examples, _metrics);
    return true;
  }

  /** 语义四元组裁决：用户显式值优先，缺口由注入的 LLM 生成回填 */
  private async resolveSoulSemantics(data: SoulData, metrics?: Metrics) {
    return resolveComponentSemantics({
      kind: 'soul',
      source: { kind: 'soul', title: data.title, brief: data.soul_brief, content: data.soul_content },
      provided: {
        title: data.title, brief: data.soul_brief,
        positive_examples: data.positive_examples, negative_examples: data.negative_examples,
      },
      semanticsFn: this.semanticsFn,
      metrics,
    });
  }

  private async syncSoulVector(id: string, title: string, brief: string | undefined, usage: string | undefined, content: string | undefined, metrics?: Metrics): Promise<void> {
    const docText = buildFunnelDocText(title, usage || brief || content || '');
    await syncComponentEmbedding({
      relationDb: this.relationDb,
      table: SOUL_EMBEDDING_TABLE,
      targetIdField: 'soul_id',
      targetId: id,
      text: docText,
      embedFn: this.embedFn,
      metrics,
    });
  }

  private async syncSoulExamples(id: string, positive: string[] | undefined, negative: string[] | undefined, metrics?: Metrics): Promise<void> {
    if (positive === undefined && negative === undefined) return;
    await syncComponentExamples({
      relationDb: this.relationDb,
      table: SOUL_EXAMPLE_EMBEDDING_TABLE,
      targetIdField: 'soul_id',
      targetId: id,
      positiveExamples: positive,
      negativeExamples: negative,
      embedFn: this.embedFn,
      metrics,
    });
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
      // ADR-012: 用量数据随实体删除，清理事件流水与日聚合两张 TraceBase 表
      await this.relationDb.delete(USAGE_EVENT_TABLE, [
        { field: 'entity_type', operator: Operator.EQ, value: 'soul' },
        { field: 'entity_id', operator: Operator.IN, value: input.ids },
      ]);
      await this.relationDb.delete(SOUL_USAGE_ORG_TABLE, [
        { field: 'soul_id', operator: Operator.IN, value: input.ids },
      ]);
      for (const id of input.ids) {
        await deleteComponentEmbedding({
          relationDb: this.relationDb,
          table: SOUL_EMBEDDING_TABLE,
          targetIdField: 'soul_id',
          targetId: id,
        });
        await deleteComponentEmbedding({
          relationDb: this.relationDb,
          table: SOUL_EXAMPLE_EMBEDDING_TABLE,
          targetIdField: 'soul_id',
          targetId: id,
        });
      }
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
      title: patch.title,
      content: patch.soul_content,
      brief: patch.soul_brief,
      soul_usage: patch.soul_usage,
      enable: patch.enable !== undefined ? (patch.enable ? 1 : 0) : undefined,
    });

    output.affected_rows = await this.relationDb.update(SOUL_TABLE, data, conditions);

    if (patch.title !== undefined || patch.soul_brief !== undefined || patch.soul_usage !== undefined || patch.soul_content !== undefined) {
      await this.resyncSoulRows(conditions, _metrics);
    }
    if (patch.positive_examples !== undefined || patch.negative_examples !== undefined) {
      await this.resyncSoulExamples(conditions, patch, _metrics);
    }
    return true;
  }

  private async resyncSoulRows(conditions: Condition[], metrics?: Metrics): Promise<void> {
    const rows = await this.relationDb.select(SOUL_TABLE, { conditions, fields: ['id', 'title', 'brief', 'content', 'soul_usage'] });
    for (const r of rows) {
      const title = String(r.title ?? '').trim() || String(r.brief ?? '').slice(0, 10);
      await this.syncSoulVector(String(r.id), title, String(r.brief ?? ''), String(r.soul_usage ?? ''), String(r.content ?? ''), metrics);
    }
  }

  private async resyncSoulExamples(conditions: Condition[], patch: Partial<SoulData>, metrics?: Metrics): Promise<void> {
    const rows = await this.relationDb.select(SOUL_TABLE, { conditions, fields: ['id'] });
    for (const r of rows) {
      await this.syncSoulExamples(String(r.id), patch.positive_examples, patch.negative_examples, metrics);
    }
  }

  

  async soSoulById(input: GetSoulInput, output: GetSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions = resolveTargetConditions(input);
    if (!conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const row = await this.relationDb.selectOne(SOUL_TABLE, conditions);
    // ADR-012:列规范化 content/brief 后映射回对外字段名
    const mapSoulRow = (r: Record<string, unknown> | null) => r
      ? {
          ...(r as unknown as SoulRecord),
          soul_content: String(r.content ?? ''),
          soul_brief: String(r.brief ?? ''),
        }
      : null;
    output.soul = mapSoulRow(row as Record<string, unknown> | null);
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
    output.list = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
      ...(r as unknown as SoulRecord),
      soul_content: String(r.content ?? ''),
      soul_brief: String(r.brief ?? ''),
    }));
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
    const souls = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
      ...(r as unknown as SoulRecord),
      soul_content: String(r.content ?? ''),
      soul_brief: String(r.brief ?? ''),
    }));
    if (souls.length === 0) {
      output.list = [];
      output.total = 0;
      return;
    }

    const usageRows = await this.relationDb.select(SOUL_USAGE_ORG_TABLE, {});
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

  
  
  

  

  async recordSoulUsage(input: RecordSoulUsageInput, _output: RecordSoulUsageOutput, context: SoulContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.soul_id) {
      throw new ValidationError('soul_id 不能为空');
    }

    // ADR-012: 统一经 TraceService 写 usage_event_record 事件流水与 soul_usage_org 日聚合
    const usageInput = new RecordUsageInput();
    usageInput.entity_type = 'soul';
    usageInput.entity_id = input.soul_id;
    usageInput.session_id = context.session_id ?? '';
    usageInput.run_id = context.run_id ?? '';
    usageInput.work_id = context.work_id ?? '';
    usageInput.usage_context = context.caller ?? '';
    await this.trace.recordUsage(usageInput, new RecordUsageOutput(), context);
    return true;
  }
}
