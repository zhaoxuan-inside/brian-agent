import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RelationDBAccess, IdGenerator, Operator, GraphDBAccess,
  GraphContext, AddGraphNodeInput, AddGraphNodeOutput, AddGraphEdgeInput, AddGraphEdgeOutput,
  GraphTarget, SelectGraphInput, SelectGraphOutput,
} from '@brian-agent/base';
import type { GraphInfoInput } from '@brian-agent/core';
import { VisualizationService } from '../Visualization/application/VisualizationService';
import {
  VisualizationContext,
  GetVisualizedMessagesInput,
  GetVisualizedMessagesOutput,
  GetVisualizedMessageGraphInput,
  GetVisualizedMessageGraphOutput,
  GetVisualizedAgentDAGInput,
  GetVisualizedAgentDAGOutput,
  GetVisualizedWorkFlowInput,
  GetVisualizedWorkFlowOutput,
  GetAgentTraceInput,
  GetAgentTraceOutput,
  GetVisualizedMessageDAGInput,
  GetVisualizedMessageDAGOutput,
  GetResourceInput,
  GetResourceOutput,
  ConfigVisualizationInput,
  ConfigVisualizationOutput,
  GetAgentChainInput,
  GetAgentChainOutput,
} from '../Visualization/domain/types';
import { initVisualizationSchema } from './test-helpers';
import {
  setupRealTestEnvironment,
  cleanupTempDirs,
  type RealTestContext,
} from './real-test-helpers';

function ctx() { return new VisualizationContext(); }

function genId() { return `id-${IdGenerator.generate()}`; }

function now() { return IdGenerator.now(); }

interface InsField { field: string; value: unknown }

function insInfoRaw(db: RelationDBAccess, o: Record<string, unknown>) {
  const fields: InsField[] = [];
  const defaults: Record<string, unknown> = {
    id: genId(), created: now(), updated: now(),
    session_id: 'sess-1', work_id: 'work-1', interact_id: 'inter-1',
    info_id: genId(), info_type: 'REQUEST', info_creator_role: 'USER', info_creator_id: 'creator-1',
    info: 'Hello world', info_length: 11, pin: 0,
  };
  for (const [k, dv] of Object.entries(defaults)) {
    fields.push({ field: k, value: o[k] !== undefined ? o[k] : dv });
  }
  db.insert('info_raw', fields);
}

async function ensureInfoGraphNode(graphDb: GraphDBAccess, infoId: string, sessionId: string): Promise<string> {
  const selOut = new SelectGraphOutput();
  await graphDb.selectGraph({ target: GraphTarget.NODE, node_type: 'info' } as SelectGraphInput, selOut, new GraphContext());
  for (const n of selOut.list as Array<{ id: string; content?: Record<string, unknown> }>) {
    if (n.content?.['info_id'] === infoId) return n.id;
  }
  const addOut = new AddGraphNodeOutput();
  await graphDb.addGraphNode(
    { data: { node_type: 'info', content: { info_id: infoId, session_id: sessionId, info_preview: '' } } } as AddGraphNodeInput,
    addOut,
    new GraphContext(),
  );
  return addOut.id;
}

async function insInfoGraph(graphDb: GraphDBAccess, citingInfoId: string, citedInfoId: string, sessionId = 'sess-1') {
  const fromId = await ensureInfoGraphNode(graphDb, citingInfoId, sessionId);
  const toId = await ensureInfoGraphNode(graphDb, citedInfoId, sessionId);
  await graphDb.addGraphEdge(
    {
      data: {
        from_node_id: fromId,
        to_node_id: toId,
        edge_type: 'CITATION',
        weight: 1,
        properties: { citing_info_id: citingInfoId, cited_info_id: citedInfoId, session_id: sessionId },
      },
    } as AddGraphEdgeInput,
    new AddGraphEdgeOutput(),
    new GraphContext(),
  );
}

function insInfoSummary(db: RelationDBAccess, infoId: string, summary: string) {
  db.insert('info_summary', [
    { field: 'id', value: genId() },
    { field: 'created', value: now() },
    { field: 'updated', value: now() },
    { field: 'info_id', value: infoId },
    { field: 'summary', value: summary },
  ]);
}

function insInfoContextConfig(db: RelationDBAccess, overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    id: genId(), created: now(), updated: now(),
    base_timeline_count: 10, base_tag_relative_count: 0,
    base_similarity_count: 0, base_keyword_count: 0,
    base_random_count: 0, total: 10,
  };
  const fields: InsField[] = [];
  for (const [k, dv] of Object.entries(defaults)) {
    fields.push({ field: k, value: overrides[k] !== undefined ? overrides[k] : dv });
  }
  db.insert('info_context_config', fields);
}

function insOrchWork(db: RelationDBAccess, overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    id: genId(), created: now(), updated: now(),
    work_id: 'work-1', interact_id: genId(), session_id: 'sess-1',
    user_query: 'Test', status: 'COMPLETED',
    orchestration_strategy: 'SIMPLE', task_count: 1, completed_task_count: 0,
    elapsed_ms: 500, cancel_reason: '', error_message: '', final_response: '', metadata: '{}',
  };
  const fields: InsField[] = [];
  for (const [k, dv] of Object.entries(defaults)) {
    fields.push({ field: k, value: overrides[k] !== undefined ? overrides[k] : dv });
  }
  db.insert('orchestration_work', fields);
}

function insOrchAgentExec(db: RelationDBAccess, overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    id: genId(), created: now(), updated: now(),
    work_id: 'work-1', agent_id: 'agent-1', plan_id: '', task_id: '',
    execution_type: 'DAG', task_content: 'Test', status: 'COMPLETED',
    answer: '', trace_id: '', iterations: 0, elapsed_ms: 0, error_info: '',
  };
  const fields: InsField[] = [];
  for (const [k, dv] of Object.entries(defaults)) {
    fields.push({ field: k, value: overrides[k] !== undefined ? overrides[k] : dv });
  }
  db.insert('orchestration_agent_execution', fields);
}

function insTrace(db: RelationDBAccess, overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    id: genId(), created: now(), updated: now(),
    trace_id: 'trace-1', agent_id: 'agent-1',
    start_time: 1700000001000, end_time: 1700000005000,
    iterations_json: '[]', total_token_usage: 500, answer: '',
  };
  const fields: InsField[] = [];
  for (const [k, dv] of Object.entries(defaults)) {
    fields.push({ field: k, value: overrides[k] !== undefined ? overrides[k] : dv });
  }
  db.insert('agent_execution_trace', fields);
}

