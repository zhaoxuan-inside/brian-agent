import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase, closeDatabase, getDatabase } from '../../src/infrastructure/database';
import { VectorDBProvider } from '../../src/base/VectorDBProvider/VectorDBProvider';
import { aopProxy } from '../../src/base/VectorDBProvider/aop';
import {
  VectorContext,
  VectorFilter,
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
} from '../../src/base/VectorDBProvider/types';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

function createDBWrapper(rawDb: Database.Database) {
  return {
    query: async <T>(sql: string, params?: any[]): Promise<T[]> => {
      const stmt = rawDb.prepare(sql);
      return (params ? stmt.all(...params) : stmt.all()) as T[];
    },
    run: async (sql: string, params?: any[]): Promise<{ changes: number; lastInsertId: number }> => {
      const stmt = rawDb.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return { changes: result.changes, lastInsertId: (result.lastInsertRowid as number) || 0 };
    },
    get: async <T>(sql: string, params?: any[]): Promise<T | undefined> => {
      const stmt = rawDb.prepare(sql);
      return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
    },
    close: () => { /* shared connection */ },
    transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      return rawDb.transaction(() => {
        const tx = {
          query: async (sql: string, params?: any[]) => rawDb.prepare(sql).all(...(params || [])),
          run: async (sql: string, params?: any[]) => rawDb.prepare(sql).run(...(params || [])),
          get: async (sql: string, params?: any[]) => rawDb.prepare(sql).get(...(params || [])),
        };
        return fn(tx);
      })();
    },
  };
}

