import type { DBWrapper } from '../DBWrapper';

export interface VectorSearchResult {
  id: string;
  userId: string;
  similarity: number;
  metadata: Record<string, any>;
}

export class SQLiteVectorDB {
  private tableName: string;

  constructor(
    private db: DBWrapper
  ) {
    this.tableName = 'vector_embeddings';
  }

  async initSchema(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        embedding TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_vector_user_id ON ${this.tableName}(user_id)
    `);
  }

  async upsert(
    id: string,
    userId: string,
    embedding: number[],
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const embeddingJson = JSON.stringify(embedding);
    const now = Math.floor(Date.now() / 1000);

    const existing = await this.db.get<{ id: string }>(
      `SELECT id FROM ${this.tableName} WHERE id = ?`,
      [id]
    );

    if (existing) {
      await this.db.run(
        `UPDATE ${this.tableName}
         SET embedding = ?, metadata = ?, updated_at = ?
         WHERE id = ?`,
        [embeddingJson, JSON.stringify(metadata), now, id]
      );
    } else {
      await this.db.run(
        `INSERT INTO ${this.tableName} (id, user_id, embedding, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, userId, embeddingJson, JSON.stringify(metadata), now, now]
      );
    }
  }

  async search(
    userId: string,
    queryEmbedding: number[],
    topK: number = 10,
    similarityThreshold: number = 0.7
  ): Promise<VectorSearchResult[]> {
    const rows = await this.db.query<any>(
      `SELECT id, user_id, embedding, metadata FROM ${this.tableName} WHERE user_id = ?`,
      [userId]
    );

    const results: VectorSearchResult[] = [];

    for (const row of rows) {
      let storedEmbedding: number[];
      try {
        storedEmbedding = typeof row.embedding === 'string'
          ? JSON.parse(row.embedding)
          : row.embedding;
      } catch {
        continue;
      }

      if (!Array.isArray(storedEmbedding) || storedEmbedding.length !== queryEmbedding.length) {
        continue;
      }

      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      if (similarity >= similarityThreshold) {
        const metadata = typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : row.metadata;

        results.push({
          id: row.id,
          userId: row.user_id,
          similarity,
          metadata,
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  async delete(id: string): Promise<void> {
    await this.db.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.db.run(`DELETE FROM ${this.tableName} WHERE user_id = ?`, [userId]);
  }

  async get(id: string): Promise<{ embedding: number[]; metadata: Record<string, any> } | undefined> {
    const row = await this.db.get<any>(
      `SELECT embedding, metadata FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    if (!row) return undefined;

    return {
      embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    };
  }

  async count(userId: string): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE user_id = ?`,
      [userId]
    );
    return row?.count || 0;
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
}