/**
 * @fileoverview SoulProvider 应用服务层。
 *
 * 依赖 RelationDBAccess（通过 IConfigStorage / executeRaw）操作关系数据库，
 * 依赖 ConfigService 管理 soul_config 配置表。
 *
 * 实现所有用例：addSoul / delSoul / updateSoul / getSoul / soSoul / enableSoul。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  DatabaseError,
} from '../../shared/errors';
import { IdGenerator } from '../../shared/id/IdGenerator';
import { Operator, Logic } from '../../shared/query';
import type { Condition, DataObject, OrderBy, Page } from '../../shared/query';
import {
  SoulContext,
  SoulData,
  SoulRecord,
  AddSoulInput,
  AddSoulOutput,
  DelSoulInput,
  DelSoulOutput,
  UpdateSoulInput,
  UpdateSoulOutput,
  GetSoulInput,
  GetSoulOutput,
  SoSoulInput,
  SoSoulOutput,
  EnableSoulInput,
  EnableSoulOutput,
  CloseSoulInput,
  CloseSoulOutput,
  RecordSoulUsageInput,
  RecordSoulUsageOutput,
  SOUL_TABLE,
  SOUL_USAGE_TABLE,
  SOUL_CONFIG_TABLE,
  SOUL_DEFAULT_CONFIGS,
} from '../domain/types';

/**
 * SoulProvider 应用服务。
 *
 * SoulProvider 是 Soul 的唯一操作入口，上层不可直接操作数据库。
 */
export class SoulService {
  /** 运行时启用状态 */
  private enabled = true;

  /** 是否已执行 closeSoul（终态标记） */
  private closed = false;

  private readonly config: ConfigService;

