/**
 * Brian-Agent Development Server
 * Starts an HTTP server on port 8000 with real backends (no mocks).
 */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { WebSocketServer } from 'ws';

import { IdGenerator, ToolAccess, HttpAccess, SystemMonitorAccess, ToolSchemaInitializer, ConfigService, TOOL_CONFIG_TABLE, InfoType, Operator } from '@brian-agent/base';
import { RelationDBAccess } from './Base/RelationDBProvider';
import {
  SessionAccess,
  ToolAccess as RuntimeToolAccess,
  RegisterBuiltinToolsInput,
  RegisterBuiltinToolsOutput,
  ToolContext as RuntimeToolContext,
  LoopAccess,
  AgentDefAccess,
  RunGatewayAccess,
  RunGatewayContext,
  AnswerPermissionInput,
  AnswerPermissionOutput,
} from './Runtime';
import type { LoopQueue } from './Runtime';
import { applySystemSeed } from './seed/systemSeed';
import { LLMAccess } from './Base/LLMProvider';
import { MCPAccess } from './Base/MCPProvider';
import { SoulAccess } from './Base/SoulProvider';
import { SkillAccess } from './Base/SkillProvider';
import { PromptsAccess, AddPromptInput, DelPromptInput, UpdatePromptInput } from './Base/PromptsProvider';
import { GraphDBAccess } from './Base/GraphDBProvider';
import { MQAccess, SendMQInput, SendMQOutput, ConsumeMQInput, ConsumeMQOutput, GetQueueStatsInput, GetQueueStatsOutput, AckMQInput, AckMQOutput, MQContext } from './Base/MQProvider';
import { LogAccess, LogContext, DelLogInput, DelLogOutput } from './Base/LogProvider';
import { VectorDBAccess } from './Base/VectorDBProvider';
import { CDTAccess } from './Base/CDTProvider';
import { BookmarkAccess } from './Base/BookmarkProvider';
import {
  SoTreeInput, SoTreeOutput, SoFlatFoldersInput, SoFlatFoldersOutput,
  AddFolderInput, AddFolderOutput, AddItemInput, AddItemOutput,
  UpdateFolderInput, UpdateFolderOutput, UpdateItemInput, UpdateItemOutput,
  DelFolderInput, DelFolderOutput, DelItemInput, DelItemOutput,
  MoveItemInput, MoveItemOutput, BookmarkContext,
} from './Base/BookmarkProvider/domain/types';
import {
  GenerateIdsInput, GenerateIdsOutput, JsonCheckInput, JsonCheckOutput,
  JsonFormatInput, JsonFormatOutput, JsonMinifyInput, JsonMinifyOutput,
  XmlCheckInput, XmlCheckOutput, XmlFormatInput, XmlFormatOutput,
  XmlMinifyInput, XmlMinifyOutput, RegexMatchInput, RegexMatchOutput,
  CronCheckInput, CronCheckOutput, CronGenerateInput, CronGenerateOutput,
  CronParseInput, CronParseOutput, CronNextInput, CronNextOutput, ToolContext,
} from './Base/ToolProvider/domain/types';
import {
  SoResourceInput, SoResourceOutput, SystemMonitorContext,
} from './Base/ToolProvider/domain/SystemMonitorTypes';
import { ExecRequestInput, ExecRequestOutput, HttpContext } from './Base/ToolProvider/domain/HttpTypes';
import { ChunkAccess } from './Base/ChunkProvider';
import { CronAccess } from './Base/CronProvider';
import {
  StreamAccess,
  RegisterStreamInput,
  RegisterStreamOutput,
  StreamContext,
  CloseStreamInput,
  CloseStreamOutput,
  PushEventToEndpointInput,
  PushEventToEndpointOutput,
} from './Base/StreamProvider';
import { Report } from './Base/shared/base/Report';
import {
  CronContext, ListCronTasksInput, ListCronTasksOutput,
  GetCronTaskInput, GetCronTaskOutput,
  SetCronTaskInput, SetCronTaskOutput,
  SetCronTaskEnabledInput, SetCronTaskEnabledOutput,
  TriggerCronTaskInput, TriggerCronTaskOutput,
  ListCronTaskRunsInput, ListCronTaskRunsOutput,
} from './Base/CronProvider';
import { InfoCoreAccess, DelInfoInput, DelInfoOutput, InfoCoreContext, SimilarKInfoInput, SimilarKInfoOutput, RebuildCooccurGraphInput, RebuildCooccurGraphOutput, DelInfoGraphInput, DelInfoGraphOutput, RebuildCitationGraphInput, RebuildCitationGraphOutput, ClearGraphInput, ClearGraphOutput } from './Core/InfoCoreProvider';
import { LLMCoreAccess } from './Core/LLMCoreProvider';
import { MCPCoreAccess } from './Core/MCPCoreProvider';
import { SkillCoreAccess, SkillCoreContext, AgeSkillInput, AgeSkillOutput } from './Core/SkillCoreProvider';
import { SoulCoreAccess, SoulCoreContext, AgeSoulInput, AgeSoulOutput } from './Core/SoulCoreProvider';
import { MQCoreAccess } from './Core/MQCoreProvider';
import { CDTCoreAccess } from './Core/CDTCoreProvider';
import { AgentLibraryAccess } from './Agent/AgentLibrary';
import { AgentStrategyAccess, SoStrategyInput, SoStrategyOutput, ToggleStrategyInput, ToggleStrategyOutput, AgentStrategyContext } from './Agent/AgentStrategy';
import { AgentBuilderAccess } from './Agent/AgentBuilder';
import {
  AgentBuilderContext,
  BuildSystemAgentInput, BuildSystemAgentOutput,
} from './Agent/AgentBuilder';
import { AgentExecutionAccess } from './Agent/AgentExecution';
import { PromptRebuilder } from './Agent/AgentExecution/application/trace/PromptRebuilder';
import { AgentContextAccess } from './Agent/AgentContext';
import { PlannerAgentAccess } from './Agent/PlannerAgent';
import { WriterAgentAccess } from './Agent/WriterAgent';
import { EvolutorAgentAccess } from './Agent/EvolutorAgent';
import { SummaryAgentAccess, SummaryAgentContext } from './Agent/SummaryAgent';
import { IntentAgentAccess, IntentAgentContext } from './Agent/IntentAgent';

// Application layer
import { ChatAccess } from './Application/Chat/access/ChatAccess';
import { ChatSchemaInitializer } from './Application/Chat/infrastructure/ChatSchemaInitializer';
import { ConfigAccess } from './Application/Config/access/ConfigAccess';
import { SelfLearningAccess } from './Application/SelfLearning/access/SelfLearningAccess';
import {
  SelfLearningContext,
  ListLearningTasksInput, ListLearningTasksOutput,
  AddLibraryInput, AddLibraryOutput,
  DeleteLibraryInput, DeleteLibraryOutput,
  SearchLibraryInput, SearchLibraryOutput,
  SetLibraryEnabledInput, SetLibraryEnabledOutput,
  GetLibraryFilesInput, GetLibraryFilesOutput,
  GetLibraryTreeInput, GetLibraryTreeOutput,
  GetFileContentInput, GetFileContentOutput,
  QueryDocumentInput, QueryDocumentOutput,
  SaveAnnotationInput, SaveAnnotationOutput,
  GetFileAnnotationsInput, GetFileAnnotationsOutput,
  StartLearningInput, StartLearningOutput,
  StopLearningInput, StopLearningOutput,
  GetLearningProgressInput, GetLearningProgressOutput,
  GetLearningResultsInput, GetLearningResultsOutput,
  GetLearningStatsInput, GetLearningStatsOutput,
  ConfigSelfLearningInput, ConfigSelfLearningOutput,
} from './Application/SelfLearning/domain/types';
import { UserProfileAccess } from './Application/UserProfile/access/UserProfileAccess';
import {
  UserProfileContext,
  GetUserProfileInput, GetUserProfileOutput,
  GenerateProfileInput, GenerateProfileOutput,
  SaveUserPreferenceInput, SaveUserPreferenceOutput,
  GetProfileHistoryInput, GetProfileHistoryOutput,
  GetProfileByVersionInput, GetProfileByVersionOutput,
  ResetUserProfileInput, ResetUserProfileOutput,
  ConfigProfileDirectionInput, ConfigProfileDirectionOutput,
  DeleteProfileDirectionInput, DeleteProfileDirectionOutput,
  GetProfileDirectionInput, GetProfileDirectionOutput,
} from './Application/UserProfile/domain/types';
import { VisualizationAccess } from './Application/Visualization/access/VisualizationAccess';
import {
  VisualizationContext,
  GetVisualizedMessagesInput, GetVisualizedMessagesOutput,
  GetVisualizedMessageGraphInput, GetVisualizedMessageGraphOutput,
  GetVisualizedAgentDAGInput, GetVisualizedAgentDAGOutput,
  GetVisualizedWorkFlowInput, GetVisualizedWorkFlowOutput,
  GetAgentTraceInput, GetAgentTraceOutput,
  GetVisualizedMessageDAGInput, GetVisualizedMessageDAGOutput,
  GetResourceInput, GetResourceOutput,
  GraphVisualizationConfigInput, GraphVisualizationConfigOutput,
  ConfigVisualizationInput, ConfigVisualizationOutput,
} from './Application/Visualization/domain/types';

// Config types
import {
  ConfigContext,
  GetConfigDetailInput, GetConfigDetailOutput,
  GetConfigItemInput, GetConfigItemOutput,
  UpdateConfigInput, UpdateConfigOutput,
} from './Application/Config/domain/types';
import { ALL_CONFIG_REGISTRATIONS } from './Application/Config/domain/configRegistrations';

// Provider value types (need runtime instantiation)
import { LLMContext, ListLLMInput, ListLLMOutput, AddLLMProviderInput, AddLLMProviderOutput, UpdateLLMProviderInput, UpdateLLMProviderOutput, DelLLMProviderInput, DelLLMProviderOutput, SoLLMProviderInput, SoLLMProviderOutput, TestLLMProviderInput, TestLLMProviderOutput, GetLLMInput, GetLLMOutput, GenLLMAttrInput, GenLLMAttrOutput, LLMCacheRecord } from './Base/LLMProvider';
import { SoulContext, SoSoulInput, SoSoulOutput, AddSoulInput, AddSoulOutput, UpdateSoulInput, UpdateSoulOutput, DelSoulInput, DelSoulOutput } from './Base/SoulProvider';
import { SkillContext, SoSkillInput, SoSkillOutput, AddSkillInput, AddSkillOutput, UpdateSkillInput, UpdateSkillOutput, DelSkillInput, DelSkillOutput, ExecSkillInput, ExecSkillOutput } from './Base/SkillProvider';
import {
  McpContext, ListMcpInput, ListMcpOutput,
  SoMcpProviderInput, SoMcpProviderOutput,
  SoMcpInput, SoMcpOutput,
  AddMcpProviderInput, AddMcpProviderOutput,
  UpdateMcpProviderInput, UpdateMcpProviderOutput,
  DelMcpProviderInput, DelMcpProviderOutput,
  InstallMcpInput, InstallMcpOutput,
  StartMcpInput, StartMcpOutput,
  StopMcpInput, StopMcpOutput,
  StartMcpsInput, StartMcpsOutput,
  RefreshMcpStatusInput, RefreshMcpStatusOutput,
  GetMcpUsageInput, GetMcpUsageOutput,
  UninstallMcpInput, UninstallMcpOutput,
  UpgradeMcpInput, UpgradeMcpOutput,
  ExecMcpInput, ExecMcpOutput,
} from './Base/MCPProvider';
import {
  AgentLibraryContext, GetAgentInput, GetAgentOutput, DelAgentInput, DelAgentOutput, ToggleAgentInput, ToggleAgentOutput,
  AddAgentInput, AddAgentOutput, UpdateAgentInput, UpdateAgentOutput,
  VALID_AGENT_TYPES,
} from './Agent/AgentLibrary';

import {
  ChatContext,
  CreateSessionInput, CreateSessionOutput,
  DeleteSessionInput, DeleteSessionOutput,
  SearchSessionInput, SearchSessionOutput,
  GetSessionDetailInput, GetSessionDetailOutput,
  GetChatHistoryInput, GetChatHistoryOutput,
  SearchMessageInput, SearchMessageOutput,
  PinMessageInput, PinMessageOutput,
  OpenChatStreamInput, OpenChatStreamOutput,
  UpdateSessionTitleInput, UpdateSessionTitleOutput,
} from './Application/Chat/domain/types';

// 标准签名适配：execRequest(Input, Output, Context, ...) 简化为请求对象风格（模块级，路由层使用）
let _httpAccessRef: HttpAccess | null = null;
const httpReq = async (req: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }) => {
  const out = new ExecRequestOutput();
  const access = _httpAccessRef ?? new HttpAccess();
  await access.execRequest(
    Object.assign(new ExecRequestInput(), { url: req.url, method: req.method, headers: req.headers, body: req.body, timeout_ms: req.timeoutMs }),
    out, new HttpContext(),
  );
  return out.response;
};

