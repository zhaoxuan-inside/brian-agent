import { config } from '../config';
import fs from 'fs';
import path from 'path';

export class VectorStorage {
  private dbPath: string;

  constructor() {
    this.dbPath = config.vectorDbPath;
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }
  }

  async createIndex(name: string, dimension: number): Promise<void> {
    const indexPath = path.join(this.dbPath, `${name}.index`);
    if (!fs.existsSync(indexPath)) {
      const indexData = {
        name,
        dimension,
        vectors: [],
        metadata: [],
        createdAt: Date.now(),
      };
      fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
    }
  }

  async addVector(indexName: string, vector: number[], metadata: Record<string, unknown>): Promise<void> {
    const indexPath = path.join(this.dbPath, `${indexName}.index`);
    if (!fs.existsSync(indexPath)) {
      await this.createIndex(indexName, vector.length);
    }

    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    indexData.vectors.push(vector);
    indexData.metadata.push(metadata);
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
  }

  async search(indexName: string, queryVector: number[], topK: number = 5): Promise<Array<{ score: number; metadata: Record<string, unknown> }>> {
    const indexPath = path.join(this.dbPath, `${indexName}.index`);
    if (!fs.existsSync(indexPath)) {
      return [];
    }

    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const vectors = indexData.vectors as number[][];
    const metadata = indexData.metadata as Record<string, unknown>[];

    const results: Array<{ score: number; metadata: Record<string, unknown> }> = [];

    for (let i = 0; i < vectors.length; i++) {
      const score = this.cosineSimilarity(queryVector, vectors[i]);
      results.push({ score, metadata: metadata[i] });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async deleteIndex(name: string): Promise<void> {
    const indexPath = path.join(this.dbPath, `${name}.index`);
    if (fs.existsSync(indexPath)) {
      fs.unlinkSync(indexPath);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }
}
