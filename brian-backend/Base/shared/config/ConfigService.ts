/**
 * @fileoverview 配置服务。
 *
 * 各 Provider 的配置项（含启用/禁用状态、各类默认值）统一存储于关系数据库配置表
 * （如 graphdb_config、llm_config 等），采用键值对结构。
 *
 * ConfigService 封装配置的读取、写入与默认值初始化逻辑，
 * 依赖 {@link IConfigStorage} 接口（由 RelationDBProvider 的 access 层实现），
 * 避免 shared 层对具体 Provider 产生循环依赖。
 */

import type { Condition, Operator } from '../query';

/**
 * 配置值类型枚举。
 */
export enum ValueType {
  INT = 'INT',
  DOUBLE = 'DOUBLE',
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
}

/**
 * 配置项定义。
 *
 * 用于初始化默认配置。
 */
export interface ConfigItem {
  /** 配置键 */
  config_key: string;
  /** 配置值（字符串形式存储） */
  config_value: string;
  /** 值类型 */
  value_type: ValueType | string;
  /** 说明 */
  description?: string;
}

/**
 * 配置存储接口。
 *
 * 由 RelationDBProvider 的 access 层实现，提供底层的表读写能力。
 * ConfigService 通过此接口操作配置表，避免直接依赖 RelationDBProvider。
 */
export interface IConfigStorage {
  /**
   * 查询单条记录。
   *
   * @param table 表名
   * @param conditions 查询条件
   * @returns 第一条匹配记录，无匹配返回 null
   */
  selectOne(
    table: string,
    conditions: Condition[],
  ): Promise<Record<string, unknown> | null>;

  /**
   * 查询记录列表。
   *
   * @param table 表名
   * @param options 查询选项（conditions / order_by / page / fields）
   * @returns 匹配记录列表
   */
  select(
    table: string,
    options?: {
      conditions?: Condition[];
      order_by?: import('../query').OrderBy[];
      page?: import('../query').Page;
      fields?: string[];
    },
  ): Promise<Array<Record<string, unknown>>>;

  /**
   * 新增记录。
   *
   * @param table 表名
   * @param data 数据对象列表
   * @returns 影响行数
   */
  insert(
    table: string,
    data: Array<{ field: string; value: unknown }>,
  ): Promise<number>;

  /**
   * 更新记录。
   *
   * @param table 表名
   * @param data 待更新字段
   * @param conditions 更新条件
   * @returns 影响行数
   */
  update(
    table: string,
    data: Array<{ field: string; value: unknown }>,
    conditions: Condition[],
  ): Promise<number>;

  /**
   * 删除记录。
   *
   * @param table 表名
   * @param conditions 删除条件（可选，不指定则删除全表）
   * @returns 影响行数
   */
  delete(table: string, conditions?: Condition[]): Promise<number>;

  /**
   * 统计记录数。
   *
   * @param table 表名
   * @param conditions 查询条件（可选）
   * @returns 记录数
   */
  count(table: string, conditions?: Condition[]): Promise<number>;
}

/**
 * 配置服务。
 *
 * 各 Provider 在 infrastructure 层创建 ConfigService 实例，
 * 传入 IConfigStorage 实现与配置表名，即可统一管理配置项。
 *
 * 用法示例：
 * ```typescript
 * const config = new ConfigService(configStorage, 'graphdb_config');
 * await config.initDefaults(GRAPHDB_DEFAULT_CONFIGS);
 * const enabled = await config.getBoolean('enabled', true);
 * ```
 */
export class ConfigService {
  /**
   * @param storage 配置存储实现
   * @param table 配置表名（如 'graphdb_config'）
   */
  constructor(
    private readonly storage: IConfigStorage,
    private readonly table: string,
  ) {}

  /**
   * 读取配置原始字符串值。
   *
   * @param key 配置键
   * @param defaultValue 默认值（配置不存在时返回）
   * @returns 配置值字符串或默认值
   */
  async getString(key: string, defaultValue?: string): Promise<string | undefined> {
    const row = await this.storage.selectOne(this.table, [
      { field: 'config_key', operator: 'EQ' as Operator, value: key },
    ]);
    if (!row) {
      return defaultValue;
    }
    return String(row.config_value);
  }

  /**
   * 读取 INT 类型配置。
   */
  async getInt(key: string, defaultValue: number): Promise<number> {
    const raw = await this.getString(key);
    if (raw === undefined) {
      return defaultValue;
    }
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * 读取 DOUBLE 类型配置。
   */
  async getDouble(key: string, defaultValue: number): Promise<number> {
    const raw = await this.getString(key);
    if (raw === undefined) {
      return defaultValue;
    }
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * 读取 BOOLEAN 类型配置。
   */
  async getBoolean(key: string, defaultValue: boolean): Promise<boolean> {
    const raw = await this.getString(key);
    if (raw === undefined) {
      return defaultValue;
    }
    return raw === 'true' || raw === '1';
  }

  /**
   * 写入配置（upsert 语义：存在则更新，不存在则新增）。
   *
   * @param key 配置键
   * @param value 配置值
   * @param valueType 值类型
   * @param description 说明
   */
  async set(
    key: string,
    value: unknown,
    valueType: ValueType | string,
    description?: string,
  ): Promise<void> {
    const strValue = String(value);
    const exists = await this.storage.count(this.table, [
      { field: 'config_key', operator: 'EQ' as Operator, value: key },
    ]);
    const now = Date.now();

    if (exists > 0) {
      await this.storage.update(
        this.table,
        [
          { field: 'config_value', value: strValue },
          { field: 'value_type', value: valueType },
          ...(description !== undefined
            ? [{ field: 'description', value: description }]
            : []),
          { field: 'updated', value: now },
        ],
        [{ field: 'config_key', operator: 'EQ' as Operator, value: key }],
      );
    } else {
      await this.storage.insert(this.table, [
        { field: 'config_key', value: key },
        { field: 'config_value', value: strValue },
        { field: 'value_type', value: valueType },
        ...(description !== undefined
          ? [{ field: 'description', value: description }]
          : []),
        { field: 'updated', value: now },
      ]);
    }
  }

  /**
   * 初始化默认配置项。
   *
   * 仅在配置项不存在时写入，不覆盖已有值。
   *
   * @param defaults 默认配置项列表
   */
  async initDefaults(defaults: ConfigItem[]): Promise<void> {
    for (const item of defaults) {
      const exists = await this.storage.count(this.table, [
        { field: 'config_key', operator: 'EQ' as Operator, value: item.config_key },
      ]);
      if (exists === 0) {
        await this.storage.insert(this.table, [
          { field: 'config_key', value: item.config_key },
          { field: 'config_value', value: item.config_value },
          { field: 'value_type', value: item.value_type },
          ...(item.description !== undefined
            ? [{ field: 'description', value: item.description }]
            : []),
          { field: 'updated', value: Date.now() },
        ]);
      }
    }
  }
}
