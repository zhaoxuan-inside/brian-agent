import type { DBWrapper } from '../DBWrapper';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../infrastructure/logger';
import { aopProxy } from './aop';
import {
  VectorContext,
  VectorObject,
  VectorFilter,
  VectorQueryParam,
  VectorDBSearchResult,
  VectorRecord,
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
const VECTOR_TABLE = 'vector_record';
const CONFIG_TABLE = 'vectordb_config';

export class VectorDBProvider {
  private enabled: boolean = true;
  private closed: boolean = false;
  private db: DBWrapper;
  private schemaReady: boolean = false;
  private initPromise: Promise<void>;

  constructor(db: DBWrapper) {
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
      CREATE TABLE IF NOT EXISTS ${VECTOR_TABLE} (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        user_id TEXT,
        metadata TEXT DEFAULT '{}',
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL
      )
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_vector_record_user_id ON ${VECTOR_TABLE}(user_id)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_vector_record_created ON ${VECTOR_TABLE}(created)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_vector_record_updated ON ${VECTOR_TABLE}(updated)
    `);

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
      CREATE INDEX IF NOT EXISTS idx_vectordb_config_updated ON ${CONFIG_TABLE}(updated)
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
      `INSERT INTO ${CONFIG_TABLE} (config_key, config_value, value_type, updated) VALUES (?, ?, 'BOOLEAN', ?)
       ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, updated = excluded.updated`,
      [key, value, Date.now()]
    );
  }

  cosineSimilarity(a: number[], b: number[]): number {
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
      const ids: string[] = [];

      for (const vec of input.vectors) {
        const id = vec.id || uuidv4();
        ids.push(id);

        const existing = await this.db.get<{ id: string }>(
          `SELECT id FROM ${VECTOR_TABLE} WHERE id = ?`,
          [id]
        );

        if (existing) {
          await this.db.run(
            `UPDATE ${VECTOR_TABLE} SET content = ?, embedding = ?, user_id = ?, metadata = ?, updated = ? WHERE id = ?`,
            [
              vec.content,
              JSON.stringify(vec.embedding),
              vec.user_id || null,
              JSON.stringify(vec.metadata || {}),
              now,
              id,
            ]
          );
        } else {
          await this.db.run(
            `INSERT INTO ${VECTOR_TABLE} (id, content, embedding, user_id, metadata, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              vec.content,
              JSON.stringify(vec.embedding),
              vec.user_id || null,
              JSON.stringify(vec.metadata || {}),
              now,
              now,
            ]
          );
        }
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
      let totalChanges = 0;
      for (const id of input.ids) {
        const result = await this.db.run(
          `DELETE FROM ${VECTOR_TABLE} WHERE id = ?`,
          [id]
        );
        totalChanges += result.changes;
      }

      output.success = true;
      output.affectedCount = totalChanges;
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
      const rows = await this.db.query<{ id: string; metadata: string }>(
        `SELECT id, metadata FROM ${VECTOR_TABLE}`
      );

      const toDelete: string[] = [];
      for (const row of rows) {
        let metadata: Record<string, unknown> = {};
        try {
          metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        } catch { /* ignore parse errors */ }

        if (this.applyFilters(metadata, input.filters)) {
          toDelete.push(row.id);
        }
      }

      let totalChanges = 0;
      for (const id of toDelete) {
        const result = await this.db.run(`DELETE FROM ${VECTOR_TABLE} WHERE id = ?`, [id]);
        totalChanges += result.changes;
      }

      output.success = true;
      output.affectedCount = totalChanges;
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

      let rows: { id: string; content: string; embedding: string; user_id?: string; metadata: string }[];

      if (qp.user_id) {
        rows = await this.db.query(
          `SELECT id, content, embedding, user_id, metadata FROM ${VECTOR_TABLE} WHERE user_id = ?`,
          [qp.user_id]
        );
      } else {
        rows = await this.db.query(
          `SELECT id, content, embedding, user_id, metadata FROM ${VECTOR_TABLE}`
        );
      }

      const results: VectorDBSearchResult[] = [];

      for (const row of rows) {
        let metadata: Record<string, unknown> = {};
        try {
          metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        } catch { /* ignore parse errors */ }

        if (qp.filters && qp.filters.length > 0) {
          if (!this.applyFilters(metadata, qp.filters)) {
            continue;
          }
        }

        let storedEmbedding: number[];
        try {
          storedEmbedding = typeof row.embedding === 'string'
            ? JSON.parse(row.embedding)
            : row.embedding;
        } catch {
          continue;
        }

        if (!Array.isArray(storedEmbedding) || storedEmbedding.length !== qp.embedding.length) {
          continue;
        }

        const similarity = this.cosineSimilarity(qp.embedding, storedEmbedding);

        if (similarity >= similarityThreshold) {
          results.push({
            id: row.id,
            content: row.content,
            user_id: row.user_id || undefined,
            similarity,
            metadata,
          });
        }
      }

      results.sort((a, b) => b.similarity - a.similarity);

      output.success = true;
      output.results = results.slice(0, topK);
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
      const row = await this.db.get<{
        id: string; content: string; embedding: string; user_id?: string; metadata: string; created: number; updated: number;
      }>(
        `SELECT id, content, embedding, user_id, metadata, created, updated FROM ${VECTOR_TABLE} WHERE id = ?`,
        [input.id]
      );

      if (!row) {
        output.success = true;
        output.vector = undefined;
        return true;
      }

      let embedding: number[] = [];
      let metadata: Record<string, unknown> = {};
      try {
        embedding = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
      } catch { /* ignore */ }
      try {
        metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      } catch { /* ignore */ }

      output.success = true;
      output.vector = {
        id: row.id,
        content: row.content,
        embedding,
        user_id: row.user_id || undefined,
        metadata,
        created: row.created,
        updated: row.updated,
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
      if (!input.filters || input.filters.length === 0) {
        const result = await this.db.get<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${VECTOR_TABLE}`
        );
        output.success = true;
        output.count = result?.count || 0;
        return true;
      }

      const rows = await this.db.query<{ metadata: string }>(
        `SELECT metadata FROM ${VECTOR_TABLE}`
      );

      let count = 0;
      for (const row of rows) {
        let metadata: Record<string, unknown> = {};
        try {
          metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        } catch { /* ignore parse errors */ }

        if (this.applyFilters(metadata, input.filters)) {
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
      const now = Date.now();

      switch (input.scope) {
        case 'health': {
          if (this.closed) {
            output.data = { connected: false, responseTime: 0, enabled: this.enabled };
          } else {
            const startTime = Date.now();
            await this.db.get<{ config_key: string }>(
              `SELECT config_key FROM ${CONFIG_TABLE} WHERE config_key = 'enabled'`
            );
            const responseTime = Date.now() - startTime;
            output.data = { connected: true, responseTime, enabled: this.enabled };
          }
          break;
        }
        case 'volume': {
          const totalResult = await this.db.get<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${VECTOR_TABLE}`
          );
          const totalCount = totalResult?.count || 0;

          const dimensionResult = await this.db.get<{ embedding: string }>(
            `SELECT embedding FROM ${VECTOR_TABLE} LIMIT 1`
          );
          let dimension = 0;
          if (dimensionResult?.embedding) {
            try {
              const emb = JSON.parse(dimensionResult.embedding);
              dimension = Array.isArray(emb) ? emb.length : 0;
            } catch { /* ignore */ }
          }

          output.data = {
            totalVectors: totalCount,
            collections: 1,
            dimension,
          };
          break;
        }
        case 'diskUsage': {
          const countResult = await this.db.get<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${VECTOR_TABLE}`
          );
          const rowCount = countResult?.count || 0;

          const sizeResult = await this.db.get<{ totalSize: number }>(
            `SELECT SUM(LENGTH(content) + LENGTH(embedding) + LENGTH(COALESCE(metadata, '{}'))) as totalSize FROM ${VECTOR_TABLE}`
          );
          const estimatedBytes = sizeResult?.totalSize || 0;

          output.data = { estimatedBytes, rowCount };
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
