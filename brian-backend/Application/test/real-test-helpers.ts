import { vi } from 'vitest';
import {
  RelationDBAccess, IdGenerator,
  LLMAccess, MCPAccess, SoulAccess, SkillAccess, PromptsAccess,
  GraphDBAccess, MQAccess, LogAccess,
  type Logger,
} from '@brian-agent/base';
import {
  InfoCoreAccess, LLMCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess, MQCoreAccess,
} from '@brian-agent/core';
import {
  AgentLibraryAccess, AgentStrategyAccess, AgentBuilderAccess, AgentExecutionAccess,
  AgentContextAccess, PlannerAgentAccess, WriterAgentAccess, EvolutorAgentAccess,
} from '@brian-agent/agent';
import {
  OrchestrationEntryAccess, OrchestrationStrategyAccess, OrchestrationExecutionAccess,
  OrchestrationVisualizationAccess, JSONNodeAccess,
} from '@brian-agent/orchestration';
import * as fs from 'fs';
import * as path from 'path';

let _seq = 0;
export function resetSeq() { _seq = 0; }

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join('/tmp/opencode', 'brian-real-test-'));
  tempDirs.push(dir);
  return dir;
}

export function cleanupTempDirs() {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tempDirs.length = 0;
}

export function createMockLogger(): Logger {
  return {
    debug: () => {},
    error: () => {},
  };
}

function addColumnIfNotExists(relationDb: RelationDBAccess, table: string, column: string, type: string): void {
  try {
    relationDb.executeRaw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
  } catch {
    // Column already exists - ignore
  }
}

function mockExternalLLMMethods(llmAccess: LLMAccess) {
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

function mockExternalMCPMethods(mcpAccess: MCPAccess) {
  vi.spyOn(mcpAccess as any, 'testMcpProvider' as any).mockImplementation(async () => true);
  vi.spyOn(mcpAccess as any, 'listMcp' as any).mockImplementation(async () => true);
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
  const store = new Map<string, { id: string; content: string; embedding: number[]; user_id?: string; metadata?: string; created: number; updated: number }>();

  return {
    addVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      const ids: string[] = [];
      for (const v of _i.vectors || []) {
        const id = v.id || `vec-${++_seq}`;
        store.set(id, {
          id,
          content: v.content || '',
          embedding: v.embedding || [],
          user_id: v.user_id,
          metadata: typeof v.metadata === 'string' ? v.metadata : JSON.stringify(v.metadata || {}),
          created: Date.now(),
          updated: Date.now(),
        });
        ids.push(id);
      }
      o.ids = ids;
      return true;
    }),
    delVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      let count = 0;
      for (const id of _i.ids || []) {
        if (store.delete(id)) count++;
      }
      o.deleted = count;
      return true;
    }),
    delVectorByFilter: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.deleted = 0;
      return true;
    }),
    soVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.vectors = [];
      return true;
    }),
    getVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      const v = store.get(_i.id);
      o.vector = v || null;
      return true;
    }),
    countVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.count = store.size;
      return true;
    }),
    visualizedVector: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.data = [];
      return true;
    }),
    enableVectorDB: vi.fn().mockResolvedValue(true),
    closeVectorDB: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    getStore: () => store,
  };
}

export interface RealTestContext {
  db: RelationDBAccess;
  logger: Logger;
  tempDir: string;
  relationDb: RelationDBAccess;
  llmAccess: LLMAccess;
  mcpAccess: MCPAccess;
  soulAccess: SoulAccess;
  skillAccess: SkillAccess;
  promptsAccess: PromptsAccess;
  graphDBAccess: GraphDBAccess;
  mqAccess: MQAccess;
  logAccess: LogAccess;
  vectorDbAccess: ReturnType<typeof createInMemoryVectorDBAccess>;
  infoCore: InfoCoreAccess;
  llmCore: LLMCoreAccess;
  mcpCore: MCPCoreAccess;
  skillCore: SkillCoreAccess;
  soulCore: SoulCoreAccess;
  mqCore: MQCoreAccess;
  agentLibrary: AgentLibraryAccess;
  agentStrategy: AgentStrategyAccess;
  agentContext: AgentContextAccess;
  agentBuilder: AgentBuilderAccess;
  agentExecution: AgentExecutionAccess;
  plannerAgent: PlannerAgentAccess;
  writerAgent: WriterAgentAccess;
  evolutorAgent: EvolutorAgentAccess;
  orchestrationExecution: OrchestrationExecutionAccess;
  orchestrationVisualization: OrchestrationVisualizationAccess;
  jsonNode: JSONNodeAccess;
  orchestrationStrategy: OrchestrationStrategyAccess;
  orchestrationEntry: OrchestrationEntryAccess;
}

export async function setupRealTestEnvironment(): Promise<RealTestContext> {
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

  // Handle table name conflict: Base/SkillProvider and Core/SkillCoreProvider both use
  // 'skill_usage' table with different schemas. Add Core-layer columns to avoid conflict.
  addColumnIfNotExists(relationDb, 'skill_usage', 'agent_skill_id', 'TEXT');
  addColumnIfNotExists(relationDb, 'skill_usage', 'timestamp', 'INTEGER');
  // Similarly handle potential soul table conflicts
  addColumnIfNotExists(relationDb, 'soul_usage', 'soul_usage_type', 'TEXT');

  // Use in-memory VectorDB for test isolation
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

  return {
    db: relationDb,
    logger,
    tempDir,
    relationDb,
    llmAccess,
    mcpAccess,
    soulAccess,
    skillAccess,
    promptsAccess,
    graphDBAccess,
    mqAccess,
    logAccess,
    vectorDbAccess,
    infoCore,
    llmCore,
    mcpCore,
    skillCore,
    soulCore,
    mqCore,
    agentLibrary,
    agentStrategy,
    agentContext,
    agentBuilder,
    agentExecution,
    plannerAgent,
    writerAgent,
    evolutorAgent,
    orchestrationExecution,
    orchestrationVisualization,
    jsonNode,
    orchestrationStrategy,
    orchestrationEntry,
  };
}
