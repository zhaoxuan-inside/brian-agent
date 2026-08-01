/**
 * @fileoverview SkillProvider 应用服务层。
 *
 * 依赖 RelationDBAccess（通过 IConfigStorage / executeRaw）操作关系数据库，
 * 依赖 ConfigService 管理 skill_config 配置表。
 *
 * 实现所有用例：addSkill / getSkill / updateSkill / delSkill / soSkill / execSkill / enableSkill。
 *
 * execSkill 通过 ISandbox 接口在沙箱中执行 Skill 的操作指南（work），
 * 沙箱实现由外部注入（默认使用 isolated-vm），便于灵活切换。
 * 执行成功后更新 skill_usage 表当天的 usage_count。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { ISandbox } from '../infrastructure/sandbox/ISandbox';
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

/**
 * 沙箱执行超时时间（毫秒）。
 *
 * 防止恶意或异常脚本长时间阻塞事件循环。
 */
const SANDBOX_TIMEOUT_MS = 5000;

/**
 * SkillProvider 应用服务。
 *
 * SkillProvider 是 Skill 的唯一操作入口，上层不可直接操作数据库。
 */
export class SkillService {
  /** 运行时启用状态（组件级，由 enableSkill 控制） */
  private enabled = true;

  private readonly config: ConfigService;

