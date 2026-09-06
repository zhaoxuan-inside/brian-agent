import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidationError, InfoType, IdGenerator, InsertDBInput, InsertDBOutput, DBContext } from '@brian-agent/base';
import { MemoryService } from '../Memory/application/MemoryService';
import {
  MemoryContext,
  ListMemoryInput, ListMemoryOutput,
  SearchMemoryInput, SearchMemoryOutput,
  DeleteMemoryInput, DeleteMemoryOutput,
  ListMemoryTagsInput, ListMemoryTagsOutput,
  GetMemoryStatsInput, GetMemoryStatsOutput,
  GetMemoryHeatmapInput, GetMemoryHeatmapOutput,
} from '../Memory/domain/types';
import { setupRealTestEnvironment, cleanupTempDirs } from './real-test-helpers';
import type { RealTestContext } from './real-test-helpers';

function ctx(): MemoryContext { return new MemoryContext(); }

async function insertInfoRaw(
  testCtx: RealTestContext,
  infoId: string,
  info: string,
  infoType: string,
  role: string,
  sessionId = 'sess-mem',
): Promise<void> {
  const now = IdGenerator.now();
  await testCtx.relationDb.insertDB(
    Object.assign(new InsertDBInput(), {
      table: 'info_raw',
      data: [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'session_id', value: sessionId },
        { field: 'work_id', value: 'work-mem' },
        { field: 'interact_id', value: 'interact-mem' },
        { field: 'info_id', value: infoId },
        { field: 'info_type', value: infoType },
        { field: 'info_creator_role', value: role },
        { field: 'info_creator_id', value: '' },
        { field: 'info', value: info },
        { field: 'info_length', value: info.length },
        { field: 'pin', value: 0 },
      ],
    }),
    new InsertDBOutput(),
    new DBContext(),
  );
}

describe('MemoryService', () => {
  let testCtx: RealTestContext;
  let service: MemoryService;

  beforeEach(async () => {
    testCtx = await setupRealTestEnvironment();
    service = new MemoryService(testCtx.relationDb, testCtx.infoCore, testCtx.graphDBAccess);
  });

  afterEach(() => {
    cleanupTempDirs();
  });

  it('TC-MEM-001: list returns empty page when info_raw has no rows', async () => {
    const output = new ListMemoryOutput();
    await service.soMemoryList(new ListMemoryInput(), output, ctx());
    expect(output.memories).toEqual([]);
    expect(output.has_more).toBe(false);
    expect(output.next_cursor).toBeNull();
  });

  it('TC-MEM-002: list maps info_raw rows to memory items', async () => {
    const now = IdGenerator.now();
    const infoId = IdGenerator.generate();
    await insertInfoRaw(testCtx, infoId, 'hello memory', InfoType.RESPONSE, 'ASSISTANT', 'sess-mem-1');
    testCtx.relationDb.executeRaw(
      'INSERT INTO "info_tag" ("id","created","updated","info_id","tag") VALUES (?,?,?,?,?)',
      [IdGenerator.generate(), now, now, infoId, 'test-tag'],
    );
    const output = new ListMemoryOutput();
    await service.soMemoryList(Object.assign(new ListMemoryInput(), { limit: 10 }), output, ctx());
    expect(output.memories.length).toBeGreaterThanOrEqual(1);
    const item = output.memories.find((m) => m.id === infoId);
    expect(item?.content).toBe('hello memory');
    expect(item?.tags).toContain('test-tag');
  });

  it('TC-MEM-003: search filters by keyword', async () => {
    await insertInfoRaw(testCtx, IdGenerator.generate(), 'unique-keyword-xyz', InfoType.REQUEST, 'USER', 'sess-mem-2');
    const output = new SearchMemoryOutput();
    await service.searchMemory(Object.assign(new SearchMemoryInput(), { keyword: 'unique-keyword-xyz' }), output, ctx());
    expect(output.memories.some((m) => m.content.includes('unique-keyword-xyz'))).toBe(true);
  });

  it('TC-MEM-004: delMemory rejects empty info_ids', async () => {
    await expect(
      service.delMemory(new DeleteMemoryInput(), new DeleteMemoryOutput(), ctx()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('TC-MEM-005: soMemoryTags aggregates tags', async () => {
    const now = IdGenerator.now();
    const infoId = IdGenerator.generate();
    await insertInfoRaw(testCtx, infoId, 'x', InfoType.RESPONSE, 'ASSISTANT', 'sess-mem-3');
    testCtx.relationDb.executeRaw(
      'INSERT INTO "info_tag" ("id","created","updated","info_id","tag") VALUES (?,?,?,?,?)',
      [IdGenerator.generate(), now, now, infoId, 'alpha-tag'],
    );
    const output = new ListMemoryTagsOutput();
    await service.soMemoryTags(new ListMemoryTagsInput(), output, ctx());
    expect(output.tags).toContain('alpha-tag');
  });

  it('TC-MEM-006: heatmap rejects invalid month', async () => {
    await expect(
      service.soMemoryHeatmap(Object.assign(new GetMemoryHeatmapInput(), { year: 2026, month: 13 }), new GetMemoryHeatmapOutput(), ctx()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('TC-MEM-007: stats returns totals', async () => {
    const output = new GetMemoryStatsOutput();
    await service.soMemoryStats(new GetMemoryStatsInput(), output, ctx());
    expect(output.totalMemories).toBeGreaterThanOrEqual(0);
    expect(typeof output.byType).toBe('object');
  });
});
