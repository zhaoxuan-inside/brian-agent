import fs from 'fs';
import path from 'path';
import { getConfig } from '../../infrastructure/config';

interface VectorEntry {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

interface IndexConfig {
  name: string;
  dimension: number;
  createdAt: number;
}

export class VectorStorage {
  private db = getConfig;

  private getIndexPath(name: string): string {
    const config = this.db();
    return path.resolve(config.vectorDbPath, name);
  }

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  async createIndex(name: string, dimension: number): Promise<void> {
    const indexPath = this.getIndexPath(name);
    this.ensureDir(indexPath);

    const config: IndexConfig = {
      name,
      dimension,
      createdAt: Date.now(),
    };

    fs.writeFileSync(
      path.join(indexPath, 'index.json'),
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    const vectorsDir = path.join(indexPath, 'vectors');
    this.ensureDir(vectorsDir);
  }

  async addVector(
    indexName: string,
    id: string,
    vector: number[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const indexPath = this.getIndexPath(indexName);
    const configPath = path.join(indexPath, 'index.json');

    if (!fs.existsSync(configPath)) {
      throw new Error(`Index "${indexName}" does not exist`);
    }

    const config: IndexConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (vector.length !== config.dimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${config.dimension}, got ${vector.length}`
      );
    }

    const entry: VectorEntry = {
      id,
      vector,
      metadata: metadata || {},
    };

    const vectorsDir = path.join(indexPath, 'vectors');
    this.ensureDir(vectorsDir);
    fs.writeFileSync(
      path.join(vectorsDir, `${id}.json`),
      JSON.stringify(entry, null, 2),
      'utf-8'
    );
  }

  async search(
    indexName: string,
    queryVector: number[],
    topK: number = 10
  ): Promise<{ id: string; score: number; metadata: Record<string, unknown> }[]> {
    const indexPath = this.getIndexPath(indexName);
    const configPath = path.join(indexPath, 'index.json');

    if (!fs.existsSync(configPath)) {
      throw new Error(`Index "${indexName}" does not exist`);
    }

    const config: IndexConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (queryVector.length !== config.dimension) {
      throw new Error(
        `Query vector dimension mismatch: expected ${config.dimension}, got ${queryVector.length}`
      );
    }

    const vectorsDir = path.join(indexPath, 'vectors');
    if (!fs.existsSync(vectorsDir)) {
      return [];
    }

    const entries = fs.readdirSync(vectorsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const raw = fs.readFileSync(path.join(vectorsDir, f), 'utf-8');
        return JSON.parse(raw) as VectorEntry;
      });

    const scored = entries.map((entry) => ({
      id: entry.id,
      score: this.cosineSimilarity(queryVector, entry.vector),
      metadata: entry.metadata,
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }

  async deleteVector(indexName: string, id: string): Promise<void> {
    const indexPath = this.getIndexPath(indexName);
    const vectorFile = path.join(indexPath, 'vectors', `${id}.json`);

    if (fs.existsSync(vectorFile)) {
      fs.unlinkSync(vectorFile);
    }
  }

  async deleteIndex(name: string): Promise<void> {
    const indexPath = this.getIndexPath(name);
    if (fs.existsSync(indexPath)) {
      fs.rmSync(indexPath, { recursive: true, force: true });
    }
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}