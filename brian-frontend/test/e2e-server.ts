import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { vi } from 'vitest';
import { RelationDBAccess, IdGenerator, LLMAccess, MCPAccess, SoulAccess, SkillAccess, PromptsAccess, GraphDBAccess, MQAccess, LogAccess } from '@brian-agent/base';
import { InfoCoreAccess, LLMCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess, MQCoreAccess } from '@brian-agent/core';
import { AgentLibraryAccess, AgentStrategyAccess, AgentBuilderAccess, AgentExecutionAccess, AgentContextAccess, PlannerAgentAccess, WriterAgentAccess, EvolutorAgentAccess } from '@brian-agent/agent';
// ===== 原始导入（保留作为参考）：V1 编排框架已在 Runtime v2 重构中删除（commit b31f289），学习页文档学习已去编排化 =====
// import { OrchestrationEntryAccess, OrchestrationStrategyAccess, OrchestrationExecutionAccess, OrchestrationVisualizationAccess, JSONNodeAccess } from '@brian-agent/orchestration';

const brianAppRoot = path.resolve(__dirname, '../../brian-backend/Application');

async function getChatAccessModule(): Promise<any> {
  return import(path.join(brianAppRoot, 'Chat/access/ChatAccess'));
}

async function getSelfLearningModules(): Promise<any> {
  const access = await import(path.join(brianAppRoot, 'SelfLearning/access/SelfLearningAccess'));
  const types = await import(path.join(brianAppRoot, 'SelfLearning/domain/types'));
  return { access, types };
}

async function getChatSchemaInitModule(): Promise<any> {
  return import(path.join(brianAppRoot, 'Chat/infrastructure/ChatSchemaInitializer'));
}

let _seq = 0;
const tempDirs: string[] = [];