const _seq = 0;
// 数据目录：优先环境变量（打包模式由打包入口注入到可执行文件旁），否则退回源码目录
const DATA_DIR = process.env.BRIAN_DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 日志文件目录：启动日志、定时任务日志、调试日志写入本地文件（不入库），
// 业务错误日志仍通过 LogProvider 持久化到 SQLite（brian_log.db）。
const LOG_DIR = process.env.BRIAN_LOG_DIR || path.join(DATA_DIR, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

/** 按天生成日志文件名（dev-server-YYYY-MM-DD.log） */
function formatLogDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 追加写入本地日志文件（启动/定时/调试日志），失败静默忽略 */
function writeFileLog(level: string, message: string, meta?: unknown): void {
  try {
    const ts = new Date().toISOString();
    let suffix = '';
    if (meta !== undefined && meta !== null) {
      suffix = ' ' + (typeof meta === 'string' ? meta : JSON.stringify(meta));
    }
    const file = path.join(LOG_DIR, `dev-server-${formatLogDate(new Date())}.log`);
    fs.appendFileSync(file, `[${ts}] [${level}] ${message}${suffix}\n`);
  } catch { /* ignore */ }
}

/** 文件日志器：debug/info/warn 写文件，error 仅作为兜底（业务错误仍走 DB） */
const fileLogger = {
  debug: (message: string, meta?: unknown) => writeFileLog('DEBUG', message, meta),
  info: (message: string, meta?: unknown) => writeFileLog('INFO', message, meta),
  warn: (message: string, meta?: unknown) => writeFileLog('WARN', message, meta),
  error: (message: string, meta?: unknown) => writeFileLog('ERROR', message, meta),
};

function createLogger(logAccess?: LogAccess): any {
  if (!logAccess) {
    return { debug: (..._a: any[]) => {}, info: (..._a: any[]) => {}, warn: (..._a: any[]) => {}, error: (..._a: any[]) => {} };
  }
  const rawService = logAccess.getRawService();
  const write = (level: string, message: string, meta?: unknown) => {
    let source = 'system';
    let metadata: Record<string, unknown> | undefined;
    let elapsed: number | undefined;
    let workId: string | undefined;
    let interactId: string | undefined;
    let traceId: string | undefined;
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      const m = meta as Record<string, unknown>;
      if (typeof m.source === 'string') source = m.source;
      if (typeof m.elapsed_ms === 'number') elapsed = m.elapsed_ms;
      if (typeof m.work_id === 'string') workId = m.work_id;
      if (typeof m.interact_id === 'string') interactId = m.interact_id;
      if (typeof m.trace_id === 'string') traceId = m.trace_id;
      metadata = { ...m, log_source: 'AOP' };
    } else if (meta !== undefined && meta !== null) {
      metadata = { detail: meta, log_source: 'SYSTEM' };
    } else {
      metadata = { log_source: 'SYSTEM' };
    }
    try {
      rawService.addLog(
        { data: { level, source, message, metadata, elapsed_ms: elapsed, work_id: workId, interact_id: interactId, trace_id: traceId } },
        {} as any,
        {} as any,
      ).catch(() => {});
    } catch { /* ignore */ }
  };
  return {
    // 所有日志点统一经 LogProvider 提交，由 LogProvider 依据配置的 min_level 决定是否入库。
    // 不再在入口层分流：DEBUG/INFO/WARN/ERROR 一律走 LogProvider.addLog，
    // 是否落库由 log_config.min_level 统一控制（默认 DEBUG，全量入库；调高后低级别自动丢弃）。
    debug: (message: string, meta?: unknown) => write('DEBUG', message, meta),
    info: (message: string, meta?: unknown) => write('INFO', message, meta),
    warn: (message: string, meta?: unknown) => write('WARN', message, meta),
    error: (message: string, meta?: unknown) => write('ERROR', message, meta),
    // 级别参数化入口（2026-09-05）：Metrics 经 log(level, …) 调用 LogProvider，级别显式携带
    log: (level: string, message: string, meta?: unknown) => write(level, message, meta),
  };
}

