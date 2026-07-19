const DEFAULT_DIMENSION = 384;

export class EmbeddingService {
  private remoteConfig: { baseUrl: string; apiKey: string; model: string } | null = null;
  private dimension: number = DEFAULT_DIMENSION;

  configureRemote(baseUrl: string, apiKey: string, model: string, dimension?: number): void {
    this.remoteConfig = { baseUrl, apiKey, model };
    if (dimension) this.dimension = dimension;
  }

  isRemoteConfigured(): boolean {
    return this.remoteConfig !== null;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.remoteConfig) {
      throw new Error('Embedding service not configured. Please configure an embedding provider in settings.');
    }
    if (texts.length === 0) {
      return [];
    }
    return await this.embedRemote(texts);
  }

  async embedRemote(texts: string[]): Promise<number[][]> {
    if (!this.remoteConfig) {
      throw new Error('Remote embedding not configured');
    }

    const { baseUrl, apiKey, model } = this.remoteConfig;
    const url = `${baseUrl}/embeddings`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Embedding API error (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const data = await response.json() as { data: { embedding: number[] }[] };
    return data.data.map(item => item.embedding);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
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

  search(queryVector: number[], vectors: number[][], topK: number): { index: number; score: number }[] {
    const scores = vectors.map((v, i) => ({
      index: i,
      score: this.cosineSimilarity(queryVector, v),
    }));
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }
}