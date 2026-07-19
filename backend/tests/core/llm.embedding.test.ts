import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingService } from '../../src/core/llm/embedding';

describe('EmbeddingService', () => {
  let embedding: EmbeddingService;

  beforeEach(() => {
    embedding = new EmbeddingService();
  });

  describe('embed', () => {
    it('should throw when remote not configured', async () => {
      await expect(embedding.embed(['hello'])).rejects.toThrow('Embedding service not configured');
    });

    it('should handle empty input', async () => {
      // embed returns empty array for empty input (but still throws if not configured)
      // When not configured, it throws before checking empty input
      await expect(embedding.embed([])).rejects.toThrow();
    });
  });

  describe('isRemoteConfigured', () => {
    it('should return false by default', () => {
      expect(embedding.isRemoteConfigured()).toBe(false);
    });

    it('should return true after configureRemote', () => {
      embedding.configureRemote('https://api.example.com', 'key', 'model');
      expect(embedding.isRemoteConfigured()).toBe(true);
    });
  });

  describe('embedRemote', () => {
    it('should throw when not configured', async () => {
      await expect(embedding.embedRemote(['test'])).rejects.toThrow('Remote embedding not configured');
    });

    it('should call fetch with correct URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: new Array(128).fill(0.1) }] }),
      });
      global.fetch = mockFetch as any;
      embedding.configureRemote('https://api.example.com', 'test-key', 'test-model');
      const result = await embedding.embedRemote(['hello']);
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(128);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key',
          }),
        })
      );
    });

    it('should handle non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      }) as any;
      embedding.configureRemote('https://api.example.com', 'test-key', 'test-model');
      await expect(embedding.embedRemote(['hello'])).rejects.toThrow('Embedding API error');
    });

    it('should use remote when configured and available', async () => {
      const mockData = { data: [{ embedding: new Array(128).fill(0.5) }] };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      }) as any;
      embedding.configureRemote('https://api.example.com', 'test-key', 'test-model');
      const vectors = await embedding.embedRemote(['hello']);
      expect(vectors.length).toBe(1);
      expect(vectors[0].length).toBe(128);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const vec = Array.from({ length: 384 }, (_, i) => Math.sin(i) * 0.1);
      expect(embedding.cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const vecA = [1, 0, 0, 0].concat(new Array(380).fill(0));
      const vecB = [0, 1, 0, 0].concat(new Array(380).fill(0));
      expect(embedding.cosineSimilarity(vecA, vecB)).toBe(0);
    });

    it('should return 0.0 for zero vectors', () => {
      expect(embedding.cosineSimilarity(new Array(384).fill(0), new Array(384).fill(1))).toBe(0);
    });

    it('should throw on dimension mismatch', () => {
      expect(() => embedding.cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vector dimension mismatch');
    });
  });

  describe('search', () => {
    it('should return top K results sorted by score', () => {
      const vectors = [
        [1, 0, 0],
        [0, 1, 0],
        [0.7, 0.7, 0],
      ];
      const query = [1, 0, 0];
      const results = embedding.search(query, vectors, 2);
      expect(results.length).toBe(2);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it('should return all results when topK exceeds vectors', () => {
      const vectors = [[1, 0], [0, 1]];
      const query = [1, 0];
      const results = embedding.search(query, vectors, 10);
      expect(results.length).toBe(2);
    });
  });
});