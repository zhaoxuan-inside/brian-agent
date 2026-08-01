import type { DBWrapper } from '../DBWrapper';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../infrastructure/logger';
import { aopProxy } from './aop';
import {
  VectorContext,
  VectorFilter,
  VectorDBSearchResult,
  AddVectorInput,
  AddVectorOutput,
  DelVectorInput,
  DelVectorOutput,
  DelVectorByFilterInput,
  DelVectorByFilterOutput,
  SoVectorInput,
  SoVectorOutput,
  GetVectorInput,
  GetVectorOutput,
  CountVectorInput,
  CountVectorOutput,
  VisualizedVectorInput,
  VisualizedVectorOutput,
  EnableVectorDBInput,
  EnableVectorDBOutput,
  CloseVectorDBInput,
  CloseVectorDBOutput,
} from './types';

const MODULE_NAME = 'VectorDBProvider';
const TABLE_NAME = 'vector_record';
const CONFIG_TABLE = 'vectordb_config';

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

function toNumberArray(v: any): number[] {
  if (!v) return [];
  if (Array.isArray(v)) return Array.from(v);
  if (ArrayBuffer.isView(v)) return Array.from(v as any);
  if (typeof v === 'object' && v !== null && typeof v[Symbol.iterator] === 'function') {
    return Array.from(v);
  }
  return [];
}

export class VectorDBProvider {
  private enabled: boolean = true;
  private closed: boolean = false;
  private db: DBWrapper;
  private lancePath: string;
  private lanceDB: any = null;
  private table: any = null;
  private schemaReady: boolean = false;
  private initPromise: Promise<void>;

  constructor(lancePath: string, db: DBWrapper) {
    this.lancePath = lancePath;
    this.db = db;
    this.initPromise = this.initSchema().catch((err) => {
      this.schemaReady = false;
      logger.error(MODULE_NAME, `Schema initialization failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    return aopProxy(this, MODULE_NAME);
  }

  private async ensureReady(): Promise<void> {
    await this.initPromise;
  }

  async ready(): Promise<void> {
    await this.initPromise;
  }

  private async initSchema(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${CONFIG_TABLE} (
        config_key TEXT PRIMARY KEY,
        config_value TEXT NOT NULL,
        value_type TEXT NOT NULL DEFAULT 'STRING',
        description TEXT,
        updated INTEGER NOT NULL
      )
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_${CONFIG_TABLE}_updated ON ${CONFIG_TABLE}(updated)
    `);

    const existingConfigs = await this.db.query<{ config_key: string }>(
      `SELECT config_key FROM ${CONFIG_TABLE}`
    );

    const existingKeys = new Set(existingConfigs.map((r: { config_key: string }) => r.config_key));
    const now = Date.now();

    const defaultConfigs: { config_key: string; config_value: string; value_type: string; description: string; updated: number }[] = [
      { config_key: 'enabled', config_value: 'true', value_type: 'BOOLEAN', description: 'Whether VectorDB is enabled', updated: now },
      { config_key: 'default_top_k', config_value: '10', value_type: 'INT', description: 'Default number of results to return', updated: now },
      { config_key: 'default_similarity_threshold', config_value: '0.0', value_type: 'DOUBLE', description: 'Default similarity threshold', updated: now },
      { config_key: 'default_distance_metric', config_value: 'COSINE', value_type: 'STRING', description: 'Default distance metric (COSINE / L2 / IP)', updated: now },
    ];

    for (const cfg of defaultConfigs) {
      if (!existingKeys.has(cfg.config_key)) {
        await this.db.run(
          `INSERT OR IGNORE INTO ${CONFIG_TABLE} (config_key, config_value, value_type, description, updated) VALUES (?, ?, ?, ?, ?)`,
          [cfg.config_key, cfg.config_value, cfg.value_type, cfg.description, cfg.updated]
        );
      }
    }

    const enabledRow = await this.db.get<{ config_value: string }>(
      `SELECT config_value FROM ${CONFIG_TABLE} WHERE config_key = 'enabled'`
    );
    if (enabledRow) {
      this.enabled = enabledRow.config_value === 'true';
    }

    const lancedbModule = await import('@lancedb/lancedb');
    this.lanceDB = await lancedbModule.connect(this.lancePath);

    const tableNames: string[] = await this.lanceDB.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      this.table = await this.lanceDB.openTable(TABLE_NAME);
    }

    this.schemaReady = true;
    logger.info(MODULE_NAME, `Schema initialized, enabled=${this.enabled}`);
  }

  private async getConfigValue(key: string): Promise<string | undefined> {
    const row = await this.db.get<{ config_value: string }>(
      `SELECT config_value FROM ${CONFIG_TABLE} WHERE config_key = ?`,
      [key]
    );
    return row?.config_value;
  }

  private async setConfigValue(key: string, value: string): Promise<void> {
    await this.db.run(
      `INSERT INTO ${CONFIG_TABLE} (config_key, config_value, value_type, updated) VALUES (?, ?, 'STRING', ?)
       ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, updated = excluded.updated`,
      [key, value, Date.now()]
    );
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (!Array.isArray(a) || !Array.isArray(b)) return 0;
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private evaluateFilter(metadata: Record<string, unknown>, filter: VectorFilter): boolean {
    const fieldValue = metadata[filter.field];
    const { operator, value } = filter;

    switch (operator) {
      case 'EQ':
        return fieldValue === value;
      case 'NE':
        return fieldValue !== value;
      case 'GT':
        return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue > value;
      case 'LT':
        return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue < value;
      case 'GE':
        return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue >= value;
      case 'LE':
        return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue <= value;
      case 'IN':
        return Array.isArray(value) && value.includes(fieldValue);
      case 'NOT_IN':
        return Array.isArray(value) && !value.includes(fieldValue);
      case 'IS_NULL':
        return fieldValue === null || fieldValue === undefined;
      case 'IS_NOT_NULL':
        return fieldValue !== null && fieldValue !== undefined;
      default:
        return true;
    }
  }

  private applyFilters(metadata: Record<string, unknown>, filters: VectorFilter[]): boolean {
    if (!filters || filters.length === 0) return true;

    let result = true;
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      const match = this.evaluateFilter(metadata, filter);

      if (i === 0) {
        result = match;
      } else {
        const logic = filter.logic || 'AND';
        if (logic === 'OR') {
          result = result || match;
        } else {
          result = result && match;
        }
      }
    }
    return result;
  }

  private parseMetadata(raw: any): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    try {
      return JSON.parse(String(raw));
    } catch {
      return {};
    }
  }

