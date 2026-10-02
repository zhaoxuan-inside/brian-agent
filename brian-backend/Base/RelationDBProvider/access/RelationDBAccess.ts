import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import { SQLiteRelationDBRepository } from '../infrastructure/SQLiteRelationDBRepository';
import type { SQLiteRelationDBOptions } from '../infrastructure/SQLiteRelationDBRepository';
import { RelationDBService } from '../application/RelationDBService';
import {
  DBContext,
  InsertDBInput,
  InsertDBOutput,
  DeleteDBInput,
  DeleteDBOutput,
  UpdateDBInput,
  UpdateDBOutput,
  SelectDBInput,
  SelectDBOutput,
  SelectOneDBInput,
  SelectOneDBOutput,
  CountDBInput,
  CountDBOutput,
  TransactionDBInput,
  TransactionDBOutput,
  VisualizedDBInput,
  VisualizedDBOutput,
  EnableDBInput,
  EnableDBOutput,
  CloseDBInput,
  CloseDBOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';
import type { IConfigStorage } from '../../shared/config/ConfigService';
import type { Condition } from '../../shared/query';

export class RelationDBAccess implements IConfigStorage {
  private readonly repository: SQLiteRelationDBRepository;
  private readonly service: RelationDBService;

  

  constructor(
    options: SQLiteRelationDBOptions,
    logger?: Logger,
  ) {
    this.repository = new SQLiteRelationDBRepository(options);
    const rawService = new RelationDBService(this.repository);
    
    this.service = AopProxy.wrap(rawService, { logger });
  }

  

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  
  

  
  async insertDB(input: InsertDBInput, output: InsertDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.insertDB(input, output, context, metrics, report);
  }

  
  async deleteDB(input: DeleteDBInput, output: DeleteDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.deleteDB(input, output, context, metrics, report);
  }

  
  async updateDB(input: UpdateDBInput, output: UpdateDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateDB(input, output, context, metrics, report);
  }

  
  async selectDB(input: SelectDBInput, output: SelectDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.selectDB(input, output, context, metrics, report);
  }

  
  async selectOneDB(input: SelectOneDBInput, output: SelectOneDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.selectOneDB(input, output, context, metrics, report);
  }

  
  async countDB(input: CountDBInput, output: CountDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.countDB(input, output, context, metrics, report);
  }

  
  async transactionDB(input: TransactionDBInput, output: TransactionDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.transactionDB(input, output, context, metrics, report);
  }

  
  
  

  
  async visualizedDB(input: VisualizedDBInput, output: VisualizedDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.visualizedDB(input, output, context, metrics, report);
  }

  
  async enableDB(input: EnableDBInput, output: EnableDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableDB(input, output, context, metrics, report);
  }

  
  async closeDB(input: CloseDBInput, output: CloseDBOutput, context: DBContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.closeDB(input, output, context, metrics, report);
  }

  
  
  

  
  async selectOne(
    table: string,
    conditions: Condition[],
  ): Promise<Record<string, unknown> | null> {
    const output = new SelectOneDBOutput();
    const ok = await this.service.selectOneDB(
      { query_param: { table, conditions } },
      output, new DBContext(),
    );
    return ok ? output.row : null;
  }

  

  async select(
    table: string,
    options?: {
      conditions?: Condition[];
      order_by?: import('../../shared/query').OrderBy[];
      page?: import('../../shared/query').Page;
      fields?: string[];
    },
  ): Promise<Array<Record<string, unknown>>> {
    const output = new SelectDBOutput();
    await this.service.selectDB(
      {
        query_param: {
          table,
          conditions: options?.conditions,
          order_by: options?.order_by,
          page: options?.page,
          fields: options?.fields,
        },
      },
      output, new DBContext(),
    );
    return output.rows;
  }

  
  async insert(
    table: string,
    data: Array<{ field: string; value: unknown }>,
  ): Promise<number> {
    const output = new InsertDBOutput();
    await this.service.insertDB({ table, data }, output, new DBContext());
    return output.affected_rows;
  }

  
  async update(
    table: string,
    data: Array<{ field: string; value: unknown }>,
    conditions: Condition[],
  ): Promise<number> {
    const output = new UpdateDBOutput();
    await this.service.updateDB(
      { table, data, conditions },
      output, new DBContext(),
    );
    return output.affected_rows;
  }

  

  async delete(table: string, conditions?: Condition[]): Promise<number> {
    const output = new DeleteDBOutput();
    await this.service.deleteDB(
      { table, conditions },
      output, new DBContext(),
    );
    return output.affected_rows;
  }

  
  async count(table: string, conditions?: Condition[]): Promise<number> {
    const output = new CountDBOutput();
    await this.service.countDB({ table, conditions }, output, new DBContext());
    return output.count;
  }

  

  executeRaw(sql: string, params?: unknown[]): number {
    return this.repository.executeRaw(sql, params);
  }

  

  queryRaw<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): T[] {
    return this.repository.queryRaw<T>(sql, params);
  }

  /**
   * ADR-012:业务键列为 UNIQUE NOT NULL 时 SQLite 禁止 DROP COLUMN——整表重建去掉 legacyKey 列。
   * 调用方需先 UPDATE "id"="legacyKey" 同步数据;普通索引由调用方后续 CREATE INDEX IF NOT EXISTS 重建。
   * 返回 true=已重建,false=列不存在或重建失败(保留旧表)。
   */
  rebuildTableWithoutColumn(table: string, legacyKey: string): boolean {
    const info = this.queryRaw<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }>(`PRAGMA table_info("${table}")`);
    if (!(info ?? []).some((c) => c.name === legacyKey)) return false;
    const keep = info.filter((c) => c.name !== legacyKey);
    const ddl = keep.map((c) => {
      let s = `"${c.name}" ${c.type || 'TEXT'}`;
      if (c.notnull) s += ' NOT NULL';
      if (c.dflt_value !== null && c.dflt_value !== undefined) s += ` DEFAULT ${c.dflt_value}`;
      if (c.pk) s += ' PRIMARY KEY';
      return s;
    }).join(', ');
    try {
      const uniques = this.legacySafeUniqueIndexes(table, legacyKey);
      this.executeRaw(`CREATE TABLE "${table}_mig" (${ddl})`);
      const names = keep.map((c) => `"${c.name}"`).join(', ');
      this.executeRaw(`INSERT INTO "${table}_mig" (${names}) SELECT ${names} FROM "${table}"`);
      this.executeRaw(`DROP TABLE "${table}"`);
      this.executeRaw(`ALTER TABLE "${table}_mig" RENAME TO "${table}"`);
      for (const sql of uniques) this.executeRaw(sql);
      return true;
    } catch {
      try { this.executeRaw(`DROP TABLE IF EXISTS "${table}_mig"`); } catch { /* 忽略回滚失败 */ }
      return false;
    }
  }

  /** 收集旧表中不依赖 legacyKey 的 UNIQUE 约束重建语句(内联 UNIQUE 随 DROP TABLE 消失) */
  private legacySafeUniqueIndexes(table: string, legacyKey: string): string[] {
    try {
      const out: string[] = [];
      for (const idx of this.queryRaw<{ name: string; origin: string }>(`PRAGMA index_list("${table}")`)) {
        if (idx.origin !== 'u') continue;
        const cols = this.queryRaw<{ name: string }>(`PRAGMA index_info("${idx.name}")`).map((c) => c.name);
        if (cols.includes(legacyKey)) continue;
        out.push(`CREATE UNIQUE INDEX IF NOT EXISTS "${idx.name}" ON "${table}" (${cols.map((c) => `"${c}"`).join(', ')})`);
      }
      return out;
    } catch { return []; }
  }

  

  transactionRaw(operations: import('../../shared/query').Operation[]): boolean {
    return this.repository.transaction(operations);
  }

  

  walCheckpoint(mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'PASSIVE'): { busy: boolean; log: number; checkpointed: number } {
    return this.repository.walCheckpoint(mode);
  }
}
