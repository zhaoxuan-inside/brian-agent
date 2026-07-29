import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { setDatabase } from '../../src/agent/AgentContext/db';
import {
  AgentContextService,
  createAgentContextService,
  BuildAgentContextInput,
  BuildAgentContextContext,
  BuildAgentContextOutput,
  GetContextByTraceInput,
  GetContextByTraceContext,
  GetContextByTraceOutput,
  GetContextByAgentInput,
  GetContextByAgentContext,
  GetContextByAgentOutput,
  GetContextDetailInput,
  GetContextDetailContext,
  GetContextDetailOutput,
  ConfigAgentContextInput,
  ConfigAgentContextContext,
  ConfigAgentContextOutput,
} from '../../src/agent/AgentContext/AgentContext';
import type { InfoContextProvider, ContextItem, ContextSource } from '../../src/agent/AgentContext/AgentContext';
import { ValidationError } from '../../src/shared/errors';

const FIXED_DATE = new Date('2025-01-15T12:00:00Z').getTime();

function makeContextItems(sources?: { source: ContextSource; count: number }[]): ContextItem[] {
  const items: ContextItem[] = [];
  const defaults = [
    { source: 'pinned' as const, count: 2 },
    { source: 'timeline' as const, count: 3 },
    { source: 'tag_relative' as const, count: 1 },
    { source: 'similarity' as const, count: 4 },
    { source: 'keyword' as const, count: 2 },
    { source: 'random' as const, count: 1 },
  ];
  const list = sources || defaults;
  let idx = 0;
  for (const { source, count } of list) {
    for (let i = 0; i < count; i++) {
      idx++;
      items.push({
        info_id: `info_${source}_${idx}`,
        content: `content_${source}_${idx}`,
        source,
      });
    }
  }
  return items;
}

function makeInfoCoreProvider(items?: ContextItem[]): InfoContextProvider {
  return {
    context: (_sessionId: string, _options?: { maxContextItems?: number }) => {
      return items || makeContextItems();
    },
  };
}