function addColIfMissing(relationDb: import('./Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess, table: string, column: string, type: string): void {
  try { relationDb.executeRaw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`); } catch { /* exists */ }
}

/** 前端学习模式值 → 后端学习模式 */
function mapLearningMode(mode: string): string {
  const m = (mode || '').toLowerCase();
  if (m.includes('document')) return 'DOCUMENT';
  if (m.includes('conversation')) return 'CONVERSATION';
  if (m.includes('tag')) return 'TAG_MAINTENANCE';
  return 'ALL';
}

/** 后端学习模式 → 配置中对应的自动学习开关字段名 */
function mapAutoField(mode: string): string {
  if (mode === 'DOCUMENT') return 'document_auto_enable';
  if (mode === 'CONVERSATION') return 'conversation_auto_enable';
  if (mode === 'TAG_MAINTENANCE') return 'tag_auto_enable';
  return '';
}

/** 后端学习模式 → 配置中对应的随机因子字段名 */
function mapRandomFactorField(mode: string): string {
  if (mode === 'DOCUMENT') return 'document_random_factor';
  if (mode === 'CONVERSATION') return 'conversation_random_factor';
  if (mode === 'TAG_MAINTENANCE') return 'tag_random_factor';
  return '';
}

/**
 * info_raw 行 → 前端 MemoryItem（记忆条目）。
 *
 * info_type（REQUEST/RESPONSE/THINK/REFLECT/ACT/SKILL/MCP）映射到前端展示类型
 * （semantic/episodic/procedural/working），仅用于颜色与分类展示。
 */
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
  return {
    id: row.info_id || row.id,
    type,
    content: info,
    tags,
    confidence: computeMemoryConfidence(row.info_type, tags, info.length, Number(row.pin) || 0),
    createdAt: Number(row.created) || 0,
    updatedAt: Number(row.updated) || 0,
  };
}

/**
 * 计算单条记忆的置信度（0-1）。
 *
 * 置信度 = 来源可信度（info_type 基础分） + 语义加工增益，取值收敛到 [0.05, 0.95]。
 * - 来源可信度：越接近「用户原话 / 自我学习沉淀」可信度越高，内部思考（THINK/REFLECT）
 *   等中间产物可信度较低。
 * - 语义加工增益：标签越丰富、内容越完整、被用户钉住，说明该记忆经过更多加工/被认可，
 *   可信度相应提升。
 */
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

/** 批量查询 info_tag，返回 info_id → tag[] 映射 */
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

/**
 * 从 SQLite 配置表 info_vector_config 读取向量维度。
 *
 * 向量维度统一由配置系统（info_core.vector_config.dimension）管理，向量表（LanceDB）
 * 按其创建；此处仅在 infoCore 初始化后从 SQLite 读取，作为向量表的维度来源。
 */
function readVectorDimension(relationDb: import('./Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess): number {
  try {
    const rows = relationDb.queryRaw<{ dimension: number }>(
      'SELECT "dimension" FROM "info_vector_config" LIMIT 1', [],
    );
    if (rows.length > 0 && Number(rows[0].dimension) > 0) {
      return Number(rows[0].dimension);
    }
  } catch { /* table may not exist yet */ }
  return 1536;
}

/**
 * 从 GraphDB 读取某类文本的共现图（节点 + 共现边），组装为前端所需的
 * `{ nodes, edges }` 结构。节点与边的图结构、节点属性（频次）与共现权重
 * 完全来自 GraphDB，不再依赖关系数据库。
 *
 * 支持 limit（默认 100）：按频次降序取前 limit 个节点，并只返回这些节点之间的边，
 * 避免节点过多导致前端图不可观测。
 */
async function buildCooccurGraphFromGraphDB(
  ctx: any,
  nodeType: string,
  textField: string,
  edgeType: string,
  limit = 100,
): Promise<{ nodes: Array<{ id: string; name: string; weight: number; degree: number }>; edges: Array<{ source: string; target: string; weight: number }> }> {
  const { GraphContext, SelectGraphOutput, GraphTarget } = await import('./Base/GraphDBProvider/domain/types');

  // 1. 读节点（GraphDB，含频次属性 freq）
  const nodeOut = new SelectGraphOutput();
  await ctx.graphDBAccess.selectGraph(
    { target: GraphTarget.NODE, node_type: nodeType },
    nodeOut,
    new GraphContext(),
  );
  const allNodes = (nodeOut.list as Array<{ id: string; content?: Record<string, unknown> }>)
    .map((n) => ({ id: n.id, text: String(n.content?.[textField] ?? ''), freq: Number(n.content?.['freq'] ?? 0) }))
    .filter((n) => n.text);

  // 按频次降序取前 limit 个节点
  const rawNodes = [...allNodes].sort((a, b) => b.freq - a.freq).slice(0, Math.max(1, Math.floor(limit)));
  const keptIds = new Set(rawNodes.map((n) => n.id));

  // 2. 读共现边（GraphDB），只保留两端都在保留节点集合内的边
  const edgeOut = new SelectGraphOutput();
  await ctx.graphDBAccess.selectGraph(
    { target: GraphTarget.EDGE, edge_type: edgeType },
    edgeOut,
    new GraphContext(),
  );
  const rawEdges = (edgeOut.list as Array<{ from_node_id: string; to_node_id: string; weight: number }>)
    .filter((e) => keptIds.has(e.from_node_id) && keptIds.has(e.to_node_id));

  const idToText = new Map(rawNodes.map((n) => [n.id, n.text]));

  // 3. 度数（由保留的 GraphDB 共现边统计）
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

// 图谱数据内存缓存：避免 GraphDB 同步查询在高并发页面切换时阻塞事件循环
// （keywordCooccur 边 5288 条，每次 selectGraph 是 3 表 JOIN 同步 SQL，5 并发即超时）
const graphCache = new Map<string, { data: { nodes: Array<{ id: string; name: string; weight: number; degree: number }>; edges: Array<{ source: string; target: string; weight: number }> }; ts: number }>();
const GRAPH_CACHE_TTL = 30_000; // 30 秒

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

let runtimeGatewayRef: RunGatewayAccess;

async function buildContext() {
  // ---- Base Providers ----
  const relationDb = new RelationDBAccess({ dbPath: path.join(DATA_DIR, 'brian.db'), wal: true, autoCreateConfigTable: true });
  await relationDb.initialize();

  // LogProvider 独立存储于 brian_log.db 中，与业务 SQLite (brian.db) 物理隔离，避免高频日志写入影响业务
  const logRelationDb = new RelationDBAccess({ dbPath: path.join(DATA_DIR, 'brian_log.db'), wal: true, autoCreateConfigTable: true });
  await logRelationDb.initialize();

  const logAccess = new LogAccess(logRelationDb, createLogger());
  await logAccess.initialize();
  const logger = createLogger(logAccess);

  // PromptsProvider 需在 LLMProvider 之前创建，供 genLLMAttr 一键补全模型属性使用
  const promptsAccess = new PromptsAccess(relationDb, logger);
  await promptsAccess.initialize();

  const llmAccess = new LLMAccess(relationDb, logger, promptsAccess);
  await llmAccess.initialize();

  const mcpAccess = new MCPAccess(relationDb, logger);
  // 启动时通过 npm list -g 同步一次 mcp_install 表的安装状态（清理全局已卸载的 npm 记录）
  try {
    const synced = await mcpAccess.syncInstallStatus();
    if (synced > 0) logger.info('[startup] MCP sync', `清理了 ${synced} 条已卸载的 npm 安装记录`);
  } catch { /* best-effort */ }

  // 启动时重置遗留的 running 状态（崩溃/异常退出后进程已不存在）
  try {
    await mcpAccess.stopAllMcp();
  } catch { /* best-effort */ }

  const soulAccess = new SoulAccess(relationDb, logger);
  await soulAccess.initialize();

  const skillAccess = new SkillAccess(relationDb, logger);
  await skillAccess.initialize();

  const graphDBAccess = new GraphDBAccess(relationDb, { dbPath: path.join(DATA_DIR, 'graph.db') }, logger);
  await graphDBAccess.initialize();

  const mqAccess = new MQAccess(relationDb, logger);
  await mqAccess.initialize();

  // VectorDB with LanceDB backend（维度不在此硬编码，改为下方从 SQLite info_vector_config 读取）
  const vectorDBAccess = new VectorDBAccess(relationDb, {
    lancePath: path.join(DATA_DIR, 'vectordb'),
    metric: 'cosine',
    logger,
  });

  addColIfMissing(relationDb, 'skill_usage', 'agent_skill_id', 'TEXT');
  addColIfMissing(relationDb, 'skill_usage', 'timestamp', 'INTEGER');
  addColIfMissing(relationDb, 'soul_usage', 'soul_usage_type', 'TEXT');

  // CDT
  const cdtAccess = new CDTAccess(relationDb, DATA_DIR, logger);
  await cdtAccess.initialize();

  // Bookmark
  const bookmarkAccess = new BookmarkAccess(relationDb, logger);
  const toolAccess = new ToolAccess();
  // 系统资源采集（CPU / 内存 / 磁盘），供监控页「系统健康」展示真实数据
  const systemMonitorAccess = new SystemMonitorAccess(DATA_DIR);
  // 初始化 tool_config 表并创建 HTTP 请求入口（含可配置超时）
  new ToolSchemaInitializer(relationDb).init();
  const toolConfigService = new ConfigService(relationDb, TOOL_CONFIG_TABLE);
  await toolConfigService.initDefaults([
    { config_key: 'http_timeout_ms', config_value: '60000', value_type: 'INT', description: 'HTTP 请求默认超时时间（毫秒）' },
  ]);
  const httpAccess = new HttpAccess(toolConfigService);
  _httpAccessRef = httpAccess;
  // 标准签名适配：execRequest(Input, Output, Context, ...) 简化为请求对象风格
  const streamAccess = new StreamAccess(relationDb, logger);
  // Report 事件流网关（2026-09-05）：Report 只接收业务消息并携带 SSE 端点 ID，
  // 保存（stream_event 持久化/审计）、断线恢复重放、按端点 ID 投递由 StreamProvider 承载
  Report.setEventStreamGateway({
    pushToEndpoint: async (input) => {
      await streamAccess.publishEvent(
        Object.assign(new PushEventToEndpointInput(), input),
        new PushEventToEndpointOutput(),
        new StreamContext(),
      );
    },
  });

  // ---- Core Providers ----
  const infoCore = new InfoCoreAccess(relationDb, llmAccess, promptsAccess, vectorDBAccess, graphDBAccess, logger);
  await infoCore.initialize();

  // 存量数据回填：重建 GraphDB 共现边（cooccur），使「系统健康」GraphDB 的边数与标签图一致
  try {
    const rebuildOut = new RebuildCooccurGraphOutput();
    await infoCore.rebuildCooccurGraph(new RebuildCooccurGraphInput(), rebuildOut, new InfoCoreContext());
    if ((rebuildOut.rebuilt_edges ?? 0) > 0 || (rebuildOut.deleted_edges ?? 0) > 0) {
      logger.info('[startup] rebuild cooccur edges', `deleted=${rebuildOut.deleted_edges} rebuilt=${rebuildOut.rebuilt_edges}`);
    }
  } catch (e: any) {
    logger.warn('[startup] rebuild cooccur edges', 'failed', e?.message || String(e));
  }

  // 存量数据迁移：旧 info_graph 表引用边迁移到 GraphDB（CITATION），并删除旧表
  try {
    const citeOut = new RebuildCitationGraphOutput();
    await infoCore.rebuildCitationGraph(new RebuildCitationGraphInput(), citeOut, new InfoCoreContext());
    if ((citeOut.migrated_edges ?? 0) > 0 || citeOut.dropped_table) {
      logger.info('[startup] migrate citation edges', `migrated=${citeOut.migrated_edges} dropped_table=${citeOut.dropped_table}`);
    }
  } catch (e: any) {
    logger.warn('[startup] migrate citation edges', 'failed', e?.message || String(e));
  }

  // WAL checkpoint：启动期批量重建/迁移后回收 WAL 文件磁盘空间
  try {
    for (const db of [relationDb, logRelationDb]) {
      const result = db.walCheckpoint('TRUNCATE');
      logger.info('[startup] WAL checkpoint', `busy=${result.busy} log=${result.log} checkpointed=${result.checkpointed}`);
    }
  } catch (e: any) {
    logger.warn('[startup] WAL checkpoint', 'failed', e?.message || String(e));
  }

  // 向量维度统一由 SQLite 的 info_vector_config.dimension 管理（配置中心可修改），
  // 读取后作为向量表（LanceDB）的维度来源初始化。
  const vectorDimension = readVectorDimension(relationDb);
  await vectorDBAccess.initialize(vectorDimension);

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
  const agentBuilder = new AgentBuilderAccess(relationDb, llmAccess, promptsAccess, agentLibrary, agentStrategy, llmCore, mcpCore, skillCore, soulCore, logger, infoCore, streamAccess);
  await agentBuilder.initialize();
  const agentExecution = new AgentExecutionAccess(relationDb, llmAccess, promptsAccess, skillAccess, soulAccess, mcpAccess, mqAccess, agentLibrary, agentStrategy, infoCore, mqCore, skillCore, mcpCore, llmCore, cdtCore, logger, streamAccess);
  await agentExecution.initialize();
  const writerAgent = new WriterAgentAccess(relationDb, llmAccess, promptsAccess, infoCore, agentBuilder, agentLibrary, soulAccess, llmCore, logger, streamAccess);
  await writerAgent.initialize();
  const plannerAgent = new PlannerAgentAccess(relationDb, llmAccess, promptsAccess, infoCore, agentBuilder, agentLibrary, llmCore, logger);
  await plannerAgent.initialize();
  const evolutorAgent = new EvolutorAgentAccess(relationDb, llmAccess, promptsAccess, infoCore, mqAccess, mqCore, agentBuilder, agentLibrary, agentExecution, llmCore, logger);
  await evolutorAgent.initialize();
  const summaryAgent = new SummaryAgentAccess(relationDb, llmAccess, promptsAccess, soulAccess, agentBuilder, agentLibrary, infoCore, llmCore, logger);
  await summaryAgent.initialize();
  const intentAgent = new IntentAgentAccess(relationDb, llmAccess, promptsAccess, soulAccess, agentBuilder, agentLibrary, infoCore, llmCore, logger);

  // ---- Pre-build system agents (ensure they appear in agent list on first page load) ----
  try {
    for (const agentType of ['PLANNER', 'WRITER', 'EVOLUTOR', 'SUMMARY', 'INTENT'] as const) {
      await agentBuilder.buildSystemAgent(
        Object.assign(new BuildSystemAgentInput(), { agent_type: agentType }),
        new BuildSystemAgentOutput(),
        new AgentBuilderContext(),
      );
    }
  } catch (e) {
    logger.warn('preBuildSystemAgents', 'failed to pre-build some system agents', String(e));
  }

  // ---- Pre-build SummaryAgent & IntentAgent（内置不可变 Agent，同步生成内置 Soul 与 Prompt） ----
  try {
    await summaryAgent.ensureBuiltin(new SummaryAgentContext());
    await intentAgent.ensureBuiltin(new IntentAgentContext());
  } catch (e) {
    logger.warn('preBuildSystemAgents', 'failed to pre-build SummaryAgent/IntentAgent', String(e));
  }


  // ---- Application Layer ----
  new ChatSchemaInitializer(relationDb).init();
  // ---- Runtime v2（编排内核；Chat v2 分流依赖）----
  const runtimeSessionAccess = new SessionAccess(relationDb, logger);
  await runtimeSessionAccess.initialize();
  const runtimeToolAccess = new RuntimeToolAccess(relationDb, {
    skillAccess,
    mcpAccess,
    cdtCore,
    // delegate 子代理委派：迟绑定 gateway（构造顺序 Tool→Loop→Gateway，运行期才调用）
    runGateway: {
      submitRun: async (input) => {
        const { SubmitRunInput, SubmitRunOutput, RunGatewayContext } = await import('./Runtime');
        const i = Object.assign(new SubmitRunInput(), {
          session_key: input.session_key,
          user_message: input.user_message,
          lane_kind: input.lane_kind,
          queue_mode: input.queue_mode,
        });
        await runtimeGatewayRef.submitRun(i, new SubmitRunOutput(), new RunGatewayContext());
      },
    },
  }, logger);
  await runtimeToolAccess.initialize();
  const builtinRegIn = new RegisterBuiltinToolsInput();
  builtinRegIn.enabled = ['skill_exec', 'mcp_exec', 'cdt_browser', 'update_plan', 'delegate'];
  const builtinRegOut = new RegisterBuiltinToolsOutput();
  await runtimeToolAccess.registerBuiltinTools(builtinRegIn, builtinRegOut, new RuntimeToolContext());
  logger.info('[startup] runtime builtin tools', String(builtinRegOut.registered ?? []));

  // RunGateway 与 Loop 的队列互相绑定：Loop 经鸭子接口消费 gateway 的 steering/followup 队列
  const loopQueueBridge: import('@brian-agent/runtime').LoopQueue = {
    drainSteering: (sessionKey: string) => runtimeGatewayRef.drainSteeringFor(sessionKey),
    takeFollowup: (sessionKey: string) => runtimeGatewayRef.takeFollowupFor(sessionKey),
  };
  const permissionGateBridge = {
    wait: async (input: { permission_id: string }) => {
      const { WaitPermissionInput, WaitPermissionOutput, RunGatewayContext } = await import('./Runtime');
      const i = Object.assign(new WaitPermissionInput(), input);
      const o = new WaitPermissionOutput();
      await runtimeGatewayRef.waitPermission(i, o, new RunGatewayContext());
      return { approved: o.approved };
    },
  };
  const runtimeLoopAccess = new LoopAccess(relationDb, llmAccess, runtimeSessionAccess, runtimeToolAccess, logger, loopQueueBridge, permissionGateBridge);
  await runtimeLoopAccess.initialize();
  const runtimeAgentDefAccess = new AgentDefAccess(relationDb, llmAccess, {
    agentBuilder,
    agentLibrary,
    llmCore,
    soulCore,
    skillCore,
    mcpCore,
  }, logger);
  await runtimeAgentDefAccess.initialize();
  const runtimeGateway = new RunGatewayAccess(relationDb, runtimeSessionAccess, runtimeAgentDefAccess, runtimeLoopAccess, logger);
  await runtimeGateway.initialize();
  runtimeGatewayRef = runtimeGateway;


  const chatAccess = new ChatAccess(relationDb, infoCore, logger, streamAccess, {
    gateway: runtimeGateway,
    session: runtimeSessionAccess,
  });

  const chunkAccess = new ChunkAccess(logger);
  const selfLearningAccess = new SelfLearningAccess(relationDb, infoCore, mqCore, llmCore, evolutorAgent, writerAgent, graphDBAccess, mqAccess, chunkAccess, llmAccess, promptsAccess, logger);

  // 系统启动时自动开启随机触发学习（自动学习后台常驻：空闲时按 random_factor 随机触发）
  await selfLearningAccess.startLearning(
    Object.assign(new StartLearningInput(), { learning_mode: 'RANDOM' }),
    new StartLearningOutput(),
    new SelfLearningContext(),
  );

  // ---- CronProvider（定时任务调度中心）----
  const cronAccess = new CronAccess(relationDb, logger);

  // 迁移/注册定时任务：默认 cron 取自 self_learning_config 历史值，之后以 cron_task 表为唯一时间源
  let tagAgingCron = '0 0 2 * * *';
  let orphanTagCron = '0 0 3 * * *';
  try {
    const slCfg = relationDb.queryRaw<{ tag_aging_cron: string; orphan_tag_check_cron: string }>(
      'SELECT "tag_aging_cron", "orphan_tag_check_cron" FROM "self_learning_config" LIMIT 1', [],
    );
    if (slCfg.length > 0) {
      if (slCfg[0].tag_aging_cron) tagAgingCron = slCfg[0].tag_aging_cron;
      if (slCfg[0].orphan_tag_check_cron) orphanTagCron = slCfg[0].orphan_tag_check_cron;
    }
  } catch { /* best-effort */ }

  await cronAccess.registerTask('tag_aging', '标签老化', tagAgingCron, () => selfLearningAccess.startTagAging());
  await cronAccess.registerTask('orphan_tag_check', '孤立标签检查', orphanTagCron, () => selfLearningAccess.startOrphanTagCheck());
  cronAccess.start();

  const userProfileAccess = new UserProfileAccess(relationDb, writerAgent, evolutorAgent, infoCore, llmCore, llmAccess, promptsAccess, logger);
  await userProfileAccess.initialize();
  // 启动用户画像自动生成调度（按 auto_generate_interval_ms 周期触发）
  await userProfileAccess.startAutoGeneration();
  const visualizationAccess = new VisualizationAccess(relationDb, agentExecution, agentLibrary, agentContext, evolutorAgent, plannerAgent, infoCore, llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess, graphDBAccess, logger);
  await visualizationAccess.initialize();

  // Config
  const configAccess = new ConfigAccess(
    relationDb,
    llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess,
    logAccess,
    mqAccess, graphDBAccess, vectorDBAccess,
    llmCore, infoCore, mcpCore, skillCore, soulCore,
    writerAgent, evolutorAgent, plannerAgent, agentLibrary, agentBuilder,
    agentExecution, agentStrategy, agentContext,
    chatAccess, selfLearningAccess, userProfileAccess, visualizationAccess,
    cronAccess,
    logger,
  );

  // 配置项元数据已改为内存静态定义（configRegistrations），无需再注册到数据库

  // 启动时创建「默认快照」（如果不存在），保存各配置表的默认数据，
  // 供「配置中心 > 维护 > 重置与快照」页面的恢复默认功能使用
  try {
    const existingDefault = relationDb.queryRaw<{ id: string }>(
      'SELECT "id" FROM "config_snapshot" WHERE "name" = ? LIMIT 1', ['默认快照'],
    );
    if (existingDefault.length === 0) {
      const configTables = relationDb.queryRaw<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%_config' OR name='config_registry' OR name LIKE '%_privilege' OR name='config_config' OR name='orchestration_strategy' OR name='prompt_template')",
        [],
      );
      const snapshotData: Record<string, unknown[]> = {};
      for (const row of configTables || []) {
        try { snapshotData[row.name] = relationDb.queryRaw<Record<string, unknown>>(`SELECT * FROM "${row.name}"`, []) || []; } catch { /* ok */ }
      }
      const now = Date.now();
      relationDb.executeRaw(
        'INSERT INTO "config_snapshot" ("id", "created", "updated", "name", "snapshot_data") VALUES (?, ?, ?, ?, ?)',
        [IdGenerator.generate(), now, now, '默认快照', JSON.stringify(snapshotData)],
      );
      logger.info('[startup] default snapshot created', '默认快照已创建');
    }
  } catch (e) {
    logger.warn('[startup] default snapshot failed', String(e));
  }

  // 启动时清理过期 MQ 消息
  try {
    const cleaned = await mqAccess.cleanupExpiredMessages();
    if (cleaned > 0) logger.info('[startup] MQ cleanup', `删除了 ${cleaned} 条过期消息`);
  } catch (e) {
    logger.warn('[startup] MQ cleanup failed', String(e));
  }

  // 每日午夜 0:00 清理过期 MQ 消息
  function scheduleMidnightCleanup() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {
      try {
        mqAccess.cleanupExpiredMessages().then((cleaned) => {
          if (cleaned > 0) logger.info('[cron] MQ cleanup', `删除了 ${cleaned} 条过期消息`);
        }).catch(() => {});
      } catch { /* ignore */ }
      scheduleMidnightCleanup(); // 调度下一天
    }, msUntilMidnight);
  }
  scheduleMidnightCleanup();

  // 启动时清理过期信息（InfoCore.delInfo，清空超过 alive_max_days 的 info 内容，保留记录用于摘要回退）
  try {
    const delOut = new DelInfoOutput();
    await infoCore.delInfo(new DelInfoInput(), delOut, new InfoCoreContext());
    if (delOut.deleted_count > 0) logger.info('[startup] Info cleanup', `清理了 ${delOut.deleted_count} 条过期信息`);
  } catch (e) {
    logger.warn('[startup] Info cleanup failed', String(e));
  }

  // 每日午夜 0:00 清理过期信息
  function scheduleInfoCleanup() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {
      try {
        const delOut = new DelInfoOutput();
        infoCore.delInfo(new DelInfoInput(), delOut, new InfoCoreContext()).then(() => {
          if (delOut.deleted_count > 0) logger.info('[cron] Info cleanup', `清理了 ${delOut.deleted_count} 条过期信息`);
        }).catch(() => {});
      } catch { /* ignore */ }
      scheduleInfoCleanup(); // 调度下一天
    }, msUntilMidnight);
  }
  scheduleInfoCleanup();

  // 周期性同步 MCP 安装状态（每 1 小时通过 npm list -g 清理全局已卸载的 npm 记录）
  setInterval(() => {
    try {
      mcpAccess.syncInstallStatus().then((removed) => {
        if (removed > 0) logger.info('[cron] MCP install sync', `清理了 ${removed} 条已卸载的 npm 安装记录`);
      }).catch(() => {});
    } catch { /* ignore */ }
  }, 60 * 60 * 1000);

  // 周期性 WAL checkpoint（每 30 分钟），回收 WAL 文件磁盘空间
  setInterval(() => {
    try {
      for (const db of [relationDb, logRelationDb]) {
        db.walCheckpoint('PASSIVE');
      }
    } catch { /* ignore */ }
  }, 30 * 60 * 1000);

  // 每日午夜 0:00 执行 Skill/Soul 老化（按 opt_rule 规则禁用不活跃实体）
  function scheduleDailyAging() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {
      try {
        const skillOut = new AgeSkillOutput();
        skillCore.ageSkill(new AgeSkillInput(), skillOut, new SkillCoreContext()).then(() => {
          if (skillOut.aged_count > 0) logger.info('[cron] Skill aging', `老化 ${skillOut.aged_count} 个 Skill`);
        }).catch(() => {});
        const soulOut = new AgeSoulOutput();
        soulCore.ageSoul(new AgeSoulInput(), soulOut, new SoulCoreContext()).then(() => {
          if (soulOut.aged_count > 0) logger.info('[cron] Soul aging', `老化 ${soulOut.aged_count} 个 Soul`);
        }).catch(() => {});
      } catch { /* ignore */ }
      scheduleDailyAging(); // 调度下一天
    }, msUntilMidnight);
  }
  scheduleDailyAging();

  return {
    relationDb, llmAccess, mcpAccess, soulAccess, skillAccess, promptsAccess,
    graphDBAccess, mqAccess, logAccess, vectorDBAccess,
    cdtAccess, bookmarkAccess,
    toolAccess,
    httpAccess,
    systemMonitorAccess,
    cronAccess,
    streamAccess,
    infoCore, llmCore, mcpCore, skillCore, soulCore, mqCore,
    cdtCore,
    agentLibrary, agentStrategy, agentContext, agentBuilder,
    agentExecution, plannerAgent, writerAgent, evolutorAgent,
    chatAccess, configAccess, selfLearningAccess, userProfileAccess, visualizationAccess,
  };
}

function jsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB 上限
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
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function sendJson(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// 前端静态文件 serve（SEA 打包模式下，前端 dist 被内联为 base64 映射）
// ---------------------------------------------------------------------------
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

/** 尝试从内联的前端文件映射 serve 静态资源；返回 true 表示已处理 */
function serveFrontend(res: http.ServerResponse, pathname: string): boolean {
  const files = getFrontendFiles();
  if (!files) return false;

  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  let b64 = files[rel];
  // SPA fallback：未知路径回退到 index.html
  if (!b64) {
    b64 = files['index.html'];
    if (!b64) return false;
  }
  const ext = path.extname(rel);
  const mime = FRONTEND_MIME_TYPES[ext] || 'application/octet-stream';
  // index.html 保持 no-store 以确保 SPA 路由更新即时生效；
  // 其他静态资源（JS/CSS/图片/字体等）使用长缓存（Vite 构建已带内容 hash）
  const cacheControl = rel === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable';
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cacheControl });
  res.end(Buffer.from(b64, 'base64'));
  return true;
}

// ===== 从数据表采集思考过程：根据 work_id 列表重建各 Agent 的 ThinkingChain Blocks =====
// 数据来源：orchestration_agent_dag_record / agent_plan / orchestration_agent_execution /
//          agent / agent_execution_trace 五张表；由 /api/chat/history 原始内联逻辑抽取而来。
async function rebuildPromptFromRef(
  rebuilder: PromptRebuilder,
  ref: any,
  refIndex: number,
  iters: any[],
  triples: any,
): Promise<string> {
  try {
    const sourceIdsMap = (triples?.source_ids_map ?? {}) as Record<string, string[]>;
    const contentMap = (triples?.content_map ?? {}) as Record<string, string>;
    const contextText = rebuilder.formatContextText(sourceIdsMap, contentMap);
    const history = rebuilder.rebuildHistory(iters, refIndex);
    return await rebuilder.rebuildPrompt(ref, contextText, history);
  } catch {
    return '';
  }
}

async function buildThinkingBlocksAndDag(
  relationDb: import('./Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess,
  infoCore: any,
  workIds: string[],
  promptsAccess?: any,
  soulAccess?: any,
): Promise<{ workBlocksMap: Map<string, any[]>; workDagMap: Map<string, any> }> {
  const workBlocksMap = new Map<string, any[]>();
  const workDagMap = new Map<string, any>();
  const rebuilder = promptsAccess && soulAccess
    ? new PromptRebuilder(promptsAccess, soulAccess)
    : null;

  if (!workIds || workIds.length === 0) return { workBlocksMap, workDagMap };

  try {
    const placeholders = workIds.map(() => '?').join(',');

    // 预先查询 Work 对应的 Task/Agent DAG 关系记录
    const dagRows = relationDb.queryRaw<Record<string, unknown>>(
      `SELECT r.plan_id, r.agent_dag_json, p.work_id, p.task_dag 
       FROM orchestration_agent_dag_record r
       LEFT JOIN agent_plan p ON r.plan_id = p.plan_id
       WHERE p.work_id IN (${placeholders})`,
      workIds,
    );

    const dagNodeInfoMap = new Map<string, { label: string; domain?: string; taskContent?: string }>();
    const workStrategyMap = new Map<string, string>();

    // 查询 orchestration_work 表获取真实的编排策略
    try {
      const strategyRows = relationDb.queryRaw<{ work_id: string; orchestration_strategy: string }>(
        `SELECT work_id, orchestration_strategy FROM orchestration_work WHERE work_id IN (${placeholders})`,
        workIds,
      );
      for (const sRow of strategyRows) {
        const wId = String(sRow.work_id ?? '');
        if (wId) workStrategyMap.set(wId, String(sRow.orchestration_strategy ?? ''));
      }
    } catch { /* degrade gracefully */ }
    
    for (const dRow of dagRows) {
      const wId = String(dRow.work_id ?? '');
      let dagObj: any = undefined;
      try { if (dRow.agent_dag_json) dagObj = JSON.parse(String(dRow.agent_dag_json)); } catch { /* ignore */ }

      // ===== 修改后：解析 agent_plan.task_dag 得到 Planner 的任务级拆解（Task DAG），
      //      并随 workDagMap 一起下发供"思考过程"弹窗展示 Planning 策略拆解 =====
      let taskDagObj: any = undefined;
      try { if (dRow.task_dag) taskDagObj = JSON.parse(String(dRow.task_dag)); } catch { /* ignore */ }

      const taskDagNodes = (taskDagObj && Array.isArray(taskDagObj.nodes) ? taskDagObj.nodes : [])
        .map((t: any, i: number) => {
          const content = String(t.task_content ?? '');
          const domain = String(t.task_domain ?? '');
          return {
            id: String(t.task_id ?? `task-${i}`),
            label: domain || (content ? content.slice(0, 16) : `任务 #${i + 1}`),
            domain,
            content,
            complexity: Number(t.task_complexity ?? 0),
            priority: Number(t.priority ?? 0),
            dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
          };
        });
      const taskDagEdges = (taskDagObj && Array.isArray(taskDagObj.edges) ? taskDagObj.edges : [])
        .map((e: any) => ({
          source: String(e.from_task_id ?? ''),
          target: String(e.to_task_id ?? ''),
        }));

      if (dagObj && Array.isArray(dagObj.agent_nodes)) {
        for (let idx = 0; idx < dagObj.agent_nodes.length; idx++) {
          const node = dagObj.agent_nodes[idx];
          const agId = String(node.agent_id ?? '');
          const domain = String(node.task_domain || '');
          const content = String(node.task_content || '');
          const shortTitle = domain || (content ? content.slice(0, 16) : `子任务 #${idx + 1}`);
          const label = `任务 ${idx + 1}: ${shortTitle}`;

          if (agId) {
            dagNodeInfoMap.set(agId, { label, domain, taskContent: content });
          }
        }

        if (wId) {
          workDagMap.set(wId, {
            planId: dagObj.plan_id,
            totalCount: dagObj.total_agent_count || dagObj.agent_nodes.length,
            taskDag: taskDagNodes.length > 0
              ? { nodes: taskDagNodes, edges: taskDagEdges }
              : undefined,
            nodes: dagObj.agent_nodes.map((n: any, i: number) => {
              const domain = String(n.task_domain || '');
              const content = String(n.task_content || '');
              const title = domain || (content ? content.slice(0, 16) : `任务 #${i + 1}`);
              return {
                // 节点主键改用 task_id（唯一），agent_id 仅作展示/执行联动字段：
                // 同一 Agent 可复用到多个任务（如 30fb48e6 同时承担 task_2 / task_4），
                // 若以 agent_id 为主键会重复 key 导致画布节点折叠、依赖边形成假环、布局塌陷。
                id: String(n.task_id || `task-${i}`),
                agentId: String(n.agent_id || ''),
                label: `任务 ${i + 1}: ${title}`,
                domain,
                content,
                status: n.status || 'COMPLETED',
                taskId: String(n.task_id || ''),
              };
            }),
            edges: (dagObj.agent_edges || []).map((e: any) => ({
              // 依赖边按任务级 id 关联（与节点主键 task_id 一致），避免 agent 复用导致的假环
              source: String(e.from_task_id || ''),
              target: String(e.to_task_id || ''),
              label: String(e.data_dependency || ''),
            })),
          });
        }
      }
    }

    const execRows = relationDb.queryRaw<Record<string, unknown>>(
      `SELECT e.id as exec_id, e.work_id, e.agent_id, e.task_id, e.task_content, e.status, e.answer, e.trace_id, e.elapsed_ms, e.created, e.execution_type,
              a.agent_name, a.agent_type, a.soul_id,
              t.iterations_json, t.total_token_usage
       FROM orchestration_agent_execution e
       LEFT JOIN agent a ON (e.agent_id = a.id OR e.agent_id = a.agent_id)
       LEFT JOIN agent_execution_trace t ON (e.trace_id IS NOT NULL AND e.trace_id != '' AND e.trace_id = t.trace_id)
       WHERE e.work_id IN (${placeholders})
       ORDER BY e.created ASC`,
      workIds,
    );

    // 预计算每个 work 的 Work Agent 是否产生有效输出：Work Agent 空输出时，
    // 后续 Writer / Evolutor 等系统 Agent 的展示块应被跳过（不应展示在思考过程里）。
    const workAgentHasOutput = new Map<string, boolean>();
    for (const row of execRows) {
      if (String(row.execution_type ?? '') === 'SINGLE') {
        const wid = String(row.work_id ?? '');
        const ans = row.answer ? String(row.answer).trim() : '';
        if (ans) workAgentHasOutput.set(wid, true);
      }
    }

    // 查询 orchestration_work.metadata 获取 IntentAgent 需求理解结果
    const intentMetaRows = relationDb.queryRaw<{ work_id: string; metadata: string }>(
      `SELECT work_id, metadata FROM orchestration_work WHERE work_id IN (${placeholders})`,
      workIds,
    );
    const intentMetaMap = new Map<string, any>();
    for (const imRow of intentMetaRows) {
      const wId = String(imRow.work_id ?? '');
      if (wId && imRow.metadata) {
        try {
          const meta = JSON.parse(imRow.metadata);
          if (meta?.intent_agent) {
            intentMetaMap.set(wId, meta.intent_agent);
          }
        } catch { /* ignore */ }
      }
    }

    // 为每个 work 创建 IntentAgent 的 ThinkingBlock
    for (const wid of workIds) {
      const intentData = intentMetaMap.get(wid);
      if (intentData) {
        const intentBlock = {
          id: `block-think-${wid}-intent-agent`,
          msgId: '',
          role: 'assistant',
          type: 'ThinkingChain',
          content: String(intentData.reasoning ?? ''),
          summary: '',
          durationMs: 0,
          agentInfo: {
            id: `intent-agent-${wid}`,
            name: '需求理解 Agent (Intent)',
            type: 'INTENT',
          },
          context: {
            strategy: workStrategyMap.get(wid) === 'PLANNING' ? 'Planning 策略 (任务分解)' : 'Simple 策略 (直接推理)',
            userProfile: { language: 'zh-CN', format: 'MARKDOWN', style: 'clear' },
            citingMessages: [],
          },
          input: `需求理解: ${String(intentData.understood_requirement ?? '')}`,
          prompt: String(intentData.prompt ?? ''),
          inputTokens: Number(intentData.input_tokens ?? 0) || 0,
          outputTokens: Number(intentData.output_tokens ?? 0) || 0,
          output: {
            understood_requirement: intentData.understood_requirement,
            match_score: intentData.match_score,
            threshold_score: intentData.threshold_score,
            should_modify_query: intentData.should_modify_query,
          },
          steps: [],
          meta: {
            status: 'done',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        };
        if (!workBlocksMap.has(wid)) {
          workBlocksMap.set(wid, []);
        }
        workBlocksMap.get(wid)!.push(intentBlock);
      }
    }

    const agentIndexCounter = new Map<string, number>();

    // 预查询每个 work 的上下文三对象（source_ids_map / content_map / attribute_map），
    // 由 InfoCoreProvider.soContextByWork 从 info_context_source 表 + info_raw 回查得到。
    const workContextTriplesMap = new Map<string, any>();
    if (infoCore && typeof infoCore.soContextByWork === 'function') {
      for (const wid of workIds) {
        if (!wid) continue;
        try {
          const soOut: any = { source_ids_map: {}, content_map: {}, attribute_map: {} };
          await infoCore.soContextByWork({ work_id: wid }, soOut, new InfoCoreContext());
          workContextTriplesMap.set(wid, soOut);
        } catch { /* ignore */ }
      }
    }

    for (const row of execRows) {
      const wid = String(row.work_id ?? '');
      if (!wid) continue;

      // 系统 Agent（Writer / Evolutor）在 Work Agent 无有效输出时不应展示
      if (String(row.execution_type ?? '') === 'SYSTEM' && !workAgentHasOutput.get(wid)) {
        continue;
      }

      const agentId = String(row.agent_id ?? '');
      const rawAgentName = String(row.agent_name ?? '');

      // 优先使用数据库记录的具有业务特性的 agent_name，严格消除 UUID
      let agentName = rawAgentName;
      const isUuid = !agentName || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentName) || agentName === agentId;

      if (isUuid) {
        if (dagNodeInfoMap.has(agentId)) {
          agentName = dagNodeInfoMap.get(agentId)!.label;
        } else {
          const currIdx = (agentIndexCounter.get(wid) ?? 0) + 1;
          agentIndexCounter.set(wid, currIdx);
          
          let domainFromTask = '';
          if (row.task_content) {
            try {
              const p = JSON.parse(String(row.task_content));
              if (p && p.task_domain) domainFromTask = String(p.task_domain);
              else if (p && p.user_query) domainFromTask = String(p.user_query).slice(0, 16);
            } catch { /* ignore */ }
          }

          agentName = domainFromTask ? `执行 Agent ${currIdx}: ${domainFromTask}` : `执行 Agent #${currIdx}`;
        }
      }

      const agentType = String(row.agent_type ?? 'WORKER');
      const llmId = row.llm_id ? String(row.llm_id) : undefined;
      const soulId = row.soul_id ? String(row.soul_id) : undefined;

      // 解析 task_content 构造完整的 Input 与 Context 数据
      let inputQuery: string | undefined = undefined;
      const realStrategy = workStrategyMap.get(wid) ?? '';
      const strategyDisplay = realStrategy === 'PLANNING'
        ? 'Planning 策略 (任务分解)'
        : (realStrategy === 'SIMPLE' ? 'Simple 策略 (直接推理)' : (realStrategy || 'Simple 策略 (直接推理)'));
      const contextData: any = {
        strategy: strategyDisplay,
        userProfile: { language: 'zh-CN', format: 'MARKDOWN', style: 'clear' },
        citingMessages: [],
      };

      // ===== 修改后的代码：task_content 为纯任务内容（不再拼 work_context 前缀），
      //      上下文改经 InfoCoreProvider.soContextByWork(work_id) 从 info_context_source 表 + info_raw 回查 =====
      if (row.task_content) {
        const rawContentStr = String(row.task_content);
        // 兼容历史数据：旧记录 task_content 可能仍携带 work_context JSON 前缀，按 \n---\n 剥离
        if (rawContentStr.includes('\n---\n')) {
          const idx = rawContentStr.indexOf('\n---\n');
          inputQuery = rawContentStr.slice(idx + 5).trim();
        } else {
          inputQuery = rawContentStr;
        }
      }

      const triples = workContextTriplesMap.get(wid);
      if (triples) {
        const sourceIdsMap: Record<string, string[]> = triples.source_ids_map || {};
        const contentMap: Record<string, string> = triples.content_map || {};
        const attrMap: Record<string, Record<string, unknown>> = triples.attribute_map || {};

        // 各来源的消息列表（只携带 info_id 与内容，不展示属性）
        const toMessages = (sourceKey: string): Array<{ info_id: string; content: string }> | undefined => {
          const ids = sourceIdsMap[sourceKey];
          if (!Array.isArray(ids) || ids.length === 0) return undefined;
          const msgs: Array<{ info_id: string; content: string }> = [];
          for (const id of ids) {
            const content = contentMap[id];
            if (content) msgs.push({ info_id: id, content });
          }
          return msgs.length > 0 ? msgs : undefined;
        };

        contextData.source_ids_map = sourceIdsMap;
        contextData.content_map = contentMap;
        contextData.attribute_map = attrMap;
        contextData.selectedMessages = toMessages('CUSTOM');
        contextData.citingMessages = toMessages('CITING');
        contextData.timelineMessages = toMessages('TIMELINE');
        contextData.pinnedMessages = toMessages('PINNED');
        contextData.similarityMessages = toMessages('SIMILARITY');
        contextData.tagRelativeMessages = toMessages('TAG_RELATIVE');
        contextData.keywordMessages = toMessages('KEYWORD');
        contextData.randomMessages = toMessages('RANDOM');
        contextData.categoryIds = {
          selected: sourceIdsMap.CUSTOM ?? sourceIdsMap.SELECTED ?? [],
          citing: sourceIdsMap.CITING ?? [],
          timeline: sourceIdsMap.TIMELINE ?? [],
          pinned: sourceIdsMap.PINNED ?? [],
          similarity: sourceIdsMap.SIMILARITY ?? [],
          tag_relative: sourceIdsMap.TAG_RELATIVE ?? [],
          keyword: sourceIdsMap.KEYWORD ?? [],
          random: sourceIdsMap.RANDOM ?? [],
        };
      }

      // 如果精确匹配 trace_id 没有找到 iterations_json，再次尝试使用 agent_id + created 拟合获取 trace
      let iterJson = row.iterations_json;
      let tokenUsage = row.total_token_usage ? Number(row.total_token_usage) : 0;
      // 轨迹迭代数组（外层作用域声明，供后续 prompt 重建使用；缺失 trace 时为 [])
      let iters: any[] = [];

      if (!iterJson && agentId) {
        try {
          const fallbackTraceRows = relationDb.queryRaw<Record<string, unknown>>(
            `SELECT iterations_json, total_token_usage FROM agent_execution_trace 
             WHERE agent_id = ? ORDER BY ABS(created - ?) ASC LIMIT 1`,
            [agentId, Number(row.created ?? Date.now())],
          );
          if (fallbackTraceRows.length > 0) {
            if (fallbackTraceRows[0].iterations_json) iterJson = fallbackTraceRows[0].iterations_json;
            if (fallbackTraceRows[0].total_token_usage) tokenUsage = Number(fallbackTraceRows[0].total_token_usage);
          }
        } catch { /* ignore fallback error */ }
      }

      const steps: any[] = [];
      let content = '';
      let outputAnswer = row.answer ? String(row.answer) : undefined;
      let fullPrompt = '';
      let fullRawResponse = '';
      let sumInputTokens = 0;
      let sumOutputTokens = 0;
      let hasActTools = false;
      let firstPromptRef: any = null;
      let firstRefIndex = -1;

      if (iterJson) {
        try {
          iters = JSON.parse(String(iterJson));
          if (Array.isArray(iters)) {
            for (const iter of iters) {
              if (iter.think) {
                if (!fullPrompt && iter.think.prompt) fullPrompt = String(iter.think.prompt);
                if (!fullPrompt && iter.think.prompt_ref && !firstPromptRef) {
                  firstPromptRef = iter.think.prompt_ref;
                  firstRefIndex = Number(iter.iteration_index ?? 0);
                }
                if (iter.think.raw_response && !fullRawResponse) fullRawResponse = String(iter.think.raw_response);
                if (iter.think.input_tokens) sumInputTokens += Number(iter.think.input_tokens);
                if (iter.think.output_tokens) sumOutputTokens += Number(iter.think.output_tokens);

                const reasoning = String(iter.think.reasoning ?? '');
                if (reasoning) {
                  content += (content ? '\n' : '') + reasoning;
                  steps.push({
                    phase: 'THINK',
                    iteration: iter.iteration_index ?? (steps.length + 1),
                    content: reasoning,
                    tokenUsage: iter.think.token_usage,
                    elapsedMs: iter.iteration_elapsed_ms,
                  });
                }
              }
              if (iter.act) {
                const toolName = String(iter.act.tool_type || iter.act.tool_id || 'Tool');
                if (toolName !== 'NONE') {
                  hasActTools = true;
                  steps.push({
                    phase: 'ACT',
                    iteration: iter.iteration_index ?? (steps.length + 1),
                    toolCalls: [{
                      toolName: toolName,
                      toolType: String(iter.act.tool_type || 'Tool'),
                      params: iter.act.params,
                      result: iter.act.result,
                    }],
                    elapsedMs: iter.iteration_elapsed_ms,
                  });
                }
              }
              if (iter.reflect) {
                if (!fullPrompt && iter.reflect.prompt) fullPrompt = String(iter.reflect.prompt);
                if (!fullPrompt && iter.reflect.prompt_ref && !firstPromptRef) {
                  firstPromptRef = iter.reflect.prompt_ref;
                  firstRefIndex = Number(iter.iteration_index ?? 0);
                }
                if (iter.reflect.raw_response && !fullRawResponse) fullRawResponse = String(iter.reflect.raw_response);
                if (iter.reflect.input_tokens) sumInputTokens += Number(iter.reflect.input_tokens);
                if (iter.reflect.output_tokens) sumOutputTokens += Number(iter.reflect.output_tokens);

                steps.push({
                  phase: 'REFLECT',
                  iteration: iter.iteration_index ?? (steps.length + 1),
                  reflection: String(iter.reflect.reflection ?? ''),
                  passed: iter.reflect.should_continue === false,
                  elapsedMs: iter.iteration_elapsed_ms,
                });
              }
              if (iter.answer) {
                if (!fullPrompt && iter.answer.prompt) fullPrompt = String(iter.answer.prompt);
                if (!fullPrompt && iter.answer.prompt_ref && !firstPromptRef) {
                  firstPromptRef = iter.answer.prompt_ref;
                  firstRefIndex = Number(iter.iteration_index ?? 0);
                }
                if (iter.answer.raw_response) fullRawResponse = String(iter.answer.raw_response);
                if (iter.answer.input_tokens) sumInputTokens += Number(iter.answer.input_tokens);
                if (iter.answer.output_tokens) sumOutputTokens += Number(iter.answer.output_tokens);
                if (iter.answer.answer && !outputAnswer) {
                  outputAnswer = String(iter.answer.answer);
                }
              }
            }
          }
        } catch { /* ignore */ }
      }

      if (!content && inputQuery) {
        content = inputQuery;
      }
      // 新格式：无完整 prompt，按 prompt_ref 经 PromptProvider 重建（补 context 与 history）
      if (!fullPrompt && firstPromptRef && rebuilder) {
        fullPrompt = await rebuildPromptFromRef(rebuilder, firstPromptRef, firstRefIndex, iters, triples);
      }
      if (!fullPrompt && inputQuery) {
        fullPrompt = inputQuery;
      }
      // 模型的完整回复只允许回退到最终答案，禁止回退到 content/inputQuery（用户输入），
      // 否则“模型的完整回复 (LLM Response)”会误显示成用户本次发送的内容。
      if (!fullRawResponse) {
        fullRawResponse = outputAnswer || '';
      }
      // ===== 修改后的代码：精准/估算 Token 用量，防止非零 Token 显示为 0 =====
      if (sumInputTokens === 0 && sumOutputTokens === 0) {
        if (tokenUsage > 0) {
          sumInputTokens = Math.round(tokenUsage * 0.7);
          sumOutputTokens = Math.max(0, tokenUsage - sumInputTokens);
        } else {
          const pTokens = Math.ceil((fullPrompt.length || 0) / 4);
          const rTokens = Math.ceil((fullRawResponse.length || 0) / 4);
          if (pTokens > 0 || rTokens > 0) {
            sumInputTokens = pTokens;
            sumOutputTokens = rTokens;
          }
        }
      }

      const thinkingStrategy = hasActTools ? 'ReACT' : 'CoT';

      const block = {
        id: `block-think-${wid}-${agentId}`,
        msgId: '',
        role: 'assistant',
        type: 'ThinkingChain',
        content,
        summary: '',
        durationMs: Number(row.elapsed_ms ?? 0),
        tokenUsage: tokenUsage || (sumInputTokens + sumOutputTokens),
        inputTokens: sumInputTokens,
        outputTokens: sumOutputTokens,
        thinkingStrategy,
        prompt: fullPrompt,
        rawResponse: fullRawResponse,
        agentInfo: {
          id: agentId,
          name: agentName,
          type: agentType,
          llmId,
          soulId,
        },
        context: contextData,
        input: inputQuery,
        output: outputAnswer || fullRawResponse,
        steps,
        meta: {
          status: 'done',
          createdAt: Number(row.created ?? Date.now()),
          updatedAt: Number(row.created ?? Date.now()),
        },
      };

      if (!workBlocksMap.has(wid)) {
        workBlocksMap.set(wid, []);
      }
      workBlocksMap.get(wid)!.push(block);

      // 同步补全 workDagMap 中节点的输入输出、执行状态和 token 统计
      // （执行状态由 orchestration_agent_execution.status 决定：COMPLETED 成功 / EXEC_FAILED 失败 / CANCELLED·PENDING 未执行）
      if (workDagMap.has(wid)) {
        const dagData = workDagMap.get(wid);
        // 按 task_id 精确定位节点：同一 Agent 复用多个任务时，每条执行记录对应唯一 task，
        // 避免 find(agentId) 只命中第一个任务节点导致复用任务的节点信息缺失。
        const taskIdOfRow = String(row.task_id ?? '');
        const nodeInDag = taskIdOfRow
          ? dagData.nodes.find((n: any) => n.taskId === taskIdOfRow)
          : dagData.nodes.find((n: any) => n.agentId === agentId);
        if (nodeInDag) {
          nodeInDag.agentName = agentName;
          nodeInDag.input = inputQuery;
          nodeInDag.output = outputAnswer;
          nodeInDag.elapsedMs = Number(row.elapsed_ms ?? 0);
          nodeInDag.tokenUsage = tokenUsage;
          const execStatus = String(row.status ?? '').toUpperCase();
          if (execStatus.includes('COMPLET') || execStatus.includes('SUCCESS')) {
            nodeInDag.status = 'COMPLETED';
          } else if (execStatus.includes('FAIL') || execStatus.includes('ERROR')) {
            nodeInDag.status = 'EXEC_FAILED';
          } else if (execStatus.includes('CANCEL')) {
            nodeInDag.status = 'CANCELLED';
          } else if (execStatus.includes('RUN') || execStatus.includes('PROCESS')) {
            nodeInDag.status = 'RUNNING';
          } else {
            nodeInDag.status = 'PENDING';
          }
        }
      }
    }
  } catch { /* degrade gracefully */ }

  return { workBlocksMap, workDagMap };
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

      // ===== Health Routes =====
      // Kubernetes 风格健康检查：存活检查返回 200，就绪检查验证 RelationDB 连通性。
      // 轻量设计：不探测 LLM/MCP 等外部依赖（完整聚合见 /api/monitor/health-all），
      // 保证探针快速返回、不阻塞事件循环。
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

      // ===== Config Routes =====
      } else if (method === 'GET' && pathname === '/api/config') {
        const input: GetConfigDetailInput = Object.assign(new GetConfigDetailInput(), {});
        const output = new GetConfigDetailOutput();
        const context = new ConfigContext();
        await ctx.configAccess.soConfigDetail(input, output, context);
        sendJson(res, 200, { config: { layers: output.layers } });

      } else if (method === 'PUT' && pathname === '/api/config') {
        const input = Object.assign(new UpdateConfigInput(), body);
        // 距离度量方式写入保护：如果已有向量数据，禁止修改
        if (body.config_key === 'vectordb_provider.default_distance_metric' && body.value !== undefined) {
          try {
            const count = await ctx.vectorDBAccess.soVectorCount();
            if (count > 0) {
              sendJson(res, 400, { error: `已存在 ${count} 条向量数据，写入数据后不支持更改距离度量方式。如需更改请先删除所有向量数据。` });
              return;
            }
          } catch { /* allow if count fails */ }
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

      // ---- Config Save Defaults ----
      } else if (method === 'POST' && pathname === '/api/config/save-defaults') {
        const configTables = ctx.relationDb.queryRaw<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%_config' OR name='config_registry' OR name LIKE '%_privilege' OR name='config_config' OR name='orchestration_strategy' OR name='prompt_template')",
          [],
        );
        const data: Record<string, unknown[]> = {};
        for (const row of configTables || []) {
          try { data[row.name] = ctx.relationDb.queryRaw<Record<string, unknown>>(`SELECT * FROM "${row.name}"`, []) || []; } catch { /* ok */ }
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

      // ---- Config Reset ----
      } else if (method === 'POST' && pathname === '/api/config/reset') {
        // 0. 导出当前配置到本地文件
        const configTables = ctx.relationDb.queryRaw<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%_config' OR name='config_registry' OR name LIKE '%_privilege' OR name='config_config' OR name='orchestration_strategy' OR name='prompt_template')",
          [],
        );
        const backup: Record<string, unknown[]> = {};
        for (const row of configTables || []) {
          try { backup[row.name] = ctx.relationDb.queryRaw<Record<string, unknown>>(`SELECT * FROM "${row.name}"`, []) || []; } catch { /* ok */ }
        }
        const fs = await import('node:fs');
        const path = await import('node:path');
        const dataDir = path.resolve('./data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const backupPath = path.join(dataDir, 'config-backup.json');
        fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8');
        // 1. 清理配置注册表
        ctx.relationDb.executeRaw('DELETE FROM "config_registry"', []);
        ctx.relationDb.executeRaw('DELETE FROM "config_layer_privilege"', []);
        ctx.relationDb.executeRaw('DELETE FROM "config_module_privilege"', []);
        // 2. 清理各模块配置表
        for (const row of configTables || []) {
          try { ctx.relationDb.executeRaw(`DELETE FROM "${row.name}"`, []); } catch { /* ok */ }
        }
        // 3. 配置项元数据为内存静态定义，无需重新注册
        // 4. 从「默认快照」恢复默认数据
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
              try { ctx.relationDb.executeRaw(sql, cols.map((c) => r[c])); restored++; } catch { /* ok */ }
            }
          }
        }
        sendJson(res, 200, { success: true, registered: ALL_CONFIG_REGISTRATIONS.length, restored, backup: backupPath });
        return;

      // ---- Config Snapshot ----
      } else if (method === 'POST' && pathname === '/api/config/snapshot') {
        const { v4: uuidv4 } = await import('uuid');
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
          } catch { /* table may not exist yet */ }
        }
        const id = uuidv4();
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

      } else if (method === 'POST' && /\/api\/config\/snapshot\/[^/]+\/restore$/.test(pathname)) {
        const snapshotId = pathname.split('/api/config/snapshot/')[1].split('/restore')[0];
        const row = ctx.relationDb.queryRaw<{ snapshot_data: string }>(
          'SELECT snapshot_data FROM config_snapshot WHERE id = ?', [snapshotId],
        )[0];
        if (!row) { sendJson(res, 404, { error: '快照不存在' }); return; }
        const data: Record<string, unknown[]> = JSON.parse(row.snapshot_data);
        // 清空当前配置表
        const configTables = ctx.relationDb.queryRaw<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%_config' OR name='config_registry' OR name LIKE '%_privilege' OR name='config_config' OR name='orchestration_strategy' OR name='prompt_template')",
          [],
        );
        for (const t of configTables || []) {
          try { ctx.relationDb.executeRaw(`DELETE FROM "${t.name}"`, []); } catch { /* ok */ }
        }
        // 恢复快照数据
        for (const [table, rows] of Object.entries(data as Record<string, Array<Record<string, unknown>>>)) {
          if (!rows || rows.length === 0) continue;
          const cols = Object.keys(rows[0]);
          const placeholders = cols.map(() => '?').join(', ');
          const sql = `INSERT INTO "${table}" ("${cols.join('", "')}") VALUES (${placeholders})`;
          for (const r of rows) {
            try { ctx.relationDb.executeRaw(sql, cols.map(c => r[c])); } catch { /* ok */ }
          }
        }
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
            // 显式限制输出 token，避免模型表里存的是上下文窗口（如 1048576）导致请求被提供商拒绝
            max_tokens: typeof body.max_tokens === 'number' && body.max_tokens > 0 ? body.max_tokens : 2048,
            // 模拟测试仅调用当前指定模型，不走模型降级逻辑
            no_fallback: true,
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
          const embedInput = Object.assign(new EmbedLLMInput(), { id, input });
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
        const data = (body as Record<string, unknown>).data || body;
        // 仅当显式传入 enable/enabled 时才更新启用状态，避免编辑其它字段时把 enable 静默重置为 0
        const hasEnable = data.enable !== undefined || data.enabled !== undefined;
        const enableVal = (data.enable ?? data.enabled) ? 1 : 0;
        try {
          if (hasEnable) {
            ctx.relationDb.executeRaw('UPDATE "llm_available" SET "llm_brief" = ?, "enable" = ?, "model_usage" = ?, "max_tokens" = ? WHERE "id" = ?',
              [data.llm_brief || '', enableVal, (data.model_usage || ''), (data.maxTokens || 0), id]);
          } else {
            ctx.relationDb.executeRaw('UPDATE "llm_available" SET "llm_brief" = ?, "model_usage" = ?, "max_tokens" = ? WHERE "id" = ?',
              [data.llm_brief || '', (data.model_usage || ''), (data.maxTokens || 0), id]);
          }
        } catch {}
        sendJson(res, 200, { success: true, id });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/model/')) {
        const id = pathname.split('/api/config/model/')[1];
        try { ctx.relationDb.executeRaw('DELETE FROM "llm_available" WHERE "id" = ?', [id]); } catch {}
        sendJson(res, 200, { success: true });

      // ---- Provider ----
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
          features: m.llm_param ? (() => { try { return JSON.parse(m.llm_param); } catch { return {}; } })() : {},
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
        const input = Object.assign(new UpdateSoulInput(), { ...body, soul_id: id });
        const output = new UpdateSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.updateSoul(input, output, context);
        sendJson(res, 200, { success: true });

      } else if (method === 'DELETE' && pathname.startsWith('/api/config/soul/')) {
        const id = pathname.split('/api/config/soul/')[1];
        const input = Object.assign(new DelSoulInput(), { soul_ids: [id] });
        const output = new DelSoulOutput();
        const context = new SoulContext();
        await ctx.configAccess.delSoul(input, output, context);
        sendJson(res, 200, { success: true });

      // ---- MCP (Config section) ----
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

      // ---- MCP Market: list from database ----
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

      // ---- MCP Provider CRUD ----
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

      // ---- MCP Market: test connectivity ----
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
            // 从 mcp_install 表读取安装状态（由 syncInstallStatus 通过 npm list -g 同步更新）
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

      // ---- MCP Config: install / start / stop / uninstall ----
      } else if (method === 'POST' && /\/api\/config\/mcp\/install$/.test(pathname)) {
        const provId = (body as Record<string, unknown>).mcp_provider_id as string || '';
        const toolId = (body as Record<string, unknown>).mcp_id as string || (body as Record<string, unknown>).tool_id as string || '';
        if (!provId || !toolId) { sendJson(res, 400, { error: '缺少 mcp_provider_id 或 mcp_id' }); return; }
        try {
          // GitHub: fetch npm package info and install directly
          if (provId === 'github') {
            const pkgRes = await httpReq({ url: `https://registry.npmjs.org/${toolId}/latest` });
            if (!pkgRes.ok) { sendJson(res, 400, { error: `npm 包 ${toolId} 不存在` }); return; }
            const pkg = JSON.parse(pkgRes.bodyText) as { name: string; description: string; bin?: Record<string, string>; version?: string };
            // 校验：不能重复安装
            const dup = ctx.relationDb.queryRaw<{ id: string }>(
              'SELECT "id" FROM "mcp_install" WHERE "mcp_provider_id"=? AND "mcp_title"=?',
              [provId, toolId],
            )[0];
            if (dup) { sendJson(res, 409, { error: `MCP 已安装：${toolId}` }); return; }
            const installCmd = `npm install -g ${toolId}`;
            const startCmd = `npx ${toolId}`;
            const stopCmd = `pkill -f ${toolId}`;
            const uninstallCmd = `npm uninstall -g ${toolId}`;
            try { execSync(installCmd, { timeout: 120000, stdio: 'pipe' }); } catch { /* npm install may fail but tool may already be usable */ }
            const id = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const now = Date.now();
            ctx.relationDb.executeRaw(
              `INSERT INTO "mcp_install" ("id","created","updated","mcp_provider_id","mcp_title","mcp_brief","mcp_install_cmd","mcp_start_cmd","mcp_stop_cmd","mcp_uninstall_cmd","version","status","enable") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [id, now, now, provId, toolId, pkg.description || '', installCmd, startCmd, stopCmd, uninstallCmd, pkg.version || '', 'stopped', 1],
            );
            // 安装完成后同步一次安装状态（校验 npm 包是否真实安装成功）
            await ctx.mcpAccess.syncInstallStatus();
            sendJson(res, 200, { success: true, id });

          // Smithery: record as HTTP connection
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
            sendJson(res, 200, { success: true, id });

          } else {
            // Other markets: delegate to existing MCPAccess via ConfigAccess
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

      // ---- Agent Routes ----
      } else if (method === 'GET' && pathname === '/api/agent') {
        const input = Object.assign(new GetAgentInput(), {});
        const output = new GetAgentOutput();
        const context = new AgentLibraryContext();
        await ctx.agentLibrary.soAgent(input, output, context);
        sendJson(res, 200, { agents: output.agents || [] });

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

      // ===== 修改后：真实创建 Agent =====
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
          } catch { strategyId = ''; }
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

      // ===== 修改后：真实更新 Agent =====
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

      // ---- Skill Routes ----
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
        sendJson(res, 200, { success: true });

      } else if (method === 'PUT' && /\/api\/skill\/[^/]+$/.test(pathname)) {
        const id = pathname.split('/api/skill/')[1];
        const input = Object.assign(new UpdateSkillInput(), { id, data: body });
        const output = new UpdateSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.updateSkill(input, output, context);
        sendJson(res, 200, { success: true, affected_rows: output.affected_rows });

      } else if (method === 'DELETE' && pathname.startsWith('/api/skill/')) {
        const id = pathname.split('/api/skill/')[1];
        const input = Object.assign(new DelSkillInput(), { ids: [id] });
        const output = new DelSkillOutput();
        const context = new SkillContext();
        await ctx.configAccess.delSkill(input, output, context);
        sendJson(res, 200, { success: true });

      // ---- MCP (Standalone) ----
      } else if (method === 'GET' && pathname === '/api/mcp') {
        // 通过 soMcp 获取实例（其 status 已被实时进程状态覆盖，而非 DB 残留值）
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

      // ===== Chat Routes =====
      // ===== 修改后代码：增加透传 sessionTitle 字段供前端统一使用会话名称 =====
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
            lastMessage: s.last_message || s.session_title || '',
            lastTime: s.last_message_time,
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
        const input = Object.assign(new GetChatHistoryInput(), { session_id: sid });
        const output = new GetChatHistoryOutput();
        const context = new ChatContext();
        await ctx.chatAccess.soChatHistory(input, output, context);

        // ===== 修改后代码：精准关联各 Work 的 Agent 执行与 Trace 迭代步骤，解析具名标题、多 Agent DAG 网络、上下文、Input、Output 与步骤 =====
        const rawMessages = (output.messages || []).filter(
          (m) => m.info_type === InfoType.REQUEST || m.info_type === InfoType.RESPONSE
        );

        // 收集全部 work_id（含暂停等待确认、尚无 RESPONSE 的 work），保证其 IntentAgent 思考过程也能被重建
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
          // RESPONSE 消息挂载完整思考链；REQUEST 仅在对应 work 尚无 RESPONSE（暂停等待确认）时挂载 IntentAgent 思考过程
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

        sendJson(res, 200, { messages });

      } else if (method === 'GET' && pathname === '/api/chat/thinking') {
        // 思考过程采集接口：从数据表重建指定消息 / 工作 / 交互的思考过程（ThinkingChain Blocks）
        // 数据来源：orchestration_agent_execution / agent / agent_execution_trace / orchestration_agent_dag_record / agent_plan
        const infoId = String(params.get('info_id') ?? '');
        const interactId = String(params.get('interact_id') ?? '');
        let workId = String(params.get('work_id') ?? '');

        if (!workId && !infoId && !interactId) {
          sendJson(res, 400, { error: '请至少提供 work_id / info_id / interact_id 中的一个参数' });
          return;
        }

        // 未显式提供 work_id 时，按 info_id / interact_id 反查 info_raw 得到 work_id
        if (!workId && (infoId || interactId)) {
          try {
            const conds: string[] = [];
            const args: string[] = [];
            if (infoId) { conds.push('"info_id" = ?'); args.push(infoId); }
            if (interactId) { conds.push('"interact_id" = ?'); args.push(interactId); }
            const rows = ctx.relationDb.queryRaw<{ work_id: string }>(
              `SELECT "work_id" FROM "info_raw" WHERE ${conds.join(' AND ')} LIMIT 1`,
              args,
            );
            if (rows.length > 0) workId = String(rows[0].work_id ?? '');
          } catch { /* degrade gracefully */ }
        }

        // 有参数但反查不到 work_id 时，返回空结果（而非 400）
        // ===== 修改后：支持模块化独立查询（module=dag / module=blocks / module=all），实现各模块独立加载与渐进式展示 =====
        const reqModule = String(params.get('module') ?? 'all').toLowerCase();
        const { workBlocksMap, workDagMap } = await buildThinkingBlocksAndDag(ctx.relationDb, ctx.infoCore, workId ? [workId] : [], ctx.promptsAccess, ctx.soulAccess);
        const blocks = (reqModule === 'dag') ? [] : (workBlocksMap.get(workId) ?? []);
        const dag = (reqModule === 'blocks') ? null : (workDagMap.get(workId) ?? null);
        sendJson(res, 200, {
          work_id: workId,
          interact_id: interactId,
          count: blocks.length,
          blocks,
          dag,
          module: reqModule,
        });

      } else if (method === 'GET' && pathname === '/api/chat/eval-result') {
        // 评估结果采集接口：返回某次工作（work）的 Evolutor 评估结果（评分 JSON）。
        // 数据来源：orchestration_agent_execution（execution_type=SYSTEM 且 agent_type=EVOLUTOR）的 answer 字段。
        const infoId = String(params.get('info_id') ?? '');
        let workId = String(params.get('work_id') ?? '');
        let traceId = String(params.get('trace_id') ?? '');

        if (!workId && !infoId) {
          sendJson(res, 400, { error: '请至少提供 work_id / info_id 中的一个参数' });
          return;
        }

        // 未显式提供 work_id 时，按 info_id 反查 info_raw 得到 work_id 与 trace_id
        if (!workId && infoId) {
          try {
            const rows = ctx.relationDb.queryRaw<{ work_id: string; trace_id: string }>(
              `SELECT "work_id", "trace_id" FROM "info_raw" WHERE "info_id" = ? LIMIT 1`,
              [infoId],
            );
            if (rows.length > 0) {
              workId = String(rows[0].work_id ?? '');
              traceId = String(rows[0].trace_id ?? '');
            }
          } catch { /* degrade gracefully */ }
        }

        if (!workId) {
          sendJson(res, 200, { work_id: '', trace_id: traceId, found: false, evaluation: null });
          return;
        }

        const evalRows = ctx.relationDb.queryRaw<{ answer: string; created: number; elapsed_ms: number; agent_name: string }>(
          `SELECT e.answer, e.created, e.elapsed_ms, a.agent_name
           FROM orchestration_agent_execution e
           LEFT JOIN agent a ON (e.agent_id = a.id OR e.agent_id = a.agent_id)
           WHERE e.work_id = ? AND e.execution_type = 'SYSTEM' AND a.agent_type = 'EVOLUTOR'
           ORDER BY e.created DESC LIMIT 1`,
          [workId],
        );

        if (evalRows.length === 0) {
          sendJson(res, 200, { work_id: workId, trace_id: traceId, found: false, evaluation: null });
          return;
        }

        const evalRow = evalRows[0];
        sendJson(res, 200, {
          work_id: workId,
          trace_id: traceId,
          found: true,
          evaluation: {
            answer: String(evalRow.answer ?? ''),
            created: Number(evalRow.created ?? 0),
            elapsed_ms: Number(evalRow.elapsed_ms ?? 0),
            agent_name: String(evalRow.agent_name ?? ''),
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
        // 权限应答端点：唤醒 permission.asked 挂起的 Loop（Stage B 权限门）
        const permInput = Object.assign(new AnswerPermissionInput(), {
          permission_id: String(body.permission_id ?? ''),
          approved: body.approved === true,
        });
        const permOutput = new AnswerPermissionOutput();
        await runtimeGatewayRef.answerPermission(permInput, permOutput, new RunGatewayContext());
        sendJson(res, 200, { ok: true, answered: permOutput.answered });
      } else if (method === 'POST' && pathname === '/api/chat/stream') {
        // SSE 流式对话端点：通过 chat_config.sse_heartbeat_interval_ms 控制心跳间隔
        const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
        const msgContent = typeof body.msg_content === 'string' ? body.msg_content : '';
        const citingMsgIds = Array.isArray(body.citing_msg_ids) ? body.citing_msg_ids : (Array.isArray(body.citingIds) ? body.citingIds : []);
        const selectedMsgIds = Array.isArray(body.selected_msg_ids) ? body.selected_msg_ids : (Array.isArray(body.selectedMsgIds) ? body.selectedMsgIds : []);
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
          try { res.write(str); } catch { /* ignore */ }
        };

        // 注册到 Base 层 StreamProvider（由 StreamProvider 统一管理心跳与结构化数据分发）
        const registerOutput = new RegisterStreamOutput();
        await ctx.streamAccess.registerStream(
          Object.assign(new RegisterStreamInput(), {
            session_id: sessionId,
            writer: (chunk: string) => {
              if (clientClosed) return false;
              try { res.write(chunk); return true; } catch { return false; }
            },
            onClose: () => {
              if (!clientClosed) { try { res.end(); } catch { /* ignore */ } }
            },
          }),
          registerOutput,
          new StreamContext(),
        );

        const onEvent = (evt: { event: string; data: Record<string, unknown> }) => {
          // 兼容旧格式（若有监听器直接调用）
          write(`data: ${JSON.stringify({ event: evt.event, ...evt.data })}\n\n`);
        };

        const streamInput = Object.assign(new OpenChatStreamInput(), {
          session_id: sessionId,
          msg_content: msgContent,
          citing_msg_ids: allCitingIds,
          selected_msg_ids: selectedMsgIds,
          force_orchestration_strategy: typeof body.force_orchestration_strategy === 'string' ? body.force_orchestration_strategy : undefined,
          // SSE 端点 ID：注册本响应连接时生成；业务事件经 Report→StreamProvider 按此 ID 推送
          stream_endpoint_id: registerOutput.endpoint_id,
        });
        const streamOutput = new OpenChatStreamOutput();

        try {
          await ctx.chatAccess.openChatStream(streamInput, streamOutput, new ChatContext(), undefined, undefined, onEvent);
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
          if (!clientClosed) { try { res.end(); } catch { /* ignore */ } }
        }
        return;

      } else if (method === 'DELETE' && pathname.startsWith('/api/chat/session/')) {
        const sid = pathname.split('/api/chat/session/')[1];
        const input = Object.assign(new DeleteSessionInput(), { session_ids: [sid] });
        const output = new DeleteSessionOutput();
        const context = new ChatContext();
        await ctx.chatAccess.deleteSession(input, output, context);
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
        // v2 语义迁移：取消 = abortRun（AbortSignal 真取消，类型化原因）
        const eid = pathname.split('/api/chat/cancel/')[1];
        const { AbortRunInput, AbortRunOutput, RunGatewayContext } = await import('./Runtime');
        const input = Object.assign(new AbortRunInput(), { run_id: eid, reason: 'user' });
        const output = new AbortRunOutput();
        await runtimeGatewayRef.abortRun(input, output, new RunGatewayContext());
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

      } else if (method === 'GET' && pathname.startsWith('/api/chat/dag')) {
        // V1 编排 DAG 已移除：前端由 v2 事件流归约，端点返回空图
        sendJson(res, 200, { nodes: [], edges: [] });
      } else if (method === 'GET' && pathname.startsWith('/api/chat/agent-chain/')) {
        sendJson(res, 200, { nodes: [] });

      // ===== Memory Routes =====
      } else if (method === 'GET' && pathname === '/api/memory/list') {
        const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 200);
        const cursor = (params.get('cursor') || '').trim();
        const conds: string[] = [];
        const args: any[] = [];
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
          `SELECT "id", "info_id", "info_type", "info_creator_role", "info", "pin", "created", "updated" FROM "info_raw"${where} ORDER BY "created" DESC, "id" DESC LIMIT ${limit + 1}`,
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
          'SELECT r."id", r."info_id", r."info_type", r."info_creator_role", r."info", r."pin", r."created", r."updated" FROM "info_raw" r INNER JOIN "info_tag" t ON t."info_id" = r."info_id" WHERE t."tag" = ? ORDER BY r."created" DESC LIMIT 200',
          [tag],
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
          }
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
          `SELECT "id", "info_id", "info_type", "info_creator_role", "info", "pin", "created", "updated" FROM "info_raw"${where} ORDER BY "created" DESC, "id" DESC LIMIT ${limit + 1}`,
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
        // 级联删除派生表（info_tag_vector 为全局标签向量，交由 orphan_tag_check 定时任务清理）
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
        } catch { sendJson(res, 200, { nodes: [], edges: [] }); }

      } else if (method === 'GET' && pathname === '/api/memory/keyword-graph') {
        try {
          const limit = Math.min(500, Math.max(1, parseInt(params.get('limit') || '100', 10) || 100));
          const g = await buildCooccurGraphFromGraphDBCached(ctx, 'keyword', 'keyword', 'keywordCooccur', limit);
          sendJson(res, 200, g);
        } catch { sendJson(res, 200, { nodes: [], edges: [] }); }

      } else if (method === 'DELETE' && pathname === '/api/memory/tag-graph') {
        try {
          const out = new ClearGraphOutput();
          await ctx.infoCore.clearGraph(Object.assign(new ClearGraphInput(), { node_type: 'Tag' }), out, new InfoCoreContext());
          sendJson(res, 200, { deleted_nodes: out.deleted_nodes });
        } catch (e: any) { sendJson(res, 500, { error: e?.message || '清理失败' }); }

      } else if (method === 'DELETE' && pathname === '/api/memory/keyword-graph') {
        try {
          const out = new ClearGraphOutput();
          await ctx.infoCore.clearGraph(Object.assign(new ClearGraphInput(), { node_type: 'keyword' }), out, new InfoCoreContext());
          sendJson(res, 200, { deleted_nodes: out.deleted_nodes });
        } catch (e: any) { sendJson(res, 500, { error: e?.message || '清理失败' }); }
      // ---- Graph Search: text-based tag traversal ----
      } else if (method === 'POST' && pathname === '/api/memory/graph-search') {
        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (!query) { sendJson(res, 400, { error: 'query is required' }); return; }
        const maxDepth = typeof body.max_depth === 'number' && body.max_depth > 0 ? Math.min(body.max_depth, 5) : 2;
        const onlyActive = body.only_active !== false;
        const fanOutLimit = 500; // θ = 500, PRD 扇出熔断阈值
        try {
          const { GraphContext, SelectGraphOutput, GraphTarget } = await import('./Base/GraphDBProvider/domain/types');
          // 1. 搜索匹配的标签文本
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
          // 2. 标签文本 → GraphDB 节点 ID（节点以 node_type='Tag' + content.tag 存储）
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
          // 3. 查询与 frontier 节点相连的 similarTo 边
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
          // 4. BFS 遍历
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
                try { cw = await ctx.graphDBAccess.computeEdgeWeight(e.id, d + 1); } catch { /* keep weight */ }
                allEdges.push({ from_id: e.from_node_id, to_id: e.to_node_id, weight: e.weight, active: !!e.is_active, compositeWeight: cw });
              }
              frontier = nextFrontier;
            }
            paths.push({ root_tag: tagText, root_id: rootId, nodes: Array.from(allNodes.values()), edges: allEdges });
          }
          sendJson(res, 200, { root_tags: Array.from(tagInfoMap, ([tag, info_ids]) => ({ tag, info_ids })), paths });
        } catch { sendJson(res, 200, { root_tags: [], paths: [] }); }
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
        // 按月返回每日记忆条数（热力图数据）
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
        // tz：客户端东偏分钟数（-getTimezoneOffset()），按客户端本地日分桶，避免 UTC 桶把凌晨数据落到前一天
        const tzMs = (parseInt(params.get('tz') || '0', 10) || 0) * 60000;
        const rows = ctx.relationDb.queryRaw<{ day_num: number; cnt: number }>(
          'SELECT CAST(("created" + ?) / 86400000 AS INTEGER) AS day_num, COUNT(*) AS cnt FROM "info_raw" WHERE "created" IS NOT NULL GROUP BY day_num',
          [tzMs],
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
        // 会话历史热力图：每个会话按其最后一条消息时间归入本地日，返回每日会话数
        // 仅统计 chat_session 表中存在的会话，避免 info_raw 孤儿数据导致热力图与列表不一致
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

      // ===== Learning Routes =====
      } else if (method === 'POST' && pathname === '/api/learning/start') {
        // 手动触发指定学习模式；未传 mode 时读取存储的当前模式
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
        // 设置某学习模式的自动学习开关
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
        // 设置某学习模式的随机因子（0-100）
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
        // 仅停止手动触发的学习模式，不停止系统启动时自动开启的随机触发（RANDOM）
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
        // 学习任务列表：手动触发的后台任务可视化（running 优先）
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

      // ===== MQ Config Routes =====
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

      // ===== Library Routes =====
      } else if (method === 'GET' && pathname === '/api/library/paths') {
        const output = new SearchLibraryOutput();
        await ctx.selfLearningAccess.soLibrary(new SearchLibraryInput(), output, new SelfLearningContext());
        sendJson(res, 200, { paths: (output.libraries || []).map(l => ({
          id: String(l.library_id || ''),
          name: String(l.library_name || ''),
          path: String(l.library_path || ''),
          category: '',
          description: '',
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
            try { fs.accessSync(p, fs.constants.R_OK); isReadable = true; } catch { /* ignore */ }
            try { fs.accessSync(p, fs.constants.W_OK); isWritable = true; } catch { /* ignore */ }
          } catch { exists = false; }
        }
        sendJson(res, 200, { exists, isReadable, isWritable });

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

      // ===== Feedback Routes =====
      } else if (method === 'POST' && pathname === '/api/feedback') { sendJson(res, 200, { success: true });

      // ===== Profile Routes =====
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
      // ===== Monitor Routes =====
      } else if (method === 'GET' && pathname === '/api/monitor/health-all') {
        const components: Array<{ name: string; status: string; message?: string; details?: Record<string, string | number> }> = [];

        // RelationDB
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

        // GraphDB
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

        // VectorDB
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

        // LLM Provider
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

        // MCP
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

        // MQ
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
        // 按天聚合 llm_usage 的 token 用量（input_tokens + output_tokens）
        const rows = ctx.relationDb.queryRaw<{ date: string; tokens: number }>(
          'SELECT "usage_date" AS "date", SUM(COALESCE("input_tokens",0) + COALESCE("output_tokens",0)) AS "tokens" FROM "llm_usage" GROUP BY "usage_date" ORDER BY "usage_date" ASC',
          [],
        );
        sendJson(res, 200, { points: (rows || []).map(r => ({ date: r.date, tokens: Number(r.tokens) || 0 })) });

      } else if (method === 'GET' && pathname === '/api/analytics/model-distribution') {
        // 按模型聚合 token 用量（关联 llm_available 取模型名与类型，模型已删除时标记 deleted），分别统计输入/输出 token
        const rows = ctx.relationDb.queryRaw<{ model: string; tokens: number; input_tokens: number; output_tokens: number; deleted: number; type: string }>(
          'SELECT COALESCE(e."llm_title", u."llm_available_id") AS "model", COALESCE(e."llm_type", \'deleted\') AS "type", (e."llm_title" IS NULL) AS "deleted", SUM(COALESCE(u."input_tokens",0) + COALESCE(u."output_tokens",0)) AS "tokens", SUM(COALESCE(u."input_tokens",0)) AS "input_tokens", SUM(COALESCE(u."output_tokens",0)) AS "output_tokens" FROM "llm_usage" u LEFT JOIN "llm_available" e ON e."id" = u."llm_available_id" GROUP BY u."llm_available_id" ORDER BY "tokens" DESC',
          [],
        );
        sendJson(res, 200, { models: (rows || []).map(r => ({ model: r.model, type: r.type || 'deleted', tokens: Number(r.tokens) || 0, input_tokens: Number(r.input_tokens) || 0, output_tokens: Number(r.output_tokens) || 0, deleted: !!r.deleted })) });

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
        const interactId = params.get('interact_id') || undefined;
        const logSource = params.get('log_source') || undefined;
        const startTime = params.get('start_time') ? Number(params.get('start_time')) : undefined;
        const endTime = params.get('end_time') ? Number(params.get('end_time')) : undefined;
        const page = params.get('page') ? Number(params.get('page')) : 1;
        const pageSize = params.get('pageSize') ? Number(params.get('pageSize')) : (params.get('limit') ? Number(params.get('limit')) : 50);
        try {
          const result = await ctx.logAccess.queryLogs({ level, source, keyword, trace_id: traceId, work_id: workId, interact_id: interactId, log_source: logSource, start_time: startTime, end_time: endTime, page, pageSize });
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
              interact_id: l.interact_id || '',
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
        // 使用未来时间作为 before_time，删除全部日志
        await ctx.logAccess.delLog(Object.assign(new DelLogInput(), { before_time: Date.now() + 86400000 }), output, new LogContext());
        sendJson(res, 200, { deleted_count: output.affected_rows });

      } else if (method === 'GET' && pathname === '/api/config/work') {
        sendJson(res, 200, []);

      // ---- Orchestration Strategies ----
      } else if (method === 'GET' && pathname === '/api/orchestration/strategies') {
        const rows = ctx.relationDb.queryRaw<{ id: string; strategy_id: string; strategy_label: string; strategy_description: string; enable: number; jsonnode_definition: string }>(
          'SELECT "id", "strategy_id", "strategy_label", "strategy_description", "enable", "jsonnode_definition" FROM "orchestration_strategy" ORDER BY "created" ASC',
          [],
        );
        sendJson(res, 200, (rows || []).map(r => {
          let parsed: { start_node?: string; nodes?: Array<{ node_id: string; node_type: string; params?: Record<string, unknown>; next: string | null; on_error?: string; true_next?: string; false_next?: string }> } = {};
          try { parsed = JSON.parse(r.jsonnode_definition); } catch { /* ignore */ }
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

      // ---- CDT Routes ----
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
        await ctx.cdtCore.getCookies(new CDTCoreGetCookiesInput(), o, new CDTCoreContext());
        sendJson(res, 200, o);

      // ---- Visualization Routes ----
      } else if (method === 'GET' && pathname === '/api/visualization/messages') {
        const i = Object.assign(new GetVisualizedMessagesInput(), {
          session_id: params.get('session_id') || undefined,
          work_id: params.get('work_id') || undefined,
          interact_id: params.get('interact_id') || undefined,
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

      // ---- VectorDB Search Routes ----
      } else if (method === 'POST' && pathname === '/api/vectordb/search') {
        const searchText = typeof body.text === 'string' ? body.text.trim() : '';
        if (!searchText) {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }
        try {
          // 校验向量化模型是否已配置（未配置则给出可操作提示）
          const vectorConfigRows = ctx.relationDb.queryRaw<{ llm_id: string }>(
            'SELECT "llm_id" FROM "info_vector_config" LIMIT 1',
            [],
          );
          if (vectorConfigRows.length === 0 || !vectorConfigRows[0].llm_id) {
            sendJson(res, 400, { error: '未配置向量化模型：请在「配置中心 > 记忆 > 向量化」中选择一个 embedding 类型模型（llm_id）后再进行语义搜索' });
            return;
          }

          // 语义搜索：对 info_vector 表中全部信息向量做余弦相似度搜索，返回信息记录 + 相似度分数
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
              interact_id: r.interact_id,
              score: r.score,
              matched_chunks: r.matched_chunks,
            })),
            count: output.list.length,
          });
        } catch (err: any) {
          sendJson(res, 500, { error: err.message || 'Vector search failed' });
        }

      // ---- Bookmark Routes ----
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
      // ---- Cron 定时任务管理 ----
      } else if (method === 'GET' && pathname === '/api/cron/tasks') {
        const output = new ListCronTasksOutput();
        await ctx.cronAccess.listCronTasks(new ListCronTasksInput(), output, new CronContext());
        sendJson(res, 200, { tasks: output.tasks });

      } else if (method === 'GET' && pathname.startsWith('/api/cron/tasks/')) {
        const parts = pathname.split('/').filter(Boolean);
        const name = parts[parts.length - 1];
        if (parts.length >= 5 && parts[parts.length - 1] === 'runs') {
          const input = Object.assign(new ListCronTaskRunsInput(), {
            name: parts.length === 5 ? parts[3] : undefined,
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

      } else if (method === 'GET' && serveFrontend(res, pathname)) {
        // 前端静态文件（SEA 打包模式）—— 已由 serveFrontend 处理

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

  // 发行包系统数据种子（通用目录数据：模型提供商列表 / MCP 提供商列表，
  // 由 packaging/export-system-data.mjs 从构建机库导出，个人数据已剔除）。
  // 仅空表导入，不覆盖运行数据；非打包环境无 BRIAN_SEED_FILE，行为不变。
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
  // 防止 Node.js HTTP Server 默认超时中断长连接（如 SSE 对话流或多轮 Agent 思考）
  server.timeout = 0;
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.keepAliveTimeout = 120000;

  // WebSocket server (Vite HMR proxy / future streaming)
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      ws.send(data); // echo
    });
  });

  const PORT = parseInt(process.env.BRIAN_PORT || '8000', 10);
  const HOST = process.env.BRIAN_HOST || '127.0.0.1';

  server.listen(PORT, HOST, () => {
    fileLogger.info(`[dev-server] brian-backend running at http://${HOST}:${PORT}`);
    fileLogger.info(`[dev-server] Data directory: ${DATA_DIR}`);
    // 自动启动 CDT：BRIAN_CDT_AUTO=0 可禁用（省一个常驻 Chrome 实例，
    // 低内存机器建议关闭；/api/cdt/start 仍可手动启动）
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
      } catch {}
      }
  });

  const gracefulShutdown = (signal: string) => {
    fileLogger.info(`[dev-server] Shutting down (${signal})...`);
    const finish = () => server.close(() => process.exit(0));
    try {
      // 关闭所有运行中的 MCP 进程，并重置状态
      ctx.mcpAccess.stopAllMcp().then((count) => {
        if (count > 0) fileLogger.info(`[dev-server] MCP stopped (${count})`);
      }).catch(() => {}).finally(() => {
        // 停止 CDT
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
  // Error 实例的 message/stack 不在可枚举属性上，fileLogger 序列化会丢失，此处显式展开
  if (err instanceof Error) {
    fileLogger.error('[dev-server] Fatal detail:', `${err.message}\n${err.stack}`);
  }
  // eslint-disable-next-line no-console
  console.error('[dev-server] Fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
