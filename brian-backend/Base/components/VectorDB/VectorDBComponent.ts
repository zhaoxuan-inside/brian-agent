/**
 * @fileoverview VectorDB 数据库组件（LanceDB 后端）。
 *
 * 基于 @lancedb/lancedb 提供向量数据存储与相似度搜索能力。
 * LanceDB 是列式向量数据库，基于 Lance 格式，支持原生 ANN 搜索。
 */

import * as lancedb from '@lancedb/lancedb';
import type { Connection, Table } from '@lancedb/lancedb';
import { existsSync, mkdirSync, statSync, readdirSync } from 'fs';
import { DatabaseError } from '../../shared/errors';

const VECTOR_RECORD_TABLE = 'vector_record';

export interface VectorRecord {
  id: string;
  content: string;
  embedding: number[];
  user_id: string | null;
  metadata: Record<string, unknown> | null;
  created: number;
  updated: number;
}

export interface VectorSearchHit {
  id: string;
  content: string;
  similarity: number;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface VectorFilter {
  field: string;
  operator: string;
  value?: unknown;
  logic?: string;
}

type LanceDBDistanceType = 'l2' | 'cosine' | 'dot';

export class VectorDBComponent {
  private lancePath: string;
  private conn: Connection | null = null;
  private table: Table | null = null;
  private dimension = 0;
  private metric = 'cosine';
  private initialized = false;

  constructor(lancePath: string) {
    this.lancePath = lancePath;
    const dir = this.lancePath;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  async init(dimension: number, metric: string = 'cosine'): Promise<void> {
    this.dimension = dimension;
    this.metric = metric;

    this.conn = await lancedb.connect(this.lancePath);

    const tables = await this.conn.tableNames();
    if (tables.includes(VECTOR_RECORD_TABLE)) {
      this.table = await this.conn.openTable(VECTOR_RECORD_TABLE);
    } else {
      const placeholder = {
        id: '__placeholder__',
        content: '',
        embedding: new Array(dimension).fill(0),
        user_id: '__placeholder__',
        metadata: '{}',
        created: 0,
        updated: 0,
      };
      this.table = await this.conn.createTable(VECTOR_RECORD_TABLE, [placeholder]);
      await this.table.delete("id = '__placeholder__'");
    }

    this.initialized = true;
  }

  private ensureInit(): void {
    if (!this.initialized || !this.table) {
      throw new DatabaseError('VectorDB 组件未初始化，请先调用 init(dimension, metric)');
    }
  }

  private getTable(): Table {
    this.ensureInit();
    return this.table!;
  }

  private rowToRecord(row: Record<string, unknown>): VectorRecord {
    return {
      id: String(row.id ?? ''),
      content: String(row.content ?? ''),
      embedding: this.parseEmbedding(row.embedding),
      user_id: row.user_id != null ? String(row.user_id) : null,
      metadata: this.parseMetadata(row.metadata),
      created: Number(row.created ?? 0),
      updated: Number(row.updated ?? 0),
    };
  }

  private parseEmbedding(value: unknown): number[] {
    if (value === null || value === undefined) return [];
    if (value instanceof Float32Array || value instanceof Float64Array) {
      return Array.from(value);
    }
    if (value instanceof ArrayBuffer) {
      return Array.from(new Float32Array(value));
    }
    if (Array.isArray(value)) return value.map((v: unknown) => Number(v));
    if (typeof value === 'object' && value !== null) {
      return Array.from(value as Iterable<number>).map(Number);
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map((v: unknown) => Number(v));
      } catch { /* ignore */ }
    }
    return [];
  }

