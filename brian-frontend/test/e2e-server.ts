import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { vi } from 'vitest';
import { RelationDBAccess, IdGenerator, LLMAccess, MCPAccess, SoulAccess, SkillAccess, PromptsAccess, GraphDBAccess, MQAccess, LogAccess } from '@brian-agent/base';
import { InfoCoreAccess, LLMCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess, MQCoreAccess } from '@brian-agent/core';
import { AgentLibraryAccess, AgentStrategyAccess, AgentBuilderAccess, AgentExecutionAccess, AgentContextAccess, PlannerAgentAccess, WriterAgentAccess, EvolutorAgentAccess } from '@brian-agent/agent';
import { OrchestrationEntryAccess, OrchestrationStrategyAccess, OrchestrationExecutionAccess, OrchestrationVisualizationAccess, JSONNodeAccess } from '@brian-agent/orchestration';

const brianAppRoot = path.resolve(__dirname, '../../brian-backend/Application');

async function getChatAccessModule(): Promise<any> {
  return import(path.join(brianAppRoot, 'Chat/access/ChatAccess'));
}

async function getChatSchemaInitModule(): Promise<any> {
  return import(path.join(brianAppRoot, 'Chat/infrastructure/ChatSchemaInitializer'));
}

let _seq = 0;
const tempDirs: string[] = [];

function resetSeq() { _seq = 0; }
function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join('/tmp/opencode', 'brian-e2e-test-'));
  tempDirs.push(dir);
  return dir;
}

export function cleanupE2ETempDirs() {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tempDirs.length = 0;
}

function createMockLogger(): any {
  return { debug: () => {}, error: () => {} };
}

function addColumnIfNotExists(relationDb: any, table: string, column: string, type: string): void {
  try {
    relationDb.executeRaw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
  } catch { /* column exists */ }
}

function mockExternalLLMMethods(llmAccess: any) {
  vi.spyOn(llmAccess as any, 'execLLM' as any).mockImplementation(async (_i: any, _c: any, o: any) => {
    o.response = 'Mock LLM response for testing';
    o.token_usage = { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 };
    return true;
  });
  vi.spyOn(llmAccess as any, 'testLLMProvider' as any).mockImplementation(async () => true);
  vi.spyOn(llmAccess as any, 'listLLM' as any).mockImplementation(async (_i: any, _c: any, o: any) => {
    o.models = [];
    return true;
  });
}

function mockExternalMCPMethods(mcpAccess: any) {
  vi.spyOn(mcpAccess as any, 'testMcpProvider' as any).mockImplementation(async () => true);
  vi.spyOn(mcpAccess as any, 'listMcp' as any).mockImplementation(async (_i: any, _c: any, o: any) => {
    o.mcps = [];
    return true;
  });
  vi.spyOn(mcpAccess as any, 'installMcp' as any).mockImplementation(async (_i: any, _c: any, o: any) => {
    o.install_id = 'mock-install-id';
    return true;
  });
  vi.spyOn(mcpAccess as any, 'startMcp' as any).mockImplementation(async () => true);
  vi.spyOn(mcpAccess as any, 'stopMcp' as any).mockImplementation(async () => true);
  vi.spyOn(mcpAccess as any, 'uninstallMcp' as any).mockImplementation(async () => true);
  vi.spyOn(mcpAccess as any, 'execMcp' as any).mockImplementation(async (_i: any, _c: any, o: any) => {
    o.result = 'mock MCP result';
    return true;
  });
}

function createInMemoryVectorDBAccess() {
  const store = new Map<string, any>();
  return {
    addVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      const ids: string[] = [];
      for (const v of _i.vectors || []) {
        const id = v.id || `vec-${++_seq}`;
        store.set(id, { id, content: v.content || '', embedding: v.embedding || [], user_id: v.user_id, metadata: typeof v.metadata === 'string' ? v.metadata : JSON.stringify(v.metadata || {}), created: Date.now(), updated: Date.now() });
        ids.push(id);
      }
      o.ids = ids;
      return true;
    }),
    delVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      let count = 0;
      for (const id of _i.ids || []) { if (store.delete(id)) count++; }
      o.deleted = count;
      return true;
    }),
    delVectorByFilter: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.deleted = 0; return true; }),
    soVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.vectors = []; return true; }),
    getVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.vector = store.get(_i.id) || null; return true; }),
    countVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.count = store.size; return true; }),
    visualizedVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.data = []; return true; }),
    enableVectorDB: vi.fn().mockResolvedValue(true),
    closeVectorDB: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    getStore: () => store,
  };
}

