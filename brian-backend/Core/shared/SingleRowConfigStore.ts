import type { RelationDBAccess, DataObject } from '@brian-agent/base';
import { IdGenerator, Operator } from '@brian-agent/base';

export interface SingleRowConfigStoreOptions<T> {
  
  table: string;
  
  toRecord: (row: Record<string, unknown>) => T;
  
  defaults: DataObject[];
}

export class SingleRowConfigStore<T> {
  
  private cache: T | null = null;

  

  constructor(
    private readonly db: RelationDBAccess,
    private readonly opts: SingleRowConfigStoreOptions<T>,
  ) {}

  

  async load(): Promise<T | null> {
    if (this.cache !== null) return this.cache;
    const row = await this.db.selectOne(this.opts.table, []);
    if (!row) {
      await this.ensureDefault();
      return this.cache;
    }
    this.cache = this.opts.toRecord(row);
    return this.cache;
  }

  

  async upsert(patch: DataObject[]): Promise<void> {
    const now = IdGenerator.now();
    const existing = await this.db.selectOne(this.opts.table, []);
    const data: DataObject[] = [...patch, { field: 'updated', value: now }];
    if (existing?.id) {
      await this.db.update(
        this.opts.table,
        data,
        [{ field: 'id', operator: Operator.EQ, value: String(existing.id) }],
      );
    } else {
      
      const pad = this.opts.defaults.filter((d) => !data.some((x) => x.field === d.field));
      await this.db.insert(this.opts.table, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        ...pad,
        ...data,
      ]);
    }
    this.cache = null;
  }

  

  
  private async ensureDefault(): Promise<void> {
    const now = IdGenerator.now();
    await this.db.insert(this.opts.table, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      ...this.opts.defaults,
    ]);
    const row = await this.db.selectOne(this.opts.table, []);
    this.cache = row ? this.opts.toRecord(row) : null;
  }
}
