import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationError } from '@brian-agent/base';
import { AgentContextAccess } from '../AgentContext';
import type { Logger } from '@brian-agent/base';
import {
  AgentContextContext,
  BuildAgentContextInput,
  BuildAgentContextOutput,
  GetContextByTraceInput,
  GetContextByTraceOutput,
  GetContextByAgentInput,
  GetContextByAgentOutput,
  GetContextDetailInput,
  GetContextDetailOutput,
  ConfigAgentContextInput,
  ConfigAgentContextOutput,
  AGENT_CONTEXT_TABLE,
  AGENT_CONTEXT_ITEM_TABLE,
  AGENT_CONTEXT_CONFIG_TABLE,
  DEFAULT_MAX_CONTEXT_ITEMS,
  DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE,
} from '../AgentContext';

const NOOP_LOGGER: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
};

interface MockContextItem {
  info_id: string;
  info: string;
}

interface MockConfigRow {
  id: string;
  max_context_items: number;
  enable_snapshot_persistence: number;
}

interface MockSnapshotRow {
  id: string;
  context_id: string;
  session_id: string;
  agent_id: string;
  work_id: string;
  trace_id: string;
  context_total_count: number;
  context_sources_summary: string;
}

interface MockItemRow {
  id: string;
  context_id: string;
  info_id: string;
  source: string;
}

function makeMockSnapshotRow(overrides: Partial<MockSnapshotRow> = {}): MockSnapshotRow {
  return {
    id: 'snap-1',
    context_id: 'ctx-1',
    session_id: 'sess-1',
    agent_id: 'agent-1',
    work_id: 'work-1',
    trace_id: 'trace-1',
    context_total_count: 3,
    context_sources_summary: JSON.stringify({ unknown: 3 }),
    ...overrides,
  };
}

function makeMockItemRow(overrides: Partial<MockItemRow> = {}): MockItemRow {
  return {
    id: 'item-1',
    context_id: 'ctx-1',
    info_id: 'info-1',
    source: 'unknown',
    ...overrides,
  };
}

function makeDefaultConfig(overrides: Partial<MockConfigRow> = {}): MockConfigRow {
  return {
    id: 'cfg-1',
    max_context_items: DEFAULT_MAX_CONTEXT_ITEMS,
    enable_snapshot_persistence: DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE,
    ...overrides,
  };
}

function createMockRelationDb() {
  const storage = {
    agent_context: [] as MockSnapshotRow[],
    agent_context_item: [] as MockItemRow[],
    agent_context_config: [] as MockConfigRow[],
  };

  return {
    storage,
    executeRaw: vi.fn().mockReturnValue(0),
    count: vi.fn().mockImplementation(async (table: string) => {
      if (table === AGENT_CONTEXT_CONFIG_TABLE) return storage.agent_context_config.length;
      if (table === AGENT_CONTEXT_TABLE) return storage.agent_context.length;
      if (table === AGENT_CONTEXT_ITEM_TABLE) return storage.agent_context_item.length;
      return 0;
    }),
    insert: vi.fn().mockImplementation(
      async (table: string, data: Array<{ field: string; value: unknown }>) => {
        const row: Record<string, unknown> = {};
        for (const d of data) row[d.field] = d.value;
        if (table === AGENT_CONTEXT_TABLE) {
          storage.agent_context.push(row as unknown as MockSnapshotRow);
        } else if (table === AGENT_CONTEXT_ITEM_TABLE) {
          storage.agent_context_item.push(row as unknown as MockItemRow);
        } else if (table === AGENT_CONTEXT_CONFIG_TABLE) {
          storage.agent_context_config.push(row as unknown as MockConfigRow);
        }
        return 1;
      },
    ),
    selectOne: vi.fn().mockImplementation(
      async (table: string): Promise<Record<string, unknown> | null> => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return storage.agent_context_config[0] || null;
        if (table === AGENT_CONTEXT_TABLE) {
          return storage.agent_context[0] || null;
        }
        return null;
      },
    ),
    select: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockImplementation(
      async (table: string, data: Array<{ field: string; value: unknown }>) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE && storage.agent_context_config.length > 0) {
          for (const d of data) {
            (storage.agent_context_config[0] as Record<string, unknown>)[d.field] = d.value;
          }
          return 1;
        }
        return 0;
      },
    ),
    transactionRaw: vi.fn().mockImplementation(
      (ops: Array<{ type: string; table: string; data?: Array<{ field: string; value: unknown }> }>) => {
        for (const op of ops) {
          if (op.type === 'INSERT' && op.data) {
            const row: Record<string, unknown> = {};
            for (const d of op.data) row[d.field] = d.value;
            if (op.table === AGENT_CONTEXT_ITEM_TABLE) {
              storage.agent_context_item.push(row as unknown as MockItemRow);
            }
          }
        }
        return true;
      },
    ),
  };
}

