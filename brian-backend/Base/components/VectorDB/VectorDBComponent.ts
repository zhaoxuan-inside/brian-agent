/**
 * @fileoverview VectorDB 数据库组件（LanceDB 后端）。
 *
 * 基于 @lancedb/lancedb 提供向量数据存储与相似度搜索能力。
 * LanceDB 是列式向量数据库，基于 Lance 格式，支持原生 ANN 搜索。
 */

import * as lancedb from '@lancedb/lancedb';
import type { Connection, Table } from '@lancedb/lancedb';
import { makeArrowTable } from '@lancedb/lancedb';
import { Float32, DataType } from 'apache-arrow';
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
      // 旧版本表可能将 embedding 推断为非向量列（如 List<Float64>），
      // 导致 nearestTo 无法识别向量列而搜索失败；若表为空则重建以纠正 schema。
      await this.ensureVectorColumn();
    } else {
      this.table = await this.createTableWithVectorColumn();
    }

    this.initialized = true;
  }

  /**
   * 创建向量表，并显式将 embedding 注册为 FixedSizeList<Float32> 向量列。
   *
   * LanceDB 仅默认把名为 `vector` 的列识别为向量列；embedding 必须通过
   * makeArrowTable 的 vectorColumns 选项显式声明，否则会被推断为 List<Float64>，
   * 导致 nearestTo 抛出 "No vector column found"。
   */
  private async createTableWithVectorColumn(): Promise<Table> {
    const placeholder = {
      id: '__placeholder__',
      content: '',
      embedding: new Array(this.dimension).fill(0),
      user_id: '__placeholder__',
      metadata: '{}',
      created: 0,
      updated: 0,
    };
    const arrowTable = makeArrowTable([placeholder], {
      vectorColumns: { embedding: { type: new Float32() } },
    });
    const table = await this.conn!.createTable(VECTOR_RECORD_TABLE, arrowTable);
    await table.delete("id = '__placeholder__'");
    return table;
  }

  /**
   * 校验 embedding 列是否为向量列；若非向量列且表为空，则重建表修复 schema。
   */
  private async ensureVectorColumn(): Promise<void> {
    try {
      const schema = await this.table!.schema();
      const field = schema.fields.find((f: { name: string }) => f.name === 'embedding');
      const isVector = !!field && DataType.isFixedSizeList(field.type);
      if (isVector) return;
      const count = await this.table!.countRows();
      if (count > 0) {
        throw new DatabaseError('向量表 embedding 列类型非法（非向量列）且已有数据，无法自动迁移');
      }
      await this.conn!.dropTable(VECTOR_RECORD_TABLE);
      this.table = await this.createTableWithVectorColumn();
    } catch (e) {
      if (e instanceof DatabaseError) throw e;
      // schema() 异常等情况下保持现状，交由后续操作报错
    }
  }

  /**
   * 按新维度/度量重建向量表（用于运行时修改维度或度量）。
   *
   * 仅允许在无向量数据时调用（由上层 VectorDBAccess.applyDimension / applyMetric 保证）；
   * 重建会删除并重新创建向量表。
   */
  async recreate(dimension: number, metric: string): Promise<void> {
    this.dimension = dimension;
    this.metric = metric;

    if (!this.conn) {
      this.conn = await lancedb.connect(this.lancePath);
    }
    const tables = await this.conn.tableNames();
    if (tables.includes(VECTOR_RECORD_TABLE)) {
      await this.conn.dropTable(VECTOR_RECORD_TABLE);
    }
    this.table = await this.createTableWithVectorColumn();
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
      } catch {
        /* 非法 JSON 向量串按空向量处理，不中断记录映射（历史数据容忍） */
      }
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
      } catch {
        /* metadata 非 JSON 按 null 处理，不中断记录映射（历史数据容忍） */
      }
    }
    return null;
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

  private computeRawSimilarity(a: number[], b: number[]): number {
    if (this.metric === 'cosine') return this.cosineSimilarity(a, b);
    if (this.metric === 'euclidean') return this.euclideanSimilarity(a, b);
    if (this.metric === 'dot') return this.dotSimilarity(a, b);
    return this.cosineSimilarity(a, b);
  }

  /**
   * 将不同度量方式的原始相似度统一映射到 0-100 归一化分数。
   *
   * - cosine [-1, 1] → (raw + 1) * 50 → [0, 100]
   * - euclidean (0, 1] → raw * 100 → (0, 100]
   * - dot (无界) → sigmoid(raw / sqrt(dimension)) * 100 → (0, 100)
   */
  static normalizeMetricScore(raw: number, metric: string, dimension: number): number {
    const m = (metric || '').toLowerCase();
    if (m === 'cosine') {
      const score = Math.round((raw + 1) * 50);
      return Math.max(0, Math.min(100, score));
    }
    if (m === 'euclidean' || m === 'l2') {
      const score = Math.round(raw * 100);
      return Math.max(0, Math.min(100, score));
    }
    if (m === 'dot' || m === 'ip') {
      const safeDim = dimension > 0 ? dimension : 1536;
      const score = Math.round(100 / (1 + Math.exp(-raw / Math.sqrt(safeDim))));
      return Math.max(0, Math.min(100, score));
    }
    // fallback: linear map, assume raw in [0, 1]
    const score = Math.round(raw * 100);
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 将归一化阈值 (0-100) 转换为各度量方式的原始阈值。
   *
   * 这是 normalizeMetricScore 的逆向操作。
   */
  static normalizedThresholdToRaw(threshold: number, metric: string, dimension: number): number {
    // 边界：0 表示不设阈值（返回全部）；100 表示仅完全匹配。
    // 注意：原实现 `threshold >= 100` 也返回 -Infinity（返回全部），与语义相反，已修正。
    if (threshold <= 0) return -Infinity;
    const t = threshold / 100;
    const m = (metric || '').toLowerCase();
    if (m === 'cosine') {
      return t * 2 - 1;
    }
    if (m === 'euclidean' || m === 'l2') {
      return t;
    }
    if (m === 'dot' || m === 'ip') {
      const safeDim = dimension > 0 ? dimension : 1536;
      if (t >= 1) return Infinity;
      return -Math.log(1 / t - 1) * Math.sqrt(safeDim);
    }
    return t;
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
      metadata: record.metadata ? JSON.stringify(record.metadata) : null,
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
      } catch {
        /* 单条删除失败继续处理剩余 id（预期容忍）：以返回 count 暴露成功条数，缺失败明细需上层日志渠道补充 */
      }
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
        const rawSimilarity = this.computeRawSimilarity(queryVector, record.embedding);
        if (rawSimilarity >= threshold) {
          hits.push({
            id: record.id,
            content: record.content,
            similarity: VectorDBComponent.normalizeMetricScore(rawSimilarity, this.metric, this.dimension),
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
      .column('embedding')
      .distanceType(
        this.metric === 'euclidean' ? 'l2' : this.metric === 'dot' ? 'dot' : 'cosine',
      );

    if (whereClause) {
      query = query.where(whereClause);
    }

    const results = await query.limit(topK).toArray();

    // 原生 ANN 分支阈值过滤：需用「原始相似度」与「原始阈值」比较（与暴力扫描分支一致）。
    // 原实现误用归一化分数(0-100)与原始阈值比较，导致阈值在原生分支失效，已修正。
    // LanceDB 各度量返回的 _distance 语义不同，据此换算原始相似度：
    //   cosine: _distance = 1 - cosine（值域 [0,2]） → raw = 1 - _distance；
    //   l2:     _distance = 欧氏距离（值域 [0,∞)） → raw = 1 / (1 + _distance)；
    //   dot:    _distance = -dot（内积取负）        → raw = -_distance。
    const hits: VectorSearchHit[] = [];
    for (const row of results) {
      const lanceDistance = Number(row._distance ?? 0);
      let rawSimilarity: number;
      if (this.metric === 'cosine') {
        rawSimilarity = 1 - lanceDistance;
      } else if (this.metric === 'euclidean' || this.metric === 'l2') {
        rawSimilarity = 1 / (1 + lanceDistance);
      } else {
        // dot / ip
        rawSimilarity = -lanceDistance;
      }
      if (rawSimilarity < threshold) continue;
      hits.push({
        id: String(row.id ?? ''),
        content: String(row.content ?? ''),
        similarity: VectorDBComponent.normalizeMetricScore(rawSimilarity, this.metric, this.dimension),
        user_id: row.user_id != null ? String(row.user_id) : null,
        metadata: this.parseMetadata(row.metadata),
      });
    }

    return hits;
  }

  getDimension(): number {
    return this.dimension;
  }

  getMetric(): string {
    return this.metric;
  }

  /**
   * 运行时切换距离度量方式。
   *
   * 仅允许在无向量数据时调用（由上层 VectorDBAccess.applyMetric 保证）；
   * 度量方式在查询时通过 distanceType 指定，无需重建表。
   */
  setMetric(metric: string): void {
    this.metric = metric;
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