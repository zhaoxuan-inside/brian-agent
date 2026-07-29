import express from 'express';
import { createServer } from './infrastructure/server';
import { logger } from './infrastructure/logger';
import { getConfig } from './infrastructure/config';
import { getDatabase } from './infrastructure/database';

import { SQLiteWrapper as SQLiteDB } from './base/DBWrapper';
import type { DBWrapper } from './base/DBWrapper';
import { SQLiteVectorDB } from './base/db/SQLiteVectorDB';
import { SQLiteGraphDB } from './base/db/SQLiteGraphDB';
import { VectorDBProvider } from './base/VectorDBProvider';
import { SQLiteMQ } from './base/MQWrapper';

import { LLMService } from './core/llm/LLMService';
import { LLMCore } from './core/llm/LLMCore';
import { LLMService as CoreLLMService } from './core/llm';
import { ModelConfigService as CoreModelConfigService } from './core/llm/modelConfig';
import { MCPManager } from './core/mcp/MCPManager';
import { MCPCore } from './core/mcp/MCPCore';
import { SkillManager } from './core/skill/SkillManager';
import { SkillCore } from './core/skill/SkillCore';
import { SoulManager } from './core/soul/SoulManager';
import { SoulCore } from './core/soul/SoulCore';
import { MQCore, type MQOperations } from './core/mq/MQCore';
import { WorkManager } from './core/work/WorkManager';
import { InformationService } from './core/information/InformationService';
import { InformationService as CoreInformationService } from './core/information';
import { LibraryService } from './core/library/LibraryService';
import { ModelConfigService } from './core/modelConfig/ModelConfigService';
import { StorageService } from './core/storage';
import { LearningService } from './core/learning';

import { AgentOrchestrator } from './strategy/AgentOrchestrator';

import { ToolService } from './core/tools';
import { AgentBuilder } from './agent/agentBuilder';
import { MetaAgent } from './agent/metaAgent';
import { GraphExecutor } from './agent/executor';
import { AgentLibrary } from './agent/agentLibrary';
import { WriterAgent } from './agent/writer';
import { EvolutorAgent } from './agent/evoluator';

import { createAgentLibraryService } from './agent/AgentLibrary';
import { setDatabase as setAgentLibraryDb } from './agent/AgentLibrary/db';
import { createAgentStrategyService } from './agent/AgentStrategy';
import { createAgentBuilderService } from './agent/AgentBuilder';
import { createAgentExecutionService } from './agent/AgentExecution';
import { createPlannerAgentService } from './agent/PlannerAgent';
import { createWriterAgentService } from './agent/WriterAgent';
import { createEvolutorAgentService } from './agent/EvolutorAgent';

import { StrategyConfigService } from './strategy/StrategyConfigService';

import { ChatService } from './application/ChatService';
import { ChatDagService } from './application/ChatDagService';
import { AgentOrchestrationService } from './application/AgentOrchestrationService';
import { SystemAgentService } from './application/SystemAgentService';
import { UserProfileService } from './application/UserProfileService';
import { SelfLearningService } from './application/SelfLearningService';
import { DocumentService } from './application/DocumentService';

import {
  createChatRoutes,
  createGatewayRoutes,
  createConfigRoutes,
  createAnalyticsRoutes,
  createVisualRoutes,
  createFeedbackRoutes,
  createMemoryRoutes,
  createLearningRoutes,
  createProfileRoutes,
  createMCPRoutes,
  createSkillRoutes,
  createAgentRoutes,
  createSystemRoutes,
  createLibraryRoutes,
} from './access';

