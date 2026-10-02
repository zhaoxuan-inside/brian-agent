import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { ISandbox } from '../infrastructure/sandbox/ISandbox';
import { LocalSandbox } from '../infrastructure/sandbox/LocalSandbox';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
} from '../../shared/errors';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
import { TraceService, RecordUsageInput, RecordUsageOutput, USAGE_EVENT_TABLE, SKILL_USAGE_ORG_TABLE } from '../../TraceBase';
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
  SkillContext, SkillRecord, FileEntry,
  AddSkillInput, AddSkillOutput,
  GetSkillInput, GetSkillOutput,
  UpdateSkillInput, UpdateSkillOutput,
  DelSkillInput, DelSkillOutput,
  SoSkillInput, SoSkillOutput,
  ExecSkillInput, ExecSkillOutput,
  EnableSkillInput, EnableSkillOutput,
  SeedSystemSkillsInput, SeedSystemSkillsOutput,
  SKILL_TABLE, SKILL_EMBEDDING_TABLE, SKILL_EXAMPLE_EMBEDDING_TABLE, SKILL_CONFIG_TABLE,
} from '../domain/types';
import { resolveSandboxRuntime } from '../infrastructure/sandbox/SandboxRuntime';

const JS_SANDBOX_TIMEOUT_MS = 5000;
const LOCAL_SANDBOX_TIMEOUT_MS = 15000;