  private async scanAllRows(): Promise<any[]> {
    if (!this.table) return [];

    try {
      const count = await this.table.countRows();
      if (count === 0) return [];

      const results = await this.table.query().limit(Math.max(count, 1)).toArray();

      return results.map((r: any) => {
        const metadata = this.parseMetadata(r.metadata);
        return {
          id: r.id,
          content: r.content,
          vector: r.vector,
          user_id: r.user_id,
          metadata,
          created: r.created,
          updated: r.updated,
        };
      });
    } catch {
      return [];
    }
  }

  private bruteForceSearch(
    rows: any[],
    queryEmbedding: number[]
  ): VectorDBSearchResult[] {
    return rows
      .map(row => ({
        id: row.id,
        content: row.content,
        user_id: row.user_id || undefined,
        similarity: this.cosineSimilarity(
          queryEmbedding,
          toNumberArray(row.vector)
        ),
        metadata: row.metadata,
      }));
  }

  async addVector(
    input: AddVectorInput,
    _context: VectorContext,
    output: AddVectorOutput
  ): Promise<boolean> {
    await this.ensureReady();

    if (this.closed) {
      output.success = false;
      output.error = 'VectorDB is closed (terminal state), cannot add vectors';
      return false;
    }

    if (!this.enabled) {
      output.success = false;
      output.error = 'VectorDB is disabled, cannot add vectors';
      return false;
    }

    try {
      const now = Date.now();
      const ids: string[] = input.vectors.map(v => v.id || uuidv4());

      const rows = input.vectors.map((vec, i) => ({
        id: ids[i],
        content: vec.content,
        vector: vec.embedding,
        user_id: vec.user_id || '',
        metadata: JSON.stringify(vec.metadata || {}),
        created: now,
        updated: now,
      }));

      if (!this.table) {
        this.table = await this.lanceDB.createTable(TABLE_NAME, rows);
      } else {
        const existingIds = ids.map(id => `'${escapeSQL(id)}'`).join(',');
        try {
          await this.table.delete(`id IN (${existingIds})`);
        } catch {
          // Ignore if rows don't exist yet
        }
        await this.table.add(rows);
      }

      output.success = true;
      output.ids = ids;
      return true;
    } catch (err: unknown) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async delVector(
    input: DelVectorInput,
    _context: VectorContext,
    output: DelVectorOutput
  ): Promise<boolean> {
    await this.ensureReady();

    if (this.closed) {
      output.success = false;
      output.error = 'VectorDB is closed (terminal state), cannot delete vectors';
      return false;
    }

    if (!this.enabled) {
      output.success = false;
      output.error = 'VectorDB is disabled, cannot delete vectors';
      return false;
    }

    try {
      if (!this.table || input.ids.length === 0) {
        output.success = true;
        output.affectedCount = 0;
        return true;
      }

      const countBefore = await this.table.countRows();
      const idList = input.ids.map(id => `'${escapeSQL(id)}'`).join(',');
      await this.table.delete(`id IN (${idList})`);
      const countAfter = await this.table.countRows();

      output.success = true;
      output.affectedCount = countBefore - countAfter;
      return true;
    } catch (err: unknown) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async delVectorByFilter(
    input: DelVectorByFilterInput,
    _context: VectorContext,
    output: DelVectorByFilterOutput
  ): Promise<boolean> {
    await this.ensureReady();

    if (this.closed) {
      output.success = false;
      output.error = 'VectorDB is closed (terminal state), cannot delete vectors';
      return false;
    }

    if (!this.enabled) {
      output.success = false;
      output.error = 'VectorDB is disabled, cannot delete vectors';
      return false;
    }

    try {
      const all = await this.scanAllRows();
      const toDelete: string[] = [];

      for (const row of all) {
        if (this.applyFilters(row.metadata, input.filters)) {
          toDelete.push(row.id);
        }
      }

      if (toDelete.length > 0) {
        const idList = toDelete.map(id => `'${escapeSQL(id)}'`).join(',');
        await this.table.delete(`id IN (${idList})`);
      }

      output.success = true;
      output.affectedCount = toDelete.length;
      return true;
    } catch (err: unknown) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async soVector(
    input: SoVectorInput,
    _context: VectorContext,
    output: SoVectorOutput
  ): Promise<boolean> {
    await this.ensureReady();

    if (this.closed) {
      output.success = false;
      output.error = 'VectorDB is closed (terminal state), cannot search vectors';
      return false;
    }

    if (!this.enabled) {
      output.success = false;
      output.error = 'VectorDB is disabled, cannot search vectors';
      return false;
    }

    try {
      const qp = input.query_param;

      const topKStr = await this.getConfigValue('default_top_k');
      const thresholdStr = await this.getConfigValue('default_similarity_threshold');
      const topK = qp.top_k ?? (topKStr ? parseInt(topKStr, 10) : 10);
      const similarityThreshold = qp.similarity_threshold ?? (thresholdStr ? parseFloat(thresholdStr) : 0.0);

      const hasMetadataFilters = qp.filters && qp.filters.length > 0;

      if (!this.table) {
        output.success = true;
        output.results = [];
        return true;
      }

      let results: VectorDBSearchResult[];

      if (hasMetadataFilters) {
        const all = await this.scanAllRows();
        results = this.bruteForceSearch(all, qp.embedding);

        results = results.filter(r => {
          if (qp.user_id && r.user_id !== qp.user_id) return false;
          if (!this.applyFilters(r.metadata || {}, qp.filters!)) return false;
          return r.similarity >= similarityThreshold;
        });
      } else {
        let query = this.table.vectorSearch(qp.embedding).distanceType('cosine');

        if (qp.user_id) {
          query = query.where(`user_id = '${escapeSQL(qp.user_id)}'`);
        }

        const fetchK = Math.max(topK, 100);
        query = query.limit(fetchK);

        const lanceResults = await query.toArray();
        results = lanceResults.map((r: any) => ({
          id: r.id,
          content: r.content,
          user_id: r.user_id || undefined,
          similarity: 1 - (r._distance || 0),
          metadata: this.parseMetadata(r.metadata),
        }));
      }

      results.sort((a, b) => {
        const simDiff = b.similarity - a.similarity;
        if (Math.abs(simDiff) > 1e-9) return simDiff;
        return a.id.localeCompare(b.id);
      });

      output.success = true;
      output.results = results.filter(r => r.similarity >= similarityThreshold).slice(0, topK);
      return true;
    } catch (err: unknown) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async getVector(
    input: GetVectorInput,
    _context: VectorContext,
    output: GetVectorOutput
  ): Promise<boolean> {
    await this.ensureReady();

    if (this.closed) {
      output.success = false;
      output.error = 'VectorDB is closed (terminal state), cannot get vectors';
      return false;
    }

    if (!this.enabled) {
      output.success = false;
      output.error = 'VectorDB is disabled, cannot get vectors';
      return false;
    }

    try {
      if (!this.table) {
        output.success = true;
        output.vector = undefined;
        return true;
      }

      const results = await this.table
        .query()
        .where(`id = '${escapeSQL(input.id)}'`)
        .limit(1)
        .toArray();

      if (!results || results.length === 0) {
        output.success = true;
        output.vector = undefined;
        return true;
      }

      const row = results[0];
      output.success = true;
      output.vector = {
        id: row.id,
        content: row.content,
        embedding: toNumberArray(row.vector),
        user_id: row.user_id || undefined,
        metadata: this.parseMetadata(row.metadata),
        created: typeof row.created === 'bigint' ? Number(row.created) : (row.created || 0),
        updated: typeof row.updated === 'bigint' ? Number(row.updated) : (row.updated || 0),
      };
      return true;
    } catch (err: unknown) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async countVector(
    input: CountVectorInput,
    _context: VectorContext,
    output: CountVectorOutput
  ): Promise<boolean> {
    await this.ensureReady();

    if (this.closed) {
      output.success = false;
      output.error = 'VectorDB is closed (terminal state), cannot count vectors';
      return false;
    }

    if (!this.enabled) {
      output.success = false;
      output.error = 'VectorDB is disabled, cannot count vectors';
      return false;
    }

    try {
      if (!this.table) {
        output.success = true;
        output.count = 0;
        return true;
      }

      if (!input.filters || input.filters.length === 0) {
        const count = await this.table.countRows();
        output.success = true;
        output.count = count;
        return true;
      }

      const all = await this.scanAllRows();
      let count = 0;
      for (const row of all) {
        if (this.applyFilters(row.metadata, input.filters)) {
          count++;
        }
      }

      output.success = true;
      output.count = count;
      return true;
    } catch (err: unknown) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async visualizedVector(
    input: VisualizedVectorInput,
    _context: VectorContext,
    output: VisualizedVectorOutput
  ): Promise<boolean> {
    await this.ensureReady();

    try {
      switch (input.scope) {
        case 'health': {
          if (this.closed) {
            output.data = { connected: false, responseTime: 0, enabled: this.enabled };
          } else if (!this.lanceDB) {
            output.data = { connected: false, responseTime: 0, enabled: this.enabled };
          } else {
            const startTime = Date.now();
            await this.lanceDB.tableNames();
            const responseTime = Date.now() - startTime;
            output.data = { connected: true, responseTime, enabled: this.enabled };
          }
          break;
        }
        case 'volume': {
          if (!this.table) {
            output.data = { totalVectors: 0, collections: 1, dimension: 0 };
          } else {
            const totalCount = await this.table.countRows();

            let dimension = 0;
            const all = await this.scanAllRows();
            if (all.length > 0 && all[0].vector) {
              const vec = toNumberArray(all[0].vector);
              dimension = vec.length;
            }

            output.data = { totalVectors: totalCount, collections: 1, dimension };
          }
          break;
        }
        case 'diskUsage': {
          if (!this.table) {
            output.data = { estimatedBytes: 0, rowCount: 0 };
          } else {
            const rowCount = await this.table.countRows();

            const all = await this.scanAllRows();
            let estimatedBytes = 0;
            for (const r of all) {
              estimatedBytes +=
                (r.content ? r.content.length : 0) +
                (r.vector ? toNumberArray(r.vector).length * 8 : 0) +
                (r.metadata ? JSON.stringify(r.metadata).length : 0);
            }

            output.data = { estimatedBytes, rowCount };
          }
          break;
        }
        default:
          output.success = false;
          output.error = `Unknown scope: ${input.scope}`;
          return false;
      }

      output.success = true;
      return true;
    } catch (err: unknown) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async enableVectorDB(
    input: EnableVectorDBInput,
    _context: VectorContext,
    output: EnableVectorDBOutput
  ): Promise<boolean> {
    await this.ensureReady();

    if (this.closed && input.enable) {
      output.success = false;
      output.error = 'VectorDB is closed (terminal state), cannot re-enable; reinitialize the component';
      return false;
    }

    try {
      await this.setConfigValue('enabled', input.enable ? 'true' : 'false');
      this.enabled = input.enable;

      output.success = true;
      return true;
    } catch (err: unknown) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  async closeVectorDB(
    _input: CloseVectorDBInput,
    _context: VectorContext,
    output: CloseVectorDBOutput
  ): Promise<boolean> {
    await this.ensureReady();

    try {
      this.closed = true;
      this.enabled = false;

      await this.setConfigValue('enabled', 'false');

      this.lanceDB = null;
      this.table = null;

      output.success = true;
      return true;
    } catch (err: unknown) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isClosed(): boolean {
    return this.closed;
  }
}