export function createApp(): express.Application {
  logger.info('SYSTEM', 'Initializing Brian-Agent application v3.0...');

  const app = createServer();
  const config = getConfig();

  // ============================================================
  // Base Layer: DB & MQ
  // ============================================================
  const rawDb = getDatabase();
  const sqliteDB: DBWrapper = {
    query: async <T>(sql: string, params?: any[]): Promise<T[]> => {
      const stmt = rawDb.prepare(sql);
      return (params ? stmt.all(...params) : stmt.all()) as T[];
    },
    run: async (sql: string, params?: any[]): Promise<{ changes: number; lastInsertId: number }> => {
      const stmt = rawDb.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return { changes: result.changes, lastInsertId: (result.lastInsertRowid as number) || 0 };
    },
    get: async <T>(sql: string, params?: any[]): Promise<T | undefined> => {
      const stmt = rawDb.prepare(sql);
      return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
    },
    close: () => { /* 共享连接，不在此关闭 */ },
    transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      return rawDb.transaction(() => {
        const tx = {
          query: async (sql: string, params?: any[]) => rawDb.prepare(sql).all(...(params || [])),
          run: async (sql: string, params?: any[]) => rawDb.prepare(sql).run(...(params || [])),
          get: async (sql: string, params?: any[]) => rawDb.prepare(sql).get(...(params || [])),
        };
        return fn(tx);
      })();
    },
  };
  const vectorDB = new SQLiteVectorDB(sqliteDB);
  const vectorDBProvider = new VectorDBProvider(sqliteDB);
  const graphDB = new SQLiteGraphDB(sqliteDB);
  const mq = new SQLiteMQ(sqliteDB);

  logger.info('SYSTEM', 'Base layer initialized');

  // ============================================================
  // Core Layer
  // ============================================================
  const modelConfigService = new ModelConfigService(sqliteDB);
  const llmService = new LLMService(modelConfigService, sqliteDB);
  const mcpManager = new MCPManager(sqliteDB);
  const skillManager = new SkillManager(sqliteDB);
  const soulManager = new SoulManager(sqliteDB);
  const workManager = new WorkManager(sqliteDB);
  const informationService = new InformationService(sqliteDB, llmService);
  const libraryService = new LibraryService(sqliteDB);
  const storageService = new StorageService();
  const coreModelConfigService = new CoreModelConfigService();
  llmService.setFallbackConfigProvider(coreModelConfigService);
  const coreLlmService = new CoreLLMService(coreModelConfigService);
  const coreInformationService = new CoreInformationService(storageService, coreLlmService);
  const learningServiceCore = new LearningService(coreInformationService, coreLlmService, storageService);

  const mqOperations: MQOperations = {
    sendMQ: async (queue, payload, priority) => {
      let payloadObj: Record<string, any>;
      try { payloadObj = JSON.parse(payload); } catch { payloadObj = { data: payload }; }
      return mq.enqueue({ queue, payload: payloadObj, priority: priority ?? 5, maxRetries: 3 });
    },
    consumeMQ: async (queue) => {
      const msg = await mq.dequeue(queue);
      if (!msg) return null;
      const payloadStr = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload);
      return { msg_id: msg.id, payload: payloadStr, priority: msg.priority ?? 5 };
    },
    ackMQ: async (msg_id) => { await mq.ack(msg_id); },
    nackMQ: async (msg_id) => { await mq.nack(msg_id); },
    getQueueStats: async (queue) => {
      const stats = await mq.getQueueStats(queue || '');
      return [{ queue: queue || '', ...stats }];
    },
  };
  const mqCore = new MQCore(mqOperations);
  const llmCore = new LLMCore(sqliteDB, llmService);
  const mcpCore = new MCPCore(sqliteDB, llmService, mcpManager);
  const skillCore = new SkillCore(sqliteDB, llmService, skillManager);
  const soulCore = new SoulCore(sqliteDB, llmService, soulManager);
  learningServiceCore.schedule(300000);

  logger.info('SYSTEM', 'Core layer initialized');

  // ============================================================
  // Strategy Layer
  // ============================================================
  const orchestrator = new AgentOrchestrator(llmService);

  logger.info('SYSTEM', 'Strategy layer initialized');

  // ============================================================
  // Agent Layer (PRD modules)
  // ============================================================
  setAgentLibraryDb(rawDb);

  const agentLibraryService = createAgentLibraryService();
  const agentStrategyService = createAgentStrategyService(rawDb);
  const agentBuilderService = createAgentBuilderService(rawDb, agentLibraryService, agentStrategyService, llmService);
  const agentExecutionService = createAgentExecutionService(rawDb, llmService, skillManager, mcpManager, mqCore);
  const plannerAgentService = createPlannerAgentService(rawDb, llmService);
  const writerAgentService = createWriterAgentService(rawDb, llmService);
  const evolutorAgentService = createEvolutorAgentService(rawDb, llmService);

  // Legacy agent subsystem (kept for backward compatibility with access layer routes)
  const toolService = new ToolService();
  const agentLibrary = new AgentLibrary(storageService);
  const legacyAgentBuilder = new AgentBuilder(storageService, coreLlmService);
  const metaAgent = new MetaAgent(coreLlmService, coreInformationService, toolService, agentLibrary, skillManager);
  const graphExecutor = new GraphExecutor(coreLlmService, toolService);
  const writerAgentLegacy = new WriterAgent(coreLlmService);
  const evolutorAgentLegacy = new EvolutorAgent(coreLlmService);

  logger.info('SYSTEM', 'Agent layer initialized');

  // ============================================================
  // Application Layer
  // ============================================================
  const userProfileService = new UserProfileService(sqliteDB);
  const learningService = new SelfLearningService(informationService, llmService, modelConfigService);
  const documentService = new DocumentService(informationService);

  const chatDagService = new ChatDagService(informationService, llmService, modelConfigService);
  const systemAgentService = new SystemAgentService(legacyAgentBuilder as any);

  systemAgentService.ensureSystemAgents().then(({ planner, evaluator }) => {
    logger.info('SYSTEM', `[app] system agents ready: planner=${planner.id} evaluator=${evaluator.id}`);
  }).catch((e: any) => {
    logger.warn('SYSTEM', `[app] system agents init failed: ${(e as Error).message}`);
  });

  const agentOrchestrationService = new AgentOrchestrationService(
    informationService, llmService, modelConfigService, legacyAgentBuilder as any, agentLibrary as any, metaAgent as any, graphExecutor as any
  );

  const strategyConfigService = new StrategyConfigService(sqliteDB);
  setImmediate(() => {
    strategyConfigService.ensureBuiltinStrategies().catch(e =>
      logger.warn('SYSTEM', `[app] builtin strategies seed failed: ${(e as Error).message}`)
    );
  });

  const chatService = new ChatService(informationService, llmService, orchestrator, userProfileService, modelConfigService, chatDagService, agentOrchestrationService, learningService);

  setImmediate(() => {
    chatDagService.backfillSummaries().catch(e =>
      logger.warn('SYSTEM', `[app] summary backfill failed: ${(e as Error).message}`)
    );
  });

  logger.info('SYSTEM', 'Application layer initialized');

  // ============================================================
  // Access Layer: Routes
  // ============================================================
  app.use('/api/chat', createChatRoutes(chatService));
  app.use('/api/gateway', createGatewayRoutes(chatService, informationService));
  app.use('/api/config', createConfigRoutes(
    llmService, mcpManager, soulManager, workManager, modelConfigService
  ));
  app.use('/api/analytics', createAnalyticsRoutes(llmService, informationService, sqliteDB));
  app.use('/api/visual', createVisualRoutes(informationService, orchestrator));
  app.use('/api/feedback', createFeedbackRoutes(sqliteDB));
  app.use('/api/memory', createMemoryRoutes(informationService));
  app.use('/api/learning', createLearningRoutes(learningService, documentService, learningServiceCore));
  app.use('/api/profile', createProfileRoutes(userProfileService));
  app.use('/api/mcp', createMCPRoutes(toolService, mcpManager));
  app.use('/api/skill', createSkillRoutes(skillManager));
  app.use('/api/agent', createAgentRoutes(legacyAgentBuilder as any, metaAgent as any));
  app.use('/api/system', createSystemRoutes(coreLlmService));
  app.use('/api/library', createLibraryRoutes(sqliteDB));

  logger.info('SYSTEM', 'Access layer initialized');

  // ============================================================
  // Health check
  // ============================================================
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      uptime: process.uptime(),
    });
  });

  logger.info('SYSTEM', 'Application initialized successfully');
  return app;
}
