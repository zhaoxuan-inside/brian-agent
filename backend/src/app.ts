import express from 'express';
import { createServer } from './infrastructure/server';
import { logger } from './infrastructure/logger';
import { getConfig } from './infrastructure/config';
import { getDatabase } from './infrastructure/database';

import { SQLiteWrapper as SQLiteDB } from './base/DBWrapper';
import type { DBWrapper } from './base/DBWrapper';
import { SQLiteVectorDB } from './base/db/SQLiteVectorDB';
import { SQLiteGraphDB } from './base/db/SQLiteGraphDB';
import { SQLiteMQ } from './base/MQWrapper';

import { LLMService } from './core/llm/LLMService';
import { LLMService as CoreLLMService } from './core/llm';
import { ModelConfigService as CoreModelConfigService } from './core/llm/modelConfig';
import { MCPManager } from './core/mcp/MCPManager';
import { SkillManager } from './core/skill/SkillManager';
import { SoulManager } from './core/soul/SoulManager';
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

import { ChatService } from './application/ChatService';
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
  // Base Layer: DB & MQ — 使用 initDatabase() 已创建的共享连接
  // ============================================================
  const rawDb = getDatabase();
  // 适配器：将 better-sqlite3 的 Database 包装为 DBWrapper 接口
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
  // Initialize LLM service with fallback to global model config
  llmService.setFallbackConfigProvider(coreModelConfigService);
  const coreLlmService = new CoreLLMService(coreModelConfigService);
  const coreInformationService = new CoreInformationService(storageService, coreLlmService);
  const learningServiceCore = new LearningService(coreInformationService, coreLlmService, storageService);

  logger.info('SYSTEM', 'Core layer initialized');

  // ============================================================
  // Strategy Layer
  // ============================================================
  const orchestrator = new AgentOrchestrator(llmService);

  logger.info('SYSTEM', 'Strategy layer initialized');

  // ============================================================
  // Application Layer
  // ============================================================
  const userProfileService = new UserProfileService(sqliteDB);
  const learningService = new SelfLearningService(informationService, llmService);
  const documentService = new DocumentService(informationService);

  // Additional services for agent/mcp/skill/agent routes
  const toolService = new ToolService();
  const agentLibrary = new AgentLibrary(storageService);
  const agentBuilder = new AgentBuilder(storageService, coreLlmService);
  const metaAgent = new MetaAgent(coreLlmService, coreInformationService, toolService, agentLibrary, skillManager);
  const graphExecutor = new GraphExecutor(coreLlmService, toolService);

  const chatService = new ChatService(informationService, llmService, orchestrator, userProfileService, metaAgent, graphExecutor, modelConfigService);

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
  app.use('/api/agent', createAgentRoutes(agentBuilder, metaAgent));
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