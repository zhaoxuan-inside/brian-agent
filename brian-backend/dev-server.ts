/**
 * Brian-Agent Development Server
 * Starts an HTTP server on port 8000 with real backends (no mocks).
 */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

import { IdGenerator } from './Base/shared/id/IdGenerator';
import { RelationDBAccess } from './Base/RelationDBProvider';
import { LLMAccess } from './Base/LLMProvider';
import { MCPAccess } from './Base/MCPProvider';
import { SoulAccess } from './Base/SoulProvider';
import { SkillAccess } from './Base/SkillProvider';
import { PromptsAccess, AddPromptInput, DelPromptInput, UpdatePromptInput } from './Base/PromptsProvider';
import { GraphDBAccess } from './Base/GraphDBProvider';
import { MQAccess } from './Base/MQProvider';
import { LogAccess } from './Base/LogProvider';
import { VectorDBAccess } from './Base/VectorDBProvider';
import { CDTAccess } from './Base/CDTProvider';
import { BookmarkAccess } from './Base/BookmarkProvider';
import { InfoCoreAccess } from './Core/InfoCoreProvider';
import { LLMCoreAccess } from './Core/LLMCoreProvider';
import { MCPCoreAccess } from './Core/MCPCoreProvider';
import { SkillCoreAccess } from './Core/SkillCoreProvider';
import { SoulCoreAccess } from './Core/SoulCoreProvider';
import { MQCoreAccess } from './Core/MQCoreProvider';
import { CDTCoreAccess } from './Core/CDTCoreProvider';
import { AgentLibraryAccess } from './Agent/AgentLibrary';
import { AgentStrategyAccess } from './Agent/AgentStrategy';
import { AgentBuilderAccess } from './Agent/AgentBuilder';
import {
  AgentBuilderContext,
  BuildSystemAgentInput, BuildSystemAgentOutput,
} from './Agent/AgentBuilder';
import { AgentExecutionAccess } from './Agent/AgentExecution';
import { AgentContextAccess } from './Agent/AgentContext';
import { PlannerAgentAccess } from './Agent/PlannerAgent';
import { WriterAgentAccess } from './Agent/WriterAgent';
import { EvolutorAgentAccess } from './Agent/EvolutorAgent';
import { OrchestrationEntryAccess } from './Orchestration/OrchestrationEntry';
import { OrchestrationStrategyAccess } from './Orchestration/OrchestrationStrategy';
import { OrchestrationExecutionAccess } from './Orchestration/OrchestrationExecution';
import { OrchestrationVisualizationAccess } from './Orchestration/OrchestrationVisualization';
import { JSONNodeAccess } from './Orchestration/JSONNode';

// Application layer
import { ChatAccess } from './Application/Chat/access/ChatAccess';
import { ChatSchemaInitializer } from './Application/Chat/infrastructure/ChatSchemaInitializer';
import { ConfigAccess } from './Application/Config/access/ConfigAccess';
import { SelfLearningAccess } from './Application/SelfLearning/access/SelfLearningAccess';
import { UserProfileAccess } from './Application/UserProfile/access/UserProfileAccess';
import { VisualizationAccess } from './Application/Visualization/access/VisualizationAccess';

// Config types
import {
  ConfigContext,
  GetConfigDetailInput, GetConfigDetailOutput,
  GetConfigItemInput, GetConfigItemOutput,
  UpdateConfigInput, UpdateConfigOutput,
  CreateConfigItemInput, CreateConfigItemOutput,
  DeleteConfigItemInput, DeleteConfigItemOutput,
} from './Application/Config/domain/types';

// Provider value types (need runtime instantiation)
import {
  LLMContext, ListLLMInput, ListLLMOutput, AddLLMProviderInput, AddLLMProviderOutput,
  UpdateLLMProviderInput, UpdateLLMProviderOutput, DelLLMProviderInput, DelLLMProviderOutput,
  SoLLMProviderInput, SoLLMProviderOutput, TestLLMProviderInput, TestLLMProviderOutput,
  GetLLMInput, GetLLMOutput, DelLLMInput, DelLLMOutput,
  UpdateLLMInput, UpdateLLMOutput, AddLLMInput, AddLLMOutput,
} from './Base/LLMProvider';
import {
  SoulContext, SoSoulInput, SoSoulOutput, AddSoulInput, AddSoulOutput,
  UpdateSoulInput, UpdateSoulOutput, DelSoulInput, DelSoulOutput, GetSoulInput, GetSoulOutput,
} from './Base/SoulProvider';
import {
  SkillContext, SoSkillInput, SoSkillOutput, AddSkillInput, AddSkillOutput,
  UpdateSkillInput, UpdateSkillOutput, DelSkillInput, DelSkillOutput, GetSkillInput, GetSkillOutput,
  ExecSkillInput, ExecSkillOutput,
} from './Base/SkillProvider';
import {
  McpContext, ListMcpInput, ListMcpOutput,
  SoMcpProviderInput, SoMcpProviderOutput,
  InstallMcpInput, InstallMcpOutput,
  StartMcpInput, StartMcpOutput,
  StopMcpInput, StopMcpOutput,
  UninstallMcpInput, UninstallMcpOutput,
} from './Base/MCPProvider';
import {
  AgentLibraryContext, GetAgentInput, GetAgentOutput,
} from './Agent/AgentLibrary';

import {
  ChatContext,
  SubmitWorkInput, SubmitWorkOutput,
  CreateSessionInput, CreateSessionOutput,
  DeleteSessionInput, DeleteSessionOutput,
  SearchSessionInput, SearchSessionOutput,
  GetChatHistoryInput, GetChatHistoryOutput,
  SearchMessageInput, SearchMessageOutput,
  CancelWorkInput, CancelWorkOutput,
} from './Application/Chat/domain/types';

import { AopProxy } from './Base/shared/aop/AopProxy';

let _seq = 0;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function createLogger(): any {
  return { debug: (..._a: any[]) => {}, info: (..._a: any[]) => {}, warn: (..._a: any[]) => {}, error: (..._a: any[]) => {} };
}

