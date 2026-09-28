import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { WebSocketServer } from 'ws';

import { IdGenerator, InfoType, Operator, Metrics, type MetricsLogger } from '@brian-agent/base';
import {
  RunGatewayContext, AnswerPermissionInput, AnswerPermissionOutput, AnswerUserAskInput, AnswerUserAskOutput, } from '@brian-agent/runtime';

import { applySystemSeed } from './seed/systemSeed';
import { AddPromptInput, DelPromptInput, UpdatePromptInput } from './Base/PromptsProvider';
import { SendMQInput, SendMQOutput, ConsumeMQInput, ConsumeMQOutput, GetQueueStatsInput, GetQueueStatsOutput, AckMQInput, AckMQOutput, MQContext } from './Base/MQProvider';
import { LogContext, DelLogInput, DelLogOutput } from './Base/LogProvider';
import {
  SoTreeInput, SoTreeOutput, SoFlatFoldersInput, SoFlatFoldersOutput, AddFolderInput, AddFolderOutput, AddItemInput, AddItemOutput, UpdateFolderInput, UpdateFolderOutput, UpdateItemInput, UpdateItemOutput, DelFolderInput, DelFolderOutput, DelItemInput, DelItemOutput, MoveItemInput, MoveItemOutput, BookmarkContext, } from './Base/BookmarkProvider/domain/types';
import {
  GenerateIdsInput, GenerateIdsOutput, JsonCheckInput, JsonCheckOutput, JsonFormatInput, JsonFormatOutput, JsonMinifyInput, JsonMinifyOutput, XmlCheckInput, XmlCheckOutput, XmlFormatInput, XmlFormatOutput, XmlMinifyInput, XmlMinifyOutput, RegexMatchInput, RegexMatchOutput, CronCheckInput, CronCheckOutput, CronGenerateInput, CronGenerateOutput, CronParseInput, CronParseOutput, CronNextInput, CronNextOutput, ToolContext, } from './Base/ToolProvider/domain/types';
import {
  SoResourceInput, SoResourceOutput, SystemMonitorContext, } from './Base/ToolProvider/domain/SystemMonitorTypes';
import {
  RegisterStreamInput, RegisterStreamOutput, StreamContext, CloseStreamInput, CloseStreamOutput, } from './Base/StreamProvider';
import {
  FeedbackContext, SubmitFeedbackInput, SubmitFeedbackOutput, QueryFeedbackInput, QueryFeedbackOutput, AnalyzeFeedbackInput, AnalyzeFeedbackOutput, QueryProcessLogsInput, QueryProcessLogsOutput, GetProcessLogDetailInput, GetProcessLogDetailOutput, GetFeedbackConfigInput, GetFeedbackConfigOutput, UpdateFeedbackConfigInput, UpdateFeedbackConfigOutput, RecordProcessLogInput, RecordProcessLogOutput, } from './Base/FeedbackHandler';
import {
  CronContext, ListCronTasksInput, ListCronTasksOutput, GetCronTaskInput, GetCronTaskOutput, SetCronTaskInput, SetCronTaskOutput, SetCronTaskEnabledInput, SetCronTaskEnabledOutput, TriggerCronTaskInput, TriggerCronTaskOutput, ListCronTaskRunsInput, ListCronTaskRunsOutput, } from './Base/CronProvider';
import { InfoCoreContext, SimilarKInfoInput, SimilarKInfoOutput, DelInfoGraphInput, DelInfoGraphOutput, ClearGraphInput, ClearGraphOutput, SaveInfoInput, SaveInfoOutput } from './Core/InfoCoreProvider';
import { SoStrategyInput, SoStrategyOutput, ToggleStrategyInput, ToggleStrategyOutput, AgentStrategyContext } from './Agent/AgentStrategy';
import {
} from './Agent/AgentBuilder';
import { buildThinkingBlocksAndDag } from './server/thinkingBlocks';
import { buildContext, getRuntimeGateway, httpReq } from './server/context';
import { fileLogger } from './server/fileLog';

import {
  SelfLearningContext, ListLearningTasksInput, ListLearningTasksOutput, AddLibraryInput, AddLibraryOutput, DeleteLibraryInput, DeleteLibraryOutput, SearchLibraryInput, SearchLibraryOutput, SetLibraryEnabledInput, SetLibraryEnabledOutput, GetLibraryFilesInput, GetLibraryFilesOutput, GetLibraryTreeInput, GetLibraryTreeOutput, GetFileContentInput, GetFileContentOutput, QueryDocumentInput, QueryDocumentOutput, SaveAnnotationInput, SaveAnnotationOutput, GetFileAnnotationsInput, GetFileAnnotationsOutput, UpdateFileContentInput, UpdateFileContentOutput, DeleteFileInput, DeleteFileOutput, StartLearningInput, StartLearningOutput, StopLearningInput, StopLearningOutput, GetLearningProgressInput, GetLearningProgressOutput, GetLearningResultsInput, GetLearningResultsOutput, GetLearningStatsInput, GetLearningStatsOutput, ConfigSelfLearningInput, ConfigSelfLearningOutput, } from './Application/SelfLearning/domain/types';
import {
  UserProfileContext, GetUserProfileInput, GetUserProfileOutput, GenerateProfileInput, GenerateProfileOutput, SaveUserPreferenceInput, SaveUserPreferenceOutput, GetProfileHistoryInput, GetProfileHistoryOutput, GetProfileByVersionInput, GetProfileByVersionOutput, ResetUserProfileInput, ResetUserProfileOutput, ConfigProfileDirectionInput, ConfigProfileDirectionOutput, DeleteProfileDirectionInput, DeleteProfileDirectionOutput, GetProfileDirectionInput, GetProfileDirectionOutput, } from './Application/UserProfile/domain/types';
import {
  VisualizationContext, GetVisualizedMessagesInput, GetVisualizedMessagesOutput, GetVisualizedMessageGraphInput, GetVisualizedMessageGraphOutput, GetVisualizedAgentDAGInput, GetVisualizedAgentDAGOutput, GetVisualizedWorkFlowInput, GetVisualizedWorkFlowOutput, GetAgentTraceInput, GetAgentTraceOutput, GetVisualizedMessageDAGInput, GetVisualizedMessageDAGOutput, GetResourceInput, GetResourceOutput, GraphVisualizationConfigInput, GraphVisualizationConfigOutput, ConfigVisualizationInput, ConfigVisualizationOutput, } from './Application/Visualization/domain/types';

import {
  ConfigContext, GetConfigDetailInput, GetConfigDetailOutput, GetConfigItemInput, GetConfigItemOutput, UpdateConfigInput, UpdateConfigOutput, GetConfigHistoryInput, GetConfigHistoryOutput, } from './Application/Config/domain/types';
import { ALL_CONFIG_REGISTRATIONS } from './Application/Config/domain/configRegistrations';

import { LLMContext, ListLLMInput, ListLLMOutput, AddLLMProviderInput, AddLLMProviderOutput, UpdateLLMProviderInput, UpdateLLMProviderOutput, DelLLMProviderInput, DelLLMProviderOutput, SoLLMProviderInput, SoLLMProviderOutput, TestLLMProviderInput, TestLLMProviderOutput, GetLLMInput, GetLLMOutput, GenLLMAttrInput, GenLLMAttrOutput, LLMCacheRecord } from './Base/LLMProvider';
import { SoulContext, SoSoulInput, SoSoulOutput, AddSoulInput, AddSoulOutput, UpdateSoulInput, UpdateSoulOutput, DelSoulInput, DelSoulOutput } from './Base/SoulProvider';
import { SkillContext, SoSkillInput, SoSkillOutput, AddSkillInput, AddSkillOutput, UpdateSkillInput, UpdateSkillOutput, DelSkillInput, DelSkillOutput, ExecSkillInput, ExecSkillOutput } from './Base/SkillProvider';
import {
  McpContext, ListMcpInput, ListMcpOutput, SoMcpProviderInput, SoMcpProviderOutput, SoMcpInput, SoMcpOutput, AddMcpProviderInput, AddMcpProviderOutput, UpdateMcpProviderInput, UpdateMcpProviderOutput, DelMcpProviderInput, DelMcpProviderOutput, InstallMcpInput, InstallMcpOutput, StartMcpInput, StartMcpOutput, StopMcpInput, StopMcpOutput, StartMcpsInput, StartMcpsOutput, RefreshMcpStatusInput, RefreshMcpStatusOutput, GetMcpUsageInput, GetMcpUsageOutput, UninstallMcpInput, UninstallMcpOutput, UpgradeMcpInput, UpgradeMcpOutput, ExecMcpInput, ExecMcpOutput, } from './Base/MCPProvider';
import {
  AgentLibraryContext, GetAgentInput, GetAgentOutput, DelAgentInput, DelAgentOutput, ToggleAgentInput, ToggleAgentOutput, AddAgentInput, AddAgentOutput, UpdateAgentInput, UpdateAgentOutput, VALID_AGENT_TYPES, } from './Agent/AgentLibrary';

import {
  ChatContext, CreateSessionInput, CreateSessionOutput, DeleteSessionInput, DeleteSessionOutput, SearchSessionInput, SearchSessionOutput, GetSessionDetailInput, GetSessionDetailOutput, GetChatHistoryInput, GetChatHistoryOutput, SearchMessageInput, SearchMessageOutput, PinMessageInput, PinMessageOutput, OpenChatStreamInput, OpenChatStreamOutput, UpdateSessionTitleInput, UpdateSessionTitleOutput, } from './Application/Chat/domain/types';

const _seq = 0;

const DATA_DIR = process.env.BRIAN_DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// —— 认证状态：密码存 data/auth.json（scrypt 加盐哈希），token 仅存内存（重启后需重新登录）
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const AUTH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
interface AuthFileState { salt: string; hash: string }
let authState: AuthFileState | null = (() => {
  try { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) as AuthFileState; } catch { return null; }
})();
const authTokens = new Map<string, number>();

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function issueAuthToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  authTokens.set(token, Date.now() + AUTH_TOKEN_TTL_MS);
  return token;
}

function bearerToken(req: http.IncomingMessage): string {
  const m = /^Bearer\s+(.+)$/.exec(String(req.headers['authorization'] || ''));
  return m ? m[1].trim() : '';
}

function isRequestAuthenticated(req: http.IncomingMessage): boolean {
  const token = bearerToken(req);
  if (!token) return false;
  const expiresAt = authTokens.get(token);
  if (!expiresAt || expiresAt < Date.now()) { authTokens.delete(token); return false; }
  return true;
}


function mapLearningMode(mode: string): string {
  const m = (mode || '').toLowerCase();
  if (m.includes('document')) return 'DOCUMENT';
  if (m.includes('conversation')) return 'CONVERSATION';
  if (m.includes('tag')) return 'TAG_MAINTENANCE';
  return 'ALL';
}

function mapAutoField(mode: string): string {
  if (mode === 'DOCUMENT') return 'document_auto_enable';
  if (mode === 'CONVERSATION') return 'conversation_auto_enable';
  if (mode === 'TAG_MAINTENANCE') return 'tag_auto_enable';
  return '';
}

function mapRandomFactorField(mode: string): string {
  if (mode === 'DOCUMENT') return 'document_random_factor';
  if (mode === 'CONVERSATION') return 'conversation_random_factor';
  if (mode === 'TAG_MAINTENANCE') return 'tag_random_factor';
  return '';
}

// 记忆视图只展示用户输入与系统产出；THINK/REFLECT/ACT/SKILL/MCP/CDT 等执行中间过程仅入库供上下文/回放使用，不对外展示
const MEMORY_VISIBLE_INFO_TYPES: string[] = [InfoType.REQUEST, InfoType.RESPONSE];

function memoryVisibleTypeCond(): string {
  return `"info_type" IN (${MEMORY_VISIBLE_INFO_TYPES.map(() => '?').join(',')})`;
}

function mapInfoToMemory(row: any, tags: string[] = []): any {
  const typeMap: Record<string, string> = {
    [InfoType.REQUEST]: 'episodic',
    [InfoType.RESPONSE]: 'semantic',
    [InfoType.THINK]: 'procedural',
    [InfoType.REFLECT]: 'procedural',
    [InfoType.ACT]: 'working',
    [InfoType.SKILL]: 'procedural',
    [InfoType.MCP]: 'procedural',
    [InfoType.CDT]: 'procedural',
    [InfoType.SELF_LEARNING]: 'semantic',
    [InfoType.AGENT]: 'procedural',
  };
  const type = typeMap[row.info_type] || (row.info_creator_role === 'USER' ? 'episodic' : 'semantic');
  const info = row.info || '';
  const rawRole = (row.info_creator_role || '').toLowerCase();
  const isUser = row.info_type === InfoType.REQUEST || rawRole === 'user';
  const role: 'user' | 'assistant' | 'system' = isUser ? 'user' : (rawRole === 'system' ? 'system' : 'assistant');
  return {
    id: row.info_id || row.id,
    type,
    role,
    infoType: row.info_type,
    creatorRole: row.info_creator_role,
    content: info,
    tags,
    sessionId: String(row.session_id || ''),
    confidence: computeMemoryConfidence(row.info_type, tags, info.length, Number(row.pin) || 0),
    createdAt: Number(row.created) || 0,
    updatedAt: Number(row.updated) || 0,
  };
}

function computeMemoryConfidence(infoType: string, tags: string[], infoLength: number, pin: number): number {
  const baseReliability: Record<string, number> = {
    [InfoType.SELF_LEARNING]: 0.6,
    [InfoType.REQUEST]: 0.55,
    [InfoType.RESPONSE]: 0.5,
    [InfoType.SKILL]: 0.45,
    [InfoType.MCP]: 0.45,
    [InfoType.CDT]: 0.45,
    [InfoType.AGENT]: 0.45,
    [InfoType.ACT]: 0.4,
    [InfoType.REFLECT]: 0.35,
    [InfoType.THINK]: 0.3,
  };
  const base = baseReliability[infoType] ?? 0.5;
  const tagBoost = Math.min(tags.length, 5) * 0.04;
  const lengthBoost = infoLength >= 100 ? 0.05 : 0;
  const pinBoost = pin === 1 ? 0.1 : 0;
  const raw = base + tagBoost + lengthBoost + pinBoost;
  return Math.round(Math.min(0.95, Math.max(0.05, raw)) * 100) / 100;
}

function queryInfoTagsByInfoIds(relationDb: import('./Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess, infoIds: string[]): Map<string, string[]> {
  const tagMap = new Map<string, string[]>();
  if (infoIds.length === 0) return tagMap;
  const tagRows = relationDb.queryRaw<{ info_id: string; tag: string }>(
    `SELECT "info_id", "tag" FROM "info_tag" WHERE "info_id" IN (${infoIds.map(() => '?').join(',')})`,
    infoIds,
  );
  for (const t of tagRows) {
    if (!tagMap.has(t.info_id)) tagMap.set(t.info_id, []);
    tagMap.get(t.info_id)!.push(t.tag);
  }
  return tagMap;
}

async function buildCooccurGraphFromGraphDB(
  ctx: any,
  nodeType: string,
  textField: string,
  edgeType: string,
  limit = 100,
): Promise<{ nodes: Array<{ id: string; name: string; weight: number; degree: number }>; edges: Array<{ source: string; target: string; weight: number }> }> {
  const { GraphContext, SelectGraphOutput, GraphTarget } = await import('./Base/GraphDBProvider/domain/types');

  const nodeOut = new SelectGraphOutput();
  await ctx.graphDBAccess.selectGraph(
    { target: GraphTarget.NODE, node_type: nodeType },
    nodeOut,
    new GraphContext(),
  );
  const allNodes = (nodeOut.list as Array<{ id: string; content?: Record<string, unknown> }>)
    .map((n) => ({ id: n.id, text: String(n.content?.[textField] ?? ''), freq: Number(n.content?.['freq'] ?? 0) }))
    .filter((n) => n.text);

  const rawNodes = [...allNodes].sort((a, b) => b.freq - a.freq).slice(0, Math.max(1, Math.floor(limit)));
  const keptIds = new Set(rawNodes.map((n) => n.id));

  const edgeOut = new SelectGraphOutput();
  await ctx.graphDBAccess.selectGraph(
    { target: GraphTarget.EDGE, edge_type: edgeType },
    edgeOut,
    new GraphContext(),
  );
  const rawEdges = (edgeOut.list as Array<{ from_node_id: string; to_node_id: string; weight: number }>)
    .filter((e) => keptIds.has(e.from_node_id) && keptIds.has(e.to_node_id));

  const idToText = new Map(rawNodes.map((n) => [n.id, n.text]));

  const degreeMap = new Map<string, number>();
  for (const e of rawEdges) {
    const s = idToText.get(e.from_node_id);
    const t = idToText.get(e.to_node_id);
    if (!s || !t) continue;
    degreeMap.set(s, (degreeMap.get(s) || 0) + 1);
    degreeMap.set(t, (degreeMap.get(t) || 0) + 1);
  }

  const nodes = rawNodes.map((n) => ({
    id: n.text,
    name: n.text,
    weight: n.freq || 1,
    degree: degreeMap.get(n.text) || 0,
  }));
  const edges = rawEdges
    .map((e) => ({ source: idToText.get(e.from_node_id) ?? '', target: idToText.get(e.to_node_id) ?? '', weight: e.weight }))
    .filter((e) => e.source && e.target);

  return { nodes, edges };
}

const graphCache = new Map<string, { data: { nodes: Array<{ id: string; name: string; weight: number; degree: number }>; edges: Array<{ source: string; target: string; weight: number }> }; ts: number }>();
const GRAPH_CACHE_TTL = 30_000;

async function buildCooccurGraphFromGraphDBCached(
  ctx: any,
  nodeType: string,
  textField: string,
  edgeType: string,
  limit = 100,
): Promise<{ nodes: Array<{ id: string; name: string; weight: number; degree: number }>; edges: Array<{ source: string; target: string; weight: number }> }> {
  const cacheKey = `${nodeType}:${edgeType}:${limit}`;
  const cached = graphCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < GRAPH_CACHE_TTL) {
    return cached.data;
  }
  const data = await buildCooccurGraphFromGraphDB(ctx, nodeType, textField, edgeType, limit);
  graphCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}


const TRACE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function soReqTraceId(req: http.IncomingMessage): string {
  const raw = String(req.headers['x-trace-id'] ?? '').trim().toLowerCase();
  if (raw && TRACE_ID_RE.test(raw)) return raw;
  return IdGenerator.generate();
}

function jsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const MAX_BODY_SIZE = 10 * 1024 * 1024;
    let body = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      body += c;
    });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch {  resolve({}); } });
  });
}

