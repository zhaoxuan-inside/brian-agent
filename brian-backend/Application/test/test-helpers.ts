import { vi } from 'vitest';
import { RelationDBAccess, IdGenerator, DBContext } from '@brian-agent/base';
import { ChatSchemaInitializer } from '../Chat/infrastructure/ChatSchemaInitializer';
import { ConfigSchemaInitializer } from '../Config/infrastructure/ConfigSchemaInitializer';
import { SelfLearningSchemaInitializer } from '../SelfLearning/infrastructure/SelfLearningSchemaInitializer';
import { UserProfileSchemaInitializer } from '../UserProfile/infrastructure/UserProfileSchemaInitializer';
import { VisualizationSchemaInitializer } from '../Visualization/infrastructure/VisualizationSchemaInitializer';

let _seq = 0;

export function resetSeq() { _seq = 0; }

export async function createTestDb(): Promise<RelationDBAccess> {
  const db = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
  await db.initialize();
  return db;
}

export function initChatSchema(db: RelationDBAccess): void {
  new ChatSchemaInitializer(db).init();
}

export function initConfigSchema(db: RelationDBAccess): void {
  new ConfigSchemaInitializer(db).init();
}

export function initSelfLearningSchema(db: RelationDBAccess): void {
  new SelfLearningSchemaInitializer(db).init();
}

export function initUserProfileSchema(db: RelationDBAccess): void {
  new UserProfileSchemaInitializer(db).init();
}

export function initVisualizationSchema(db: RelationDBAccess): void {
  new VisualizationSchemaInitializer(db).init();
}

export async function setupTestMocks() {
  vi.spyOn(IdGenerator, 'generate').mockImplementation(() => `gen-id-${++_seq}`);
  vi.spyOn(IdGenerator, 'now').mockImplementation(() => 1700000000000 + _seq);
}

export function makeAccess(obj: any) {
  return new Proxy(obj, {
    get(t, p) {
      return typeof t[p] === 'function' ? t[p].bind(t) : t[p];
    },
  });
}

// ─── InfoCore mock ───

export function createMockInfoCore(overrides: Record<string, any> = {}) {
  return {
    saveInfo: vi.fn().mockResolvedValue(true),
    context: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.context = []; return true; }),
    lastNInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.list = []; o.total = 0; return true; }),
    pinInfo: vi.fn().mockResolvedValue(true),
    vectorInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.embeddings = []; return true; }),
    tagInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.tags = []; return true; }),
    summaryInfo: vi.fn().mockResolvedValue(true),
    keywordInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.keywords = []; return true; }),
    graphTag: vi.fn().mockResolvedValue(true),
    graphNInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.nodes = []; return true; }),
    similarKInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.list = []; return true; }),
    keywordKInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.list = []; o.total = 0; return true; }),
    relationKInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.list = []; o.total = 0; return true; }),
    graphInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.graph = { nodes: [], edges: [] };
      return true;
    }),
    delInfo: vi.fn().mockResolvedValue(true),
    existVectorInfo: vi.fn().mockResolvedValue(false),
    existTagInfo: vi.fn().mockResolvedValue(false),
    existSummaryInfo: vi.fn().mockResolvedValue(false),
    soInfoConfig: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    updateInfoConfig: vi.fn().mockResolvedValue(true),
    soInfoVectorConfig: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.config = {}; return true; }),
    updateInfoVectorConfig: vi.fn().mockResolvedValue(true),
    soInfoTagConfig: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.config = {}; return true; }),
    updateInfoTagConfig: vi.fn().mockResolvedValue(true),
    soInfoSummaryConfig: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.config = {}; return true; }),
    updateInfoSummaryConfig: vi.fn().mockResolvedValue(true),
    soInfoContextConfig: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.config = {}; return true; }),
    updateInfoContextConfig: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

// ─── WriterAgent mock ───

export function createMockWriterAgent(overrides: Record<string, any> = {}) {
  return {
    getUserProfile: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.user_profile = { language: 'zh-CN', style: 'detailed' };
      return true;
    }),
    saveUserProfile: vi.fn().mockResolvedValue(true),
    write: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.content = 'mock response';
      return true;
    }),
    configWriterAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── EvolutorAgent mock ───

export function createMockEvolutorAgent(overrides: Record<string, any> = {}) {
  return {
    getEvaluation: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.evaluations = [];
      return true;
    }),
    startEvalSchedule: vi.fn().mockResolvedValue(true),
    stopEvalSchedule: vi.fn().mockResolvedValue(true),
    evalWorkAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.evaluation = { overall: 0.8 };
      return true;
    }),
    evalWriterAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.evaluation = { overall: 0.8 };
      return true;
    }),
    configEvolutorAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    getEvolutionReport: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.report = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── OrchestrationEntry mock ───

