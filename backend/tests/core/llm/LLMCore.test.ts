import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDatabase, closeDatabase, getDatabase } from '../../../src/infrastructure/database';
import { LLMCore } from '../../../src/core/llm/LLMCore';
import { LLMService } from '../../../src/core/llm/LLMService';
import type { DBWrapper } from '../../../src/base/DBWrapper';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

describe('LLMCore', () => {
  let llmCore: LLMCore;
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-llmcore-'));
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

    rawDb.exec('ALTER TABLE llm_core_config ADD COLUMN user_id TEXT');

    rawDb.exec(`CREATE TABLE IF NOT EXISTS info_raw (
      id TEXT PRIMARY KEY,
      interact_id TEXT NOT NULL,
      content TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )`);

    rawDb.exec(`CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      template TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )`);

    rawDb.exec('DROP TABLE IF EXISTS llm_provider_quota');
    rawDb.exec(`CREATE TABLE llm_provider_quota (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      llm_provider_id TEXT NOT NULL UNIQUE,
      quota_tokens_per_day INTEGER NOT NULL DEFAULT 100000,
      quota_tokens_per_week INTEGER NOT NULL DEFAULT 500000,
      quota_tokens_per_month INTEGER NOT NULL DEFAULT 2000000,
      quota_calls_per_day INTEGER NOT NULL DEFAULT 1000,
      quota_calls_per_week INTEGER NOT NULL DEFAULT 5000,
      quota_calls_per_month INTEGER NOT NULL DEFAULT 20000,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
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
    llmCore = new LLMCore(sqliteDB, llmService);
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

  describe('matchLLM', () => {
    it('should return bound llm_id when regen_rate not exceeded', async () => {
      rawDb.prepare(`INSERT INTO llm_core_config (id, user_id, regen_rate) VALUES (?, ?, ?)`).run('cfg1', '', 75);
      rawDb.prepare(`INSERT INTO agent_llm (id, agent_id, llm_id) VALUES (?, ?, ?)`).run('bind1', 'agent-1', 'm1');
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.matchLLM(input, context, output);

      expect(output.success).toBe(true);
      expect(output.llm_id).toBe('m1');
    });

    it('should rematch when regen_rate exceeded', async () => {
      rawDb.prepare(`INSERT INTO llm_core_config (id, user_id, regen_rate) VALUES (?, ?, ?)`).run('cfg1', '', 75);
      rawDb.prepare(`INSERT INTO agent_llm (id, agent_id, llm_id) VALUES (?, ?, ?)`).run('bind1', 'agent-1', 'm1');
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      modelConfigProvider.listConfigs.mockResolvedValue([makeModelConfig({ id: 'm2', name: 'model-2' })]);

      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.matchLLM(input, context, output);

      expect(output.success).toBe(true);
      expect(output.llm_id).toBe('m2');
    });

    it('should select single active model when only one available', async () => {
      modelConfigProvider.listConfigs.mockResolvedValue([makeModelConfig({ id: 'm3', name: 'model-3' })]);

      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.matchLLM(input, context, output);

      expect(output.success).toBe(true);
      expect(output.llm_id).toBe('m3');
    });

    it('should call LLM for selection when multiple models', async () => {
      modelConfigProvider.listConfigs.mockResolvedValue([
        makeModelConfig({ id: 'm1', name: 'model-1' }),
        makeModelConfig({ id: 'm2', name: 'model-2', isDefault: false }),
      ]);

      rawDb.prepare(`INSERT INTO info_raw (id, interact_id, content, role) VALUES (?, ?, ?, ?)`).run('ir1', 'interact-1', 'test work content', 'user');

      vi.spyOn(llmService, 'chatCompletion').mockResolvedValue({
        choices: [{ message: { content: 'm2' } }],
      } as any);

      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.matchLLM(input, context, output);

      expect(output.success).toBe(true);
      expect(output.llm_id).toBe('m2');
    });

    it('should fallback to first model when LLM recommendation does not match any model', async () => {
      modelConfigProvider.listConfigs.mockResolvedValue([
        makeModelConfig({ id: 'm1', name: 'model-1' }),
        makeModelConfig({ id: 'm2', name: 'model-2', isDefault: false }),
      ]);

      rawDb.prepare(`INSERT INTO info_raw (id, interact_id, content, role) VALUES (?, ?, ?, ?)`).run('ir1', 'interact-1', 'test work content', 'user');

      vi.spyOn(llmService, 'chatCompletion').mockResolvedValue({
        choices: [{ message: { content: 'nonexistent-model' } }],
      } as any);

      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.matchLLM(input, context, output);

      expect(output.success).toBe(true);
      expect(output.llm_id).toBe('m1');
    });

    it('should return error when no active models available', async () => {
      modelConfigProvider.listConfigs.mockResolvedValue([
        makeModelConfig({ id: 'm1', name: 'model-1', status: 'disabled' }),
      ]);

      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.matchLLM(input, context, output);

      expect(output.success).toBe(false);
      expect(output.error).toContain('No active LLM models');
    });

    it('should handle LLM call failure gracefully', async () => {
      modelConfigProvider.listConfigs.mockResolvedValue([
        makeModelConfig({ id: 'm1', name: 'model-1' }),
        makeModelConfig({ id: 'm2', name: 'model-2', isDefault: false }),
      ]);

      rawDb.prepare(`INSERT INTO info_raw (id, interact_id, content, role) VALUES (?, ?, ?, ?)`).run('ir1', 'interact-1', 'test work content', 'user');

      vi.spyOn(llmService, 'chatCompletion').mockRejectedValue(new Error('LLM API down'));

      const input = { agent_id: 'agent-1', interact_id: 'interact-1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.matchLLM(input, context, output);

      expect(output.success).toBe(false);
      expect(output.error).toBeTruthy();
    });
  });

  describe('limitLLM', () => {
    it('should insert quota config for a valid provider', async () => {
      modelConfigProvider.getConfig.mockResolvedValue(makeModelConfig({ id: 'p1', name: 'provider-1' }));

      const input = { llm_provider_id: 'p1', quota_tokens_per_day: 50000, quota_calls_per_day: 500 };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.limitLLM(input, context, output);

      expect(output.success).toBe(true);

      const row = rawDb.prepare(`SELECT * FROM llm_provider_quota WHERE llm_provider_id = ?`).get('p1') as any;
      expect(row).toBeTruthy();
      expect(row.quota_tokens_per_day).toBe(50000);
      expect(row.quota_calls_per_day).toBe(500);
    });

    it('should update existing quota (upsert)', async () => {
      modelConfigProvider.getConfig.mockResolvedValue(makeModelConfig({ id: 'p1', name: 'provider-1' }));

      // First insert
      await llmCore.limitLLM({ llm_provider_id: 'p1', quota_tokens_per_day: 50000 }, { timestamp: Date.now() }, { success: false });

      // Update
      const input = { llm_provider_id: 'p1', quota_tokens_per_day: 100000, quota_calls_per_day: 1000 };
      const output: any = { success: false };
      await llmCore.limitLLM(input, { timestamp: Date.now() }, output);

      expect(output.success).toBe(true);

      const row = rawDb.prepare(`SELECT * FROM llm_provider_quota WHERE llm_provider_id = ?`).get('p1') as any;
      expect(row.quota_tokens_per_day).toBe(100000);
      expect(row.quota_calls_per_day).toBe(1000);
    });

    it('should return error when provider not found', async () => {
      modelConfigProvider.getConfig.mockResolvedValue(undefined);

      const input = { llm_provider_id: 'nonexistent' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.limitLLM(input, context, output);

      expect(output.success).toBe(false);
      expect(output.error).toContain('LLM provider not found');
    });

    it('should handle partial quota fields (only set some quotas)', async () => {
      modelConfigProvider.getConfig.mockResolvedValue(makeModelConfig({ id: 'p1', name: 'provider-1' }));

      const input = { llm_provider_id: 'p1', quota_tokens_per_week: 200000 };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.limitLLM(input, context, output);

      expect(output.success).toBe(true);

      const row = rawDb.prepare(`SELECT * FROM llm_provider_quota WHERE llm_provider_id = ?`).get('p1') as any;
      expect(row.quota_tokens_per_week).toBe(200000);
      expect(row.quota_tokens_per_day).toBe(100000); // default
    });
  });

  describe('checkLLMQuota', () => {
    it('should return within_quota=true when no quota config exists', async () => {
      const input = { llm_provider_id: 'p1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false, within_quota: false };

      await llmCore.checkLLMQuota(input, context, output);

      expect(output.success).toBe(true);
      expect(output.within_quota).toBe(true);
    });

    it('should return within_quota=false when daily tokens exceeded', async () => {
      rawDb.prepare(`INSERT INTO llm_provider_quota (id, llm_provider_id, quota_tokens_per_day) VALUES (?, ?, ?)`).run('q1', 'p1', 1000);

      const now = Math.floor(Date.now() / 1000);
      rawDb.prepare(`INSERT INTO call_history (id, provider_id, model_id, tokens, latency_ms, success, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('ch1', 'p1', 'model-1', 1500, 100, 1, now);

      const input = { llm_provider_id: 'p1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false, within_quota: true };

      await llmCore.checkLLMQuota(input, context, output);

      expect(output.success).toBe(true);
      expect(output.within_quota).toBe(false);
    });

    it('should return within_quota=false when weekly calls exceeded', async () => {
      rawDb.prepare(`INSERT INTO llm_provider_quota (id, llm_provider_id, quota_calls_per_week) VALUES (?, ?, ?)`).run('q1', 'p1', 2);

      const now = Math.floor(Date.now() / 1000);
      rawDb.prepare(`INSERT INTO call_history (id, provider_id, model_id, tokens, latency_ms, success, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('ch1', 'p1', 'model-1', 10, 100, 1, now);
      rawDb.prepare(`INSERT INTO call_history (id, provider_id, model_id, tokens, latency_ms, success, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('ch2', 'p1', 'model-1', 10, 100, 1, now);
      rawDb.prepare(`INSERT INTO call_history (id, provider_id, model_id, tokens, latency_ms, success, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('ch3', 'p1', 'model-1', 10, 100, 1, now);

      const input = { llm_provider_id: 'p1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false, within_quota: true };

      await llmCore.checkLLMQuota(input, context, output);

      expect(output.success).toBe(true);
      expect(output.within_quota).toBe(false);
    });

    it('should return within_quota=true when usage is under all limits', async () => {
      rawDb.prepare(`INSERT INTO llm_provider_quota (id, llm_provider_id, quota_tokens_per_day, quota_calls_per_week) VALUES (?, ?, ?, ?)`).run('q1', 'p1', 100000, 100);

      const now = Math.floor(Date.now() / 1000);
      rawDb.prepare(`INSERT INTO call_history (id, provider_id, model_id, tokens, latency_ms, success, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('ch1', 'p1', 'model-1', 500, 100, 1, now);

      const input = { llm_provider_id: 'p1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false, within_quota: false };

      await llmCore.checkLLMQuota(input, context, output);

      expect(output.success).toBe(true);
      expect(output.within_quota).toBe(true);
    });
  });

  describe('configLLMCore', () => {
    it('should insert new config when none exists', async () => {
      const input = { regen_rate: 50 };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.configLLMCore(input, context, output);

      expect(output.success).toBe(true);

      const row = rawDb.prepare(`SELECT * FROM llm_core_config WHERE user_id = ?`).get('') as any;
      expect(row).toBeTruthy();
      expect(row.regen_rate).toBe(50);
    });

    it('should update existing config', async () => {
      rawDb.prepare(`INSERT INTO llm_core_config (id, user_id, regen_rate, updated_at) VALUES (?, ?, ?, ?)`).run('cfg1', '', 50, Date.now());

      const input = { regen_rate: 30 };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.configLLMCore(input, context, output);

      expect(output.success).toBe(true);

      const row = rawDb.prepare(`SELECT regen_rate FROM llm_core_config WHERE user_id = ?`).get('') as any;
      expect(row.regen_rate).toBe(30);
    });

    it('should reject invalid regen_rate (negative)', async () => {
      const input = { regen_rate: -1 };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.configLLMCore(input, context, output);

      expect(output.success).toBe(false);
      expect(output.error).toContain('regen_rate must be between 0 and 100');
    });

    it('should reject invalid regen_rate (>100)', async () => {
      const input = { regen_rate: 101 };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.configLLMCore(input, context, output);

      expect(output.success).toBe(false);
      expect(output.error).toContain('regen_rate must be between 0 and 100');
    });

    it('should reject non-existent prompt_template_id', async () => {
      const input = { prompt_template_id: 'nonexistent-pt' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.configLLMCore(input, context, output);

      expect(output.success).toBe(false);
      expect(output.error).toContain('Prompt template not found');
    });

    it('should accept valid regen_rate and prompt_template_id', async () => {
      rawDb.prepare(`INSERT INTO prompt_templates (id, name, template) VALUES (?, ?, ?)`).run('pt1', 'test-template', 'You are a helpful assistant');

      const input = { regen_rate: 60, prompt_template_id: 'pt1' };
      const context = { timestamp: Date.now() };
      const output: any = { success: false };

      await llmCore.configLLMCore(input, context, output);

      expect(output.success).toBe(true);

      const row = rawDb.prepare(`SELECT regen_rate, prompt_template_id FROM llm_core_config WHERE user_id = ?`).get('') as any;
      expect(row.regen_rate).toBe(60);
      expect(row.prompt_template_id).toBe('pt1');
    });
  });
});
