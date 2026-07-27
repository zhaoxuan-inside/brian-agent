import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDatabase, closeDatabase, getDatabase } from '../../../src/infrastructure/database';
import { MCPCore } from '../../../src/core/mcp/MCPCore';
import { MCPManager } from '../../../src/core/mcp/MCPManager';
import { LLMService } from '../../../src/core/llm/LLMService';
import type { DBWrapper } from '../../../src/base/DBWrapper';
import fs from 'fs';
import path from 'path';
import os from 'os';

function makeMCP(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? 'mcp1',
    userId: overrides.userId ?? '',
    name: overrides.name ?? 'test-mcp',
    description: overrides.description ?? 'A test MCP tool',
    category: overrides.category ?? 'test',
    icon: overrides.icon ?? '🔧',
    version: overrides.version ?? '1.0.0',
    author: overrides.author ?? 'tester',
    functions: overrides.functions ?? [{ name: 'testFunc', description: 'Test function', parameters: {} }],
    config: overrides.config ?? {},
    isInstalled: overrides.isInstalled ?? true,
    enabled: overrides.enabled ?? true,
    effectivenessScore: overrides.effectivenessScore ?? 0,
    usageCount: overrides.usageCount ?? 0,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

function insertMCP(rawDb: ReturnType<typeof getDatabase>, mcp: ReturnType<typeof makeMCP>) {
  rawDb.prepare(`INSERT INTO mcps (id, user_id, name, description, category, icon, version, author, functions, config, is_installed, enabled, effectiveness_score, usage_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      mcp.id, mcp.userId, mcp.name, mcp.description, mcp.category, mcp.icon,
      mcp.version, mcp.author, JSON.stringify(mcp.functions), JSON.stringify(mcp.config || {}),
      mcp.isInstalled ? 1 : 0, mcp.enabled ? 1 : 0, mcp.effectivenessScore, mcp.usageCount,
      mcp.createdAt, mcp.updatedAt
    );
}

function makeModelConfig(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? 'm1',
    name: overrides.name ?? 'test-model',
    userId: overrides.userId ?? '',
    type: overrides.type ?? 'openai',
    endpoint: overrides.endpoint ?? 'http://localhost',
    apiKey: overrides.apiKey ?? 'test-key',
    defaultParameters: overrides.defaultParameters ?? { temperature: 0.7, maxTokens: 4096, contextWindow: 4096 },
    status: overrides.status ?? 'active',
    priority: overrides.priority ?? 0,
    isDefault: overrides.isDefault ?? true,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

describe('MCPCore', () => {
  let mcpCore: MCPCore;
  let mcpManager: MCPManager;
  let llmService: LLMService;
  let sqliteDB: DBWrapper;
  let rawDb: ReturnType<typeof getDatabase>;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;
  let modelConfigProvider: {
    listConfigs: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
    createConfig: ReturnType<typeof vi.fn>;
    updateConfig: ReturnType<typeof vi.fn>;
    deleteConfig: ReturnType<typeof vi.fn>;
    setDefault: ReturnType<typeof vi.fn>;
    getDefaultConfig: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-mcpcore-'));
    originalEnv = { ...process.env };
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_CONFIG_FILE_PATH = path.join(tempDir, 'model-config.json');

    vi.resetModules();
    initDatabase();
    rawDb = getDatabase();

    sqliteDB = {
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
      close: () => { /* shared connection */ },
      transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
        return rawDb.transaction(() => {
          const tx = {
            query: async (s: string, p?: any[]) => rawDb.prepare(s).all(...(p || [])),
            run: async (s: string, p?: any[]) => rawDb.prepare(s).run(...(p || [])),
            get: async (s: string, p?: any[]) => rawDb.prepare(s).get(...(p || [])),
          };
          return fn(tx);
        })();
      },
    };

    rawDb.exec('ALTER TABLE mcp_core_config ADD COLUMN user_id TEXT');

    rawDb.exec(`CREATE TABLE IF NOT EXISTS info_raw (
      id TEXT PRIMARY KEY,
      interact_id TEXT NOT NULL,
      content TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )`);

    rawDb.exec('DROP TABLE IF EXISTS agent_mcp');
    rawDb.exec(`CREATE TABLE agent_mcp (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      agent_id TEXT NOT NULL,
      mcp_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(agent_id, mcp_id)
    )`);

    modelConfigProvider = {
      listConfigs: vi.fn().mockResolvedValue([]),
      getConfig: vi.fn().mockResolvedValue(undefined),
      createConfig: vi.fn().mockResolvedValue(makeModelConfig()),
      updateConfig: vi.fn().mockResolvedValue({ status: 'active' }),
      deleteConfig: vi.fn().mockResolvedValue(undefined),
      setDefault: vi.fn().mockResolvedValue(undefined),
      getDefaultConfig: vi.fn().mockResolvedValue(makeModelConfig()),
    };

    llmService = new LLMService(modelConfigProvider as any, sqliteDB);
    mcpManager = new MCPManager(sqliteDB);
    mcpCore = new MCPCore(sqliteDB, llmService, mcpManager);
  });

  afterEach(async () => {
    closeDatabase();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('BRIAN_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('matchMCP', () => {
    it('should return bound mcp_ids when regen_rate not exceeded', async () => {
      rawDb.prepare(`INSERT INTO mcp_core_config (id, user_id, regen_rate) VALUES (?, ?, ?)`).run('cfg1', '', 75);
      rawDb.prepare(`INSERT INTO agent_mcp (id, agent_id, mcp_id) VALUES (?, ?, ?)`).run('bind1', 'agent-1', 'mcp1');
      rawDb.prepare(`INSERT INTO agent_mcp (id, agent_id, mcp_id) VALUES (?, ?, ?)`).run('bind2', 'agent-1', 'mcp2');
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false, mcp_ids: [] };

      await mcpCore.matchMCP(input, context, output);

      expect(output.success).toBe(true);
      expect(output.mcp_ids).toEqual(['mcp1', 'mcp2']);
    });

    it('should rematch via LLM when regen_rate exceeded', async () => {
      rawDb.prepare(`INSERT INTO mcp_core_config (id, user_id, regen_rate) VALUES (?, ?, ?)`).run('cfg1', '', 75);
      rawDb.prepare(`INSERT INTO agent_mcp (id, agent_id, mcp_id) VALUES (?, ?, ?)`).run('bind1', 'agent-1', 'mcp1');
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      insertMCP(rawDb, makeMCP({ id: 'mcp-rematch', name: 'rematch-mcp', description: 'rematch desc', category: 'tools' }));

      modelConfigProvider.listConfigs.mockResolvedValue([makeModelConfig({ id: 'm1', name: 'model-1' })]);

      vi.spyOn(llmService, 'chatCompletion').mockResolvedValue({
        choices: [{ message: { content: 'mcp-rematch' } }],
      } as any);

      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false, mcp_ids: [] };

      await mcpCore.matchMCP(input, context, output);

      expect(output.success).toBe(true);
      expect(output.mcp_ids).toContain('mcp-rematch');
    });

    it('should return empty list when no MCPs available', async () => {
      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false, mcp_ids: ['unexpected'] };

      await mcpCore.matchMCP(input, context, output);

      expect(output.success).toBe(true);
      expect(output.mcp_ids).toEqual([]);
    });

    it('should handle LLM failure gracefully', async () => {
      rawDb.prepare(`INSERT INTO mcp_core_config (id, user_id, regen_rate) VALUES (?, ?, ?)`).run('cfg1', '', 75);
      rawDb.prepare(`INSERT INTO agent_mcp (id, agent_id, mcp_id) VALUES (?, ?, ?)`).run('bind1', 'agent-1', 'mcp1');
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      insertMCP(rawDb, makeMCP({ id: 'mcp-fail', name: 'fail-mcp', description: 'fail desc', category: 'tools' }));

      modelConfigProvider.listConfigs.mockResolvedValue([makeModelConfig({ id: 'm1', name: 'model-1' })]);

      vi.spyOn(llmService, 'chatCompletion').mockRejectedValue(new Error('LLM API down'));

      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false, mcp_ids: [] };

      await mcpCore.matchMCP(input, context, output);

      expect(output.success).toBe(false);
      expect(output.error).toBeTruthy();
      expect(output.mcp_ids).toEqual([]);
    });
  });

  describe('optimizeMCP', () => {
    it('should skip when mcp_id already bound', async () => {
      rawDb.prepare(`INSERT INTO agent_mcp (id, agent_id, mcp_id) VALUES (?, ?, ?)`).run('bind1', 'agent-1', 'mcp1');
      insertMCP(rawDb, makeMCP({ id: 'mcp1', name: 'existing-mcp' }));

      const input = { agent_id: 'agent-1', interact_id: 'interact-1', mcp_id: 'mcp1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await mcpCore.optimizeMCP(input, context, output);

      expect(output.success).toBe(true);
    });

    it('should insert new binding when mcp_id not bound', async () => {
      insertMCP(rawDb, makeMCP({ id: 'mcp-new', name: 'new-mcp' }));

      const input = { agent_id: 'agent-1', interact_id: 'interact-1', mcp_id: 'mcp-new' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await mcpCore.optimizeMCP(input, context, output);

      expect(output.success).toBe(true);

      const binding = rawDb.prepare(`SELECT * FROM agent_mcp WHERE agent_id = ? AND mcp_id = ?`).get('agent-1', 'mcp-new') as any;
      expect(binding).toBeTruthy();
    });

    it('should handle duplicate binding gracefully (upsert via unique constraint)', async () => {
      insertMCP(rawDb, makeMCP({ id: 'mcp-dup', name: 'dup-mcp' }));

      const input = { agent_id: 'agent-1', interact_id: 'interact-1', mcp_id: 'mcp-dup' };
      const context = { timestamp: Date.now() };
      const output1: any = { success: false };
      const output2: any = { success: false };

      await mcpCore.optimizeMCP(input, context, output1);
      expect(output1.success).toBe(true);

      await mcpCore.optimizeMCP(input, context, output2);
      expect(output2.success).toBe(true);

      const rows = rawDb.prepare(`SELECT * FROM agent_mcp WHERE agent_id = ? AND mcp_id = ?`).all('agent-1', 'mcp-dup') as any[];
      expect(rows.length).toBe(1);
    });
  });

  describe('configMCPCore', () => {
    it('should insert new config', async () => {
      const input = { regen_rate: 40 };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await mcpCore.configMCPCore(input, context, output);

      expect(output.success).toBe(true);

      const row = rawDb.prepare(`SELECT * FROM mcp_core_config WHERE user_id = ?`).get('') as any;
      expect(row).toBeTruthy();
      expect(row.regen_rate).toBe(40);
    });

    it('should update existing config', async () => {
      rawDb.prepare(`INSERT INTO mcp_core_config (id, user_id, regen_rate, updated_at) VALUES (?, ?, ?, ?)`).run('cfg1', '', 40, Date.now());

      const input = { regen_rate: 60 };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await mcpCore.configMCPCore(input, context, output);

      expect(output.success).toBe(true);

      const row = rawDb.prepare(`SELECT regen_rate FROM mcp_core_config WHERE user_id = ?`).get('') as any;
      expect(row.regen_rate).toBe(60);
    });

    it('should reject invalid regen_rate', async () => {
      const input = { regen_rate: -5 };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await mcpCore.configMCPCore(input, context, output);

      expect(output.success).toBe(false);
      expect(output.error).toContain('regen_rate must be between 0 and 100');
    });
  });
});