function sendJson(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Trace-Id',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

const FRONTEND_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function getFrontendFiles(): Record<string, string> | null {
  return ((globalThis as Record<string, unknown>).__BRIAN_FRONTEND__ as Record<string, string>) || null;
}

function serveFrontend(res: http.ServerResponse, pathname: string): boolean {
  const files = getFrontendFiles();
  if (!files) return false;

  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  let b64 = files[rel];

  if (!b64) {
    b64 = files['index.html'];
    if (!b64) return false;
  }
  const ext = path.extname(rel);
  const mime = FRONTEND_MIME_TYPES[ext] || 'application/octet-stream';

  const cacheControl = rel === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable';
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cacheControl });
  res.end(Buffer.from(b64, 'base64'));
  return true;
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

      // —— 鉴权闸门：已设置密码时，除 auth 与 health 外的所有 /api 请求必须携带有效 Bearer token
      if (pathname.startsWith('/api/') && authState && !pathname.startsWith('/api/auth/') && pathname !== '/api/health') {
        if (!isRequestAuthenticated(req)) {
          sendJson(res, 401, { error: '未登录或登录已过期，请重新登录' });
          return;
        }
      }

      if (method === 'GET' && pathname === '/api/health') {
        let db = 'healthy';
        try {
          ctx.relationDb.queryRaw('SELECT 1');
        } catch {
          db = 'unhealthy';
        }
        const healthy = db === 'healthy';
        sendJson(res, healthy ? 200 : 503, {
          status: healthy ? 'ok' : 'unhealthy',
          version: '1.0.0',
          uptime: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
          db,
        });
        return;

      } else if (method === 'GET' && pathname === '/api/auth/status') {
        sendJson(res, 200, { has_password: !!authState, authenticated: isRequestAuthenticated(req) });

      } else if (method === 'POST' && pathname === '/api/auth/setup') {
        if (authState) { sendJson(res, 409, { error: '密码已设置，请直接登录' }); return; }
        const pw = String((body as Record<string, unknown>).password || '');
        if (pw.length < 4) { sendJson(res, 400, { error: '密码至少 4 位' }); return; }
        const salt = crypto.randomBytes(16).toString('hex');
        authState = { salt, hash: hashPassword(pw, salt) };
        fs.writeFileSync(AUTH_FILE, JSON.stringify(authState, null, 2));
        sendJson(res, 200, { token: issueAuthToken() });

      } else if (method === 'POST' && pathname === '/api/auth/login') {
        if (!authState) { sendJson(res, 400, { error: '尚未设置密码' }); return; }
        const pw = String((body as Record<string, unknown>).password || '');
        if (hashPassword(pw, authState.salt) !== authState.hash) {
          sendJson(res, 401, { error: '密码错误' });
          return;
        }
        sendJson(res, 200, { token: issueAuthToken() });

      } else if (method === 'POST' && pathname === '/api/auth/logout') {
        const token = bearerToken(req);
        if (token) authTokens.delete(token);
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/config') {
        const input: GetConfigDetailInput = Object.assign(new GetConfigDetailInput(), {});
        const output = new GetConfigDetailOutput();
        const context = new ConfigContext();
        await ctx.configAccess.soConfigDetail(input, output, context);
        sendJson(res, 200, { config: { layers: output.layers } });

      } else if (method === 'PUT' && pathname === '/api/config') {
        const input = Object.assign(new UpdateConfigInput(), body);

        if (body.config_key === 'vectordb_provider.default_distance_metric' && body.value !== undefined) {
          try {
            const count = await ctx.vectorDBAccess.soVectorCount();
            if (count > 0) {
              sendJson(res, 400, { error: `已存在 ${count} 条向量数据，写入数据后不支持更改距离度量方式。如需更改请先删除所有向量数据。` });
              return;
            }
          } catch {  }
        }
        const output = new UpdateConfigOutput();
        const context = new ConfigContext();
        await ctx.configAccess.updateConfig(input, output, context);
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/config/graph-visualization') {
        const graphType = params.get('graph_type') || 'tag';
        const i = Object.assign(new GraphVisualizationConfigInput(), { graph_type: graphType });
        const o = new GraphVisualizationConfigOutput();
        const c = new VisualizationContext();
        await ctx.visualizationAccess.soGraphVisualizationConfig(i, o, c);
        sendJson(res, 200, {
          graph_repulsion: o.graph_repulsion,
          graph_spring_strength: o.graph_spring_strength,
          graph_show_labels: o.graph_show_labels,
        });

      } else if (method === 'PUT' && pathname === '/api/config/graph-visualization') {
        const graphType = params.get('graph_type') || 'tag';
        const i = Object.assign(new ConfigVisualizationInput(), {
          graph_repulsion: body.graph_repulsion,
          graph_spring_strength: body.graph_spring_strength,
          graph_show_labels: body.graph_show_labels,
          graph_type: graphType,
        });
        const o = new ConfigVisualizationOutput();
        const c = new VisualizationContext();
        await ctx.visualizationAccess.configVisualization(i, o, c);
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname.startsWith('/api/config/item/')) {
        const configKey = pathname.split('/api/config/item/')[1];
        const input = Object.assign(new GetConfigItemInput(), { config_key: configKey });
        const output = new GetConfigItemOutput();
        const context = new ConfigContext();
        await ctx.configAccess.soConfigItem(input, output, context);
        sendJson(res, 200, { config_item: output.config_item });

      } else if (method === 'GET' && pathname === '/api/config/history') {
        const input = Object.assign(new GetConfigHistoryInput(), {
          start_time: params.get('start_time') ? Number(params.get('start_time')) : undefined,
          end_time: params.get('end_time') ? Number(params.get('end_time')) : undefined,
          limit: params.get('limit') ? Number(params.get('limit')) : undefined,
        });
        const output = new GetConfigHistoryOutput();
        const context = new ConfigContext();
        await ctx.configAccess.soConfigHistory(input, output, context);
        sendJson(res, 200, { records: output.records });

      } else if (method === 'GET' && pathname.startsWith('/api/config/history/')) {
        const configKey = decodeURIComponent(pathname.split('/api/config/history/')[1]);
        const input = Object.assign(new GetConfigHistoryInput(), {
          config_key: configKey,
          start_time: params.get('start_time') ? Number(params.get('start_time')) : undefined,
          end_time: params.get('end_time') ? Number(params.get('end_time')) : undefined,
          limit: params.get('limit') ? Number(params.get('limit')) : undefined,
        });
        const output = new GetConfigHistoryOutput();
        const context = new ConfigContext();
        await ctx.configAccess.soConfigHistory(input, output, context);
        sendJson(res, 200, { records: output.records });

      } else if (method === 'POST' && pathname === '/api/config/save-defaults') {
        const configTables = ctx.relationDb.queryRaw<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%_config' OR name='config_registry' OR name LIKE '%_privilege' OR name='config_config' OR name='orchestration_strategy' OR name='prompt_template')",
          [],
        );
        const data: Record<string, unknown[]> = {};
        for (const row of configTables || []) {
          try { data[row.name] = ctx.relationDb.queryRaw<Record<string, unknown>>(`SELECT * FROM "${row.name}"`, []) || []; } catch {  }
        }
        const now = Date.now();
        const existing = ctx.relationDb.queryRaw<{ id: string }>(
          'SELECT "id" FROM "config_snapshot" WHERE "name" = ? LIMIT 1', ['默认快照'],
        );
        if (existing.length > 0) {
          ctx.relationDb.executeRaw(
            'UPDATE "config_snapshot" SET "snapshot_data" = ?, "updated" = ? WHERE "name" = ?',
            [JSON.stringify(data), now, '默认快照'],
          );
        } else {
          ctx.relationDb.executeRaw(
            'INSERT INTO "config_snapshot" ("id", "created", "updated", "name", "snapshot_data") VALUES (?, ?, ?, ?, ?)',
            [IdGenerator.generate(), now, now, '默认快照', JSON.stringify(data)],
          );
        }
        sendJson(res, 200, { success: true });
        return;

      } else if (method === 'POST' && pathname === '/api/config/reset') {

        const configTables = ctx.relationDb.queryRaw<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%_config' OR name='config_registry' OR name LIKE '%_privilege' OR name='config_config' OR name='orchestration_strategy' OR name='prompt_template')",
          [],
        );
        const backup: Record<string, unknown[]> = {};
        for (const row of configTables || []) {
          try { backup[row.name] = ctx.relationDb.queryRaw<Record<string, unknown>>(`SELECT * FROM "${row.name}"`, []) || []; } catch {  }
        }
        const fs = await import('node:fs');
        const path = await import('node:path');
        const dataDir = path.resolve('./data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const backupPath = path.join(dataDir, 'config-backup.json');
        fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8');

        ctx.relationDb.executeRaw('DELETE FROM "config_registry"', []);
        ctx.relationDb.executeRaw('DELETE FROM "config_layer_privilege"', []);
        ctx.relationDb.executeRaw('DELETE FROM "config_module_privilege"', []);

        for (const row of configTables || []) {
          try { ctx.relationDb.executeRaw(`DELETE FROM "${row.name}"`, []); } catch {  }
        }

        const defaultSnapshot = ctx.relationDb.queryRaw<{ snapshot_data: string }>(
          'SELECT "snapshot_data" FROM "config_snapshot" WHERE "name" = ? LIMIT 1', ['默认快照'],
        )[0];
        let restored = 0;
        if (defaultSnapshot) {
          const defaultData = JSON.parse(defaultSnapshot.snapshot_data) as Record<string, Array<Record<string, unknown>>>;
          for (const [table, rows] of Object.entries(defaultData)) {
            if (!rows || rows.length === 0) continue;
            const cols = Object.keys(rows[0]);
            const placeholders = cols.map(() => '?').join(', ');
            const sql = `INSERT INTO "${table}" ("${cols.join('", "')}") VALUES (${placeholders})`;
            for (const r of rows) {
              try { ctx.relationDb.executeRaw(sql, cols.map((c) => r[c])); restored++; } catch {  }
            }
          }
        }
        sendJson(res, 200, { success: true, registered: ALL_CONFIG_REGISTRATIONS.length, restored, backup: backupPath });
        return;

      } else if (method === 'POST' && pathname === '/api/config/snapshot') {
        const now = Date.now();
        const name = (body as Record<string, unknown>).name as string || '';
        const snapshotName = name || new Date(now).toLocaleString('zh-CN', { hour12: false });
        const configTables = ctx.relationDb.queryRaw<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%_config' OR name='config_registry' OR name LIKE '%_privilege' OR name='config_config' OR name='orchestration_strategy' OR name='prompt_template')",
          [],
        );
        const snapshotData: Record<string, unknown[]> = {};
        for (const row of configTables || []) {
          try {
            const data = ctx.relationDb.queryRaw<Record<string, unknown>>(`SELECT * FROM "${row.name}"`, []);
            snapshotData[row.name] = data || [];
          } catch {  }
        }
        const id = IdGenerator.generate();
        ctx.relationDb.executeRaw(
          'INSERT INTO config_snapshot (id, created, updated, name, snapshot_data) VALUES (?, ?, ?, ?, ?)',
          [id, now, now, snapshotName, JSON.stringify(snapshotData)],
        );
        sendJson(res, 200, { id, name: snapshotName, created: now });

      } else if (method === 'GET' && pathname === '/api/config/snapshot') {
        const rows = ctx.relationDb.queryRaw<{ id: string; created: number; name: string }>(
          'SELECT id, created, name FROM config_snapshot ORDER BY created DESC', [],
        );
        sendJson(res, 200, { list: rows || [] });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/snapshot/')) {
        const snapshotId = pathname.split('/api/config/snapshot/')[1];
        ctx.relationDb.executeRaw('DELETE FROM config_snapshot WHERE id = ?', [snapshotId]);
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && /^\/api\/config\/snapshot\/[^/]+\/name$/.test(pathname)) {
        const snapshotId = pathname.split('/api/config/snapshot/')[1].split('/name')[0];
        const newName = String((body as Record<string, unknown>).name || '').trim();
        if (!newName) { sendJson(res, 400, { error: '快照名称不能为空' }); return; }
        const result = ctx.relationDb.executeRaw(
          'UPDATE config_snapshot SET "name" = ?, "updated" = ? WHERE "id" = ?', [newName, Date.now(), snapshotId],
        );
        const affected = typeof result === 'object' && result !== null && 'changes' in (result as Record<string, unknown>)
          ? Number((result as Record<string, unknown>).changes)
          : 1;
        if (!affected) { sendJson(res, 404, { error: '快照不存在' }); return; }
        sendJson(res, 200, { success: true, id: snapshotId, name: newName });

      } else if (method === 'POST' && /\/api\/config\/snapshot\/[^/]+\/restore$/.test(pathname)) {
        const snapshotId = pathname.split('/api/config/snapshot/')[1].split('/restore')[0];
        const row = ctx.relationDb.queryRaw<{ snapshot_data: string }>(
          'SELECT snapshot_data FROM config_snapshot WHERE id = ?', [snapshotId],
        )[0];
        if (!row) { sendJson(res, 404, { error: '快照不存在' }); return; }
        const data: Record<string, unknown[]> = JSON.parse(row.snapshot_data);

        const configTables = ctx.relationDb.queryRaw<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%_config' OR name='config_registry' OR name LIKE '%_privilege' OR name='config_config' OR name='orchestration_strategy' OR name='prompt_template')",
          [],
        );
        for (const t of configTables || []) {
          try { ctx.relationDb.executeRaw(`DELETE FROM "${t.name}"`, []); } catch {  }
        }

        for (const [table, rows] of Object.entries(data as Record<string, Array<Record<string, unknown>>>)) {
          if (!rows || rows.length === 0) continue;
          const cols = Object.keys(rows[0]);
          const placeholders = cols.map(() => '?').join(', ');
          const sql = `INSERT INTO "${table}" ("${cols.join('", "')}") VALUES (${placeholders})`;
          for (const r of rows) {
            try { ctx.relationDb.executeRaw(sql, cols.map(c => r[c])); } catch {  }
          }
        }
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && pathname === '/api/config/model') {
        const d = (body || {}) as Record<string, unknown>;
        const title = String(d.llm_title || '').trim();
        const providerId = String(d.provider_id || d.llm_provider_id || '').trim();
        if (!title) { sendJson(res, 400, { error: '模型名称不能为空' }); return; }
        if (!providerId) { sendJson(res, 400, { error: '所属 Provider 不能为空' }); return; }
        const dup = ctx.relationDb.queryRaw<{ id: string }>(
          'SELECT "id" FROM "llm_available" WHERE "llm_provider_id" = ? AND "llm_title" = ? LIMIT 1', [providerId, title],
        );
        if (dup && dup.length > 0) { sendJson(res, 409, { error: `模型已存在: ${title}` }); return; }
        const now = IdGenerator.now();
        try {
          ctx.relationDb.executeRaw(
            'INSERT INTO "llm_available" ("id", "created", "updated", "llm_provider_id", "llm_title", "llm_type", "llm_brief", "model_usage", "max_tokens", "enable", "is_default") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
            [IdGenerator.generate(), now, now, providerId, title, String(d.llm_type || 'text'), String(d.llm_brief || ''), String(d.model_usage || ''), Number(d.maxTokens ?? d.max_tokens) || 0, d.enable === false ? 0 : 1],
          );
          sendJson(res, 200, { success: true });
        } catch (e: unknown) {
          sendJson(res, 400, { error: (e as Error).message || '创建模型失败' });
        }

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
          maxTokens: r.max_tokens || 0,
          supportsVision: false,
          supportsTools: true,
          isDefault: !!r.is_default,
          enable: !!r.enable,
          llm_brief: r.llm_brief || '',
          model_usage: r.model_usage || '',
        }));
        sendJson(res, 200, models);

      } else if (method === 'GET' && pathname.startsWith('/api/config/model/') && !pathname.includes('/test') && !pathname.includes('/default')) {
        const id = pathname.split('/api/config/model/')[1].split('/')[0];
        const row = ctx.relationDb.queryRaw<{ id: string; llm_title: string; llm_provider_id: string; enable: number }>(
          'SELECT "id", "llm_title", "llm_provider_id", "enable" FROM "llm_available" WHERE "id" = ?', [id],
        )[0];
        sendJson(res, 200, row ? { id: row.id, modelName: row.llm_title, providerId: row.llm_provider_id, enable: !!row.enable } : { id, name: 'unknown' });

      } else if (method === 'POST' && /\/api\/config\/model\/[^/]+\/test$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        const modelInput = Object.assign(new GetLLMInput(), { id });
        const modelOutput = new GetLLMOutput();
        const modelCtx = new LLMContext();
        await ctx.configAccess.soLLMById(modelInput, modelOutput, modelCtx);
        const model = modelOutput.llm as Record<string, unknown> | null;
        const providerId = (model?.llm_provider_id as string) || '';
        if (providerId) {
          const testInput = Object.assign(new TestLLMProviderInput(), { id: providerId });
          const testOutput = new TestLLMProviderOutput();
          const testCtx = new LLMContext();
          await ctx.configAccess.testLLMProvider(testInput, testOutput, testCtx);
          sendJson(res, 200, {
            success: testOutput.connected !== false,
            latency: testOutput.response_time_ms,
            status_code: testOutput.status_code,
            message: testOutput.connected !== false ? 'Connected' : (testOutput.error || 'Connection failed'),
          });
        } else {
          sendJson(res, 200, { success: false, latency: 0, message: 'Model has no provider' });
        }

      } else if (method === 'POST' && /\/api\/config\/model\/[^/]+\/chat$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        if (!prompt) { sendJson(res, 400, { error: 'prompt is required' }); return; }
        try {
          const { ExecLLMInput, ExecLLMOutput, LLMContext } = await import('./Base/LLMProvider/domain/types');
          const execInput = Object.assign(new ExecLLMInput(), {
            id,
            prompt,
            temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,

            max_tokens: typeof body.max_tokens === 'number' && body.max_tokens > 0 ? body.max_tokens : 2048,

            no_fallback: true,
            caller: 'dev-server.modelChatTest',
          });
          const execOutput = new ExecLLMOutput();
          await ctx.llmAccess.execLLM(execInput, execOutput, new LLMContext());
          sendJson(res, 200, {
            result: execOutput.result ?? '',
            raw_response: execOutput.raw_response ?? '',
            input_tokens: execOutput.input_tokens ?? 0,
            output_tokens: execOutput.output_tokens ?? 0,
            duration_ms: execOutput.duration_ms ?? 0,
            error: execOutput.error || '',
          });
        } catch (err: any) {
          sendJson(res, 500, { error: err?.message || '模型调用失败' });
        }

      } else if (method === 'POST' && /\/api\/config\/model\/[^/]+\/embed$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        const input = typeof body.input === 'string' ? body.input.trim() : '';
        if (!input) { sendJson(res, 400, { error: 'input is required' }); return; }
        try {
          const { EmbedLLMInput, EmbedLLMOutput, LLMContext } = await import('./Base/LLMProvider/domain/types');
          const embedInput = Object.assign(new EmbedLLMInput(), { id, input, caller: 'dev-server.modelEmbedTest' });
          const embedOutput = new EmbedLLMOutput();
          await ctx.llmAccess.embedLLM(embedInput, embedOutput, new LLMContext());
          sendJson(res, 200, {
            embedding: embedOutput.embedding ?? [],
            dimension: (embedOutput.embedding ?? []).length,
            raw_response: embedOutput.raw_response ?? '',
            input_tokens: embedOutput.input_tokens ?? 0,
            duration_ms: embedOutput.duration_ms ?? 0,
            error: embedOutput.error || '',
          });
        } catch (err: any) {
          sendJson(res, 500, { error: err?.message || '向量化调用失败' });
        }

      } else if (method === 'POST' && /\/api\/config\/model\/[^/]+\/autofill$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        try {
          const genInput = Object.assign(new GenLLMAttrInput(), { id });
          const genOutput = new GenLLMAttrOutput();
          await ctx.llmAccess.genLLMAttr(genInput, genOutput, new LLMContext());
          sendJson(res, 200, {
            llm_brief: genOutput.llm_brief ?? '',
            model_usage: genOutput.model_usage ?? '',
            error: genOutput.error || '',
          });
        } catch (err: any) {
          sendJson(res, 500, { error: err?.message || '一键补全模型属性失败' });
        }

      } else if (method === 'POST' && /\/api\/config\/model\/[^/]+\/default$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        ctx.relationDb.executeRaw('UPDATE "llm_available" SET "is_default" = 0', []);
        ctx.relationDb.executeRaw('UPDATE "llm_available" SET "is_default" = 1 WHERE "id" = ?', [id]);
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && pathname.startsWith('/api/config/model/') && !/\/default$/.test(pathname)) {
        const id = pathname.split('/api/config/model/')[1];
        const data = ((body as Record<string, unknown>).data || body) as Record<string, unknown>;

        const sets: string[] = [];
        const vals: unknown[] = [];
        const push = (col: string, v: unknown) => { sets.push(`"${col}" = ?`); vals.push(v); };
        if (data.llm_title !== undefined) push('llm_title', String(data.llm_title));
        if (data.llm_type !== undefined) push('llm_type', String(data.llm_type));
        if (data.llm_brief !== undefined) push('llm_brief', String(data.llm_brief));
        if (data.model_usage !== undefined) push('model_usage', String(data.model_usage));
        if (data.maxTokens !== undefined || data.max_tokens !== undefined) push('max_tokens', Number(data.maxTokens ?? data.max_tokens) || 0);
        if (data.provider_id !== undefined) push('llm_provider_id', String(data.provider_id));
        if (data.enable !== undefined || data.enabled !== undefined) push('enable', (data.enable ?? data.enabled) ? 1 : 0);
        if (sets.length > 0) {
          try {
            ctx.relationDb.executeRaw(`UPDATE "llm_available" SET ${sets.join(', ')} WHERE "id" = ?`, [...vals, id]);
          } catch {}
        }
        sendJson(res, 200, { success: true, id });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/model/')) {
        const id = pathname.split('/api/config/model/')[1];
        try { ctx.relationDb.executeRaw('DELETE FROM "llm_available" WHERE "id" = ?', [id]); } catch {}
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/config/provider') {
        const input = Object.assign(new SoLLMProviderInput(), {});
        const output = new SoLLMProviderOutput();
        const context = new LLMContext();
        await ctx.configAccess.soLLMProvider(input, output, context);
        sendJson(res, 200, output.list || []);

      } else if (method === 'POST' && pathname === '/api/config/provider') {
        const input = Object.assign(new AddLLMProviderInput(), body);
        const output = new AddLLMProviderOutput();
        const context = new LLMContext();
        await ctx.configAccess.addLLMProvider(input, output, context);
        sendJson(res, 200, { id: output.id, name: body.llm_provider_title || 'new-provider' });

      } else if (method === 'PUT' && pathname.startsWith('/api/config/provider/')) {
        const id = pathname.split('/api/config/provider/')[1];
        const input = Object.assign(new UpdateLLMProviderInput(), { ...body, provider_id: id });
        const output = new UpdateLLMProviderOutput();
        const context = new LLMContext();
        await ctx.configAccess.updateLLMProvider(input, output, context);
        sendJson(res, 200, { success: true });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/provider/')) {
        const id = pathname.split('/api/config/provider/')[1];
        const input = Object.assign(new DelLLMProviderInput(), { ids: [id] });
        const output = new DelLLMProviderOutput();
        const context = new LLMContext();
        await ctx.configAccess.delLLMProvider(input, output, context);
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && /\/api\/config\/provider\/[^/]+\/fetch-models$/.test(pathname)) {
        const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0] || '';
        const fetchInput = Object.assign(new ListLLMInput(), { llm_provider_id: id, force: true });
        const fetchOutput = new ListLLMOutput();
        const fetchCtx = new LLMContext();
        const ok = await ctx.configAccess.listLLM(fetchInput, fetchOutput, fetchCtx);
        const models = (fetchOutput.list || []).map((m: LLMCacheRecord) => ({
          id: m.llm_title || m.id,
          name: m.llm_title,
          brief: m.llm_brief || '',
          features: m.llm_param ? (() => { try { return JSON.parse(m.llm_param); } catch {  return {}; } })() : {},
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
        const rows = ctx.relationDb.queryRaw<{ llm_title: string; llm_brief: string | null; features: string | null; llm_param: string | null }>(
          'SELECT "llm_title", "llm_brief", "features", "llm_param" FROM "llm_cache" WHERE "llm_provider_id" = ? ORDER BY "llm_title" ASC', [id],
        );
        const enabledRows = ctx.relationDb.queryRaw<{ llm_title: string }>(
          'SELECT "llm_title" FROM "llm_available" WHERE "llm_provider_id" = ?', [id],
        );
        const enabledSet = new Set((enabledRows || []).map(r => r.llm_title));
        const models = (rows || []).map(r => {
          const featureSrc = r.features || r.llm_param || '';
          let parsed: unknown = {};
          try { parsed = featureSrc ? JSON.parse(featureSrc) : {}; } catch { parsed = {}; }
          const featureObj = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            ? ((parsed as Record<string, unknown>).features && typeof (parsed as Record<string, unknown>).features === 'object'
                ? (parsed as Record<string, unknown>).features
                : parsed)
            : {};
          return {
            id: r.llm_title,
            name: r.llm_title,
            brief: r.llm_brief || '',
            features: featureObj,
            enabled: enabledSet.has(r.llm_title),
          };
        });
        sendJson(res, 200, { models });

      } else if (method === 'POST' && /\/api\/config\/provider\/[^/]+\/models\/add$/.test(pathname)) {
        const providerId = pathname.split('/api/config/provider/')[1]?.split('/')[0] || '';
        const modelIds = (body as Record<string, unknown>).modelIds as string[] || [];
        const llmType = (['text', 'vision', 'embedding'] as const).includes((body as Record<string, unknown>).llm_type as any)
          ? (body as Record<string, unknown>).llm_type as string
          : 'text';
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
              [IdGenerator.generate(), IdGenerator.now(), IdGenerator.now(), providerId, title, llmType, 1, maxTokens],
            );
            if (maxTokens > 0) {
              try { ctx.relationDb.executeRaw('UPDATE "llm_available" SET "max_tokens" = ? WHERE "llm_provider_id" = ? AND "llm_title" = ?', [maxTokens, providerId, title]); } catch {  }
            }
            added++;
          } catch (err) {
            fileLogger.warn('[dev-server] POST /api/config/provider/:id/fetch-models 模型写入失败（容忍：跳过该模型）', err instanceof Error ? err.message : String(err));
          }
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
          const resp = await httpReq({
            url,
            method: 'POST',
            headers,
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }),
            timeoutMs: 15000,
          });
          const text = resp.bodyText;
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
        await ctx.configAccess.testLLMProvider(testInput, testOutput, testCtx);
        sendJson(res, 200, {
          success: testOutput.connected !== false,
          latency: testOutput.response_time_ms,
          status_code: testOutput.status_code,
          message: testOutput.connected !== false ? 'Connected' : (testOutput.error || 'Connection failed'),
        });

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

      } else if (method === 'GET' && pathname === '/api/config/soul') {
        const input = Object.assign(new SoSoulInput(), {});
        const output = new SoSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.soSoul(input, output, context);
        sendJson(res, 200, output.list || []);

      } else if (method === 'POST' && pathname === '/api/config/soul') {
        const input = Object.assign(new AddSoulInput(), { data: body });
        const output = new AddSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.addSoul(input, output, context);
        sendJson(res, 200, { id: output.id, soul_brief: body.soul_brief || 'new-soul' });

      } else if (method === 'PUT' && pathname.startsWith('/api/config/soul/')) {
        const id = pathname.split('/api/config/soul/')[1];
        const input = Object.assign(new UpdateSoulInput(), { id, data: body });
        const output = new UpdateSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.updateSoul(input, output, context);
        sendJson(res, 200, { success: true });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/soul/')) {
        const id = pathname.split('/api/config/soul/')[1];
        const input = Object.assign(new DelSoulInput(), { ids: [id] });
        const output = new DelSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.delSoul(input, output, context);
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/config/mcp') {
        const provInput = Object.assign(new SoMcpProviderInput(), {});
        const provOutput = new SoMcpProviderOutput();
        const provContext = new McpContext();
        await ctx.configAccess.soMcpProvider(provInput, provOutput, provContext);
        const providers = provOutput.list || [];
        if (providers.length === 0) {
          sendJson(res, 200, []);
        } else {
          const input = Object.assign(new ListMcpInput(), { mcp_provider_id: providers[0].id });
          const output = new ListMcpOutput();
          const context = new McpContext();
          await ctx.configAccess.listMcp(input, output, context);
          sendJson(res, 200, output.list || []);
        }

      } else if (method === 'GET' && pathname === '/api/config/mcp/market') {
        const rows = ctx.relationDb.queryRaw<{ id: string; provider_code: string | null; mcp_provider_title: string; mcp_provider_url: string; mcp_provider_brief: string | null; enable: number }>(
          'SELECT "id", "provider_code", "mcp_provider_title", "mcp_provider_url", "mcp_provider_brief", "enable" FROM "mcp_provider" ORDER BY "mcp_provider_title" ASC',
          [],
        );
        sendJson(res, 200, (rows || []).map(r => ({
          id: r.id,
          provider_code: r.provider_code || '',
          mcp_provider_title: r.mcp_provider_title,
          mcp_provider_url: r.mcp_provider_url,
          mcp_provider_brief: r.mcp_provider_brief || '',
          enable: !!r.enable,
        })));

      } else if (method === 'POST' && pathname === '/api/config/mcp/provider') {
        const input = Object.assign(new AddMcpProviderInput(), { data: body });
        const output = new AddMcpProviderOutput();
        await ctx.configAccess.addMcpProvider(input, output, new McpContext());
        sendJson(res, 201, { id: output.id });

      } else if (method === 'PUT' && /^\/api\/config\/mcp\/provider\/[^/]+$/.test(pathname)) {
        const id = pathname.split('/api/config/mcp/provider/')[1];
        const input = Object.assign(new UpdateMcpProviderInput(), { id, data: body.data || body });
        const output = new UpdateMcpProviderOutput();
        await ctx.configAccess.updateMcpProvider(input, output, new McpContext());
        sendJson(res, 200, { success: true });

      } else if (method === 'DELETE' && /^\/api\/config\/mcp\/provider\/[^/]+$/.test(pathname)) {
        const id = pathname.split('/api/config/mcp/provider/')[1];
        const input = Object.assign(new DelMcpProviderInput(), { ids: [id] });
        const output = new DelMcpProviderOutput();
        await ctx.configAccess.delMcpProvider(input, output, new McpContext());
        sendJson(res, 200, { success: true, affected_rows: output.affected_rows });

      } else if (method === 'POST' && /\/api\/config\/mcp\/provider\/[^/]+\/test$/.test(pathname)) {
        const provId = pathname.split('/api/config/mcp/provider/')[1].split('/test')[0];
        let ok = false;
        let statusMsg = '';
        let latency = 0;
        try {
          const start = Date.now();
          if (provId === 'github') {
            const r = await httpReq({ url: 'https://registry.npmjs.org/-/v1/search?text=keywords:mcp&size=1' });
            latency = Date.now() - start;
            ok = r.ok;
            statusMsg = ok ? 'npm registry 可达' : `HTTP ${r.status}`;
          } else if (provId === 'smithery') {
            const r = await httpReq({ url: 'https://api.smithery.ai/servers?pageSize=1' });
            latency = Date.now() - start;
            ok = r.ok;
            statusMsg = ok ? 'Smithery API 可达' : `HTTP ${r.status}`;
          } else if (provId === 'aliyun_bailian') {
            await httpReq({ url: 'https://dashscope.aliyuncs.com', timeoutMs: 5000 });
            latency = Date.now() - start;
            ok = true;
            statusMsg = 'DashScope API 可达';
          } else if (provId === 'modelscope') {
            const r = await httpReq({ url: 'https://modelscope.cn', timeoutMs: 5000 });
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

      } else if (method === 'POST' && /\/api\/config\/mcp\/provider\/[^/]+\/list$/.test(pathname)) {
        const provId = pathname.split('/api/config/mcp/provider/')[1].split('/list')[0];
        const q = (body as Record<string, unknown>).keyword as string || '';
        const page = Number((body as Record<string, unknown>).page) || 1;
        const pageSize = Number((body as Record<string, unknown>).pageSize) || 50;
        let tools: { id: string; title: string; brief: string; install_cmd?: string; installed?: boolean }[] = [];

        try {
          if (provId === 'github') {
            const searchTerm = q ? `keywords:mcp+${encodeURIComponent(q)}` : 'keywords:mcp+server';
            const npmRes = await httpReq({ url: `https://registry.npmjs.org/-/v1/search?text=${searchTerm}&size=${pageSize}&from=${(page - 1) * pageSize}` });
            if (!npmRes.ok) throw new Error(`npm 请求失败 HTTP ${npmRes.status}`);
            const data = JSON.parse(npmRes.bodyText) as { objects: Array<{ package: { name: string; description: string; version: string; links?: { npm?: string } } }>; total: number };
            tools = (data.objects || []).map(obj => ({
              id: obj.package.name,
              title: obj.package.name,
              brief: obj.package.description || '',
              install_cmd: `npx ${obj.package.name}`,
              installed: false,
            }));

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
            const smRes = await httpReq({ url: `https://api.smithery.ai/servers?${params.toString()}` });
            if (!smRes.ok) throw new Error(`Smithery 请求失败 HTTP ${smRes.status}`);
            const data = JSON.parse(smRes.bodyText) as { servers: Array<{ id: string; qualifiedName: string; displayName: string; description: string; remote?: boolean }>; pagination: { totalCount: number } };
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

      } else if (method === 'POST' && /\/api\/config\/mcp\/install$/.test(pathname)) {
        const provId = (body as Record<string, unknown>).mcp_provider_id as string || '';
        const toolId = (body as Record<string, unknown>).mcp_id as string || (body as Record<string, unknown>).tool_id as string || '';
        if (!provId || !toolId) { sendJson(res, 400, { error: '缺少 mcp_provider_id 或 mcp_id' }); return; }
        try {

          if (provId === 'github') {
            const pkgRes = await httpReq({ url: `https://registry.npmjs.org/${toolId}/latest` });
            if (!pkgRes.ok) { sendJson(res, 400, { error: `npm 包 ${toolId} 不存在` }); return; }
            const pkg = JSON.parse(pkgRes.bodyText) as { name: string; description: string; bin?: Record<string, string>; version?: string };

            const dup = ctx.relationDb.queryRaw<{ id: string }>(
              'SELECT "id" FROM "mcp_install" WHERE "mcp_provider_id"=? AND "mcp_title"=?',
              [provId, toolId],
            )[0];
            if (dup) { sendJson(res, 409, { error: `MCP 已安装：${toolId}` }); return; }
            const installCmd = `npm install -g ${toolId}`;
            const startCmd = `npx ${toolId}`;
            const stopCmd = `pkill -f ${toolId}`;
            const uninstallCmd = `npm uninstall -g ${toolId}`;
            let installError = '';
            try {
              execSync(installCmd, { timeout: 120000, stdio: 'pipe' });
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              installError = msg.split('\n').slice(-3).join(' ').trim() || 'npm install 执行失败';
            }
            if (installError) {
              sendJson(res, 500, { error: `npm 安装失败: ${installError}` });
              return;
            }
            const id = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const now = Date.now();
            ctx.relationDb.executeRaw(
              `INSERT INTO "mcp_install" ("id","created","updated","mcp_provider_id","mcp_title","mcp_brief","mcp_install_cmd","mcp_start_cmd","mcp_stop_cmd","mcp_uninstall_cmd","version","status","enable") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [id, now, now, provId, toolId, pkg.description || '', installCmd, startCmd, stopCmd, uninstallCmd, pkg.version || '', 'stopped', 1],
            );

            await ctx.mcpAccess.syncInstallStatus();
            sendJson(res, 200, { success: true, id });

          } else if (provId === 'smithery') {
            const dup = ctx.relationDb.queryRaw<{ id: string }>(
              'SELECT "id" FROM "mcp_install" WHERE "mcp_provider_id"=? AND "mcp_title"=?',
              [provId, toolId],
            )[0];
            if (dup) { sendJson(res, 409, { error: `MCP 已安装：${toolId}` }); return; }
            const id = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const now = Date.now();
            ctx.relationDb.executeRaw(
              `INSERT INTO "mcp_install" ("id","created","updated","mcp_provider_id","mcp_title","mcp_brief","mcp_install_cmd","mcp_start_cmd","mcp_stop_cmd","mcp_uninstall_cmd","status","enable") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
              [id, now, now, provId, toolId, 'Smithery MCP server', 'smithery connect', 'smithery start', 'smithery stop', 'smithery disconnect', 'stopped', 1],
            );
            sendJson(res, 200, { success: true, id, warning: 'Smithery MCP 已注册为连接模式（未执行本地安装），需本机具备 smithery CLI 方可启动' });

          } else {

            const installIn = Object.assign(new InstallMcpInput(), { mcp_provider_id: provId, mcp_id: toolId });
            const installOut = new InstallMcpOutput();
            await ctx.configAccess.installMcp(installIn, installOut, new McpContext());
            sendJson(res, 200, { success: true, id: installOut.id });
          }
        } catch (e: unknown) {
          sendJson(res, 500, { error: (e as Error).message || '安装失败' });
        }

      } else if (method === 'POST' && /\/api\/config\/mcp\/start$/.test(pathname)) {
        const startIn = Object.assign(new StartMcpInput(), { id: (body as Record<string, unknown>).id || '' });
        await ctx.configAccess.startMcp(startIn, new StartMcpOutput(), new McpContext());
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && /\/api\/config\/mcp\/stop$/.test(pathname)) {
        const stopIn = Object.assign(new StopMcpInput(), { id: (body as Record<string, unknown>).id || '' });
        await ctx.configAccess.stopMcp(stopIn, new StopMcpOutput(), new McpContext());
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && /\/api\/config\/mcp\/uninstall$/.test(pathname)) {
        const unInput = Object.assign(new UninstallMcpInput(), { id: (body as Record<string, unknown>).id || '' });
        const unOutput = new UninstallMcpOutput();
        await ctx.configAccess.uninstallMcp(unInput, unOutput, new McpContext());
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/agent') {
        const input = Object.assign(new GetAgentInput(), {});
        const output = new GetAgentOutput();
        const context = new AgentLibraryContext();
        await ctx.agentLibrary.soAgent(input, output, context);
        sendJson(res, 200, { agents: output.agents || [] });

      } else if (method === 'GET' && pathname.startsWith('/api/agent/') && !pathname.startsWith('/api/agent/strategy') && !/\/toggle$/.test(pathname)) {
        const id = decodeURIComponent(pathname.split('/api/agent/')[1]);
        const getOut = new GetAgentOutput();
        await ctx.agentLibrary.soAgent(
          Object.assign(new GetAgentInput(), { conditions: [{ field: 'id', operator: Operator.EQ, value: id }] }),
          getOut, new AgentLibraryContext(),
        );
        const agent = (getOut.agents || [])[0];
        if (!agent) { sendJson(res, 404, { error: `Agent 不存在: ${id}` }); return; }
        sendJson(res, 200, agent);

      } else if (method === 'GET' && pathname === '/api/agent/strategy') {
        const input = Object.assign(new SoStrategyInput(), {});
        const output = new SoStrategyOutput();
        const context = new AgentStrategyContext();
        await ctx.agentStrategy.soStrategy(input, output, context);
        sendJson(res, 200, { strategies: output.strategies || [] });

      } else if (method === 'POST' && /\/api\/agent\/strategy\/[^/]+\/toggle$/.test(pathname)) {
        const strategyId = pathname.split('/api/agent/strategy/')[1].split('/toggle')[0];
        const input = Object.assign(new ToggleStrategyInput(), { strategy_id: strategyId });
        const output = new ToggleStrategyOutput();
        const context = new AgentStrategyContext();
        await ctx.agentStrategy.toggleStrategy(input, output, context);
        sendJson(res, 200, { success: true, enable: output.enable });

      } else if (method === 'POST' && pathname === '/api/agent') {
        const b = (body || {}) as Record<string, unknown>;
        const agentType = String(b.agent_type || 'WORKER').toUpperCase();
        if (!(VALID_AGENT_TYPES as readonly string[]).includes(agentType)) {
          sendJson(res, 400, { error: `invalid agent_type: ${agentType}` });
          return;
        }
        const agentId = IdGenerator.generate();
        let strategyId = String(b.strategy_id || '');
        if (!strategyId) {
          try {
            const cfg = ctx.relationDb.queryRaw<{ default_strategy_id: string }>(
              'SELECT "default_strategy_id" FROM "agent_strategy_config" LIMIT 1', [],
            );
            strategyId = cfg?.[0]?.default_strategy_id || '';
          } catch {  strategyId = ''; }
        }
        if (!strategyId) {
          const fallback = ctx.relationDb.queryRaw<{ strategy_id: string }>(
            'SELECT "strategy_id" FROM "agent_strategy" WHERE "enable" = 1 ORDER BY "suitable_complexity_min" ASC LIMIT 1', [],
          );
          strategyId = fallback?.[0]?.strategy_id || '';
        }
        const addIn = Object.assign(new AddAgentInput(), {
          agent_id: agentId,
          agent_type: agentType,
          strategy_id: strategyId,
          soul_id: String(b.soul_id || ''),
          task_signature: String(b.task_signature || `[${String(b.agent_name || 'custom').toLowerCase()}] 自定义任务`),
          agent_name: String(b.agent_name || `Agent-${agentId.slice(0, 8)}`),
          agent_purpose: String(b.agent_purpose || b.description || ''),

          created_by: 'user',
        });
        try {
          const addOut = new AddAgentOutput();
          const ok = await ctx.agentLibrary.addAgent(addIn, addOut, new AgentLibraryContext());
          if (!ok) throw new Error('addAgent failed');
          sendJson(res, 200, { id: agentId, agent_id: agentId, name: addIn.agent_name, success: true });
        } catch (e: unknown) {
          sendJson(res, 400, { error: (e as Error).message || '创建失败' });
        }

      } else if (method === 'POST' && /\/api\/agent\/[^/]+\/toggle$/.test(pathname)) {
        const id = pathname.split('/api/agent/')[1].split('/toggle')[0];
        const input = Object.assign(new ToggleAgentInput(), { id });
        const output = new ToggleAgentOutput();
        const context = new AgentLibraryContext();
        await ctx.agentLibrary.toggleAgent(input, output, context);
        sendJson(res, 200, { success: true, enable: output.enable });

      } else if (method === 'PUT' && pathname.startsWith('/api/agent/')) {
        const id = pathname.split('/api/agent/')[1];
        const b = (body || {}) as Record<string, unknown>;
        try {
          const row = ctx.relationDb.queryRaw<{ agent_id: string }>(
            'SELECT "agent_id" FROM "agent" WHERE "id" = ? LIMIT 1', [id],
          )[0];
          if (!row) {
            sendJson(res, 404, { error: `Agent 不存在: ${id}` });
            return;
          }
          const updIn = Object.assign(new UpdateAgentInput(), { agent_id: row.agent_id });
          if (b.agent_name !== undefined) updIn.agent_name = String(b.agent_name);
          if (b.description !== undefined || b.agent_purpose !== undefined) {
            updIn.agent_purpose = String(b.agent_purpose ?? b.description);
          }
          if (b.task_signature !== undefined) updIn.task_signature = String(b.task_signature);
          if (b.strategy_id !== undefined) updIn.strategy_id = String(b.strategy_id);
          if (b.soul_id !== undefined) updIn.soul_id = String(b.soul_id);
          await ctx.agentLibrary.updateAgent(updIn, new UpdateAgentOutput(), new AgentLibraryContext());
          sendJson(res, 200, { success: true });
        } catch (e: unknown) {
          sendJson(res, 400, { error: (e as Error).message || '更新失败' });
        }

      } else if (method === 'DELETE' && pathname.startsWith('/api/agent/')) {
        const id = pathname.split('/api/agent/')[1];
        const input = Object.assign(new DelAgentInput(), { ids: [id] });
        const output = new DelAgentOutput();
        const context = new AgentLibraryContext();
        await ctx.agentLibrary.delAgent(input, output, context);
        if (output.deleted_count === 0) {
          sendJson(res, 404, { error: `Agent 不存在或未删除: ${id}` });
        } else {
          sendJson(res, 200, { success: true, deleted_count: output.deleted_count });
        }

      } else if (method === 'GET' && pathname === '/api/skill') {
        const input = Object.assign(new SoSkillInput(), {});
        const output = new SoSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.soSkill(input, output, context);
        sendJson(res, 200, { skills: output.list || [] });

      } else if (method === 'POST' && pathname === '/api/skill') {
        const input = Object.assign(new AddSkillInput(), { data: body });
        const output = new AddSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.addSkill(input, output, context);
        sendJson(res, 200, { id: output.id, name: body.name || body.skill_brief || 'new-skill' });

      } else if (method === 'POST' && /\/api\/skill\/[^/]+\/exec$/.test(pathname)) {
        const id = pathname.split('/api/skill/')[1].split('/exec')[0];
        const input = Object.assign(new ExecSkillInput(), { id, params: (body as Record<string, unknown>).params || body });
        const output = new ExecSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.execSkill(input, output, context);
        sendJson(res, 200, { result: output.result });

      } else if (method === 'POST' && /\/api\/skill\/[^/]+\/toggle$/.test(pathname)) {
        const id = pathname.split('/api/skill/')[1].split('/toggle')[0];
        const currentRows = ctx.relationDb.queryRaw<{ enable: number }>(
          'SELECT "enable" FROM "skill" WHERE "id" = ? LIMIT 1', [id],
        );
        if (!currentRows || currentRows.length === 0) {
          sendJson(res, 404, { error: `Skill 不存在: ${id}` });
          return;
        }
        const nextEnable = Number(currentRows[0].enable ?? 1) === 0;
        const updIn = Object.assign(new UpdateSkillInput(), { id, data: { enable: nextEnable } });
        const updOut = new UpdateSkillOutput();
        const context = new SkillContext();
        try {
          await ctx.configAccess.updateSkill(updIn, updOut, context);
        } catch (e: unknown) {
          sendJson(res, 403, { error: (e as Error).message || 'Skill 不允许修改' });
          return;
        }
        sendJson(res, 200, { success: true, enable: nextEnable });

      } else if (method === 'GET' && /\/api\/skill\/[^/]+$/.test(pathname)) {
        const id = pathname.split('/api/skill/')[1];
        const soOut = new SoSkillOutput();
        await ctx.configAccess.soSkill(Object.assign(new SoSkillInput(), {}), soOut, new SkillContext());
        const skill = (soOut.list || []).find((s: { id?: string }) => String(s?.id) === id);
        if (!skill) {
          sendJson(res, 404, { error: `Skill 不存在: ${id}` });
          return;
        }
        sendJson(res, 200, skill);

      } else if (method === 'PUT' && /\/api\/skill\/[^/]+$/.test(pathname)) {
        const id = pathname.split('/api/skill/')[1];
        const input = Object.assign(new UpdateSkillInput(), { id, data: body });
        const output = new UpdateSkillOutput();
        const context = new SkillContext();
        try {
          await ctx.configAccess.updateSkill(input, output, context);
        } catch (e: unknown) {

          sendJson(res, 403, { error: (e as Error).message || 'Skill 不允许修改' });
          return;
        }
        sendJson(res, 200, { success: true, affected_rows: output.affected_rows });

      } else if (method === 'DELETE' && pathname.startsWith('/api/skill/')) {
        const id = pathname.split('/api/skill/')[1];
        const input = Object.assign(new DelSkillInput(), { ids: [id] });
        const output = new DelSkillOutput();
        const context = new SkillContext();
        try {
          await ctx.configAccess.delSkill(input, output, context);
        } catch (e: unknown) {

          sendJson(res, 403, { error: (e as Error).message || 'Skill 不允许删除' });
          return;
        }
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/mcp') {

        const soIn = new SoMcpInput();
        const soOut = new SoMcpOutput();
        await ctx.mcpAccess.soMcp(soIn, soOut, new McpContext());
        sendJson(res, 200, { installed: (soOut.list || []).map(r => ({
          id: r.id,
          displayName: r.mcp_title,
          description: r.mcp_brief || '',
          version: r.version || '',
          status: r.status || 'stopped',
          running: String(r.status) === 'running',
          enabled: !!r.enable,
          transport_type: (r as unknown as Record<string, unknown>).transport_type || 'stdio',
        })) });

      } else if (method === 'POST' && pathname === '/api/mcp/batch-start') {
        const ids = ((body as Record<string, unknown>).ids as string[]) || [];
        const input = Object.assign(new StartMcpsInput(), { ids });
        const output = new StartMcpsOutput();
        await ctx.mcpAccess.startMcps(input, output, new McpContext());
        sendJson(res, 200, { success: true, started_count: output.started_count });

      } else if (method === 'POST' && pathname === '/api/mcp/refresh') {
        const input = new RefreshMcpStatusInput();
        const output = new RefreshMcpStatusOutput();
        await ctx.mcpAccess.refreshMcpStatus(input, output, new McpContext());
        sendJson(res, 200, { success: true, removed: output.removed, running: output.running, stopped: output.stopped, total: output.total });

      } else if (method === 'GET' && pathname === '/api/mcp/usage') {
        const input = Object.assign(new GetMcpUsageInput(), {
          mcp_install_id: params.get('mcp_install_id') || undefined,
          start_date: params.get('start_date') || undefined,
          end_date: params.get('end_date') || undefined,
        });
        const output = new GetMcpUsageOutput();
        await ctx.mcpAccess.soMcpUsage(input, output, new McpContext());
        sendJson(res, 200, { list: output.list, total: output.total });

      } else if (method === 'GET' && pathname === '/api/mcp/market') {
        const provOut = new SoMcpProviderOutput();
        await ctx.mcpAccess.soMcpProvider(Object.assign(new SoMcpProviderInput(), {}), provOut, new McpContext());
        const market: { id: string; name: string; url: string }[] = [];
        for (const p of provOut.list || []) {
          try {
            const listOut = new ListMcpOutput();
            await ctx.mcpAccess.listMcp(Object.assign(new ListMcpInput(), { mcp_provider_id: p.id }), listOut, new McpContext());
            for (const m of listOut.list || []) {
              market.push({ id: String((p as unknown as Record<string, unknown>).id ?? (m as unknown as Record<string, unknown>).id ?? ''), name: String((m as unknown as Record<string, unknown>).mcp_title ?? ''), url: String((p as unknown as Record<string, unknown>).mcp_provider_url ?? '') });
            }
          } catch (err) {
            fileLogger.warn('[dev-server] GET /api/mcp/market 单 provider 列举失败（容忍：跳过该 provider）', err instanceof Error ? err.message : String(err));
          }
        }
        sendJson(res, 200, { market });

      } else if (method === 'POST' && /\/api\/mcp\/[^/]+\/install$/.test(pathname)) {
        const segments = pathname.split('/api/mcp/')[1].split('/');
        const mcpId = segments[0];
        const provId = (body as Record<string,unknown>).providerId as string || '';
        const installIn = Object.assign(new InstallMcpInput(), { mcp_provider_id: provId, mcp_id: mcpId });
        const installOut = new InstallMcpOutput();
        const insCtx = new McpContext();
        await ctx.mcpAccess.installMcp(installIn, installOut, insCtx);
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
        await ctx.mcpAccess.startMcp(startInput, new StartMcpOutput(), new McpContext());
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && /\/api\/mcp\/[^/]+\/stop$/.test(pathname)) {
        const id = pathname.split('/api/mcp/')[1].split('/')[0];
        const stopInput = Object.assign(new StopMcpInput(), { id });
        await ctx.mcpAccess.stopMcp(stopInput, new StopMcpOutput(), new McpContext());
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && /\/api\/mcp\/[^/]+\/upgrade$/.test(pathname)) {
        const id = pathname.split('/api/mcp/')[1].split('/')[0];
        const upInput = Object.assign(new UpgradeMcpInput(), { id });
        const upOutput = new UpgradeMcpOutput();
        await ctx.mcpAccess.upgradeMcp(upInput, upOutput, new McpContext());
        sendJson(res, 200, { success: true, version: upOutput.version });

      } else if (method === 'POST' && /\/api\/mcp\/[^/]+\/call$/.test(pathname)) {
        const id = pathname.split('/api/mcp/')[1].split('/')[0];
        const callInput = Object.assign(new ExecMcpInput(), {
          id,
          tool_name: (body as Record<string, unknown>).tool_name || undefined,
          params: (body as Record<string, unknown>).params || {},
        });
        const callOutput = new ExecMcpOutput();
        await ctx.mcpAccess.execMcp(callInput, callOutput, new McpContext());
        sendJson(res, 200, { result: callOutput.result, raw_response: callOutput.raw_response });

      } else if (method === 'DELETE' && /\/api\/mcp\/[^/]+$/g.test(pathname) && !pathname.includes('/install') && !pathname.includes('/toggle') && !pathname.includes('/start') && !pathname.includes('/stop')) {
        const id = pathname.split('/api/mcp/')[1];
        const unInput = Object.assign(new UninstallMcpInput(), { id });
        const unOutput = new UninstallMcpOutput();
        await ctx.mcpAccess.uninstallMcp(unInput, unOutput, new McpContext());
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/chat/list') {
        const input = Object.assign(new SearchSessionInput(), {
          keyword: params.get('keyword') || undefined,
          start_time: params.get('start_time') ? parseInt(params.get('start_time')!, 10) : undefined,
          end_time: params.get('end_time') ? parseInt(params.get('end_time')!, 10) : undefined,
          page_current: params.get('page_current') ? parseInt(params.get('page_current')!, 10) : undefined,
          page_size: params.get('page_size') ? parseInt(params.get('page_size')!, 10) : undefined,
        });
        const output = new SearchSessionOutput();
        const context = new ChatContext();
        await ctx.chatAccess.soSession(input, output, context);
        sendJson(res, 200, {
          sessions: (output.sessions || []).map((s) => ({
            sessionId: s.session_id,
            session_id: s.session_id,
            sessionTitle: s.session_title || '',
            session_title: s.session_title || '',
            created: s.created ?? 0,
            createdTime: s.created ?? 0,
            lastMessage: s.last_message || s.session_title || '',
            lastTime: s.last_message_time || s.updated || s.created || 0,
            messageCount: s.message_count,
            qaCount: s.qa_count ?? 0,
            questionChars: s.question_chars ?? 0,
            answerChars: s.answer_chars ?? 0,
            inputTokens: s.input_tokens ?? 0,
            outputTokens: s.output_tokens ?? 0,
            tags: s.tags ?? [],
          })),
          total: output.total,
        });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/history/')) {
        const sid = pathname.split('/api/chat/history/')[1];
        const lastNParam = parseInt(params.get('lastN') || '', 10);
        const input = Object.assign(new GetChatHistoryInput(), {
          session_id: sid,
          ...(Number.isFinite(lastNParam) && lastNParam > 0 ? { lastN: lastNParam } : {}),
        });
        const output = new GetChatHistoryOutput();
        const context = new ChatContext();
        await ctx.chatAccess.soChatHistory(input, output, context);

        const permissionMessages: Array<Record<string, unknown>> = [];
        for (const m of (output.messages || [])) {
          if (m.info_type !== InfoType.PERMISSION) continue;
          let p: Record<string, unknown> = {};
          try { p = JSON.parse(String(m.info || '{}')); } catch { p = { tool_id: 'tool' }; }
          permissionMessages.push({
            id: m.info_id,
            role: 'assistant',
            content: '',
            timestamp: m.created,
            pin: m.pin,
            workId: String((p.run_id as string) ?? m.work_id ?? ''),
            traceId: m.trace_id || '',
            permission: {
              permissionId: String(p.permission_id ?? m.info_id),
              toolId: String(p.tool_id ?? 'tool'),
              input: p.input ?? {},
              status: String(p.status ?? 'pending'),
              askedAt: Number(p.asked_at ?? m.created ?? 0),
              answeredAt: Number((p as Record<string, unknown>).answered_at ?? 0) || undefined,
              runId: String((p.run_id as string) ?? m.work_id ?? ''),
            },
          });
        }

        const rawMessages = (output.messages || []).filter(
          (m) => m.info_type === InfoType.REQUEST || m.info_type === InfoType.RESPONSE
        );

        const allWorkIds = Array.from(
          new Set(rawMessages.filter((m) => m.work_id).map((m) => String(m.work_id)))
        );
        const respondedWorkIds = new Set(
          rawMessages.filter((m) => m.info_type === InfoType.RESPONSE && m.work_id).map((m) => String(m.work_id))
        );

        const { workBlocksMap, workDagMap } = await buildThinkingBlocksAndDag(ctx.relationDb, ctx.infoCore, allWorkIds, ctx.promptsAccess, ctx.soulAccess);

        const messages = rawMessages.map((m) => {
          const isResponse = m.info_type === InfoType.RESPONSE;
          const wid = m.work_id ? String(m.work_id) : '';

          const attachBlocks = wid && workBlocksMap.has(wid) && (isResponse || !respondedWorkIds.has(wid));
          const blocks = attachBlocks
            ? workBlocksMap.get(wid)!.map((b) => ({ ...b, msgId: m.info_id }))
            : undefined;
          const agentDag = (isResponse && wid && workDagMap.has(wid))
            ? workDagMap.get(wid)
            : undefined;

          return {
            id: m.info_id,
            role: m.info_creator_role === 'USER' ? 'user' : 'assistant',
            content: m.info,
            timestamp: m.created,
            pin: m.pin,
            workId: m.work_id,
            traceId: m.trace_id || '',
            citingCount: m.citing_count ?? 0,
            citedCount: m.cited_count ?? 0,
            citingInfoIds: m.citing_info_ids ?? [],
            citedInfoIds: m.cited_info_ids ?? [],
            citingIds: m.cited_info_ids ?? [],
            blocks,
            agentDag,
          };
        });

        sendJson(res, 200, { messages: [...messages, ...permissionMessages] });

      } else if (method === 'GET' && pathname === '/api/chat/thinking') {

        const infoId = String(params.get('info_id') ?? '');
        const runId = String(params.get('run_id') ?? '');
        let workId = String(params.get('work_id') ?? '');

        if (!workId && !infoId && !runId) {
          sendJson(res, 400, { error: '请至少提供 work_id / info_id / run_id 中的一个参数' });
          return;
        }

        if (!workId && (infoId || runId)) {
          try {
            const conds: string[] = [];
            const args: string[] = [];
            if (infoId) { conds.push('"info_id" = ?'); args.push(infoId); }
            if (runId) { conds.push('"run_id" = ?'); args.push(runId); }
            const rows = ctx.relationDb.queryRaw<{ work_id: string }>(
              `SELECT "work_id" FROM "info_raw" WHERE ${conds.join(' AND ')} LIMIT 1`,
              args,
            );
            if (rows.length > 0) workId = String(rows[0].work_id ?? '');
          } catch (err) {
            fileLogger.warn('[dev-server] GET /api/chat/thinking work_id 反查失败（容忍：按未找到处理）', err instanceof Error ? err.message : String(err));
          }
        }

        const reqModule = String(params.get('module') ?? 'all').toLowerCase();
        const { workBlocksMap, workDagMap, workTraceMap } = await buildThinkingBlocksAndDag(ctx.relationDb, ctx.infoCore, workId ? [workId] : [], ctx.promptsAccess, ctx.soulAccess);
        const blocks = (reqModule === 'dag') ? [] : (workBlocksMap.get(workId) ?? []);
        const dag = (reqModule === 'blocks') ? null : (workDagMap.get(workId) ?? null);
        const trace = (reqModule === 'dag' || reqModule === 'blocks') ? (workTraceMap.get(workId) ?? null) : (workTraceMap.get(workId) ?? null);
        sendJson(res, 200, {
          work_id: workId,
          run_id: runId,
          count: blocks.length,
          blocks,
          dag,
          trace,
          module: reqModule,
        });

      } else if (method === 'GET' && pathname === '/api/chat/eval-result') {

        const infoId = String(params.get('info_id') ?? '');
        let workId = String(params.get('work_id') ?? '');
        let runId = String(params.get('run_id') ?? '');
        let traceId = String(params.get('trace_id') ?? '');

        if (!workId && !runId && !infoId) {
          sendJson(res, 400, { error: '请至少提供 work_id / run_id / info_id 中的一个参数' });
          return;
        }

        if ((!workId && !runId) && infoId) {
          try {
            const rows = ctx.relationDb.queryRaw<{ work_id: string; run_id: string; trace_id: string }>(
              `SELECT "work_id", "run_id", "trace_id" FROM "info_raw" WHERE "info_id" = ? LIMIT 1`,
              [infoId],
            );
            if (rows.length > 0) {
              workId = String(rows[0].work_id ?? '');
              runId = runId || String(rows[0].run_id ?? '') || String(rows[0].work_id ?? '');
              traceId = traceId || String(rows[0].trace_id ?? '');
            }
          } catch (err) {
            fileLogger.warn('[dev-server] GET /api/chat/eval-result info_id 反查失败（容忍：按未找到处理）', err instanceof Error ? err.message : String(err));
          }
        }

        if (!workId && !runId) {
          sendJson(res, 200, { work_id: '', trace_id: traceId, found: false, evaluation: null });
          return;
        }

        const queryLegacyEval = (): { answer: string; created: number; elapsed_ms: number; agent_name: string }[] => {
          try {
            return ctx.relationDb.queryRaw<{ answer: string; created: number; elapsed_ms: number; agent_name: string }>(
              `SELECT e.answer, e.created, e.elapsed_ms, a.agent_name
               FROM orchestration_agent_execution e
               LEFT JOIN agent a ON (e.agent_id = a.id OR e.agent_id = a.agent_id)
               WHERE e.work_id = ? AND e.execution_type = 'SYSTEM' AND a.agent_type = 'EVOLUTOR'
               ORDER BY e.created DESC LIMIT 1`,
              [workId],
            );
          } catch {
            return [] as { answer: string; created: number; elapsed_ms: number; agent_name: string }[];
          }
        };

        let answerJson = '';
        let created = 0;
        let evalAgentId = '';
        let evalUpdatedAt = 0;

        try {
          const evalRows = ctx.relationDb.queryRaw<{ run_id: string; work_id: string; scores: string; suggestions: string; need_optimize: number; created: number; updated: number; agent_id: string }>(
            `SELECT e."run_id", e."work_id", e."scores", e."suggestions", e."need_optimize", e."created", e."updated", e."agent_id"
             FROM "agent_evaluation" e WHERE e."run_id" = ? OR e."work_id" = ? ORDER BY e."created" DESC LIMIT 1`,
            [runId || workId, runId || workId],
          );

          if (evalRows.length > 0) {
            const row = evalRows[0];
            created = Number(row.created ?? 0);
            evalAgentId = String(row.agent_id ?? '');
            evalUpdatedAt = Number(row.updated ?? 0);

            answerJson = JSON.stringify({
              ...(() => {
                try { return JSON.parse(row.scores || '{}'); } catch {  return {}; }
              })(),
              suggestions: (() => {
                try { return JSON.parse(row.suggestions || '[]'); } catch {  return []; }
              })(),
              need_optimize: Number(row.need_optimize ?? 0) === 1,
            });
          }
        } catch {  }

        if (!answerJson && workId) {
          const legacyRows = queryLegacyEval();
          if (legacyRows.length > 0) {
            answerJson = String(legacyRows[0].answer ?? '');
            created = Number(legacyRows[0].created ?? 0);
          }
        }

        if (!answerJson) {
          sendJson(res, 200, { work_id: workId, trace_id: traceId, found: false, evaluation: null });
          return;
        }

        let agentName = '进化 Agent (Evolutor)';
        if (evalAgentId) {
          try {
            const agentRows = ctx.relationDb.queryRaw<{ agent_name: string }>(
              'SELECT "agent_name" FROM "agent" WHERE "agent_id" = ? OR "id" = ? LIMIT 1', [evalAgentId, evalAgentId],
            );
            if (agentRows && agentRows.length > 0 && agentRows[0].agent_name) agentName = agentRows[0].agent_name;
          } catch {  }
        }
        const elapsedMs = evalUpdatedAt > created ? evalUpdatedAt - created : 0;

        sendJson(res, 200, {
          work_id: workId,
          trace_id: traceId,
          found: true,
          evaluation: {
            answer: answerJson,
            created,
            elapsed_ms: elapsedMs,
            agent_name: agentName,
          },
        });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/exchanges/')) {
        const sid = pathname.split('/api/chat/exchanges/')[1];
        const input = Object.assign(new GetChatHistoryInput(), { session_id: sid });
        const output = new GetChatHistoryOutput();
        const context = new ChatContext();
        await ctx.chatAccess.soChatHistory(input, output, context);
        sendJson(res, 200, { exchanges: output.messages || [] });

      } else if (method === 'POST' && pathname === '/api/chat/permission/answer') {

        const permInput = Object.assign(new AnswerPermissionInput(), {
          permission_id: String(body.permission_id ?? ''),
          approved: body.approved === true,
          remember: body.remember === true,
        });
        const permOutput = new AnswerPermissionOutput();
        await getRuntimeGateway().answerPermission(permInput, permOutput, new RunGatewayContext());
        sendJson(res, 200, { ok: true, answered: permOutput.answered });
      } else if (method === 'POST' && pathname === '/api/chat/ask/answer') {

        const askInput = Object.assign(new AnswerUserAskInput(), {
          ask_id: String(body.ask_id ?? ''),
          answer: String(body.answer ?? ''),
        });
        const askOutput = new AnswerUserAskOutput();
        await getRuntimeGateway().answerUserAsk(askInput, askOutput, new RunGatewayContext());
        sendJson(res, 200, { ok: true, answered: askOutput.answered });
      } else if (method === 'POST' && pathname === '/api/chat/stream') {

        const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
        const msgContent = typeof body.msg_content === 'string' ? body.msg_content : '';
        const citingMsgIds = Array.isArray(body.citing_msg_ids) ? body.citing_msg_ids : (Array.isArray(body.citingIds) ? body.citingIds : []);
        const selectedMsgIds = Array.isArray(body.selected_msg_ids) ? body.selected_msg_ids : (Array.isArray(body.selectedMsgIds) ? body.selectedMsgIds : []);
        const pinnedMsgIds = Array.isArray(body.pinned_msg_ids) ? body.pinned_msg_ids : (Array.isArray(body.pinnedMsgIds) ? body.pinnedMsgIds : []);
        const allCitingIds = Array.from(new Set([...citingMsgIds, ...selectedMsgIds]));

        if (!sessionId) { sendJson(res, 400, { error: 'session_id is required' }); return; }
        if (!msgContent.trim()) { sendJson(res, 400, { error: 'msg_content cannot be empty' }); return; }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        let clientClosed = false;
        req.on('close', () => {
          clientClosed = true;
          ctx.streamAccess.closeStream(
            Object.assign(new CloseStreamInput(), { session_id: sessionId, reason: 'Client disconnected' }),
            new CloseStreamOutput(),
            new StreamContext(),
          ).catch(() => {});
        });

        const write = (str: string) => {
          if (clientClosed) return;
          try { res.write(str); } catch {  }
        };

        const registerOutput = new RegisterStreamOutput();
        await ctx.streamAccess.registerStream(
          Object.assign(new RegisterStreamInput(), {
            session_id: sessionId,
            writer: (chunk: string) => {
              if (clientClosed) return false;
              try { res.write(chunk); return true; } catch {  return false; }
            },
            onClose: () => {
              if (!clientClosed) { try { res.end(); } catch {  } }
            },
          }),
          registerOutput,
          new StreamContext(),
        );

        const onEvent = (evt: { event: string; data: Record<string, unknown> }) => {

          write(`data: ${JSON.stringify({ event: evt.event, ...evt.data })}\n\n`);
        };

        const streamInput = Object.assign(new OpenChatStreamInput(), {
          session_id: sessionId,
          msg_content: msgContent,
          citing_msg_ids: allCitingIds,
          selected_msg_ids: selectedMsgIds,
          pinned_msg_ids: pinnedMsgIds,
          force_orchestration_strategy: typeof body.force_orchestration_strategy === 'string' ? body.force_orchestration_strategy : undefined,

          stream_endpoint_id: registerOutput.endpoint_id,
        });
        const streamOutput = new OpenChatStreamOutput();

        const traceId = soReqTraceId(req);
        const chatMetrics = new Metrics(fileLogger as unknown as MetricsLogger, 'ChatService.openChatStream', traceId);

        try {
          await ctx.chatAccess.openChatStream(streamInput, streamOutput, new ChatContext(), chatMetrics, undefined, onEvent);
        } catch (err: any) {
          await ctx.streamAccess.pushEvent(sessionId, 'error', 'CONTROL', {
            error_message: err?.message || 'Stream failed',
            error_code: 'INTERNAL',
          });
        } finally {
          await ctx.streamAccess.closeStream(
            Object.assign(new CloseStreamInput(), { session_id: sessionId, reason: 'Stream finished' }),
            new CloseStreamOutput(),
            new StreamContext(),
          );
          if (!clientClosed) { try { res.end(); } catch {  } }
        }
        return;

      } else if (method === 'DELETE' && pathname === '/api/chat/session') {

        const rawBatchIds = (body as Record<string, unknown>).session_ids;
        const batchIds = Array.isArray(rawBatchIds)
          ? (rawBatchIds as unknown[]).map((x) => String(x)).filter(Boolean)
          : [];
        if (batchIds.length === 0) {
          sendJson(res, 400, { error: 'session_ids 必须为非空数组' });
          return;
        }
        const batchInput = Object.assign(new DeleteSessionInput(), { session_ids: batchIds });
        const batchOutput = new DeleteSessionOutput();
        await ctx.chatAccess.deleteSession(batchInput, batchOutput, new ChatContext());

        for (const sid of batchIds) {
          try {
            await ctx.userProfileAccess.resetUserProfile(
              Object.assign(new ResetUserProfileInput(), { session_id: sid }),
              new ResetUserProfileOutput(),
              new UserProfileContext(),
            );
          } catch (err) {

            fileLogger.warn('[dev-server] DELETE /api/chat/session 级联重置画像失败（容忍：会话已删除）', err instanceof Error ? err.message : String(err));
          }
        }
        sendJson(res, 200, { deleted_count: batchOutput.deleted_count });

      } else if (method === 'DELETE' && pathname.startsWith('/api/chat/session/')) {
        const sid = pathname.split('/api/chat/session/')[1];
        const input = Object.assign(new DeleteSessionInput(), { session_ids: [sid] });
        const output = new DeleteSessionOutput();
        const context = new ChatContext();
        await ctx.chatAccess.deleteSession(input, output, context);

        try {
          await ctx.userProfileAccess.resetUserProfile(
            Object.assign(new ResetUserProfileInput(), { session_id: sid }),
            new ResetUserProfileOutput(),
            new UserProfileContext(),
          );
        } catch (err) {

          fileLogger.warn('[dev-server] DELETE /api/chat/session/:sid 级联重置画像失败（容忍：会话已删除）', err instanceof Error ? err.message : String(err));
        }
        sendJson(res, 200, { deleted_count: output.deleted_count });

      } else if (method === 'GET' && pathname.startsWith('/api/chat/session/')) {
        const sid = pathname.split('/api/chat/session/')[1];
        const input = Object.assign(new GetSessionDetailInput(), { session_id: sid });
        const output = new GetSessionDetailOutput();
        const context = new ChatContext();
        try {
          await ctx.chatAccess.soSessionDetail(input, output, context);
          sendJson(res, 200, { session: output.session });
        } catch (err: any) {
          sendJson(res, 404, { error: err?.message || 'Session not found' });
        }

      } else if (method === 'GET' && pathname === '/api/chat/search') {
        const kw = params.get('keyword') || '';
        const input = Object.assign(new SearchMessageInput(), { keyword: kw });
        const output = new SearchMessageOutput();
        const context = new ChatContext();
        await ctx.chatAccess.soMessage(input, output, context);
        sendJson(res, 200, { messages: output.messages || [], total: output.total });

      } else if (method === 'POST' && /\/api\/chat\/message\/[^/]+\/pin$/.test(pathname)) {
        const infoId = pathname.split('/api/chat/message/')[1].split('/')[0];
        const input = Object.assign(new PinMessageInput(), { info_id: infoId });
        const output = new PinMessageOutput();
        const context = new ChatContext();
        await ctx.chatAccess.pinMessage(input, output, context);
        sendJson(res, 200, { pin: output.pin });

      } else if (method === 'POST' && /\/api\/chat\/cancel\//.test(pathname)) {

        const eid = pathname.split('/api/chat/cancel/')[1];
        const { AbortRunInput, AbortRunOutput, RunGatewayContext } = await import('./Runtime');
        const input = Object.assign(new AbortRunInput(), { run_id: eid, reason: 'user' });
        const output = new AbortRunOutput();
        await getRuntimeGateway().abortRun(input, output, new RunGatewayContext());
        sendJson(res, 200, { cancelled: true });

      } else if (method === 'POST' && pathname === '/api/chat/create-session') {
        const input = Object.assign(new CreateSessionInput(), { session_title: body.title || body.session_title || '' });
        const output = new CreateSessionOutput();
        const context = new ChatContext();
        await ctx.chatAccess.createSession(input, output, context);
        sendJson(res, 200, { session_id: output.session_id, session_title: output.session_title, created: output.created });

      } else if ((method === 'PUT' || method === 'POST') && /\/api\/chat\/session\/[^/]+\/title$/.test(pathname)) {
        const sid = pathname.split('/api/chat/session/')[1].split('/')[0];
        const newTitle = body.title || body.session_title || '';
        const input = Object.assign(new UpdateSessionTitleInput(), { session_id: sid, session_title: newTitle });
        const output = new UpdateSessionTitleOutput();
        const context = new ChatContext();
        await ctx.chatAccess.updateSessionTitle(input, output, context);
        sendJson(res, 200, { success: true, session_id: sid, session_title: newTitle });

      } else if (method === 'GET' && pathname === '/api/memory/list') {
        const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 200);
        const cursor = (params.get('cursor') || '').trim();
        const conds: string[] = [memoryVisibleTypeCond()];
        const args: any[] = [...MEMORY_VISIBLE_INFO_TYPES];
        if (cursor) {
          const idx = cursor.indexOf(':');
          const cCreated = idx > 0 ? Number(cursor.slice(0, idx)) : NaN;
          const cId = idx > 0 ? cursor.slice(idx + 1) : '';
          if (!isNaN(cCreated)) {
            conds.push('("created" < ? OR ("created" = ? AND "id" < ?))');
            args.push(cCreated, cCreated, cId);
          }
        }
        const where = conds.length > 0 ? ` WHERE ${conds.join(' AND ')}` : '';
        const rows = ctx.relationDb.queryRaw<any>(
          `SELECT "id", "info_id", "info_type", "info_creator_role", "info", "pin", "session_id", "created", "updated" FROM "info_raw"${where} ORDER BY "created" DESC, "id" DESC LIMIT ${limit + 1}`,
          args,
        );
        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;
        const tagMap = queryInfoTagsByInfoIds(ctx.relationDb, pageRows.map((r: any) => r.info_id));
        const last = pageRows[pageRows.length - 1];
        sendJson(res, 200, {
          memories: pageRows.map((r: any) => mapInfoToMemory(r, tagMap.get(r.info_id) || [])),
          has_more: hasMore,
          next_cursor: hasMore && last ? `${last.created}:${last.id}` : null,
        });

      } else if (method === 'GET' && /\/api\/memory\/tag\//.test(pathname)) {
        const parts = pathname.split('/');
        const tag = decodeURIComponent(parts[parts.length - 1] || '');
        const rows = ctx.relationDb.queryRaw<any>(
          `SELECT r."id", r."info_id", r."info_type", r."info_creator_role", r."info", r."pin", r."session_id", r."created", r."updated" FROM "info_raw" r INNER JOIN "info_tag" t ON t."info_id" = r."info_id" WHERE t."tag" = ? AND ${memoryVisibleTypeCond()} ORDER BY r."created" DESC LIMIT 200`,
          [tag, ...MEMORY_VISIBLE_INFO_TYPES],
        );
        const tagMap = queryInfoTagsByInfoIds(ctx.relationDb, rows.map((r: any) => r.info_id));
        sendJson(res, 200, rows.map((r: any) => mapInfoToMemory(r, tagMap.get(r.info_id) || [])));

      } else if (method === 'GET' && pathname === '/api/memory/search') {
        const kw = (params.get('keyword') || '').trim();
        const type = (params.get('type') || '').trim();
        const tag = (params.get('tag') || '').trim();
        const startTime = params.get('start_time') ? parseInt(params.get('start_time')!, 10) : undefined;
        const endTime = params.get('end_time') ? parseInt(params.get('end_time')!, 10) : undefined;
        const cursor = (params.get('cursor') || '').trim();
        const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 200);
        const conds: string[] = [];
        const args: any[] = [];
        if (kw) {
          conds.push('("info" LIKE ? OR "info_id" IN (SELECT "info_id" FROM "info_tag" WHERE "tag" LIKE ?))');
          args.push(`%${kw}%`, `%${kw}%`);
        }
        if (type) {
          const typeToInfo: Record<string, string[]> = {
            semantic: ['RESPONSE'],
            episodic: ['REQUEST'],
            procedural: ['THINK', 'REFLECT', 'SKILL', 'MCP'],
            working: ['ACT'],
          };
          const infoTypes = typeToInfo[type] || [];
          if (infoTypes.length > 0) {
            conds.push(`"info_type" IN (${infoTypes.map(() => '?').join(',')})`);
            args.push(...infoTypes);
          } else {
            conds.push(memoryVisibleTypeCond());
            args.push(...MEMORY_VISIBLE_INFO_TYPES);
          }
        } else {
          conds.push(memoryVisibleTypeCond());
          args.push(...MEMORY_VISIBLE_INFO_TYPES);
        }
        if (tag) {
          conds.push('"info_id" IN (SELECT "info_id" FROM "info_tag" WHERE "tag" = ?)');
          args.push(tag);
        }
        if (startTime !== undefined) {
          conds.push('"created" >= ?');
          args.push(startTime);
        }
        if (endTime !== undefined) {
          conds.push('"created" < ?');
          args.push(endTime);
        }
        if (cursor) {
          const idx = cursor.indexOf(':');
          const cCreated = idx > 0 ? Number(cursor.slice(0, idx)) : NaN;
          const cId = idx > 0 ? cursor.slice(idx + 1) : '';
          if (!isNaN(cCreated)) {
            conds.push('("created" < ? OR ("created" = ? AND "id" < ?))');
            args.push(cCreated, cCreated, cId);
          }
        }
        const where = conds.length > 0 ? ` WHERE ${conds.join(' AND ')}` : '';
        const rows = ctx.relationDb.queryRaw<any>(
          `SELECT "id", "info_id", "info_type", "info_creator_role", "info", "pin", "session_id", "created", "updated" FROM "info_raw"${where} ORDER BY "created" DESC, "id" DESC LIMIT ${limit + 1}`,
          args,
        );
        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;
        const tagMap = queryInfoTagsByInfoIds(ctx.relationDb, pageRows.map((r: any) => r.info_id));
        const last = pageRows[pageRows.length - 1];
        sendJson(res, 200, {
          memories: pageRows.map((r: any) => mapInfoToMemory(r, tagMap.get(r.info_id) || [])),
          has_more: hasMore,
          next_cursor: hasMore && last ? `${last.created}:${last.id}` : null,
        });

      } else if (method === 'DELETE' && pathname === '/api/memory') {
        const rawIds = (body as Record<string, unknown>).info_ids;
        const infoIds = Array.isArray(rawIds)
          ? (rawIds as unknown[]).map((x) => String(x)).filter(Boolean)
          : [];
        if (infoIds.length === 0) {
          sendJson(res, 400, { error: 'info_ids 必须为非空数组' });
          return;
        }

        await ctx.relationDb.delete('info_tag', [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
        await ctx.relationDb.delete('info_summary', [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
        await ctx.relationDb.delete('info_keyword', [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
        await ctx.relationDb.delete('info_vector', [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
        await ctx.infoCore.delInfoGraph(Object.assign(new DelInfoGraphInput(), { info_ids: infoIds }), new DelInfoGraphOutput(), new InfoCoreContext());
        const affected = await ctx.relationDb.delete('info_raw', [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
        sendJson(res, 200, { deleted_count: affected });

      } else if (method === 'GET' && pathname === '/api/memory/tags') {
        const tagRows = ctx.relationDb.queryRaw<{ tag: string; cnt: number }>(
          'SELECT "tag", COUNT(*) AS "cnt" FROM "info_tag" GROUP BY "tag" ORDER BY "cnt" DESC',
        );
        sendJson(res, 200, { tags: tagRows.map((r) => r.tag) });

      } else if (method === 'GET' && pathname === '/api/memory/tag-graph') {
        try {
          const limit = Math.min(500, Math.max(1, parseInt(params.get('limit') || '100', 10) || 100));
          const g = await buildCooccurGraphFromGraphDBCached(ctx, 'Tag', 'tag', 'cooccur', limit);
          sendJson(res, 200, g);
        } catch (err) {
          fileLogger.warn('[dev-server] GET /api/memory/tag-graph 构建失败（容忍：返回空图）', err instanceof Error ? err.message : String(err));
          sendJson(res, 200, { nodes: [], edges: [] });
        }

      } else if (method === 'GET' && pathname === '/api/memory/keyword-graph') {
        try {
          const limit = Math.min(500, Math.max(1, parseInt(params.get('limit') || '100', 10) || 100));
          const g = await buildCooccurGraphFromGraphDBCached(ctx, 'keyword', 'keyword', 'keywordCooccur', limit);
          sendJson(res, 200, g);
        } catch (err) {
          fileLogger.warn('[dev-server] GET /api/memory/keyword-graph 构建失败（容忍：返回空图）', err instanceof Error ? err.message : String(err));
          sendJson(res, 200, { nodes: [], edges: [] });
        }

      } else if (method === 'DELETE' && pathname === '/api/memory/tag-graph') {
        try {
          const out = new ClearGraphOutput();
          await ctx.infoCore.clearGraph(Object.assign(new ClearGraphInput(), { node_type: 'Tag' }), out, new InfoCoreContext());
          sendJson(res, 200, { deleted_nodes: out.deleted_nodes });
        } catch (e: any) {
          fileLogger.warn('[dev-server] DELETE /api/memory/tag-graph 清理失败（容忍：已回 500）', e instanceof Error ? e.message : String(e));
          sendJson(res, 500, { error: e?.message || '清理失败' });
        }

      } else if (method === 'DELETE' && pathname === '/api/memory/keyword-graph') {
        try {
          const out = new ClearGraphOutput();
          await ctx.infoCore.clearGraph(Object.assign(new ClearGraphInput(), { node_type: 'keyword' }), out, new InfoCoreContext());
          sendJson(res, 200, { deleted_nodes: out.deleted_nodes });
        } catch (e: any) {
          fileLogger.warn('[dev-server] DELETE /api/memory/keyword-graph 清理失败（容忍：已回 500）', e instanceof Error ? e.message : String(e));
          sendJson(res, 500, { error: e?.message || '清理失败' });
        }

      } else if (method === 'POST' && pathname === '/api/memory/graph-search') {
        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (!query) { sendJson(res, 400, { error: 'query is required' }); return; }
        const maxDepth = typeof body.max_depth === 'number' && body.max_depth > 0 ? Math.min(body.max_depth, 5) : 2;
        const onlyActive = body.only_active !== false;
        const fanOutLimit = 500;
        try {
          const { GraphContext, SelectGraphOutput, GraphTarget } = await import('./Base/GraphDBProvider/domain/types');

          const matchedTags = ctx.relationDb.queryRaw<{ tag: string; info_id: string }>(
            'SELECT DISTINCT "tag", "info_id" FROM "info_tag" WHERE "tag" LIKE ? LIMIT 20',
            [`%${query.replace(/%/g, '').replace(/'/g, '')}%`],
          );
          if (!matchedTags || matchedTags.length === 0) {
            sendJson(res, 200, { root_tags: [], paths: [] });
            return;
          }
          const tagInfoMap = new Map<string, string[]>();
          for (const t of matchedTags) {
            const list = tagInfoMap.get(t.tag) ?? [];
            list.push(t.info_id);
            tagInfoMap.set(t.tag, list);
          }

          const findTagNodeId = async (tagText: string): Promise<string> => {
            const out = new SelectGraphOutput();
            await ctx.graphDBAccess.selectGraph(
              { target: GraphTarget.NODE, node_type: 'Tag' }, out, new GraphContext(),
            );
            for (const node of out.list as Array<{ id: string; content: Record<string, unknown> }>) {
              if (node.content?.['tag'] === tagText) return node.id;
            }
            return '';
          };

          const fetchEdges = async (frontier: string[]): Promise<Array<{ id: string; from_node_id: string; to_node_id: string; weight: number; is_active: boolean }>> => {
            const out = new SelectGraphOutput();
            await ctx.graphDBAccess.selectGraph({
              target: GraphTarget.EDGE,
              edge_type: 'similarTo',
              conditions: [
                { field: 'from_node_id', operator: Operator.IN, value: frontier },
                { field: 'to_node_id', operator: Operator.IN, value: frontier, logic: 'OR' },
              ],
            }, out, new GraphContext());
            return (out.list as Array<{ id: string; from_node_id: string; to_node_id: string; weight: number; is_active: boolean }>)
              .filter((e) => !onlyActive || e.is_active)
              .slice(0, fanOutLimit);
          };

          interface TraversalNode { id: string; tag: string; info_ids: string[]; depth: number }
          interface TraversalEdge { from_id: string; to_id: string; weight: number; active: boolean; compositeWeight: number }
          const paths: Array<{ root_tag: string; root_id: string; nodes: TraversalNode[]; edges: TraversalEdge[] }> = [];
          for (const [tagText, infoIds] of tagInfoMap) {
            const rootId = await findTagNodeId(tagText);
            if (!rootId) continue;
            const visited = new Set<string>([rootId]);
            const allNodes = new Map<string, TraversalNode>([[rootId, { id: rootId, tag: tagText, info_ids: [...infoIds], depth: 0 }]]);
            const allEdges: TraversalEdge[] = [];
            let frontier = [rootId];
            for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
              const edgeRows = await fetchEdges(frontier);
              if (edgeRows.length === 0) break;
              const nextFrontier: string[] = [];
              for (const e of edgeRows) {
                const neighborId = frontier.includes(e.from_node_id) ? e.to_node_id : e.from_node_id;
                if (!visited.has(neighborId)) {
                  visited.add(neighborId);
                  nextFrontier.push(neighborId);
                  allNodes.set(neighborId, { id: neighborId, tag: neighborId.substring(0, 8), info_ids: [], depth: d + 1 });
                }
                let cw = e.weight;
                try { cw = await ctx.graphDBAccess.computeEdgeWeight(e.id, d + 1); } catch {  }
                allEdges.push({ from_id: e.from_node_id, to_id: e.to_node_id, weight: e.weight, active: !!e.is_active, compositeWeight: cw });
              }
              frontier = nextFrontier;
            }
            paths.push({ root_tag: tagText, root_id: rootId, nodes: Array.from(allNodes.values()), edges: allEdges });
          }
          sendJson(res, 200, { root_tags: Array.from(tagInfoMap, ([tag, info_ids]) => ({ tag, info_ids })), paths });
        } catch (err) {
          fileLogger.warn('[dev-server] POST /api/memory/graph-search 失败（容忍：返回空结果）', err instanceof Error ? err.message : String(err));
          sendJson(res, 200, { root_tags: [], paths: [] });
        }
      } else if (method === 'GET' && /\/api\/memory\/stats\//.test(pathname)) {
        const totalRows = ctx.relationDb.queryRaw<{ cnt: number }>(
          'SELECT COUNT(*) AS "cnt" FROM "info_raw"',
        );
        const typeRows = ctx.relationDb.queryRaw<{ info_type: string; cnt: number }>(
          'SELECT "info_type", COUNT(*) AS "cnt" FROM "info_raw" GROUP BY "info_type"',
        );
        const byType: Record<string, number> = {};
        for (const r of typeRows) { byType[r.info_type || 'unknown'] = r.cnt; }
        sendJson(res, 200, { totalMemories: totalRows[0]?.cnt || 0, byType });

      } else if (method === 'GET' && pathname === '/api/memory/heatmap') {

        const year = parseInt(params.get('year') || '', 10);
        const month = parseInt(params.get('month') || '', 10);
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
          sendJson(res, 400, { error: '无效的年份或月份' });
          return;
        }
        const start = new Date(year, month - 1, 1).getTime();
        const end = new Date(year, month, 1).getTime();
        const rows = ctx.relationDb.queryRaw<{ created: number }>(
          'SELECT "created" FROM "info_raw" WHERE "created" >= ? AND "created" < ?',
          [start, end],
        );
        const days: Record<string, number> = {};
        for (const r of rows) {
          const d = new Date(Number(r.created)).getDate();
          days[String(d)] = (days[String(d)] || 0) + 1;
        }
        sendJson(res, 200, { year, month, days });

      } else if (method === 'GET' && pathname === '/api/memory/date-counts') {

        const tzMs = (parseInt(params.get('tz') || '0', 10) || 0) * 60000;
        const rows = ctx.relationDb.queryRaw<{ day_num: number; cnt: number }>(
          `SELECT CAST(("created" + ?) / 86400000 AS INTEGER) AS day_num, COUNT(*) AS cnt FROM "info_raw" WHERE "created" IS NOT NULL AND ${memoryVisibleTypeCond()} GROUP BY day_num`,
          [tzMs, ...MEMORY_VISIBLE_INFO_TYPES],
        );
        const dates: Record<string, number> = {};
        for (const r of rows) {
          if (r.day_num == null) continue;
          const d = new Date(r.day_num * 86400000);
          const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
          dates[key] = r.cnt;
        }
        sendJson(res, 200, { dates });

      } else if (method === 'GET' && pathname === '/api/chat/date-counts') {

        const tzMs = (parseInt(params.get('tz') || '0', 10) || 0) * 60000;
        const rows = ctx.relationDb.queryRaw<{ last_ts: number }>(
          'SELECT MAX(ir."created") AS "last_ts" FROM "info_raw" ir INNER JOIN "chat_session" cs ON ir."session_id" = cs."session_id" WHERE ir."session_id" IS NOT NULL AND ir."session_id" != \'\' AND ir."created" IS NOT NULL GROUP BY ir."session_id"',
          [],
        );
        const dates: Record<string, number> = {};
        for (const r of rows) {
          if (!r.last_ts) continue;
          const d = new Date(Number(r.last_ts) + tzMs);
          const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
          dates[key] = (dates[key] || 0) + 1;
        }
        sendJson(res, 200, { dates });

      } else if (method === 'POST' && pathname === '/api/learning/start') {

        const bodyMode = String((body as Record<string, unknown>).mode || '');
        let backendMode = bodyMode ? mapLearningMode(bodyMode) : 'ALL';
        if (!bodyMode) {
          const cfgOut = new ConfigSelfLearningOutput();
          await ctx.selfLearningAccess.configSelfLearning(new ConfigSelfLearningInput(), cfgOut, new SelfLearningContext());
          backendMode = mapLearningMode(String((cfgOut.config as Record<string, unknown>).learning_mode || 'ALL'));
        }
        await ctx.selfLearningAccess.startLearning(
          Object.assign(new StartLearningInput(), { learning_mode: backendMode }),
          new StartLearningOutput(),
          new SelfLearningContext(),
        );
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && pathname === '/api/learning/auto') {

        const mode = String((body as Record<string, unknown>).mode || '');
        const enabled = !!((body as Record<string, unknown>).enabled);
        const backendMode = mapLearningMode(mode);
        const autoField = mapAutoField(backendMode);
        if (!autoField) { sendJson(res, 400, { error: '未知的学习模式' }); return; }
        await ctx.selfLearningAccess.configSelfLearning(
          Object.assign(new ConfigSelfLearningInput(), { [autoField]: enabled }),
          new ConfigSelfLearningOutput(),
          new SelfLearningContext(),
        );
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && pathname === '/api/learning/random-factor') {

        const mode = String((body as Record<string, unknown>).mode || '');
        const value = Number((body as Record<string, unknown>).value ?? 10);
        const backendMode = mapLearningMode(mode);
        const field = mapRandomFactorField(backendMode);
        if (!field) { sendJson(res, 400, { error: '未知的学习模式' }); return; }
        const clamped = Math.max(0, Math.min(100, value));
        await ctx.selfLearningAccess.configSelfLearning(
          Object.assign(new ConfigSelfLearningInput(), { [field]: clamped }),
          new ConfigSelfLearningOutput(),
          new SelfLearningContext(),
        );
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && pathname === '/api/learning/stop') {

        const cfgOut = new ConfigSelfLearningOutput();
        await ctx.selfLearningAccess.configSelfLearning(new ConfigSelfLearningInput(), cfgOut, new SelfLearningContext());
        const storedMode = String((cfgOut.config as Record<string, unknown>).learning_mode || 'ALL');
        const backendMode = mapLearningMode(storedMode) === 'ALL' ? 'DOCUMENT' : mapLearningMode(storedMode);
        await ctx.selfLearningAccess.stopLearning(
          Object.assign(new StopLearningInput(), { learning_mode: backendMode }),
          new StopLearningOutput(),
          new SelfLearningContext(),
        );
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && pathname === '/api/learning/mode') {
        const mode = String((body as Record<string, unknown>).mode || 'from-conversation');
        await ctx.selfLearningAccess.configSelfLearning(
          Object.assign(new ConfigSelfLearningInput(), { learning_mode: mode }),
          new ConfigSelfLearningOutput(),
          new SelfLearningContext(),
        );
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && pathname === '/api/learning/driver-weights') {
        const randomFactor = Number((body as Record<string, unknown>).randomFactor ?? (body as Record<string, unknown>).random_factor ?? 50);
        await ctx.selfLearningAccess.configSelfLearning(
          Object.assign(new ConfigSelfLearningInput(), { random_factor: randomFactor }),
          new ConfigSelfLearningOutput(),
          new SelfLearningContext(),
        );
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/learning/tasks') {

        const output = new ListLearningTasksOutput();
        await ctx.selfLearningAccess.soLearningTasks(new ListLearningTasksInput(), output, new SelfLearningContext());
        sendJson(res, 200, { tasks: output.tasks });
      } else if (method === 'GET' && pathname === '/api/learning/stats') {
        const srcParam = params.get('source') || undefined;
        const backendSource = srcParam ? mapLearningMode(srcParam) : undefined;
        const output = new GetLearningStatsOutput();
        await ctx.selfLearningAccess.soLearningStats(
          Object.assign(new GetLearningStatsInput(), { source: backendSource }),
          output,
          new SelfLearningContext(),
        );
        const s = output.stats || {};
        sendJson(res, 200, {
          totalLearnCount: Number(s.total_learning_count) || 0,
          knowledgeCount: Number(s.total_knowledge_count) || 0,
          insightCount: Number(s.total_insight_count) || 0,
          weeklyLearnCount: Number(s.this_week_learning_count) || 0,
          trend: Array.isArray(s.learning_trend) ? s.learning_trend.map(t => ({ date: (t as Record<string, unknown>).date, count: Number((t as Record<string, unknown>).count) || 0 })) : [],
        });

      } else if (method === 'GET' && pathname === '/api/learning/progress-enhanced') {
        const progressOut = new GetLearningProgressOutput();
        await ctx.selfLearningAccess.soLearningProgress(new GetLearningProgressInput(), progressOut, new SelfLearningContext());
        const cfgOut = new ConfigSelfLearningOutput();
        await ctx.selfLearningAccess.configSelfLearning(new ConfigSelfLearningInput(), cfgOut, new SelfLearningContext());
        const cfg = cfgOut.config || {};
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        let completedToday = 0;
        try {
          const cntRows = ctx.relationDb.queryRaw<{ c: number }>(
            'SELECT COUNT(*) AS "c" FROM "self_learning_result" WHERE "learned_at" >= ?', [todayStart.getTime()],
          );
          completedToday = Number(cntRows?.[0]?.c) || 0;
        } catch {
          completedToday = 0;
        }
        sendJson(res, 200, {
          mode: String(cfg.learning_mode || 'from-conversation'),
          running: !!progressOut.running,
          randomFactor: Number(cfg.random_factor) || 0,
          queueSize: (progressOut.task_queue || []).length,
          completedToday,
          modes: {
            'from-document': { auto: Number(cfg.document_auto_enable) !== 0, randomFactor: Number(cfg.document_random_factor) || 0 },
            'from-conversation': { auto: Number(cfg.conversation_auto_enable) !== 0, randomFactor: Number(cfg.conversation_random_factor) || 0 },
            'tag-graph': { auto: Number(cfg.tag_auto_enable) !== 0, randomFactor: Number(cfg.tag_random_factor) || 0 },
          },
        });

      } else if (method === 'GET' && pathname === '/api/learning/queue') {
        const srcParam = params.get('source') || undefined;
        const backendSource = srcParam ? mapLearningMode(srcParam) : undefined;
        const progressOut = new GetLearningProgressOutput();
        await ctx.selfLearningAccess.soLearningProgress(
          Object.assign(new GetLearningProgressInput(), { source: backendSource }),
          progressOut,
          new SelfLearningContext(),
        );
        sendJson(res, 200, { tasks: progressOut.task_queue || [] });

      } else if (method === 'GET' && pathname === '/api/learning/knowledge') {
        const srcParam = params.get('source') || undefined;
        const backendSource = srcParam ? mapLearningMode(srcParam) : undefined;
        const output = new GetLearningResultsOutput();
        await ctx.selfLearningAccess.soLearningResults(
          Object.assign(new GetLearningResultsInput(), { type: 'KNOWLEDGE', source: backendSource, page_current: 1, page_size: 20 }),
          output,
          new SelfLearningContext(),
        );
        sendJson(res, 200, { items: output.results || [] });

      } else if (method === 'GET' && pathname === '/api/learning/insights') {
        const srcParam = params.get('source') || undefined;
        const backendSource = srcParam ? mapLearningMode(srcParam) : undefined;
        const output = new GetLearningResultsOutput();
        await ctx.selfLearningAccess.soLearningResults(
          Object.assign(new GetLearningResultsInput(), { type: 'INSIGHT', source: backendSource, page_current: 1, page_size: 20 }),
          output,
          new SelfLearningContext(),
        );
        sendJson(res, 200, { items: output.results || [] });

      } else if (method === 'POST' && pathname === '/api/config/mq/send') {
        const queue = typeof body.queue === 'string' && body.queue.trim() ? body.queue.trim() : 'default';
        const payload = body.payload !== undefined ? body.payload : body.content || '';
        const priority = typeof body.priority === 'number' ? body.priority : undefined;
        const sendInput = Object.assign(new SendMQInput(), { data: { queue, payload, priority } });
        const sendOutput = new SendMQOutput();
        await ctx.mqAccess.sendMQ(sendInput, sendOutput, new MQContext());
        sendJson(res, 200, { success: true, id: sendOutput.id });

      } else if (method === 'POST' && pathname === '/api/config/mq/consume') {
        const queue = typeof body.queue === 'string' && body.queue.trim() ? body.queue.trim() : 'default';
        const autoAck = body.auto_ack !== false;
        const consumeInput = Object.assign(new ConsumeMQInput(), { queue });
        const consumeOutput = new ConsumeMQOutput();
        await ctx.mqAccess.consumeMQ(consumeInput, consumeOutput, new MQContext());
        if (consumeOutput.message && autoAck) {
          const ackInput = Object.assign(new AckMQInput(), { message_id: consumeOutput.message.id });
          const ackOutput = new AckMQOutput();
          await ctx.mqAccess.ackMQ(ackInput, ackOutput, new MQContext());
          consumeOutput.message.status = 'COMPLETED';
        }
        sendJson(res, 200, { message: consumeOutput.message });

      } else if (method === 'POST' && pathname === '/api/config/mq/reset') {
        const queue = typeof body.queue === 'string' && body.queue.trim() ? body.queue.trim() : 'default';
        const fromTime = typeof body.from_time === 'number' && body.from_time > 0 ? body.from_time : undefined;
        const sql = fromTime
          ? 'UPDATE "queue_message" SET "status" = \'PENDING\', "retry_count" = 0, "next_retry_at" = NULL, "updated" = ? WHERE "queue" = ? AND "status" = \'PROCESSING\' AND "created" >= ?'
          : 'UPDATE "queue_message" SET "status" = \'PENDING\', "retry_count" = 0, "next_retry_at" = NULL, "updated" = ? WHERE "queue" = ? AND "status" = \'PROCESSING\'';
        const params: unknown[] = [Date.now(), queue];
        if (fromTime) params.push(fromTime);
        const count = ctx.relationDb.executeRaw(sql, params);
        sendJson(res, 200, { reset: count, queue, from_time: fromTime });

      } else if (method === 'GET' && pathname === '/api/config/mq/stats') {
        const queue = params.get('queue') || undefined;
        const statsInput = Object.assign(new GetQueueStatsInput(), { queue });
        const statsOutput = new GetQueueStatsOutput();
        await ctx.mqAccess.soQueueStats(statsInput, statsOutput, new MQContext());
        sendJson(res, 200, statsOutput.stats);

      } else if (method === 'GET' && pathname === '/api/config/mq/queues') {
        const rows = ctx.relationDb.queryRaw<{ queue: string }>(
          'SELECT DISTINCT "queue" FROM "queue_message" ORDER BY "queue" ASC',
          [],
        );
        sendJson(res, 200, { queues: (rows || []).map(r => r.queue) });

      } else if (method === 'DELETE' && pathname === '/api/config/mq/purge') {
        const queue = (body as Record<string, unknown>).queue as string || '';
        if (!queue) { sendJson(res, 400, { error: 'queue is required' }); return; }
        const deleted = ctx.relationDb.executeRaw(
          'DELETE FROM "queue_message" WHERE "queue" = ?',
          [queue],
        );
        sendJson(res, 200, { deleted, queue });

      } else if (method === 'GET' && pathname === '/api/library/paths') {
        const output = new SearchLibraryOutput();
        await ctx.selfLearningAccess.soLibrary(new SearchLibraryInput(), output, new SelfLearningContext());
        sendJson(res, 200, { paths: (output.libraries || []).map(l => ({
          id: String(l.library_id || ''),
          name: String(l.library_name || ''),
          path: String(l.library_path || ''),
          category: String((l as Record<string, unknown>).category || ''),
          description: String((l as Record<string, unknown>).description || ''),
          createdAt: Number(l.created) || 0,
          totalFiles: Number(l.total_files) || 0,
          learnedFiles: Number(l.learned_files) || 0,
          enableSelfLearning: Number(l.enable_self_learning) === 1,
        })) });

      } else if (method === 'POST' && pathname === '/api/library/paths') {
        const pathVal = String((body as Record<string, unknown>).path || '');
        const nameVal = String((body as Record<string, unknown>).name || '');
        const addOut = new AddLibraryOutput();
        await ctx.selfLearningAccess.addLibrary(
          Object.assign(new AddLibraryInput(), {
            library_path: pathVal,
            library_name: nameVal || undefined,
            category: String((body as Record<string, unknown>).category || ''),
            description: String((body as Record<string, unknown>).description || ''),
            enable_self_learning: true,
          }),
          addOut,
          new SelfLearningContext(),
        );
        sendJson(res, 201, { id: addOut.library_id, name: nameVal, path: pathVal, fileCount: addOut.file_count });

      } else if (method === 'DELETE' && pathname.startsWith('/api/library/paths/')) {
        const id = pathname.split('/api/library/paths/')[1];
        await ctx.selfLearningAccess.deleteLibrary(
          Object.assign(new DeleteLibraryInput(), { library_id: id }),
          new DeleteLibraryOutput(),
          new SelfLearningContext(),
        );
        sendJson(res, 200, { success: true });

      } else if (method === 'POST' && pathname === '/api/library/check-path') {
        const p = String((body as Record<string, unknown>).path || '');
        let exists = false, isReadable = false, isWritable = false;
        if (p) {
          try {
            const st = fs.statSync(p);
            exists = st.isDirectory();
            try { fs.accessSync(p, fs.constants.R_OK); isReadable = true; } catch {  }
            try { fs.accessSync(p, fs.constants.W_OK); isWritable = true; } catch {  }
          } catch {  }
        }
        sendJson(res, 200, { exists, isReadable, isWritable });

      } else if (method === 'GET' && pathname === '/api/library/browse-dir') {
        // 资料库目录选择器:由后端直接读取本机文件系统。path 缺省从用户主目录起步;
        // Windows 盘符根(如 C:\)额外返回全部可用盘符,便于跨盘选择。
        const target = params.get('path') || os.homedir();
        try {
          if (!fs.statSync(target).isDirectory()) { sendJson(res, 400, { error: '路径不是目录' }); return; }
          const entries = fs.readdirSync(target, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => ({ name: d.name, path: path.join(target, d.name) }))
            .sort((a, b) => a.name.localeCompare(b.name));
          const parent = path.dirname(target);
          let drives: string[] | undefined;
          if (process.platform === 'win32' && /^[a-zA-Z]:\\?$/.test(target)) {
            drives = [];
            for (let i = 65; i <= 90; i++) {
              const drive = `${String.fromCharCode(i)}:\\`;
              try { if (fs.statSync(drive).isDirectory()) drives.push(drive); } catch {  }
            }
          }
          sendJson(res, 200, { path: target, parent: parent !== target ? parent : null, drives, entries });
        } catch {
          sendJson(res, 400, { error: '目录不存在或不可读' });
        }

      } else if (method === 'PUT' && /\/api\/library\/paths\/[^/]+\/enabled$/.test(pathname)) {
        const id = pathname.split('/api/library/paths/')[1].split('/')[0];
        const enabled = !!((body as Record<string, unknown>).enabled);
        const out = new SetLibraryEnabledOutput();
        await ctx.selfLearningAccess.setLibraryEnabled(
          Object.assign(new SetLibraryEnabledInput(), { library_id: id, enabled }),
          out,
          new SelfLearningContext(),
        );
        sendJson(res, 200, { id, enabled: out.enabled, fileCount: out.file_count, directoryCount: out.directory_count });

      } else if (method === 'GET' && /\/api\/library\/paths\/[^/]+\/files$/.test(pathname)) {
        const id = pathname.split('/api/library/paths/')[1].split('/')[0];
        const out = new GetLibraryFilesOutput();
        await ctx.selfLearningAccess.soLibraryFiles(
          Object.assign(new GetLibraryFilesInput(), {
            library_id: id,
            directory: params.get('directory') !== null ? params.get('directory')! : undefined,
            keyword: params.get('keyword') || undefined,
            cursor: params.get('cursor') || undefined,
            limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : undefined,
          }),
          out,
          new SelfLearningContext(),
        );
        sendJson(res, 200, {
          files: (out.files || []).map((f) => ({
            id: String(f.file_id || ''),
            name: String(f.file_name || ''),
            path: String(f.file_path || ''),
            relativePath: String(f.relative_path || ''),
            parentPath: String(f.parent_path || ''),
            isDirectory: Number(f.is_directory) === 1,
            size: Number(f.file_size) || 0,
            status: String(f.status || ''),
            learnedAt: Number(f.learned_at) || 0,
          })),
          has_more: out.has_more,
          next_cursor: out.next_cursor,
        });

      } else if (method === 'GET' && /\/api\/library\/paths\/[^/]+\/tree$/.test(pathname)) {
        const id = pathname.split('/api/library/paths/')[1].split('/')[0];
        const out = new GetLibraryTreeOutput();
        await ctx.selfLearningAccess.soLibraryTree(
          Object.assign(new GetLibraryTreeInput(), { library_id: id }),
          out,
          new SelfLearningContext(),
        );
        sendJson(res, 200, { tree: out.tree });

      } else if (method === 'GET' && /\/api\/library\/files\/[^/]+\/content$/.test(pathname)) {
        const fileId = pathname.split('/api/library/files/')[1].split('/')[0];
        const out = new GetFileContentOutput();
        const ok = await ctx.selfLearningAccess.soFileContent(
          Object.assign(new GetFileContentInput(), { file_id: fileId }),
          out,
          new SelfLearningContext(),
        );
        if (!ok) { sendJson(res, 404, { error: '文件不存在或不可读' }); return; }
        sendJson(res, 200, { fileName: out.file_name, content: out.content, learnedAt: out.learned_at || 0 });

      } else if (method === 'PUT' && /\/api\/library\/files\/[^/]+\/content$/.test(pathname)) {
        const fileId = pathname.split('/api/library/files/')[1].split('/')[0];
        const content = String((body as Record<string, unknown>).content ?? '');
        const out = new UpdateFileContentOutput();
        await ctx.selfLearningAccess.updateFileContent(
          Object.assign(new UpdateFileContentInput(), { file_id: fileId, content }),
          out,
          new SelfLearningContext(),
        );
        sendJson(res, 200, { fileName: out.file_name, content: out.content, size: out.size });

      } else if (method === 'DELETE' && /^\/api\/library\/files\/[^/]+$/.test(pathname)) {
        const fileId = pathname.split('/api/library/files/')[1].split('/')[0];
        const out = new DeleteFileOutput();
        await ctx.selfLearningAccess.deleteFile(
          Object.assign(new DeleteFileInput(), { file_id: fileId }),
          out,
          new SelfLearningContext(),
        );
        sendJson(res, 200, { success: true, deletedAnnotations: out.deleted_annotations });

      } else if (method === 'POST' && pathname === '/api/library/query') {
        const b = (body as Record<string, unknown>);
        const out = new QueryDocumentOutput();
        await ctx.selfLearningAccess.queryDocument(
          Object.assign(new QueryDocumentInput(), {
            selection: b.selection ? String(b.selection) : undefined,
            content: b.content ? String(b.content) : undefined,
            context_before: b.context_before ? String(b.context_before) : undefined,
            context_after: b.context_after ? String(b.context_after) : undefined,
            question: b.question ? String(b.question) : undefined,
            document_title: b.document_title ? String(b.document_title) : undefined,
          }),
          out,
          new SelfLearningContext(),
        );
        sendJson(res, 200, { result: out.result, llm_id: out.llm_id });

      } else if (method === 'POST' && pathname === '/api/library/annotations') {
        const b = (body as Record<string, unknown>);
        const out = new SaveAnnotationOutput();
        await ctx.selfLearningAccess.saveAnnotation(
          Object.assign(new SaveAnnotationInput(), {
            library_id: b.library_id ? String(b.library_id) : undefined,
            file_id: String(b.file_id || ''),
            selection_text: String(b.selection_text || ''),
            selection_start: Number(b.selection_start) || 0,
            selection_end: Number(b.selection_end) || 0,
            question: String(b.question || ''),
            result: String(b.result || ''),
            llm_id: b.llm_id ? String(b.llm_id) : undefined,
          }),
          out,
          new SelfLearningContext(),
        );
        sendJson(res, 200, { id: out.id });

      } else if (method === 'GET' && /\/api\/library\/files\/[^/]+\/annotations$/.test(pathname)) {
        const fileId = pathname.split('/api/library/files/')[1].split('/')[0];
        const out = new GetFileAnnotationsOutput();
        await ctx.selfLearningAccess.soFileAnnotations(
          Object.assign(new GetFileAnnotationsInput(), { file_id: fileId }),
          out,
          new SelfLearningContext(),
        );
        sendJson(res, 200, {
          annotations: (out.annotations || []).map((a) => ({
            id: String(a.id || ''),
            file_id: String(a.file_id || ''),
            selection_text: String(a.selection_text || ''),
            selection_start: Number(a.selection_start) || 0,
            selection_end: Number(a.selection_end) || 0,
            question: String(a.question || ''),
            result: String(a.result || ''),
            llm_id: String(a.llm_id || ''),
            created: Number(a.created) || 0,
          })),
        });

      } else if (method === 'POST' && pathname === '/api/feedback') {
        const rating = body.rating !== undefined ? Number(body.rating) : (body.score !== undefined ? Number(body.score) : undefined);
        const runId = body.run_id || body.runId || undefined;
        const workId = body.work_id || body.workId || undefined;
        const agentId = body.agent_id || body.agentId || undefined;

        const input = Object.assign(new SubmitFeedbackInput(), {
          rating,
          comment: body.comment || undefined,
          category: body.category || undefined,
          work_id: workId,
          run_id: runId,
          metadata: body.metadata || undefined,
        });
        const output = new SubmitFeedbackOutput();
        await ctx.feedbackAccess.submitFeedback(input, output, new FeedbackContext());

        if (runId && rating !== undefined) {
          try {
            const saveRatingInput = Object.assign(new SaveInfoInput(), {
              session_id: body.session_id || '',
              work_id: workId || '',
              run_id: runId,
              info_type: 'USER_FEEDBACK',
              info_creator_role: 'user',
              info: JSON.stringify({ rating, comment: body.comment || '', agent_id: agentId || '' }),
            });
            await ctx.infoCore.saveInfo(saveRatingInput, new SaveInfoOutput(), new InfoCoreContext());
          } catch (err) {

            fileLogger.warn('[dev-server] POST /api/feedback 评分落库失败（容忍：反馈主流程不受影响）', err instanceof Error ? err.message : String(err));
          }
        }

        const configOut = new GetFeedbackConfigOutput();
        await ctx.feedbackAccess.getFeedbackConfig(new GetFeedbackConfigInput(), configOut, new FeedbackContext());
        const threshold = configOut.config?.disband_threshold ?? 30;
        const enableDisband = configOut.config?.enable_auto_disband ?? true;

        const shouldDisband = enableDisband && rating !== undefined && rating < threshold && runId;
        let disbandedAgentId = '';

        if (shouldDisband) {
          try {
            const linkedRows = ctx.relationDb.queryRaw<{ agent_id: string }>(
              'SELECT DISTINCT a.agent_id FROM agent_usage a WHERE a.run_id = ? AND a.agent_id LIKE \'agent-%\' LIMIT 1',
              [runId],
            );
            if (linkedRows.length > 0) {
              const targetAgentId = linkedRows[0].agent_id;
              const agentCtx = new AgentLibraryContext();
              const getOut = new GetAgentOutput();
              await ctx.agentLibrary.soAgent(
                Object.assign(new GetAgentInput(), { agent_id: targetAgentId }),
                getOut, agentCtx,
              );
              const agent = getOut.agents?.[0] as { agent_type?: string } | undefined;
              if (agent && agent.agent_type !== 'system') {
                try {
                  await ctx.agentLibrary.delAgent(
                    Object.assign(new DelAgentInput(), { agent_id: targetAgentId }),
                    new DelAgentOutput(),
                    agentCtx,
                  );
                  disbandedAgentId = targetAgentId;
                } catch {  }
              }
            }
          } catch (err) {
            fileLogger.warn('[dev-server] POST /api/feedback 解散 Agent 失败（容忍：不影响反馈提交）', err instanceof Error ? err.message : String(err));
          }
        }

        await ctx.feedbackAccess.recordProcessLog(
          Object.assign(new RecordProcessLogInput(), {
            feedback_id: output.feedback_id,
            action: disbandedAgentId ? 'disbanded' : 'submitted',
            agent_id: disbandedAgentId || agentId || '',
            run_id: runId,
            work_id: workId,
            rating: rating ?? 0,
            details: { threshold, enable_disband: enableDisband, disbanded: !!disbandedAgentId },
          }),
          new RecordProcessLogOutput(),
          new FeedbackContext(),
        );

        sendJson(res, 200, { ...output, disbanded_agent_id: disbandedAgentId || undefined });
      } else if (method === 'GET' && pathname === '/api/feedback') {
        const input = new QueryFeedbackInput();
        const output = new QueryFeedbackOutput();
        await ctx.feedbackAccess.soFeedback(input, output, new FeedbackContext());
        sendJson(res, 200, output);
      } else if (method === 'GET' && pathname === '/api/feedback/analysis') {
        const input = Object.assign(new AnalyzeFeedbackInput(), {
          source: params.get('source') || undefined,
          agent_id: params.get('agent_id') || undefined,
          category: params.get('category') || undefined,
          time_range_days: params.get('time_range_days') ? parseInt(params.get('time_range_days')!, 10) : undefined,
        });
        const output = new AnalyzeFeedbackOutput();
        await ctx.feedbackAccess.analyzeFeedback(input, output, new FeedbackContext());
        sendJson(res, 200, output);
      } else if (method === 'GET' && pathname === '/api/feedback/records') {
        const limit = params.get('limit') ? parseInt(params.get('limit')!, 10) : 50;
        const input = new QueryProcessLogsInput();
        input.page = { current: 1, size: limit };
        input.order_by = [{ field: 'created', direction: 'DESC' }];
        const output = new QueryProcessLogsOutput();
        await ctx.feedbackAccess.getProcessLogs(input, output, new FeedbackContext());
        sendJson(res, 200, output);
      } else if (method === 'GET' && pathname.startsWith('/api/feedback/records/')) {
        const processId = pathname.split('/api/feedback/records/')[1];
        const input = Object.assign(new GetProcessLogDetailInput(), { process_id: processId });
        const output = new GetProcessLogDetailOutput();
        await ctx.feedbackAccess.getProcessLogDetail(input, output, new FeedbackContext());
        sendJson(res, 200, output);
      } else if (method === 'GET' && pathname === '/api/feedback/config') {
        const output = new GetFeedbackConfigOutput();
        await ctx.feedbackAccess.getFeedbackConfig(new GetFeedbackConfigInput(), output, new FeedbackContext());
        sendJson(res, 200, output);
      } else if (method === 'PUT' && pathname === '/api/feedback/config') {
        const input = Object.assign(new UpdateFeedbackConfigInput(), {
          disband_threshold: body.disband_threshold !== undefined ? Number(body.disband_threshold) : undefined,
          enable_auto_disband: body.enable_auto_disband !== undefined ? Boolean(body.enable_auto_disband) : undefined,
        });
        const output = new UpdateFeedbackConfigOutput();
        await ctx.feedbackAccess.updateFeedbackConfig(input, output, new FeedbackContext());
        sendJson(res, 200, output);

      } else if (method === 'GET' && pathname === '/api/profile') {
        const input = Object.assign(new GetUserProfileInput(), {
          session_id: params.get('session_id') || undefined,
          version: params.get('version') ? parseInt(params.get('version')!, 10) : undefined,
        });
        const output = new GetUserProfileOutput();
        await ctx.userProfileAccess.soUserProfile(input, output, new UserProfileContext());
        sendJson(res, 200, output);
      } else if (method === 'POST' && pathname === '/api/profile/generate') {
        const input = Object.assign(new GenerateProfileInput(), {
          session_id: body.session_id || undefined,
          directions: Array.isArray(body.directions) ? body.directions : undefined,
        });
        const output = new GenerateProfileOutput();
        await ctx.userProfileAccess.generateProfile(input, output, new UserProfileContext());
        sendJson(res, 200, output.profile);
      } else if (method === 'POST' && pathname === '/api/profile/preference') {
        const input = Object.assign(new SaveUserPreferenceInput(), {
          session_id: body.session_id,
          language: body.language,
          style: body.style,
          depth: body.depth,
          format: body.format,
          additional_preferences: body.additional_preferences,
        });
        const output = new SaveUserPreferenceOutput();
        await ctx.userProfileAccess.saveUserPreference(input, output, new UserProfileContext());
        sendJson(res, 200, { success: true });
      } else if (method === 'GET' && pathname === '/api/profile/history') {
        const input = Object.assign(new GetProfileHistoryInput(), {
          session_id: params.get('session_id') || undefined,
          limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : undefined,
        });
        const output = new GetProfileHistoryOutput();
        await ctx.userProfileAccess.soProfileHistory(input, output, new UserProfileContext());
        sendJson(res, 200, { history: output.history });
      } else if (method === 'GET' && pathname.startsWith('/api/profile/version/')) {
        const versionStr = pathname.split('/').pop()!;
        const version = parseInt(versionStr, 10);
        if (isNaN(version)) { sendJson(res, 400, { error: 'Invalid version' }); return; }
        const input = Object.assign(new GetProfileByVersionInput(), {
          version,
          session_id: params.get('session_id') || undefined,
        });
        const output = new GetProfileByVersionOutput();
        await ctx.userProfileAccess.soProfileByVersion(input, output, new UserProfileContext());
        sendJson(res, 200, output.profile);
      } else if (method === 'GET' && pathname === '/api/profile/direction') {
        const input = new GetProfileDirectionInput();
        const output = new GetProfileDirectionOutput();
        await ctx.userProfileAccess.soProfileDirection(input, output, new UserProfileContext());
        sendJson(res, 200, { directions: output.directions });
      } else if (method === 'POST' && pathname === '/api/profile/reset') {
        const input = Object.assign(new ResetUserProfileInput(), {
          session_id: body.session_id || undefined,
        });
        const output = new ResetUserProfileOutput();
        await ctx.userProfileAccess.resetUserProfile(input, output, new UserProfileContext());
        sendJson(res, 200, { success: true, reset_count: output.reset_count });
      } else if (method === 'POST' && pathname === '/api/profile/direction') {
        const input = Object.assign(new ConfigProfileDirectionInput(), {
          directions: Array.isArray(body.directions) ? body.directions : [],
        });
        const output = new ConfigProfileDirectionOutput();
        await ctx.userProfileAccess.configProfileDirection(input, output, new UserProfileContext());
        sendJson(res, 200, { success: true });
      } else if (method === 'DELETE' && pathname === '/api/profile/direction') {
        const input = Object.assign(new DeleteProfileDirectionInput(), { direction_key: body.direction_key });
        const output = new DeleteProfileDirectionOutput();
        await ctx.userProfileAccess.deleteProfileDirection(input, output, new UserProfileContext());
        sendJson(res, 200, { success: true });

      } else if (method === 'GET' && pathname === '/api/monitor/health-all') {
        const components: Array<{ name: string; status: string; message?: string; details?: Record<string, string | number> }> = [];

        try {
          const start = Date.now();
          ctx.relationDb.queryRaw('SELECT 1');
          const tables = ctx.relationDb.queryRaw<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          );
          components.push({
            name: 'RelationDB', status: 'healthy', message: `${Date.now() - start}ms`,
            details: { '数据表': tables.length },
          });
        } catch (e: any) {
          components.push({ name: 'RelationDB', status: 'unhealthy', message: e?.message || '连接失败' });
        }

        try {
          const { GraphContext, VisualizedGraphInput, VisualizedGraphOutput } = await import('./Base/GraphDBProvider/domain/types');
          const o = new VisualizedGraphOutput();
          await ctx.graphDBAccess.visualizedGraph(Object.assign(new VisualizedGraphInput(), { scope: 'health' }), o, new GraphContext());
          const d = o.data || {};
          const vo = new VisualizedGraphOutput();
          await ctx.graphDBAccess.visualizedGraph(Object.assign(new VisualizedGraphInput(), { scope: 'volume' }), vo, new GraphContext());
          const vd = vo.data || {};
          components.push({
            name: 'GraphDB',
            status: d.connected === false ? 'unhealthy' : (d.enabled === false ? 'degraded' : 'healthy'),
            message: d.connected === false ? '未连接' : `${d.response_time_ms ?? 0}ms`,
            details: { '节点': Number(vd.total_nodes) || 0, '边': Number(vd.total_edges) || 0 },
          });
        } catch (e: any) {
          components.push({ name: 'GraphDB', status: 'unhealthy', message: e?.message || '连接失败' });
        }

        try {
          const { VectorContext, VisualizedVectorInput, VisualizedVectorOutput } = await import('./Base/VectorDBProvider/domain/types');
          const o = new VisualizedVectorOutput();
          await ctx.vectorDBAccess.visualizedVector(Object.assign(new VisualizedVectorInput(), { scope: 'health' }), o, new VectorContext());
          const d = o.data || {};
          const vo = new VisualizedVectorOutput();
          await ctx.vectorDBAccess.visualizedVector(Object.assign(new VisualizedVectorInput(), { scope: 'volume' }), vo, new VectorContext());
          const vd = vo.data || {};
          components.push({
            name: 'VectorDB',
            status: d.connected === false ? 'unhealthy' : (d.enabled === false ? 'degraded' : 'healthy'),
            message: d.connected === false ? '未连接' : `${d.response_time_ms ?? 0}ms`,
            details: { '向量': Number(vd.total_vectors) || 0, '维度': Number(vd.dimension) || 0 },
          });
        } catch (e: any) {
          components.push({ name: 'VectorDB', status: 'unhealthy', message: e?.message || '连接失败' });
        }

        try {
          const { VisualizedLLMInput, VisualizedLLMOutput } = await import('./Base/LLMProvider/domain/types');
          const o = new VisualizedLLMOutput();
          await ctx.llmAccess.visualizedLLM(Object.assign(new VisualizedLLMInput(), { scope: 'health' }), o, new LLMContext());
          const d = o.data || {};
          const enabledProviderCount = await ctx.relationDb.count('llm_provider', [
            { field: 'enable', operator: Operator.EQ, value: 1 },
          ]);
          components.push({
            name: 'LLM Provider',
            status: d.connected === false ? 'unhealthy' : (d.enabled === false ? 'degraded' : 'healthy'),
            message: d.connected === false ? '未连接' : `${d.response_time_ms ?? 0}ms`,
            details: { '启用提供商': enabledProviderCount, '启用模型': Number(d.enabled_llm_count) || 0 },
          });
        } catch (e: any) {
          components.push({ name: 'LLM Provider', status: 'unhealthy', message: e?.message || '连接失败' });
        }

        try {
          const enabledProviderCount = await ctx.relationDb.count('mcp_provider', [
            { field: 'enable', operator: Operator.EQ, value: 1 },
          ]);
          const enabledMcpCount = await ctx.relationDb.count('mcp_install', [
            { field: 'enable', operator: Operator.EQ, value: 1 },
          ]);
          components.push({
            name: 'MCP',
            status: 'healthy',
            message: `${enabledMcpCount} 个启用 MCP`,
            details: { '启用提供商': enabledProviderCount, '启用 MCP': enabledMcpCount },
          });
        } catch (e: any) {
          components.push({ name: 'MCP', status: 'unhealthy', message: e?.message || '连接失败' });
        }

        try {
          const o = new GetQueueStatsOutput();
          await ctx.mqAccess.soQueueStats(new GetQueueStatsInput(), o, new MQContext());
          const s = o.stats || {};
          components.push({
            name: 'MQ', status: 'healthy', message: `${s.total ?? 0} 条消息`,
            details: { '待处理': s.pending ?? 0, '处理中': s.processing ?? 0, '完成': s.completed ?? 0, '失败': s.failed ?? 0 },
          });
        } catch (e: any) {
          components.push({ name: 'MQ', status: 'unhealthy', message: e?.message || '连接失败' });
        }

        const status = components.some((c) => c.status === 'unhealthy')
          ? 'unhealthy'
          : components.some((c) => c.status === 'degraded')
            ? 'degraded'
            : 'healthy';
        sendJson(res, 200, { status, uptime: Math.round(process.uptime()), components });

      } else if (method === 'GET' && pathname === '/api/monitor/resources') {
        const resMonOut = new SoResourceOutput();
        await ctx.systemMonitorAccess.soResource(new SoResourceInput(), resMonOut, new SystemMonitorContext());
        const metrics = resMonOut.metrics;
        sendJson(res, 200, { cpu: metrics.cpu, memory: metrics.memory, disk: metrics.disk });
      } else if (method === 'GET' && pathname === '/api/analytics/token-trend') {

        const rows = ctx.relationDb.queryRaw<{ date: string; tokens: number }>(
          'SELECT "usage_date" AS "date", SUM(COALESCE("input_tokens",0) + COALESCE("output_tokens",0)) AS "tokens" FROM "llm_usage" GROUP BY "usage_date" ORDER BY "usage_date" ASC',
          [],
        );
        sendJson(res, 200, { points: (rows || []).map(r => ({ date: r.date, tokens: Number(r.tokens) || 0 })) });

      } else if (method === 'GET' && pathname === '/api/analytics/model-distribution') {

        const rows = ctx.relationDb.queryRaw<{ model: string; tokens: number; input_tokens: number; output_tokens: number; deleted: number; type: string }>(
          'SELECT COALESCE(e."llm_title", u."llm_available_id") AS "model", COALESCE(e."llm_type", \'deleted\') AS "type", (e."llm_title" IS NULL) AS "deleted", SUM(COALESCE(u."input_tokens",0) + COALESCE(u."output_tokens",0)) AS "tokens", SUM(COALESCE(u."input_tokens",0)) AS "input_tokens", SUM(COALESCE(u."output_tokens",0)) AS "output_tokens" FROM "llm_usage" u LEFT JOIN "llm_available" e ON e."id" = u."llm_available_id" GROUP BY u."llm_available_id" ORDER BY "tokens" DESC',
          [],
        );
        sendJson(res, 200, { models: (rows || []).map(r => ({ model: r.model, type: r.type || 'deleted', tokens: Number(r.tokens) || 0, input_tokens: Number(r.input_tokens) || 0, output_tokens: Number(r.output_tokens) || 0, deleted: !!r.deleted })) });

      } else if (method === 'GET' && pathname === '/api/analytics/last-run-overview') {

        const run = ctx.relationDb.queryRaw<{ id: string; session_key: string; accepted_at: number; settled_at: number }>(
          `SELECT "id", "session_key", "accepted_at", "settled_at" FROM "runtime_run" WHERE "status" = 'finished' AND "settled_at" > "accepted_at" ORDER BY "settled_at" DESC LIMIT 1`,
        )?.[0];
        if (!run) {
          sendJson(res, 200, { available: false });
        } else {
          const durationS = Math.max(0, Math.round((run.settled_at - run.accepted_at) / 100) / 10);
          const tok = ctx.relationDb.queryRaw<{ it: number; ot: number }>(
            `SELECT COALESCE(SUM("input_tokens"),0) AS "it", COALESCE(SUM("output_tokens"),0) AS "ot" FROM "llm_call_log" WHERE "run_id" = ?`,
            [run.id],
          )?.[0];
          const skillCount = ctx.relationDb.queryRaw<{ n: number }>(
            `SELECT COUNT(*) AS "n" FROM "stream_event" WHERE "session_key" = ? AND "event_type" = 'skill.started'`,
            [run.session_key],
          )?.[0]?.n ?? 0;

          const legacySkillCount = ctx.relationDb.queryRaw<{ n: number }>(
            `SELECT COUNT(*) AS "n" FROM "stream_event" WHERE "session_key" = ? AND "event_type" = 'tool.started'`,
            [run.session_key],
          )?.[0]?.n ?? 0;
          const permCount = ctx.relationDb.queryRaw<{ n: number }>(
            `SELECT COUNT(*) AS "n" FROM "stream_event" WHERE "session_key" = ? AND "event_type" = 'permission.asked'`,
            [run.session_key],
          )?.[0]?.n ?? 0;
          sendJson(res, 200, {
            available: true,
            duration_s: durationS,
            input_tokens: Number(tok?.it ?? 0),
            skill_calls: Number(skillCount) + Number(legacySkillCount),
            permission_asks: Number(permCount),
          });
        }

      } else if (method === 'GET' && pathname === '/api/llm/token-usage') {

        const sessionId = params.get('session_id') || undefined;
        const runId = params.get('run_id') || undefined;
        const workId = params.get('work_id') || undefined;
        const conds: string[] = [];
        const condParams: unknown[] = [];
        if (sessionId) {
          conds.push('"session_id" = ?');
          condParams.push(sessionId);
        }
        if (runId) {
          conds.push('"run_id" = ?');
          condParams.push(runId);
        }
        if (workId) {
          conds.push('"work_id" = ?');
          condParams.push(workId);
        }

        const caller = params.get('caller') || undefined;
        if (caller) {
          conds.push('"caller" = ?');
          condParams.push(caller);
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        let inputTokens = 0;
        let outputTokens = 0;
        let callCount = 0;
        try {
          const rows = ctx.relationDb.queryRaw<{ input_tokens: number; output_tokens: number; call_count: number }>(
            `SELECT COALESCE(SUM("input_tokens"),0) AS "input_tokens", COALESCE(SUM("output_tokens"),0) AS "output_tokens", COUNT(*) AS "call_count" FROM "llm_call_log" ${where}`,
            condParams,
          );
          inputTokens = Number(rows?.[0]?.input_tokens ?? 0) || 0;
          outputTokens = Number(rows?.[0]?.output_tokens ?? 0) || 0;
          callCount = Number(rows?.[0]?.call_count ?? 0) || 0;
        } catch {
          inputTokens = 0;
          outputTokens = 0;
          callCount = 0;
        }
        sendJson(res, 200, { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens, call_count: callCount });

      } else if (method === 'GET' && pathname === '/api/monitor/logs/sources') {
        try {
          const sources = await ctx.logAccess.listSources();
          sendJson(res, 200, { sources: sources || [] });
        } catch (e: any) {
          sendJson(res, 500, { error: e?.message || '日志来源查询失败' });
        }

      } else if (method === 'GET' && pathname === '/api/monitor/logs/query') {
        const level = params.get('level') || undefined;
        const source = params.get('source') || undefined;
        const keyword = params.get('keyword') || undefined;
        const traceId = params.get('trace_id') || undefined;
        const workId = params.get('work_id') || undefined;
        const runId = params.get('run_id') || undefined;
        const logSource = params.get('log_source') || undefined;
        const startTime = params.get('start_time') ? Number(params.get('start_time')) : undefined;
        const endTime = params.get('end_time') ? Number(params.get('end_time')) : undefined;
        const page = params.get('page') ? Number(params.get('page')) : 1;
        const pageSize = params.get('pageSize') ? Number(params.get('pageSize')) : (params.get('limit') ? Number(params.get('limit')) : 50);
        try {
          const result = await ctx.logAccess.queryLogs({ level, source, keyword, trace_id: traceId, work_id: workId, run_id: runId, log_source: logSource, start_time: startTime, end_time: endTime, page, pageSize });
          sendJson(res, 200, {
            entries: (result.logs || []).map(l => ({
              id: l.id,
              timestamp: l.created,
              level: String(l.level).toLowerCase(),
              source: l.source,
              message: l.message,
              trace_id: l.trace_id || '',
              caller: l.caller || '',
              work_id: l.work_id || '',
              run_id: l.run_id || '',
            })),
            total: result.total,
            page,
            pageSize,
          });
        } catch (e: any) {
          sendJson(res, 500, { error: e?.message || '日志查询失败' });
        }

      } else if (method === 'DELETE' && pathname === '/api/monitor/logs') {
        const rawIds = (body as Record<string, unknown>).ids;
        const ids = Array.isArray(rawIds)
          ? (rawIds as unknown[]).map((x) => String(x)).filter(Boolean)
          : [];
        if (ids.length === 0) {
          sendJson(res, 400, { error: 'ids 必须为非空数组' });
          return;
        }
        const output = new DelLogOutput();
        await ctx.logAccess.delLog(Object.assign(new DelLogInput(), { ids }), output, new LogContext());
        sendJson(res, 200, { deleted_count: output.affected_rows });

      } else if (method === 'DELETE' && pathname === '/api/monitor/logs/all') {
        const output = new DelLogOutput();

        await ctx.logAccess.delLog(Object.assign(new DelLogInput(), { before_time: Date.now() + 86400000 }), output, new LogContext());
        sendJson(res, 200, { deleted_count: output.affected_rows });

      } else if (method === 'GET' && pathname === '/api/orchestration/strategies') {
        const rows = ctx.relationDb.queryRaw<{ id: string; strategy_id: string; strategy_label: string; strategy_description: string; enable: number; jsonnode_definition: string }>(
          'SELECT "id", "strategy_id", "strategy_label", "strategy_description", "enable", "jsonnode_definition" FROM "orchestration_strategy" ORDER BY "created" ASC',
          [],
        );
        sendJson(res, 200, (rows || []).map(r => {
          let parsed: { start_node?: string; nodes?: Array<{ node_id: string; node_type: string; params?: Record<string, unknown>; next: string | null; on_error?: string; true_next?: string; false_next?: string }> } = {};
          try { parsed = JSON.parse(r.jsonnode_definition); } catch {  }
          const nodes = (parsed.nodes || []).map(n => ({
            id: n.node_id,
            type: n.node_type,
            params: n.params || {},
            next: n.next,
            onError: n.on_error,
            trueNext: n.true_next,
            falseNext: n.false_next,
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

      } else if (method === 'POST' && pathname === '/api/cdt/start') {
        const { CDTContext, StartCDTInput, StartCDTOutput } = await import('./Base/CDTProvider/domain/types');
        const o = new StartCDTOutput();
        await ctx.cdtAccess.startCDT(new StartCDTInput(), o, new CDTContext());
        sendJson(res, o.error ? 500 : 200, o);

      } else if (method === 'POST' && pathname === '/api/cdt/stop') {
        const { CDTContext, StopCDTInput, StopCDTOutput } = await import('./Base/CDTProvider/domain/types');
        const o = new StopCDTOutput();
        await ctx.cdtAccess.stopCDT(new StopCDTInput(), o, new CDTContext());
        sendJson(res, 200, o);

      } else if (method === 'GET' && pathname === '/api/cdt/status') {
        const { CDTContext, IsCDTRunningInput, IsCDTRunningOutput } = await import('./Base/CDTProvider/domain/types');
        const o = new IsCDTRunningOutput();
        await ctx.cdtAccess.isCDTRunning(new IsCDTRunningInput(), o, new CDTContext());
        sendJson(res, 200, o);

      } else if (method === 'POST' && pathname === '/api/cdt/navigate') {
        const { CDTCoreContext, CDTCoreNavigateInput, CDTCoreNavigateOutput } = await import('./Core/CDTCoreProvider/domain/types');
        const i = Object.assign(new CDTCoreNavigateInput(), body);
        const o = new CDTCoreNavigateOutput();
        await ctx.cdtCore.navigate(i, o, new CDTCoreContext());
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
        await ctx.cdtCore.evaluate(i, o, new CDTCoreContext());
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

        await ctx.cdtAccess.sendMouseEvent('mouseMoved', x, y, 'left', 1, 0, 0, 0, c, a, s, m);
        await ctx.cdtAccess.sendMouseEvent('mousePressed', x, y, 'left', 1, 0, 0, 0, c, a, s, m);
        await ctx.cdtAccess.sendMouseEvent('mouseReleased', x, y, 'left', 1, 0, 0, 0, c, a, s, m);
        await new Promise(r => setTimeout(r, 60));

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
        await ctx.cdtCore.getCookies(new CDTCoreGetCookiesInput(), o, new CDTCoreContext());
        sendJson(res, 200, o);

      } else if (method === 'GET' && pathname === '/api/visualization/messages') {
        const i = Object.assign(new GetVisualizedMessagesInput(), {
          session_id: params.get('session_id') || undefined,
          work_id: params.get('work_id') || undefined,
          run_id: params.get('run_id') || undefined,
          lastN: params.get('lastN') ? parseInt(params.get('lastN')!, 10) : undefined,
          include_citing_info: params.get('include_citing_info') !== 'false',
          include_context_source: params.get('include_context_source') === 'true',
          page_current: params.get('page_current') ? parseInt(params.get('page_current')!, 10) : undefined,
          page_size: params.get('page_size') ? parseInt(params.get('page_size')!, 10) : undefined,
        });
        const o = new GetVisualizedMessagesOutput();
        await ctx.visualizationAccess.soVisualizedMessages(i, o, new VisualizationContext());
        sendJson(res, 200, { messages: o.messages, total: o.total });

      } else if (method === 'GET' && pathname === '/api/visualization/message-graph') {
        const i = Object.assign(new GetVisualizedMessageGraphInput(), {
          session_id: params.get('session_id') || '',
          max_nodes: params.get('max_nodes') ? parseInt(params.get('max_nodes')!, 10) : undefined,
        });
        const o = new GetVisualizedMessageGraphOutput();
        await ctx.visualizationAccess.soVisualizedMessageGraph(i, o, new VisualizationContext());
        sendJson(res, 200, { session_id: o.session_id, graph: o.graph, metadata: o.metadata });

      } else if (method === 'GET' && pathname.startsWith('/api/visualization/work/') && pathname.endsWith('/dag')) {
        const workId = pathname.split('/')[4] || '';
        const i = Object.assign(new GetVisualizedAgentDAGInput(), {
          work_id: workId,
          resolve_content: params.get('resolve_content') !== 'false',
        });
        const o = new GetVisualizedAgentDAGOutput();
        await ctx.visualizationAccess.soVisualizedAgentDAG(i, o, new VisualizationContext());
        sendJson(res, 200, o.dag);

      } else if (method === 'GET' && pathname.startsWith('/api/visualization/work/') && pathname.endsWith('/timeline')) {
        const workId = pathname.split('/')[4] || '';
        const i = Object.assign(new GetVisualizedWorkFlowInput(), { work_id: workId });
        const o = new GetVisualizedWorkFlowOutput();
        await ctx.visualizationAccess.soVisualizedWorkFlow(i, o, new VisualizationContext());
        sendJson(res, 200, o.timeline);

      } else if (method === 'GET' && pathname.startsWith('/api/visualization/agent/') && pathname.endsWith('/trace')) {
        const agentId = pathname.split('/')[4] || '';
        const i = Object.assign(new GetAgentTraceInput(), {
          agent_id: agentId,
          trace_id: params.get('trace_id') || undefined,
        });
        const o = new GetAgentTraceOutput();
        await ctx.visualizationAccess.soAgentTrace(i, o, new VisualizationContext());
        sendJson(res, 200, o.trace);

      } else if (method === 'GET' && pathname === '/api/visualization/message-dag') {
        const i = Object.assign(new GetVisualizedMessageDAGInput(), {
          session_id: params.get('session_id') || '',
          work_id: params.get('work_id') || undefined,
          include_question_answer_edges: params.get('include_question_answer_edges') !== 'false',
          include_citation_edges: params.get('include_citation_edges') !== 'false',
          max_nodes: params.get('max_nodes') ? parseInt(params.get('max_nodes')!, 10) : undefined,
        });
        const o = new GetVisualizedMessageDAGOutput();
        await ctx.visualizationAccess.soVisualizedMessageDAG(i, o, new VisualizationContext());
        sendJson(res, 200, { session_id: o.session_id, graph: o.graph, metadata: o.metadata });

      } else if (method === 'GET' && pathname.startsWith('/api/visualization/resource/')) {
        const parts = pathname.split('/').filter(Boolean);
        const resourceType = parts[3] || '';
        const resourceId = parts[4] || '';
        const i = Object.assign(new GetResourceInput(), { resource_type: resourceType, resource_id: resourceId });
        const o = new GetResourceOutput();
        await ctx.visualizationAccess.soResource(i, o, new VisualizationContext());
        sendJson(res, 200, o.resource);

      } else if (method === 'POST' && pathname === '/api/vectordb/search') {
        const searchText = typeof body.text === 'string' ? body.text.trim() : '';
        if (!searchText) {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }
        try {

          const vectorConfigRows = ctx.relationDb.queryRaw<{ llm_id: string }>(
            'SELECT "llm_id" FROM "info_vector_config" LIMIT 1',
            [],
          );
          if (vectorConfigRows.length === 0 || !vectorConfigRows[0].llm_id) {
            sendJson(res, 400, { error: '未配置向量化模型：请在「配置中心 > 记忆 > 向量化」中选择一个 embedding 类型模型（llm_id）后再进行语义搜索' });
            return;
          }

          const topK = typeof body.top_k === 'number' && body.top_k > 0 ? body.top_k : 10;
          const threshold = typeof body.similarity_threshold === 'number' ? body.similarity_threshold : undefined;
          const input = Object.assign(new SimilarKInfoInput(), {
            info: searchText,
            topK,
            similarity_threshold: threshold,
          });
          const output = new SimilarKInfoOutput();
          await ctx.infoCore.similarKInfo(input, output, new InfoCoreContext());

          sendJson(res, 200, {
            results: output.list.map((r: any) => ({
              info_id: r.info_id,
              info_type: r.info_type,
              info_creator_role: r.info_creator_role,
              info_creator_id: r.info_creator_id,
              info: r.info,
              info_length: r.info_length,
              created: r.created,
              session_id: r.session_id,
              work_id: r.work_id,
              run_id: r.run_id,
              score: r.score,
              matched_chunks: r.matched_chunks,
            })),
            count: output.list.length,
          });
        } catch (err: any) {
          sendJson(res, 500, { error: err.message || 'Vector search failed' });
        }

      } else if (method === 'GET' && pathname === '/api/bookmark/tree') {
        const bmCtx = new BookmarkContext();
        const treeOut = new SoTreeOutput();
        await ctx.bookmarkAccess.soTree(new SoTreeInput(), treeOut, bmCtx);
        sendJson(res, 200, { tree: treeOut.tree });

      } else if (method === 'GET' && pathname === '/api/bookmark/folders') {
        const bmCtx = new BookmarkContext();
        const foldersOut = new SoFlatFoldersOutput();
        await ctx.bookmarkAccess.soFlatFolders(new SoFlatFoldersInput(), foldersOut, bmCtx);
        sendJson(res, 200, { folders: foldersOut.folders });

      } else if (method === 'POST' && pathname === '/api/bookmark/folder') {
        const bmCtx = new BookmarkContext();
        const folderOut = new AddFolderOutput();
        await ctx.bookmarkAccess.addFolder(
          Object.assign(new AddFolderInput(), { name: body.name || '', parent_id: body.parent_id || '' }),
          folderOut, bmCtx,
        );
        sendJson(res, 200, folderOut.folder);

      } else if (method === 'PUT' && pathname === '/api/bookmark/folder/update') {
        const bmCtx = new BookmarkContext();
        await ctx.bookmarkAccess.updateFolder(
          Object.assign(new UpdateFolderInput(), { id: body.id || '', name: body.name || '' }),
          new UpdateFolderOutput(), bmCtx,
        );
        sendJson(res, 200, {});

      } else if (method === 'DELETE' && pathname === '/api/bookmark/folder') {
        const bmCtx = new BookmarkContext();
        await ctx.bookmarkAccess.delFolder(
          Object.assign(new DelFolderInput(), { id: body.id || '' }),
          new DelFolderOutput(), bmCtx,
        );
        sendJson(res, 200, {});

      } else if (method === 'POST' && pathname === '/api/bookmark/item') {
        const bmCtx = new BookmarkContext();
        const itemOut = new AddItemOutput();
        await ctx.bookmarkAccess.addItem(
          Object.assign(new AddItemInput(), { folder_id: body.folder_id || '', title: body.title || '', url: body.url || '', favicon: body.favicon || '' }),
          itemOut, bmCtx,
        );
        sendJson(res, 200, itemOut.item);

      } else if (method === 'PUT' && pathname === '/api/bookmark/item/update') {
        const bmCtx = new BookmarkContext();
        await ctx.bookmarkAccess.updateItem(
          Object.assign(new UpdateItemInput(), { id: body.id || '', title: body.title || '', url: body.url || '' }),
          new UpdateItemOutput(), bmCtx,
        );
        sendJson(res, 200, {});

      } else if (method === 'PUT' && pathname === '/api/bookmark/item/move') {
        const bmCtx = new BookmarkContext();
        await ctx.bookmarkAccess.moveItem(
          Object.assign(new MoveItemInput(), { id: body.id || '', target_folder_id: body.target_folder_id || '' }),
          new MoveItemOutput(), bmCtx,
        );
        sendJson(res, 200, {});

      } else if (method === 'DELETE' && pathname === '/api/bookmark/item') {
        const bmCtx = new BookmarkContext();
        await ctx.bookmarkAccess.delItem(
          Object.assign(new DelItemInput(), { id: body.id || '' }),
          new DelItemOutput(), bmCtx,
        );
        sendJson(res, 200, {});
      } else if (method === 'POST' && pathname === '/api/tool/id') {
        const count = Math.max(1, Math.min(Number(body.count ?? 1) || 1, 1000));
        const idsOut = new GenerateIdsOutput();
        await ctx.toolAccess.generateIds(Object.assign(new GenerateIdsInput(), { count }), idsOut, new ToolContext());
        sendJson(res, 200, { ids: idsOut.ids });

      } else if (method === 'POST' && pathname === '/api/tool/json/check') {
        const tOut = new JsonCheckOutput();
        await ctx.toolAccess.jsonCheck(Object.assign(new JsonCheckInput(), { text: body.text ?? '' }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'POST' && pathname === '/api/tool/json/format') {
        const tOut = new JsonFormatOutput();
        await ctx.toolAccess.jsonFormat(Object.assign(new JsonFormatInput(), { text: body.text ?? '', indent: Number(body.indent ?? 2) }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'POST' && pathname === '/api/tool/json/minify') {
        const tOut = new JsonMinifyOutput();
        await ctx.toolAccess.jsonMinify(Object.assign(new JsonMinifyInput(), { text: body.text ?? '' }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'POST' && pathname === '/api/tool/xml/check') {
        const tOut = new XmlCheckOutput();
        await ctx.toolAccess.xmlCheck(Object.assign(new XmlCheckInput(), { text: body.text ?? '' }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'POST' && pathname === '/api/tool/xml/format') {
        const tOut = new XmlFormatOutput();
        await ctx.toolAccess.xmlFormat(Object.assign(new XmlFormatInput(), { text: body.text ?? '', indent: Number(body.indent ?? 2) }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'POST' && pathname === '/api/tool/xml/minify') {
        const tOut = new XmlMinifyOutput();
        await ctx.toolAccess.xmlMinify(Object.assign(new XmlMinifyInput(), { text: body.text ?? '' }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'POST' && pathname === '/api/tool/regex') {
        const tOut = new RegexMatchOutput();
        await ctx.toolAccess.regexMatch(Object.assign(new RegexMatchInput(), { pattern: body.pattern ?? '', text: body.text ?? '', flags: body.flags ?? '' }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'POST' && pathname === '/api/tool/cron/check') {
        const tOut = new CronCheckOutput();
        await ctx.toolAccess.cronCheck(Object.assign(new CronCheckInput(), { expr: body.expression ?? body.cron ?? '' }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'POST' && pathname === '/api/tool/cron/generate') {
        const tOut = new CronGenerateOutput();
        await ctx.toolAccess.cronGenerate(Object.assign(new CronGenerateInput(), {
          fields: {
            second: body.second ?? '*', minute: body.minute ?? '*', hour: body.hour ?? '*',
            day: body.day ?? '*', month: body.month ?? '*', week: body.week ?? '*',
          },
        }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'POST' && pathname === '/api/tool/cron/parse') {
        const tOut = new CronParseOutput();
        await ctx.toolAccess.cronParse(Object.assign(new CronParseInput(), { expr: body.expression ?? body.cron ?? '' }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'POST' && pathname === '/api/tool/cron/next') {
        const tOut = new CronNextOutput();
        await ctx.toolAccess.cronNext(Object.assign(new CronNextInput(), { expr: body.expression ?? body.cron ?? '', from_ms: typeof body.from_ms === 'number' ? body.from_ms : undefined }), tOut, new ToolContext());
        sendJson(res, 200, tOut.result);

      } else if (method === 'GET' && pathname === '/api/cron/tasks') {
        const output = new ListCronTasksOutput();
        await ctx.cronAccess.listCronTasks(new ListCronTasksInput(), output, new CronContext());
        sendJson(res, 200, { tasks: output.tasks });

      } else if (method === 'GET' && pathname.startsWith('/api/cron/tasks/')) {
        const parts = pathname.split('/').filter(Boolean);
        const name = parts[parts.length - 1];
        if (parts.length === 5 && parts[parts.length - 1] === 'runs') {
          const input = Object.assign(new ListCronTaskRunsInput(), {
            name: parts[3],
            limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : 50,
          });
          const output = new ListCronTaskRunsOutput();
          await ctx.cronAccess.listCronTaskRuns(input, output, new CronContext());
          sendJson(res, 200, { runs: output.runs });
        } else {
          const input = Object.assign(new GetCronTaskInput(), { name });
          const output = new GetCronTaskOutput();
          await ctx.cronAccess.soCronTask(input, output, new CronContext());
          sendJson(res, 200, { task: output.task });
        }

      } else if (method === 'PUT' && /\/api\/cron\/tasks\/[^/]+\/enabled$/.test(pathname)) {
        const name = pathname.split('/').filter(Boolean)[3];
        const input = Object.assign(new SetCronTaskEnabledInput(), { name, enabled: !!body.enabled });
        const output = new SetCronTaskEnabledOutput();
        await ctx.cronAccess.setCronTaskEnabled(input, output, new CronContext());
        sendJson(res, 200, { task: output.task });

      } else if (method === 'PUT' && pathname.startsWith('/api/cron/tasks/')) {
        const name = pathname.split('/').filter(Boolean)[3];
        const input = Object.assign(new SetCronTaskInput(), { name, cron: body.cron });
        const output = new SetCronTaskOutput();
        await ctx.cronAccess.setCronTask(input, output, new CronContext());
        sendJson(res, 200, { task: output.task });

      } else if (method === 'POST' && /\/api\/cron\/tasks\/[^/]+\/trigger$/.test(pathname)) {
        const name = pathname.split('/').filter(Boolean)[3];
        const input = Object.assign(new TriggerCronTaskInput(), { name });
        const output = new TriggerCronTaskOutput();
        await ctx.cronAccess.triggerCronTask(input, output, new CronContext());
        sendJson(res, 200, { run: output.run });

      } else if (method === 'GET' && !serveFrontend(res, pathname)) {
        sendJson(res, 404, { error: `Route not found: ${method} ${pathname}` });
      } else {
        sendJson(res, 404, { error: `Route not found: ${method} ${pathname}` });
      }
    } catch (err: any) {
      fileLogger.error('[dev-server] Error:', err.message);
      sendJson(res, 500, { error: err.message || 'Internal server error' });
    }
  });
}

async function main() {
  fileLogger.info('[dev-server] Initializing brian-backend (real backends, no mocks)...');
  const ctx = await buildContext();

  if (process.env.BRIAN_SEED_FILE) {
    try {
      const seedResult = await applySystemSeed(ctx.relationDb, process.env.BRIAN_SEED_FILE);
      for (const { table, rows } of seedResult.imported) {
        fileLogger.info(`[dev-server] 系统数据种子已导入: ${table} (${rows} 行)`);
      }
      if (seedResult.skipped.length > 0) {
        fileLogger.info(`[dev-server] 系统数据种子跳过非空表: ${seedResult.skipped.join(', ')}`);
      }
    } catch (e) {
      fileLogger.warn(`[dev-server] 系统数据种子导入失败（不影响启动）: ${(e as Error).message}`);
    }
  }

  const server = createServer(ctx);

  server.timeout = 0;
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.keepAliveTimeout = 120000;

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      ws.send(data);
    });
  });

  const PORT = parseInt(process.env.BRIAN_PORT || '8000', 10);
  const HOST = process.env.BRIAN_HOST || '127.0.0.1';

  server.listen(PORT, HOST, () => {
    fileLogger.info(`[dev-server] brian-backend running at http://${HOST}:${PORT}`);
    fileLogger.info(`[dev-server] Data directory: ${DATA_DIR}`);

    if (process.env.BRIAN_CDT_AUTO === '0') {
      fileLogger.info('[dev-server] BRIAN_CDT_AUTO=0，跳过 CDT 自动启动');
    } else {
      try {
      import('./Base/CDTProvider/domain/types').then(async (t) => {
        const { CDTContext, StartCDTInput, StartCDTOutput } = t;
        const o = new StartCDTOutput();
        await ctx.cdtAccess.startCDT(new StartCDTInput(), o, new CDTContext());
        if (!o.error) {
          fileLogger.info(`[dev-server] CDT started on port ${o.port}, endpoint: ${o.endpoint}`);
        } else {
          fileLogger.warn(`[dev-server] CDT start failed: ${o.error}`);
        }
      });
      } catch (err) {
        fileLogger.warn('[dev-server] main CDT 动态导入/启动失败（容忍：CDT 不阻塞主服务）', err instanceof Error ? err.message : String(err));
      }
      }
  });

  const gracefulShutdown = (signal: string) => {
    fileLogger.info(`[dev-server] Shutting down (${signal})...`);
    const finish = () => server.close(() => process.exit(0));
    try {

      ctx.mcpAccess.stopAllMcp().then((count) => {
        if (count > 0) fileLogger.info(`[dev-server] MCP stopped (${count})`);
      }).catch(() => {}).finally(() => {

        import('./Base/CDTProvider/domain/types').then(async (t) => {
          const { CDTContext, StopCDTInput, StopCDTOutput } = t;
          await ctx.cdtAccess.stopCDT(new StopCDTInput(), new StopCDTOutput(), new CDTContext());
          fileLogger.info('[dev-server] CDT stopped');
        }).catch(() => {}).finally(finish);
      });
    } catch {
      finish();
    }
  };
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

main().catch((err) => {
  fileLogger.error('[dev-server] Fatal error:', err);

  if (err instanceof Error) {
    fileLogger.error('[dev-server] Fatal detail:', `${err.message}\n${err.stack}`);
  }

  // eslint-disable-next-line no-console
  console.error('[dev-server] Fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