/* ─── test suite ─── */
describe('VisualizationService', () => {
  let ctxEnv: RealTestContext;
  let svc: VisualizationService;

  beforeEach(async () => {
    ctxEnv = await setupRealTestEnvironment();
    initVisualizationSchema(ctxEnv.db);
    svc = new VisualizationService(
      ctxEnv.db, ctxEnv.orchestrationVisualization, ctxEnv.agentExecution,
      ctxEnv.agentLibrary, ctxEnv.agentContext, ctxEnv.evolutorAgent, ctxEnv.plannerAgent,
      ctxEnv.infoCore, ctxEnv.llmAccess, ctxEnv.soulAccess, ctxEnv.skillAccess,
      ctxEnv.mcpAccess, ctxEnv.promptsAccess, ctxEnv.graphDBAccess, ctxEnv.logger,
    );
  });

  afterEach(() => {
    cleanupTempDirs();
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════
  // 1. soVisualizedMessages  TC-VIS-001 ~ TC-VIS-015
  // ═══════════════════════════════════════════════════════════════
  describe('soVisualizedMessages', () => {
    it('TC-VIS-001: by session_id returns messages with extended fields', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1',
        info_id: 'info-1', info_type: 'REQUEST', info: 'Hello', info_length: 11 });

      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-1';
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());

      expect(out.total).toBe(1);
      expect(out.messages).toHaveLength(1);
      const m = out.messages[0] as Record<string, unknown>;
      expect(m.session_id).toBe('sess-1');
      expect(m.work_id).toBe('work-1');
      expect(m.info_id).toBe('info-1');
      expect(m.info_type).toBe('REQUEST');
      expect(m.info).toBe('Hello');
      expect(m.info_length).toBe(11);
      expect(m).toHaveProperty('parent_info_ids');
    });

    it('TC-VIS-002: by work_id', async () => {
      insInfoRaw(ctxEnv.db, { work_id: 'work-A', info_id: 'info-wa' });
      const input = new GetVisualizedMessagesInput();
      input.work_id = 'work-A';
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());
      expect(out.total).toBe(1);
      expect((out.messages[0] as any).work_id).toBe('work-A');
    });

    it('TC-VIS-003: by interact_id', async () => {
      insInfoRaw(ctxEnv.db, { interact_id: 'inter-X', info_id: 'info-ix' });
      const input = new GetVisualizedMessagesInput();
      input.interact_id = 'inter-X';
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());
      expect(out.total).toBe(1);
      expect((out.messages[0] as any).interact_id).toBe('inter-X');
    });

    it('TC-VIS-004: lastN=20 limited to 20', async () => {
      for (let i = 0; i < 25; i++) {
        insInfoRaw(ctxEnv.db, { session_id: 'sess-lastn', info_id: `info-ln-${i}`, created: 1700000000000 + i });
      }
      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-lastn';
      input.lastN = 20;
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());
      expect(out.messages.length).toBeLessThanOrEqual(20);
    });

    it('TC-VIS-005: include_citing_info=true (default) includes citing fields', async () => {
      const infoId = 'info-100';
      insInfoRaw(ctxEnv.db, { info_id: infoId });
      await insInfoGraph(ctxEnv.graphDBAccess, infoId, 'info-200');

      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-1';
      input.include_citing_info = true;
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());

      const m = out.messages.find(msg => (msg as any).info_id === infoId) as Record<string, unknown>;
      expect(Array.isArray(m.citing_info_ids)).toBe(true);
      expect(Array.isArray(m.cited_info_ids)).toBe(true);
      expect(typeof m.citing_count).toBe('number');
      expect(typeof m.cited_count).toBe('number');
    });

    it('TC-VIS-006: include_citing_info=false excludes citing fields', async () => {
      insInfoRaw(ctxEnv.db, { info_id: 'info-100' });
      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-1';
      input.include_citing_info = false;
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());
      const m = out.messages[0] as Record<string, unknown>;
      expect(m).not.toHaveProperty('citing_info_ids');
      expect(m).not.toHaveProperty('cited_info_ids');
      expect(m).not.toHaveProperty('citing_count');
    });

    it('TC-VIS-007: include_context_source=true for AGENT msg', async () => {
      insInfoRaw(ctxEnv.db, { info_id: 'info-agent', info_type: 'RESPONSE', info_creator_role: 'AGENT' });
      insInfoContextConfig(ctxEnv.db, { total: 10, base_timeline_count: 10 });

      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-1';
      input.include_context_source = true;
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());

      const m = out.messages[0] as Record<string, unknown>;
      expect(m).toHaveProperty('context_source_info');
      expect((m.context_source_info as any).info_id).toBe('info-agent');
    });

    it('TC-VIS-008: include_context_source=true for USER msg -> no context_source', async () => {
      insInfoRaw(ctxEnv.db, { info_id: 'info-user', info_type: 'REQUEST' });
      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-1';
      input.include_context_source = true;
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());
      const m = out.messages[0] as Record<string, unknown>;
      expect(m).not.toHaveProperty('context_source_info');
    });

    it('TC-VIS-010: citing_count correct', async () => {
      insInfoRaw(ctxEnv.db, { info_id: 'info-cited' });
      await insInfoGraph(ctxEnv.graphDBAccess, 'other-1', 'info-cited');
      await insInfoGraph(ctxEnv.graphDBAccess, 'other-2', 'info-cited');
      await insInfoGraph(ctxEnv.graphDBAccess, 'other-3', 'info-cited');

      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-1';
      input.include_citing_info = true;
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());

      const m = out.messages.find(msg => (msg as any).info_id === 'info-cited') as Record<string, unknown>;
      expect(m.citing_count).toBe(3);
      expect(m.cited_count).toBe(0);
    });

    it('TC-VIS-011: Pagination', async () => {
      for (let i = 0; i < 25; i++) {
        insInfoRaw(ctxEnv.db, { session_id: 'sess-page', info_id: `info-${i + 1}`,
          info: `msg${i + 1}`, created: 1700000000000 + i });
      }

      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-page';
      input.page_current = 2;
      input.page_size = 10;
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());

      expect(out.total).toBeGreaterThanOrEqual(10);
      expect(out.messages).toHaveLength(10);
    });

    it('TC-VIS-012: Default lastN=50', async () => {
      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-empty-default';
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());
      expect(out.messages).toBeDefined();
    });

    it('TC-VIS-013: No parameters at all returns messages=[], total=0', async () => {
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(new GetVisualizedMessagesInput(), ctx(), out);
      expect(out.messages).toEqual([]);
      expect(out.total).toBe(0);
    });

    it('TC-VIS-014: No messages -> messages=[], total=0', async () => {
      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-nonexistent';
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());
      expect(out.messages).toEqual([]);
      expect(out.total).toBe(0);
    });

    it('TC-VIS-015: info_length equals info string length', async () => {
      const txt = 'Hello World! 123';
      insInfoRaw(ctxEnv.db, { info_id: 'info-1', info: txt, info_length: txt.length });

      const input = new GetVisualizedMessagesInput();
      input.session_id = 'sess-1';
      const out = new GetVisualizedMessagesOutput();
      await svc.soVisualizedMessages(input, out, ctx());
      expect((out.messages[0] as any).info_length).toBe(txt.length);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. soVisualizedMessageGraph  TC-VIS-020 ~ TC-VIS-030
  // ═══════════════════════════════════════════════════════════════
  describe('soVisualizedMessageGraph', () => {
    it('TC-VIS-020: Get message graph -> session_id, graph(nodes+edges), metadata', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-graph', info_id: 'info-1', info: 'First' });

      const input = new GetVisualizedMessageGraphInput();
      input.session_id = 'sess-graph';
      const out = new GetVisualizedMessageGraphOutput();
      await svc.soVisualizedMessageGraph(input, out, ctx());
      expect(out.session_id).toBe('sess-graph');
      expect(out.graph).toHaveProperty('nodes');
      expect(out.graph).toHaveProperty('edges');
      expect(out.metadata).toHaveProperty('total_nodes');
    });

    it('TC-VIS-021: Nodes have all enhanced properties', async () => {
      const sessId = 'sess-enhanced';
      insInfoRaw(ctxEnv.db, { session_id: sessId, work_id: 'work-1', info_id: 'info-1', info: 'Node1' });
      insInfoSummary(ctxEnv.db, 'info-1', 'A summary');

      const input = new GetVisualizedMessageGraphInput();
      input.session_id = sessId;
      const out = new GetVisualizedMessageGraphOutput();
      await svc.soVisualizedMessageGraph(input, out, ctx());
      const node = (out.graph as any).nodes[0];
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('label');
      expect(node).toHaveProperty('info_id', 'info-1');
      expect(node).toHaveProperty('info_summary');
      expect(node).toHaveProperty('citing_count');
      expect(node).toHaveProperty('cited_count');
    });

    it('TC-VIS-022: Edges have properties', async () => {
      const sessId = 'sess-edges';
      insInfoRaw(ctxEnv.db, { session_id: sessId, info_id: 'info-1', info: 'N1' });
      insInfoRaw(ctxEnv.db, { session_id: sessId, info_id: 'info-2', info: 'N2' });
      await insInfoGraph(ctxEnv.graphDBAccess, 'info-1', 'info-2', sessId);

      const input = new GetVisualizedMessageGraphInput();
      input.session_id = sessId;
      const out = new GetVisualizedMessageGraphOutput();
      await svc.soVisualizedMessageGraph(input, out, ctx());
      const edges = (out.graph as any).edges;
      expect(edges.length).toBeGreaterThanOrEqual(1);
      const edge = edges[0];
      expect(edge).toHaveProperty('id');
      expect(edge).toHaveProperty('from');
      expect(edge).toHaveProperty('to');
      expect(edge).toHaveProperty('citing_info_id');
      expect(edge).toHaveProperty('cited_info_id');
      expect(edge).toHaveProperty('edge_type');
    });

    it('TC-VIS-023: CITATION edges (different work_id)', async () => {
      const sessId = 'sess-cite';
      insInfoRaw(ctxEnv.db, { session_id: sessId, work_id: 'work-A', info_id: 'info-1', info: 'A' });
      insInfoRaw(ctxEnv.db, { session_id: sessId, work_id: 'work-B', info_id: 'info-2', info: 'B' });
      await insInfoGraph(ctxEnv.graphDBAccess, 'info-1', 'info-2', sessId);

      const input = new GetVisualizedMessageGraphInput();
      input.session_id = sessId;
      const out = new GetVisualizedMessageGraphOutput();
      await svc.soVisualizedMessageGraph(input, out, ctx());
      const edges = (out.graph as any).edges.filter((e: any) => e.edge_type === 'CITATION');
      expect(edges.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-VIS-024: REPLY edges (same interact_id, REQUEST→RESPONSE)', async () => {
      const sessId = 'sess-reply';
      insInfoRaw(ctxEnv.db, { session_id: sessId, work_id: 'work-s', interact_id: 'inter-s', info_id: 'info-1', info_type: 'REQUEST', info: 'R1' });
      insInfoRaw(ctxEnv.db, { session_id: sessId, work_id: 'work-s', interact_id: 'inter-s', info_id: 'info-2', info_type: 'RESPONSE', info: 'R2' });

      const input = new GetVisualizedMessageGraphInput();
      input.session_id = sessId;
      const out = new GetVisualizedMessageGraphOutput();
      await svc.soVisualizedMessageGraph(input, out, ctx());
      const replyEdges = (out.graph as any).edges.filter((e: any) => e.edge_type === 'REPLY');
      expect(replyEdges.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-VIS-025: max_nodes=50 limits', async () => {
      const sessId = 'sess-maxnodes';
      for (let i = 0; i < 100; i++) {
        insInfoRaw(ctxEnv.db, { session_id: sessId, info_id: `info-${i}`, info: `L${i}` });
      }

      const input = new GetVisualizedMessageGraphInput();
      input.session_id = sessId;
      input.max_nodes = 50;
      const out = new GetVisualizedMessageGraphOutput();
      await svc.soVisualizedMessageGraph(input, out, ctx());
      expect((out.graph as any).nodes).toHaveLength(50);
      expect((out.metadata as any).displayed_nodes).toBe(50);
      expect((out.metadata as any).truncated).toBe(true);
    });

    it('TC-VIS-026: Default max_nodes=200', async () => {
      const input = new GetVisualizedMessageGraphInput();
      input.session_id = 'sess-empty';
      const out = new GetVisualizedMessageGraphOutput();
      await svc.soVisualizedMessageGraph(input, out, ctx());
      expect((out.metadata as any).max_nodes_limit).toBe(200);
    });

    it('TC-VIS-027: info_summary truncated', async () => {
      const sessId = 'sess-trunc';
      const long = 'A'.repeat(200);
      insInfoRaw(ctxEnv.db, { session_id: sessId, info_id: 'info-1', info: 't' });
      insInfoSummary(ctxEnv.db, 'info-1', long);

      const input = new GetVisualizedMessageGraphInput();
      input.session_id = sessId;
      const out = new GetVisualizedMessageGraphOutput();
      await svc.soVisualizedMessageGraph(input, out, ctx());
      expect((out.graph as any).nodes[0].info_summary.length).toBeLessThanOrEqual(53);
    });

    it('TC-VIS-028: No session_id handled gracefully', async () => {
      const out = new GetVisualizedMessageGraphOutput();
      const input = new GetVisualizedMessageGraphInput();
      (input as any).session_id = '';
      await svc.soVisualizedMessageGraph(input, out, ctx());
      expect(out.session_id).toBe('');
      expect(out.graph).toBeDefined();
    });

    it('TC-VIS-029: Empty graph -> nodes but edges=[]', async () => {
      const sessId = 'sess-single';
      insInfoRaw(ctxEnv.db, { session_id: sessId, info_id: 'info-1', info: 'Only' });

      const input = new GetVisualizedMessageGraphInput();
      input.session_id = sessId;
      const out = new GetVisualizedMessageGraphOutput();
      await svc.soVisualizedMessageGraph(input, out, ctx());
      expect((out.graph as any).nodes.length).toBe(1);
      expect((out.graph as any).edges).toEqual([]);
    });

    it('TC-VIS-030: metadata has counts', async () => {
      const sessId = 'sess-meta';
      insInfoRaw(ctxEnv.db, { session_id: sessId, info_id: 'ia', info: 'A' });
      insInfoRaw(ctxEnv.db, { session_id: sessId, info_id: 'ib', info: 'B' });
      await insInfoGraph(ctxEnv.graphDBAccess, 'ia', 'ib', sessId);

      const input = new GetVisualizedMessageGraphInput();
      input.session_id = sessId;
      const out = new GetVisualizedMessageGraphOutput();
      await svc.soVisualizedMessageGraph(input, out, ctx());
      expect(out.metadata.total_nodes).toBeGreaterThanOrEqual(1);
      expect(out.metadata.total_edges).toBeGreaterThanOrEqual(1);
      expect(out.metadata.displayed_nodes).toBeGreaterThanOrEqual(1);
      expect((out.metadata as any).max_nodes_limit).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. soVisualizedAgentDAG  TC-VIS-040 ~ TC-VIS-054
  // ═══════════════════════════════════════════════════════════════
  describe('soVisualizedAgentDAG', () => {
    it('TC-VIS-040: resolve_content=true -> DAG with resolved refs', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1', orchestration_strategy: 'SIMPLE' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = true;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect(out.dag).toHaveProperty('graph');
      expect((out.dag as any).graph).toHaveProperty('nodes');
      expect((out.dag as any).graph).toHaveProperty('edges');
    });

    it('TC-VIS-041: resolve_content=false -> raw ID refs', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = false;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      const nodes = (out.dag as any).graph.nodes;
      expect(nodes.length).toBeGreaterThanOrEqual(1);
      expect(nodes[0].agent_id).toBe('agent-1');
    });

    it('TC-VIS-042: strategy ref resolved', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1', orchestration_strategy: 'PLANNING' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = true;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect(out.dag).toBeDefined();
    });

    it('TC-VIS-043: llm ref resolved', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = true;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect(out.dag).toBeDefined();
    });

    it('TC-VIS-044: soul ref resolved', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = true;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect(out.dag).toBeDefined();
    });

    it('TC-VIS-045: skills refs resolved as array', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = true;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect(out.dag).toBeDefined();
    });

    it('TC-VIS-046: mcps refs resolved as array', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = true;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect(out.dag).toBeDefined();
    });

    it('TC-VIS-047: prompt_templates refs resolved', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = true;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect(out.dag).toBeDefined();
    });

    it('TC-VIS-048: context_source_refs - pinned resolved', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = true;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect(out.dag).toBeDefined();
    });

    it('TC-VIS-049: context_source_refs - timeline resolved', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = true;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect(out.dag).toBeDefined();
    });

    it('TC-VIS-050: result_refs - evaluation resolved', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'work-1';
      input.resolve_content = true;
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect(out.dag).toBeDefined();
    });

    it('TC-VIS-051: Invalid work_id -> error in dag', async () => {
      const input = new GetVisualizedAgentDAGInput();
      input.work_id = 'invalid';
      const out = new GetVisualizedAgentDAGOutput();
      await svc.soVisualizedAgentDAG(input, out, ctx());
      expect((out.dag as any).error).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. soVisualizedWorkFlow  TC-VIS-060 ~ TC-VIS-066
  // ═══════════════════════════════════════════════════════════════
  describe('soVisualizedWorkFlow', () => {
    it('TC-VIS-060: Get timeline -> workflow_timeline with phases', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1', status: 'COMPLETED', orchestration_strategy: 'PLANNING' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedWorkFlowInput();
      input.work_id = 'work-1';
      const out = new GetVisualizedWorkFlowOutput();
      await svc.soVisualizedWorkFlow(input, out, ctx());
      expect(out.timeline).toHaveProperty('phases');
    });

    it('TC-VIS-061: PLANNING phase refs', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1', status: 'COMPLETED', orchestration_strategy: 'PLANNING' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED', plan_id: 'plan-1' });

      const input = new GetVisualizedWorkFlowInput();
      input.work_id = 'work-1';
      const out = new GetVisualizedWorkFlowOutput();
      await svc.soVisualizedWorkFlow(input, out, ctx());
      const phases = (out.timeline as any).phases;
      const p = phases.find((x: any) => x.phase === 'PLANNING');
      expect(p).toBeDefined();
    });

    it('TC-VIS-062: BUILD_AGENT_DAG phase refs', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1', status: 'COMPLETED', orchestration_strategy: 'PLANNING' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedWorkFlowInput();
      input.work_id = 'work-1';
      const out = new GetVisualizedWorkFlowOutput();
      await svc.soVisualizedWorkFlow(input, out, ctx());
      const phases = (out.timeline as any).phases;
      const p = phases.find((x: any) => x.phase === 'BUILD_AGENT_DAG');
      expect(p).toBeDefined();
    });

    it('TC-VIS-063: EXECUTING phase refs', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1', status: 'COMPLETED', orchestration_strategy: 'PLANNING' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedWorkFlowInput();
      input.work_id = 'work-1';
      const out = new GetVisualizedWorkFlowOutput();
      await svc.soVisualizedWorkFlow(input, out, ctx());
      const phases = (out.timeline as any).phases;
      const p = phases.find((x: any) => x.phase === 'EXECUTING');
      expect(p).toBeDefined();
    });

    it('TC-VIS-064: WRITING phase refs', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1', status: 'COMPLETED', orchestration_strategy: 'SIMPLE' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedWorkFlowInput();
      input.work_id = 'work-1';
      const out = new GetVisualizedWorkFlowOutput();
      await svc.soVisualizedWorkFlow(input, out, ctx());
      expect(out.timeline).toBeDefined();
    });

    it('TC-VIS-065: EVALUATING phase refs', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-1', status: 'COMPLETED', orchestration_strategy: 'SIMPLE' });
      insOrchAgentExec(ctxEnv.db, { work_id: 'work-1', agent_id: 'agent-1', status: 'COMPLETED' });

      const input = new GetVisualizedWorkFlowInput();
      input.work_id = 'work-1';
      const out = new GetVisualizedWorkFlowOutput();
      await svc.soVisualizedWorkFlow(input, out, ctx());
      expect(out.timeline).toBeDefined();
    });

    it('TC-VIS-066: Invalid work_id -> error in timeline', async () => {
      const input = new GetVisualizedWorkFlowInput();
      input.work_id = 'invalid';
      const out = new GetVisualizedWorkFlowOutput();
      await svc.soVisualizedWorkFlow(input, out, ctx());
      expect((out.timeline as any).error).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. soAgentTrace  TC-VIS-070 ~ TC-VIS-085
  // ═══════════════════════════════════════════════════════════════
  describe('soAgentTrace', () => {
    it('TC-VIS-070: Get latest trace -> all fields', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 1500,
          think: { reasoning: 'I need to analyze...', token_usage: 100 },
          act: { tool_calls: [{ tool_type: 'SKILL', tool_id: 'skill-1', args: {} }], result: 'ok', token_usage: 50 },
          reflect: { reflection: 'good progress', should_continue: true, token_usage: 20 },
        },
        { iteration_index: 1, iteration_elapsed_ms: 2000,
          think: { reasoning: 'Now I will respond...', token_usage: 150 },
          act: { tool_calls: [], result: 'writing', token_usage: 30 },
          reflect: { reflection: 'ready', should_continue: false, token_usage: 10 },
        },
        { iteration_index: 2, iteration_elapsed_ms: 500,
          answer: { answer: 'Here is the final answer.', token_usage: 140, elapsed_ms: 400 },
        },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-1', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000005000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 500,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-1';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      const t = out.trace as any;
      expect(t.trace_id).toBe('trace-1');
      expect(t.agent_id).toBe('agent-1');
      expect(t.total_elapsed_ms).toBe(4000);
      expect(t.total_token_usage).toBe(500);
      expect(t.iteration_count).toBe(3);
      expect(Array.isArray(t.steps)).toBe(true);
      expect(t.final_answer).toBe('Here is the final answer.');
    });

    it('TC-VIS-071: Specific trace_id', async () => {
      insTrace(ctxEnv.db, {
        trace_id: 'trace-specific', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000005000,
        iterations_json: '[]', total_token_usage: 100,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-specific';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      expect((out.trace as any).trace_id).toBe('trace-specific');
    });

    it('TC-VIS-072: THINK step has phase=THINK with content/token_usage/elapsed_ms', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 1500,
          think: { reasoning: 'I need to analyze...', token_usage: 100 },
          act: { tool_calls: [], result: 'ok', token_usage: 50 },
          reflect: { reflection: 'good progress', should_continue: true, token_usage: 20 },
        },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-think', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000005000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 170,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-think';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      const think = (out.trace as any).steps.filter((s: any) => s.phase === 'THINK');
      expect(think.length).toBeGreaterThanOrEqual(1);
      expect(think[0].content).toBe('I need to analyze...');
      expect(think[0]).toHaveProperty('token_usage');
      expect(think[0]).toHaveProperty('elapsed_ms');
    });

    it('TC-VIS-073: ACT step has phase=ACT with tool_calls array', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 1000,
          act: { tool_calls: [{ tool_type: 'SKILL', tool_id: 'skill-1', args: {} }], result: 'ok', token_usage: 50 },
        },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-act', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000003000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 50,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-act';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      const act = (out.trace as any).steps.filter((s: any) => s.phase === 'ACT');
      expect(act.length).toBeGreaterThanOrEqual(1);
      expect(act[0]).toHaveProperty('tool_calls');
      expect(Array.isArray(act[0].tool_calls)).toBe(true);
      expect(act[0]).toHaveProperty('result');
    });

    it('TC-VIS-074: REFLECT step has phase=REFLECT with content', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 1000,
          reflect: { reflection: 'good progress', should_continue: true, token_usage: 20 },
        },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-refl', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000003000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 20,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-refl';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      const reflect = (out.trace as any).steps.filter((s: any) => s.phase === 'REFLECT');
      expect(reflect.length).toBeGreaterThanOrEqual(1);
      expect(reflect[0].reflection).toBe('good progress');
      expect(reflect[0]).toHaveProperty('should_continue');
    });

    it('TC-VIS-075: final_answer from answer step', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 500,
          answer: { answer: 'Here is the final answer.', token_usage: 140, elapsed_ms: 400 },
        },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-ans', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000002000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 140,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-ans';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      expect((out.trace as any).final_answer).toBe('Here is the final answer.');
    });

    it('TC-VIS-076: tool_calls SKILL resolved to name', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 1000,
          act: { tool_calls: [{ tool_type: 'SKILL', tool_id: 'skill-1', args: {} }], result: 'ok', token_usage: 50 },
        },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-skill', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000003000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 50,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-skill';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      const act = (out.trace as any).steps.find((s: any) => s.phase === 'ACT' && (s.tool_calls as any[]).length > 0);
      expect(act).toBeDefined();
      expect(act.tool_calls[0]).toHaveProperty('tool_type');
    });

    it('TC-VIS-077: tool_calls MCP resolved to name', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 1000,
          act: { tool_calls: [{ tool_type: 'MCP', tool_id: 'mcp-1', args: {} }], result: 'ok', token_usage: 50 },
        },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-mcp', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000003000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 50,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-mcp';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      const act = (out.trace as any).steps.find((s: any) => s.phase === 'ACT' && (s.tool_calls as any[]).length > 0);
      expect(act).toBeDefined();
      expect(act.tool_calls[0]).toHaveProperty('tool_type');
    });

    it('TC-VIS-078: iterations=3 count correct', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 1000, think: { reasoning: 's1', token_usage: 50 } },
        { iteration_index: 1, iteration_elapsed_ms: 1000, act: { tool_calls: [], result: 'ok', token_usage: 30 } },
        { iteration_index: 2, iteration_elapsed_ms: 1000, reflect: { reflection: 'done', should_continue: false, token_usage: 10 } },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-iter3', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000005000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 90,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-iter3';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      expect((out.trace as any).iteration_count).toBe(3);
    });

    it('TC-VIS-079: status=COMPLETED', async () => {
      insTrace(ctxEnv.db, {
        trace_id: 'trace-comp', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000005000,
        iterations_json: '[]', total_token_usage: 0,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-comp';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      expect((out.trace as any).trace_id).toBeDefined();
      expect((out.trace as any).agent_id).toBe('agent-1');
    });

    it('TC-VIS-080: status=FAILED handled', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 1000, think: { reasoning: 'trying...', token_usage: 50 } },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-fail', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000002000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 50,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-fail';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      expect((out.trace as any).trace_id).toBeDefined();
      expect((out.trace as any).iteration_count).toBe(1);
    });

    it('TC-VIS-081: status=RUNNING handled', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 500, think: { reasoning: 'working...', token_usage: 75 } },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-run', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000002000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 75,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-run';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      expect((out.trace as any).steps).toBeDefined();
    });

    it('TC-VIS-082: Invalid agent_id -> error in output', async () => {
      const input = new GetAgentTraceInput();
      input.agent_id = 'invalid-agent';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      expect((out.trace as any).error).toBeDefined();
    });

    it('TC-VIS-083: Invalid trace_id -> error in output', async () => {
      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'invalid-trace';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      expect((out.trace as any).error).toBeDefined();
    });

    it('TC-VIS-084: Multi-iteration steps include all iterations', async () => {
      const iterations = [
        { iteration_index: 0, iteration_elapsed_ms: 1000, think: { reasoning: 's1', token_usage: 50 } },
        { iteration_index: 1, iteration_elapsed_ms: 1000, act: { tool_calls: [], result: 'ok', token_usage: 30 } },
        { iteration_index: 2, iteration_elapsed_ms: 1000, reflect: { reflection: 'done', should_continue: false, token_usage: 10 } },
        { iteration_index: 3, iteration_elapsed_ms: 1000, think: { reasoning: 'wrap', token_usage: 40 } },
      ];
      insTrace(ctxEnv.db, {
        trace_id: 'trace-multi', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000006000,
        iterations_json: JSON.stringify(iterations), total_token_usage: 130,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-multi';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      expect((out.trace as any).iteration_count).toBe(4);
      expect((out.trace as any).steps.length).toBe(4);
    });

    it('TC-VIS-085: total_token_usage passes through', async () => {
      insTrace(ctxEnv.db, {
        trace_id: 'trace-tok', agent_id: 'agent-1',
        start_time: 1700000001000, end_time: 1700000005000,
        iterations_json: '[]', total_token_usage: 500,
      });

      const input = new GetAgentTraceInput();
      input.agent_id = 'agent-1';
      input.trace_id = 'trace-tok';
      const out = new GetAgentTraceOutput();
      await svc.soAgentTrace(input, out, ctx());
      expect((out.trace as any).total_token_usage).toBe(500);
    });

    it('TC-VIS-054-A: Trace resolution with 20+ agents returns in reasonable order', async () => {
      for (let i = 0; i < 25; i++) {
        insTrace(ctxEnv.db, {
          trace_id: `trace-${i + 1}`, agent_id: `agent-${i + 1}`,
          start_time: 1700000001000 + i * 1000, end_time: 1700000005000 + i * 1000,
          iterations_json: '[]', total_token_usage: 400 - i * 10,
        });
      }

      for (let i = 0; i < 5; i++) {
        const idx = i + 1;
        const input = new GetAgentTraceInput();
        input.agent_id = `agent-${idx}`;
        input.trace_id = `trace-${idx}`;
        const out = new GetAgentTraceOutput();
        await svc.soAgentTrace(input, out, ctx());
        expect((out.trace as any).agent_id).toBe(`agent-${idx}`);
        expect((out.trace as any).trace_id).toBe(`trace-${idx}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 6. soVisualizedMessageDAG  TC-VIS-095 ~ TC-VIS-110
  // ═══════════════════════════════════════════════════════════════
  describe('soVisualizedMessageDAG', () => {
    it('TC-VIS-095: Get DAG -> graph(nodes+edges) + metadata', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-user',
        info_type: 'REQUEST', info: 'Q', info_length: 1 });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-agent',
        info_type: 'RESPONSE', info: 'A', info_length: 1 });

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      expect(out.session_id).toBe('sess-1');
      expect((out.graph as any).nodes).toBeDefined();
      expect((out.graph as any).edges).toBeDefined();
      expect(out.metadata).toHaveProperty('total_nodes');
      expect(out.metadata).toHaveProperty('total_edges');
    });

    it('TC-VIS-096: By work_id scope', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-A', info_id: 'info-1', info: 'A' });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-B', info_id: 'info-2', info: 'B' });
      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      input.work_id = 'work-A';
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      for (const n of (out.graph as any).nodes) expect(n.work_id).toBe('work-A');
    });

    it('TC-VIS-097: include_question_answer_edges=true (default) -> QA edges', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-user',
        info_type: 'REQUEST', info: 'Q', info_length: 1 });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-agent',
        info_type: 'RESPONSE', info: 'A', info_length: 1 });

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      input.include_question_answer_edges = true;
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      const qa = (out.graph as any).edges.filter((e: any) => e.edge_type === 'QUESTION_ANSWER');
      expect(qa.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-VIS-098: include_question_answer_edges=false -> no QA', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-user',
        info_type: 'REQUEST', info: 'Q', info_length: 1 });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-agent',
        info_type: 'RESPONSE', info: 'A', info_length: 1 });

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      input.include_question_answer_edges = false;
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      const qa = (out.graph as any).edges.filter((e: any) => e.edge_type === 'QUESTION_ANSWER');
      expect(qa.length).toBe(0);
    });

    it('TC-VIS-099: include_citation_edges=true (default) -> CITATION edges', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', info_id: 'info-a', info_type: 'RESPONSE', info: 'A' });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', info_id: 'info-b', info_type: 'RESPONSE', info: 'B' });
      await insInfoGraph(ctxEnv.graphDBAccess, 'info-a', 'info-b');

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      input.include_citation_edges = true;
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      const cite = (out.graph as any).edges.filter((e: any) => e.edge_type === 'CITATION');
      expect(cite.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-VIS-100: include_citation_edges=false -> no citation', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', info_id: 'info-a', info: 'A' });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', info_id: 'info-b', info_type: 'RESPONSE', info: 'B' });
      await insInfoGraph(ctxEnv.graphDBAccess, 'info-a', 'info-b');

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      input.include_citation_edges = false;
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      const cite = (out.graph as any).edges.filter((e: any) => e.edge_type === 'CITATION');
      expect(cite.length).toBe(0);
    });

    it('TC-VIS-101: Only QA edges', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-q',
        info_type: 'REQUEST', info: 'Q' });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-a',
        info_type: 'RESPONSE', info: 'A' });

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      input.include_question_answer_edges = true;
      input.include_citation_edges = false;
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      const edges = (out.graph as any).edges;
      expect(edges.filter((e: any) => e.edge_type === 'QUESTION_ANSWER').length).toBe(1);
      expect(edges.filter((e: any) => e.edge_type === 'CITATION').length).toBe(0);
    });

    it('TC-VIS-102: Only citation edges', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-q',
        info_type: 'REQUEST', info: 'Q' });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', info_id: 'info-a',
        info_type: 'RESPONSE', info: 'A' });
      await insInfoGraph(ctxEnv.graphDBAccess, 'info-q', 'info-a');

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      input.include_question_answer_edges = false;
      input.include_citation_edges = true;
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      const edges = (out.graph as any).edges;
      expect(edges.filter((e: any) => e.edge_type === 'QUESTION_ANSWER').length).toBe(0);
      expect(edges.filter((e: any) => e.edge_type === 'CITATION').length).toBe(1);
    });

    it('TC-VIS-103: max_nodes=100 limited', async () => {
      for (let i = 0; i < 150; i++) {
        insInfoRaw(ctxEnv.db, { session_id: 'sess-1', info_id: `info-${i}`, info: `m${i}` });
      }
      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      input.max_nodes = 100;
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      expect((out.graph as any).nodes.length).toBeLessThanOrEqual(100);
    });

    it('TC-VIS-104: Same work_id -> QUESTION_ANSWER edge', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-s', info_id: 'info-q',
        info_type: 'REQUEST', info: 'Q' });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-s', info_id: 'info-a',
        info_type: 'RESPONSE', info: 'A' });

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      const qa = (out.graph as any).edges.find((e: any) =>
        e.edge_type === 'QUESTION_ANSWER' && e.from === 'info-q' && e.to === 'info-a');
      expect(qa).toBeDefined();
      expect(qa.work_id).toBe('work-s');
    });

    it('TC-VIS-105: Cross-work citation -> CITATION edge', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-A', info_id: 'info-citing',
        info_type: 'RESPONSE', info: 'C' });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-B', info_id: 'info-cited',
        info_type: 'RESPONSE', info: 'D' });
      await insInfoGraph(ctxEnv.graphDBAccess, 'info-citing', 'info-cited');

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      const cite = (out.graph as any).edges.find((e: any) => e.edge_type === 'CITATION');
      expect(cite).toBeDefined();
      expect(cite.from).toBe('info-cited');
      expect(cite.to).toBe('info-citing');
    });

    it('TC-VIS-106: Nodes have all properties', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', interact_id: 'inter-1',
        info_id: 'info-1', info_type: 'REQUEST', info: 'Hello', info_length: 5 });

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      const node = (out.graph as any).nodes[0];
      expect(node).toHaveProperty('id', 'info-1');
      expect(node).toHaveProperty('label');
      expect(node).toHaveProperty('info_id', 'info-1');
      expect(node).toHaveProperty('work_id', 'work-1');
      expect(node).toHaveProperty('interact_id', 'inter-1');
      expect(node).toHaveProperty('info_type', 'REQUEST');
      expect(node).toHaveProperty('info_summary');
    });

    it('TC-VIS-107: metadata has counts', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-user',
        info_type: 'REQUEST', info: 'Q' });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'info-agent',
        info_type: 'RESPONSE', info: 'A' });

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      expect(out.metadata).toHaveProperty('total_nodes');
      expect(out.metadata).toHaveProperty('total_edges');
      expect(out.metadata).toHaveProperty('max_nodes_limit');
    });

    it('TC-VIS-108: No session_id handled gracefully', async () => {
      const input = new GetVisualizedMessageDAGInput();
      (input as any).session_id = '';
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      expect(out.session_id).toBe('');
      expect((out.graph as any).nodes).toBeDefined();
    });

    it('TC-VIS-109: Empty session -> nodes=[], edges=[]', async () => {
      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'empty-sess';
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());
      expect((out.graph as any).nodes).toEqual([]);
      expect((out.graph as any).edges).toEqual([]);
    });

    it('TC-VIS-110: Large DAG performance — 500 messages, max_nodes limits response', async () => {
      const sessId = 'large-sess';
      for (let i = 0; i < 500; i++) {
        insInfoRaw(ctxEnv.db, { session_id: sessId, work_id: 'work-L',
          info_id: `info-${i}`, info: `m${i}` });
      }

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = sessId;
      input.max_nodes = 50;
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());

      expect((out.graph as any).nodes.length).toBeLessThanOrEqual(50);
      const nodeIds = (out.graph as any).nodes.map((n: any) => n.info_id);
      for (let i = 0; i < nodeIds.length - 1; i++) {
        const aId = parseInt(nodeIds[i].split('-')[1], 10);
        const bId = parseInt(nodeIds[i + 1].split('-')[1], 10);
        expect(aId).toBeGreaterThan(bId);
      }
    });

    it('TC-VIS-111: 追问关系 — 未复选上下文时建立上一回答→本次提问 FOLLOW_UP 边', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'q1',
        info_type: 'REQUEST', info: 'Q1', created: 100 });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'a1',
        info_type: 'RESPONSE', info: 'A1', created: 200 });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-2', info_id: 'q2',
        info_type: 'REQUEST', info: 'Q2', created: 300 });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-2', info_id: 'a2',
        info_type: 'RESPONSE', info: 'A2', created: 400 });

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());

      const edges = (out.graph as any).edges;
      const followup = edges.find((e: any) => e.edge_type === 'FOLLOW_UP' && e.from === 'a1' && e.to === 'q2');
      expect(followup).toBeDefined();
      expect(followup.id).toBe('followup_a1->q2');
      expect(edges.filter((e: any) => e.edge_type === 'FOLLOW_UP').length).toBe(1);
    });

    it('TC-VIS-112: 追问关系 — 复选上下文后不补追问边', async () => {
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'q1',
        info_type: 'REQUEST', info: 'Q1', created: 100 });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-1', info_id: 'a1',
        info_type: 'RESPONSE', info: 'A1', created: 200 });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-2', info_id: 'q2',
        info_type: 'REQUEST', info: 'Q2', created: 300 });
      insInfoRaw(ctxEnv.db, { session_id: 'sess-1', work_id: 'work-2', info_id: 'a2',
        info_type: 'RESPONSE', info: 'A2', created: 400 });
      // q2 通过复选框引用 a1（显式引用边）
      await insInfoGraph(ctxEnv.graphDBAccess, 'q2', 'a1');

      const input = new GetVisualizedMessageDAGInput();
      input.session_id = 'sess-1';
      const out = new GetVisualizedMessageDAGOutput();
      await svc.soVisualizedMessageDAG(input, out, ctx());

      const edges = (out.graph as any).edges;
      const followup = edges.find((e: any) => e.edge_type === 'CITATION' && e.from === 'a1' && e.to === 'q2');
      expect(followup).toBeDefined();
      expect(followup.id).toBe('cite_a1_q2');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 7. soResource  TC-VIS-120 ~ TC-VIS-133
  // ═══════════════════════════════════════════════════════════════
  describe('soResource', () => {
    it('TC-VIS-120: Query agent -> returns agent metadata', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'agent';
      input.resource_id = 'agent-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-121: Query llm -> returns LLM details', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'llm';
      input.resource_id = 'llm-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-122: Query soul -> returns soul content', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'soul';
      input.resource_id = 'soul-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-123: Query skill -> returns skill details', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'skill';
      input.resource_id = 'skill-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-124: Query mcp -> returns MCP details', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'mcp';
      input.resource_id = 'mcp-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-125: Query prompt -> returns prompt template', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'prompt';
      input.resource_id = 'prompt-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-126: Query trace -> returns trace data', async () => {
      insTrace(ctxEnv.db, { trace_id: 'trace-1', agent_id: 'agent-1' });

      const input = new GetResourceInput();
      input.resource_type = 'trace';
      input.resource_id = 'trace-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-127: Query info -> returns message content', async () => {
      insInfoRaw(ctxEnv.db, { info_id: 'info-1', info: 'message content', info_type: 'REQUEST' });

      const input = new GetResourceInput();
      input.resource_type = 'info';
      input.resource_id = 'info-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-128: Query eval -> returns evaluation', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'eval';
      input.resource_id = 'eval-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-129: Query plan -> returns plan + task DAG', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'plan';
      input.resource_id = 'plan-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-130: Query context -> returns context snapshot', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'context';
      input.resource_id = 'ctx-1';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-131: Invalid resource_type -> error in resource', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'nonsense';
      input.resource_id = 'x';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect((out.resource as any).error).toBeDefined();
    });

    it('TC-VIS-132: Non-existent resource_id -> error in resource', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'agent';
      input.resource_id = 'nonexistent';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });

    it('TC-VIS-133: Empty resource_id returns empty resource', async () => {
      const input = new GetResourceInput();
      input.resource_type = 'agent';
      input.resource_id = '';
      const out = new GetResourceOutput();
      await svc.soResource(input, out, ctx());
      expect(out.resource).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 8. configVisualization
  // ═══════════════════════════════════════════════════════════════
  describe('configVisualization', () => {
    it('should return default config when none exists', async () => {
      const input = new ConfigVisualizationInput();
      const out = new ConfigVisualizationOutput();
      await svc.configVisualization(input, out, ctx());
      const c = out.config as any;
      expect(c.max_nodes_per_graph).toBe(200);
      expect(c.default_message_summary_length).toBe(50);
      expect(c.resolve_content_by_default).toBe(1);
    });

    it('should update max_nodes_per_graph', async () => {
      const input = new ConfigVisualizationInput();
      input.max_nodes_per_graph = 500;
      const out = new ConfigVisualizationOutput();
      await svc.configVisualization(input, out, ctx());
      expect((out.config as any).max_nodes_per_graph).toBe(500);
    });

    it('should update default_message_summary_length', async () => {
      const input = new ConfigVisualizationInput();
      input.default_message_summary_length = 100;
      const out = new ConfigVisualizationOutput();
      await svc.configVisualization(input, out, ctx());
      expect((out.config as any).default_message_summary_length).toBe(100);
    });

    it('should update resolve_content_by_default', async () => {
      const input = new ConfigVisualizationInput();
      input.resolve_content_by_default = false;
      const out = new ConfigVisualizationOutput();
      await svc.configVisualization(input, out, ctx());
      expect((out.config as any).resolve_content_by_default).toBe(0);
    });

    it('should handle multiple config updates', async () => {
      const input = new ConfigVisualizationInput();
      input.max_nodes_per_graph = 300;
      input.default_message_summary_length = 80;
      input.resolve_content_by_default = false;
      const out = new ConfigVisualizationOutput();
      await svc.configVisualization(input, out, ctx());
      const c = out.config as any;
      expect(c.max_nodes_per_graph).toBe(300);
      expect(c.default_message_summary_length).toBe(80);
      expect(c.resolve_content_by_default).toBe(0);
    });

    it('should persist config across calls', async () => {
      const input1 = new ConfigVisualizationInput();
      input1.max_nodes_per_graph = 111;
      const out1 = new ConfigVisualizationOutput();
      await svc.configVisualization(input1, out1, ctx());
      expect((out1.config as any).max_nodes_per_graph).toBe(111);

      const input2 = new ConfigVisualizationInput();
      const out2 = new ConfigVisualizationOutput();
      await svc.configVisualization(input2, out2, ctx());
      expect((out2.config as any).max_nodes_per_graph).toBe(111);
    });
  });

  describe('config proxy', () => {
    it('TC-VIS-140: configVisualization is internal method', async () => {
      const input = new ConfigVisualizationInput();
      const out = new ConfigVisualizationOutput();

      const result = await svc.configVisualization(input, out, ctx());
      expect(result).toBe(true);
      expect(out.config).toBeDefined();
    });

    it('TC-VIS-141: Config update through service — max_nodes_per_graph', async () => {
      const input = new ConfigVisualizationInput();
      input.max_nodes_per_graph = 250;
      const out = new ConfigVisualizationOutput();

      await svc.configVisualization(input, out, ctx());
      expect((out.config as any).max_nodes_per_graph).toBe(250);
    });

    it('TC-VIS-142: Config update through service — default_message_summary_length', async () => {
      const input = new ConfigVisualizationInput();
      input.default_message_summary_length = 75;
      const out = new ConfigVisualizationOutput();

      await svc.configVisualization(input, out, ctx());
      expect((out.config as any).default_message_summary_length).toBe(75);
    });

    it('TC-VIS-143: Config update through service — resolve_content_by_default', async () => {
      const input = new ConfigVisualizationInput();
      input.resolve_content_by_default = false;
      const out = new ConfigVisualizationOutput();

      await svc.configVisualization(input, out, ctx());
      expect((out.config as any).resolve_content_by_default).toBe(0);
    });
  });

  describe('soAgentChain', () => {
    it('TC-VIS-144: empty exchange_id returns empty nodes', async () => {
      const out = new GetAgentChainOutput();
      await svc.soAgentChain(Object.assign(new GetAgentChainInput(), { exchange_id: '' }), out, ctx());
      expect(out.nodes).toEqual([]);
    });

    it('TC-VIS-145: work_id maps execution records to chain nodes', async () => {
      insOrchWork(ctxEnv.db, { work_id: 'work-chain', interact_id: 'ex-1' });
      insOrchAgentExec(ctxEnv.db, {
        work_id: 'work-chain', agent_id: 'agent-writer', status: 'COMPLETED',
        execution_type: 'SYSTEM', task_content: 'write', answer: 'done', elapsed_ms: 12,
      });
      const out = new GetAgentChainOutput();
      await svc.soAgentChain(Object.assign(new GetAgentChainInput(), { exchange_id: 'work-chain' }), out, ctx());
      expect(out.nodes.length).toBeGreaterThanOrEqual(1);
      expect(out.nodes[0].id).toBe('agent-writer');
      expect(out.nodes[0].status).toBe('done');
      expect(out.nodes[0].children).toEqual([]);
    });
  });
});
