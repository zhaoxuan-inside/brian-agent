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
import { StreamAccess, StreamContext, PushEventToEndpointInput, PushEventToEndpointOutput } from '../Base/StreamProvider';
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
import { IdGenerator, ToolAccess, HttpAccess, SystemMonitorAccess, ToolSchemaInitializer, ConfigService, TOOL_CONFIG_TABLE, InfoType, Operator, Metrics, MetricsLogger } from '@brian-agent/base';
import { SessionAccess, SkillRuntimeAccess, RegisterBuiltinSkillsInput, RegisterBuiltinSkillsOutput, LoopAccess, AgentDefAccess, RunGatewayAccess } from '@brian-agent/runtime';
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

function addColIfMissing(relationDb: import('../Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess, table: string, column: string, type: string): void {

  try { relationDb.executeRaw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`); } catch {  }
}

function readVectorDimension(relationDb: import('../Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess): number {
  try {
    const rows = relationDb.queryRaw<{ dimension: number }>(
      'SELECT "dimension" FROM "info_vector_config" LIMIT 1', [],
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

  try {
    relationDb.executeRaw('DROP TABLE IF EXISTS "agent_plan"');
    relationDb.executeRaw('DROP TABLE IF EXISTS "planner_agent_config"');
  } catch (e) {
    logger.warn('dropLegacyTables', 'failed to drop retired planner tables', String(e));
  }

  const promptsAccess = new PromptsAccess(relationDb, logger);
  await promptsAccess.initialize();

  const llmAccess = new LLMAccess(relationDb, logger, promptsAccess);
  await llmAccess.initialize();

  const mcpAccess = new MCPAccess(relationDb, logger);

  try {
    const synced = await mcpAccess.syncInstallStatus();
    if (synced > 0) logger.info('[startup] MCP sync', `清理了 ${synced} 条已卸载的 npm 安装记录`);
  } catch {  }

  try {
    await mcpAccess.stopAllMcp();
  } catch {  }

  const soulAccess = new SoulAccess(relationDb, logger);
  await soulAccess.initialize();

  const skillAccess = new SkillAccess(relationDb, logger);
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
        `SELECT "id", "skill_ids_json" FROM "agent"`,
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
            `UPDATE "agent" SET "skill_ids_json" = ?, "updated" = ? WHERE "id" = ?`,
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

  addColIfMissing(relationDb, 'skill_usage', 'agent_skill_id', 'TEXT');
  addColIfMissing(relationDb, 'skill_usage', 'timestamp', 'INTEGER');
  addColIfMissing(relationDb, 'soul_usage', 'soul_usage_type', 'TEXT');

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

  Report.setEventStreamGateway({
    pushToEndpoint: async (input) => {
      await streamAccess.publishEvent(
        Object.assign(new PushEventToEndpointInput(), input),
        new PushEventToEndpointOutput(),
        new StreamContext(),
      );
    },
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

  const INFO_RAW_TABLE = 'info_raw';
  const permissionAuditMap = new Map<string, string>();
  const permissionAuditBridge: import('@brian-agent/runtime').PermissionAudit = {
    asked: async (input) => {
      try {
        const infoId = IdGenerator.generate();
        const payload = {
          permission_id: input.permission_id,
          session_key: input.session_key,
          run_id: input.run_id,
          tool_id: input.tool_id,
          input: safeJsonParse(input.arguments_json),
          status: 'pending',
          asked_at: input.asked_at,
        };
        await relationDb.insert(INFO_RAW_TABLE, [
          { field: 'id', value: infoId },
          { field: 'created', value: input.asked_at },
          { field: 'updated', value: input.asked_at },

        { field: 'session_id', value: input.session_key || input.session_id },
          { field: 'work_id', value: '' },
          { field: 'run_id', value: '' },
          { field: 'info_id', value: infoId },
          { field: 'info_creator_id', value: '' },
          { field: 'info_creator_role', value: 'SYSTEM' },
          { field: 'info', value: JSON.stringify(payload) },
          { field: 'info_length', value: JSON.stringify(payload).length },
          { field: 'pin', value: 0 },
          { field: 'info_type', value: InfoType.PERMISSION },
          { field: 'trace_id', value: '' },
          { field: 'handle_result_type', value: 'correct' },
        ]);
        permissionAuditMap.set(input.permission_id, infoId);
      } catch (err) {
        logger.info('[permission-audit] asked 落库失败（不影响 run）', rawText(err));
      }
    },
    answered: async (input) => {
      try {
        const infoId = permissionAuditMap.get(input.permission_id);
        if (!infoId) return;
        const row = relationDb.queryRaw<{ info: string; created: number; session_id: string }>(
          `SELECT info, created, session_id FROM info_raw WHERE id = ? LIMIT 1`,
          [infoId],
        )[0];
        if (row) {
          const payload = JSON.parse(String(row.info ?? '{}'));
          payload.status = input.approved ? 'allowed' : 'denied';
          payload.answered_at = input.answered_at;
          await relationDb.update(INFO_RAW_TABLE, [
            { field: 'info', value: JSON.stringify(payload) },
            { field: 'info_length', value: JSON.stringify(payload).length },
            { field: 'updated', value: input.answered_at },
          ], [{ field: 'id', operator: Operator.EQ, value: infoId }]);
        }
        permissionAuditMap.delete(input.permission_id);
      } catch (err) {
        logger.info('[permission-audit] answered 更新失败（不影响 run）', rawText(err));
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
      'SELECT "tag_aging_cron", "orphan_tag_check_cron" FROM "self_learning_config" LIMIT 1', [],
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
      'SELECT "id" FROM "config_snapshot" WHERE "name" = ? LIMIT 1', ['默认快照'],
    );
    if (existingDefault.length === 0) {
      const configTables = relationDb.queryRaw<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%_config' OR name='config_registry' OR name LIKE '%_privilege' OR name='config_config' OR name='orchestration_strategy' OR name='prompt_template')",
        [],
      );
      const snapshotData: Record<string, unknown[]> = {};
      for (const row of configTables || []) {
        try { snapshotData[row.name] = relationDb.queryRaw<Record<string, unknown>>(`SELECT * FROM "${row.name}"`, []) || []; } catch {  }
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

  return {
    relationDb, llmAccess, mcpAccess, soulAccess, skillAccess, promptsAccess,
    graphDBAccess, mqAccess, logAccess, vectorDBAccess,
    cdtAccess, bookmarkAccess,
    toolAccess,
    httpAccess,
    systemMonitorAccess,
    cronAccess,
    streamAccess,
    feedbackAccess,
    infoCore, llmCore, mcpCore, skillCore, soulCore, mqCore,
    cdtCore,
    agentLibrary, agentStrategy, agentContext, agentBuilder,
    agentExecution, writerAgent, evolutorAgent,
    chatAccess, configAccess, selfLearningAccess, userProfileAccess, visualizationAccess,
  };
}