export function createMockOrchestrationEntry(overrides: Record<string, any> = {}) {
  return {
    receiveWork: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.final_response = 'mock orchestration response';
      return true;
    }),
    receiveWorkAsync: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.work_id = 'mock-work-id';
      return true;
    }),
    getWorkStatus: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.status = 'COMPLETED';
      return true;
    }),
    cancelWork: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.cancelled = true;
      return true;
    }),
    buildWorkContext: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.context = {};
      return true;
    }),
    selectOrchestrationStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.strategy = 'SIMPLE';
      return true;
    }),
    configOrchestrationEntry: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── LLMCore mock ───

export function createMockLLMCore(overrides: Record<string, any> = {}) {
  return {
    matchLLM: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.llm_id = '';
      o.llm_title = '';
      return true;
    }),
    execLLM: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.response = 'mock LLM response';
      o.token_usage = { total_tokens: 100 };
      return true;
    }),
    soLLMConfig: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    updateLLMConfig: vi.fn().mockResolvedValue(true),
    configLLMCore: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

// ─── MCPCore mock ───

export function createMockMCPCore(overrides: Record<string, any> = {}) {
  return {
    matchMCP: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.mcp_ids = [];
      return true;
    }),
    soMCPConfig: vi.fn().mockResolvedValue(true),
    updateMCPConfig: vi.fn().mockResolvedValue(true),
    configMCPCore: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

// ─── SkillCore mock ───

export function createMockSkillCore(overrides: Record<string, any> = {}) {
  return {
    matchSkill: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.skills = [];
      return true;
    }),
    soSkillConfig: vi.fn().mockResolvedValue(true),
    updateSkillConfig: vi.fn().mockResolvedValue(true),
    configSkillCore: vi.fn().mockResolvedValue(true),
    soSkillRule: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.rules = [];
      return true;
    }),
    updateSkillRule: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

// ─── SoulCore mock ───

export function createMockSoulCore(overrides: Record<string, any> = {}) {
  return {
    matchSoul: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.soul_id = '';
      return true;
    }),
    soSoulConfig: vi.fn().mockResolvedValue(true),
    updateSoulConfig: vi.fn().mockResolvedValue(true),
    configSoulCore: vi.fn().mockResolvedValue(true),
    soSoulRule: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.rules = [];
      return true;
    }),
    updateSoulRule: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

// ─── MQCore mock ───

export function createMockMQCore(overrides: Record<string, any> = {}) {
  return {
    startWorker: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.worker_id = 'test-worker';
      return true;
    }),
    stopWorker: vi.fn().mockResolvedValue(true),
    soWorker: vi.fn().mockResolvedValue(true),
    getWorker: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.workers = [];
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── AgentLibrary mock ───

export function createMockAgentLibrary(overrides: Record<string, any> = {}) {
  return {
    getAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agents = [];
      return true;
    }),
    addAgent: vi.fn().mockResolvedValue(true),
    matchAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agent_id = '';
      return true;
    }),
    updateAgent: vi.fn().mockResolvedValue(true),
    recordAgentUsage: vi.fn().mockResolvedValue(true),
    ageAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.aged_count = 0;
      return true;
    }),
    soAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agents = [];
      o.total = 0;
      return true;
    }),
    getAgentRule: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.rules = [];
      return true;
    }),
    updateAgentRule: vi.fn().mockResolvedValue(true),
    configAgentLibrary: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── AgentBuilder mock ───

export function createMockAgentBuilder(overrides: Record<string, any> = {}) {
  return {
    buildAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agent_id = 'mock-agent';
      return true;
    }),
    buildPlannerAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agent_id = 'mock-planner';
      return true;
    }),
    buildWriterAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agent_id = 'mock-writer';
      return true;
    }),
    buildEvolutorAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agent_id = 'mock-evolutor';
      return true;
    }),
    optimizeAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agent_id = 'mock-agent';
      return true;
    }),
    configAgentBuilder: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    buildAgentContext: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.context_id = 'mock-context-id';
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── AgentExecution mock ───

export function createMockAgentExecution(overrides: Record<string, any> = {}) {
  return {
    execAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.result = 'mock exec result';
      return true;
    }),
    execAgentAsync: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.execution_id = 'mock-exec-id';
      return true;
    }),
    getTrace: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.trace = { iterations: [] };
      return true;
    }),
    getExecContext: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.exec_context = {};
      return true;
    }),
    configAgentExecution: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── AgentStrategy mock ───

