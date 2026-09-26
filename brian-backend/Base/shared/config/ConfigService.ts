import type { Condition, Operator } from '../query';

export enum ValueType {
  INT = 'INT',
  DOUBLE = 'DOUBLE',
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
}

export interface ConfigItem {
  
  config_key: string;
  
  config_value: string;
  
  value_type: ValueType | string;
  
  description?: string;
}

export interface IConfigStorage {
  

  selectOne(
    table: string,
    conditions: Condition[],
  ): Promise<Record<string, unknown> | null>;

  

  select(
    table: string,
    options?: {
      conditions?: Condition[];
      order_by?: import('../query').OrderBy[];
      page?: import('../query').Page;
      fields?: string[];
    },
  ): Promise<Array<Record<string, unknown>>>;

  

  insert(
    table: string,
    data: Array<{ field: string; value: unknown }>,
  ): Promise<number>;

  

  update(
    table: string,
    data: Array<{ field: string; value: unknown }>,
    conditions: Condition[],
  ): Promise<number>;

  

  delete(table: string, conditions?: Condition[]): Promise<number>;

  

  count(table: string, conditions?: Condition[]): Promise<number>;
}

export class ConfigService {
  

  constructor(
    private readonly storage: IConfigStorage,
    private readonly table: string,
  ) {}

  

  async getString(key: string, defaultValue?: string): Promise<string | undefined> {
    const row = await this.storage.selectOne(this.table, [
      { field: 'config_key', operator: 'EQ' as Operator, value: key },
    ]);
    if (!row) {
      return defaultValue;
    }
    return String(row.config_value);
  }

  

  async getInt(key: string, defaultValue: number): Promise<number> {
    const raw = await this.getString(key);
    if (raw === undefined) {
      return defaultValue;
    }
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  

  async getDouble(key: string, defaultValue: number): Promise<number> {
    const raw = await this.getString(key);
    if (raw === undefined) {
      return defaultValue;
    }
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  

  async getBoolean(key: string, defaultValue: boolean): Promise<boolean> {
    const raw = await this.getString(key);
    if (raw === undefined) {
      return defaultValue;
    }
    return raw === 'true' || raw === '1';
  }

  

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