export class SkillService {
  private enabled = true;
  private readonly config: ConfigService;
  private readonly localSandbox: LocalSandbox;
  private readonly trace: TraceService;
  private embedFn?: (text: string, context?: Context) => Promise<number[]>;
  private semanticsFn?: SemanticsTaskFn;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly jsSandbox: ISandbox,
  ) {
    this.config = new ConfigService(relationDb, SKILL_CONFIG_TABLE);
    this.trace = new TraceService(relationDb);

    this.localSandbox = new LocalSandbox(resolveSandboxRuntime(), LOCAL_SANDBOX_TIMEOUT_MS);
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
    if (!this.enabled) {
      throw new ComponentDisabledError('Skill');
    }
  }

  private toInt(value: boolean): number {
    return value ? 1 : 0;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value === 'true' || value === '1';
    return false;
  }

  private parseFileEntries(value: unknown): FileEntry[] | undefined {
    if (value == null) return undefined;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed as FileEntry[];
      } catch {

      }
    }
    return undefined;
  }

  private serializeFileEntries(arr: FileEntry[] | undefined): string | undefined {
    if (!arr || arr.length === 0) return undefined;
    return JSON.stringify(arr);
  }

  private toSkillRecord(row: Record<string, unknown>): SkillRecord {
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      name: String(row.title ?? row.name ?? ''),
      skill_brief: String(row.brief ?? ''),
      skill_md: String(row.content ?? ''),
      scripts: this.parseFileEntries(row.scripts),
      references: this.parseFileEntries(row.references),
      assets: this.parseFileEntries(row.assets),
      enable: this.toBoolean(row.enable),
      system: this.toBoolean(row.system),
    };
  }

  async addSkill(input: AddSkillInput, output: AddSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.name) throw new ValidationError('name 为必填');
    if (!data.skill_brief) throw new ValidationError('skill_brief 为必填');
    if (!data.skill_md) throw new ValidationError('skill_md 为必填');

    const sem = await resolveComponentSemantics({
      kind: 'skill',
      source: { kind: 'skill', title: data.name, brief: data.skill_brief, content: data.skill_md },
      provided: {
        title: data.name, brief: data.skill_brief,
        positive_examples: data.positive_examples, negative_examples: data.negative_examples,
      },
      semanticsFn: this.semanticsFn,
      metrics: _metrics,
    });

    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'title', value: sem.title || data.name },
      { field: 'brief', value: sem.brief || data.skill_brief },
      { field: 'content', value: data.skill_md },
      { field: 'enable', value: this.toInt(data.enable ?? true) },
    ];
    if (data.scripts !== undefined) {
      dataObjects.push({ field: 'scripts', value: this.serializeFileEntries(data.scripts) });
    }
    if (data.references !== undefined) {
      dataObjects.push({ field: 'references', value: this.serializeFileEntries(data.references) });
    }
    if (data.assets !== undefined) {
      dataObjects.push({ field: 'assets', value: this.serializeFileEntries(data.assets) });
    }

    await this.relationDb.insert(SKILL_TABLE, dataObjects);
    output.id = id;

    await this.syncSkillVector(id, sem.title || data.name, sem.brief || data.skill_brief, _metrics);
    await this.syncSkillExamples(id, sem.positive_examples, sem.negative_examples, _metrics);
    return true;
  }

  private async syncSkillVector(id: string, name: string, brief: string, metrics?: Metrics): Promise<void> {
    const docText = buildFunnelDocText(name, brief);
    await syncComponentEmbedding({
      relationDb: this.relationDb,
      table: SKILL_EMBEDDING_TABLE,
      targetIdField: 'skill_id',
      targetId: id,
      text: docText,
      embedFn: this.embedFn,
      metrics,
    });
  }

  private async syncSkillExamples(id: string, positive: string[] | undefined, negative: string[] | undefined, metrics?: Metrics): Promise<void> {
    if (positive === undefined && negative === undefined) return;
    await syncComponentExamples({
      relationDb: this.relationDb,
      table: SKILL_EXAMPLE_EMBEDDING_TABLE,
      targetIdField: 'skill_id',
      targetId: id,
      positiveExamples: positive,
      negativeExamples: negative,
      embedFn: this.embedFn,
      metrics,
    });
  }

  async seedSystemSkills(input: SeedSystemSkillsInput, output: SeedSystemSkillsOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const specs = input.specs ?? [];
    for (const spec of specs) {
      if (!spec.id || !spec.name || !spec.skill_brief || !spec.skill_md) {
        throw new ValidationError('系统级 Skill 种子缺少 id/name/skill_brief/skill_md');
      }
      const existing = await this.relationDb.selectOne(SKILL_TABLE, [
        { field: 'id', operator: Operator.EQ, value: spec.id },
      ]);
      const now = IdGenerator.now();
      if (!existing) {
        await this.relationDb.insert(SKILL_TABLE, [
          { field: 'id', value: spec.id },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'title', value: spec.name },
          { field: 'brief', value: spec.skill_brief },
          { field: 'content', value: spec.skill_md },
          { field: 'enable', value: 1 },
          { field: 'system', value: 1 },
        ]);
        output.inserted.push(spec.id);
      } else if (!this.toBoolean(existing.system)) {

        await this.relationDb.update(SKILL_TABLE, [
          { field: 'title', value: spec.name },
          { field: 'brief', value: spec.skill_brief },
          { field: 'content', value: spec.skill_md },
          { field: 'enable', value: 1 },
          { field: 'system', value: 1 },
          { field: 'updated', value: now },
        ], [{ field: 'id', operator: Operator.EQ, value: spec.id }]);
        output.refreshed.push(spec.id);
      } else {
        await this.relationDb.update(SKILL_TABLE, [
          { field: 'title', value: spec.name },
          { field: 'brief', value: spec.skill_brief },
          { field: 'content', value: spec.skill_md },
          { field: 'updated', value: now },
        ], [{ field: 'id', operator: Operator.EQ, value: spec.id }]);
        output.refreshed.push(spec.id);
      }

      const docText = buildFunnelDocText(spec.name, spec.skill_brief);
      await syncComponentEmbedding({
        relationDb: this.relationDb,
        table: SKILL_EMBEDDING_TABLE,
        targetIdField: 'skill_id',
        targetId: spec.id,
        text: docText,
        embedFn: this.embedFn,
        metrics: _metrics,
      });
    }
    output.seeded = specs.length;
    return true;
  }

  async soSkillById(input: GetSkillInput, output: GetSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }
    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;
    const row = await this.relationDb.selectOne(SKILL_TABLE, conditions);
    output.skill = row ? this.toSkillRecord(row) : null;
    return true;
  }

  private async assertNotSystemOwned(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const rows = await this.relationDb.select(SKILL_TABLE, {
      conditions: [{ field: 'id', operator: Operator.IN, value: ids }],
      fields: ['id', 'title', 'system'],
    });
    const systemRows = rows.filter((r) => this.toBoolean(r.system));
    if (systemRows.length > 0) {
      const names = systemRows.map((r) => String(r.title || r.id)).join('、');
      throw new ValidationError(`系统级 Skill 不允许删改: ${names}`);
    }
  }

  async updateSkill(input: UpdateSkillInput, output: UpdateSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }
    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;

    if (input.id) {
      await this.assertNotSystemOwned([input.id]);
    } else {
      const rows = await this.relationDb.select(SKILL_TABLE, { conditions, fields: ['id'] });
      await this.assertNotSystemOwned(rows.map((r) => String(r.id)));
    }

    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    const patch = input.data;
    if (patch.name !== undefined) data.push({ field: 'title', value: patch.name });
    if (patch.skill_brief !== undefined) data.push({ field: 'brief', value: patch.skill_brief });
    if (patch.skill_md !== undefined) data.push({ field: 'content', value: patch.skill_md });
    if (patch.scripts !== undefined) data.push({ field: 'scripts', value: this.serializeFileEntries(patch.scripts) });
    if (patch.references !== undefined) data.push({ field: 'references', value: this.serializeFileEntries(patch.references) });
    if (patch.assets !== undefined) data.push({ field: 'assets', value: this.serializeFileEntries(patch.assets) });
    if (patch.enable !== undefined) data.push({ field: 'enable', value: this.toInt(patch.enable) });

    output.affected_rows = await this.relationDb.update(SKILL_TABLE, data, conditions);

    if (patch.name !== undefined || patch.skill_brief !== undefined) {
      const rows = await this.relationDb.select(SKILL_TABLE, { conditions, fields: ['id', 'title', 'brief'] });
      for (const r of rows) {
        await this.syncSkillVector(String(r.id), String(r.title ?? ''), String(r.brief ?? ''), _metrics);
      }
    }
    if (patch.positive_examples !== undefined || patch.negative_examples !== undefined) {
      const rows = await this.relationDb.select(SKILL_TABLE, { conditions, fields: ['id'] });
      for (const r of rows) {
        await this.syncSkillExamples(String(r.id), patch.positive_examples, patch.negative_examples, _metrics);
      }
    }
    return true;
  }

  async delSkill(input: DelSkillInput, output: DelSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    let skillIds: string[] | undefined;
    if (input.ids) {
      skillIds = input.ids;
    } else {
      const rows = await this.relationDb.select(SKILL_TABLE, {
        conditions: input.conditions,
        fields: ['id'],
      });
      skillIds = rows.map((r) => String(r.id));
    }

    await this.assertNotSystemOwned(skillIds ?? []);

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    output.affected_rows = await this.relationDb.delete(SKILL_TABLE, conditions);

    if (skillIds.length > 0) {
      // ADR-012: 用量数据随实体删除，清理事件流水与日聚合两张 TraceBase 表
      await this.relationDb.delete(USAGE_EVENT_TABLE, [
        { field: 'entity_type', operator: Operator.EQ, value: 'skill' },
        { field: 'entity_id', operator: Operator.IN, value: skillIds },
      ]);
      await this.relationDb.delete(SKILL_USAGE_ORG_TABLE, [
        { field: 'skill_id', operator: Operator.IN, value: skillIds },
      ]);
      for (const id of skillIds) {
        await deleteComponentEmbedding({
          relationDb: this.relationDb,
          table: SKILL_EMBEDDING_TABLE,
          targetIdField: 'skill_id',
          targetId: id,
        });
        await deleteComponentEmbedding({
          relationDb: this.relationDb,
          table: SKILL_EXAMPLE_EMBEDDING_TABLE,
          targetIdField: 'skill_id',
          targetId: id,
        });
      }
    }

    return true;
  }

  async soSkill(input: SoSkillInput, output: SoSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions: Condition[] = [];
    if (input.conditions) conditions.push(...input.conditions);
    if (input.keyword) {
      conditions.push({
        field: 'brief',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
      });
    }
    const rows = await this.relationDb.select(SKILL_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      SKILL_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );
    output.list = rows.map((row) => this.toSkillRecord(row));
    output.total = total;
    return true;
  }

  private scriptType(name: string): 'js' | 'py' | 'sh' | 'unknown' {
    if (name.endsWith('.js') || name.endsWith('.mjs')) return 'js';
    if (name.endsWith('.py') || name.endsWith('.py3')) return 'py';
    if (name.endsWith('.sh') || name.endsWith('.bash')) return 'sh';
    return 'unknown';
  }

  private async executeScripts(
    scripts: FileEntry[],
    params: Record<string, unknown>,
  ): Promise<unknown> {
    let lastResult: unknown = null;

    for (const file of scripts) {
      const type = this.scriptType(file.name);

      if (type === 'js') {
        const r = await this.jsSandbox.execute(file.content, params, JS_SANDBOX_TIMEOUT_MS);
        lastResult = r.result;
      } else if (type === 'py' || type === 'sh') {
        const r = this.localSandbox.execute(file.content, type, params);
        lastResult = r.stdout;
      } else {
        throw new ValidationError(`不支持的脚本类型: ${file.name}`);
      }
    }

    return lastResult;
  }

  async execSkill(input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) throw new ValidationError('id 为必填');
    if (input.params === undefined || input.params === null) {
      throw new ValidationError('params 为必填');
    }

    const row = await this.relationDb.selectOne(SKILL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!row) throw new NotFoundError('Skill', input.id);

    const skill = this.toSkillRecord(row);
    if (!skill.enable) throw new ValidationError(`Skill 已禁用: ${input.id}`);

    if (!skill.scripts || skill.scripts.length === 0) {
      throw new ValidationError('Skill 没有可执行的脚本（scripts/ 为空）');
    }

    const result = await this.executeScripts(skill.scripts, input.params);
    await this.upsertSkillUsage(input.id, context);

    output.result = result;
    return true;
  }

  /** ADR-012: 统一经 TraceService 写 usage_event_record 事件流水与 skill_usage_org 日聚合 */
  private async upsertSkillUsage(skillId: string, context: SkillContext): Promise<void> {
    const usageInput = new RecordUsageInput();
    usageInput.entity_type = 'skill';
    usageInput.entity_id = skillId;
    usageInput.session_id = context.session_id ?? '';
    usageInput.run_id = context.run_id ?? '';
    usageInput.work_id = context.work_id ?? '';
    usageInput.usage_context = context.caller ?? '';
    await this.trace.recordUsage(usageInput, new RecordUsageOutput(), context);
  }

  async enableSkill(input: EnableSkillInput, _output: EnableSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.enabled = input.enable;
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      'Skill 组件是否启用（enableSkill 读写）',
    );
    return true;
  }
}