export function createMockAgentStrategy(overrides: Record<string, any> = {}) {
  return {
    addStrategy: vi.fn().mockResolvedValue(true),
    getStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.strategies = [];
      return true;
    }),
    soStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.strategies = [];
      o.total = 0;
      return true;
    }),
    updateStrategy: vi.fn().mockResolvedValue(true),
    configAgentStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── AgentContext mock ───

export function createMockAgentContext(overrides: Record<string, any> = {}) {
  return {
    buildAgentContext: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.context_id = 'mock-context-id';
      return true;
    }),
    getContextByTrace: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.context = {};
      return true;
    }),
    getContextDetail: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.context = {};
      return true;
    }),
    configAgentContext: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── PlannerAgent mock ───

export function createMockPlannerAgent(overrides: Record<string, any> = {}) {
  return {
    plan: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.plan_id = 'mock-plan-id';
      o.dag = { nodes: [], edges: [] };
      return true;
    }),
    replan: vi.fn().mockResolvedValue(true),
    getPlan: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.plan = {};
      return true;
    }),
    configPlannerAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── OrchestrationStrategy mock ───

export function createMockOrchestrationStrategy(overrides: Record<string, any> = {}) {
  return {
    startOrchestration: vi.fn().mockResolvedValue(true),
    executeSimpleStrategy: vi.fn().mockResolvedValue(true),
    executePlanningStrategy: vi.fn().mockResolvedValue(true),
    executePostProcessing: vi.fn().mockResolvedValue(true),
    addStrategy: vi.fn().mockResolvedValue(true),
    getStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.strategies = [];
      return true;
    }),
    soStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.strategies = [];
      o.total = 0;
      return true;
    }),
    updateStrategy: vi.fn().mockResolvedValue(true),
    configOrchestrationStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── OrchestrationExecution mock ───

export function createMockOrchestrationExecution(overrides: Record<string, any> = {}) {
  return {
    buildAgentDAG: vi.fn().mockResolvedValue(true),
    execSingleAgent: vi.fn().mockResolvedValue(true),
    execDAG: vi.fn().mockResolvedValue(true),
    execDAGAsync: vi.fn().mockResolvedValue(true),
    getDAGProgress: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.progress = {};
      return true;
    }),
    cancelExecution: vi.fn().mockResolvedValue(true),
    getExecQueueStatus: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.status = {};
      return true;
    }),
    configOrchestrationExecution: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.config = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── OrchestrationVisualization mock ───

export function createMockOrchestrationVisualization(overrides: Record<string, any> = {}) {
  return {
    visualizeAgentDAG: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.dag = { nodes: [], edges: [] };
      return true;
    }),
    visualizeWorkFlow: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.timeline = { phases: [] };
      return true;
    }),
    getAgentNodeDetail: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.detail = {};
      return true;
    }),
    ...overrides,
  } as any;
}

// ─── JSONNode mock ───

export function createMockJSONNode(overrides: Record<string, any> = {}) {
  return {
    addNode: vi.fn().mockResolvedValue(true),
    getNode: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.node = {};
      return true;
    }),
    configJSONNode: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

// ─── Base Provider mocks ───

export function createMockLLMProvider(overrides: Record<string, any> = {}) {
  return {
    execLLM: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.response = 'mock LLM response';
      o.token_usage = { total_tokens: 100 };
      return true;
    }),
    execLLMStream: vi.fn().mockResolvedValue(true),
    addLLMProvider: vi.fn().mockResolvedValue(true),
    updateLLMProvider: vi.fn().mockResolvedValue(true),
    delLLMProvider: vi.fn().mockResolvedValue(true),
    deleteLLMProvider: vi.fn().mockResolvedValue(true),
    soLLMProvider: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.providers = [];
      return true;
    }),
    searchLLMProvider: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.providers = [];
      return true;
    }),
    testLLMProvider: vi.fn().mockResolvedValue(true),
    listLLM: vi.fn().mockResolvedValue(true),
    refreshModelList: vi.fn().mockResolvedValue(true),
    addLLM: vi.fn().mockResolvedValue(true),
    enableLLM: vi.fn().mockResolvedValue(true),
    updateLLM: vi.fn().mockResolvedValue(true),
    delLLM: vi.fn().mockResolvedValue(true),
    deleteLLM: vi.fn().mockResolvedValue(true),
    soLLM: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.models = [];
      return true;
    }),
    searchLLM: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.models = [];
      return true;
    }),
    getLLM: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.llm = {};
      return true;
    }),
    setLLMQuota: vi.fn().mockResolvedValue(true),
    checkLLMQuota: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.remaining = 1000;
      return true;
    }),
    ...overrides,
  } as any;
}

