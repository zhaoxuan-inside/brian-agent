export interface IVectorStorage {
  createIndex(name: string, dimension: number): Promise<void>;
  addVector(indexName: string, id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void>;
  search(indexName: string, queryVector: number[], topK?: number): Promise<{ id: string; score: number; metadata: Record<string, unknown> }[]>;
  deleteVector(indexName: string, id: string): Promise<void>;
  deleteIndex(name: string): Promise<void>;
  cosineSimilarity(a: number[], b: number[]): number;
}