import { fileLogger } from './fileLog';
import { createLogger } from './contextLogger';
import { AgentBuilderAccess } from '../Agent/AgentBuilder';
import { AgentContextAccess } from '../Agent/AgentContext';
import { AgentExecutionAccess } from '../Agent/AgentExecution';
import { AgentLibraryAccess } from '../Agent/AgentLibrary';
import { AgentStrategyAccess } from '../Agent/AgentStrategy';
import { EvolutorAgentAccess } from '../Agent/EvolutorAgent';
import { IntentAgentAccess, IntentAgentContext } from '../Agent/IntentAgent';
import { SummaryAgentAccess, SummaryAgentContext } from '../Agent/SummaryAgent';
import { WriterAgentAccess } from '../Agent/WriterAgent';
import { ChatAccess } from '../Application/Chat/access/ChatAccess';
import { ChatContext, PurgeOrphanSessionsInput, PurgeOrphanSessionsOutput } from '../Application/Chat/domain/types';
import { ChatSchemaInitializer } from '../Application/Chat/infrastructure/ChatSchemaInitializer';
import { ConfigAccess } from '../Application/Config/access/ConfigAccess';
import { SelfLearningAccess } from '../Application/SelfLearning/access/SelfLearningAccess';
import { SelfLearningContext, StartLearningInput, StartLearningOutput } from '../Application/SelfLearning/domain/types';
import { UserProfileAccess } from '../Application/UserProfile/access/UserProfileAccess';
import { VisualizationAccess } from '../Application/Visualization/access/VisualizationAccess';
import { BookmarkAccess } from '../Base/BookmarkProvider';
import { CDTAccess } from '../Base/CDTProvider';
import { ChunkAccess } from '../Base/ChunkProvider';
import { CronAccess } from '../Base/CronProvider';
import { FeedbackAccess, FeedbackContext, PurgeOrphanFeedbackInput, PurgeOrphanFeedbackOutput } from '../Base/FeedbackHandler';
import { GraphDBAccess } from '../Base/GraphDBProvider';
import { LLMAccess } from '../Base/LLMProvider';
import { LogAccess } from '../Base/LogProvider';
import { MCPAccess } from '../Base/MCPProvider';
import { MQAccess } from '../Base/MQProvider';
import { PromptsAccess } from '../Base/PromptsProvider';
import { RelationDBAccess } from '../Base/RelationDBProvider';
import { SkillAccess, SeedSystemSkillsInput, SeedSystemSkillsOutput } from '../Base/SkillProvider';
import { SoulAccess } from '../Base/SoulProvider';
import { StreamAccess } from '../Base/StreamProvider';
import { ObservabilityAccess } from '../Base/ObservabilityProvider';
import { ExecRequestInput, ExecRequestOutput, HttpContext } from '../Base/ToolProvider/domain/HttpTypes';
import { VectorDBAccess } from '../Base/VectorDBProvider';
import { Report } from '../Base/shared/base/Report';
import { CDTCoreAccess } from '../Core/CDTCoreProvider';
import { InfoCoreAccess, DelInfoInput, DelInfoOutput, InfoCoreContext, RebuildCooccurGraphInput, RebuildCooccurGraphOutput, RebuildCitationGraphInput, RebuildCitationGraphOutput, BackfillMissingSummariesInput, BackfillMissingSummariesOutput } from '../Core/InfoCoreProvider';
import { LLMCoreAccess } from '../Core/LLMCoreProvider';
import { MCPCoreAccess } from '../Core/MCPCoreProvider';
import { MQCoreAccess } from '../Core/MQCoreProvider';
import { SkillCoreAccess, SkillCoreContext, AgeSkillInput, AgeSkillOutput } from '../Core/SkillCoreProvider';
import { SoulCoreAccess, SoulCoreContext, AgeSoulInput, AgeSoulOutput } from '../Core/SoulCoreProvider';
import { IdGenerator, ToolAccess, HttpAccess, SystemMonitorAccess, ToolSchemaInitializer, ConfigService, TOOL_CONFIG_TABLE, Metrics, MetricsLogger, TraceSchemaInitializer, ensureElectionConfigTable, createEmbedTaskFn, createSemanticsTaskFn } from '@brian-agent/base';
import { ExecuteEventProcessor } from '../Base/ExecuteEventProvider/application/ExecuteEventProcessor';
import { EXECUTE_COMPONENT_TYPES, type ExecuteEvent } from '../Base/shared/base/ExecuteEvent';
import { SessionAccess, SkillRuntimeAccess, RegisterBuiltinSkillsInput, RegisterBuiltinSkillsOutput, LoopAccess, AgentDefAccess, RunGatewayAccess, AgentDefContext, SweepDefHealthInput, SweepDefHealthOutput } from '@brian-agent/runtime';
import path from 'node:path';

/** 组合根:构造全部 Access 依赖并手动注入(自 dev-server.ts 平移,行为不变)。 */

import { AgentBuilderContext } from '../Agent/AgentBuilder';
import { BuildSystemAgentInput } from '../Agent/AgentBuilder';
import { BuildSystemAgentOutput } from '../Agent/AgentBuilder';
import { SkillRuntimeContext as RuntimeSkillContext } from '../Runtime/SkillRuntime';
import { SkillContext } from '../Base/SkillProvider';