export interface E2ETestContext {
  db: any;
  tempDir: string;
  relationDb: any;
  llmAccess: any;
  mcpAccess: any;
  soulAccess: any;
  skillAccess: any;
  promptsAccess: any;
  graphDBAccess: any;
  mqAccess: any;
  logAccess: any;
  vectorDbAccess: any;
  infoCore: any;
  llmCore: any;
  mcpCore: any;
  skillCore: any;
  soulCore: any;
  mqCore: any;
  agentLibrary: any;
  agentStrategy: any;
  agentContext: any;
  agentBuilder: any;
  agentExecution: any;
  plannerAgent: any;
  writerAgent: any;
  evolutorAgent: any;
  orchestrationExecution: any;
  orchestrationVisualization: any;
  jsonNode: any;
  orchestrationStrategy: any;
  orchestrationEntry: any;
  chatAccess: any;
}

export async function setupE2ETestEnvironment(): Promise<E2ETestContext> {
  resetSeq();
  vi.spyOn(IdGenerator, 'generate').mockImplementation(() => `gen-id-${++_seq}`);
  vi.spyOn(IdGenerator, 'now').mockImplementation(() => 1700000000000 + _seq);

  const tempDir = makeTempDir();
  const logger = createMockLogger();
  const relationDb = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
  await relationDb.initialize();

  const llmAccess = new LLMAccess(relationDb, logger);
  await llmAccess.initialize();
  mockExternalLLMMethods(llmAccess);

  const mcpAccess = new MCPAccess(relationDb, logger);
  await mcpAccess.initialize();
  mockExternalMCPMethods(mcpAccess);

  const soulAccess = new SoulAccess(relationDb, logger);
  await soulAccess.initialize();

  const skillAccess = new SkillAccess(relationDb, logger);
  await skillAccess.initialize();

  const promptsAccess = new PromptsAccess(relationDb, logger);
  await promptsAccess.initialize();

  const graphDBAccess = new GraphDBAccess(relationDb, { dbPath: path.join(tempDir, 'graph.db') }, logger);
  await graphDBAccess.initialize();

  const mqAccess = new MQAccess(relationDb, logger);
  await mqAccess.initialize();

  const logAccess = new LogAccess(relationDb, logger);
  await logAccess.initialize();

  addColumnIfNotExists(relationDb, 'skill_usage', 'agent_skill_id', 'TEXT');
  addColumnIfNotExists(relationDb, 'skill_usage', 'timestamp', 'INTEGER');
  addColumnIfNotExists(relationDb, 'soul_usage', 'soul_usage_type', 'TEXT');

  const vectorDbAccess = createInMemoryVectorDBAccess();

  const infoCore = new InfoCoreAccess(relationDb, llmAccess, promptsAccess, vectorDbAccess as any, graphDBAccess, logger);
  await infoCore.initialize();

  const llmCore = new LLMCoreAccess(relationDb, llmAccess, promptsAccess, logger);
  await llmCore.initialize();

  const mcpCore = new MCPCoreAccess(relationDb, mcpAccess, llmAccess, promptsAccess, logger);
  try { await (mcpCore as any).initialize?.(); } catch { /* no initialize */ }

  const skillCore = new SkillCoreAccess(relationDb, skillAccess, llmAccess, promptsAccess, logger);
  try { await (skillCore as any).initialize?.(); } catch { /* no initialize */ }

  const soulCore = new SoulCoreAccess(relationDb, soulAccess, llmAccess, promptsAccess, logger);
  await soulCore.initialize();

  const mqCore = new MQCoreAccess(mqAccess, logger);

  const agentLibrary = new AgentLibraryAccess(relationDb, llmAccess, promptsAccess, logger);
  await agentLibrary.initialize();

  const agentStrategy = new AgentStrategyAccess(relationDb, llmAccess, promptsAccess, logger);
  await agentStrategy.initialize();

  const agentContext = new AgentContextAccess(relationDb, infoCore, logger);
  await agentContext.initialize();

  const agentBuilder = new AgentBuilderAccess(relationDb, llmAccess, promptsAccess, agentLibrary, agentStrategy, llmCore, mcpCore, skillCore, soulCore, logger);
  await agentBuilder.initialize();

  const agentExecution = new AgentExecutionAccess(relationDb, llmAccess, promptsAccess, skillAccess, soulAccess, mcpAccess, mqAccess, agentLibrary, agentStrategy, infoCore, mqCore, skillCore, mcpCore, logger);
  await agentExecution.initialize();

  const writerAgent = new WriterAgentAccess(relationDb, llmAccess, promptsAccess, infoCore, agentBuilder, agentLibrary, soulAccess, logger);
  await writerAgent.initialize();

  const plannerAgent = new PlannerAgentAccess(relationDb, llmAccess, promptsAccess, infoCore, agentBuilder, agentLibrary, logger);
  await plannerAgent.initialize();

  const evolutorAgent = new EvolutorAgentAccess(relationDb, llmAccess, promptsAccess, infoCore, mqAccess, mqCore, agentBuilder, agentLibrary, agentExecution, logger);
  await evolutorAgent.initialize();

  const orchestrationExecution = new OrchestrationExecutionAccess(relationDb, agentBuilder, agentExecution, agentLibrary, infoCore, mqAccess, mqCore, logger);
  await orchestrationExecution.initialize();

  const orchestrationVisualization = new OrchestrationVisualizationAccess(relationDb, agentLibrary, agentExecution, logger);
  await orchestrationVisualization.initialize();

  const jsonNode = new JSONNodeAccess(relationDb, infoCore, agentBuilder, writerAgent, plannerAgent, evolutorAgent, orchestrationExecution, llmAccess, promptsAccess, mqAccess, mqCore, logger);
  await jsonNode.initialize();

  const orchestrationStrategy = new OrchestrationStrategyAccess(relationDb, agentBuilder, plannerAgent, writerAgent, evolutorAgent, orchestrationExecution, jsonNode, mqCore, logger);
  await orchestrationStrategy.initialize();

  const orchestrationEntry = new OrchestrationEntryAccess(relationDb, infoCore, writerAgent, orchestrationStrategy, orchestrationExecution, llmAccess, promptsAccess, mqAccess, mqCore, logger);
  await orchestrationEntry.initialize();

  const schemaInitModule = await getChatSchemaInitModule();
  const chatAccessModule = await getChatAccessModule();
  const ChatSchemaInitializer = schemaInitModule.ChatSchemaInitializer;
  const ChatAccess = chatAccessModule.ChatAccess;

  new ChatSchemaInitializer(relationDb).init();
  const chatAccess = new ChatAccess(relationDb, infoCore, writerAgent, evolutorAgent, orchestrationEntry, logger);

  return {
    db: relationDb, tempDir, relationDb,
    llmAccess, mcpAccess, soulAccess, skillAccess, promptsAccess,
    graphDBAccess, mqAccess, logAccess, vectorDbAccess,
    infoCore, llmCore, mcpCore, skillCore, soulCore, mqCore,
    agentLibrary, agentStrategy, agentContext, agentBuilder, agentExecution,
    plannerAgent, writerAgent, evolutorAgent,
    orchestrationExecution, orchestrationVisualization, jsonNode,
    orchestrationStrategy, orchestrationEntry,
    chatAccess,
  };
}

function jsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function sendJson(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function createE2ETestServer(ctx: E2ETestContext): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;
      const method = req.method || 'GET';
      const params = url.searchParams;
      const body = method === 'POST' || method === 'PUT' || method === 'DELETE' ? await jsonBody(req) : {};

      // ---- Chat Routes (Real Backend) ----
      if (method === 'GET' && pathname === '/api/chat/list') {
        const input: any = { keyword: params.get('keyword') || undefined };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.searchSession(input, context, output);
        sendJson(res, 200, { sessions: output.sessions || [], total: output.total });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/history/')) {
        const sessionId = pathname.split('/api/chat/history/')[1];
        const input: any = { session_id: sessionId };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.getChatHistory(input, context, output);
        sendJson(res, 200, { messages: output.messages || [] });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/exchanges/')) {
        const sessionId = pathname.split('/api/chat/exchanges/')[1];
        const input: any = { session_id: sessionId };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.getChatHistory(input, context, output);
        sendJson(res, 200, { exchanges: output.messages || [] });

      } else if (method === 'POST' && pathname === '/api/chat/send') {
        const input: any = {
          session_id: body.session_id || body.sessionId,
          msg_content: body.msg_content || body.content,
          citing_msg_ids: body.citing_msg_ids || body.citingIds,
        };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.submitWork(input, context, output);
        sendJson(res, 200, { msgId: output.interact_id, workId: output.work_id });

      } else if (method === 'DELETE' && pathname.startsWith('/api/chat/session/')) {
        const sessionId = pathname.split('/api/chat/session/')[1];
        const input: any = { session_ids: [sessionId] };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.deleteSession(input, context, output);
        sendJson(res, 200, { deleted_count: output.deleted_count });

      } else if (method === 'GET' && pathname === '/api/chat/search') {
        const keyword = params.get('keyword') || '';
        const input: any = { keyword };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.searchMessage(input, context, output);
        sendJson(res, 200, { messages: output.messages || [], total: output.total });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/dag')) {
        sendJson(res, 200, { nodes: [], edges: [] });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/agent-chain/')) {
        sendJson(res, 200, { nodes: [] });

      } else if (method === 'POST' && pathname.startsWith('/api/chat/cancel/')) {
        sendJson(res, 200, { cancelled: true });

      } else if (method === 'POST' && pathname === '/api/chat/create-session') {
        const input: any = { session_title: body.title || body.session_title || '' };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.createSession(input, context, output);
        sendJson(res, 200, { session_id: output.session_id, session_title: output.session_title, created: output.created });

      // ---- Memory Routes ----
      } else if (method === 'GET' && pathname === '/api/memory/list') {
        const input: any = { keyword: params.get('keyword') || undefined };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.searchSession(input, context, output);
        sendJson(res, 200, { memories: (output.sessions || []).map((s: any) => ({ workId: s.session_id, summary: s.session_title, timeRange: { start: s.created, end: s.updated } })) });

      } else if (method === 'GET' && /\/api\/memory\/tag\//.test(pathname)) {
        sendJson(res, 200, []);

      } else if (method === 'GET' && pathname === '/api/memory/search') {
        const keyword = params.get('keyword') || '';
        const input: any = { keyword };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.searchMessage(input, context, output);
        sendJson(res, 200, output.messages || []);

      } else if (method === 'GET' && pathname === '/api/memory/tags') {
        sendJson(res, 200, { tags: [] });

      } else if (method === 'GET' && pathname === '/api/memory/tag-graph') {
        sendJson(res, 200, { nodes: [], edges: [] });

      } else if (method === 'GET' && pathname === '/api/memory/keyword-graph') {
        sendJson(res, 200, { nodes: [], edges: [] });

      } else if (method === 'GET' && /\/api\/memory\/stats\//.test(pathname)) {
        const input: any = {};
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.searchSession(input, context, output);
        sendJson(res, 200, { totalMemories: output.total || 0, byType: {} });

      // ---- Config Routes ----
      } else if (method === 'GET' && pathname === '/api/config') {
        sendJson(res, 200, { config: { layers: { BASE: { readable: true, writable: true } } } });

      } else if (method === 'PUT' && pathname === '/api/config') {
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/config/model') {
        sendJson(res, 200, []);

      } else if (method === 'GET' && pathname.startsWith('/api/config/model/')) {
        const modelId = pathname.split('/').filter(Boolean).pop();
        sendJson(res, 200, { id: modelId, name: 'mock-model', provider: 'mock' });

      } else if (method === 'GET' && pathname === '/api/config/provider') {
        sendJson(res, 200, []);

      } else if (method === 'GET' && pathname === '/api/config/soul') {
        const sInput: any = {};
        const sOutput: any = {};
        const sContext: any = {};
        await ctx.soulAccess.soSoul(sInput, sContext, sOutput);
        sendJson(res, 200, sOutput.souls || []);

      } else if (method === 'GET' && pathname === '/api/config/work') {
        sendJson(res, 200, []);

      } else if (method === 'GET' && pathname === '/api/config/mcp') {
        sendJson(res, 200, []);

      // ---- Skill Routes ----
      } else if (method === 'GET' && pathname === '/api/skill') {
        const skInput: any = {};
        const skOutput: any = {};
        const skContext: any = {};
        await ctx.skillAccess.soSkill(skInput, skContext, skOutput);
        sendJson(res, 200, { skills: skOutput.skills || [] });

      } else if (method === 'POST' && pathname === '/api/skill') {
        sendJson(res, 200, { id: `skill-${++_seq}`, name: body.name || 'new-skill' });

      } else if (method === 'DELETE' && pathname.startsWith('/api/skill/')) {
        sendJson(res, 200, { success: true });

      // ---- Agent Routes ----
      } else if (method === 'GET' && pathname === '/api/agent') {
        const aInput: any = {};
        const aOutput: any = {};
        const aContext: any = {};
        await ctx.agentLibrary.soAgent(aInput, aContext, aOutput);
        sendJson(res, 200, { agents: aOutput.agents || [] });

      } else if (method === 'POST' && pathname === '/api/agent') {
        sendJson(res, 200, { id: `agent-${++_seq}`, name: body.name || 'new-agent' });

      } else if (method === 'DELETE' && pathname.startsWith('/api/agent/')) {
        sendJson(res, 200, { success: true });

      // ---- MCP Routes ----
      } else if (method === 'GET' && pathname === '/api/mcp') {
        const mcpInput: any = {};
        const mcpOutput: any = {};
        const mcpContext: any = {};
        await ctx.mcpAccess.listMcp(mcpInput, mcpContext, mcpOutput);
        sendJson(res, 200, { installed: mcpOutput.mcps || [] });

      } else if (method === 'GET' && pathname === '/api/mcp/market') {
        sendJson(res, 200, { market: [] });

      // ---- Learning Routes ----
      } else if (method === 'POST' && pathname === '/api/learning/start') {
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && pathname === '/api/learning/stop') {
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && pathname === '/api/learning/mode') {
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && pathname === '/api/learning/driver-weights') {
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/learning/stats') {
        sendJson(res, 200, { totalLearnCount: 0, knowledgeCount: 0, insightCount: 0, weeklyLearnCount: 0 });

      } else if (method === 'GET' && pathname === '/api/learning/progress-enhanced') {
        sendJson(res, 200, { currentTask: null, queue: [], status: 'IDLE' });

      } else if (method === 'GET' && pathname === '/api/learning/queue') {
        sendJson(res, 200, { tasks: [] });

      } else if (method === 'GET' && pathname === '/api/learning/knowledge') {
        sendJson(res, 200, { items: [] });

      } else if (method === 'GET' && pathname === '/api/learning/insights') {
        sendJson(res, 200, { items: [] });

      // ---- Library Routes ----
      } else if (method === 'GET' && pathname === '/api/library/paths') {
        sendJson(res, 200, { paths: [] });

      } else if (method === 'POST' && pathname === '/api/library/paths') {
        sendJson(res, 200, { id: `lib-${++_seq}`, name: body.name, path: body.path });

      } else if (method === 'POST' && pathname === '/api/library/check-path') {
        const exists = !!(body.path && body.path.length > 0);
        sendJson(res, 200, { exists, isReadable: exists, isWritable: exists });

      // ---- Feedback Routes ----
      } else if (method === 'POST' && pathname === '/api/feedback') {
        sendJson(res, 200, { success: true });

      // ---- Profile Routes ----
      } else if (method === 'GET' && /\/api\/profile\//.test(pathname)) {
        sendJson(res, 200, { language: 'zh-CN', style: 'friendly', depth: 'detailed', format: 'markdown' });

      } else if (method === 'PUT' && /\/api\/profile\//.test(pathname)) {
        sendJson(res, 200, { success: true });

      // ---- Monitor Routes ----
      } else if (method === 'GET' && pathname === '/api/monitor/health-all') {
        sendJson(res, 200, {
          components: [
            { name: 'LLM Provider', status: 'HEALTHY', responseTime: 45 },
            { name: 'MCP', status: 'HEALTHY', responseTime: 12 },
            { name: 'RelationDB', status: 'HEALTHY', responseTime: 3 },
            { name: 'GraphDB', status: 'HEALTHY', responseTime: 8 },
            { name: 'VectorDB', status: 'HEALTHY', responseTime: 5 },
            { name: 'MQ', status: 'HEALTHY', responseTime: 2 },
          ]
        });

      } else if (method === 'GET' && pathname === '/api/monitor/resources') {
        sendJson(res, 200, { cpu: 25.5, memory: 42.3, disk: 58.1 });

      } else if (method === 'GET' && pathname === '/api/analytics/token-trend') {
        sendJson(res, 200, { points: [{ date: '2026-08-01', tokens: 1500 }] });

      } else if (method === 'GET' && pathname === '/api/analytics/model-distribution') {
        sendJson(res, 200, { models: [{ model: 'mock-model', tokens: 1500 }] });

      } else if (method === 'GET' && pathname === '/api/monitor/logs/query') {
        const entries = [
          { timestamp: Date.now(), level: 'INFO', source: 'system', message: 'Server started successfully' },
          { timestamp: Date.now() - 1000, level: 'DEBUG', source: 'chat', message: 'SSE connection established' },
        ];
        sendJson(res, 200, { entries });

      } else {
        sendJson(res, 404, { error: `Route not found: ${method} ${pathname}` });
      }
    } catch (err: any) {
      sendJson(res, 500, { error: err.message || 'Internal server error' });
    }
  });

  return server;
}

export async function startTestServer(): Promise<{ ctx: E2ETestContext; server: http.Server; port: number }> {
  const ctx = await setupE2ETestEnvironment();
  const server = createE2ETestServer(ctx);

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      const port = addr.port;
      resolve({ ctx, server, port });
    });
    server.on('error', reject);
  });
}

export async function stopTestServer(server: http.Server) {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}