describe('AgentContext PRD Service', () => {
  let db: Database.Database;
  let service: AgentContextService;

  beforeEach(async () => {
    vi.useFakeTimers({ now: FIXED_DATE });
    db = new Database(':memory:');
    setDatabase(db);
    service = createAgentContextService(makeInfoCoreProvider());
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  function query<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
    return db.prepare(sql).get(...params) as T | undefined;
  }

  function queryAll<T = unknown>(sql: string, ...params: unknown[]): T[] {
    return db.prepare(sql).all(...params) as T[];
  }

  describe('buildAgentContext', () => {
    it('TC-AC-001: builds context and persists snapshot', async () => {
      const input = new BuildAgentContextInput({
        session_id: 'session-001',
        agent_id: 'agent-001',
        work_id: 'work-001',
        trace_id: 'trace-001',
      });
      const output = new BuildAgentContextOutput();

      const result = await service.buildAgentContext(input, new BuildAgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.context_id).toBeTruthy();
      expect(output.total_context_count).toBe(13);
      expect(output.context_data).toHaveLength(13);

      const snapshot = query<Record<string, unknown>>('SELECT * FROM agent_context WHERE context_id = ?', output.context_id);
      expect(snapshot).toBeTruthy();
      expect(snapshot!.session_id).toBe('session-001');
      expect(snapshot!.agent_id).toBe('agent-001');
      expect(snapshot!.work_id).toBe('work-001');
      expect(snapshot!.trace_id).toBe('trace-001');
      expect(snapshot!.context_total_count).toBe(13);

      const summary = JSON.parse(snapshot!.context_sources_summary as string);
      expect(summary.pinned).toBe(2);
      expect(summary.timeline).toBe(3);
      expect(summary.tag_relative).toBe(1);
      expect(summary.similarity).toBe(4);
      expect(summary.keyword).toBe(2);
      expect(summary.random).toBe(1);

      const items = queryAll<Record<string, unknown>>('SELECT * FROM agent_context_item WHERE context_id = ?', output.context_id);
      expect(items).toHaveLength(13);
    });

    it('TC-AC-002: builds context with minimal fields (session_id only)', async () => {
      const input = new BuildAgentContextInput({ session_id: 'session-002' });
      const output = new BuildAgentContextOutput();

      const result = await service.buildAgentContext(input, new BuildAgentContextContext(), output);

      expect(result).toBe(true);
      expect(output.context_id).toBeTruthy();

      const snapshot = query<Record<string, unknown>>('SELECT * FROM agent_context WHERE context_id = ?', output.context_id);
      expect(snapshot!.agent_id).toBeNull();
      expect(snapshot!.work_id).toBeNull();
      expect(snapshot!.trace_id).toBeNull();
    });

    it('TC-AC-003: throws ValidationError when session_id is empty', async () => {
      const input = new BuildAgentContextInput({ session_id: '' });
      const output = new BuildAgentContextOutput();

      await expect(service.buildAgentContext(input, new BuildAgentContextContext(), output))
        .rejects.toThrow(ValidationError);
    });

    it('TC-AC-004: respects enable_snapshot_persistence = false', async () => {
      const configSvc = createAgentContextService(makeInfoCoreProvider());
      const cfgInput = new ConfigAgentContextInput({ enable_snapshot_persistence: false });
      const cfgOutput = new ConfigAgentContextOutput();
      configSvc.configAgentContext(cfgInput, new ConfigAgentContextContext(), cfgOutput);

      const input = new BuildAgentContextInput({ session_id: 'session-004' });
      const output = new BuildAgentContextOutput();
      await configSvc.buildAgentContext(input, new BuildAgentContextContext(), output);

      expect(output.context_id).toBeTruthy();
      const snapshot = query<Record<string, unknown>>('SELECT * FROM agent_context WHERE context_id = ?', output.context_id);
      expect(snapshot).toBeUndefined();
      const items = queryAll<Record<string, unknown>>('SELECT * FROM agent_context_item WHERE context_id = ?', output.context_id);
      expect(items).toHaveLength(0);
    });

    it('TC-AC-005: generates unique context_id per invocation', async () => {
      const input = new BuildAgentContextInput({ session_id: 'session-005' });

      const out1 = new BuildAgentContextOutput();
      const out2 = new BuildAgentContextOutput();

      await service.buildAgentContext(input, new BuildAgentContextContext(), out1);
      await service.buildAgentContext(input, new BuildAgentContextContext(), out2);

      expect(out1.context_id).toBeTruthy();
      expect(out2.context_id).toBeTruthy();
      expect(out1.context_id).not.toBe(out2.context_id);

      const count = (query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM agent_context WHERE session_id = ?', 'session-005'))!.cnt;
      expect(count).toBe(2);
    });

    it('TC-AC-006: empty context items still produce a valid snapshot', async () => {
      const emptySvc = createAgentContextService({
        context: () => [],
      });
      const input = new BuildAgentContextInput({ session_id: 'session-006' });
      const output = new BuildAgentContextOutput();

      await emptySvc.buildAgentContext(input, new BuildAgentContextContext(), output);

      expect(output.context_id).toBeTruthy();
      expect(output.total_context_count).toBe(0);
      const snapshot = query<Record<string, unknown>>('SELECT * FROM agent_context WHERE context_id = ?', output.context_id);
      const summary = JSON.parse(snapshot!.context_sources_summary as string);
      expect(summary.pinned).toBe(0);
    });
  });

  describe('getContextByTrace', () => {
    it('TC-AC-011: returns context summary by trace_id', async () => {
      const input = new BuildAgentContextInput({
        session_id: 'session-011',
        agent_id: 'agent-011',
        trace_id: 'trace-011',
      });
      const buildOut = new BuildAgentContextOutput();
      await service.buildAgentContext(input, new BuildAgentContextContext(), buildOut);

      const traceInput = new GetContextByTraceInput({ trace_id: 'trace-011' });
      const traceOut = new GetContextByTraceOutput();
      const result = service.getContextByTrace(traceInput, new GetContextByTraceContext(), traceOut);

      expect(result).toBe(true);
      expect(traceOut.context_id).toBe(buildOut.context_id);
      expect(traceOut.trace_id).toBe('trace-011');
      expect(traceOut.agent_id).toBe('agent-011');
      expect(traceOut.total_context_count).toBe(13);
      expect(traceOut.sources!.pinned.count).toBe(2);
      expect(traceOut.sources!.timeline.count).toBe(3);
    });

    it('TC-AC-012: trace not found returns empty sources', () => {
      const input = new GetContextByTraceInput({ trace_id: 'nonexistent' });
      const output = new GetContextByTraceOutput();
      service.getContextByTrace(input, new GetContextByTraceContext(), output);

      expect(output.context_id).toBe('');
      expect(output.total_context_count).toBe(0);
      expect(output.sources!.pinned.count).toBe(0);
    });
  });

  describe('getContextByAgent', () => {
    it('TC-AC-021: returns context summary by agent_id + work_id', async () => {
      const input = new BuildAgentContextInput({
        session_id: 'session-021',
        agent_id: 'agent-021',
        work_id: 'work-021',
      });
      const buildOut = new BuildAgentContextOutput();
      await service.buildAgentContext(input, new BuildAgentContextContext(), buildOut);

      const agentInput = new GetContextByAgentInput({ agent_id: 'agent-021', work_id: 'work-021' });
      const agentOut = new GetContextByAgentOutput();
      const result = service.getContextByAgent(agentInput, new GetContextByAgentContext(), agentOut);

      expect(result).toBe(true);
      expect(agentOut.context_id).toBe(buildOut.context_id);
      expect(agentOut.agent_id).toBe('agent-021');
      expect(agentOut.work_id).toBe('work-021');
      expect(agentOut.sources!.similarity.count).toBe(4);
    });

    it('TC-AC-022: agent + work not found returns empty sources', () => {
      const input = new GetContextByAgentInput({ agent_id: 'unknown', work_id: 'unknown' });
      const output = new GetContextByAgentOutput();
      service.getContextByAgent(input, new GetContextByAgentContext(), output);

      expect(output.context_id).toBe('');
      expect(output.total_context_count).toBe(0);
    });
  });

  describe('getContextDetail', () => {
    it('TC-AC-031: returns detail with info_ids grouped by source', async () => {
      const items: ContextItem[] = [
        { info_id: 'info_p1', content: 'pinned 1', source: 'pinned' },
        { info_id: 'info_p2', content: 'pinned 2', source: 'pinned' },
        { info_id: 'info_t1', content: 'timeline 1', source: 'timeline' },
      ];
      const svc = createAgentContextService(makeInfoCoreProvider(items));
      const buildInput = new BuildAgentContextInput({ session_id: 'session-031' });
      const buildOut = new BuildAgentContextOutput();
      await svc.buildAgentContext(buildInput, new BuildAgentContextContext(), buildOut);

      const detailInput = new GetContextDetailInput({ context_id: buildOut.context_id! });
      const detailOut = new GetContextDetailOutput();
      svc.getContextDetail(detailInput, new GetContextDetailContext(), detailOut);

      expect(detailOut.context_id).toBe(buildOut.context_id);
      expect(detailOut.total_context_count).toBe(3);
      expect(detailOut.sources!.pinned.count).toBe(2);
      expect(detailOut.sources!.pinned.info_ids).toEqual(['info_p1', 'info_p2']);
      expect(detailOut.sources!.timeline.count).toBe(1);
      expect(detailOut.sources!.timeline.info_ids).toEqual(['info_t1']);
      expect(detailOut.sources!.random.info_ids).toBeUndefined();
    });

    it('TC-AC-032: filters by sources when specified', async () => {
      const items: ContextItem[] = [
        { info_id: 'info_p1', content: 'pinned 1', source: 'pinned' },
        { info_id: 'info_k1', content: 'keyword 1', source: 'keyword' },
      ];
      const svc = createAgentContextService(makeInfoCoreProvider(items));
      const buildInput = new BuildAgentContextInput({ session_id: 'session-032' });
      const buildOut = new BuildAgentContextOutput();
      await svc.buildAgentContext(buildInput, new BuildAgentContextContext(), buildOut);

      const detailInput = new GetContextDetailInput({ context_id: buildOut.context_id!, sources: ['pinned'] });
      const detailOut = new GetContextDetailOutput();
      svc.getContextDetail(detailInput, new GetContextDetailContext(), detailOut);

      expect(detailOut.sources!.pinned.count).toBe(1);
      expect(detailOut.sources!.pinned.info_ids).toEqual(['info_p1']);
      expect(detailOut.sources!.keyword.info_ids).toBeUndefined();
    });

    it('TC-AC-033: nonexistent context_id returns empty sources', () => {
      const input = new GetContextDetailInput({ context_id: 'nonexistent' });
      const output = new GetContextDetailOutput();
      service.getContextDetail(input, new GetContextDetailContext(), output);

      expect(output.context_id).toBe('nonexistent');
      expect(output.total_context_count).toBe(0);
      expect(output.sources).toEqual({});
    });

    it('TC-AC-034: throws ValidationError when context_id is empty', () => {
      const input = new GetContextDetailInput({ context_id: '' });
      const output = new GetContextDetailOutput();

      expect(() => service.getContextDetail(input, new GetContextDetailContext(), output))
        .toThrow(ValidationError);
    });
  });

  describe('configAgentContext', () => {
    it('TC-AC-041: update max_context_items', () => {
      const input = new ConfigAgentContextInput({ max_context_items: 500 });
      const output = new ConfigAgentContextOutput();
      service.configAgentContext(input, new ConfigAgentContextContext(), output);

      expect(output.max_context_items).toBe(500);
      expect(output.enable_snapshot_persistence).toBe(true);

      const row = query<Record<string, unknown>>('SELECT * FROM agent_context_config LIMIT 1');
      expect(row!.max_context_items).toBe(500);
    });

    it('TC-AC-042: update enable_snapshot_persistence', () => {
      const input = new ConfigAgentContextInput({ enable_snapshot_persistence: false });
      const output = new ConfigAgentContextOutput();
      service.configAgentContext(input, new ConfigAgentContextContext(), output);

      expect(output.enable_snapshot_persistence).toBe(false);

      const row = query<Record<string, unknown>>('SELECT * FROM agent_context_config LIMIT 1');
      expect(row!.enable_snapshot_persistence).toBe(0);
    });

    it('TC-AC-043: throws ValidationError for non-positive max_context_items', () => {
      const input = new ConfigAgentContextInput({ max_context_items: 0 });
      const output = new ConfigAgentContextOutput();

      expect(() => service.configAgentContext(input, new ConfigAgentContextContext(), output))
        .toThrow(ValidationError);
    });

    it('TC-AC-044: returns defaults for no-arg config call', () => {
      const input = new ConfigAgentContextInput({});
      const output = new ConfigAgentContextOutput();
      service.configAgentContext(input, new ConfigAgentContextContext(), output);

      expect(output.max_context_items).toBe(200);
      expect(output.enable_snapshot_persistence).toBe(true);
    });

    it('TC-AC-045: partial update preserves other values', () => {
      service.configAgentContext(new ConfigAgentContextInput({ max_context_items: 300 }), new ConfigAgentContextContext(), new ConfigAgentContextOutput());
      const output = new ConfigAgentContextOutput();
      service.configAgentContext(new ConfigAgentContextInput({ enable_snapshot_persistence: false }), new ConfigAgentContextContext(), output);

      expect(output.max_context_items).toBe(300);
      expect(output.enable_snapshot_persistence).toBe(false);
    });
  });

  describe('integration: agent_id + work_id unique constraint', () => {
    it('TC-AC-051: duplicate agent_id + work_id throws constraint error', async () => {
      const items1: ContextItem[] = [
        { info_id: 'info_a1', content: 'a', source: 'pinned' },
      ];
      const svc = createAgentContextService(makeInfoCoreProvider(items1));

      const input1 = new BuildAgentContextInput({
        session_id: 'session-051',
        agent_id: 'agent-051',
        work_id: 'work-051',
      });
      const out1 = new BuildAgentContextOutput();
      await svc.buildAgentContext(input1, new BuildAgentContextContext(), out1);

      expect(out1.context_id).toBeTruthy();

      // Verify first insert is queryable
      const agentInput = new GetContextByAgentInput({ agent_id: 'agent-051', work_id: 'work-051' });
      const agentOut = new GetContextByAgentOutput();
      svc.getContextByAgent(agentInput, new GetContextByAgentContext(), agentOut);
      expect(agentOut.context_id).toBe(out1.context_id);

      // Second insert with same agent_id + work_id should fail (unique constraint)
      const items2: ContextItem[] = [
        { info_id: 'info_b1', content: 'b', source: 'keyword' },
      ];
      const svc2 = createAgentContextService(makeInfoCoreProvider(items2));
      const input2 = new BuildAgentContextInput({
        session_id: 'session-052',
        agent_id: 'agent-051',
        work_id: 'work-051',
      });
      const out2 = new BuildAgentContextOutput();
      await expect(svc2.buildAgentContext(input2, new BuildAgentContextContext(), out2))
        .rejects.toThrow('UNIQUE constraint failed');
    });
  });
});