  /**
   * @param relationDb RelationDBProvider 接入层
   */
  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, SOUL_CONFIG_TABLE);
  }

  /**
   * 初始化：写入默认配置并恢复 enabled 状态。
   */
  async initialize(): Promise<void> {
    await this.config.initDefaults([...SOUL_DEFAULT_CONFIGS]);
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  /**
   * 校验组件是否启用。
   */
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

  /**
   * 将 DataObject[] 转为 record 对象。
   */
  private toRecord(data: DataObject[]): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const d of data) {
      obj[d.field] = d.value;
    }
    return obj;
  }

  /**
   * 新增 Soul（addSoul）。
   *
   * PRD 3.1.1 条。
   */
  async addSoul(
    input: AddSoulInput,
    _context: SoulContext,
    output: AddSoulOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'soul_content', value: data.soul_content },
      { field: 'soul_brief', value: data.soul_brief },
      { field: 'soul_usage', value: data.soul_usage },
      { field: 'enable', value: data.enable !== false ? 1 : 0 },
    ];
    await this.relationDb.insert(SOUL_TABLE, dataObjects);
    output.id = id;
    return true;
  }

  /**
   * 删除 Soul（delSoul）。
   *
   * PRD 3.1.2 条：支持按 ID 批量删除或按条件删除。
   */
  async delSoul(
    input: DelSoulInput,
    _context: SoulContext,
    output: DelSoulOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    const affected = await this.relationDb.delete(SOUL_TABLE, conditions);
    output.affected_rows = affected;

    // 清理 soul_usage 表中引用该 Soul 的记录
    if (input.ids) {
      await this.relationDb.delete(SOUL_USAGE_TABLE, [
        { field: 'soul_id', operator: Operator.IN, value: input.ids },
      ]);
    }

    return true;
  }

  /**
   * 更新 Soul（updateSoul）。
   *
   * PRD 3.1.3 条：支持按 ID 或按条件更新。
   * 资源级启用/禁用通过本方法修改 enable 字段实现。
   */
  async updateSoul(
    input: UpdateSoulInput,
    _context: SoulContext,
    output: UpdateSoulOutput,
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
    if (patch.soul_content !== undefined) {
      data.push({ field: 'soul_content', value: patch.soul_content });
    }
    if (patch.soul_brief !== undefined) {
      data.push({ field: 'soul_brief', value: patch.soul_brief });
    }
    if (patch.soul_usage !== undefined) {
      data.push({ field: 'soul_usage', value: patch.soul_usage });
    }
    if (patch.enable !== undefined) {
      data.push({ field: 'enable', value: patch.enable ? 1 : 0 });
    }

    output.affected_rows = await this.relationDb.update(
      SOUL_TABLE,
      data,
      conditions,
    );
    return true;
  }

  /**
   * 获取 Soul（getSoul）。
   *
   * PRD 3.1.4 条：按 ID 或按条件获取第一条。
   */
  async getSoul(
    input: GetSoulInput,
    _context: SoulContext,
    output: GetSoulOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }

    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;

    const row = await this.relationDb.selectOne(SOUL_TABLE, conditions);
    output.soul = row ? (row as unknown as SoulRecord) : null;
    return true;
  }

  /**
   * 搜索 Soul（soSoul）。
   *
   * PRD 3.1.5 条：支持关键词、条件过滤、排序、分页。
   * 关键词匹配 soul_content 与 soul_brief。
   * 若按使用频率排序，联表查询 soul_usage 统计表。
   */
  async soSoul(
    input: SoSoulInput,
    _context: SoulContext,
    output: SoSoulOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    // 构建条件
    const conditions: Condition[] = [];

    // 若有关键词 + 用户条件同时存在，先用关键词找出匹配 ID，
    // 再与用户条件通过 IN 组合，避免 flat conditions 无法表达
    // (user_conds) AND (content LIKE ? OR brief LIKE ?) 的分组问题
    if (input.keyword) {
      const keywordRows = await this.relationDb.select(SOUL_TABLE, {
        conditions: [
          {
            field: 'soul_content',
            operator: Operator.LIKE,
            value: `%${input.keyword}%`,
          },
          {
            field: 'soul_brief',
            operator: Operator.LIKE,
            value: `%${input.keyword}%`,
            logic: Logic.OR,
          },
        ],
        fields: ['id'],
      });
      const matchedIds = keywordRows.map((r) => r.id as string);
      if (matchedIds.length === 0) {
        output.list = [];
        output.total = 0;
        return true;
      }
      conditions.push({
        field: 'id',
        operator: Operator.IN,
        value: matchedIds,
      });
    }

    if (input.conditions) {
      conditions.push(...input.conditions);
    }

    // 检查是否需要按使用频率排序
    const hasUsageSorting = input.order_by?.some(
      (ob) => typeof ob.field === 'string' && ob.field.startsWith('usage_'),
    );

    if (hasUsageSorting) {
      return this.soSoulWithUsageSorting(
        conditions.length > 0 ? conditions : undefined,
        input.order_by!,
        input.page,
        output,
      );
    }

    const rows = await this.relationDb.select(SOUL_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      SOUL_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );

    output.list = rows as unknown as SoulRecord[];
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
   * 联表查询 soul_usage，计算今日/最近7天/最近30天/总使用次数，
   * 在内存中完成排序与分页。
   */
  private async soSoulWithUsageSorting(
    conditions: Condition[] | undefined,
    orderBy: OrderBy[],
    page: Page | undefined,
    output: SoSoulOutput,
  ): Promise<boolean> {
    const today = IdGenerator.today();
    const sevenDaysAgo = this.daysAgo(7);
    const thirtyDaysAgo = this.daysAgo(30);

    // 获取基础模板列表（不含分页，后续在内存中处理）
    const rows = await this.relationDb.select(SOUL_TABLE, { conditions });
    const souls = rows as unknown as SoulRecord[];

    if (souls.length === 0) {
      output.list = [];
      output.total = 0;
      return true;
    }

    // 批量查询所有 Soul 的使用统计
    const usageRows = await this.relationDb.select(SOUL_USAGE_TABLE, {});
    const usageMap = new Map<
      string,
      { today: number; week: number; month: number; total: number }
    >();
    for (const row of usageRows) {
      const soulId = row.soul_id as string;
      const cnt = (row.usage_count as number) ?? 0;
      const date = row.usage_date as string;
      let stats = usageMap.get(soulId);
      if (!stats) {
        stats = { today: 0, week: 0, month: 0, total: 0 };
        usageMap.set(soulId, stats);
      }
      stats.total += cnt;
      if (date === today) stats.today += cnt;
      if (date >= sevenDaysAgo) stats.week += cnt;
      if (date >= thirtyDaysAgo) stats.month += cnt;
    }

    const getUsageValue = (
      soul: SoulRecord,
      field: string,
    ): number => {
      const stats = usageMap.get(soul.id);
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
    souls.sort((a, b) => {
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
          return valB === null || valB === undefined
            ? 0
            : isDesc
              ? 1
              : -1;
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
    let sliced = souls;
    if (page) {
      const start = (page.current - 1) * page.size;
      sliced = souls.slice(start, start + page.size);
    }

    output.list = sliced;
    output.total = souls.length;
    return true;
  }

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /**
   * 启用/禁用 Soul 组件（enableSoul）。
   *
   * PRD 3.2.1 条：运行时控制 Soul 组件的可用状态。
   * 状态持久化到 soul_config，组件初始化时恢复。
   *
   * 注：closeSoul 为终态操作，执行后不可通过本方法恢复，需重新初始化组件。
   */
  async enableSoul(
    input: EnableSoulInput,
    _context: SoulContext,
    _output: EnableSoulOutput,
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

  /**
   * 关闭 Soul 组件（closeSoul）。
   *
   * PRD 5.6 条：系统关闭时的终态释放，执行后不可通过 enableSoul 恢复，
   * 需重新初始化组件。
   *
   * SoulProvider 不持有独立数据库连接（使用 RelationDBProvider 的共享连接），
   * 本方法仅标记终态，后续所有操作将抛出错误。
   */
  async closeSoul(
    _input: CloseSoulInput,
    _context: SoulContext,
    _output: CloseSoulOutput,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    return true;
  }

  // -------------------------------------------------------------------------
  // Soul 使用统计
  // -------------------------------------------------------------------------

  /**
   * 记录 Soul 使用次数（recordSoulUsage）。
   *
   * 按天统计指定 Soul 的使用次数，采用 upsert 语义：
   * 若当天记录已存在则 usage_count + 1，否则新增一条记录。
   */
  async recordSoulUsage(
    input: RecordSoulUsageInput,
    _context: SoulContext,
    _output: RecordSoulUsageOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.soul_id) {
      throw new ValidationError('soul_id 不能为空');
    }

    const today = IdGenerator.today();
    const now = IdGenerator.now();

    const existing = await this.relationDb.selectOne(SOUL_USAGE_TABLE, [
      { field: 'soul_id', operator: Operator.EQ, value: input.soul_id },
      { field: 'usage_date', operator: Operator.EQ, value: today },
    ]);

    if (existing) {
      const currentCount = (existing.usage_count as number) ?? 0;
      await this.relationDb.update(
        SOUL_USAGE_TABLE,
        [
          { field: 'usage_count', value: currentCount + 1 },
          { field: 'updated', value: now },
        ],
        [
          { field: 'soul_id', operator: Operator.EQ, value: input.soul_id },
          { field: 'usage_date', operator: Operator.EQ, value: today },
        ],
      );
    } else {
      const usageId = IdGenerator.generate();
      await this.relationDb.insert(SOUL_USAGE_TABLE, [
        { field: 'id', value: usageId },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'soul_id', value: input.soul_id },
        { field: 'usage_date', value: today },
        { field: 'usage_count', value: 1 },
      ]);
    }
    return true;
  }
}