export function createMockSoulProvider(overrides: Record<string, any> = {}) {
  return {
    addSoul: vi.fn().mockResolvedValue(true),
    updateSoul: vi.fn().mockResolvedValue(true),
    delSoul: vi.fn().mockResolvedValue(true),
    deleteSoul: vi.fn().mockResolvedValue(true),
    soSoul: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.souls = [];
      return true;
    }),
    searchSoul: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.souls = [];
      return true;
    }),
    getSoul: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.soul = {};
      return true;
    }),
    getSoulRule: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.rules = [];
      return true;
    }),
    updateSoulRule: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

export function createMockSkillProvider(overrides: Record<string, any> = {}) {
  return {
    addSkill: vi.fn().mockResolvedValue(true),
    updateSkill: vi.fn().mockResolvedValue(true),
    delSkill: vi.fn().mockResolvedValue(true),
    deleteSkill: vi.fn().mockResolvedValue(true),
    soSkill: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.skills = [];
      return true;
    }),
    searchSkill: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.skills = [];
      return true;
    }),
    getSkill: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.skill = {};
      return true;
    }),
    getSkillRule: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.rules = [];
      return true;
    }),
    updateSkillRule: vi.fn().mockResolvedValue(true),
    execSkill: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

export function createMockMCPProvider(overrides: Record<string, any> = {}) {
  return {
    addMcpProvider: vi.fn().mockResolvedValue(true),
    addMCPProvider: vi.fn().mockResolvedValue(true),
    updateMcpProvider: vi.fn().mockResolvedValue(true),
    updateMCPProvider: vi.fn().mockResolvedValue(true),
    delMcpProvider: vi.fn().mockResolvedValue(true),
    deleteMCPProvider: vi.fn().mockResolvedValue(true),
    soMcpProvider: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.providers = [];
      return true;
    }),
    searchMCPProvider: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.providers = [];
      return true;
    }),
    testMcpProvider: vi.fn().mockResolvedValue(true),
    testMCPProvider: vi.fn().mockResolvedValue(true),
    listMcp: vi.fn().mockResolvedValue(true),
    installMcp: vi.fn().mockResolvedValue(true),
    installMCP: vi.fn().mockResolvedValue(true),
    startMcp: vi.fn().mockResolvedValue(true),
    startMCP: vi.fn().mockResolvedValue(true),
    stopMcp: vi.fn().mockResolvedValue(true),
    stopMCP: vi.fn().mockResolvedValue(true),
    uninstallMcp: vi.fn().mockResolvedValue(true),
    uninstallMCP: vi.fn().mockResolvedValue(true),
    updateMcp: vi.fn().mockResolvedValue(true),
    updateMCP: vi.fn().mockResolvedValue(true),
    getMcp: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.mcp = {};
      return true;
    }),
    getMCP: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.mcp = {};
      return true;
    }),
    soMcp: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.mcps = [];
      return true;
    }),
    searchMCP: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.mcps = [];
      return true;
    }),
    execMCP: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

export function createMockPromptsProvider(overrides: Record<string, any> = {}) {
  return {
    addPrompt: vi.fn().mockResolvedValue(true),
    updatePrompt: vi.fn().mockResolvedValue(true),
    delPrompt: vi.fn().mockResolvedValue(true),
    deletePrompt: vi.fn().mockResolvedValue(true),
    soPrompt: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.prompts = [];
      return true;
    }),
    searchPrompt: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.prompts = [];
      return true;
    }),
    getPrompt: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.prompt = {};
      return true;
    }),
    execPrompt: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.rendered = 'mock rendered prompt';
      return true;
    }),
    ...overrides,
  } as any;
}

export function createMockGraphDBProvider(overrides: Record<string, any> = {}) {
  return {
    addGraphNode: vi.fn().mockResolvedValue(true),
    addGraphEdge: vi.fn().mockResolvedValue(true),
    getGraphNode: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.nodes = [];
      return true;
    }),
    getGraphEdge: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.edges = [];
      return true;
    }),
    searchGraphNode: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.nodes = [];
      return true;
    }),
    searchGraphEdge: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.edges = [];
      return true;
    }),
    activateGraphEdge: vi.fn().mockResolvedValue(true),
    ageGraphEdge: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.aged_count = 0;
      return true;
    }),
    ...overrides,
  } as any;
}

export function createMockMQProvider(overrides: Record<string, any> = {}) {
  return {
    sendMQ: vi.fn().mockResolvedValue(true),
    consume: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.messages = [];
      return true;
    }),
    ack: vi.fn().mockResolvedValue(true),
    nack: vi.fn().mockResolvedValue(true),
    getQueueStats: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.stats = {};
      return true;
    }),
    enableMQ: vi.fn().mockResolvedValue(true),
    closeMQ: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

export function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
