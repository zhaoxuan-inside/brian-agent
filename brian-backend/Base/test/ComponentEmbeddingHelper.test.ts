import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { MCPSchemaInitializer } from '../MCPProvider/infrastructure/MCPSchemaInitializer';
import { SkillSchemaInitializer } from '../SkillProvider/infrastructure/SkillSchemaInitializer';
import { SoulSchemaInitializer } from '../SoulProvider/infrastructure/SoulSchemaInitializer';
import { PromptsSchemaInitializer } from '../PromptsProvider/infrastructure/PromptsSchemaInitializer';
import {
  computeContentHash,
  syncComponentEmbedding,
  deleteComponentEmbedding,
  batchGetOrComputeEmbeddings,
  syncComponentExamples,
  deleteComponentExamples,
  batchGetExampleEmbeddings,
  AGENT_EMBEDDING_TABLE,
  AGENT_EXAMPLE_EMBEDDING_TABLE,
  MCP_EMBEDDING_TABLE,
  MCP_EXAMPLE_EMBEDDING_TABLE,
  SKILL_EMBEDDING_TABLE,
  SKILL_EXAMPLE_EMBEDDING_TABLE,
  PROMPT_TEMPLATE_EMBEDDING_TABLE,
  PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE,
  SOUL_EMBEDDING_TABLE,
  SOUL_EXAMPLE_EMBEDDING_TABLE,
} from '../shared/match';
import { Operator } from '../shared/query';