function addColIfMissing(relationDb: any, table: string, column: string, type: string): void {
  try { relationDb.executeRaw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`); } catch { /* exists */ }
}

async function buildContext() {
  const logger = createLogger();

  // ---- Base Providers ----
  const relationDb = new RelationDBAccess({ dbPath: path.join(DATA_DIR, 'brian.db'), wal: true, autoCreateConfigTable: true });
  await relationDb.initialize();

  const llmAccess = new LLMAccess(relationDb, logger);
  await llmAccess.initialize();

  const mcpAccess = new MCPAccess(relationDb, logger);
  await mcpAccess.initialize();

  const soulAccess = new SoulAccess(relationDb, logger);
  await soulAccess.initialize();

  const skillAccess = new SkillAccess(relationDb, logger);
  await skillAccess.initialize();

  const promptsAccess = new PromptsAccess(relationDb, logger);
  await promptsAccess.initialize();

  const graphDBAccess = new GraphDBAccess(relationDb, { dbPath: path.join(DATA_DIR, 'graph.db') }, logger);
  await graphDBAccess.initialize();

  const mqAccess = new MQAccess(relationDb, logger);
  await mqAccess.initialize();

  const logAccess = new LogAccess(relationDb, logger);
  await logAccess.initialize();

  // VectorDB with LanceDB backend
  const vectorDBAccess = new VectorDBAccess(relationDb, {
    lancePath: path.join(DATA_DIR, 'vectordb'),
    dimension: 1536,
    metric: 'cosine',
    logger,
  });
  await vectorDBAccess.initialize();

  addColIfMissing(relationDb, 'skill_usage', 'agent_skill_id', 'TEXT');
  addColIfMissing(relationDb, 'skill_usage', 'timestamp', 'INTEGER');
  addColIfMissing(relationDb, 'soul_usage', 'soul_usage_type', 'TEXT');

  // CDT
  const cdtAccess = new CDTAccess(relationDb, DATA_DIR, logger);
  await cdtAccess.initialize();

  // Bookmark
  const bookmarkAccess = new BookmarkAccess(relationDb, logger);

  // ---- Core Providers ----
  const infoCore = new InfoCoreAccess(relationDb, llmAccess, promptsAccess, vectorDBAccess, graphDBAccess, logger);
  await infoCore.initialize();

  const llmCore = new LLMCoreAccess(relationDb, llmAccess, promptsAccess, logger);
  await llmCore.initialize();

  const mcpCore = new MCPCoreAccess(relationDb, mcpAccess, llmAccess, promptsAccess, logger);
  try { await (mcpCore as any).initialize?.(); } catch { /* ok */ }

  const skillCore = new SkillCoreAccess(relationDb, skillAccess, llmAccess, promptsAccess, logger);
  try { await (skillCore as any).initialize?.(); } catch { /* ok */ }

  const soulCore = new SoulCoreAccess(relationDb, soulAccess, llmAccess, promptsAccess, logger);
  await soulCore.initialize();

  const mqCore = new MQCoreAccess(mqAccess, logger);

  const cdtCore = new CDTCoreAccess(relationDb, cdtAccess, logger);

  // ---- Agent Layer ----
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

  // ---- Pre-build system agents (ensure they appear in agent list on first page load) ----
  try {
    for (const agentType of ['PLANNER', 'WRITER', 'EVOLUTOR'] as const) {
      await agentBuilder.buildSystemAgent(
        Object.assign(new BuildSystemAgentInput(), { agent_type: agentType }),
        new AgentBuilderContext(),
        new BuildSystemAgentOutput(),
      );
    }
  } catch (e) {
    logger.warn('preBuildSystemAgents', 'failed to pre-build some system agents', String(e));
  }

  // ---- Orchestration ----
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

  // ---- Application Layer ----
  new ChatSchemaInitializer(relationDb).init();
  const chatAccess = new ChatAccess(relationDb, infoCore, writerAgent, evolutorAgent, orchestrationEntry, logger);

  const selfLearningAccess = new SelfLearningAccess(relationDb, graphDBAccess, mqAccess, infoCore, mqCore, llmCore, evolutorAgent, writerAgent, orchestrationEntry, logger);
  const userProfileAccess = new UserProfileAccess(relationDb, llmAccess, promptsAccess, infoCore, llmCore, writerAgent, evolutorAgent, logger);
  const visualizationAccess = new VisualizationAccess(relationDb, llmAccess, soulAccess, skillAccess, graphDBAccess, infoCore, agentLibrary, agentBuilder, agentExecution, orchestrationExecution, orchestrationVisualization, jsonNode, logger);

  // Config
  const configAccess = new ConfigAccess(
    relationDb,
    llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess,
    llmCore, infoCore, mcpCore, skillCore, soulCore,
    writerAgent, evolutorAgent, agentLibrary, agentBuilder,
    agentExecution, agentStrategy, agentContext,
    orchestrationEntry, orchestrationStrategy, orchestrationExecution,
    orchestrationVisualization, jsonNode,
    chatAccess, selfLearningAccess, userProfileAccess, visualizationAccess,
    logger,
  );

  return {
    relationDb, llmAccess, mcpAccess, soulAccess, skillAccess, promptsAccess,
    graphDBAccess, mqAccess, logAccess, vectorDBAccess,
    cdtAccess, bookmarkAccess,
    infoCore, llmCore, mcpCore, skillCore, soulCore, mqCore,
    cdtCore,
    agentLibrary, agentStrategy, agentContext, agentBuilder,
    agentExecution, plannerAgent, writerAgent, evolutorAgent,
    orchestrationExecution, orchestrationVisualization, jsonNode,
    orchestrationStrategy, orchestrationEntry,
    chatAccess, configAccess, selfLearningAccess, userProfileAccess, visualizationAccess,
  };
}

function jsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function sendJson(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function createServer(ctx: Awaited<ReturnType<typeof buildContext>>): http.Server {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { sendJson(res, 204, ''); return; }

    try {
      const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const pathname = u.pathname;
      const method = req.method || 'GET';
      const params = u.searchParams;
      const body = (method === 'POST' || method === 'PUT' || method === 'DELETE') ? await jsonBody(req) : {};

      // ===== Config Routes =====
      if (method === 'GET' && pathname === '/api/config') {
        const input: GetConfigDetailInput = Object.assign(new GetConfigDetailInput(), {});
        const output = new GetConfigDetailOutput();
        const context = new ConfigContext();
        await ctx.configAccess.getConfigDetail(input, context, output);
        sendJson(res, 200, { config: { layers: output.layers } });

      } else if (method === 'PUT' && pathname === '/api/config') {
        const input = Object.assign(new UpdateConfigInput(), body);
        const output = new UpdateConfigOutput();
        const context = new ConfigContext();
        await ctx.configAccess.updateConfig(input, context, output);
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname.startsWith('/api/config/item/')) {
        const configKey = pathname.split('/api/config/item/')[1];
        const input = Object.assign(new GetConfigItemInput(), { config_key: configKey });
        const output = new GetConfigItemOutput();
        const context = new ConfigContext();
        await ctx.configAccess.getConfigItem(input, context, output);
        sendJson(res, 200, { config_item: output.config_item });

      } else if (method === 'POST' && pathname === '/api/config/item') {
        const input = Object.assign(new CreateConfigItemInput(), body);
        const output = new CreateConfigItemOutput();
        const context = new ConfigContext();
        await ctx.configAccess.createConfigItem(input, context, output);
        sendJson(res, 201, { config_item: output.config_item });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/item/')) {
        const configKey = pathname.split('/api/config/item/')[1];
        const input = Object.assign(new DeleteConfigItemInput(), { config_key: configKey });
        const output = new DeleteConfigItemOutput();
        const context = new ConfigContext();
        await ctx.configAccess.deleteConfigItem(input, context, output);
        sendJson(res, 200, { success: true });

      // ---- Model (LLM) ----
      } else if (method === 'GET' && pathname === '/api/config/model') {
        const rows = ctx.relationDb.queryRaw<{ id: string; llm_provider_id: string; llm_title: string; llm_brief: string | null; llm_type: string; enable: number; is_default: number; model_usage: string | null; max_tokens: number | null }>(
          'SELECT e."id", e."llm_provider_id", e."llm_title", e."llm_brief", e."llm_type", e."enable", COALESCE(e."is_default", 0) as "is_default", e."model_usage", COALESCE(e."max_tokens", 0) as "max_tokens" FROM "llm_available" e ORDER BY e."llm_title" ASC',
          [],
        );
        const models = (rows || []).map(r => ({
          id: r.id,
          modelName: r.llm_title,
          providerId: r.llm_provider_id,
          providerName: r.llm_provider_id,
          llm_type: r.llm_type || 'text',
          maxTokens: 4096,
          supportsVision: false,
          supportsTools: true,
          isDefault: !!r.is_default,
          status: r.enable ? 'active' : 'inactive',
          model_usage: r.model_usage || '',
          maxTokens: r.max_tokens || 0,
        }));
        sendJson(res, 200, models);

      } else if (method === 'GET' && pathname.startsWith('/api/config/model/') && !pathname.includes('/test') && !pathname.includes('/default')) {
        const title = pathname.split('/api/config/model/')[1].split('/')[0];
        const row = ctx.relationDb.queryRaw<{ id: string; llm_title: string; llm_provider_id: string; enable: number }>(
          'SELECT "id", "llm_title", "llm_provider_id", "enable" FROM "llm_available" WHERE "llm_title" = ?', [title],
        )[0];
        sendJson(res, 200, row ? { id: row.id, modelName: row.llm_title, providerId: row.llm_provider_id, status: row.enable ? 'active' : 'inactive' } : { id: title, name: 'unknown' });

      } else if (method === 'POST' && /\/api\/config\/model\/[^/]+\/test$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        const modelInput = Object.assign(new GetLLMInput(), { id });
        const modelOutput = new GetLLMOutput();
        const modelCtx = new LLMContext();
        await ctx.configAccess.getLLM(modelInput, modelCtx, modelOutput);
        const model = modelOutput.llm as Record<string, unknown> | null;
        const providerId = (model?.llm_provider_id as string) || '';
        if (providerId) {
          const testInput = Object.assign(new TestLLMProviderInput(), { id: providerId });
          const testOutput = new TestLLMProviderOutput();
          const testCtx = new LLMContext();
          await ctx.configAccess.testLLMProvider(testInput, testCtx, testOutput);
          sendJson(res, 200, {
            success: testOutput.connected !== false,
            latency: testOutput.response_time_ms,
            status_code: testOutput.status_code,
            message: testOutput.connected !== false ? 'Connected' : (testOutput.error || 'Connection failed'),
          });
        } else {
          sendJson(res, 200, { success: false, latency: 0, message: 'Model has no provider' });
        }

      } else if (method === 'POST' && /\/api\/config\/model\/[^/]+\/default$/.test(pathname)) {
        const title = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        ctx.relationDb.executeRaw('UPDATE "llm_available" SET "is_default" = 0', []);
        ctx.relationDb.executeRaw('UPDATE "llm_available" SET "is_default" = 1 WHERE "llm_title" = ?', [title]);
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && pathname.startsWith('/api/config/model/') && !/\/default$/.test(pathname)) {
        const title = pathname.split('/api/config/model/')[1];
        const data = (body as Record<string, unknown>).data || body;
        try { ctx.relationDb.executeRaw('UPDATE "llm_available" SET "llm_brief" = ?, "enable" = ?, "model_usage" = ?, "max_tokens" = ? WHERE "llm_title" = ?',
          [data.llm_brief || '', (data.enable ?? data.enabled) ? 1 : 0, (data.model_usage || ''), (data.maxTokens || 0), title]); } catch {}
        sendJson(res, 200, { success: true, id: title });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/model/')) {
        const title = pathname.split('/api/config/model/')[1];
        try { ctx.relationDb.executeRaw('DELETE FROM "llm_available" WHERE "llm_title" = ?', [title]); } catch {}
        sendJson(res, 200, { success: true });

      // ---- Provider ----
      } else if (method === 'GET' && pathname === '/api/config/provider') {
        const input = Object.assign(new SoLLMProviderInput(), {});
        const output = new SoLLMProviderOutput();
        const context = new LLMContext();
        await ctx.configAccess.soLLMProvider(input, context, output);
        sendJson(res, 200, output.list || []);

      } else if (method === 'POST' && pathname === '/api/config/provider') {
        const input = Object.assign(new AddLLMProviderInput(), body);
        const output = new AddLLMProviderOutput();
        const context = new LLMContext();
        await ctx.configAccess.addLLMProvider(input, context, output);
        sendJson(res, 200, { id: output.provider_id, name: body.llm_provider_title || 'new-provider' });

      } else if (method === 'PUT' && pathname.startsWith('/api/config/provider/')) {
        const id = pathname.split('/api/config/provider/')[1];
        const input = Object.assign(new UpdateLLMProviderInput(), { ...body, provider_id: id });
        const output = new UpdateLLMProviderOutput();
        const context = new LLMContext();
        await ctx.configAccess.updateLLMProvider(input, context, output);
        sendJson(res, 200, { success: true });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/provider/')) {
        const id = pathname.split('/api/config/provider/')[1];
        const input = Object.assign(new DelLLMProviderInput(), { provider_ids: [id] });
        const output = new DelLLMProviderOutput();
        const context = new LLMContext();
        await ctx.configAccess.delLLMProvider(input, context, output);
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && /\/api\/config\/provider\/[^/]+\/fetch-models$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        const fetchInput = Object.assign(new ListLLMInput(), { llm_provider_id: id });
        const fetchOutput = new ListLLMOutput();
        const fetchCtx = new LLMContext();
        const ok = await ctx.configAccess.listLLM(fetchInput, fetchCtx, fetchOutput);
        const models = (fetchOutput.list || []).map((m: Record<string, unknown>) => ({
          id: m.llm_title || m.id,
          name: m.llm_title || m.name || '',
          brief: m.llm_brief || m.brief || '',
          features: (m as any).llm_param ? JSON.parse((m as any).llm_param) : {},
        }));
        sendJson(res, ok ? 200 : 502, {
          models,
          total: models.length,
          cached: fetchOutput.cached,
          error: fetchOutput.error,
          error_code: fetchOutput.error_code,
        });

      } else if (method === 'GET' && /\/api\/config\/provider\/[^/]+\/models$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        const rows = ctx.relationDb.queryRaw<{ llm_title: string; llm_brief: string | null; features: string | null }>(
          'SELECT "llm_title", "llm_brief", "features" FROM "llm_cache" WHERE "llm_provider_id" = ? ORDER BY "llm_title" ASC', [id],
        );
        const enabledRows = ctx.relationDb.queryRaw<{ llm_title: string }>(
          'SELECT "llm_title" FROM "llm_available" WHERE "llm_provider_id" = ?', [id],
        );
        const enabledSet = new Set((enabledRows || []).map(r => r.llm_title));
        const models = (rows || []).map(r => ({
          id: r.llm_title,
          name: r.llm_title,
          brief: r.llm_brief || '',
          features: r.llm_param ? (() => { try { return JSON.parse(r.llm_param); } catch { return {}; } })() : {},
          enabled: enabledSet.has(r.llm_title),
        }));
        sendJson(res, 200, { models });

      } else if (method === 'POST' && /\/api\/config\/provider\/[^/]+\/models\/add$/.test(pathname)) {
        const providerId = pathname.split('/api/config/provider/')[1]?.split('/')[0] || '';
        const modelIds = (body as Record<string, unknown>).modelIds as string[] || [];
        let added = 0;
        for (const title of modelIds) {
          if (!title) continue;
          try {
            const cachedRow = ctx.relationDb.queryRaw<{ max_tokens: number | null }>(
              'SELECT "max_tokens" FROM "llm_cache" WHERE "llm_provider_id" = ? AND "llm_title" = ?', [providerId, title],
            )[0];
            const maxTokens = cachedRow?.max_tokens || 0;
            ctx.relationDb.executeRaw(
              'INSERT OR IGNORE INTO "llm_available" ("id", "created", "updated", "llm_provider_id", "llm_title", "llm_type", "enable", "max_tokens") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [IdGenerator.generate(), IdGenerator.now(), IdGenerator.now(), providerId, title, 'text', 0, maxTokens],
            );
            if (maxTokens > 0) {
              try { ctx.relationDb.executeRaw('UPDATE "llm_available" SET "max_tokens" = ? WHERE "llm_provider_id" = ? AND "llm_title" = ?', [maxTokens, providerId, title]); } catch {}
            }
            added++;
          } catch { /* skip */ }
        }
        sendJson(res, 200, { added });

      } else if (method === 'POST' && /\/api\/config\/provider\/[^/]+\/chat-test$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        const row = await ctx.relationDb.selectOne('llm_provider', [{ field: 'id', operator: 'EQ' as any, value: id }]) as Record<string, unknown> | null;
        if (!row) { sendJson(res, 404, { error: 'Provider not found' }); return; }
        const baseUrl = String(row.llm_provider_url || '');
        const chatPath = String(row.chat_path || 'chat/completions');
        const apiKey = String(row.api_key || '');
        const model = (body as Record<string, unknown>).model as string || 'gpt-3.5-turbo';
        const url = baseUrl.replace(/\/+$/, '') + '/' + chatPath.replace(/^\/+/, '');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);
          const resp = await fetch(url, {
            method: 'POST', headers,
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          const text = await resp.text();
          sendJson(res, resp.ok ? 200 : 502, {
            ok: resp.ok,
            status: resp.status,
            url,
            model,
            response: text.length > 500 ? text.substring(0, 500) : text,
          });
        } catch (e: unknown) {
          sendJson(res, 502, { ok: false, url, model, error: e instanceof Error ? e.message : String(e) });
        }

      } else if (method === 'POST' && /\/api\/config\/provider\/[^/]+\/test$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        const testInput = Object.assign(new TestLLMProviderInput(), { id });
        const testOutput = new TestLLMProviderOutput();
        const testCtx = new LLMContext();
        await ctx.configAccess.testLLMProvider(testInput, testCtx, testOutput);
        sendJson(res, 200, {
          success: testOutput.connected !== false,
          latency: testOutput.response_time_ms,
          status_code: testOutput.status_code,
          message: testOutput.connected !== false ? 'Connected' : (testOutput.error || 'Connection failed'),
        });

      // ---- Prompts ----
      } else if (method === 'GET' && pathname.startsWith('/api/prompts/')) {
        const id = pathname.split('/api/prompts/')[1];
        const row = ctx.relationDb.queryRaw<{ id: string; prompt_template_title: string; prompt_template_brief: string | null; prompt_template: string; enable: number }>(
          'SELECT "id", "prompt_template_title", "prompt_template_brief", "prompt_template", "enable" FROM "prompt_template" WHERE "id" = ?',
          [id],
        )[0];
        if (row) {
          sendJson(res, 200, { id: row.id, title: row.prompt_template_title, brief: row.prompt_template_brief || '', template: row.prompt_template, enabled: !!row.enable });
        } else {
          sendJson(res, 404, { error: 'Prompt template not found' });
        }

      } else if (method === 'GET' && pathname === '/api/prompts') {
        const rows = ctx.relationDb.queryRaw<{ id: string; prompt_template_title: string; prompt_template_brief: string | null; enable: number }>(
          'SELECT "id", "prompt_template_title", "prompt_template_brief", "enable" FROM "prompt_template" ORDER BY "prompt_template_title" ASC',
          [],
        );
        const prompts = (rows || []).map(r => ({
          id: r.id,
          title: r.prompt_template_title,
          brief: r.prompt_template_brief || '',
          enabled: !!r.enable,
        }));
        sendJson(res, 200, { prompts });

      } else if (method === 'POST' && pathname === '/api/prompts') {
        const input = Object.assign(new AddPromptInput(), {
          data: {
            prompt_template_title: body.title || '',
            prompt_template_brief: body.brief || undefined,
            prompt_template: body.template || '',
            enable: body.enabled !== undefined ? !!body.enabled : true,
          },
        });
        const output: any = { id: '' };
        await ctx.promptsAccess.addPrompt(input, {} as any, output as any);
        sendJson(res, 201, { id: output.id });

      } else if (method === 'PUT' && pathname.startsWith('/api/prompts/')) {
        const id = pathname.split('/api/prompts/')[1];
        const input = Object.assign(new UpdatePromptInput(), {
          id,
          data: {
            prompt_template_title: body.title,
            prompt_template_brief: body.brief,
            prompt_template: body.template,
            enable: body.enabled !== undefined ? !!body.enabled : undefined,
          },
        });
        const output: any = { affected_rows: 0 };
        await ctx.promptsAccess.updatePrompt(input, {} as any, output as any);
        sendJson(res, 200, { success: true });

      } else if (method === 'DELETE' && pathname.startsWith('/api/prompts/')) {
        const id = pathname.split('/api/prompts/')[1];
        const input = Object.assign(new DelPromptInput(), { ids: [id] });
        const output: any = { affected_rows: 0 };
        await ctx.promptsAccess.delPrompt(input, {} as any, output as any);
        sendJson(res, 200, { success: true });

      // ---- Soul ----
      } else if (method === 'GET' && pathname === '/api/config/soul') {
        const input = Object.assign(new SoSoulInput(), {});
        const output = new SoSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.soSoul(input, context, output);
        sendJson(res, 200, output.list || []);

      } else if (method === 'POST' && pathname === '/api/config/soul') {
        const input = Object.assign(new AddSoulInput(), { data: body });
        const output = new AddSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.addSoul(input, context, output);
        sendJson(res, 200, { id: output.id, soul_brief: body.soul_brief || 'new-soul' });

      } else if (method === 'PUT' && pathname.startsWith('/api/config/soul/')) {
        const id = pathname.split('/api/config/soul/')[1];
        const input = Object.assign(new UpdateSoulInput(), { ...body, soul_id: id });
        const output = new UpdateSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.updateSoul(input, context, output);
        sendJson(res, 200, { success: true });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/soul/')) {
        const id = pathname.split('/api/config/soul/')[1];
        const input = Object.assign(new DelSoulInput(), { soul_ids: [id] });
        const output = new DelSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.delSoul(input, context, output);
        sendJson(res, 200, { success: true });

      // ---- MCP (Config section) ----
      } else if (method === 'GET' && pathname === '/api/config/mcp') {
        const provInput = Object.assign(new SoMcpProviderInput(), {});
        const provOutput = new SoMcpProviderOutput();
        const provContext = new McpContext();
        await ctx.configAccess.soMcpProvider(provInput, provContext, provOutput);
        const providers = provOutput.list || [];
        if (providers.length === 0) {
          sendJson(res, 200, []);
        } else {
          const input = Object.assign(new ListMcpInput(), { mcp_provider_id: providers[0].id });
          const output = new ListMcpOutput();
          const context = new McpContext();
          await ctx.configAccess.listMcp(input, context, output);
          sendJson(res, 200, output.list || []);
        }

      // ---- MCP Market: list built-in markets ----
      } else if (method === 'GET' && pathname === '/api/config/mcp/market') {
        sendJson(res, 200, [
          { id: 'aliyun_bailian', mcp_provider_title: '阿里云百炼', mcp_provider_url: 'https://dashscope.aliyuncs.com', mcp_provider_brief: '阿里云 AI 平台的 MCP 服务市场', enable: true },
          { id: 'modelscope', mcp_provider_title: 'ModelScope', mcp_provider_url: 'https://modelscope.cn', mcp_provider_brief: '魔搭社区 MCP 广场，社区贡献的优质 MCP 服务器', enable: true },
          { id: 'smithery', mcp_provider_title: 'Smithery', mcp_provider_url: 'https://api.smithery.ai', mcp_provider_brief: '全球 MCP 注册中心，自动 OAuth，支持 HTTP/SSE 连接', enable: true },
          { id: 'github', mcp_provider_title: 'GitHub', mcp_provider_url: 'https://registry.npmjs.org', mcp_provider_brief: 'npm 生态的 MCP 服务器，通过 npx/uvx stdio 运行', enable: true },
        ]);

      // ---- MCP Market: test connectivity ----
      } else if (method === 'POST' && /\/api\/config\/mcp\/provider\/[^/]+\/test$/.test(pathname)) {
        const provId = pathname.split('/api/config/mcp/provider/')[1].split('/test')[0];
        let ok = false;
        let statusMsg = '';
        let latency = 0;
        try {
          const start = Date.now();
          if (provId === 'github') {
            const r = await fetch('https://registry.npmjs.org/-/v1/search?text=keywords:mcp&size=1');
            latency = Date.now() - start;
            ok = r.ok;
            statusMsg = ok ? 'npm registry 可达' : `HTTP ${r.status}`;
          } else if (provId === 'smithery') {
            const r = await fetch('https://api.smithery.ai/servers?pageSize=1');
            latency = Date.now() - start;
            ok = r.ok;
            statusMsg = ok ? 'Smithery API 可达' : `HTTP ${r.status}`;
          } else if (provId === 'aliyun_bailian') {
            const r = await fetch('https://dashscope.aliyuncs.com', { signal: AbortSignal.timeout(5000) });
            latency = Date.now() - start;
            ok = true;
            statusMsg = 'DashScope API 可达';
          } else if (provId === 'modelscope') {
            const r = await fetch('https://modelscope.cn', { signal: AbortSignal.timeout(5000) });
            latency = Date.now() - start;
            ok = r.ok;
            statusMsg = ok ? 'ModelScope 可达' : `HTTP ${r.status}`;
          } else {
            ok = false; statusMsg = `未知的市场 ID: ${provId}`;
          }
        } catch (e: unknown) {
          ok = false;
          statusMsg = (e as Error).message || '网络不可达';
        }
        sendJson(res, 200, { success: ok, connected: ok, message: statusMsg, latency });

      // ---- MCP Market: list tools from provider ----
      } else if (method === 'POST' && /\/api\/config\/mcp\/provider\/[^/]+\/list$/.test(pathname)) {
        const provId = pathname.split('/api/config/mcp/provider/')[1].split('/list')[0];
        const q = (body as Record<string, unknown>).keyword as string || '';
        const page = Number((body as Record<string, unknown>).page) || 1;
        const pageSize = Number((body as Record<string, unknown>).pageSize) || 50;
        let tools: { id: string; title: string; brief: string; install_cmd?: string; installed?: boolean }[] = [];

        try {
          if (provId === 'github') {
            const searchTerm = q ? `keywords:mcp+${encodeURIComponent(q)}` : 'keywords:mcp+server';
            const npmRes = await fetch(`https://registry.npmjs.org/-/v1/search?text=${searchTerm}&size=${pageSize}&from=${(page - 1) * pageSize}`);
            if (!npmRes.ok) throw new Error(`npm 请求失败 HTTP ${npmRes.status}`);
            const data = await npmRes.json() as { objects: Array<{ package: { name: string; description: string; version: string; links?: { npm?: string } } }>; total: number };
            tools = (data.objects || []).map(obj => ({
              id: obj.package.name,
              title: obj.package.name,
              brief: obj.package.description || '',
              install_cmd: `npx ${obj.package.name}`,
              installed: false,
            }));
            // Check which are already installed
            const instRows = ctx.relationDb.queryRaw<{ mcp_title: string }>(
              'SELECT "mcp_title" FROM "mcp_install"', [],
            );
            const instNames = new Set((instRows || []).map(r => r.mcp_title));
            for (const t of tools) { if (instNames.has(t.title)) t.installed = true; }
            sendJson(res, 200, { list: tools, total: data.total });

          } else if (provId === 'smithery') {
            const params = new URLSearchParams();
            params.set('pageSize', String(Math.min(pageSize, 100)));
            params.set('page', String(page));
            if (q) params.set('q', q);
            const smRes = await fetch(`https://api.smithery.ai/servers?${params.toString()}`);
            if (!smRes.ok) throw new Error(`Smithery 请求失败 HTTP ${smRes.status}`);
            const data = await smRes.json() as { servers: Array<{ id: string; qualifiedName: string; displayName: string; description: string; remote?: boolean }>; pagination: { totalCount: number } };
            tools = (data.servers || []).map(s => ({
              id: s.qualifiedName || s.id,
              title: s.displayName || s.qualifiedName || s.id,
              brief: s.description || '',
              installed: false,
            }));
            const instRows = ctx.relationDb.queryRaw<{ mcp_title: string }>(
              'SELECT "mcp_title" FROM "mcp_install"', [],
            );
            const instNames = new Set((instRows || []).map(r => r.mcp_title));
            for (const t of tools) { if (instNames.has(t.title)) t.installed = true; }
            sendJson(res, 200, { list: tools, total: data.pagination?.totalCount || tools.length });

          } else if (provId === 'aliyun_bailian') {
            sendJson(res, 200, { list: [], total: 0, message: '阿里云百炼 MCP 市场需配置 DashScope API Key 后接入。请前往 aliyun_bailian_api_key 配置项填入密钥。' });
          } else if (provId === 'modelscope') {
            sendJson(res, 200, { list: [], total: 0, message: 'ModelScope MCP 市场需配置 API Key 后接入。请前往 modelscope_api_key 配置项填入密钥。' });
          } else {
            sendJson(res, 200, { list: [], total: 0, message: `未知的市场 ID: ${provId}` });
          }
        } catch (e: unknown) {
          sendJson(res, 200, { list: [], total: 0, message: (e as Error).message || '获取工具列表失败' });
        }

      // ---- MCP Config: install / start / stop / uninstall ----
      } else if (method === 'POST' && /\/api\/config\/mcp\/install$/.test(pathname)) {
        const provId = (body as Record<string, unknown>).mcp_provider_id as string || '';
        const toolId = (body as Record<string, unknown>).mcp_id as string || (body as Record<string, unknown>).tool_id as string || '';
        if (!provId || !toolId) { sendJson(res, 400, { error: '缺少 mcp_provider_id 或 mcp_id' }); return; }
        try {
          // GitHub: fetch npm package info and install directly
          if (provId === 'github') {
            const pkgRes = await fetch(`https://registry.npmjs.org/${toolId}/latest`);
            if (!pkgRes.ok) { sendJson(res, 400, { error: `npm 包 ${toolId} 不存在` }); return; }
            const pkg = await pkgRes.json() as { name: string; description: string; bin?: Record<string, string>; version?: string };
            const installCmd = `npm install -g ${toolId}`;
            const startCmd = `npx ${toolId}`;
            const stopCmd = `pkill -f ${toolId}`;
            const uninstallCmd = `npm uninstall -g ${toolId}`;
            const { execSync } = await import('node:child_process');
            try { execSync(installCmd, { timeout: 120000, stdio: 'pipe' }); } catch { /* npm install may fail but tool may already be usable */ }
            const id = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const now = Date.now();
            ctx.relationDb.executeRaw(
              `INSERT OR REPLACE INTO "mcp_install" ("id","created","updated","mcp_provider_id","mcp_title","mcp_brief","mcp_install_cmd","mcp_start_cmd","mcp_stop_cmd","mcp_uninstall_cmd","enable") VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [id, now, now, provId, toolId, pkg.description || '', installCmd, startCmd, stopCmd, uninstallCmd, 1],
            );
            sendJson(res, 200, { success: true, id });

          // Smithery: record as HTTP connection
          } else if (provId === 'smithery') {
            const id = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const now = Date.now();
            ctx.relationDb.executeRaw(
              `INSERT OR REPLACE INTO "mcp_install" ("id","created","updated","mcp_provider_id","mcp_title","mcp_brief","mcp_install_cmd","mcp_start_cmd","mcp_stop_cmd","mcp_uninstall_cmd","enable") VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [id, now, now, provId, toolId, 'Smithery MCP server', 'smithery connect', 'smithery start', 'smithery stop', 'smithery disconnect', 1],
            );
            sendJson(res, 200, { success: true, id });

          } else {
            // Other markets: delegate to existing MCPAccess via ConfigAccess
            const installIn = Object.assign(new InstallMcpInput(), { mcp_provider_id: provId, mcp_id: toolId });
            const installOut = new InstallMcpOutput();
            await ctx.configAccess.installMcp(installIn, new McpContext(), installOut);
            sendJson(res, 200, { success: true, id: installOut.id });
          }
        } catch (e: unknown) {
          sendJson(res, 500, { error: (e as Error).message || '安装失败' });
        }

      } else if (method === 'POST' && /\/api\/config\/mcp\/start$/.test(pathname)) {
        const startIn = Object.assign(new StartMcpInput(), { id: (body as Record<string, unknown>).id || '' });
        await ctx.configAccess.startMcp(startIn, new McpContext(), new StartMcpOutput());
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && /\/api\/config\/mcp\/stop$/.test(pathname)) {
        const stopIn = Object.assign(new StopMcpInput(), { id: (body as Record<string, unknown>).id || '' });
        await ctx.configAccess.stopMcp(stopIn, new McpContext(), new StopMcpOutput());
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && /\/api\/config\/mcp\/uninstall$/.test(pathname)) {
        const unInput = Object.assign(new UninstallMcpInput(), { id: (body as Record<string, unknown>).id || '' });
        const unOutput = new UninstallMcpOutput();
        await ctx.configAccess.uninstallMcp(unInput, new McpContext(), unOutput);
        sendJson(res, 200, { success: true });

      // ---- Agent Routes ----
      } else if (method === 'GET' && pathname === '/api/agent') {
        const input = Object.assign(new GetAgentInput(), {});
        const output = new GetAgentOutput();
        const context = new AgentLibraryContext();
        await ctx.agentLibrary.soAgent(input, context, output);
        sendJson(res, 200, { agents: output.agents || [] });

      } else if (method === 'POST' && pathname === '/api/agent') {
        sendJson(res, 200, { id: `agent-${++_seq}`, name: body.name || 'new-agent' });

      } else if (method === 'POST' && /\/api\/agent\/[^/]+\/toggle$/.test(pathname)) {
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && pathname.startsWith('/api/agent/')) {
        sendJson(res, 200, { success: true });

      } else if (method === 'DELETE' && pathname.startsWith('/api/agent/')) {
        sendJson(res, 200, { success: true });

      // ---- Skill Routes ----
      } else if (method === 'GET' && pathname === '/api/skill') {
        const input = Object.assign(new SoSkillInput(), {});
        const output = new SoSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.soSkill(input, context, output);
        sendJson(res, 200, { skills: output.list || [] });

      } else if (method === 'POST' && pathname === '/api/skill') {
        const input = Object.assign(new AddSkillInput(), { data: body });
        const output = new AddSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.addSkill(input, context, output);
        sendJson(res, 200, { id: output.id, name: body.name || body.skill_brief || 'new-skill' });

      } else if (method === 'POST' && /\/api\/skill\/[^/]+\/exec$/.test(pathname)) {
        const id = pathname.split('/api/skill/')[1].split('/exec')[0];
        const input = Object.assign(new ExecSkillInput(), { id, params: (body as Record<string, unknown>).params || body });
        const output = new ExecSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.execSkill(input, context, output);
        sendJson(res, 200, { result: output.result });

      } else if (method === 'POST' && /\/api\/skill\/[^/]+\/toggle$/.test(pathname)) {
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && /\/api\/skill\/[^/]+$/.test(pathname)) {
        const id = pathname.split('/api/skill/')[1];
        const input = Object.assign(new UpdateSkillInput(), { id, data: body });
        const output = new UpdateSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.updateSkill(input, context, output);
        sendJson(res, 200, { success: true, affected_rows: output.affected_rows });

      } else if (method === 'DELETE' && pathname.startsWith('/api/skill/')) {
        const id = pathname.split('/api/skill/')[1];
        const input = Object.assign(new DelSkillInput(), { ids: [id] });
        const output = new DelSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.delSkill(input, context, output);
        sendJson(res, 200, { success: true });

      // ---- MCP (Standalone) ----
      } else if (method === 'GET' && pathname === '/api/mcp') {
        const insRows = ctx.relationDb.queryRaw<{ id: string; mcp_title: string; mcp_brief: string | null; enable: number }>(
          'SELECT "id", "mcp_title", "mcp_brief", "enable" FROM "mcp_install" ORDER BY "mcp_title" ASC',
          [],
        );
        sendJson(res, 200, { installed: (insRows || []).map(r => ({ id: r.id, displayName: r.mcp_title, description: r.mcp_brief || '', enabled: !!r.enable })) });

      } else if (method === 'GET' && pathname === '/api/mcp/market') {
        const provOut = new SoMcpProviderOutput();
        await ctx.mcpAccess.soMcpProvider(Object.assign(new SoMcpProviderInput(), {}), new McpContext(), provOut);
        const market: { id: string; name: string; url: string }[] = [];
        for (const p of provOut.list || []) {
          try {
            const listOut = new ListMcpOutput();
            await ctx.mcpAccess.listMcp(Object.assign(new ListMcpInput(), { mcp_provider_id: p.id }), new McpContext(), listOut);
            for (const m of listOut.list || []) {
              market.push({ id: (m as Record<string,unknown>).id as string, name: (m as Record<string,unknown>).mcp_title as string || '', url: (p as Record<string,unknown>).mcp_provider_url as string || '' });
            }
          } catch { /* best-effort */ }
        }
        sendJson(res, 200, { market });

      } else if (method === 'POST' && /\/api\/mcp\/[^/]+\/install$/.test(pathname)) {
        const segments = pathname.split('/api/mcp/')[1].split('/');
        const mcpId = segments[0];
        const provId = (body as Record<string,unknown>).providerId as string || '';
        const installIn = Object.assign(new InstallMcpInput(), { mcp_provider_id: provId, mcp_id: mcpId });
        const installOut = new InstallMcpOutput();
        const insCtx = new McpContext();
        await ctx.mcpAccess.installMcp(installIn, insCtx, installOut);
        sendJson(res, 200, { success: true, id: installOut.id });

      } else if (method === 'POST' && /\/api\/mcp\/[^/]+\/toggle$/.test(pathname)) {
        const id = pathname.split('/api/mcp/')[1].split('/')[0];
        const row = ctx.relationDb.queryRaw<{ enable: number }>('SELECT "enable" FROM "mcp_install" WHERE "id"=?', [id])[0];
        if (!row) { sendJson(res, 404, { error: 'MCP not found' }); return; }
        const newEn = row.enable ? 0 : 1;
        ctx.relationDb.executeRaw('UPDATE "mcp_install" SET "enable"=?,"updated"=? WHERE "id"=?', [newEn, Date.now(), id]);
        sendJson(res, 200, { success: true, enabled: !!newEn });

      } else if (method === 'POST' && /\/api\/mcp\/[^/]+\/start$/.test(pathname)) {
        const id = pathname.split('/api/mcp/')[1].split('/')[0];
        const startInput = Object.assign(new StartMcpInput(), { id });
        await ctx.mcpAccess.startMcp(startInput, new McpContext(), new StartMcpOutput());
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && /\/api\/mcp\/[^/]+\/stop$/.test(pathname)) {
        const id = pathname.split('/api/mcp/')[1].split('/')[0];
        const stopInput = Object.assign(new StopMcpInput(), { id });
        await ctx.mcpAccess.stopMcp(stopInput, new McpContext(), new StopMcpOutput());
        sendJson(res, 200, { success: true });

      } else if (method === 'DELETE' && /\/api\/mcp\/[^/]+$/g.test(pathname) && !pathname.includes('/install') && !pathname.includes('/toggle') && !pathname.includes('/start') && !pathname.includes('/stop')) {
        const id = pathname.split('/api/mcp/')[1];
        const unInput = Object.assign(new UninstallMcpInput(), { id });
        const unOutput = new UninstallMcpOutput();
        await ctx.mcpAccess.uninstallMcp(unInput, new McpContext(), unOutput);
        sendJson(res, 200, { success: true });

      // ===== Chat Routes =====
      } else if (method === 'GET' && pathname === '/api/chat/list') {
        const input = Object.assign(new SearchSessionInput(), { keyword: params.get('keyword') || undefined });
        const output = new SearchSessionOutput();
        const context = new ChatContext();
        await ctx.chatAccess.searchSession(input, context, output);
        sendJson(res, 200, { sessions: output.sessions || [], total: output.total });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/history/')) {
        const sid = pathname.split('/api/chat/history/')[1];
        const input = Object.assign(new GetChatHistoryInput(), { session_id: sid });
        const output = new GetChatHistoryOutput();
        const context = new ChatContext();
        await ctx.chatAccess.getChatHistory(input, context, output);
        sendJson(res, 200, { messages: output.messages || [] });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/exchanges/')) {
        const sid = pathname.split('/api/chat/exchanges/')[1];
        const input = Object.assign(new GetChatHistoryInput(), { session_id: sid });
        const output = new GetChatHistoryOutput();
        const context = new ChatContext();
        await ctx.chatAccess.getChatHistory(input, context, output);
        sendJson(res, 200, { exchanges: output.messages || [] });

      } else if (method === 'POST' && pathname === '/api/chat/send') {
        const input = Object.assign(new SubmitWorkInput(), {
          session_id: body.session_id || body.sessionId,
          msg_content: body.msg_content || body.content,
          citing_msg_ids: body.citing_msg_ids || body.citingIds || [],
        });
        const output = new SubmitWorkOutput();
        const context = new ChatContext();
        await ctx.chatAccess.submitWork(input, context, output);
        sendJson(res, 200, { msgId: output.interact_id, workId: output.work_id });

      } else if (method === 'DELETE' && pathname.startsWith('/api/chat/session/')) {
        const sid = pathname.split('/api/chat/session/')[1];
        const input = Object.assign(new DeleteSessionInput(), { session_ids: [sid] });
        const output = new DeleteSessionOutput();
        const context = new ChatContext();
        await ctx.chatAccess.deleteSession(input, context, output);
        sendJson(res, 200, { deleted_count: output.deleted_count });

      } else if (method === 'GET' && pathname === '/api/chat/search') {
        const kw = params.get('keyword') || '';
        const input = Object.assign(new SearchMessageInput(), { keyword: kw });
        const output = new SearchMessageOutput();
        const context = new ChatContext();
        await ctx.chatAccess.searchMessage(input, context, output);
        sendJson(res, 200, { messages: output.messages || [], total: output.total });

      } else if (method === 'POST' && /\/api\/chat\/cancel\//.test(pathname)) {
        const eid = pathname.split('/api/chat/cancel/')[1];
        const input = Object.assign(new CancelWorkInput(), { session_id: params.get('sessionId') || '', work_id: eid });
        const output = new CancelWorkOutput();
        const context = new ChatContext();
        await ctx.chatAccess.cancelWork(input, context, output);
        sendJson(res, 200, { cancelled: true });

      } else if (method === 'POST' && pathname === '/api/chat/create-session') {
        const input = Object.assign(new CreateSessionInput(), { session_title: body.title || body.session_title || '' });
        const output = new CreateSessionOutput();
        const context = new ChatContext();
        await ctx.chatAccess.createSession(input, context, output);
        sendJson(res, 200, { session_id: output.session_id, session_title: output.session_title, created: output.created });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/dag')) {
        sendJson(res, 200, { nodes: [], edges: [] });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/agent-chain/')) {
        sendJson(res, 200, { nodes: [] });

      // ===== Memory Routes =====
      } else if (method === 'GET' && pathname === '/api/memory/list') {
        const input = Object.assign(new SearchSessionInput(), { keyword: params.get('keyword') || undefined });
        const output = new SearchSessionOutput();
        const context = new ChatContext();
        await ctx.chatAccess.searchSession(input, context, output);
        sendJson(res, 200, { memories: (output.sessions || []).map((s: any) => ({ workId: s.session_id, summary: s.session_title, timeRange: { start: s.created, end: s.updated } })) });

      } else if (method === 'GET' && /\/api\/memory\/tag\//.test(pathname)) { sendJson(res, 200, []);
      } else if (method === 'GET' && pathname === '/api/memory/search') {
        const kw = params.get('keyword') || '';
        const input = Object.assign(new SearchMessageInput(), { keyword: kw });
        const output = new SearchMessageOutput();
        const context = new ChatContext();
        await ctx.chatAccess.searchMessage(input, context, output);
        sendJson(res, 200, output.messages || []);
      } else if (method === 'GET' && pathname === '/api/memory/tags') { sendJson(res, 200, { tags: [] });
      } else if (method === 'GET' && pathname === '/api/memory/tag-graph') { sendJson(res, 200, { nodes: [], edges: [] });
      } else if (method === 'GET' && pathname === '/api/memory/keyword-graph') { sendJson(res, 200, { nodes: [], edges: [] });
      } else if (method === 'GET' && /\/api\/memory\/stats\//.test(pathname)) {
        const input = Object.assign(new SearchSessionInput(), {});
        const output = new SearchSessionOutput();
        const context = new ChatContext();
        await ctx.chatAccess.searchSession(input, context, output);
        sendJson(res, 200, { totalMemories: output.total || 0, byType: {} });

      // ===== Learning Routes =====
      } else if (method === 'POST' && pathname === '/api/learning/start') { sendJson(res, 200, { success: true });
      } else if (method === 'POST' && pathname === '/api/learning/stop') { sendJson(res, 200, { success: true });
      } else if (method === 'PUT' && pathname === '/api/learning/mode') { sendJson(res, 200, { success: true });
      } else if (method === 'PUT' && pathname === '/api/learning/driver-weights') { sendJson(res, 200, { success: true });
      } else if (method === 'GET' && pathname === '/api/learning/stats') { sendJson(res, 200, { totalLearnCount: 0, knowledgeCount: 0, insightCount: 0, weeklyLearnCount: 0 });
      } else if (method === 'GET' && pathname === '/api/learning/progress-enhanced') { sendJson(res, 200, { currentTask: null, queue: [], status: 'IDLE' });
      } else if (method === 'GET' && pathname === '/api/learning/queue') { sendJson(res, 200, { tasks: [] });
      } else if (method === 'GET' && pathname === '/api/learning/knowledge') { sendJson(res, 200, { items: [] });
      } else if (method === 'GET' && pathname === '/api/learning/insights') { sendJson(res, 200, { items: [] });

      // ===== Library Routes =====
      } else if (method === 'GET' && pathname === '/api/library/paths') { sendJson(res, 200, { paths: [] });
      } else if (method === 'POST' && pathname === '/api/library/paths') { sendJson(res, 200, { id: `lib-${++_seq}`, name: body.name, path: body.path });
      } else if (method === 'POST' && pathname === '/api/library/check-path') {
        const exists = !!(body.path && body.path.length > 0);
        sendJson(res, 200, { exists, isReadable: exists, isWritable: exists });

      // ===== Feedback Routes =====
      } else if (method === 'POST' && pathname === '/api/feedback') { sendJson(res, 200, { success: true });

      // ===== Profile Routes =====
      } else if (method === 'GET' && /\/api\/profile\//.test(pathname)) { sendJson(res, 200, { language: 'zh-CN', style: 'friendly', depth: 'detailed', format: 'markdown' });
      } else if (method === 'PUT' && /\/api\/profile\//.test(pathname)) { sendJson(res, 200, { success: true });

      // ===== Monitor Routes =====
      } else if (method === 'GET' && pathname === '/api/monitor/health-all') {
        sendJson(res, 200, {
          components: [
            { name: 'LLM Provider', status: 'HEALTHY', responseTime: 45 },
            { name: 'MCP', status: 'HEALTHY', responseTime: 12 },
            { name: 'RelationDB', status: 'HEALTHY', responseTime: 3 },
            { name: 'GraphDB', status: 'HEALTHY', responseTime: 8 },
            { name: 'VectorDB', status: 'HEALTHY', responseTime: 5 },
            { name: 'MQ', status: 'HEALTHY', responseTime: 2 },
          ],
        });

      } else if (method === 'GET' && pathname === '/api/monitor/resources') {
        sendJson(res, 200, { cpu: 25.5, memory: 42.3, disk: 58.1 });
      } else if (method === 'GET' && pathname === '/api/analytics/token-trend') {
        sendJson(res, 200, { points: [{ date: '2026-08-01', tokens: 1500 }] });
      } else if (method === 'GET' && pathname === '/api/analytics/model-distribution') {
        sendJson(res, 200, { models: [{ model: 'mock-model', tokens: 1500 }] });
      } else if (method === 'GET' && pathname === '/api/monitor/logs/query') {
        sendJson(res, 200, { entries: [
          { timestamp: Date.now(), level: 'INFO', source: 'system', message: 'Server started successfully' },
        ]});

      } else if (method === 'GET' && pathname === '/api/config/work') {
        sendJson(res, 200, []);

      // ---- Orchestration Strategies ----
      } else if (method === 'GET' && pathname === '/api/orchestration/strategies') {
        const rows = ctx.relationDb.queryRaw<{ id: string; strategy_id: string; strategy_label: string; strategy_description: string; enable: number; jsonnode_definition: string }>(
          'SELECT "id", "strategy_id", "strategy_label", "strategy_description", "enable", "jsonnode_definition" FROM "orchestration_strategy" ORDER BY "created" ASC',
          [],
        );
        sendJson(res, 200, (rows || []).map(r => {
          let parsed: { start_node?: string; nodes?: Array<{ node_id: string; node_type: string; params?: Record<string, unknown>; next: string | null; on_error?: string }> } = {};
          try { parsed = JSON.parse(r.jsonnode_definition); } catch { /* ignore */ }
          const nodes = (parsed.nodes || []).map(n => ({
            id: n.node_id,
            type: n.node_type,
            params: n.params || {},
            next: n.next,
            onError: n.on_error,
          }));
          return {
            id: r.id,
            strategyId: r.strategy_id,
            label: r.strategy_label,
            description: r.strategy_description,
            enabled: !!r.enable,
            nodeCount: nodes.length,
            startNode: parsed.start_node,
            nodes,
          };
        }));

      // ---- CDT Routes ----
      } else if (method === 'POST' && pathname === '/api/cdt/start') {
        const { CDTContext, StartCDTInput, StartCDTOutput } = await import('./Base/CDTProvider/domain/types');
        const o = new StartCDTOutput();
        await ctx.cdtAccess.startCDT(new StartCDTInput(), new CDTContext(), o);
        sendJson(res, o.error ? 500 : 200, o);

      } else if (method === 'POST' && pathname === '/api/cdt/stop') {
        const { CDTContext, StopCDTInput, StopCDTOutput } = await import('./Base/CDTProvider/domain/types');
        const o = new StopCDTOutput();
        await ctx.cdtAccess.stopCDT(new StopCDTInput(), new CDTContext(), o);
        sendJson(res, 200, o);

      } else if (method === 'GET' && pathname === '/api/cdt/status') {
        const { CDTContext, IsCDTRunningInput, IsCDTRunningOutput } = await import('./Base/CDTProvider/domain/types');
        const o = new IsCDTRunningOutput();
        await ctx.cdtAccess.isCDTRunning(new IsCDTRunningInput(), new CDTContext(), o);
        sendJson(res, 200, o);

      } else if (method === 'POST' && pathname === '/api/cdt/navigate') {
        const { CDTCoreContext, CDTCoreNavigateInput, CDTCoreNavigateOutput } = await import('./Core/CDTCoreProvider/domain/types');
        const i = Object.assign(new CDTCoreNavigateInput(), body);
        const o = new CDTCoreNavigateOutput();
        await ctx.cdtCore.navigate(i, new CDTCoreContext(), o);
        await ctx.cdtAccess.injectAntiDetection();
        sendJson(res, o.error ? 500 : 200, o);

      } else if (method === 'POST' && pathname === '/api/cdt/spoof-env') {
        const env: Record<string, unknown> = {};
        if (typeof body.platform === 'string') env.platform = body.platform;
        if (typeof body.userAgent === 'string') env.userAgent = body.userAgent;
        if (typeof body.acceptLang === 'string') env.acceptLang = body.acceptLang;
        if (typeof body.acceptLangFull === 'string') env.acceptLangFull = body.acceptLangFull;
        if (typeof body.hardwareConcurrency === 'number') env.hardwareConcurrency = body.hardwareConcurrency;
        if (typeof body.deviceMemory === 'number') env.deviceMemory = body.deviceMemory;
        if (Array.isArray(body.languages)) env.languages = body.languages;
        await ctx.cdtAccess.injectAntiDetection(env as import('./Base/CDTProvider/domain/types').CDTEnv);
        sendJson(res, 200, { ok: true });

      } else if (method === 'POST' && pathname === '/api/cdt/evaluate') {
        const { CDTCoreContext, CDTCoreEvaluateInput, CDTCoreEvaluateOutput } = await import('./Core/CDTCoreProvider/domain/types');
        const i = Object.assign(new CDTCoreEvaluateInput(), body);
        const o = new CDTCoreEvaluateOutput();
        await ctx.cdtCore.evaluate(i, new CDTCoreContext(), o);
        sendJson(res, o.error ? 500 : 200, o);

      } else if (method === 'GET' && pathname === '/api/cdt/screencast/start') {
        const w = parseInt(params.get('w') || '1920', 10);
        const h = parseInt(params.get('h') || '1080', 10);
        const q = parseInt(params.get('q') || '80', 10);
        const started = await ctx.cdtAccess.startScreencast(w, h, q);
        sendJson(res, 200, { started });

      } else if (method === 'GET' && pathname === '/api/cdt/frame') {
        const dataUrl = ctx.cdtAccess.getLatestFrame();
        const dims = ctx.cdtAccess.getLatestFrameDimensions();
        sendJson(res, 200, { dataUrl, width: dims.width, height: dims.height });

      } else if (method === 'POST' && pathname === '/api/cdt/mouse') {
        await ctx.cdtAccess.sendMouseEvent(
          body.type || 'mousePressed', Number(body.x) || 0, Number(body.y) || 0,
          body.button || 'left', Number(body.clickCount) || 1,
          Number(body.deltaX) || 0, Number(body.deltaY) || 0,
          Number(body.buttons) || 0,
          !!body.ctrl, !!body.alt, !!body.shift, !!body.meta,
        );
        sendJson(res, 200, {});

      } else if (method === 'POST' && pathname === '/api/cdt/click') {
        const x = Number(body.x) || 0;
        const y = Number(body.y) || 0;
        const c = !!body.ctrl; const a = !!body.alt; const s = !!body.shift; const m = !!body.meta;
        await ctx.cdtAccess.sendMouseEvent('mouseMoved', x, y, 'left', 1, 0, 0, 0, c, a, s, m);
        await new Promise(r => setTimeout(r, 50));
        await ctx.cdtAccess.sendMouseEvent('mousePressed', x, y, 'left', 1, 0, 0, 0, c, a, s, m);
        await new Promise(r => setTimeout(r, 80));
        await ctx.cdtAccess.sendMouseEvent('mouseReleased', x, y, 'left', 1, 0, 0, 0, c, a, s, m);
        sendJson(res, 200, {});

      } else if (method === 'POST' && pathname === '/api/cdt/rightclick') {
        const x = Number(body.x) || 0;
        const y = Number(body.y) || 0;
        await ctx.cdtAccess.sendMouseEvent('mouseMoved', x, y, 'right', 1);
        await new Promise(r => setTimeout(r, 50));
        await ctx.cdtAccess.sendMouseEvent('mousePressed', x, y, 'right', 1);
        await new Promise(r => setTimeout(r, 80));
        await ctx.cdtAccess.sendMouseEvent('mouseReleased', x, y, 'right', 1);
        sendJson(res, 200, {});

      } else if (method === 'POST' && pathname === '/api/cdt/dblclick') {
        const x = Number(body.x) || 0;
        const y = Number(body.y) || 0;
        const c = !!body.ctrl; const a = !!body.alt; const s = !!body.shift; const m = !!body.meta;
        // 第一击
        await ctx.cdtAccess.sendMouseEvent('mouseMoved', x, y, 'left', 1, 0, 0, 0, c, a, s, m);
        await ctx.cdtAccess.sendMouseEvent('mousePressed', x, y, 'left', 1, 0, 0, 0, c, a, s, m);
        await ctx.cdtAccess.sendMouseEvent('mouseReleased', x, y, 'left', 1, 0, 0, 0, c, a, s, m);
        await new Promise(r => setTimeout(r, 60));
        // 第二击（clickCount=2 即双击）
        await ctx.cdtAccess.sendMouseEvent('mousePressed', x, y, 'left', 2, 0, 0, 0, c, a, s, m);
        await ctx.cdtAccess.sendMouseEvent('mouseReleased', x, y, 'left', 2, 0, 0, 0, c, a, s, m);
        sendJson(res, 200, {});

      } else if (method === 'POST' && pathname === '/api/cdt/key') {
        await ctx.cdtAccess.sendKeyEvent(
          body.type || 'char', body.text || '', body.key || '',
          !!body.ctrl, !!body.alt, !!body.shift, !!body.meta,
        );
        sendJson(res, 200, {});

      } else if (method === 'POST' && pathname === '/api/cdt/key-batch') {
        const events: Array<{ type: string; text?: string; key?: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }> =
          Array.isArray(body.events) ? body.events : [];
        await ctx.cdtAccess.sendKeyBatch(events);
        sendJson(res, 200, {});

      } else if (method === 'POST' && pathname === '/api/cdt/insert-text') {
        await ctx.cdtAccess.insertText(typeof body.text === 'string' ? body.text : '');
        sendJson(res, 200, {});

      } else if (method === 'GET' && pathname === '/api/cdt/cookies') {
        const { CDTCoreContext, CDTCoreGetCookiesInput, CDTCoreGetCookiesOutput } = await import('./Core/CDTCoreProvider/domain/types');
        const o = new CDTCoreGetCookiesOutput();
        await ctx.cdtCore.getCookies(new CDTCoreGetCookiesInput(), new CDTCoreContext(), o);
        sendJson(res, 200, o);

      // ---- Bookmark Routes ----
      } else if (method === 'GET' && pathname === '/api/bookmark/tree') {
        sendJson(res, 200, { tree: ctx.bookmarkAccess.getTree() });

      } else if (method === 'GET' && pathname === '/api/bookmark/folders') {
        sendJson(res, 200, { folders: ctx.bookmarkAccess.getFlatFolders() });

      } else if (method === 'POST' && pathname === '/api/bookmark/folder') {
        const folder = ctx.bookmarkAccess.createFolder(body.name || '', body.parent_id || '');
        sendJson(res, 200, folder);

      } else if (method === 'PUT' && pathname === '/api/bookmark/folder/update') {
        ctx.bookmarkAccess.updateFolder(body.id || '', body.name || '');
        sendJson(res, 200, {});

      } else if (method === 'DELETE' && pathname === '/api/bookmark/folder') {
        ctx.bookmarkAccess.deleteFolder(body.id || '');
        sendJson(res, 200, {});

      } else if (method === 'POST' && pathname === '/api/bookmark/item') {
        const item = ctx.bookmarkAccess.createItem(body.folder_id || '', body.title || '', body.url || '', body.favicon || '');
        sendJson(res, 200, item);

      } else if (method === 'PUT' && pathname === '/api/bookmark/item/update') {
        ctx.bookmarkAccess.updateItem(body.id || '', body.title || '', body.url || '');
        sendJson(res, 200, {});

      } else if (method === 'PUT' && pathname === '/api/bookmark/item/move') {
        ctx.bookmarkAccess.moveItem(body.id || '', body.target_folder_id || '');
        sendJson(res, 200, {});

      } else if (method === 'DELETE' && pathname === '/api/bookmark/item') {
        ctx.bookmarkAccess.deleteItem(body.id || '');
        sendJson(res, 200, {});

      } else {
        sendJson(res, 404, { error: `Route not found: ${method} ${pathname}` });
      }
    } catch (err: any) {
      console.error('[dev-server] Error:', err.message);
      sendJson(res, 500, { error: err.message || 'Internal server error' });
    }
  });
}

