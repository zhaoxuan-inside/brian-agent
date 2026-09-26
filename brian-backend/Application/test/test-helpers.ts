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

export function initSelfLearningSchema(db: RelationDBAccess): void {
  new SelfLearningSchemaInitializer(db).init();
}

export function initVisualizationSchema(db: RelationDBAccess): void {
  new VisualizationSchemaInitializer(db).init();
}

export function makeAccess(obj: any) {
  return new Proxy(obj, {
    get(t, p) {
      return typeof t[p] === 'function' ? t[p].bind(t) : t[p];
    },
  });
}

export function createMockInfoCore(overrides: Record<string, any> = {}) {
  return {
    saveInfo: vi.fn().mockResolvedValue(true),
    context: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.context = []; return true; }),
    lastNInfo: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.list = []; o.total = 0; return true; }),
    pinInfo: vi.fn().mockResolvedValue(true),
    vectorInfo: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.embeddings = []; return true; }),
    tagInfo: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.tags = []; return true; }),
    summaryInfo: vi.fn().mockResolvedValue(true),
    keywordInfo: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.keywords = []; return true; }),
    graphTag: vi.fn().mockResolvedValue(true),
    graphNInfo: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.nodes = []; return true; }),
    similarKInfo: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.list = []; return true; }),
    keywordKInfo: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.list = []; o.total = 0; return true; }),
    relationKInfo: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.list = []; o.total = 0; return true; }),
    graphInfo: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => {
      o.graph = { nodes: [], edges: [] };
      return true;
    }),
    delInfo: vi.fn().mockResolvedValue(true),
    existVectorInfo: vi.fn().mockResolvedValue(false),
    existTagInfo: vi.fn().mockResolvedValue(false),
    existSummaryInfo: vi.fn().mockResolvedValue(false),
    soInfoConfig: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => {
      o.config = {};
      return true;
    }),
    updateInfoConfig: vi.fn().mockResolvedValue(true),
    soInfoVectorConfig: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.config = {}; return true; }),
    updateInfoVectorConfig: vi.fn().mockResolvedValue(true),
    soInfoTagConfig: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.config = {}; return true; }),
    updateInfoTagConfig: vi.fn().mockResolvedValue(true),
    soInfoSummaryConfig: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.config = {}; return true; }),
    updateInfoSummaryConfig: vi.fn().mockResolvedValue(true),
    soInfoContextConfig: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.config = {}; return true; }),
    updateInfoContextConfig: vi.fn().mockResolvedValue(true),
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