  /**
   * @param relationDb RelationDBProvider 接入层
   * @param sandbox 沙箱执行实例（默认使用 isolated-vm）
   */
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly sandbox: ISandbox,
  ) {
    this.config = new ConfigService(relationDb, SKILL_CONFIG_TABLE);
  }

  /**
   * 初始化：写入默认配置并恢复 enabled 状态。
   *
   * 组件初始化时从 skill_config 读取 enabled 状态以恢复上次的可用状态，
   * 避免状态丢失。
   */
  async initialize(): Promise<void> {
    await this.config.initDefaults([...SKILL_DEFAULT_CONFIGS]);
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  /**
   * 校验组件是否启用。
   */
  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new ComponentDisabledError('Skill');
    }
  }

  /**
   * 将布尔值转为 SQLite 存储的整数（0/1）。
   */
  private toInt(value: boolean): number {
    return value ? 1 : 0;
  }

  /**
   * 将 SQLite 读取的值转为布尔值。
   *
   * 兼容 INTEGER（0/1）、STRING（"true"/"1"）、BOOLEAN 三种存储形式。
   */
  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      return value === 'true' || value === '1';
    }
    return false;
  }

  /**
   * 将数据库行转为 SkillRecord 对象。
   *
   * 负责将 enable 字段从 INTEGER（0/1）还原为布尔值，
   * 并将可选字段在为空时置为 undefined。
   */
  private toSkillRecord(row: Record<string, unknown>): SkillRecord {
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      skill_brief: String(row.skill_brief),
      work: String(row.work),
      scripts: row.scripts != null ? String(row.scripts) : undefined,
      references: row.references != null ? String(row.references) : undefined,
      assets: row.assets != null ? String(row.assets) : undefined,
      enable: this.toBoolean(row.enable),
    };
  }

  // -------------------------------------------------------------------------
  // Skill 管理
  // -------------------------------------------------------------------------

  /**
   * 新增 Skill（addSkill）。
   *
   * PRD 3.1.1 条：接收 Skill 数据，通过 RelationDBProvider 写入 skill 表，
   * 生成唯一 id，初始化系统字段 created / updated。
   */
  async addSkill(
    input: AddSkillInput,
    _context: SkillContext,
    output: AddSkillOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.skill_brief) {
      throw new ValidationError('skill_brief 为必填');
    }
    if (!data.work) {
      throw new ValidationError('work 为必填');
    }

    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'skill_brief', value: data.skill_brief },
      { field: 'work', value: data.work },
      { field: 'enable', value: this.toInt(data.enable ?? true) },
    ];
    if (data.scripts !== undefined) {
      dataObjects.push({ field: 'scripts', value: data.scripts });
    }
    if (data.references !== undefined) {
      dataObjects.push({ field: 'references', value: data.references });
    }
    if (data.assets !== undefined) {
      dataObjects.push({ field: 'assets', value: data.assets });
    }

    await this.relationDb.insert(SKILL_TABLE, dataObjects);
    output.id = id;
    return true;
  }

  /**
   * 获取 Skill（getSkill）。
   *
   * PRD 3.1.2 条：按 ID 或按条件获取第一条，无匹配返回空。
   */
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

  /**
   * 更新 Skill（updateSkill）。
   *
   * PRD 3.1.3 条：支持按 ID 或按条件更新，更新 updated 为当前时间戳。
   * 资源级启用/禁用通过本方法修改 enable 字段实现。
   */
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
    if (patch.skill_brief !== undefined) {
      data.push({ field: 'skill_brief', value: patch.skill_brief });
    }
    if (patch.work !== undefined) {
      data.push({ field: 'work', value: patch.work });
    }
    if (patch.scripts !== undefined) {
      data.push({ field: 'scripts', value: patch.scripts });
    }
    if (patch.references !== undefined) {
      data.push({ field: 'references', value: patch.references });
    }
    if (patch.assets !== undefined) {
      data.push({ field: 'assets', value: patch.assets });
    }
    if (patch.enable !== undefined) {
      data.push({ field: 'enable', value: this.toInt(patch.enable) });
    }

    output.affected_rows = await this.relationDb.update(
      SKILL_TABLE,
      data,
      conditions,
    );
    return true;
  }

  /**
   * 删除 Skill（delSkill）。
   *
   * PRD 3.1.4 条：支持按 ID 批量删除或按条件删除。
   * 删除 Skill 后同步清理 skill_usage 表中引用该 Skill 的记录（skill_id 命中）。
   */
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

    const affected = await this.relationDb.delete(SKILL_TABLE, conditions);
    output.affected_rows = affected;

    if (skillIds.length > 0) {
      await this.relationDb.delete(SKILL_USAGE_TABLE, [
        { field: 'skill_id', operator: Operator.IN, value: skillIds },
      ]);
    }

    return true;
  }

  /**
   * 搜索 Skill（soSkill）。
   *
   * PRD 3.1.5 条：支持关键词（匹配 skill_brief）、条件过滤、排序、分页。
   */
  async soSkill(
    input: SoSkillInput,
    _context: SkillContext,
    output: SoSkillOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    // 构建条件
    const conditions: Condition[] = [];
    if (input.conditions) {
      conditions.push(...input.conditions);
    }
    if (input.keyword) {
      // 关键词匹配 skill_brief
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

  /**
   * 执行 Skill（execSkill）。
   *
   * PRD 3.2.1 条：在沙箱中执行指定的 Skill。
   *
   * 处理流程：
   * 1. 根据 ID 获取 Skill 信息，校验存在性与启用状态；
   * 2. 通过 ISandbox 接口在沙箱中执行 Skill 的操作指南（work）；
   *    沙箱实现由外部注入，默认使用 isolated-vm 提供进程级隔离；
   * 3. 执行成功后，通过 RelationDBProvider 更新 skill_usage 表当天的 usage_count + 1；
   *
   * 沙箱内可用变量：
   * - params：调用方传入的执行参数；
   * - result：脚本执行后需将结果写入此变量，由 output 回传；
   * - console.log：空实现，避免沙箱输出污染主进程。
   */
  async execSkill(
    input: ExecSkillInput,
    _context: SkillContext,
    output: ExecSkillOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 为必填');
    }
    if (input.params === undefined || input.params === null) {
      throw new ValidationError('params 为必填');
    }

    // 1. 根据 ID 获取 Skill 信息
    const row = await this.relationDb.selectOne(SKILL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!row) {
      throw new NotFoundError('Skill', input.id);
    }
    const skill = this.toSkillRecord(row);
    if (!skill.enable) {
      throw new ValidationError(`Skill 已禁用: ${input.id}`);
    }

    // 2. 在沙箱中执行 Skill 的操作指南
    const sandboxResult = await this.sandbox.execute(
      skill.work,
      input.params,
      SANDBOX_TIMEOUT_MS,
    );

    // 3. 执行成功后更新 skill_usage 表当天的 usage_count
    await this.upsertSkillUsage(input.id);

    output.result = sandboxResult.result;
    return true;
  }

  /**
   * 更新（upsert）skill_usage 表当天的使用次数。
   *
   * 检查当天是否已有使用记录：
   * - 已有：usage_count + 1 并更新 updated 时间戳；
   * - 无：新建一条当天记录，usage_count 初始为 1。
   */
  private async upsertSkillUsage(skillId: string): Promise<void> {
    const today = IdGenerator.today();
    const now = IdGenerator.now();

    const existing = await this.relationDb.selectOne(SKILL_USAGE_TABLE, [
      { field: 'skill_id', operator: Operator.EQ, value: skillId },
      { field: 'usage_date', operator: Operator.EQ, value: today },
    ]);

    if (existing) {
      const newCount = (Number(existing.usage_count) || 0) + 1;
      await this.relationDb.update(
        SKILL_USAGE_TABLE,
        [
          { field: 'usage_count', value: newCount },
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

  /**
   * 启用/禁用 Skill 组件（enableSkill）。
   *
   * PRD 3.3.1 条：运行时控制 Skill 组件的可用状态。
   * 状态持久化到 skill_config，组件初始化时恢复。
   *
   * - 禁用时：所有 Skill 操作将返回失败（Skill 组件未启用）；
   * - 启用时：恢复可用状态，沙箱执行环境随调用按需重建。
   */
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