describe('VectorDBProvider', () => {
  let provider: VectorDBProvider;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-vectordb-'));
    originalEnv = { ...process.env };
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    const { vi } = await import('vitest');
    vi.resetModules();
    initDatabase();
    const rawDb = getDatabase();
    const dbWrapper = createDBWrapper(rawDb);
    const lancePath = path.join(tempDir, 'lancedb');
    provider = new VectorDBProvider(lancePath, dbWrapper);
    await provider.ready();
  });

  afterEach(() => {
    closeDatabase();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('BRIAN_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ============================================================
  // 3.1 addVector
  // ============================================================
  describe('addVector', () => {
    it('should add a single vector and return the id', async () => {
      const input = new AddVectorInput({
        vectors: [{ content: 'test content', embedding: [0.1, 0.2, 0.3] }],
      });
      const context = new VectorContext();
      const output = new AddVectorOutput();

      const result = await provider.addVector(input, context, output);
      expect(result).toBe(true);
      expect(output.success).toBe(true);
      expect(output.ids).toHaveLength(1);
      expect(output.ids[0]).toBeTruthy();
    });

    it('should add a vector with explicit id', async () => {
      const input = new AddVectorInput({
        vectors: [{ id: 'my-custom-id', content: 'custom id content', embedding: [0.5, 0.5, 0.5] }],
      });
      const output = new AddVectorOutput();
      const result = await provider.addVector(input, new VectorContext(), output);
      expect(result).toBe(true);
      expect(output.ids).toEqual(['my-custom-id']);
    });

    it('should add multiple vectors in one call', async () => {
      const input = new AddVectorInput({
        vectors: [
          { content: 'first', embedding: [1, 0, 0] },
          { content: 'second', embedding: [0, 1, 0] },
          { content: 'third', embedding: [0, 0, 1] },
        ],
      });
      const output = new AddVectorOutput();
      const result = await provider.addVector(input, new VectorContext(), output);
      expect(result).toBe(true);
      expect(output.ids).toHaveLength(3);
    });

    it('should update existing vector (upsert semantics)', async () => {
      const addInput = new AddVectorInput({
        vectors: [{ id: 'upsert-id', content: 'original', embedding: [1, 2, 3] }],
      });
      const addOutput = new AddVectorOutput();
      await provider.addVector(addInput, new VectorContext(), addOutput);

      const updateInput = new AddVectorInput({
        vectors: [{ id: 'upsert-id', content: 'updated', embedding: [4, 5, 6] }],
      });
      const updateOutput = new AddVectorOutput();
      await provider.addVector(updateInput, new VectorContext(), updateOutput);
      expect(updateOutput.ids).toEqual(['upsert-id']);

      const getOutput = new GetVectorOutput();
      await provider.getVector(new GetVectorInput({ id: 'upsert-id' }), new VectorContext(), getOutput);
      expect(getOutput.vector?.content).toBe('updated');
    });

    it('should store metadata with vector', async () => {
      const input = new AddVectorInput({
        vectors: [{ content: 'meta test', embedding: [0.1, 0.2, 0.3], metadata: { key: 'value', count: 42 } }],
      });
      const output = new AddVectorOutput();
      await provider.addVector(input, new VectorContext(), output);

      const getOutput = new GetVectorOutput();
      await provider.getVector(new GetVectorInput({ id: output.ids[0] }), new VectorContext(), getOutput);
      expect(getOutput.vector?.metadata).toEqual({ key: 'value', count: 42 });
    });

    it('should store user_id with vector', async () => {
      const input = new AddVectorInput({
        vectors: [{ content: 'user vector', embedding: [0.1, 0.2], user_id: 'user-001' }],
      });
      const output = new AddVectorOutput();
      await provider.addVector(input, new VectorContext(), output);

      const getOutput = new GetVectorOutput();
      await provider.getVector(new GetVectorInput({ id: output.ids[0] }), new VectorContext(), getOutput);
      expect(getOutput.vector?.user_id).toBe('user-001');
    });
  });

  // ============================================================
  // 3.2 delVector
  // ============================================================
  describe('delVector', () => {
    it('should delete a single vector by id', async () => {
      const addOutput = new AddVectorOutput();
      await provider.addVector(
        new AddVectorInput({ vectors: [{ content: 'to delete', embedding: [1, 0] }] }),
        new VectorContext(), addOutput
      );

      const delOutput = new DelVectorOutput();
      const result = await provider.delVector(
        new DelVectorInput({ ids: [addOutput.ids[0]] }),
        new VectorContext(), delOutput
      );
      expect(result).toBe(true);
      expect(delOutput.affectedCount).toBe(1);

      const getOutput = new GetVectorOutput();
      await provider.getVector(new GetVectorInput({ id: addOutput.ids[0] }), new VectorContext(), getOutput);
      expect(getOutput.vector).toBeUndefined();
    });

    it('should delete multiple vectors', async () => {
      const addOutput = new AddVectorOutput();
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'a', embedding: [1, 0] },
            { content: 'b', embedding: [0, 1] },
          ],
        }),
        new VectorContext(), addOutput
      );

      const delOutput = new DelVectorOutput();
      await provider.delVector(
        new DelVectorInput({ ids: addOutput.ids }),
        new VectorContext(), delOutput
      );
      expect(delOutput.affectedCount).toBe(2);
    });

    it('should return 0 for non-existent ids', async () => {
      const delOutput = new DelVectorOutput();
      const result = await provider.delVector(
        new DelVectorInput({ ids: ['nonexistent-1', 'nonexistent-2'] }),
        new VectorContext(), delOutput
      );
      expect(result).toBe(true);
      expect(delOutput.affectedCount).toBe(0);
    });
  });

  // ============================================================
  // 3.3 delVectorByFilter
  // ============================================================
  describe('delVectorByFilter', () => {
    it('should delete vectors matching filter by EQ', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'a1', embedding: [1, 0], metadata: { lang: 'en' } },
            { content: 'a2', embedding: [0, 1], metadata: { lang: 'fr' } },
            { content: 'a3', embedding: [1, 1], metadata: { lang: 'en' } },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const filters: VectorFilter[] = [{ field: 'lang', operator: 'EQ', value: 'en' }];
      const output = new DelVectorByFilterOutput();
      const result = await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters }),
        new VectorContext(), output
      );
      expect(result).toBe(true);
      expect(output.affectedCount).toBe(2);
    });

    it('should delete vectors with numeric NE filter', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'n1', embedding: [1, 0], metadata: { score: 10 } },
            { content: 'n2', embedding: [0, 1], metadata: { score: 20 } },
            { content: 'n3', embedding: [1, 1], metadata: { score: 10 } },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const filters: VectorFilter[] = [{ field: 'score', operator: 'NE', value: 10 }];
      const output = new DelVectorByFilterOutput();
      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters }),
        new VectorContext(), output
      );
      expect(output.affectedCount).toBe(1);
    });

    it('should delete vectors with GT/GE/LT/LE numeric filters', async () => {
      const vectors = [
        { content: 'n1', embedding: [0.1], metadata: { count: 5 } },
        { content: 'n2', embedding: [0.2], metadata: { count: 15 } },
        { content: 'n3', embedding: [0.3], metadata: { count: 25 } },
        { content: 'n4', embedding: [0.4], metadata: { count: 35 } },
      ];

      await provider.addVector(
        new AddVectorInput({ vectors }),
        new VectorContext(), new AddVectorOutput()
      );
      const gtOutput = new DelVectorByFilterOutput();
      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters: [{ field: 'count', operator: 'GT', value: 20 }] }),
        new VectorContext(), gtOutput
      );
      expect(gtOutput.affectedCount).toBe(2);

      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters: [{ field: 'count', operator: 'IS_NOT_NULL' }] }),
        new VectorContext(), new DelVectorByFilterOutput()
      );

      await provider.addVector(
        new AddVectorInput({ vectors }),
        new VectorContext(), new AddVectorOutput()
      );
      const geOutput = new DelVectorByFilterOutput();
      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters: [{ field: 'count', operator: 'GE', value: 15 }] }),
        new VectorContext(), geOutput
      );
      expect(geOutput.affectedCount).toBe(3);

      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters: [{ field: 'count', operator: 'IS_NOT_NULL' }] }),
        new VectorContext(), new DelVectorByFilterOutput()
      );

      await provider.addVector(
        new AddVectorInput({ vectors }),
        new VectorContext(), new AddVectorOutput()
      );
      const ltOutput = new DelVectorByFilterOutput();
      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters: [{ field: 'count', operator: 'LT', value: 15 }] }),
        new VectorContext(), ltOutput
      );
      expect(ltOutput.affectedCount).toBe(1);

      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters: [{ field: 'count', operator: 'IS_NOT_NULL' }] }),
        new VectorContext(), new DelVectorByFilterOutput()
      );

      await provider.addVector(
        new AddVectorInput({ vectors }),
        new VectorContext(), new AddVectorOutput()
      );
      const leOutput = new DelVectorByFilterOutput();
      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters: [{ field: 'count', operator: 'LE', value: 15 }] }),
        new VectorContext(), leOutput
      );
      expect(leOutput.affectedCount).toBe(2);
    });

    it('should delete vectors with IN filter', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'v1', embedding: [1, 0], metadata: { category: 'A' } },
            { content: 'v2', embedding: [0, 1], metadata: { category: 'B' } },
            { content: 'v3', embedding: [1, 1], metadata: { category: 'C' } },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const filters: VectorFilter[] = [{ field: 'category', operator: 'IN', value: ['A', 'C'] }];
      const output = new DelVectorByFilterOutput();
      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters }),
        new VectorContext(), output
      );
      expect(output.affectedCount).toBe(2);
    });

    it('should delete vectors with IS_NULL/IS_NOT_NULL filter', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'with_valid_field', embedding: [1], metadata: { key: 'val' } },
            { content: 'with_null_field', embedding: [2], metadata: { optional_field: null } },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const nullOutput = new DelVectorByFilterOutput();
      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters: [{ field: 'optional_field', operator: 'IS_NULL' }] }),
        new VectorContext(), nullOutput
      );
      expect(nullOutput.affectedCount).toBe(2);

      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'has_key', embedding: [1], metadata: { key: 'val' } },
            { content: 'no_key', embedding: [2] },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const notNullOutput = new DelVectorByFilterOutput();
      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters: [{ field: 'key', operator: 'IS_NOT_NULL' }] }),
        new VectorContext(), notNullOutput
      );
      expect(notNullOutput.affectedCount).toBe(1);
    });

    it('should combine filters with AND logic (default)', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'x', embedding: [1, 0], metadata: { type: 'A', status: 'active' } },
            { content: 'y', embedding: [0, 1], metadata: { type: 'A', status: 'inactive' } },
            { content: 'z', embedding: [1, 1], metadata: { type: 'B', status: 'active' } },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const filters: VectorFilter[] = [
        { field: 'type', operator: 'EQ', value: 'A' },
        { field: 'status', operator: 'EQ', value: 'active', logic: 'AND' },
      ];
      const output = new DelVectorByFilterOutput();
      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters }),
        new VectorContext(), output
      );
      expect(output.affectedCount).toBe(1);
    });

    it('should combine filters with OR logic', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'x', embedding: [1, 0], metadata: { type: 'A' } },
            { content: 'y', embedding: [0, 1], metadata: { type: 'A' } },
            { content: 'z', embedding: [1, 1], metadata: { type: 'B' } },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const filters: VectorFilter[] = [
        { field: 'type', operator: 'EQ', value: 'A' },
        { field: 'type', operator: 'EQ', value: 'B', logic: 'OR' },
      ];
      const output = new DelVectorByFilterOutput();
      await provider.delVectorByFilter(
        new DelVectorByFilterInput({ filters }),
        new VectorContext(), output
      );
      expect(output.affectedCount).toBe(3);
    });
  });

  // ============================================================
  // 3.4 soVector (similarity search)
  // ============================================================
  describe('soVector', () => {
    it('should search and return similar vectors sorted by similarity', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'reference', embedding: [1, 0, 0, 0], user_id: 'user-1' },
            { content: 'orthogonal', embedding: [0, 1, 0, 0], user_id: 'user-1' },
            { content: 'similar', embedding: [0.9, 0.1, 0, 0], user_id: 'user-1' },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new SoVectorOutput();
      const result = await provider.soVector(
        new SoVectorInput({ query_param: { embedding: [1, 0, 0, 0], user_id: 'user-1' } }),
        new VectorContext(), output
      );
      expect(result).toBe(true);
      expect(output.success).toBe(true);
      expect(output.results).toHaveLength(3);
      expect(output.results[0].content).toBe('reference');
      expect(output.results[0].similarity).toBeCloseTo(1.0, 4);
      expect(output.results[1].content).toBe('similar');
    });

    it('should respect top_k parameter', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'a', embedding: [1, 0, 0], user_id: 'u1' },
            { content: 'b', embedding: [0.9, 0.1, 0], user_id: 'u1' },
            { content: 'c', embedding: [0.8, 0.2, 0], user_id: 'u1' },
            { content: 'd', embedding: [0.7, 0.3, 0], user_id: 'u1' },
            { content: 'e', embedding: [0.6, 0.4, 0], user_id: 'u1' },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({ query_param: { embedding: [1, 0, 0], top_k: 3, user_id: 'u1' } }),
        new VectorContext(), output
      );
      expect(output.results).toHaveLength(3);
    });

    it('should filter by similarity_threshold', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'very similar', embedding: [1, 0, 0], user_id: 'u1' },
            { content: 'low similarity', embedding: [0.3, 0.9, 0], user_id: 'u1' },
            { content: 'opposite', embedding: [-1, 0, 0], user_id: 'u1' },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({ query_param: { embedding: [1, 0, 0], similarity_threshold: 0.5, user_id: 'u1' } }),
        new VectorContext(), output
      );
      expect(output.results).toHaveLength(1);
      expect(output.results[0].content).toBe('very similar');
    });

    it('should filter by metadata conditions', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'en-a', embedding: [1, 0, 0], user_id: 'u1', metadata: { lang: 'en' } },
            { content: 'en-b', embedding: [0.99, 0.01, 0], user_id: 'u1', metadata: { lang: 'en' } },
            { content: 'fr-a', embedding: [0.98, 0.02, 0], user_id: 'u1', metadata: { lang: 'fr' } },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({
          query_param: {
            embedding: [1, 0, 0],
            user_id: 'u1',
            filters: [{ field: 'lang', operator: 'EQ', value: 'en' }],
          },
        }),
        new VectorContext(), output
      );
      expect(output.results).toHaveLength(2);
      expect(output.results.every(r => r.metadata && r.metadata.lang === 'en')).toBe(true);
    });

    it('should return empty results for no matches', async () => {
      const output = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({ query_param: { embedding: [1, 0, 0], user_id: 'nonexistent' } }),
        new VectorContext(), output
      );
      expect(output.results).toEqual([]);
    });

    it('should return only max one match per inserted vector', async () => {
      const e1 = [1, 0, 0, 0];
      const e2 = [0, 1, 0, 0];
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'vec1', embedding: e1, user_id: 'u' },
            { content: 'vec2', embedding: e2, user_id: 'u' },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output1 = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({ query_param: { embedding: e1, top_k: 1, user_id: 'u' } }),
        new VectorContext(), output1
      );
      expect(output1.results).toHaveLength(1);
      expect(output1.results[0].content).toBe('vec1');
    });
  });

  // ============================================================
  // 3.5 getVector
  // ============================================================
  describe('getVector', () => {
    it('should get an existing vector', async () => {
      const addOutput = new AddVectorOutput();
      await provider.addVector(
        new AddVectorInput({
          vectors: [{ id: 'gv-1', content: 'get test', embedding: [0.5, 0.5], user_id: 'user-1', metadata: { tag: 'test' } }],
        }),
        new VectorContext(), addOutput
      );

      const output = new GetVectorOutput();
      const result = await provider.getVector(
        new GetVectorInput({ id: 'gv-1' }),
        new VectorContext(), output
      );
      expect(result).toBe(true);
      expect(output.vector).toBeDefined();
      expect(output.vector!.content).toBe('get test');
      expect(output.vector!.embedding).toEqual([0.5, 0.5]);
      expect(output.vector!.user_id).toBe('user-1');
      expect(output.vector!.metadata).toEqual({ tag: 'test' });
      expect(output.vector!.created).toBeGreaterThan(0);
      expect(output.vector!.updated).toBeGreaterThan(0);
    });

    it('should return undefined for non-existent vector', async () => {
      const output = new GetVectorOutput();
      const result = await provider.getVector(
        new GetVectorInput({ id: 'does-not-exist' }),
        new VectorContext(), output
      );
      expect(result).toBe(true);
      expect(output.vector).toBeUndefined();
    });
  });

  // ============================================================
  // 3.6 countVector
  // ============================================================
  describe('countVector', () => {
    it('should count all vectors when no filters provided', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'a', embedding: [1, 0] },
            { content: 'b', embedding: [0, 1] },
            { content: 'c', embedding: [1, 1] },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new CountVectorOutput();
      const result = await provider.countVector(
        new CountVectorInput({}),
        new VectorContext(), output
      );
      expect(result).toBe(true);
      expect(output.count).toBe(3);
    });

    it('should count vectors with filters', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'x', embedding: [1], metadata: { type: 'A' } },
            { content: 'y', embedding: [2], metadata: { type: 'B' } },
            { content: 'z', embedding: [3], metadata: { type: 'A' } },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new CountVectorOutput();
      await provider.countVector(
        new CountVectorInput({ filters: [{ field: 'type', operator: 'EQ', value: 'A' }] }),
        new VectorContext(), output
      );
      expect(output.count).toBe(2);
    });

    it('should return 0 for empty database', async () => {
      const output = new CountVectorOutput();
      await provider.countVector(
        new CountVectorInput({}),
        new VectorContext(), output
      );
      expect(output.count).toBe(0);
    });

    it('should count with numeric GT filter', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'n1', embedding: [1], metadata: { score: 10 } },
            { content: 'n2', embedding: [2], metadata: { score: 50 } },
            { content: 'n3', embedding: [3], metadata: { score: 100 } },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new CountVectorOutput();
      await provider.countVector(
        new CountVectorInput({ filters: [{ field: 'score', operator: 'GT', value: 30 }] }),
        new VectorContext(), output
      );
      expect(output.count).toBe(2);
    });
  });

  // ============================================================
  // 3.7 visualizedVector
  // ============================================================
  describe('visualizedVector', () => {
    it('should return health scope data', async () => {
      const output = new VisualizedVectorOutput();
      await provider.visualizedVector(
        new VisualizedVectorInput({ scope: 'health' }),
        new VectorContext(), output
      );
      expect(output.success).toBe(true);
      expect(output.data).toBeDefined();
      expect(output.data!.connected).toBe(true);
      expect(typeof output.data!.responseTime).toBe('number');
      expect(output.data!.enabled).toBe(true);
    });

    it('should return volume scope data', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'v1', embedding: [0.1, 0.2, 0.3, 0.4] },
            { content: 'v2', embedding: [0.5, 0.6, 0.7, 0.8] },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new VisualizedVectorOutput();
      await provider.visualizedVector(
        new VisualizedVectorInput({ scope: 'volume' }),
        new VectorContext(), output
      );
      expect(output.success).toBe(true);
      expect(output.data).toBeDefined();
      expect(output.data!.totalVectors).toBe(2);
      expect(output.data!.collections).toBe(1);
      expect(output.data!.dimension).toBe(4);
    });

    it('should return diskUsage scope data', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [{ content: 'test data here', embedding: [0.1, 0.2, 0.3] }],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new VisualizedVectorOutput();
      await provider.visualizedVector(
        new VisualizedVectorInput({ scope: 'diskUsage' }),
        new VectorContext(), output
      );
      expect(output.success).toBe(true);
      expect(output.data).toBeDefined();
      expect(output.data!.rowCount).toBe(1);
      expect(typeof output.data!.estimatedBytes).toBe('number');
    });

    it('should return volume with zero count for empty DB', async () => {
      const output = new VisualizedVectorOutput();
      await provider.visualizedVector(
        new VisualizedVectorInput({ scope: 'volume' }),
        new VectorContext(), output
      );
      expect(output.success).toBe(true);
      expect(output.data!.totalVectors).toBe(0);
      expect(output.data!.dimension).toBe(0);
    });

    it('should fail for unknown scope', async () => {
      const output = new VisualizedVectorOutput();
      await provider.visualizedVector(
        new VisualizedVectorInput({ scope: 'unknown' as any }),
        new VectorContext(), output
      );
      expect(output.success).toBe(false);
    });
  });

  // ============================================================
  // 3.7.2 enableVectorDB
  // ============================================================
  describe('enableVectorDB', () => {
    it('should be enabled by default on init', () => {
      expect(provider.isEnabled()).toBe(true);
    });

    it('should disable the vector DB', async () => {
      const output = new EnableVectorDBOutput();
      await provider.enableVectorDB(
        new EnableVectorDBInput({ enable: false }),
        new VectorContext(), output
      );
      expect(output.success).toBe(true);
      expect(provider.isEnabled()).toBe(false);
    });

    it('should re-enable the vector DB after disabling', async () => {
      await provider.enableVectorDB(
        new EnableVectorDBInput({ enable: false }),
        new VectorContext(), new EnableVectorDBOutput()
      );
      expect(provider.isEnabled()).toBe(false);

      await provider.enableVectorDB(
        new EnableVectorDBInput({ enable: true }),
        new VectorContext(), new EnableVectorDBOutput()
      );
      expect(provider.isEnabled()).toBe(true);
    });

    it('should persist enabled state', async () => {
      const rawDb = getDatabase();
      const dbWrapper = createDBWrapper(rawDb);

      await provider.enableVectorDB(
        new EnableVectorDBInput({ enable: false }),
        new VectorContext(), new EnableVectorDBOutput()
      );

      const row = await dbWrapper.get<{ config_value: string }>(
        `SELECT config_value FROM vectordb_config WHERE config_key = 'enabled'`
      );
      expect(row).toBeDefined();
      expect(row!.config_value).toBe('false');
    });

    it('should reject operations when disabled', async () => {
      await provider.enableVectorDB(
        new EnableVectorDBInput({ enable: false }),
        new VectorContext(), new EnableVectorDBOutput()
      );

      const addOutput = new AddVectorOutput();
      const result = await provider.addVector(
        new AddVectorInput({ vectors: [{ content: 'test', embedding: [1, 0] }] }),
        new VectorContext(), addOutput
      );
      expect(result).toBe(false);
      expect(addOutput.error).toContain('disabled');
    });

    it('should reject add, del, search, count when disabled', async () => {
      await provider.enableVectorDB(
        new EnableVectorDBInput({ enable: false }),
        new VectorContext(), new EnableVectorDBOutput()
      );

      const delOutput = new DelVectorOutput();
      await provider.delVector(
        new DelVectorInput({ ids: ['test'] }),
        new VectorContext(), delOutput
      );
      expect(delOutput.success).toBe(false);

      const soOutput = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({ query_param: { embedding: [1, 0] } }),
        new VectorContext(), soOutput
      );
      expect(soOutput.success).toBe(false);

      const countOutput = new CountVectorOutput();
      await provider.countVector(
        new CountVectorInput({}),
        new VectorContext(), countOutput
      );
      expect(countOutput.success).toBe(false);
    });
  });

  // ============================================================
  // 3.7.3 closeVectorDB
  // ============================================================
  describe('closeVectorDB', () => {
    it('should close the vector DB (terminal state)', async () => {
      const output = new CloseVectorDBOutput();
      await provider.closeVectorDB(
        new CloseVectorDBInput(),
        new VectorContext(), output
      );
      expect(output.success).toBe(true);
      expect(provider.isClosed()).toBe(true);
      expect(provider.isEnabled()).toBe(false);
    });

    it('should reject re-enabling after close (terminal)', async () => {
      await provider.closeVectorDB(
        new CloseVectorDBInput(),
        new VectorContext(), new CloseVectorDBOutput()
      );

      const enableOutput = new EnableVectorDBOutput();
      const result = await provider.enableVectorDB(
        new EnableVectorDBInput({ enable: true }),
        new VectorContext(), enableOutput
      );
      expect(result).toBe(false);
      expect(enableOutput.error).toContain('terminal');
    });

    it('should reject all operations after close', async () => {
      await provider.closeVectorDB(
        new CloseVectorDBInput(),
        new VectorContext(), new CloseVectorDBOutput()
      );

      const addOutput = new AddVectorOutput();
      await provider.addVector(
        new AddVectorInput({ vectors: [{ content: 'test', embedding: [1] }] }),
        new VectorContext(), addOutput
      );
      expect(addOutput.success).toBe(false);
      expect(addOutput.error).toContain('closed');

      const delOutput = new DelVectorOutput();
      await provider.delVector(
        new DelVectorInput({ ids: ['test'] }),
        new VectorContext(), delOutput
      );
      expect(delOutput.success).toBe(false);

      const soOutput = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({ query_param: { embedding: [1] } }),
        new VectorContext(), soOutput
      );
      expect(soOutput.success).toBe(false);

      const countOutput = new CountVectorOutput();
      await provider.countVector(
        new CountVectorInput({}),
        new VectorContext(), countOutput
      );
      expect(countOutput.success).toBe(false);
    });

    it('should persist enabled=false on close', async () => {
      await provider.closeVectorDB(
        new CloseVectorDBInput(),
        new VectorContext(), new CloseVectorDBOutput()
      );

      const rawDb = getDatabase();
      const dbWrapper = createDBWrapper(rawDb);
      const row = await dbWrapper.get<{ config_value: string }>(
        `SELECT config_value FROM vectordb_config WHERE config_key = 'enabled'`
      );
      expect(row!.config_value).toBe('false');
    });
  });

  // ============================================================
  // Cosine similarity
  // ============================================================
  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const sim = provider.cosineSimilarity([1, 0, 0], [1, 0, 0]);
      expect(sim).toBeCloseTo(1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const sim = provider.cosineSimilarity([1, 0], [0, 1]);
      expect(sim).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const sim = provider.cosineSimilarity([1, 0], [-1, 0]);
      expect(sim).toBeCloseTo(-1, 5);
    });

    it('should return 0 for zero vector', () => {
      const sim = provider.cosineSimilarity([0, 0, 0], [1, 0, 0]);
      expect(sim).toBe(0);
    });

    it('should return 0 for mismatched dimensions', () => {
      const sim = provider.cosineSimilarity([1, 0], [1, 0, 0]);
      expect(sim).toBe(0);
    });
  });

  // ============================================================
  // Context / TraceId propagation
  // ============================================================
  describe('context and trace', () => {
    it('should propagate traceId through Input', async () => {
      const input = new AddVectorInput({
        vectors: [{ content: 'trace test', embedding: [0.1, 0.2] }],
        traceId: 'custom-trace-123',
      });
      expect(input.traceId).toBe('custom-trace-123');

      const output = new AddVectorOutput();
      await provider.addVector(input, new VectorContext(), output);
      expect(output.success).toBe(true);
    });

    it('should auto-generate traceId', () => {
      const input1 = new AddVectorInput({ vectors: [{ content: 'a', embedding: [1] }] });
      const input2 = new AddVectorInput({ vectors: [{ content: 'b', embedding: [2] }] });
      expect(input1.traceId).toBeTruthy();
      expect(input2.traceId).toBeTruthy();
      expect(input1.traceId).not.toBe(input2.traceId);
    });
  });

  // ============================================================
  // Edge cases and integration scenarios
  // ============================================================
  describe('integration scenarios', () => {
    it('full lifecycle: add -> search -> get -> count -> delete -> count', async () => {
      const addOutput = new AddVectorOutput();
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { id: 'life-1', content: 'lifecycle test 1', embedding: [1, 0, 0, 0] },
            { id: 'life-2', content: 'lifecycle test 2', embedding: [0.8, 0.2, 0, 0] },
          ],
        }),
        new VectorContext(), addOutput
      );
      expect(addOutput.ids).toEqual(['life-1', 'life-2']);

      const soOutput = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({ query_param: { embedding: [1, 0, 0, 0], top_k: 10 } }),
        new VectorContext(), soOutput
      );
      expect(soOutput.results).toHaveLength(2);
      expect(soOutput.results[0].id).toBe('life-1');

      const getOutput = new GetVectorOutput();
      await provider.getVector(
        new GetVectorInput({ id: 'life-1' }),
        new VectorContext(), getOutput
      );
      expect(getOutput.vector!.content).toBe('lifecycle test 1');

      const countOutput1 = new CountVectorOutput();
      await provider.countVector(new CountVectorInput({}), new VectorContext(), countOutput1);
      expect(countOutput1.count).toBe(2);

      const delOutput = new DelVectorOutput();
      await provider.delVector(
        new DelVectorInput({ ids: ['life-1'] }),
        new VectorContext(), delOutput
      );
      expect(delOutput.affectedCount).toBe(1);

      const countOutput2 = new CountVectorOutput();
      await provider.countVector(new CountVectorInput({}), new VectorContext(), countOutput2);
      expect(countOutput2.count).toBe(1);
    });

    it('should handle large number of vectors', async () => {
      const vectors = Array.from({ length: 100 }, (_, i) => ({
        content: `vector-${i}`,
        embedding: [i / 100, (100 - i) / 100, 0, 0],
      }));

      const addOutput = new AddVectorOutput();
      await provider.addVector(
        new AddVectorInput({ vectors }),
        new VectorContext(), addOutput
      );
      expect(addOutput.ids).toHaveLength(100);

      const countOutput = new CountVectorOutput();
      await provider.countVector(new CountVectorInput({}), new VectorContext(), countOutput);
      expect(countOutput.count).toBe(100);

      const soOutput = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({ query_param: { embedding: [1, 0, 0, 0], top_k: 5 } }),
        new VectorContext(), soOutput
      );
      expect(soOutput.results).toHaveLength(5);
    });

    it('should search across all vectors when no user_id specified', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'u1-vec', embedding: [1, 0, 0], user_id: 'user-1' },
            { content: 'u2-vec', embedding: [0, 1, 0], user_id: 'user-2' },
            { content: 'u3-vec', embedding: [0, 0, 1], user_id: 'user-3' },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({ query_param: { embedding: [1, 0, 0] } }),
        new VectorContext(), output
      );
      expect(output.results).toHaveLength(3);
      expect(output.results[0].user_id).toBe('user-1');
    });

    it('should filter search by user_id', async () => {
      await provider.addVector(
        new AddVectorInput({
          vectors: [
            { content: 'u1-vec', embedding: [1, 0, 0], user_id: 'user-1' },
            { content: 'u2-vec', embedding: [0.9, 0, 0], user_id: 'user-2' },
          ],
        }),
        new VectorContext(), new AddVectorOutput()
      );

      const output = new SoVectorOutput();
      await provider.soVector(
        new SoVectorInput({ query_param: { embedding: [1, 0, 0], user_id: 'user-2' } }),
        new VectorContext(), output
      );
      expect(output.results).toHaveLength(1);
      expect(output.results[0].content).toBe('u2-vec');
    });
  });
});