describe('ComponentEmbeddingHelper & xxx_embedding_record', () => {
  let tempDir: string;
  let sqlitePath: string;
  let relationDb: RelationDBAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-embedding-test-'));
    sqlitePath = path.join(tempDir, 'test.db');
    relationDb = new RelationDBAccess({ dbPath: sqlitePath });
    await relationDb.initialize();
    new MCPSchemaInitializer(relationDb).init();
    new SkillSchemaInitializer(relationDb).init();
    new SoulSchemaInitializer(relationDb).init();
    new PromptsSchemaInitializer(relationDb).init();

    // Agent embedding and example table init
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${AGENT_EMBEDDING_TABLE}" (
        "id" TEXT PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "agent_id" TEXT NOT NULL UNIQUE,
        "model" TEXT NOT NULL DEFAULT '',
        "dimension" INTEGER NOT NULL DEFAULT 0,
        "content_hash" TEXT NOT NULL DEFAULT '',
        "content" TEXT NOT NULL DEFAULT '',
        "embedding" TEXT NOT NULL DEFAULT '',
        "trace_id" TEXT NOT NULL DEFAULT ''
      )
    `);
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${AGENT_EXAMPLE_EMBEDDING_TABLE}" (
        "id" TEXT PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "agent_id" TEXT NOT NULL,
        "example_text" TEXT NOT NULL,
        "model" TEXT NOT NULL DEFAULT '',
        "dimension" INTEGER NOT NULL DEFAULT 0,
        "content_hash" TEXT NOT NULL DEFAULT '',
        "embedding" TEXT NOT NULL DEFAULT '',
        "trace_id" TEXT NOT NULL DEFAULT ''
      )
    `);
  });

  afterEach(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('computeContentHash', () => {
    it('should compute deterministic SHA-256 hash', () => {
      const h1 = computeContentHash('test content');
      const h2 = computeContentHash('test content');
      expect(h1).toBe(h2);
      expect(h1.length).toBe(64);
    });

    it('should trim whitespace before computing hash', () => {
      const h1 = computeContentHash('test content');
      const h2 = computeContentHash('  test content  ');
      expect(h1).toBe(h2);
    });
  });

  describe('syncComponentEmbedding', () => {
    it('should insert new embedding record when component is added', async () => {
      const fakeEmbedFn = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

      const ok = await syncComponentEmbedding({
        relationDb,
        table: MCP_EMBEDDING_TABLE,
        targetIdField: 'mcp_id',
        targetId: 'mcp_001',
        text: 'FileSystem MCP: manage files',
        embedFn: fakeEmbedFn,
      });

      expect(ok).toBe(true);
      expect(fakeEmbedFn).toHaveBeenCalledTimes(1);

      const row = await relationDb.selectOne(MCP_EMBEDDING_TABLE, [
        { field: 'mcp_id', operator: Operator.EQ, value: 'mcp_001' },
      ]);
      expect(row).not.toBeNull();
      expect(row?.mcp_id).toBe('mcp_001');
      expect(row?.dimension).toBe(3);
      expect(JSON.parse(row?.embedding)).toEqual([0.1, 0.2, 0.3]);
    });

    it('should reuse existing embedding without calling model when text unchanged', async () => {
      const fakeEmbedFn = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

      await syncComponentEmbedding({
        relationDb,
        table: SKILL_EMBEDDING_TABLE,
        targetIdField: 'skill_id',
        targetId: 'skill_001',
        text: 'Python runner skill',
        embedFn: fakeEmbedFn,
      });
      expect(fakeEmbedFn).toHaveBeenCalledTimes(1);

      // Second sync with identical text
      const ok2 = await syncComponentEmbedding({
        relationDb,
        table: SKILL_EMBEDDING_TABLE,
        targetIdField: 'skill_id',
        targetId: 'skill_001',
        text: 'Python runner skill',
        embedFn: fakeEmbedFn,
      });
      expect(ok2).toBe(true);
      expect(fakeEmbedFn).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should update embedding when description changes', async () => {
      const fakeEmbedFn = vi
        .fn()
        .mockResolvedValueOnce([0.1, 0.2])
        .mockResolvedValueOnce([0.5, 0.6]);

      await syncComponentEmbedding({
        relationDb,
        table: SOUL_EMBEDDING_TABLE,
        targetIdField: 'soul_id',
        targetId: 'soul_001',
        text: 'Initial soul brief',
        embedFn: fakeEmbedFn,
      });

      // Update text
      const ok = await syncComponentEmbedding({
        relationDb,
        table: SOUL_EMBEDDING_TABLE,
        targetIdField: 'soul_id',
        targetId: 'soul_001',
        text: 'Updated soul brief with new traits',
        embedFn: fakeEmbedFn,
      });

      expect(ok).toBe(true);
      expect(fakeEmbedFn).toHaveBeenCalledTimes(2);

      const row = await relationDb.selectOne(SOUL_EMBEDDING_TABLE, [
        { field: 'soul_id', operator: Operator.EQ, value: 'soul_001' },
      ]);
      expect(JSON.parse(row?.embedding)).toEqual([0.5, 0.6]);
    });

    it('should delete old embedding record when embed model is unavailable', async () => {
      // First create successful embedding
      const fakeEmbedFnSuccess = vi.fn().mockResolvedValue([0.1, 0.2]);
      await syncComponentEmbedding({
        relationDb,
        table: PROMPT_TEMPLATE_EMBEDDING_TABLE,
        targetIdField: 'prompt_template_id',
        targetId: 'pt_001',
        text: 'Original prompt description',
        embedFn: fakeEmbedFnSuccess,
      });

      const before = await relationDb.selectOne(PROMPT_TEMPLATE_EMBEDDING_TABLE, [
        { field: 'prompt_template_id', operator: Operator.EQ, value: 'pt_001' },
      ]);
      expect(before).not.toBeNull();

      // Now update text while embed model throws error
      const fakeEmbedFnFail = vi.fn().mockRejectedValue(new Error('Model timeout / unavailable'));
      const ok = await syncComponentEmbedding({
        relationDb,
        table: PROMPT_TEMPLATE_EMBEDDING_TABLE,
        targetIdField: 'prompt_template_id',
        targetId: 'pt_001',
        text: 'Modified prompt description',
        embedFn: fakeEmbedFnFail,
      });

      expect(ok).toBe(false);

      // Stale record must be safely deleted
      const after = await relationDb.selectOne(PROMPT_TEMPLATE_EMBEDDING_TABLE, [
        { field: 'prompt_template_id', operator: Operator.EQ, value: 'pt_001' },
      ]);
      expect(after).toBeNull();
    });
  });

  describe('deleteComponentEmbedding', () => {
    it('should delete embedding record when component is deleted', async () => {
      const fakeEmbedFn = vi.fn().mockResolvedValue([0.1, 0.2]);
      await syncComponentEmbedding({
        relationDb,
        table: AGENT_EMBEDDING_TABLE,
        targetIdField: 'agent_id',
        targetId: 'agent_001',
        text: 'Code reviewer agent',
        embedFn: fakeEmbedFn,
      });

      await deleteComponentEmbedding({
        relationDb,
        table: AGENT_EMBEDDING_TABLE,
        targetIdField: 'agent_id',
        targetId: 'agent_001',
      });

      const row = await relationDb.selectOne(AGENT_EMBEDDING_TABLE, [
        { field: 'agent_id', operator: Operator.EQ, value: 'agent_001' },
      ]);
      expect(row).toBeNull();
    });
  });

  describe('batchGetOrComputeEmbeddings', () => {
    it('should batch fetch precomputed embeddings and lazy compute missing ones', async () => {
      const fakeEmbedFn = vi.fn().mockImplementation(async (text: string) => {
        if (text.includes('item1')) return [1, 0, 0];
        if (text.includes('item2')) return [0, 1, 0];
        if (text.includes('item3')) return [0, 0, 1];
        return [0.5, 0.5, 0.5];
      });

      // Pre-populate item1
      await syncComponentEmbedding({
        relationDb,
        table: MCP_EMBEDDING_TABLE,
        targetIdField: 'mcp_id',
        targetId: 'mcp_item1',
        text: 'mcp item1 tool',
        embedFn: fakeEmbedFn,
      });
      expect(fakeEmbedFn).toHaveBeenCalledTimes(1);

      // Batch query item1 (cached), item2 (missing -> lazy compute), item3 (missing -> lazy compute)
      const res = await batchGetOrComputeEmbeddings({
        relationDb,
        table: MCP_EMBEDDING_TABLE,
        targetIdField: 'mcp_id',
        items: [
          { id: 'mcp_item1', text: 'mcp item1 tool' },
          { id: 'mcp_item2', text: 'mcp item2 tool' },
          { id: 'mcp_item3', text: 'mcp item3 tool' },
        ],
        embedFn: fakeEmbedFn,
      });

      expect(res.size).toBe(3);
      expect(res.get('mcp_item1')).toEqual([1, 0, 0]);
      expect(res.get('mcp_item2')).toEqual([0, 1, 0]);
      expect(res.get('mcp_item3')).toEqual([0, 0, 1]);

      // Verify item2 and item3 were persisted to db
      const saved2 = await relationDb.selectOne(MCP_EMBEDDING_TABLE, [
        { field: 'mcp_id', operator: Operator.EQ, value: 'mcp_item2' },
      ]);
      expect(saved2).not.toBeNull();
      expect(JSON.parse(saved2?.embedding)).toEqual([0, 1, 0]);
    });
  });

  describe('syncComponentExamples & batchGetExampleEmbeddings', () => {
    it('should sync, persist and batch fetch few-shot example embeddings', async () => {
      const fakeEmbedFn = vi.fn().mockImplementation(async (text: string) => {
        if (text.includes('天气')) return [1, 0, 0];
        if (text.includes('气温')) return [0.9, 0.1, 0];
        return [0, 1, 0];
      });

      const ok = await syncComponentExamples({
        relationDb,
        table: SKILL_EXAMPLE_EMBEDDING_TABLE,
        targetIdField: 'skill_id',
        targetId: 'weather_skill',
        examples: ['查询北京天气', '明天上海气温怎么样'],
        embedFn: fakeEmbedFn,
      });

      expect(ok).toBe(true);
      expect(fakeEmbedFn).toHaveBeenCalledTimes(2);

      const map = await batchGetExampleEmbeddings({
        relationDb,
        table: SKILL_EXAMPLE_EMBEDDING_TABLE,
        targetIdField: 'skill_id',
        targetIds: ['weather_skill', 'non_existing'],
      });

      expect(map.size).toBe(1);
      const list = map.get('weather_skill');
      expect(list).toHaveLength(2);
      expect(list![0]).toEqual([1, 0, 0]);
      expect(list![1]).toEqual([0.9, 0.1, 0]);
    });

    it('should prune obsolete examples when examples list changes', async () => {
      const fakeEmbedFn = vi.fn().mockResolvedValue([0.5, 0.5]);

      await syncComponentExamples({
        relationDb,
        table: MCP_EXAMPLE_EMBEDDING_TABLE,
        targetIdField: 'mcp_id',
        targetId: 'mcp_sql',
        examples: ['执行查询 SQL', '查看表结构'],
        embedFn: fakeEmbedFn,
      });

      let rows = await relationDb.select(MCP_EXAMPLE_EMBEDDING_TABLE, {
        conditions: [{ field: 'mcp_id', operator: Operator.EQ, value: 'mcp_sql' }],
      });
      expect(rows).toHaveLength(2);

      // Now sync with only 1 example
      await syncComponentExamples({
        relationDb,
        table: MCP_EXAMPLE_EMBEDDING_TABLE,
        targetIdField: 'mcp_id',
        targetId: 'mcp_sql',
        examples: ['执行查询 SQL'],
        embedFn: fakeEmbedFn,
      });

      rows = await relationDb.select(MCP_EXAMPLE_EMBEDDING_TABLE, {
        conditions: [{ field: 'mcp_id', operator: Operator.EQ, value: 'mcp_sql' }],
      });
      expect(rows).toHaveLength(1);
      expect((rows[0] as any).example_text).toBe('执行查询 SQL');
    });

    it('should delete all examples when deleteComponentExamples is called', async () => {
      const fakeEmbedFn = vi.fn().mockResolvedValue([0.5, 0.5]);

      await syncComponentExamples({
        relationDb,
        table: SOUL_EXAMPLE_EMBEDDING_TABLE,
        targetIdField: 'soul_id',
        targetId: 'soul_coder',
        examples: ['写一段快速排序', '解释单例模式'],
        embedFn: fakeEmbedFn,
      });

      await deleteComponentExamples({
        relationDb,
        table: SOUL_EXAMPLE_EMBEDDING_TABLE,
        targetIdField: 'soul_id',
        targetId: 'soul_coder',
      });

      const rows = await relationDb.select(SOUL_EXAMPLE_EMBEDDING_TABLE, {
        conditions: [{ field: 'soul_id', operator: Operator.EQ, value: 'soul_coder' }],
      });
      expect(rows).toHaveLength(0);
    });
  });
});