const DATA_DIR = process.env.BRIAN_DATA_DIR || path.join(__dirname, '..', 'data');

let runtimeGatewayRef: RunGatewayAccess;

/** createServer 经此读取运行网关(buildContext 内赋值) */
export function getRuntimeGateway(): RunGatewayAccess { return runtimeGatewayRef; }

export let _httpAccessRef: HttpAccess | null = null;
export const httpReq = async (req: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }) => {
  const out = new ExecRequestOutput();
  const access = _httpAccessRef ?? new HttpAccess();
  await access.execRequest(
    Object.assign(new ExecRequestInput(), { url: req.url, method: req.method, headers: req.headers, body: req.body, timeout_ms: req.timeoutMs }),
    out, new HttpContext(),
  );
  return out.response;
};

function readVectorDimension(relationDb: import('../Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess): number {
  try {
    const rows = relationDb.queryRaw<{ dimension: number }>(
      'SELECT "dimension" FROM "info_vector_config_record" LIMIT 1', [],
    );
    if (rows.length > 0 && Number(rows[0].dimension) > 0) {
      return Number(rows[0].dimension);
    }
  } catch {  }
  return 1536;
}

export async function buildContext() {

  const relationDb = new RelationDBAccess({ dbPath: path.join(DATA_DIR, 'brian.db'), wal: true, autoCreateConfigTable: true });
  await relationDb.initialize();

  const logRelationDb = new RelationDBAccess({ dbPath: path.join(DATA_DIR, 'brian_log.db'), wal: true, autoCreateConfigTable: true });
  await logRelationDb.initialize();

  const logAccess = new LogAccess(logRelationDb, createLogger());
  await logAccess.initialize();
  const logger = createLogger(logAccess);

  const executeEventProcessor = new ExecuteEventProcessor(relationDb, logger);
  Report.setExecuteEventSink(executeEventProcessor);

  try {
    relationDb.executeRaw('DROP TABLE IF EXISTS "agent_plan"');
    relationDb.executeRaw('DROP TABLE IF EXISTS "planner_agent_config"');
  } catch (e) {
    logger.warn('dropLegacyTables', 'failed to drop retired planner tables', String(e));
  }

  // TraceBase(ADR-012):统一统计域建表 + 旧 usage 表改名/退役,须先于一切统计写入方初始化
  new TraceSchemaInitializer(relationDb).init();

  // R8 统一选举阈值配置表(election_config_record,幂等)
  ensureElectionConfigTable(relationDb);

  // ADR-012 集中改名器:存量库旧表名 → 规范新表名(幂等,旧表不存在或已改名时忽略);
  // 全新库由各 SchemaInitializer 直接建新名表,此处仅负责数据保全。
  const LEGACY_TABLE_RENAMES: Array<[string, string]> = [
    // 组件定义域
    ['skill', 'skill_record'], ['soul', 'soul_record'], ['prompt_template', 'prompt_template_record'],
    ['agent', 'agent_record'], ['agent_opt_rule', 'agent_opt_rule_record'],
    ['agent_strategy', 'agent_strategy_record'], ['agent_evaluation', 'agent_evaluation_record'],
    ['runtime_agent_def', 'runtime_agent_def_record'],
    ['llm_provider', 'llm_provider_record'], ['llm_available', 'llm_available_record'],
    ['mcp_provider', 'mcp_provider_record'], ['mcp_install', 'mcp_install_record'],
    ['agent_embedding', 'agent_embedding_record'], ['mcp_embedding', 'mcp_embedding_record'],
    ['skill_embedding', 'skill_embedding_record'], ['prompt_template_embedding', 'prompt_template_embedding_record'],
    ['soul_embedding', 'soul_embedding_record'],
    ['agent_example_embedding', 'agent_example_embedding_record'], ['mcp_example_embedding', 'mcp_example_embedding_record'],
    ['skill_example_embedding', 'skill_example_embedding_record'], ['prompt_template_example_embedding', 'prompt_template_example_embedding_record'],
    ['soul_example_embedding', 'soul_example_embedding_record'],
    // 记忆对话域
    ['dialog', 'dialog_record'], ['execute', 'execute_record'], ['context', 'context_org'],
    ['info_vector', 'info_vector_record'], ['info_tag', 'info_tag_record'],
    ['info_tag_vector', 'info_tag_vector_record'], ['info_summary', 'info_summary_record'],
    ['info_keyword', 'info_keyword_org'],
    // Runtime 域
    ['runtime_session', 'runtime_session_record'], ['runtime_message', 'runtime_message_record'],
    ['runtime_message_part', 'runtime_message_part_record'], ['runtime_run', 'runtime_run_record'],
    ['stream_event', 'stream_event_record'],
    // 应用与基建域
    ['chat_session', 'chat_session_record'],
    ['bookmark_folder', 'bookmark_folder_record'], ['bookmark_item', 'bookmark_item_record'],
    ['cron_task', 'cron_task_record'], ['cron_task_run', 'cron_task_run_record'],
    ['log_rule', 'log_rule_record'], ['queue_message', 'queue_message_record'],
    ['feedback_process_log', 'feedback_process_log_record'],
    ['cdt_login_credential', 'cdt_login_credential_record'], ['cdt_page_session', 'cdt_page_session_record'],
    ['llm_cache', 'llm_cache_record'], ['mcp_cache', 'mcp_cache_record'],
    ['user_profile_direction', 'user_profile_direction_record'],
    ['user_profile_dimension_data', 'user_profile_dim_record'],
    ['user_profile_dimension_data_record', 'user_profile_dim_record'],
    ['writer_agent_user_profile', 'writer_agent_user_profile_record'],
    ['agent_skill', 'agent_skill_org'], ['agent_soul', 'agent_soul_org'], ['agent_mcp', 'agent_mcp_org'],
    // 全部 *_config → *_config_record
    ['agent_builder_config', 'agent_builder_config_record'], ['agent_context_config', 'agent_context_config_record'],
    ['agent_execution_trace', 'agent_execution_trace_record'],
    ['agent_execution_config', 'agent_execution_config_record'], ['agent_library_config', 'agent_library_config_record'],
    ['agent_strategy_config', 'agent_strategy_config_record'], ['cdt_config', 'cdt_config_record'],
    ['evolutor_agent_config', 'evolutor_agent_config_record'], ['feedback_config', 'feedback_config_record'],
    ['graphdb_config', 'graphdb_config_record'], ['info_config', 'info_config_record'],
    ['info_context_config', 'info_context_config_record'], ['info_summary_config', 'info_summary_config_record'],
    ['info_tag_config', 'info_tag_config_record'], ['info_vector_config', 'info_vector_config_record'],
    ['llm_config', 'llm_config_record'], ['llm_core_config', 'llm_core_config_record'],
    ['log_config', 'log_config_record'], ['mcp_config', 'mcp_config_record'],
    ['mcp_core_config', 'mcp_core_config_record'], ['mq_config', 'mq_config_record'],
    ['prompts_config', 'prompts_config_record'], ['relationdb_config', 'relationdb_config_record'],
    ['runtime_agents_config', 'runtime_agents_config_record'], ['runtime_runs_config', 'runtime_runs_config_record'],
    ['runtime_session_config', 'runtime_session_config_record'], ['skill_config', 'skill_config_record'],
    ['skill_core_config', 'skill_core_config_record'], ['soul_config', 'soul_config_record'],
    ['soul_core_config', 'soul_core_config_record'], ['stream_config', 'stream_config_record'],
    ['tool_config', 'tool_config_record'], ['user_profile_config', 'user_profile_config_record'],
    ['vectordb_config', 'vectordb_config_record'], ['visualization_config', 'visualization_config_record'],
    ['writer_agent_config', 'writer_agent_config_record'], ['self_learning_config', 'self_learning_config_record'],
    // 配额与 usage
    ['llm_provider_quota', 'llm_provider_quota_record'],
    // config 中心六表
    ['config_registry', 'config_registry_record'], ['config_config', 'config_config_record'],
    ['config_layer_privilege', 'config_layer_privilege_record'], ['config_module_privilege', 'config_module_privilege_record'],
    ['config_snapshot', 'config_snapshot_record'], ['config_history', 'config_history_record'],
  ];
  for (const [legacy, modern] of LEGACY_TABLE_RENAMES) {
    try { relationDb.executeRaw(`ALTER TABLE "${legacy}" RENAME TO "${modern}"`); } catch { /* 旧表不存在或已改名 */ }
    // 公共 trace_id 列补齐(ADR-012 公共字段规范)
    try { relationDb.executeRaw(`ALTER TABLE "${modern}" ADD COLUMN "trace_id" TEXT NOT NULL DEFAULT ''`); } catch { /* 列已存在 */ }
  }

  const promptsAccess = new PromptsAccess(relationDb, logger);
  await promptsAccess.initialize();

  const llmAccess = new LLMAccess(relationDb, logger, promptsAccess);
  await llmAccess.initialize();

  const embedTaskFn = createEmbedTaskFn(llmAccess);
  const semanticsTaskFn = createSemanticsTaskFn(llmAccess);
  promptsAccess.setEmbedFn(embedTaskFn);
  promptsAccess.setSemanticsFn(semanticsTaskFn);

  const mcpAccess = new MCPAccess(relationDb, logger);
  mcpAccess.setEmbedFn(embedTaskFn);
  mcpAccess.setSemanticsFn(semanticsTaskFn);

  try {
    const synced = await mcpAccess.syncInstallStatus();
    if (synced > 0) logger.info('[startup] MCP sync', `清理了 ${synced} 条已卸载的 npm 安装记录`);
  } catch {  }

  try {
    await mcpAccess.stopAllMcp();
  } catch {  }

  const soulAccess = new SoulAccess(relationDb, logger);
  soulAccess.setEmbedFn(embedTaskFn);
  soulAccess.setSemanticsFn(semanticsTaskFn);
  await soulAccess.initialize();

  const skillAccess = new SkillAccess(relationDb, logger);
  skillAccess.setEmbedFn(embedTaskFn);
  skillAccess.setSemanticsFn(semanticsTaskFn);
  await skillAccess.initialize();

  let systemSkillIds: string[] = [];
  try {
    const { SYSTEM_SKILLS } = await import('@brian-agent/runtime');
    systemSkillIds = SYSTEM_SKILLS.map((s) => s.id);
    const seedIn = new SeedSystemSkillsInput();
    seedIn.specs = SYSTEM_SKILLS.map((s) => ({
      id: s.id,
      name: s.name,
      skill_brief: s.brief,
      skill_md: s.md,
    }));
    const seedOut = new SeedSystemSkillsOutput();
    await skillAccess.seedSystemSkills(seedIn, seedOut, new SkillContext());
    if (seedOut.inserted.length > 0) {
      logger.info('[startup] System Skill seed', `系统级技能落库 ${seedOut.inserted.length} 条: ${seedOut.inserted.join('、')}`);
    }
  } catch (e) {
    logger.warn('[startup] System Skill seed failed', e instanceof Error ? e.message : String(e));
  }

  if (systemSkillIds.length > 0) {
    try {
      const agentRows = relationDb.queryRaw<{ id: string; skill_ids_json: string }>(
        `SELECT "id", "skill_ids_json" FROM "agent_record"`,
      );
      let backfilled = 0;
      for (const row of agentRows) {
        let ids: string[] = [];
        try {
          const parsed = JSON.parse(row.skill_ids_json || '[]');
          ids = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch { ids = []; }
        const merged = [...ids];
        for (const sid of systemSkillIds) {
          if (!merged.includes(sid)) merged.push(sid);
        }
        if (merged.length !== ids.length) {
          relationDb.executeRaw(
            `UPDATE "agent_record" SET "skill_ids_json" = ?, "updated" = ? WHERE "id" = ?`,
            [JSON.stringify(merged), IdGenerator.now(), row.id],
          );
          backfilled++;
        }
      }
      if (backfilled > 0) {
        logger.info('[startup] System Skill binding backfill', `${backfilled} 个 Agent 的技能绑定并入系统级技能`);
      }
    } catch (e) {
      logger.warn('[startup] System Skill binding backfill failed', e instanceof Error ? e.message : String(e));
    }
  }

  const graphDBAccess = new GraphDBAccess(relationDb, { dbPath: path.join(DATA_DIR, 'graph.db') }, logger);
  await graphDBAccess.initialize();

  const mqAccess = new MQAccess(relationDb, logger);
  await mqAccess.initialize();

  const vectorDBAccess = new VectorDBAccess(relationDb, {
    lancePath: path.join(DATA_DIR, 'vectordb'),
    metric: 'cosine',
    logger,
  });

  // ADR-012:旧 skill_usage/soul_usage 明细表已由 TraceBase 接管,历史补列逻辑退役

  const cdtAccess = new CDTAccess(relationDb, DATA_DIR, logger);
  await cdtAccess.initialize();

  const bookmarkAccess = new BookmarkAccess(relationDb, logger);
  const toolAccess = new ToolAccess();

  const systemMonitorAccess = new SystemMonitorAccess(DATA_DIR);

  new ToolSchemaInitializer(relationDb).init();
  const toolConfigService = new ConfigService(relationDb, TOOL_CONFIG_TABLE);
  await toolConfigService.initDefaults([
    { config_key: 'http_timeout_ms', config_value: '60000', value_type: 'INT', description: 'HTTP 请求默认超时时间（毫秒）' },
  ]);
  const httpAccess = new HttpAccess(toolConfigService);
  _httpAccessRef = httpAccess;

  const streamAccess = new StreamAccess(relationDb, logger);

  // ADR-013：观测总线组合根 —— Report.emit → EventDispatcher →(SSE 帧 / 事件落库 / run 状态)
  const observability = new ObservabilityAccess(relationDb, logger);
  observability.setFrameWriter((sessionId, endpointId, ev) => streamAccess.pushFrame(sessionId, endpointId, ev));
  Report.setEventGateway({
    emit: (meta, type, payload) => {
      observability.emit(meta, type, payload);
    },
    flush: () => observability.flush(),
  });
  Report.setLogger(logger);

  const infoCore = new InfoCoreAccess(relationDb, llmAccess, promptsAccess, vectorDBAccess, graphDBAccess, logger);
  await infoCore.initialize();

  try {
    const rebuildOut = new RebuildCooccurGraphOutput();
    await infoCore.rebuildCooccurGraph(new RebuildCooccurGraphInput(), rebuildOut, new InfoCoreContext());
    if ((rebuildOut.rebuilt_edges ?? 0) > 0 || (rebuildOut.deleted_edges ?? 0) > 0) {
      logger.info('[startup] rebuild cooccur edges', `deleted=${rebuildOut.deleted_edges} rebuilt=${rebuildOut.rebuilt_edges}`);
    }
  } catch (e: any) {
    logger.warn('[startup] rebuild cooccur edges', 'failed', e?.message || String(e));
  }

  try {
    const citeOut = new RebuildCitationGraphOutput();
    await infoCore.rebuildCitationGraph(new RebuildCitationGraphInput(), citeOut, new InfoCoreContext());
    if ((citeOut.migrated_edges ?? 0) > 0 || citeOut.dropped_table) {
      logger.info('[startup] migrate citation edges', `migrated=${citeOut.migrated_edges} dropped_table=${citeOut.dropped_table}`);
    }
  } catch (e: any) {
    logger.warn('[startup] migrate citation edges', 'failed', e?.message || String(e));
  }

  try {
    for (const db of [relationDb, logRelationDb]) {
      const result = db.walCheckpoint('TRUNCATE');
      logger.info('[startup] WAL checkpoint', `busy=${result.busy} log=${result.log} checkpointed=${result.checkpointed}`);
    }
  } catch (e: any) {
    logger.warn('[startup] WAL checkpoint', 'failed', e?.message || String(e));
  }

  const vectorDimension = readVectorDimension(relationDb);
  await vectorDBAccess.initialize(vectorDimension);

  const llmCore = new LLMCoreAccess(relationDb, llmAccess, promptsAccess, logger);
  await llmCore.initialize();

  const mcpCore = new MCPCoreAccess(relationDb, mcpAccess, llmAccess, promptsAccess, logger);
  try { await (mcpCore as any).initialize?.(); } catch {  }

  const skillCore = new SkillCoreAccess(relationDb, skillAccess, llmAccess, promptsAccess, logger);
  try { await (skillCore as any).initialize?.(); } catch {  }

  const soulCore = new SoulCoreAccess(relationDb, soulAccess, llmAccess, promptsAccess, logger);
  await soulCore.initialize();

  const mqCore = new MQCoreAccess(mqAccess, logger);

  const cdtCore = new CDTCoreAccess(relationDb, cdtAccess, logger);

  const feedbackAccess = new FeedbackAccess(relationDb, logger);
  await feedbackAccess.initialize();

  const agentLibrary = new AgentLibraryAccess(relationDb, llmAccess, promptsAccess, logger);
  agentLibrary.setEmbedFn(embedTaskFn);
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
  const evolutorAgent = new EvolutorAgentAccess(relationDb, llmAccess, promptsAccess, infoCore, mqAccess, mqCore, agentBuilder, agentLibrary, agentExecution, llmCore, feedbackAccess, logger);
  await evolutorAgent.initialize();
  const summaryAgent = new SummaryAgentAccess(relationDb, llmAccess, promptsAccess, soulAccess, agentBuilder, agentLibrary, infoCore, llmCore, logger);
  await summaryAgent.initialize();
  const intentAgent = new IntentAgentAccess(relationDb, llmAccess, promptsAccess, soulAccess, agentBuilder, agentLibrary, infoCore, llmCore, logger);

  try {
    for (const agentType of ['WRITER', 'EVOLUTOR', 'SUMMARY', 'INTENT'] as const) {
      await agentBuilder.buildSystemAgent(
        Object.assign(new BuildSystemAgentInput(), { agent_type: agentType }),
        new BuildSystemAgentOutput(),
        new AgentBuilderContext(),
      );
    }
  } catch (e) {
    logger.warn('preBuildSystemAgents', 'failed to pre-build some system agents', String(e));
  }

  try {
    await summaryAgent.ensureBuiltin(new SummaryAgentContext());
    await intentAgent.ensureBuiltin(new IntentAgentContext());
  } catch (e) {
    logger.warn('preBuildSystemAgents', 'failed to pre-build SummaryAgent/IntentAgent', String(e));
  }

  new ChatSchemaInitializer(relationDb).init();

  const runtimeSessionAccess = new SessionAccess(relationDb, logger);
  await runtimeSessionAccess.initialize();
  const runtimeSkillAccess = new SkillRuntimeAccess(relationDb, {
    skillAccess,
    mcpAccess,
    cdtCore,

    runGateway: {
      submitRun: async (input) => {
        const { SubmitRunInput, SubmitRunOutput, RunGatewayContext } = await import('../Runtime');
        const i = Object.assign(new SubmitRunInput(), {
          session_key: input.session_key,
          user_message: input.user_message,
          lane_kind: input.lane_kind,
          queue_mode: input.queue_mode,
          agent_ref: input.agent_ref,
          parent_run_id: input.parent_run_id,
        });
        const o = new SubmitRunOutput();
        await runtimeGatewayRef.submitRun(i, o, new RunGatewayContext());
        return { run_id: o.run_id };
      },
    },

    askUserGate: {
      waitAnswer: async (input) => {
        const { WaitUserAnswerInput, WaitUserAnswerOutput, RunGatewayContext } = await import('../Runtime');
        const i = Object.assign(new WaitUserAnswerInput(), input);
        const o = new WaitUserAnswerOutput();
        await runtimeGatewayRef.waitUserAnswer(i, o, new RunGatewayContext());
        return { answer: o.answer, answered: o.answered };
      },
    },
  }, logger);
  await runtimeSkillAccess.initialize();

  const builtinRegIn = new RegisterBuiltinSkillsInput();
  const builtinRegOut = new RegisterBuiltinSkillsOutput();
  await runtimeSkillAccess.registerBuiltinSkills(builtinRegIn, builtinRegOut, new RuntimeSkillContext());
  logger.info('[startup] runtime builtin tools', String(builtinRegOut.registered ?? []));

  const loopQueueBridge: import('@brian-agent/runtime').LoopQueue = {
    drainSteering: (sessionKey: string) => runtimeGatewayRef.drainSteeringFor(sessionKey),
    takeFollowup: (sessionKey: string) => runtimeGatewayRef.takeFollowupFor(sessionKey),
  };
  const permissionGateBridge = {
    wait: async (input: { permission_id: string; tool_id?: string }) => {
      const { WaitPermissionInput, WaitPermissionOutput, RunGatewayContext } = await import('../Runtime');
      const i = Object.assign(new WaitPermissionInput(), input);
      const o = new WaitPermissionOutput();
      await runtimeGatewayRef.waitPermission(i, o, new RunGatewayContext());
      return { approved: o.approved, autoApproved: o.auto_approved };
    },
  };

  function safeJsonParse(text: string): unknown {

    try { return JSON.parse(text); } catch { return text; }
  }

  function rawText(err: unknown): string {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '');
  }

  function permissionAskedEvent(input: { permission_id: string; session_id: string; session_key: string; run_id: string; tool_id: string; arguments_json: string; asked_at: number }): ExecuteEvent {
    return {
      component_id: input.tool_id || 'permission',
      component_type: EXECUTE_COMPONENT_TYPES.PERMISSION,
      session_id: input.session_key || input.session_id || '',
      work_id: input.run_id || '',
      run_id: input.run_id || '',
      start: input.asked_at,
      end: input.asked_at,
      gap: 0,
      input: {
        permission_id: input.permission_id,
        tool_id: input.tool_id,
        arguments: safeJsonParse(input.arguments_json),
        status: 'pending',
      },
      output: '',
      status: 'ok',
      permission_id: input.permission_id,
    };
  }

  function permissionAnsweredEvent(input: { permission_id: string; approved: boolean; answered_at: number }): ExecuteEvent {
    return {
      component_id: 'permission',
      component_type: EXECUTE_COMPONENT_TYPES.PERMISSION,
      start: input.answered_at,
      end: input.answered_at,
      gap: 0,
      input: '',
      output: {
        status: input.approved ? 'allowed' : 'denied',
        answered_at: input.answered_at,
      },
      status: 'ok',
      permission_id: input.permission_id,
    };
  }

  const permissionAuditBridge: import('@brian-agent/runtime').PermissionAudit = {
    asked: async (input) => {
      try {
        executeEventProcessor.push(permissionAskedEvent(input));
      } catch (err) {
        logger.info('[permission-audit] asked 上报失败（不影响 run）', rawText(err));
      }
    },
    answered: async (input) => {
      try {
        executeEventProcessor.push(permissionAnsweredEvent(input));
      } catch (err) {
        logger.info('[permission-audit] answered 上报失败（不影响 run）', rawText(err));
      }
    },
  };
  const runtimeLoopAccess = new LoopAccess(relationDb, llmAccess, runtimeSessionAccess, runtimeSkillAccess, logger, loopQueueBridge, permissionGateBridge, permissionAuditBridge);
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
  const runtimeGateway = new RunGatewayAccess(
    relationDb,
    runtimeSessionAccess,
    runtimeAgentDefAccess,
    runtimeLoopAccess,
    logger,
    evolutorAgent,
    writerAgent,

    infoCore,
  );
  await runtimeGateway.initialize();
  runtimeGatewayRef = runtimeGateway;

  const chatAccess = new ChatAccess(relationDb, infoCore, logger, streamAccess, {
    gateway: runtimeGateway,
    session: runtimeSessionAccess,
  });

  const chunkAccess = new ChunkAccess(logger);
  const selfLearningAccess = new SelfLearningAccess(relationDb, infoCore, mqCore, llmCore, evolutorAgent, writerAgent, graphDBAccess, mqAccess, chunkAccess, llmAccess, promptsAccess, logger, soulAccess, runtimeAgentDefAccess);

  try {
    const docAgentDefId = await selfLearningAccess.ensureBuiltinDocumentAgent();
    logger.info('[startup] document reading agent', docAgentDefId || '(skipped)');
  } catch (e) {
    logger.warn('[startup] document reading agent failed', e instanceof Error ? e.message : String(e));
  }

  await selfLearningAccess.startLearning(
    Object.assign(new StartLearningInput(), { learning_mode: 'RANDOM' }),
    new StartLearningOutput(),
    new SelfLearningContext(),
  );

  const cronAccess = new CronAccess(relationDb, logger);

  let tagAgingCron = '0 0 2 * * *';
  let orphanTagCron = '0 0 3 * * *';
  try {
    const slCfg = relationDb.queryRaw<{ tag_aging_cron: string; orphan_tag_check_cron: string }>(
      'SELECT "tag_aging_cron", "orphan_tag_check_cron" FROM "self_learning_config_record" LIMIT 1', [],
    );
    if (slCfg.length > 0) {
      if (slCfg[0].tag_aging_cron) tagAgingCron = slCfg[0].tag_aging_cron;
      if (slCfg[0].orphan_tag_check_cron) orphanTagCron = slCfg[0].orphan_tag_check_cron;
    }
  } catch {  }

  await cronAccess.registerTask('tag_aging', '标签老化', tagAgingCron, () => selfLearningAccess.startTagAging());
  await cronAccess.registerTask('orphan_tag_check', '孤立标签检查', orphanTagCron, () => selfLearningAccess.startOrphanTagCheck());
  cronAccess.start();

  const userProfileAccess = new UserProfileAccess(relationDb, writerAgent, evolutorAgent, infoCore, llmCore, llmAccess, promptsAccess, logger);
  await userProfileAccess.initialize();

  await userProfileAccess.startAutoGeneration();
  const visualizationAccess = new VisualizationAccess(relationDb, agentExecution, agentLibrary, agentContext, evolutorAgent, infoCore, llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess, graphDBAccess, logger);
  await visualizationAccess.initialize();

  const configAccess = new ConfigAccess(
    relationDb,
    llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess,
    logAccess,
    mqAccess, graphDBAccess, vectorDBAccess,
    llmCore, infoCore, mcpCore, skillCore, soulCore,
    writerAgent, evolutorAgent, agentLibrary, agentBuilder,
    agentExecution, agentStrategy, agentContext,
    chatAccess, selfLearningAccess, userProfileAccess, visualizationAccess,
    cronAccess,
    logger,
  );

  try {
    const existingDefault = relationDb.queryRaw<{ id: string }>(
      'SELECT "id" FROM "config_snapshot_record" WHERE "name" = ? LIMIT 1', ['默认快照'],
    );
    if (existingDefault.length === 0) {
      const configTables = relationDb.queryRaw<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%_config' OR name LIKE '%_config_record' OR name LIKE '%_privilege' OR name LIKE '%_privilege_record' OR name='config_registry_record' OR name='config_config_record' OR name='orchestration_strategy' OR name='prompt_template_record')",
        [],
      );
      const snapshotData: Record<string, unknown[]> = {};
      for (const row of configTables || []) {
        try { snapshotData[row.name] = relationDb.queryRaw<Record<string, unknown>>(`SELECT * FROM "${row.name}"`, []) || []; } catch {  }
      }
      const now = Date.now();
      relationDb.executeRaw(
        'INSERT INTO "config_snapshot_record" ("id", "created", "updated", "name", "snapshot_data") VALUES (?, ?, ?, ?, ?)',
        [IdGenerator.generate(), now, now, '默认快照', JSON.stringify(snapshotData)],
      );
      logger.info('[startup] default snapshot created', '默认快照已创建');
    }
  } catch (e) {
    logger.warn('[startup] default snapshot failed', String(e));
  }

  try {
    const cleaned = await mqAccess.cleanupExpiredMessages();
    if (cleaned > 0) logger.info('[startup] MQ cleanup', `删除了 ${cleaned} 条过期消息`);
  } catch (e) {
    logger.warn('[startup] MQ cleanup failed', String(e));
  }

  function scheduleMidnightCleanup() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {

      const triggerTrace = cronTrace('cron.mqcleanup');
      try {
        mqAccess.cleanupExpiredMessages().then((cleaned) => {
          if (cleaned > 0) logger.info('[cron] MQ cleanup', { detail: `删除了 ${cleaned} 条过期消息`, trace_id: triggerTrace.trace_id, source: 'cron.mqcleanup' });
        }).catch(() => {});
      } catch {  }
      scheduleMidnightCleanup();
    }, msUntilMidnight);
  }
  scheduleMidnightCleanup();

  function cronTrace(category: string) {
    return new Metrics(logger as unknown as MetricsLogger, category, IdGenerator.generate());
  }
  try {
    const delOut = new DelInfoOutput();
    await infoCore.delInfo(new DelInfoInput(), delOut, new InfoCoreContext(), cronTrace('cron.infocleanup.startup'));
    if (delOut.deleted_count > 0) logger.info('[startup] Info cleanup', `清理了 ${delOut.deleted_count} 条过期信息`);
  } catch (e) {
    logger.warn('[startup] Info cleanup failed', String(e));
  }

  function scheduleInfoCleanup() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {
      const triggerTrace = cronTrace('cron.infocleanup.midnight');
      try {
        const delOut = new DelInfoOutput();
        infoCore.delInfo(new DelInfoInput(), delOut, new InfoCoreContext(), triggerTrace).then(() => {
          if (delOut.deleted_count > 0) logger.info('[cron] Info cleanup', { detail: `清理了 ${delOut.deleted_count} 条过期信息`, trace_id: triggerTrace.trace_id, source: 'cron' });
        }).catch(() => {});
      } catch {  }
      scheduleInfoCleanup();
    }, msUntilMidnight);
  }
  scheduleInfoCleanup();

  try {
    const backfillOut = new BackfillMissingSummariesOutput();
    await infoCore.backfillMissingSummaries(new BackfillMissingSummariesInput(), backfillOut, new InfoCoreContext(), cronTrace('cron.summarybackfill.startup'));
    if (backfillOut.backfilled_count > 0) logger.info('[startup] Summary backfill', `补生成了 ${backfillOut.backfilled_count} 条缺失摘要`);
  } catch (e) {
    logger.warn('[startup] Summary backfill failed', String(e));
  }

  async function purgeOrphanSessionMemory(): Promise<number> {
    const out = new PurgeOrphanSessionsOutput();
    await chatAccess.purgeOrphanSessions(
      new PurgeOrphanSessionsInput(), out, new ChatContext(), cronTrace('cron.orphanmemory'),
    );
    return out.purged_count;
  }
  try {
    const purged = await purgeOrphanSessionMemory();
    if (purged > 0) logger.info('[startup] Orphan session memory cleanup', `清理了 ${purged} 个孤儿会话的记忆残留`);
  } catch (e) {
    logger.warn('[startup] Orphan session memory cleanup failed', String(e));
  }

  try {
    const orphanFeedbackOut = new PurgeOrphanFeedbackOutput();
    await feedbackAccess.purgeOrphanFeedback(
      new PurgeOrphanFeedbackInput(), orphanFeedbackOut, new FeedbackContext(), cronTrace('cron.orphanfeedback'),
    );
    if (orphanFeedbackOut.purged_count > 0) {
      logger.info('[startup] Orphan feedback cleanup', `清理了 ${orphanFeedbackOut.purged_count} 条孤儿反馈`);
    }
  } catch (e) {
    logger.warn('[startup] Orphan feedback cleanup failed', String(e));
  }

  function scheduleOrphanMemoryCleanup() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {
      try {
        purgeOrphanSessionMemory().then((purged) => {
          if (purged > 0) logger.info('[cron] Orphan session memory cleanup', `清理了 ${purged} 个孤儿会话的记忆残留`);
        }).catch(() => {});
      } catch {  }
      scheduleOrphanMemoryCleanup();
    }, msUntilMidnight);
  }
  scheduleOrphanMemoryCleanup();

  setInterval(() => {
    const triggerTrace = cronTrace('cron.mcpinstallsync');
    try {
      mcpAccess.syncInstallStatus().then((removed) => {
        if (removed > 0) logger.info('[cron] MCP install sync', { detail: `清理了 ${removed} 条已卸载的 npm 安装记录`, trace_id: triggerTrace.trace_id, source: 'cron.mcpinstallsync' });
      }).catch(() => {});
    } catch (err) {
      fileLogger.warn('[dev-server] cron.mcpinstallsync 触发同步失败（容忍：等待下个周期）', err instanceof Error ? err.message : String(err));
    }
  }, 60 * 60 * 1000);

  setInterval(() => {
    try {
      for (const db of [relationDb, logRelationDb]) {
        db.walCheckpoint('PASSIVE');
      }
    } catch (err) {
      fileLogger.warn('[dev-server] cron.walCheckpoint 失败（容忍：等待下个周期重试）', err instanceof Error ? err.message : String(err));
    }
  }, 30 * 60 * 1000);

  function scheduleDailyAging() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {
      const triggerTrace = cronTrace('cron.skill-soul-aging');
      try {
        const skillOut = new AgeSkillOutput();
        skillCore.ageSkill(new AgeSkillInput(), skillOut, new SkillCoreContext(), triggerTrace).then(() => {
          if (skillOut.aged_count > 0) logger.info('[cron] Skill aging', { detail: `老化 ${skillOut.aged_count} 个 Skill`, trace_id: triggerTrace.trace_id, source: 'cron.skill-soul-aging' });
        }).catch(() => {});
        const soulOut = new AgeSoulOutput();
        soulCore.ageSoul(new AgeSoulInput(), soulOut, new SoulCoreContext(), triggerTrace).then(() => {
          if (soulOut.aged_count > 0) logger.info('[cron] Soul aging', { detail: `老化 ${soulOut.aged_count} 个 Soul`, trace_id: triggerTrace.trace_id, source: 'cron.skill-soul-aging' });
        }).catch(() => {});
      } catch {  }
      scheduleDailyAging();
    }, msUntilMidnight);
  }
  scheduleDailyAging();

  /** def 组件健康巡检（chg-067）：失效 def 由系统发起重建并更新组件关联，重建失败才停用出池 */
  async function sweepDefHealthOnce(trace: Metrics): Promise<void> {
    const out = new SweepDefHealthOutput();
    await runtimeAgentDefAccess.sweepDefHealth(new SweepDefHealthInput(), out, new AgentDefContext(), trace);
    if (out.repaired > 0 || out.disabled > 0) {
      logger.info('[cron] Def health sweep', { detail: `巡检 ${out.scanned} 个 def：修复重建 ${out.repaired} 个，停用 ${out.disabled} 个`, trace_id: trace.trace_id, source: 'cron.defhealth' });
    }
  }
  try {
    await sweepDefHealthOnce(cronTrace('cron.defhealth.startup'));
  } catch (e) {
    logger.warn('[startup] Def health sweep failed', String(e));
  }
  function scheduleDailyDefHealthSweep() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {
      try {
        sweepDefHealthOnce(cronTrace('cron.defhealth.midnight')).catch(() => {});
      } catch {  }
      scheduleDailyDefHealthSweep();
    }, msUntilMidnight);
  }
  scheduleDailyDefHealthSweep();

  return {
    relationDb, llmAccess, mcpAccess, soulAccess, skillAccess, promptsAccess,
    graphDBAccess, mqAccess, logAccess, vectorDBAccess,
    cdtAccess, bookmarkAccess,
    toolAccess,
    httpAccess,
    systemMonitorAccess,
    cronAccess,
    streamAccess,
    observability,
    feedbackAccess,
    infoCore, llmCore, mcpCore, skillCore, soulCore, mqCore,
    cdtCore,
    agentLibrary, agentStrategy, agentContext, agentBuilder,
    agentExecution, writerAgent, evolutorAgent,
    chatAccess, configAccess, selfLearningAccess, userProfileAccess, visualizationAccess,
  };
}