function resetSeq() { _seq = 0; }
function makeTempDir(): string {
  // 基础目录可能不存在（干净环境），先递归创建
  fs.mkdirSync('/tmp/opencode', { recursive: true });
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
  // ===== 原始字段（保留作为参考）：V1 编排已删除 =====
  // orchestrationExecution: any;
  // orchestrationVisualization: any;
  // jsonNode: any;
  // orchestrationStrategy: any;
  // orchestrationEntry: any;
  selfLearningAccess: any;
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
  try { await (mcpAccess as any).initialize?.(); } catch { /* no initialize */ }
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

  const logRelationDb = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
  await logRelationDb.initialize();
  const logAccess = new LogAccess(logRelationDb, logger);
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

  // ===== 原始编排装配（保留作为参考）：V1 编排框架已删除，学习页文档学习改为 LLM 直采（callLLMJson）=====
  // const orchestrationExecution = new OrchestrationExecutionAccess(relationDb, agentBuilder, agentExecution, agentLibrary, infoCore, mqAccess, mqCore, logger);
  // await orchestrationExecution.initialize();
  //
  // const orchestrationVisualization = new OrchestrationVisualizationAccess(relationDb, agentLibrary, agentExecution, logger);
  // await orchestrationVisualization.initialize();
  //
  // const jsonNode = new JSONNodeAccess(relationDb, infoCore, agentBuilder, writerAgent, plannerAgent, evolutorAgent, orchestrationExecution, llmAccess, promptsAccess, mqAccess, mqCore, logger);
  // await jsonNode.initialize();
  //
  // const orchestrationStrategy = new OrchestrationStrategyAccess(relationDb, agentBuilder, plannerAgent, writerAgent, evolutorAgent, orchestrationExecution, jsonNode, mqCore, logger);
  // await orchestrationStrategy.initialize();
  //
  // const orchestrationEntry = new OrchestrationEntryAccess(relationDb, infoCore, writerAgent, orchestrationStrategy, orchestrationExecution, llmAccess, promptsAccess, mqAccess, mqCore, logger);
  // await orchestrationEntry.initialize();

  const schemaInitModule = await getChatSchemaInitModule();
  const chatAccessModule = await getChatAccessModule();
  const ChatSchemaInitializer = schemaInitModule.ChatSchemaInitializer;
  const ChatAccess = chatAccessModule.ChatAccess;

  new ChatSchemaInitializer(relationDb).init();
  // Runtime v2 后 ChatAccess 构造签名为 (relationDb, infoCore, logger?, streamAccess?, runtime?)
  const chatAccess = new ChatAccess(relationDb, infoCore, logger);

  // SelfLearning（学习页真实后端）：依赖与 dev-server 装配一致
  const { ChunkAccess } = await import('@brian-agent/base');
  const chunkAccess = new ChunkAccess(logger);
  const { access: selfLearningAccessModule, types: selfLearningTypes } = await getSelfLearningModules();
  const selfLearningAccess = new selfLearningAccessModule.SelfLearningAccess(
    relationDb, infoCore, mqCore, llmCore, evolutorAgent, writerAgent, graphDBAccess, mqAccess, chunkAccess, llmAccess, promptsAccess, logger,
  );
  await selfLearningAccess.initialize();

  return {
    db: relationDb, tempDir, relationDb,
    llmAccess, mcpAccess, soulAccess, skillAccess, promptsAccess,
    graphDBAccess, mqAccess, logAccess, vectorDbAccess,
    infoCore, llmCore, mcpCore, skillCore, soulCore, mqCore,
    agentLibrary, agentStrategy, agentContext, agentBuilder, agentExecution,
    plannerAgent, writerAgent, evolutorAgent,
    selfLearningAccess,
    selfLearningTypes,
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
        await ctx.chatAccess.soSession(input, output, context);
        sendJson(res, 200, {
          sessions: (output.sessions || []).map((s: any) => ({
            sessionId: s.session_id,
            session_id: s.session_id,
            sessionTitle: s.session_title || '',
            session_title: s.session_title || '',
            lastMessage: s.last_message || s.session_title || '',
            last_message: s.last_message || s.session_title || '',
            lastTime: s.last_message_time,
            last_message_time: s.last_message_time,
            messageCount: s.message_count,
            message_count: s.message_count,
          })),
          total: output.total,
        });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/history/')) {
        const sessionId = pathname.split('/api/chat/history/')[1];
        const input: any = { session_id: sessionId };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.soChatHistory(input, output, context);
        sendJson(res, 200, { messages: output.messages || [] });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/exchanges/')) {
        const sessionId = pathname.split('/api/chat/exchanges/')[1];
        const input: any = { session_id: sessionId };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.soChatHistory(input, output, context);
        sendJson(res, 200, { exchanges: output.messages || [] });

      } else if (method === 'POST' && pathname === '/api/chat/send') {
        // ===== 原始路由（保留作为参考）：submitWork 已在 Runtime v2 重构中删除，
        // 新发送链路走 RunGateway（需 streamAccess/runtimeGateway/session 装配），属对话页专项，暂不在 e2e 装配范围 =====
        // const input: any = {
        //   session_id: body.session_id || body.sessionId,
        //   msg_content: body.msg_content || body.content,
        //   citing_msg_ids: body.citing_msg_ids || body.citingIds,
        // };
        // const output: any = {};
        // const context: any = {};
        // await ctx.chatAccess.submitWork(input, context, output);
        // sendJson(res, 200, { msgId: output.interact_id, workId: output.work_id });
        sendJson(res, 501, { error: 'chat send 已迁移 Runtime v2（RunGateway），e2e 装配未覆盖，见 TR-对话页面' });

      } else if (method === 'DELETE' && pathname.startsWith('/api/chat/session/')) {
        const sessionId = pathname.split('/api/chat/session/')[1];
        const input: any = { session_ids: [sessionId] };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.deleteSession(input, output, context);
        sendJson(res, 200, { deleted_count: output.deleted_count });

      } else if (method === 'GET' && pathname === '/api/chat/search') {
        const keyword = params.get('keyword') || '';
        const input: any = { keyword };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.soMessage(input, output, context);
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
        await ctx.chatAccess.createSession(input, output, context);
        sendJson(res, 200, { session_id: output.session_id, session_title: output.session_title, created: output.created });

      } else if ((method === 'PUT' || method === 'POST') && /\/api\/chat\/session\/[^/]+\/title$/.test(pathname)) {
        const sid = pathname.split('/api/chat/session/')[1].split('/')[0];
        const newTitle = body.title || body.session_title || '';
        const input: any = { session_id: sid, session_title: newTitle };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.updateSessionTitle(input, output, context);
        sendJson(res, 200, { success: true, session_id: sid, session_title: newTitle });

      // ---- Memory Routes ----
      } else if (method === 'GET' && pathname === '/api/memory/list') {
        const input: any = { keyword: params.get('keyword') || undefined };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.soSession(input, output, context);
        sendJson(res, 200, { memories: (output.sessions || []).map((s: any) => ({ workId: s.session_id, summary: s.session_title, timeRange: { start: s.created, end: s.updated } })) });

      } else if (method === 'GET' && /\/api\/memory\/tag\//.test(pathname)) {
        sendJson(res, 200, []);

      } else if (method === 'GET' && pathname === '/api/memory/search') {
        const keyword = params.get('keyword') || '';
        const input: any = { keyword };
        const output: any = {};
        const context: any = {};
        await ctx.chatAccess.soMessage(input, output, context);
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
        await ctx.chatAccess.soSession(input, output, context);
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

      // ---- Learning Routes（真实 SelfLearningAccess，镜像 dev-server 语义）----
      // ===== 原始 Mock 路由（保留作为参考）=====
      // } else if (method === 'POST' && pathname === '/api/learning/start') {
      //   sendJson(res, 200, { success: true });
      //
      // } else if (method === 'POST' && pathname === '/api/learning/stop') {
      //   sendJson(res, 200, { success: true });
      //
      // } else if (method === 'PUT' && pathname === '/api/learning/mode') {
      //   sendJson(res, 200, { success: true });
      //
      // } else if (method === 'PUT' && pathname === '/api/learning/driver-weights') {
      //   sendJson(res, 200, { success: true });
      //
      // } else if (method === 'GET' && pathname === '/api/learning/stats') {
      //   sendJson(res, 200, { totalLearnCount: 0, knowledgeCount: 0, insightCount: 0, weeklyLearnCount: 0 });
      //
      // } else if (method === 'GET' && pathname === '/api/learning/progress-enhanced') {
      //   sendJson(res, 200, { currentTask: null, queue: [], status: 'IDLE' });
      //
      // } else if (method === 'GET' && pathname === '/api/learning/queue') {
      //   sendJson(res, 200, { tasks: [] });
      //
      // } else if (method === 'GET' && pathname === '/api/learning/knowledge') {
      //   sendJson(res, 200, { items: [] });
      //
      // } else if (method === 'GET' && pathname === '/api/learning/insights') {
      //   sendJson(res, 200, { items: [] });
      // }
      } else if (pathname.startsWith('/api/learning/')) {
        const T = ctx.selfLearningTypes;
        const sl = ctx.selfLearningAccess;
        const Ctx = new T.SelfLearningContext();
        const sourceParam = params.get('source') || undefined;
        const mapMode = (m: string): string => {
          const v = (m || '').toLowerCase();
          if (v.includes('document')) return 'DOCUMENT';
          if (v.includes('conversation')) return 'CONVERSATION';
          if (v.includes('tag')) return 'TAG_MAINTENANCE';
          return 'ALL';
        };
        const backendSource = sourceParam ? mapMode(sourceParam) : undefined;

        if (method === 'POST' && pathname === '/api/learning/start') {
          const bodyMode = String(body.mode || '');
          await sl.startLearning(
            Object.assign(new T.StartLearningInput(), { learning_mode: bodyMode ? mapMode(bodyMode) : 'ALL' }),
            new T.StartLearningOutput(), Ctx,
          );
          sendJson(res, 200, { success: true });

        } else if (method === 'POST' && pathname === '/api/learning/stop') {
          // 支持显式 learning_mode（e2e 清理用 'ALL' 停掉全部定时器）；默认镜像 dev-server 语义
          const rawMode = String(body.learning_mode || body.mode || '');
          const backendMode = rawMode ? mapMode(rawMode) : 'ALL';
          await sl.stopLearning(
            Object.assign(new T.StopLearningInput(), { learning_mode: backendMode }),
            new T.StopLearningOutput(), Ctx,
          );
          sendJson(res, 200, { success: true });

        } else if (method === 'PUT' && pathname === '/api/learning/mode') {
          await sl.configSelfLearning(
            Object.assign(new T.ConfigSelfLearningInput(), { learning_mode: String(body.mode || 'from-conversation') }),
            new T.ConfigSelfLearningOutput(), Ctx,
          );
          sendJson(res, 200, { success: true });

        } else if (method === 'PUT' && pathname === '/api/learning/auto') {
          const backendMode = mapMode(String(body.mode || ''));
          const autoField = backendMode === 'DOCUMENT' ? 'document_auto_enable'
            : backendMode === 'CONVERSATION' ? 'conversation_auto_enable'
            : backendMode === 'TAG_MAINTENANCE' ? 'tag_auto_enable' : '';
          if (!autoField) { sendJson(res, 400, { error: '未知的学习模式' }); return; }
          await sl.configSelfLearning(
            Object.assign(new T.ConfigSelfLearningInput(), { [autoField]: !!body.enabled }),
            new T.ConfigSelfLearningOutput(), Ctx,
          );
          sendJson(res, 200, { success: true });

        } else if (method === 'PUT' && pathname === '/api/learning/random-factor') {
          const backendMode = mapMode(String(body.mode || ''));
          const field = backendMode === 'DOCUMENT' ? 'document_random_factor'
            : backendMode === 'CONVERSATION' ? 'conversation_random_factor'
            : backendMode === 'TAG_MAINTENANCE' ? 'tag_random_factor' : '';
          if (!field) { sendJson(res, 400, { error: '未知的学习模式' }); return; }
          const clamped = Math.max(0, Math.min(100, Number(body.value ?? 10)));
          await sl.configSelfLearning(
            Object.assign(new T.ConfigSelfLearningInput(), { [field]: clamped }),
            new T.ConfigSelfLearningOutput(), Ctx,
          );
          sendJson(res, 200, { success: true });

        } else if (method === 'PUT' && pathname === '/api/learning/driver-weights') {
          await sl.configSelfLearning(
            Object.assign(new T.ConfigSelfLearningInput(), { random_factor: Number(body.randomFactor ?? body.random_factor ?? 50) }),
            new T.ConfigSelfLearningOutput(), Ctx,
          );
          sendJson(res, 200, { success: true });

        } else if (method === 'GET' && pathname === '/api/learning/tasks') {
          const out = new T.ListLearningTasksOutput();
          await sl.soLearningTasks(new T.ListLearningTasksInput(), out, Ctx);
          sendJson(res, 200, { tasks: out.tasks || [] });

        } else if (method === 'GET' && pathname === '/api/learning/stats') {
          const out = new T.GetLearningStatsOutput();
          await sl.soLearningStats(
            Object.assign(new T.GetLearningStatsInput(), { source: backendSource }),
            out, Ctx,
          );
          const s = out.stats || {};
          sendJson(res, 200, {
            totalLearnCount: Number(s.total_learning_count) || 0,
            knowledgeCount: Number(s.total_knowledge_count) || 0,
            insightCount: Number(s.total_insight_count) || 0,
            weeklyLearnCount: Number(s.this_week_learning_count) || 0,
            trend: Array.isArray(s.learning_trend) ? s.learning_trend.map((t: any) => ({ date: t.date, count: Number(t.count) || 0 })) : [],
          });

        } else if (method === 'GET' && pathname === '/api/learning/progress-enhanced') {
          const progressOut = new T.GetLearningProgressOutput();
          await sl.soLearningProgress(new T.GetLearningProgressInput(), progressOut, Ctx);
          const cfgOut = new T.ConfigSelfLearningOutput();
          await sl.configSelfLearning(new T.ConfigSelfLearningInput(), cfgOut, Ctx);
          const cfg = cfgOut.config || {};
          sendJson(res, 200, {
            mode: String(cfg.learning_mode || 'from-conversation'),
            running: !!progressOut.running,
            randomFactor: Number(cfg.random_factor) || 0,
            queueSize: (progressOut.task_queue || []).length,
            completedToday: 0,
            modes: {
              'from-document': { auto: Number(cfg.document_auto_enable) !== 0, randomFactor: Number(cfg.document_random_factor) || 0 },
              'from-conversation': { auto: Number(cfg.conversation_auto_enable) !== 0, randomFactor: Number(cfg.conversation_random_factor) || 0 },
              'tag-graph': { auto: Number(cfg.tag_auto_enable) !== 0, randomFactor: Number(cfg.tag_random_factor) || 0 },
            },
          });

        } else if (method === 'GET' && pathname === '/api/learning/queue') {
          const progressOut = new T.GetLearningProgressOutput();
          await sl.soLearningProgress(
            Object.assign(new T.GetLearningProgressInput(), { source: backendSource }),
            progressOut, Ctx,
          );
          sendJson(res, 200, { tasks: progressOut.task_queue || [] });

        } else if (method === 'GET' && pathname === '/api/learning/knowledge') {
          const out = new T.GetLearningResultsOutput();
          await sl.soLearningResults(
            Object.assign(new T.GetLearningResultsInput(), { type: 'KNOWLEDGE', source: backendSource, page_current: 1, page_size: 20 }),
            out, Ctx,
          );
          sendJson(res, 200, { items: out.results || [] });

        } else if (method === 'GET' && pathname === '/api/learning/insights') {
          const out = new T.GetLearningResultsOutput();
          await sl.soLearningResults(
            Object.assign(new T.GetLearningResultsInput(), { type: 'INSIGHT', source: backendSource, page_current: 1, page_size: 20 }),
            out, Ctx,
          );
          sendJson(res, 200, { items: out.results || [] });

        } else {
          sendJson(res, 404, { error: `Route not found: ${method} ${pathname}` });
        }
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
