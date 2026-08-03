/**
 * @fileoverview SkillProvider 应用服务层。
 *
 * 依赖 RelationDBAccess（通过 IConfigStorage / executeRaw）操作关系数据库，
 * 依赖 ConfigService 管理 skill_config 配置表。
 *
 * 实现所有用例：addSkill / getSkill / updateSkill / delSkill / soSkill / execSkill / enableSkill。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { ISandbox } from '../infrastructure/sandbox/ISandbox';
import { LocalSandbox } from '../infrastructure/sandbox/LocalSandbox';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
} from '../../shared/errors';
import { IdGenerator } from '../../shared/id/IdGenerator';
import { Operator } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
import {
  SkillContext,
  SkillData,
  SkillRecord,
  FileEntry,
  AddSkillInput,
  AddSkillOutput,
  GetSkillInput,
  GetSkillOutput,
  UpdateSkillInput,
  UpdateSkillOutput,
  DelSkillInput,
  DelSkillOutput,
  SoSkillInput,
  SoSkillOutput,
  ExecSkillInput,
  ExecSkillOutput,
  EnableSkillInput,
  EnableSkillOutput,
  SKILL_TABLE,
  SKILL_USAGE_TABLE,
  SKILL_CONFIG_TABLE,
  SKILL_DEFAULT_CONFIGS,
} from '../domain/types';

const JS_SANDBOX_TIMEOUT_MS = 5000;
const LOCAL_SANDBOX_TIMEOUT_MS = 15000;

export class SkillService {
  private enabled = true;
  private readonly config: ConfigService;
  private readonly localSandbox: LocalSandbox;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly jsSandbox: ISandbox,
  ) {
    this.config = new ConfigService(relationDb, SKILL_CONFIG_TABLE);
    this.localSandbox = new LocalSandbox(LOCAL_SANDBOX_TIMEOUT_MS);
  }

  async initialize(): Promise<void> {
    await this.config.initDefaults([...SKILL_DEFAULT_CONFIGS]);
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
      } catch { /* fall through */ }
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
      name: String(row.name),
      skill_brief: String(row.skill_brief),
      skill_md: String(row.skill_md ?? ''),
      scripts: this.parseFileEntries(row.scripts),
      references: this.parseFileEntries(row.references),
      assets: this.parseFileEntries(row.assets),
      enable: this.toBoolean(row.enable),
    };
  }

  // -------------------------------------------------------------------------
  // Skill 管理
  // -------------------------------------------------------------------------

  async addSkill(
    input: AddSkillInput,
    _context: SkillContext,
    output: AddSkillOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.name) throw new ValidationError('name 为必填');
    if (!data.skill_brief) throw new ValidationError('skill_brief 为必填');
    if (!data.skill_md) throw new ValidationError('skill_md 为必填');

    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'name', value: data.name },
      { field: 'skill_brief', value: data.skill_brief },
      { field: 'skill_md', value: data.skill_md },
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
    return true;
  }

  async getSkill(
    input: GetSkillInput,
    _context: SkillContext,
    output: GetSkillOutput,
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

  async updateSkill(
    input: UpdateSkillInput,
    _context: SkillContext,
    output: UpdateSkillOutput,
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
    if (patch.name !== undefined) data.push({ field: 'name', value: patch.name });
    if (patch.skill_brief !== undefined) data.push({ field: 'skill_brief', value: patch.skill_brief });
    if (patch.skill_md !== undefined) data.push({ field: 'skill_md', value: patch.skill_md });
    if (patch.scripts !== undefined) data.push({ field: 'scripts', value: this.serializeFileEntries(patch.scripts) });
    if (patch.references !== undefined) data.push({ field: 'references', value: this.serializeFileEntries(patch.references) });
    if (patch.assets !== undefined) data.push({ field: 'assets', value: this.serializeFileEntries(patch.assets) });
    if (patch.enable !== undefined) data.push({ field: 'enable', value: this.toInt(patch.enable) });

    output.affected_rows = await this.relationDb.update(SKILL_TABLE, data, conditions);
    return true;
  }

  async delSkill(
    input: DelSkillInput,
    _context: SkillContext,
    output: DelSkillOutput,
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

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    output.affected_rows = await this.relationDb.delete(SKILL_TABLE, conditions);

    if (skillIds.length > 0) {
      await this.relationDb.delete(SKILL_USAGE_TABLE, [
        { field: 'skill_id', operator: Operator.IN, value: skillIds },
      ]);
    }

    return true;
  }

  async soSkill(
    input: SoSkillInput,
    _context: SkillContext,
    output: SoSkillOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions: Condition[] = [];
    if (input.conditions) conditions.push(...input.conditions);
    if (input.keyword) {
      conditions.push({
        field: 'skill_brief',
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

  // -------------------------------------------------------------------------
  // Skill 执行
  // -------------------------------------------------------------------------

  /** 判断脚本类型 */
  private scriptType(name: string): 'js' | 'py' | 'sh' | 'unknown' {
    if (name.endsWith('.js') || name.endsWith('.mjs')) return 'js';
    if (name.endsWith('.py') || name.endsWith('.py3')) return 'py';
    if (name.endsWith('.sh') || name.endsWith('.bash')) return 'sh';
    return 'unknown';
  }

  /**
   * 按顺序执行 scripts/ 中的所有脚本。
   *
   * - .js → IsolatedVMSandbox（独立 V8 Isolate，128MB 内存限制，无 IO）
   * - .py → LocalSandbox（独立临时目录 subprocess，超时 15s）
   * - .sh → LocalSandbox（独立临时目录 subprocess，超时 15s）
   *
   * 所有脚本均在沙箱中执行。返回最后一个脚本的结果。
   */
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

  async execSkill(
    input: ExecSkillInput,
    _context: SkillContext,
    output: ExecSkillOutput,
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
    await this.upsertSkillUsage(input.id);

    output.result = result;
    return true;
  }

  private async upsertSkillUsage(skillId: string): Promise<void> {
    const today = IdGenerator.today();
    const now = IdGenerator.now();

    const existing = await this.relationDb.selectOne(SKILL_USAGE_TABLE, [
      { field: 'skill_id', operator: Operator.EQ, value: skillId },
      { field: 'usage_date', operator: Operator.EQ, value: today },
    ]);
    if (existing) {
      await this.relationDb.update(
        SKILL_USAGE_TABLE,
        [
          { field: 'usage_count', value: (Number(existing.usage_count) || 0) + 1 },
          { field: 'updated', value: now },
        ],
        [
          { field: 'skill_id', operator: Operator.EQ, value: skillId },
          { field: 'usage_date', operator: Operator.EQ, value: today },
        ],
      );
    } else {
      await this.relationDb.insert(SKILL_USAGE_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'skill_id', value: skillId },
        { field: 'usage_date', value: today },
        { field: 'usage_count', value: 1 },
      ]);
    }
  }

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  async enableSkill(
    input: EnableSkillInput,
    _context: SkillContext,
    _output: EnableSkillOutput,
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