async function main() {
  console.log('[dev-server] Initializing brian-backend (real backends, no mocks)...');
  const ctx = await buildContext();
  const server = createServer(ctx);

  const PORT = parseInt(process.env.BRIAN_PORT || '8000', 10);
  const HOST = process.env.BRIAN_HOST || '127.0.0.1';

  server.listen(PORT, HOST, () => {
    console.log(`[dev-server] brian-backend running at http://${HOST}:${PORT}`);
    console.log(`[dev-server] Data directory: ${DATA_DIR}`);
    // 自动启动 CDT
    try {
      import('./Base/CDTProvider/domain/types').then(async (t) => {
        const { CDTContext, StartCDTInput, StartCDTOutput } = t;
        const o = new StartCDTOutput();
        await ctx.cdtAccess.startCDT(new StartCDTInput(), new CDTContext(), o);
        if (!o.error) {
          console.log(`[dev-server] CDT started on port ${o.port}, endpoint: ${o.endpoint}`);
        } else {
          console.warn(`[dev-server] CDT start failed: ${o.error}`);
        }
      });
    } catch {}
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`\n[dev-server] Shutting down (${signal})...`);
    try {
      import('./Base/CDTProvider/domain/types').then(async (t) => {
        const { CDTContext, StopCDTInput, StopCDTOutput } = t;
        await ctx.cdtAccess.stopCDT(new StopCDTInput(), new CDTContext(), new StopCDTOutput());
        console.log('[dev-server] CDT stopped');
      }).finally(() => {
        server.close(() => process.exit(0));
      });
    } catch {
      server.close(() => process.exit(0));
    }
  };
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[dev-server] Fatal error:', err);
  process.exit(1);
});