  private parseMetadata(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof ArrayBuffer)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch { /* ignore */ }
    }
    return null;
  }

  private metadataToStored(meta: Record<string, unknown> | null): string | null {
    return meta ? JSON.stringify(meta) : null;
  }

  private getFieldValue(
    record: { user_id: string | null; metadata: Record<string, unknown> | null },
    field: string,
  ): unknown {
    if (field === 'user_id') return record.user_id;
    return record.metadata ? record.metadata[field] : undefined;
  }

  private matchFilter(
    record: { user_id: string | null; metadata: Record<string, unknown> | null },
    filter: VectorFilter,
  ): boolean {
    const value = this.getFieldValue(record, filter.field);
    const op = filter.operator;
    const target = filter.value;
    switch (op) {
      case 'EQ': return value === target;
      case 'NE': return value !== target;
      case 'GT': return typeof value === 'number' && typeof target === 'number' && value > target;
      case 'LT': return typeof value === 'number' && typeof target === 'number' && value < target;
      case 'GE': return typeof value === 'number' && typeof target === 'number' && value >= target;
      case 'LE': return typeof value === 'number' && typeof target === 'number' && value <= target;
      case 'IN': return Array.isArray(target) && target.includes(value);
      case 'NOT_IN': return Array.isArray(target) && !target.includes(value);
      case 'IS_NULL': return value === null || value === undefined;
      case 'IS_NOT_NULL': return value !== null && value !== undefined;
      default: return false;
    }
  }

  private matchFilters(
    record: { user_id: string | null; metadata: Record<string, unknown> | null },
    filters: VectorFilter[],
  ): boolean {
    if (filters.length === 0) return true;
    let result = this.matchFilter(record, filters[0]);
    for (let i = 1; i < filters.length; i++) {
      const logic = filters[i].logic || 'AND';
      if (logic === 'OR') result = result || this.matchFilter(record, filters[i]);
      else result = result && this.matchFilter(record, filters[i]);
    }
    return result;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  private euclideanSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    const distance = Math.sqrt(sum);
    return 1 / (1 + distance);
  }

  private dotSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  private computeSimilarity(a: number[], b: number[]): number {
    if (this.metric === 'cosine') return this.cosineSimilarity(a, b);
    if (this.metric === 'euclidean') return this.euclideanSimilarity(a, b);
    if (this.metric === 'dot') return this.dotSimilarity(a, b);
    return this.cosineSimilarity(a, b);
  }

  private distanceTypeForLanceDB(): LanceDBDistanceType {
    if (this.metric === 'euclidean') return 'l2';
    if (this.metric === 'dot') return 'dot';
    return 'cosine';
  }

  private buildUserWhere(userIds: string[]): string | null {
    const ids = userIds.filter(Boolean);
    if (ids.length === 0) return null;
    if (ids.length === 1) return `user_id = '${ids[0].replace(/'/g, "''")}'`;
    return `user_id IN (${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ')})`;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async upsert(record: VectorRecord): Promise<void> {
    const tbl = this.getTable();

    try {
      await tbl.delete(`id = '${record.id.replace(/'/g, "''")}'`);
    } catch { /* ignore if row doesn't exist */ }

    const data = [{
      id: record.id,
      content: record.content,
      embedding: record.embedding,
      user_id: record.user_id ?? null,
      metadata: this.metadataToStored(record.metadata),
      created: record.created,
      updated: record.updated,
    }];

    await tbl.add(data);
  }

  async get(id: string): Promise<VectorRecord | null> {
    const safeId = id.replace(/'/g, "''");
    const results = await this.getTable()
      .query()
      .where(`id = '${safeId}'`)
      .limit(1)
      .toArray();

    if (results.length === 0) return null;
    return this.rowToRecord(results[0]);
  }

  async delete(id: string): Promise<void> {
    const safeId = id.replace(/'/g, "''");
    await this.getTable().delete(`id = '${safeId}'`);
  }

  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const tbl = this.getTable();
    let count = 0;
    for (const id of ids) {
      try {
        await tbl.delete(`id = '${id.replace(/'/g, "''")}'`);
        count++;
      } catch { /* ignore */ }
    }
    return count;
  }

  async getAll(filters?: VectorFilter[]): Promise<VectorRecord[]> {
    const rows = await this.getTable().query().toArray();
    let records = rows.map((r: Record<string, unknown>) => this.rowToRecord(r));

    if (filters && filters.length > 0) {
      records = records.filter((r) => this.matchFilters(r, filters));
    }

    return records;
  }

  async count(filters?: VectorFilter[]): Promise<number> {
    if (!filters || filters.length === 0) {
      return await this.getTable().countRows();
    }

    const records = await this.getAll(filters);
    return records.length;
  }

  async deleteByFilter(filters: VectorFilter[]): Promise<number> {
    const matched = await this.getAll(filters);
    const ids = matched.map((r) => r.id);
    if (ids.length === 0) return 0;
    return this.deleteMany(ids);
  }

  async search(
    queryVector: number[],
    topK: number,
    threshold: number,
    filters?: VectorFilter[],
  ): Promise<VectorSearchHit[]> {
    const tbl = this.getTable();

    const hasMetadataFilter = filters && filters.some(
      (f) => f.field !== 'user_id',
    );

    if (hasMetadataFilter) {
      const rows = await tbl.query().toArray();
      const records = rows.map((r: Record<string, unknown>) => this.rowToRecord(r));

      const filtered = records.filter((r) => this.matchFilters(r, filters!));

      const hits: VectorSearchHit[] = [];
      for (const record of filtered) {
        const similarity = this.computeSimilarity(queryVector, record.embedding);
        if (similarity >= threshold) {
          hits.push({
            id: record.id,
            content: record.content,
            similarity,
            user_id: record.user_id,
            metadata: record.metadata,
          });
        }
      }

      hits.sort((a, b) => b.similarity - a.similarity);
      return hits.slice(0, topK);
    }

    const userFilters = filters?.filter((f) => f.field === 'user_id') || [];
    const whereClause = userFilters.length > 0
      ? this.buildUserWhere(
        userFilters
          .filter((f) => f.value != null)
          .map((f) => String(f.value)),
      )
      : null;

    let query = tbl
      .query()
      .nearestTo(queryVector)
      .distanceType(this.distanceTypeForLanceDB());

    if (whereClause) {
      query = query.where(whereClause);
    }

    const results = await query.limit(topK).toArray();
    const isCosine = this.metric === 'cosine';

    const hits: VectorSearchHit[] = results.map((row: Record<string, unknown>) => {
      const lanceDistance = Number(row._distance ?? 0);
      const similarity = isCosine ? 1 - lanceDistance : 1 / (1 + lanceDistance);
      return {
        id: String(row.id ?? ''),
        content: String(row.content ?? ''),
        similarity,
        user_id: row.user_id != null ? String(row.user_id) : null,
        metadata: this.parseMetadata(row.metadata),
      };
    });

    return hits.filter((h) => h.similarity >= threshold);
  }

  getDimension(): number {
    return this.dimension;
  }

  getMetric(): string {
    return this.metric;
  }

  getTableName(): string {
    return VECTOR_RECORD_TABLE;
  }

  getDiskUsage(): number {
    try {
      let total = 0;
      const walkDir = (dir: string): void => {
        const entries = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [];
        for (const entry of entries) {
          const fullPath = `${dir}/${entry.name}`;
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.isFile()) {
            total += statSync(fullPath).size;
          }
        }
      };
      walkDir(this.lancePath);
      return total;
    } catch {
      return 0;
    }
  }

  close(): void {
    try {
      this.table?.close();
    } catch { /* ignore */ }
    try {
      this.conn?.close();
    } catch { /* ignore */ }
    this.table = null;
    this.conn = null;
    this.initialized = false;
  }
}