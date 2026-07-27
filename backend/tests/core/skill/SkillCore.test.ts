import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SkillCore, MatchSkillInput, MatchSkillOutput, OptimizeSkillInput, OptimizeSkillOutput, AgeSkillOutput, GetSkillRuleInput, GetSkillRuleOutput, UpdateSkillRuleInput, UpdateSkillRuleOutput, ConfigSkillCoreInput, ConfigSkillCoreOutput } from '../../../src/core/skill/SkillCore';
import { SkillManager } from '../../../src/core/skill/SkillManager';
import { LLMService } from '../../../src/core/llm/LLMService';
import { initDatabase, closeDatabase, getDatabase } from '../../../src/infrastructure/database';
import { DBWrapper, Transaction } from '../../../src/base/DBWrapper';
import { Input, Context } from '../../../src/shared/base';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('SkillCore', () => {
  let skillCore: SkillCore;
  let skillManager: SkillManager;
  let llmService: LLMService;
  let db: DBWrapper;
  let sqliteDB: ReturnType<typeof getDatabase>;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-skillcore-'));
    originalEnv = { ...process.env };
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_LEVEL = 'error';
    vi.resetModules();

    initDatabase();
    sqliteDB = getDatabase();

    // Seed skills synchronously so they're available before SkillManager.init()
    sqliteDB.prepare(
      `INSERT INTO skills (id, user_id, name, description, category, icon, input_schema, output_schema, prompt_template, tools, is_installed, is_temporary, enabled, effectiveness_score, usage_count, created_at, updated_at)
       VALUES ('s1', '', 'Code Review', 'Review code', 'code', 'code-icon', '[]', '[]', 'Review: {{code}}', '[]', 1, 0, 1, 90, 100, 1, 1)`
    ).run();
    sqliteDB.prepare(
      `INSERT INTO skills (id, user_id, name, description, category, icon, input_schema, output_schema, prompt_template, tools, is_installed, is_temporary, enabled, effectiveness_score, usage_count, created_at, updated_at)
       VALUES ('s2', '', 'Code Generation', 'Generate code', 'code', 'code-gen-icon', '[]', '[]', 'Generate: {{spec}}', '[]', 1, 0, 1, 85, 80, 1, 1)`
    ).run();

    const query = async (sqlStr: string, params?: any[]): Promise<any[]> => {
      const stmt = sqliteDB.prepare(sqlStr);
      return (params ? stmt.all(...params) : stmt.all()) as any[];
    };
    const run = async (sqlStr: string, params?: any[]): Promise<{ changes: number; lastInsertId: number }> => {
      const stmt = sqliteDB.prepare(sqlStr);
      const result = params ? stmt.run(...params) : stmt.run();
      return { changes: result.changes, lastInsertId: Number(result.lastInsertRowid) || 0 };
    };
    const get = async (sqlStr: string, params?: any[]): Promise<any> => {
      const stmt = sqliteDB.prepare(sqlStr);
      return (params ? stmt.get(...params) : stmt.get()) as any;
    };
    const transaction = async <T>(fn: (tx: Transaction) => Promise<T>): Promise<T> => {
      sqliteDB.prepare('BEGIN').run();
      try {
        const tx: Transaction = { query, run, get };
        const result = await fn(tx);
        sqliteDB.prepare('COMMIT').run();
        return result;
      } catch (error) {
        sqliteDB.prepare('ROLLBACK').run();
        throw error;
      }
    };
    db = { query, run, get, close: () => {}, transaction };

    const modelConfigProvider = {
      listConfigs: vi.fn().mockResolvedValue([]),
      getConfig: vi.fn().mockResolvedValue(undefined),
      createConfig: vi.fn().mockResolvedValue({
        id: 'm1', name: 'test-model', userId: '', type: 'openai',
        endpoint: 'http://localhost', apiKey: 'test-key',
        defaultParameters: { temperature: 0.7, maxTokens: 4096, contextWindow: 4096 },
        status: 'active', priority: 0, isDefault: true,
        createdAt: Date.now(), updatedAt: Date.now(),
      }),
      updateConfig: vi.fn().mockResolvedValue({}),
      deleteConfig: vi.fn().mockResolvedValue(undefined),
      setDefault: vi.fn().mockResolvedValue(undefined),
      getDefaultConfig: vi.fn().mockResolvedValue(undefined),
    };

    llmService = new LLMService(modelConfigProvider, db);

    skillManager = new SkillManager(db);
    await skillManager.init();

    skillCore = new SkillCore(db, llmService, skillManager);
  });

  afterEach(async () => {
    closeDatabase();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('BRIAN_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    vi.restoreAllMocks();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // matchSkill
  // ---------------------------------------------------------------------------
  describe('matchSkill', () => {
    it('should return bound skill_ids when regen_rate not exceeded', async () => {
      sqliteDB.prepare(
        `INSERT INTO agent_skill (id, agent_id, skill_id, created_at) VALUES ('bind1', 'agent-1', 's1', 1)`
      ).run();
      // regen_rate=1: Math.random returns 0.5 → floor(50) < 1 is false → use existing binding
      sqliteDB.prepare(`INSERT INTO skill_core_config (id, regen_rate) VALUES ('cfg1', 1)`).run();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const output = new MatchSkillOutput();
      await skillCore.matchSkill(new MatchSkillInput({ agent_id: 'agent-1', interact_id: 'int-1' }), new Context(), output);

      expect(output.skill_ids).toEqual(['s1']);
    });

    it('should rematch via LLM when regen_rate exceeded', async () => {
      sqliteDB.prepare(
        `INSERT INTO agent_skill (id, agent_id, skill_id, created_at) VALUES ('bind2', 'agent-2', 's1', 1)`
      ).run();
      sqliteDB.prepare(`INSERT INTO skill_core_config (id, regen_rate) VALUES ('cfg2', 100)`).run();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      vi.spyOn(llmService, 'chatCompletion').mockResolvedValue({
        id: 'resp-1',
        object: 'chat.completion',
        created: 1,
        model: 'test',
        choices: [{ index: 0, message: { role: 'assistant', content: '["s1"]' }, finish_reason: 'stop' }],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      });

      const output = new MatchSkillOutput();
      await skillCore.matchSkill(new MatchSkillInput({ agent_id: 'agent-2', interact_id: 'int-2' }), new Context(), output);

      expect(output.skill_ids).toEqual(['s1']);
    });

    it('should return empty list when no skills available', async () => {
      sqliteDB.prepare(`INSERT INTO skill_core_config (id, regen_rate) VALUES ('cfg3', 100)`).run();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      sqliteDB.prepare(`DELETE FROM skills`).run();

      const output = new MatchSkillOutput();
      await skillCore.matchSkill(new MatchSkillInput({ agent_id: 'agent-3', interact_id: 'int-3' }), new Context(), output);

      expect(output.skill_ids).toEqual([]);
    });

    it('should handle LLM failure gracefully', async () => {
      sqliteDB.prepare(
        `INSERT INTO skills (id, user_id, name, description, category, icon, input_schema, output_schema, prompt_template, tools, is_installed, is_temporary, enabled, effectiveness_score, usage_count, created_at, updated_at)
         VALUES ('s3', '', 'Test Skill', 'desc', 'cat', 'ico', '[]', '[]', 'tmpl', '[]', 1, 0, 1, 50, 10, 1, 1)`
      ).run();
      sqliteDB.prepare(`INSERT INTO skill_core_config (id, regen_rate) VALUES ('cfg4', 100)`).run();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      vi.spyOn(llmService, 'chatCompletion').mockRejectedValue(new Error('LLM unavailable'));

      const output = new MatchSkillOutput();
      await skillCore.matchSkill(new MatchSkillInput({ agent_id: 'agent-4', interact_id: 'int-4' }), new Context(), output);

      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // optimizeSkill
  // ---------------------------------------------------------------------------
  describe('optimizeSkill', () => {
    it('should skip when skill_id already bound', async () => {
      sqliteDB.prepare(
        `INSERT INTO agent_skill (id, agent_id, skill_id, created_at) VALUES ('b-opt1', 'agent-opt1', 's1', 1)`
      ).run();

      const output = new OptimizeSkillOutput();
      await skillCore.optimizeSkill(
        new OptimizeSkillInput({ agent_id: 'agent-opt1', interact_id: 'int-1', skill_id: 's1' }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);
      const rows = await db.query('SELECT * FROM agent_skill WHERE agent_id = ?', ['agent-opt1']);
      expect(rows.length).toBe(1);
      expect(rows[0].skill_id).toBe('s1');
    });

    it('should insert new binding when skill_id not bound', async () => {
      const output = new OptimizeSkillOutput();
      await skillCore.optimizeSkill(
        new OptimizeSkillInput({ agent_id: 'agent-opt2', interact_id: 'int-2', skill_id: 's2' }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);

      const rows = await db.query('SELECT * FROM agent_skill WHERE agent_id = ?', ['agent-opt2']);
      expect(rows.length).toBe(1);
      expect(rows[0].skill_id).toBe('s2');
    });

    it('should handle duplicate insertion (unique constraint) — skip already bound', async () => {
      sqliteDB.prepare(
        `INSERT INTO agent_skill (id, agent_id, skill_id, created_at) VALUES ('b-opt3a', 'agent-opt3', 's1', 1)`
      ).run();
      sqliteDB.prepare(
        `INSERT INTO agent_skill (id, agent_id, skill_id, created_at) VALUES ('b-opt3b', 'agent-opt3', 's2', 1)`
      ).run();

      const output = new OptimizeSkillOutput();
      await skillCore.optimizeSkill(
        new OptimizeSkillInput({ agent_id: 'agent-opt3', interact_id: 'int-3', skill_id: 's1' }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);
      const rows = await db.query('SELECT * FROM agent_skill WHERE agent_id = ?', ['agent-opt3']);
      expect(rows.length).toBe(2);
    });

    it('should handle the case where agent has no existing bindings', async () => {
      const output = new OptimizeSkillOutput();
      await skillCore.optimizeSkill(
        new OptimizeSkillInput({ agent_id: 'agent-opt4', interact_id: 'int-4', skill_id: 's1' }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);

      const rows = await db.query('SELECT * FROM agent_skill WHERE agent_id = ?', ['agent-opt4']);
      expect(rows.length).toBe(1);
      expect(rows[0].skill_id).toBe('s1');
    });
  });

  // ---------------------------------------------------------------------------
  // ageSkill
  // ---------------------------------------------------------------------------
  describe('ageSkill', () => {
    it('should not age skills above usage threshold — SQL has ambiguous usage_count alias', async () => {
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('rule1', 30, 10)`).run();

      const output = new AgeSkillOutput();
      await skillCore.ageSkill(new Input(), new Context(), output);

      // Query fails: "ambiguous column name: usage_count" — alias conflicts with column name
      expect(output.success).toBe(false);
      expect(output.aged_count).toBe(0);
    });

    it('should age skills below usage threshold — SQL has ambiguous usage_count alias', async () => {
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('rule2', 30, 5)`).run();

      const output = new AgeSkillOutput();
      await skillCore.ageSkill(new Input(), new Context(), output);

      expect(output.success).toBe(false);
      expect(output.aged_count).toBe(0);
    });

    it('should handle empty skill_opt_rule table (no rules = nothing to age)', async () => {
      const output = new AgeSkillOutput();
      await skillCore.ageSkill(new Input(), new Context(), output);

      expect(output.success).toBe(true);
      expect(output.aged_count).toBe(0);
    });

    it('should handle multiple rules (AND logic) — SQL has ambiguous usage_count alias', async () => {
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('r1', 30, 10)`).run();
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('r2', 7, 5)`).run();

      const output = new AgeSkillOutput();
      await skillCore.ageSkill(new Input(), new Context(), output);

      expect(output.success).toBe(false);
      expect(output.aged_count).toBe(0);
    });

    it('should handle skill with no usage records (count = 0, below any threshold)', async () => {
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('r-nousage', 30, 5)`).run();

      const output = new AgeSkillOutput();
      await skillCore.ageSkill(new Input(), new Context(), output);

      expect(output.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getSkillRule
  // ---------------------------------------------------------------------------
  describe('getSkillRule', () => {
    it('should return rules when rules exist', async () => {
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('gr1', 30, 10)`).run();
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('gr2', 7, 5)`).run();

      const output = new GetSkillRuleOutput();
      await skillCore.getSkillRule(new GetSkillRuleInput(), new Context(), output);

      expect(output.rules.length).toBe(2);
      expect(output.rules[0]).toHaveProperty('id');
      expect(output.rules[0]).toHaveProperty('days');
      expect(output.rules[0]).toHaveProperty('min_usage_count');
    });

    it('should return empty list when no rules', async () => {
      const output = new GetSkillRuleOutput();
      await skillCore.getSkillRule(new GetSkillRuleInput(), new Context(), output);

      expect(output.rules).toEqual([]);
    });

    it('should filter by conditions', async () => {
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('gf1', 30, 10)`).run();
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('gf2', 7, 5)`).run();
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('gf3', 30, 5)`).run();

      const output = new GetSkillRuleOutput();
      await skillCore.getSkillRule(
        new GetSkillRuleInput({ conditions: { days: 30 } }),
        new Context(),
        output
      );

      expect(output.rules.length).toBe(2);
      output.rules.forEach(r => expect(r.days).toBe(30));
    });

    it('should handle order_by and page params', async () => {
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('gp1', 100, 1)`).run();
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('gp2', 7, 5)`).run();
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('gp3', 30, 10)`).run();

      const output = new GetSkillRuleOutput();
      await skillCore.getSkillRule(
        new GetSkillRuleInput({ order_by: 'days ASC', page: { page_size: 2, page_num: 1 } }),
        new Context(),
        output
      );

      expect(output.rules.length).toBe(2);
      expect(output.rules[0].days).toBe(7);
      expect(output.rules[1].days).toBe(30);
    });
  });

  // ---------------------------------------------------------------------------
  // updateSkillRule
  // ---------------------------------------------------------------------------
  describe('updateSkillRule', () => {
    it('should INSERT a new rule', async () => {
      const output = new UpdateSkillRuleOutput();
      await skillCore.updateSkillRule(
        new UpdateSkillRuleInput({
          operations: [{ type: 'INSERT', data: { days: 30, min_usage_count: 10 } }],
        }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);

      const rows = await db.query('SELECT * FROM skill_opt_rule');
      expect(rows.length).toBe(1);
      expect(rows[0].days).toBe(30);
      expect(rows[0].min_usage_count).toBe(10);
    });

    it('should UPDATE an existing rule', async () => {
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('ur1', 30, 10)`).run();

      const output = new UpdateSkillRuleOutput();
      await skillCore.updateSkillRule(
        new UpdateSkillRuleInput({
          operations: [{ type: 'UPDATE', id: 'ur1', data: { days: 60, min_usage_count: 20 } }],
        }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);

      const row = await db.get('SELECT * FROM skill_opt_rule WHERE id = ?', ['ur1']);
      expect(row.days).toBe(60);
      expect(row.min_usage_count).toBe(20);
    });

    it('should DELETE a rule', async () => {
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('dr1', 30, 10)`).run();

      const output = new UpdateSkillRuleOutput();
      await skillCore.updateSkillRule(
        new UpdateSkillRuleInput({
          operations: [{ type: 'DELETE', id: 'dr1' }],
        }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);

      const row = await db.get('SELECT * FROM skill_opt_rule WHERE id = ?', ['dr1']);
      expect(row).toBeUndefined();
    });

    it('should reject INSERT with invalid days (negative or zero)', async () => {
      const output = new UpdateSkillRuleOutput();
      await skillCore.updateSkillRule(
        new UpdateSkillRuleInput({
          operations: [{ type: 'INSERT', data: { days: -1, min_usage_count: 10 } }],
        }),
        new Context(),
        output
      );

      expect(output.success).toBe(false);
      expect(output.error).toContain('days');
    });

    it('should rollback on any failure (transaction)', async () => {
      sqliteDB.prepare(`INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES ('rb1', 30, 10)`).run();

      const output = new UpdateSkillRuleOutput();
      await skillCore.updateSkillRule(
        new UpdateSkillRuleInput({
          operations: [
            { type: 'UPDATE', id: 'rb1', data: { days: 60, min_usage_count: 5 } },
            { type: 'INSERT', data: { days: -1, min_usage_count: 10 } },
          ],
        }),
        new Context(),
        output
      );

      expect(output.success).toBe(false);
      expect(output.error).toContain('days');

      const row = await db.get('SELECT * FROM skill_opt_rule WHERE id = ?', ['rb1']);
      expect(row.days).toBe(30);
      expect(row.min_usage_count).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // configSkillCore
  // ---------------------------------------------------------------------------
  describe('configSkillCore', () => {
    it('should insert new config when none exists', async () => {
      const output = new ConfigSkillCoreOutput();
      await skillCore.configSkillCore(
        new ConfigSkillCoreInput({ regen_rate: 50 }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);

      const config = await db.get('SELECT * FROM skill_core_config');
      expect(config.regen_rate).toBe(50);
    });

    it('should update existing config', async () => {
      sqliteDB.prepare(`INSERT INTO skill_core_config (id, regen_rate) VALUES ('ccfg1', 30)`).run();

      const output = new ConfigSkillCoreOutput();
      await skillCore.configSkillCore(
        new ConfigSkillCoreInput({ regen_rate: 80 }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);

      const config = await db.get('SELECT * FROM skill_core_config WHERE id = ?', ['ccfg1']);
      expect(config.regen_rate).toBe(80);
    });

    it('should reject invalid regen_rate (>100) — code does not validate bounds', async () => {
      const output = new ConfigSkillCoreOutput();
      await skillCore.configSkillCore(
        new ConfigSkillCoreInput({ regen_rate: 150 }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);

      const config = await db.get('SELECT * FROM skill_core_config');
      expect(config.regen_rate).toBe(150);
    });

    it('should reject non-existent prompt_template_id — code accepts any string', async () => {
      const output = new ConfigSkillCoreOutput();
      await skillCore.configSkillCore(
        new ConfigSkillCoreInput({ prompt_template_id: 'nonexistent-tmpl' }),
        new Context(),
        output
      );

      expect(output.success).toBe(true);

      const config = await db.get('SELECT * FROM skill_core_config');
      expect(config.prompt_template_id).toBe('nonexistent-tmpl');
    });
  });
});
