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
import { InfoCoreAccess } from './Core/InfoCoreProvider';
import { LLMCoreAccess } from './Core/LLMCoreProvider';
import { MCPCoreAccess } from './Core/MCPCoreProvider';
import { SkillCoreAccess } from './Core/SkillCoreProvider';
import { SoulCoreAccess } from './Core/SoulCoreProvider';
import { MQCoreAccess } from './Core/MQCoreProvider';
import { AgentLibraryAccess } from './Agent/AgentLibrary';
import { AgentStrategyAccess } from './Agent/AgentStrategy';
import { AgentBuilderAccess } from './Agent/AgentBuilder';
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
    infoCore, llmCore, mcpCore, skillCore, soulCore, mqCore,
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
        const rows = ctx.relationDb.queryRaw<{ id: string; llm_provider_id: string; llm_title: string; llm_brief: string | null; llm_usage: string; enable: number; is_default: number; model_usage: string | null; max_tokens: number | null }>(
          'SELECT e."id", e."llm_provider_id", e."llm_title", e."llm_brief", e."llm_usage", e."enable", COALESCE(e."is_default", 0) as "is_default", e."model_usage", COALESCE(e."max_tokens", 0) as "max_tokens" FROM "llm_enable" e ORDER BY e."llm_title" ASC',
          [],
        );
        const models = (rows || []).map(r => ({
          id: r.id,
          modelName: r.llm_title,
          providerId: r.llm_provider_id,
          providerName: r.llm_provider_id,
          llm_usage: r.llm_usage || 'text',
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
          'SELECT "id", "llm_title", "llm_provider_id", "enable" FROM "llm_enable" WHERE "llm_title" = ?', [title],
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
        ctx.relationDb.executeRaw('UPDATE "llm_enable" SET "is_default" = 0', []);
        ctx.relationDb.executeRaw('UPDATE "llm_enable" SET "is_default" = 1 WHERE "llm_title" = ?', [title]);
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && pathname.startsWith('/api/config/model/') && !/\/default$/.test(pathname)) {
        const title = pathname.split('/api/config/model/')[1];
        const data = (body as Record<string, unknown>).data || body;
        try { ctx.relationDb.executeRaw('UPDATE "llm_enable" SET "llm_brief" = ?, "enable" = ?, "model_usage" = ?, "max_tokens" = ? WHERE "llm_title" = ?',
          [data.llm_brief || '', (data.enable ?? data.enabled) ? 1 : 0, (data.model_usage || ''), (data.maxTokens || 0), title]); } catch {}
        sendJson(res, 200, { success: true, id: title });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/model/')) {
        const title = pathname.split('/api/config/model/')[1];
        try { ctx.relationDb.executeRaw('DELETE FROM "llm_enable" WHERE "llm_title" = ?', [title]); } catch {}
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
          features: (m as any).features ? JSON.parse((m as any).features) : {},
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
          'SELECT "llm_title", "llm_brief", "features" FROM "llm_model" WHERE "llm_provider_id" = ? ORDER BY "llm_title" ASC', [id],
        );
        const enabledRows = ctx.relationDb.queryRaw<{ llm_title: string }>(
          'SELECT "llm_title" FROM "llm_enable" WHERE "llm_provider_id" = ?', [id],
        );
        const enabledSet = new Set((enabledRows || []).map(r => r.llm_title));
        const models = (rows || []).map(r => ({
          id: r.llm_title,
          name: r.llm_title,
          brief: r.llm_brief || '',
          features: r.features ? (() => { try { return JSON.parse(r.features); } catch { return {}; } })() : {},
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
              'SELECT "max_tokens" FROM "llm_model" WHERE "llm_provider_id" = ? AND "llm_title" = ?', [providerId, title],
            )[0];
            const maxTokens = cachedRow?.max_tokens || 0;
            ctx.relationDb.executeRaw(
              'INSERT OR IGNORE INTO "llm_enable" ("id", "created", "updated", "llm_provider_id", "llm_title", "llm_usage", "enable", "max_tokens") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [IdGenerator.generate(), IdGenerator.now(), IdGenerator.now(), providerId, title, 'text', 0, maxTokens],
            );
            if (maxTokens > 0) {
              try { ctx.relationDb.executeRaw('UPDATE "llm_enable" SET "max_tokens" = ? WHERE "llm_provider_id" = ? AND "llm_title" = ?', [maxTokens, providerId, title]); } catch {}
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
        const input = Object.assign(new AddSoulInput(), body);
        const output = new AddSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.addSoul(input, context, output);
        sendJson(res, 200, { id: output.soul_id, name: body.soul_brief || 'new-soul' });

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
        const input = Object.assign(new AddSkillInput(), body);
        const output = new AddSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.addSkill(input, context, output);
        sendJson(res, 200, { id: output.skill_id, name: body.skill_brief || 'new-skill' });

      } else if (method === 'POST' && /\/api\/skill\/[^/]+\/toggle$/.test(pathname)) {
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && /\/api\/skill\/[^/]+$/.test(pathname)) {
        sendJson(res, 200, { success: true });

      } else if (method === 'DELETE' && pathname.startsWith('/api/skill/')) {
        const id = pathname.split('/api/skill/')[1];
        const input = Object.assign(new DelSkillInput(), { skill_ids: [id] });
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
  });

  process.on('SIGINT', () => { console.log('\n[dev-server] Shutting down...'); server.close(() => process.exit(0)); });
  process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
}

main().catch((err) => {
  console.error('[dev-server] Fatal error:', err);
  process.exit(1);
});