describe('VectorDBProvider AOP proxy', () => {
  it('should wrap target methods with AOP logging', async () => {
    class TestClass {
      async testMethod(_a: number, _b: string): Promise<string> {
        return 'result';
      }
      async throwMethod(): Promise<string> {
        throw new Error('test error');
      }
      syncMethod(val: number): number {
        return val * 2;
      }
    }
    const target = new TestClass();
    const proxied = aopProxy(target, 'TestModule');

    const result = await proxied.testMethod(42, 'hello');
    expect(result).toBe('result');

    await expect(proxied.throwMethod()).rejects.toThrow('test error');

    const syncResult = proxied.syncMethod(5);
    expect(syncResult).toBe(10);
  });

  it('should not proxy non-function properties', () => {
    const target = { name: 'test', value: 42 };
    const proxied = aopProxy(target, 'TestModule');
    expect(proxied.name).toBe('test');
    expect(proxied.value).toBe(42);
  });
});

describe('VectorDBProvider type constructors', () => {
  it('should construct Input types with traceId', () => {
    const input = new AddVectorInput({ vectors: [{ content: 'c', embedding: [1] }], traceId: 'tr-1' });
    expect(input.traceId).toBe('tr-1');
    expect(input.vectors).toHaveLength(1);
  });

  it('should construct Output types with defaults', () => {
    const output = new AddVectorOutput();
    expect(output.success).toBe(true);
    expect(output.ids).toEqual([]);
    expect(output.error).toBeUndefined();
  });

  it('should construct VectorContext with defaults', () => {
    const ctx = new VectorContext({ userId: 'u1' });
    expect(ctx.userId).toBe('u1');
    expect(ctx.timestamp).toBeGreaterThan(0);
  });

  it('should construct all Input/Output types', () => {
    expect(new DelVectorInput({ ids: ['a'] }).ids).toEqual(['a']);
    expect(new DelVectorByFilterInput({ filters: [{ field: 'f', operator: 'EQ' }] }).filters).toHaveLength(1);
    expect(new SoVectorInput({ query_param: { embedding: [1] } }).query_param.embedding).toEqual([1]);
    expect(new GetVectorInput({ id: 'x' }).id).toBe('x');
    expect(new CountVectorInput({}).filters).toBeUndefined();
    expect(new VisualizedVectorInput({ scope: 'health' }).scope).toBe('health');
    expect(new EnableVectorDBInput({ enable: true }).enable).toBe(true);
    expect(new CloseVectorDBInput().traceId).toBeTruthy();
  });
});
