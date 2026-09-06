import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  SkillAccess,
  LLMAccess,
  PromptsAccess,
  Operator,
  IdGenerator,
  OperationType,
  AddPromptInput,
  AddPromptOutput,
  PromptContext,
} from '@brian-agent/base';
import {
  SkillCoreAccess,
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
  OptSkillInput,
  OptSkillOutput,
  AgeSkillInput,
  AgeSkillOutput,
  SoSkillRuleInput,
  SoSkillRuleOutput,
  UpdateSkillRuleInput,
  UpdateSkillRuleOutput,
  ConfigSkillCoreInput,
  ConfigSkillCoreOutput,
  SKILL_CORE_CONFIG_TABLE,
  SKILL_OPT_RULE_TABLE,
  SKILL_USAGE_TABLE,
} from '../SkillCoreProvider';
import { ValidationError } from '@brian-agent/base';

const ALL_SKILL_CORE_TABLES = [SKILL_CORE_CONFIG_TABLE, SKILL_OPT_RULE_TABLE, SKILL_USAGE_TABLE];

describe('SkillCoreProvider', () => {
  let tempDir: string;
  let dbPath: string;
  let relationDb: RelationDBAccess;
  let skillAccess: SkillAccess;
  let llmAccess: LLMAccess;
  let promptsAccess: PromptsAccess;
  let skillCore: SkillCoreAccess;

  async function ensureCoreTables() {
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_CORE_CONFIG_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "regen_rate" INTEGER NOT NULL DEFAULT 75,
        "prompt_template_id" TEXT NOT NULL DEFAULT ''
      )
    `);
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_OPT_RULE_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "days" INTEGER NOT NULL,
        "min_usage_count" INTEGER NOT NULL
      )
    `);
    // skill_core_usage（评估依据；键 (agent_id, skill_id)，2026-09-05 起与 Base 的 skill_usage 解耦）
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_USAGE_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "agent_id" TEXT NOT NULL,
        "skill_id" TEXT NOT NULL,
        "usage_date" TEXT NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 1
      )
    `);
  }

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-skill-'));
    dbPath = path.join(tempDir, 'test.db');
    relationDb = new RelationDBAccess({ dbPath });
    await relationDb.initialize();

    // Pre-create Core tables with proper schema so Base's schema initializer
    // (which uses same table names but different columns) skips via IF NOT EXISTS
    // and adds both Base and Core columns to shared tables
    await ensureCoreTables();

    skillAccess = new SkillAccess(relationDb);
    await skillAccess.initialize();
    llmAccess = new LLMAccess(relationDb);
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    skillCore = new SkillCoreAccess(relationDb, skillAccess, llmAccess, promptsAccess);
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('configSkillCore', () => {
    it('should return default config', async () => {
      const output = new ConfigSkillCoreOutput();
      await skillCore.configSkillCore(new ConfigSkillCoreInput(), output, new SkillCoreContext());
      expect(output.regen_rate).toBe(75);
    });

    it('should update regen_rate', async () => {
      const input = new ConfigSkillCoreInput();
      input.regen_rate = 30;
      const output = new ConfigSkillCoreOutput();
      await skillCore.configSkillCore(input, output, new SkillCoreContext());
      expect(output.regen_rate).toBe(30);
    });

    it('should throw ValidationError for regen_rate out of range', async () => {
      const input = new ConfigSkillCoreInput();
      input.regen_rate = 150;
      await expect(
        skillCore.configSkillCore(input, new ConfigSkillCoreOutput(), new SkillCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for regen_rate below 0', async () => {
      const input = new ConfigSkillCoreInput();
      input.regen_rate = -5;
      await expect(
        skillCore.configSkillCore(input, new ConfigSkillCoreOutput(), new SkillCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should accept valid prompt_template_id', async () => {
      const addInput = new AddPromptInput();
      addInput.data = { prompt_template_title: 'Test Skill Prompt', prompt_template: 'test template' };
      const addOutput = new AddPromptOutput();
      await promptsAccess.addPrompt(addInput, addOutput, new PromptContext());
      const realId = addOutput.id;

      const input = new ConfigSkillCoreInput();
      input.prompt_template_id = realId;
      const output = new ConfigSkillCoreOutput();
      await skillCore.configSkillCore(input, output, new SkillCoreContext());
      expect(output.prompt_template_id).toBe(realId);
    });

    it('should reject non-existent prompt_template_id', async () => {
      const input = new ConfigSkillCoreInput();
      input.prompt_template_id = IdGenerator.generate();
      await expect(
        skillCore.configSkillCore(input, new ConfigSkillCoreOutput(), new SkillCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should persist and retrieve config across calls', async () => {
      const setInput = new ConfigSkillCoreInput();
      setInput.regen_rate = 20;
      await skillCore.configSkillCore(setInput, new ConfigSkillCoreOutput(), new SkillCoreContext());

      const getOutput = new ConfigSkillCoreOutput();
      await skillCore.configSkillCore(new ConfigSkillCoreInput(), getOutput, new SkillCoreContext());
      expect(getOutput.regen_rate).toBe(20);
    });
  });

  describe('matchSkill', () => {
    it('should throw ValidationError when agent_id is empty', async () => {
      const input = new MatchSkillInput();
      input.agent_id = '';
      input.context_id = 'c1';
      input.interact_id = 'i1';

      await expect(
        skillCore.matchSkill(input, new MatchSkillOutput(), new SkillCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return empty when no skills available', async () => {
      const input = new MatchSkillInput();
      input.agent_id = 'agent-no-skills';
      input.context_id = 'c1';
      input.interact_id = 'i1';
      const output = new MatchSkillOutput();

      const result = await skillCore.matchSkill(input, output, new SkillCoreContext());
      expect(result).toBe(true);
      expect(output.skills).toEqual([]);
    });

    it('should use cached bindings', async () => {
      const now = IdGenerator.now();
      const agentId = 'agent-cached-skill';
      await relationDb.delete(SKILL_CORE_CONFIG_TABLE, []);
      await relationDb.insert(SKILL_CORE_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'regen_rate', value: 0 },
        { field: 'prompt_template_id', value: '' },
      ]);

      // 绑定唯一事实源 = agent 表：既有绑定经 bound_skill_ids 传入，确定性水合
      const input = new MatchSkillInput();
      input.agent_id = agentId;
      input.context_id = 'c1';
      input.interact_id = 'i1';
      input.bound_skill_ids = ['skill-c1'];
      const output = new MatchSkillOutput();
      await skillCore.matchSkill(input, output, new SkillCoreContext());

      expect(Array.isArray(output.skills)).toBe(true);
    });
  });

  describe('optSkill', () => {
    it('should create binding and record usage', async () => {
      const input = new OptSkillInput();
      input.agent_id = 'agent-opt-skill';
      input.skill_id = 'skill-opt-1';
      const output = new OptSkillOutput();

      await skillCore.optSkill(input, output, new SkillCoreContext());
      // 绑定已收敛至 Agent 表：binding 兼容保留（id 空串），仅记 usage
      expect(output.binding).not.toBeNull();
      expect(output.binding!.id).toBe('');
      expect(output.binding!.agent_id).toBe('agent-opt-skill');
      expect(output.binding!.skill_id).toBe('skill-opt-1');

      const count = await relationDb.count(SKILL_USAGE_TABLE);
      expect(count).toBe(1);
    });

    it('should throw ValidationError when agent_id is empty', async () => {
      const input = new OptSkillInput();
      input.agent_id = '';
      input.skill_id = 's1';

      await expect(
        skillCore.optSkill(input, new OptSkillOutput(), new SkillCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when skill_id is empty', async () => {
      const input = new OptSkillInput();
      input.agent_id = 'a1';
      input.skill_id = '';

      await expect(
        skillCore.optSkill(input, new OptSkillOutput(), new SkillCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should be idempotent - reuse existing binding', async () => {
      const agentId = 'agent-reuse';
      const skillId = 'skill-reuse';

      const out1 = new OptSkillOutput();
      await skillCore.optSkill(
        { agent_id: agentId, skill_id: skillId } as OptSkillInput,
        out1, new SkillCoreContext(),
      );

      const out2 = new OptSkillOutput();
      await skillCore.optSkill(
        { agent_id: agentId, skill_id: skillId } as OptSkillInput,
        out2, new SkillCoreContext(),
      );

      // 绑定 id 恒为空串（绑定在 Agent 表）；usage 每次调用各记一条
      expect(out1.binding!.id).toBe('');
      expect(out2.binding!.id).toBe('');

      const usageCount = await relationDb.count(SKILL_USAGE_TABLE);
      expect(usageCount).toBe(2);
    });
  });

  describe('ageSkill', () => {
    it('should return aged_count 0 when no rules', async () => {
      const input = new AgeSkillInput();
      const output = new AgeSkillOutput();
      await skillCore.ageSkill(input, output, new SkillCoreContext());
      expect(output.aged_count).toBe(0);
    });

    it('should return aged_count 0 when no bindings', async () => {
      await relationDb.insert(SKILL_OPT_RULE_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: IdGenerator.now() },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'days', value: 30 },
        { field: 'min_usage_count', value: 5 },
      ]);

      const output = new AgeSkillOutput();
      await skillCore.ageSkill(new AgeSkillInput(), output, new SkillCoreContext());
      expect(output.aged_count).toBe(0);
    });

    it('should set elapsed_ms on output', async () => {
      const output = new AgeSkillOutput();
      await skillCore.ageSkill(new AgeSkillInput(), output, new SkillCoreContext());
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('soSkillRule', () => {
    it('should return empty list when no rules', async () => {
      const output = new SoSkillRuleOutput();
      await skillCore.soSkillRule(new SoSkillRuleInput(), output, new SkillCoreContext());
      expect(output.list).toEqual([]);
      expect(output.total).toBe(0);
    });

    it('should list all rules', async () => {
      await relationDb.insert(SKILL_OPT_RULE_TABLE, [
        { field: 'id', value: 'rule-1' },
        { field: 'created', value: IdGenerator.now() },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'days', value: 7 },
        { field: 'min_usage_count', value: 3 },
      ]);
      await relationDb.insert(SKILL_OPT_RULE_TABLE, [
        { field: 'id', value: 'rule-2' },
        { field: 'created', value: IdGenerator.now() },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'days', value: 30 },
        { field: 'min_usage_count', value: 10 },
      ]);

      const output = new SoSkillRuleOutput();
      await skillCore.soSkillRule(new SoSkillRuleInput(), output, new SkillCoreContext());
      expect(output.list.length).toBe(2);
      expect(output.total).toBe(2);
    });

    it('should support filtering by conditions', async () => {
      await relationDb.insert(SKILL_OPT_RULE_TABLE, [
        { field: 'id', value: 'rule-filter' },
        { field: 'created', value: IdGenerator.now() },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'days', value: 7 },
        { field: 'min_usage_count', value: 3 },
      ]);

      const input = new SoSkillRuleInput();
      input.conditions = [{ field: 'days', operator: Operator.EQ, value: 7 }];
      const output = new SoSkillRuleOutput();
      await skillCore.soSkillRule(input, output, new SkillCoreContext());
      expect(output.list.length).toBe(1);
    });
  });

  describe('updateSkillRule', () => {
    it('should throw ValidationError when operations is empty', async () => {
      const input = new UpdateSkillRuleInput();
      input.operations = [];

      await expect(
        skillCore.updateSkillRule(input, new UpdateSkillRuleOutput(), new SkillCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should insert new rule', async () => {
      const input = new UpdateSkillRuleInput();
      input.operations = [{
        type: OperationType.INSERT,
        table: SKILL_OPT_RULE_TABLE,
        data: [
          { field: 'days', value: 14 },
          { field: 'min_usage_count', value: 5 },
        ],
      }];

      await skillCore.updateSkillRule(input, new UpdateSkillRuleOutput(), new SkillCoreContext());

      const soOut = new SoSkillRuleOutput();
      await skillCore.soSkillRule(new SoSkillRuleInput(), soOut, new SkillCoreContext());
      expect(soOut.list.length).toBe(1);
      expect(soOut.list[0].days).toBe(14);
    });

    it('should update existing rule', async () => {
      const ruleId = IdGenerator.generate();
      await relationDb.insert(SKILL_OPT_RULE_TABLE, [
        { field: 'id', value: ruleId },
        { field: 'created', value: IdGenerator.now() },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'days', value: 7 },
        { field: 'min_usage_count', value: 3 },
      ]);

      const input = new UpdateSkillRuleInput();
      input.operations = [{
        type: OperationType.UPDATE,
        table: SKILL_OPT_RULE_TABLE,
        conditions: [{ field: 'id', operator: Operator.EQ, value: ruleId }],
        data: [
          { field: 'days', value: 60 },
        ],
      }];

      await skillCore.updateSkillRule(input, new UpdateSkillRuleOutput(), new SkillCoreContext());

      const soOut = new SoSkillRuleOutput();
      await skillCore.soSkillRule(new SoSkillRuleInput(), soOut, new SkillCoreContext());
      expect(soOut.list[0].days).toBe(60);
    });

    it('should delete rule', async () => {
      const ruleId = IdGenerator.generate();
      await relationDb.insert(SKILL_OPT_RULE_TABLE, [
        { field: 'id', value: ruleId },
        { field: 'created', value: IdGenerator.now() },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'days', value: 1 },
        { field: 'min_usage_count', value: 1 },
      ]);

      const input = new UpdateSkillRuleInput();
      input.operations = [{
        type: OperationType.DELETE,
        table: SKILL_OPT_RULE_TABLE,
        conditions: [{ field: 'id', operator: Operator.EQ, value: ruleId }],
      }];

      await skillCore.updateSkillRule(input, new UpdateSkillRuleOutput(), new SkillCoreContext());

      const soOut = new SoSkillRuleOutput();
      await skillCore.soSkillRule(new SoSkillRuleInput(), soOut, new SkillCoreContext());
      expect(soOut.list.length).toBe(0);
    });

    it('should handle multiple operations', async () => {
      const input = new UpdateSkillRuleInput();
      input.operations = [
        {
          type: OperationType.INSERT,
          table: SKILL_OPT_RULE_TABLE,
          data: [
            { field: 'days', value: 2 },
            { field: 'min_usage_count', value: 1 },
          ],
        },
        {
          type: OperationType.INSERT,
          table: SKILL_OPT_RULE_TABLE,
          data: [
            { field: 'days', value: 4 },
            { field: 'min_usage_count', value: 2 },
          ],
        },
      ];

      await skillCore.updateSkillRule(input, new UpdateSkillRuleOutput(), new SkillCoreContext());

      const soOut = new SoSkillRuleOutput();
      await skillCore.soSkillRule(new SoSkillRuleInput(), soOut, new SkillCoreContext());
      expect(soOut.list.length).toBe(2);
    });
  });
});