function createMockInfoCore(items: MockContextItem[] = []) {
  return {
    context: vi.fn().mockImplementation(async (_input: unknown, _context: unknown, output: { list: MockContextItem[] }) => {
      output.list = items;
      return true;
    }),
  };
}

async function createAccess(
  relationDb = createMockRelationDb(),
  infoCore = createMockInfoCore(),
) {
  const access = new AgentContextAccess(relationDb as any, infoCore as any, NOOP_LOGGER);
  await access.initialize();
  return access;
}

describe('AgentContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildAgentContext', () => {
    it('TC-AC-001: builds context with all fields populated and returns correct output', async () => {
      const infoItems = [
        { info_id: 'info-1', info: 'Hello world' },
        { info_id: 'info-2', info: 'How are you' },
        { info_id: 'info-3', info: 'Good morning' },
      ];
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      const mockInfoCore = createMockInfoCore(infoItems);
      const access = await createAccess(mockDb, mockInfoCore);

      const input = new BuildAgentContextInput();
      input.session_id = 'sess-1';
      input.agent_id = 'agent-1';
      input.work_id = 'work-1';
      input.trace_id = 'trace-1';
      const ctx = new AgentContextContext();
      const output = new BuildAgentContextOutput();

      const result = await access.buildAgentContext(input, ctx, output);

      expect(result).toBe(true);
      expect(output.total_context_count).toBe(3);
      expect(output.context_data).toHaveLength(3);
      expect(output.context_data[0]).toEqual({ info_id: 'info-1', content: 'Hello world', source: '' });
      expect(output.context_data[1]).toEqual({ info_id: 'info-2', content: 'How are you', source: '' });
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);

      const generatedContextId = output.context_id;
      expect(generatedContextId).toBeTruthy();

      expect(mockDb.storage.agent_context).toHaveLength(1);
      const snap = mockDb.storage.agent_context[0];
      expect(snap.context_id).toBe(generatedContextId);
      expect(snap.session_id).toBe('sess-1');
      expect(snap.agent_id).toBe('agent-1');
      expect(snap.work_id).toBe('work-1');
      expect(snap.trace_id).toBe('trace-1');
      expect(snap.context_total_count).toBe(3);

      expect(mockDb.storage.agent_context_item).toHaveLength(3);
      expect(mockDb.transactionRaw).toHaveBeenCalledTimes(1);
      const txOps = vi.mocked(mockDb.transactionRaw).mock.calls[0][0];
      expect(txOps).toHaveLength(3);
      expect(txOps[0]).toMatchObject({ type: 'INSERT', table: AGENT_CONTEXT_ITEM_TABLE });
    });

    it('TC-AC-002: builds context with only session_id, nullable fields default to empty string', async () => {
      const infoItems = [{ info_id: 'info-1', info: 'test' }];
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      const mockInfoCore = createMockInfoCore(infoItems);
      const access = await createAccess(mockDb, mockInfoCore);

      const input = new BuildAgentContextInput();
      input.session_id = 'sess-minimal';
      const output = new BuildAgentContextOutput();

      const result = await access.buildAgentContext(input, new AgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.total_context_count).toBe(1);
      const snap = mockDb.storage.agent_context[0];
      expect(snap.agent_id).toBe('');
      expect(snap.work_id).toBe('');
      expect(snap.trace_id).toBe('');
    });

    it('TC-AC-003: throws ValidationError when session_id is empty', async () => {
      const mockDb = createMockRelationDb();
      const access = await createAccess(mockDb);

      const input = new BuildAgentContextInput();
      input.session_id = '';

      await expect(access.buildAgentContext(input, new AgentContextContext(), new BuildAgentContextOutput()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-004: does not persist snapshot when enable_snapshot_persistence is disabled', async () => {
      const infoItems = [
        { info_id: 'info-1', info: 'content' },
        { info_id: 'info-2', info: 'content2' },
      ];
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig({ enable_snapshot_persistence: 0 }));
      const mockInfoCore = createMockInfoCore(infoItems);
      const access = await createAccess(mockDb, mockInfoCore);

      const input = new BuildAgentContextInput();
      input.session_id = 'sess-1';
      const output = new BuildAgentContextOutput();

      const result = await access.buildAgentContext(input, new AgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.total_context_count).toBe(2);
      expect(output.context_data).toHaveLength(2);
      expect(mockDb.storage.agent_context).toHaveLength(0);
      expect(mockDb.storage.agent_context_item).toHaveLength(0);
      expect(mockDb.insert).not.toHaveBeenCalledWith(AGENT_CONTEXT_TABLE, expect.anything());
    });

    it('TC-AC-005: generates a unique context_id for each invocation', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      const mockInfoCore = createMockInfoCore([{ info_id: 'info-1', info: 'a' }]);
      const access = await createAccess(mockDb, mockInfoCore);

      const input1 = new BuildAgentContextInput();
      input1.session_id = 'sess-1';
      const out1 = new BuildAgentContextOutput();
      await access.buildAgentContext(input1, new AgentContextContext(), out1);

      const ctxId1 = out1.context_id;

      const input2 = new BuildAgentContextInput();
      input2.session_id = 'sess-2';
      const out2 = new BuildAgentContextOutput();
      await access.buildAgentContext(input2, new AgentContextContext(), out2);

      expect(ctxId1).not.toBe(out2.context_id);
    });

    it('TC-AC-006: handles empty context items from InfoCore gracefully', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      const mockInfoCore = createMockInfoCore([]);
      const access = await createAccess(mockDb, mockInfoCore);

      const input = new BuildAgentContextInput();
      input.session_id = 'sess-1';
      const output = new BuildAgentContextOutput();

      const result = await access.buildAgentContext(input, new AgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.total_context_count).toBe(0);
      expect(output.context_data).toEqual([]);
      expect(output.context_id).toBeTruthy();

      const snap = mockDb.storage.agent_context[0];
      expect(snap.context_total_count).toBe(0);
      expect(JSON.parse(snap.context_sources_summary)).toEqual({});
      expect(mockDb.storage.agent_context_item).toHaveLength(0);
    });

    it('TC-AC-007: passes session_id to InfoCore.context correctly', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      const mockInfoCore = createMockInfoCore([{ info_id: 'info-1', info: 'test' }]);
      const access = await createAccess(mockDb, mockInfoCore);

      const input = new BuildAgentContextInput();
      input.session_id = 'custom-session-id';
      await access.buildAgentContext(input, new AgentContextContext(), new BuildAgentContextOutput());

      expect(mockInfoCore.context).toHaveBeenCalledTimes(1);
      const callArgs = mockInfoCore.context.mock.calls[0];
      expect(callArgs[0]).toHaveProperty('session_id', 'custom-session-id');
    });

    it('TC-AC-008: classifies all items as unknown source in summary', async () => {
      const infoItems = [
        { info_id: 'info-1', info: 'a' },
        { info_id: 'info-2', info: 'b' },
        { info_id: 'info-3', info: 'c' },
        { info_id: 'info-4', info: 'd' },
        { info_id: 'info-5', info: 'e' },
      ];
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      const mockInfoCore = createMockInfoCore(infoItems);
      const access = await createAccess(mockDb, mockInfoCore);

      const input = new BuildAgentContextInput();
      input.session_id = 'sess-1';
      await access.buildAgentContext(input, new AgentContextContext(), new BuildAgentContextOutput());

      const snap = mockDb.storage.agent_context[0];
      const summary = JSON.parse(snap.context_sources_summary);
      expect(summary.unknown).toBe(5);
    });

    it('TC-AC-009: InfoCore.context error propagates', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      const mockInfoCore = {
        context: vi.fn().mockRejectedValue(new Error('InfoCore failure')),
      };
      const access = await createAccess(mockDb, mockInfoCore);

      const input = new BuildAgentContextInput();
      input.session_id = 'sess-1';

      await expect(access.buildAgentContext(input, new AgentContextContext(), new BuildAgentContextOutput()))
        .rejects.toThrow('InfoCore failure');
    });

    it('TC-AC-010: sets elapsed_ms on output via AOP proxy', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      const mockInfoCore = createMockInfoCore([{ info_id: 'info-1', info: 'test' }]);
      const access = await createAccess(mockDb, mockInfoCore);

      const input = new BuildAgentContextInput();
      input.session_id = 'sess-1';
      const output = new BuildAgentContextOutput();
      await access.buildAgentContext(input, new AgentContextContext(), output);

      expect(output.elapsed_ms).toBeDefined();
      expect(typeof output.elapsed_ms).toBe('number');
    });
  });

  describe('getContextByTrace', () => {
    it('TC-AC-011: retrieves snapshot by trace_id successfully', async () => {
      const mockDb = createMockRelationDb();
      const snap = makeMockSnapshotRow({
        context_id: 'ctx-001',
        trace_id: 'trace-001',
        agent_id: 'agent-001',
        work_id: 'work-001',
        context_total_count: 10,
        context_sources_summary: JSON.stringify({ unknown: 10 }),
      });
      mockDb.selectOne = vi.fn().mockResolvedValue(snap as unknown as Record<string, unknown>);
      const access = await createAccess(mockDb);

      const input = new GetContextByTraceInput();
      input.trace_id = 'trace-001';
      const output = new GetContextByTraceOutput();

      const result = await access.getContextByTrace(input, new AgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.context_id).toBe('ctx-001');
      expect(output.trace_id).toBe('trace-001');
      expect(output.agent_id).toBe('agent-001');
      expect(output.work_id).toBe('work-001');
      expect(output.total_context_count).toBe(10);
      expect(output.sources).toEqual({ unknown: { count: 10 } });
      expect(output.elapsed_ms).toBeDefined();
    });

    it('TC-AC-012: returns empty output when trace_id not found', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn().mockResolvedValue(null);
      const access = await createAccess(mockDb);

      const input = new GetContextByTraceInput();
      input.trace_id = 'nonexistent';
      const output = new GetContextByTraceOutput();

      const result = await access.getContextByTrace(input, new AgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.context_id).toBe('');
      expect(output.sources).toEqual({});
    });

    it('TC-AC-013: throws ValidationError when trace_id is empty', async () => {
      const mockDb = createMockRelationDb();
      const access = await createAccess(mockDb);

      const input = new GetContextByTraceInput();
      input.trace_id = '';

      await expect(access.getContextByTrace(input, new AgentContextContext(), new GetContextByTraceOutput()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-014: handles corrupted JSON in context_sources_summary gracefully', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn().mockResolvedValue({
        context_id: 'ctx-bad',
        trace_id: 'trace-bad',
        agent_id: 'agent-bad',
        work_id: 'work-bad',
        context_total_count: 5,
        context_sources_summary: 'not-valid-json{{{',
      } as unknown as Record<string, unknown>);
      const access = await createAccess(mockDb);

      const input = new GetContextByTraceInput();
      input.trace_id = 'trace-bad';
      const output = new GetContextByTraceOutput();
      await access.getContextByTrace(input, new AgentContextContext(), output);

      expect(output.sources).toEqual({});
    });

    it('TC-AC-015: handles missing fields in snapshot row gracefully', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn().mockResolvedValue({
        context_id: null,
        trace_id: null,
        agent_id: null,
        work_id: null,
        context_total_count: null,
        context_sources_summary: null,
      } as unknown as Record<string, unknown>);
      const access = await createAccess(mockDb);

      const input = new GetContextByTraceInput();
      input.trace_id = 'trace-null';
      const output = new GetContextByTraceOutput();
      await access.getContextByTrace(input, new AgentContextContext(), output);

      expect(output.context_id).toBe('');
      expect(output.total_context_count).toBe(0);
      expect(output.sources).toEqual({});
    });
  });

  describe('getContextByAgent', () => {
    it('TC-AC-021: retrieves snapshot by agent_id and work_id successfully', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn().mockResolvedValue(makeMockSnapshotRow({
        context_id: 'ctx-agent',
        context_total_count: 15,
        context_sources_summary: JSON.stringify({ unknown: 15 }),
      }) as unknown as Record<string, unknown>);
      const access = await createAccess(mockDb);

      const input = new GetContextByAgentInput();
      input.agent_id = 'agent-1';
      input.work_id = 'work-1';
      const output = new GetContextByAgentOutput();

      const result = await access.getContextByAgent(input, new AgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.context_id).toBe('ctx-agent');
      expect(output.agent_id).toBe('agent-1');
      expect(output.work_id).toBe('work-1');
      expect(output.total_context_count).toBe(15);
      expect(output.sources).toEqual({ unknown: { count: 15 } });
    });

    it('TC-AC-022: returns empty output when agent_id + work_id not found', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn().mockResolvedValue(null);
      const access = await createAccess(mockDb);

      const input = new GetContextByAgentInput();
      input.agent_id = 'agent-nonexistent';
      input.work_id = 'work-nonexistent';
      const output = new GetContextByAgentOutput();
      await access.getContextByAgent(input, new AgentContextContext(), output);

      expect(output.context_id).toBe('');
      expect(output.sources).toEqual({});
    });

    it('TC-AC-023: throws ValidationError when agent_id is empty', async () => {
      const mockDb = createMockRelationDb();
      const access = await createAccess(mockDb);

      const input = new GetContextByAgentInput();
      input.agent_id = '';
      input.work_id = 'work-1';

      await expect(access.getContextByAgent(input, new AgentContextContext(), new GetContextByAgentOutput()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-024: throws ValidationError when work_id is empty', async () => {
      const mockDb = createMockRelationDb();
      const access = await createAccess(mockDb);

      const input = new GetContextByAgentInput();
      input.agent_id = 'agent-1';
      input.work_id = '';

      await expect(access.getContextByAgent(input, new AgentContextContext(), new GetContextByAgentOutput()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-025: queries with correct Operator.EQ conditions', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn().mockResolvedValue(null);
      const access = await createAccess(mockDb);

      const input = new GetContextByAgentInput();
      input.agent_id = 'agent-eq-test';
      input.work_id = 'work-eq-test';

      await access.getContextByAgent(input, new AgentContextContext(), new GetContextByAgentOutput());

      expect(mockDb.selectOne).toHaveBeenCalled();
      const callArgs = mockDb.selectOne.mock.calls[0];
      const conditions = callArgs[1];
      expect(conditions).toHaveLength(2);
      expect(conditions[0]).toMatchObject({ field: 'agent_id', value: 'agent-eq-test' });
      expect(conditions[1]).toMatchObject({ field: 'work_id', value: 'work-eq-test' });
    });
  });

  describe('getContextDetail', () => {
    it('TC-AC-031: retrieves full detail with info_ids grouped by source', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn()
        .mockResolvedValueOnce(makeMockSnapshotRow({
          context_id: 'ctx-detail',
          context_total_count: 3,
        }) as unknown as Record<string, unknown>);
      mockDb.select = vi.fn().mockResolvedValue([
        makeMockItemRow({ context_id: 'ctx-detail', info_id: 'info-a', source: 'unknown' }),
        makeMockItemRow({ context_id: 'ctx-detail', info_id: 'info-b', source: 'unknown' }),
        makeMockItemRow({ context_id: 'ctx-detail', info_id: 'info-c', source: 'unknown' }),
      ] as unknown as Array<Record<string, unknown>>);
      const access = await createAccess(mockDb);

      const input = new GetContextDetailInput();
      input.context_id = 'ctx-detail';
      const output = new GetContextDetailOutput();

      const result = await access.getContextDetail(input, new AgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.context_id).toBe('ctx-detail');
      expect(output.total_context_count).toBe(3);
      expect(output.sources).toHaveProperty('unknown');
      expect(output.sources.unknown.count).toBe(3);
      expect(output.sources.unknown.info_ids).toEqual(['info-a', 'info-b', 'info-c']);
    });

    it('TC-AC-032: filters by specified sources', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn()
        .mockResolvedValueOnce(makeMockSnapshotRow({
          context_id: 'ctx-filter',
          context_total_count: 2,
        }) as unknown as Record<string, unknown>);
      mockDb.select = vi.fn().mockResolvedValue([
        makeMockItemRow({ context_id: 'ctx-filter', info_id: 'info-filtered', source: 'timeline' }),
      ] as unknown as Array<Record<string, unknown>>);
      const access = await createAccess(mockDb);

      const input = new GetContextDetailInput();
      input.context_id = 'ctx-filter';
      input.sources = ['timeline', 'pinned'];
      const output = new GetContextDetailOutput();

      await access.getContextDetail(input, new AgentContextContext(), output);

      expect(output.sources).toHaveProperty('timeline');
      expect(mockDb.select).toHaveBeenCalled();
      const selectOpts = mockDb.select.mock.calls[0][1];
      expect(selectOpts.conditions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'source', value: ['timeline', 'pinned'] }),
        ]),
      );
    });

    it('TC-AC-033: returns empty sources when context_id not found', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn().mockResolvedValue(null);
      const access = await createAccess(mockDb);

      const input = new GetContextDetailInput();
      input.context_id = 'ctx-nonexistent';
      const output = new GetContextDetailOutput();

      const result = await access.getContextDetail(input, new AgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.total_context_count).toBe(0);
      expect(output.sources).toEqual({});
    });

    it('TC-AC-034: throws ValidationError when context_id is empty', async () => {
      const mockDb = createMockRelationDb();
      const access = await createAccess(mockDb);

      const input = new GetContextDetailInput();
      input.context_id = '';

      await expect(access.getContextDetail(input, new AgentContextContext(), new GetContextDetailOutput()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-035: handles snapshot with zero items', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn()
        .mockResolvedValueOnce(makeMockSnapshotRow({
          context_id: 'ctx-empty',
          context_total_count: 0,
        }) as unknown as Record<string, unknown>);
      mockDb.select = vi.fn().mockResolvedValue([]);
      const access = await createAccess(mockDb);

      const input = new GetContextDetailInput();
      input.context_id = 'ctx-empty';
      const output = new GetContextDetailOutput();

      await access.getContextDetail(input, new AgentContextContext(), output);

      expect(output.total_context_count).toBe(0);
      expect(output.sources).toEqual({});
    });

    it('TC-AC-036: groups items by different sources correctly', async () => {
      const mockDb = createMockRelationDb();
      mockDb.selectOne = vi.fn()
        .mockResolvedValueOnce(makeMockSnapshotRow({
          context_id: 'ctx-multi',
          context_total_count: 4,
        }) as unknown as Record<string, unknown>);
      mockDb.select = vi.fn().mockResolvedValue([
        makeMockItemRow({ context_id: 'ctx-multi', info_id: 'info-1', source: 'pinned' }),
        makeMockItemRow({ context_id: 'ctx-multi', info_id: 'info-2', source: 'pinned' }),
        makeMockItemRow({ context_id: 'ctx-multi', info_id: 'info-3', source: 'keyword' }),
        makeMockItemRow({ context_id: 'ctx-multi', info_id: 'info-4', source: 'similarity' }),
      ] as unknown as Array<Record<string, unknown>>);
      const access = await createAccess(mockDb);

      const input = new GetContextDetailInput();
      input.context_id = 'ctx-multi';
      const output = new GetContextDetailOutput();

      await access.getContextDetail(input, new AgentContextContext(), output);

      expect(output.sources.pinned).toEqual({ count: 2, info_ids: ['info-1', 'info-2'] });
      expect(output.sources.keyword).toEqual({ count: 1, info_ids: ['info-3'] });
      expect(output.sources.similarity).toEqual({ count: 1, info_ids: ['info-4'] });
    });
  });

  describe('configAgentContext', () => {
    it('TC-AC-041: updates max_context_items successfully', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return mockDb.storage.agent_context_config[0] || null;
        return null;
      });
      const access = await createAccess(mockDb);

      const input = new ConfigAgentContextInput();
      input.max_context_items = 500;
      const output = new ConfigAgentContextOutput();

      const result = await access.configAgentContext(input, new AgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.max_context_items).toBe(500);
      expect(mockDb.storage.agent_context_config[0].max_context_items).toBe(500);
    });

    it('TC-AC-042: disables snapshot persistence', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return mockDb.storage.agent_context_config[0] || null;
        return null;
      });
      const access = await createAccess(mockDb);

      const input = new ConfigAgentContextInput();
      input.enable_snapshot_persistence = false;
      const output = new ConfigAgentContextOutput();

      await access.configAgentContext(input, new AgentContextContext(), output);

      expect(output.enable_snapshot_persistence).toBe(false);
      expect(mockDb.storage.agent_context_config[0].enable_snapshot_persistence).toBe(0);
    });

    it('TC-AC-043: enables snapshot persistence', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig({ enable_snapshot_persistence: 0 }));
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return mockDb.storage.agent_context_config[0] || null;
        return null;
      });
      const access = await createAccess(mockDb);

      const input = new ConfigAgentContextInput();
      input.enable_snapshot_persistence = true;
      const output = new ConfigAgentContextOutput();

      await access.configAgentContext(input, new AgentContextContext(), output);

      expect(output.enable_snapshot_persistence).toBe(true);
      expect(mockDb.storage.agent_context_config[0].enable_snapshot_persistence).toBe(1);
    });

    it('TC-AC-044: throws ValidationError when max_context_items is zero', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return mockDb.storage.agent_context_config[0] || null;
        return null;
      });
      const access = await createAccess(mockDb);

      const input = new ConfigAgentContextInput();
      input.max_context_items = 0;

      await expect(access.configAgentContext(input, new AgentContextContext(), new ConfigAgentContextOutput()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-045: throws ValidationError when max_context_items is negative', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return mockDb.storage.agent_context_config[0] || null;
        return null;
      });
      const access = await createAccess(mockDb);

      const input = new ConfigAgentContextInput();
      input.max_context_items = -5;

      await expect(access.configAgentContext(input, new AgentContextContext(), new ConfigAgentContextOutput()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-046: throws ValidationError when max_context_items is not integer', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return mockDb.storage.agent_context_config[0] || null;
        return null;
      });
      const access = await createAccess(mockDb);

      const input = new ConfigAgentContextInput();
      input.max_context_items = 3.5;

      await expect(access.configAgentContext(input, new AgentContextContext(), new ConfigAgentContextOutput()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-047: returns defaults when config is called with no arguments', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return mockDb.storage.agent_context_config[0] || null;
        return null;
      });
      const access = await createAccess(mockDb);

      const input = new ConfigAgentContextInput();
      const output = new ConfigAgentContextOutput();

      await access.configAgentContext(input, new AgentContextContext(), output);

      expect(output.max_context_items).toBe(DEFAULT_MAX_CONTEXT_ITEMS);
      expect(output.enable_snapshot_persistence).toBe(true);
    });

    it('TC-AC-048: partial update preserves other config values', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig({ max_context_items: 300 }));
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return mockDb.storage.agent_context_config[0] || null;
        return null;
      });
      const access = await createAccess(mockDb);

      const input = new ConfigAgentContextInput();
      input.enable_snapshot_persistence = false;
      const output = new ConfigAgentContextOutput();

      await access.configAgentContext(input, new AgentContextContext(), output);

      expect(output.max_context_items).toBe(300);
      expect(output.enable_snapshot_persistence).toBe(false);
    });

    it('TC-AC-049: auto-creates default config row when none exists', async () => {
      const mockDb = createMockRelationDb();
      const access = await createAccess(mockDb);

      // Simulate "no config exists" by clearing schema-init-inserted config
      mockDb.storage.agent_context_config = [];

      let selectOneCalls = 0;
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) {
          selectOneCalls++;
          if (selectOneCalls <= 1) return null;
          return mockDb.storage.agent_context_config[0] || null;
        }
        return null;
      });

      const input = new ConfigAgentContextInput();
      input.max_context_items = 400;
      const output = new ConfigAgentContextOutput();

      await access.configAgentContext(input, new AgentContextContext(), output);

      expect(output.max_context_items).toBe(400);
      expect(mockDb.storage.agent_context_config).toHaveLength(1);
      expect(output.enable_snapshot_persistence).toBe(true);
    });

    it('TC-AC-050: throws ValidationError when max_context_items is NaN', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig());
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return mockDb.storage.agent_context_config[0] || null;
        return null;
      });
      const access = await createAccess(mockDb);

      const input = new ConfigAgentContextInput();
      input.max_context_items = NaN;

      await expect(access.configAgentContext(input, new AgentContextContext(), new ConfigAgentContextOutput()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-051: only max_context_items updated preserves enable_snapshot_persistence', async () => {
      const mockDb = createMockRelationDb();
      mockDb.storage.agent_context_config.push(makeDefaultConfig({
        max_context_items: 100,
        enable_snapshot_persistence: 0,
      }));
      mockDb.selectOne = vi.fn().mockImplementation(async (table: string) => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return mockDb.storage.agent_context_config[0] || null;
        return null;
      });
      const access = await createAccess(mockDb);

      const input = new ConfigAgentContextInput();
      input.max_context_items = 250;
      const output = new ConfigAgentContextOutput();

      await access.configAgentContext(input, new AgentContextContext(), output);

      expect(output.max_context_items).toBe(250);
      expect(output.enable_snapshot_persistence).toBe(false);
    });
  });

  describe('output types initialization', () => {
    it('all Output classes have correct default values', () => {
      const bo = new BuildAgentContextOutput();
      expect(bo.context_data).toEqual([]);
      expect(bo.context_id).toBe('');
      expect(bo.total_context_count).toBe(0);

      const gto = new GetContextByTraceOutput();
      expect(gto.context_id).toBe('');
      expect(gto.sources).toEqual({});

      const gao = new GetContextByAgentOutput();
      expect(gao.sources).toEqual({});

      const gdo = new GetContextDetailOutput();
      expect(gdo.sources).toEqual({});

      const cao = new ConfigAgentContextOutput();
      expect(cao.max_context_items).toBe(200);
      expect(cao.enable_snapshot_persistence).toBe(true);
    });
  });

  describe('domain constants', () => {
    it('table name constants are correct', () => {
      expect(AGENT_CONTEXT_TABLE).toBe('agent_context');
      expect(AGENT_CONTEXT_ITEM_TABLE).toBe('agent_context_item');
      expect(AGENT_CONTEXT_CONFIG_TABLE).toBe('agent_context_config');
    });

    it('default config values are correct', () => {
      expect(DEFAULT_MAX_CONTEXT_ITEMS).toBe(200);
      expect(DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE).toBe(1);
    });
  });
});
