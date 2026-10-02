import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationError } from '@brian-agent/base';
import { AgentContextAccess } from '../AgentContext';
import type { Logger } from '@brian-agent/base';
import {
  AgentContextContext,
  GetContextDetailInput,
  GetContextDetailOutput,
  ConfigAgentContextInput,
  ConfigAgentContextOutput,
  AGENT_CONTEXT_CONFIG_TABLE,
  DEFAULT_MAX_CONTEXT_ITEMS,
  DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE,
} from '../AgentContext';

const NOOP_LOGGER: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
};

interface MockConfigRow {
  id: string;
  max_context_items: number;
  enable_snapshot_persistence: number;
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
    agent_context_config: [] as MockConfigRow[],
  };

  return {
    storage,
    executeRaw: vi.fn().mockReturnValue(0),
    count: vi.fn().mockImplementation(async (table: string) => {
      if (table === AGENT_CONTEXT_CONFIG_TABLE) return storage.agent_context_config.length;
      return 0;
    }),
    insert: vi.fn().mockImplementation(
      async (table: string, data: Array<{ field: string; value: unknown }>) => {
        const row: Record<string, unknown> = {};
        for (const d of data) row[d.field] = d.value;
        if (table === AGENT_CONTEXT_CONFIG_TABLE) {
          storage.agent_context_config.push(row as unknown as MockConfigRow);
        }
        return 1;
      },
    ),
    selectOne: vi.fn().mockImplementation(
      async (table: string): Promise<Record<string, unknown> | null> => {
        if (table === AGENT_CONTEXT_CONFIG_TABLE) return storage.agent_context_config[0] || null;
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
  };
}

function createMockInfoCore(triples: {
  source_ids_map?: Record<string, string[]>;
  content_map?: Record<string, string>;
  attribute_map?: Record<string, Record<string, unknown>>;
} = {}) {
  return {
    soContextByWork: vi.fn().mockImplementation(
      async (_input: unknown, output: Record<string, unknown>, _context: unknown) => {
        output.source_ids_map = triples.source_ids_map ?? {};
        output.content_map = triples.content_map ?? {};
        output.attribute_map = triples.attribute_map ?? {};
        return true;
      },
    ),
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
  beforeEach(() => {});

  describe('soContextDetail', () => {
    it('TC-AC-031: 通过 soContextByWork 返回三对象结构', async () => {
      const triples = {
        source_ids_map: { PINNED: ['info-1'], TIMELINE: ['info-2'] },
        content_map: { 'info-1': 'pinned 内容', 'info-2': 'timeline 内容' },
        attribute_map: {
          'info-1': { info_type: 'REQUEST', pin: 1 },
          'info-2': { info_type: 'RESPONSE', pin: 0 },
        },
      };
      const mockInfoCore = createMockInfoCore(triples);
      const access = await createAccess(createMockRelationDb(), mockInfoCore);

      const input = new GetContextDetailInput();
      input.work_id = 'work-1';
      const output = new GetContextDetailOutput();

      const result = await access.soContextDetail(input, output, new AgentContextContext());

      expect(result).toBe(true);
      expect(output.source_ids_map).toEqual(triples.source_ids_map);
      expect(output.content_map).toEqual(triples.content_map);
      expect(output.attribute_map).toEqual(triples.attribute_map);
      expect(output.total_context_count).toBe(2);
    });

    it('TC-AC-032: 正确传递 work_id 给 InfoCore.soContextByWork', async () => {
      const mockInfoCore = createMockInfoCore();
      const access = await createAccess(createMockRelationDb(), mockInfoCore);

      const input = new GetContextDetailInput();
      input.work_id = 'work-abc';
      await access.soContextDetail(input, new GetContextDetailOutput(), new AgentContextContext());

      expect(mockInfoCore.soContextByWork).toHaveBeenCalledTimes(1);
      const callInput = mockInfoCore.soContextByWork.mock.calls[0][0] as { work_id: string };
      expect(callInput.work_id).toBe('work-abc');
    });

    it('TC-AC-034: work_id 为空时抛 ValidationError', async () => {
      const access = await createAccess();
      const input = new GetContextDetailInput();
      input.work_id = '';

      await expect(access.soContextDetail(input, new GetContextDetailOutput(), new AgentContextContext()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-033: 无上下文时返回空三对象', async () => {
      const mockInfoCore = createMockInfoCore({ source_ids_map: {}, content_map: {}, attribute_map: {} });
      const access = await createAccess(createMockRelationDb(), mockInfoCore);

      const input = new GetContextDetailInput();
      input.work_id = 'work-empty';
      const output = new GetContextDetailOutput();
      await access.soContextDetail(input, output, new AgentContextContext());

      expect(output.source_ids_map).toEqual({});
      expect(output.content_map).toEqual({});
      expect(output.attribute_map).toEqual({});
      expect(output.total_context_count).toBe(0);
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

      const result = await access.configAgentContext(input, output, new AgentContextContext());

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

      await access.configAgentContext(input, output, new AgentContextContext());

      expect(output.enable_snapshot_persistence).toBe(false);
      expect(mockDb.storage.agent_context_config[0].enable_snapshot_persistence).toBe(0);
    });

    it('TC-AC-044: throws ValidationError when max_context_items is zero', async () => {
      const access = await createAccess();
      const input = new ConfigAgentContextInput();
      input.max_context_items = 0;

      await expect(access.configAgentContext(input, new ConfigAgentContextOutput(), new AgentContextContext()))
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

      await access.configAgentContext(input, output, new AgentContextContext());

      expect(output.max_context_items).toBe(DEFAULT_MAX_CONTEXT_ITEMS);
      expect(output.enable_snapshot_persistence).toBe(true);
    });
  });

  describe('output types initialization', () => {
    it('GetContextDetailOutput 有正确默认值', () => {
      const gdo = new GetContextDetailOutput();
      expect(gdo.source_ids_map).toEqual({});
      expect(gdo.content_map).toEqual({});
      expect(gdo.attribute_map).toEqual({});
      expect(gdo.total_context_count).toBe(0);
    });

    it('ConfigAgentContextOutput 有正确默认值', () => {
      const cao = new ConfigAgentContextOutput();
      expect(cao.max_context_items).toBe(DEFAULT_MAX_CONTEXT_ITEMS);
      expect(cao.enable_snapshot_persistence).toBe(true);
    });
  });

  describe('domain constants', () => {
    it('table name constants are correct', () => {
      expect(AGENT_CONTEXT_CONFIG_TABLE).toBe('agent_context_config_record');
    });

    it('default config values are correct', () => {
      expect(DEFAULT_MAX_CONTEXT_ITEMS).toBe(200);
      expect(DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE).toBe(1);
    });
  });
});
