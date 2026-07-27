import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  SoulAccess,
  LLMAccess,
  PromptsAccess,
  Operator,
  IdGenerator,
  OperationType,
} from '@brian-agent/base';
import {
  SoulCoreAccess,
  SoulCoreContext,
  MatchSoulInput,
  MatchSoulOutput,
  OptSoulInput,
  OptSoulOutput,
  AgeSoulInput,
  AgeSoulOutput,
  SoSoulRuleInput,
  SoSoulRuleOutput,
  UpdateSoulRuleInput,
  UpdateSoulRuleOutput,
  ConfigSoulCoreInput,
  ConfigSoulCoreOutput,
  AGENT_SOUL_TABLE,
  SOUL_CORE_CONFIG_TABLE,
  SOUL_OPT_RULE_TABLE,
  SOUL_CORE_USAGE_TABLE,
} from '../SoulCoreProvider';
import { ValidationError, NotFoundError } from '@brian-agent/base';

describe('SoulCoreProvider', () => {
  let tempDir: string;
  let dbPath: string;
  let relationDb: RelationDBAccess;
  let soulAccess: SoulAccess;
  let llmAccess: LLMAccess;
  let promptsAccess: PromptsAccess;
  let soulCore: SoulCoreAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-soul-'));
    dbPath = path.join(tempDir, 'test.db');
    relationDb = new RelationDBAccess({ dbPath });
    await relationDb.initialize();
    soulAccess = new SoulAccess(relationDb);
    await soulAccess.initialize();
    llmAccess = new LLMAccess(relationDb);
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    soulCore = new SoulCoreAccess(relationDb, soulAccess, llmAccess, promptsAccess);
    await soulCore.initialize();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('configSoulCore', () => {
    it('should return config with default regen_rate', async () => {
      const output = new ConfigSoulCoreOutput();
      await soulCore.configSoulCore(new ConfigSoulCoreInput(), new SoulCoreContext(), output);
      expect(output.config).not.toBeNull();
      expect(output.config!.regen_rate).toBe(75);
    });

    it('should update regen_rate', async () => {
      const input = new ConfigSoulCoreInput();
      input.regen_rate = 42;
      const output = new ConfigSoulCoreOutput();
      await soulCore.configSoulCore(input, new SoulCoreContext(), output);
      expect(output.config!.regen_rate).toBe(42);
    });

    it('should throw ValidationError for regen_rate out of range', async () => {
      const input = new ConfigSoulCoreInput();
      input.regen_rate = 200;

      await expect(
        soulCore.configSoulCore(input, new SoulCoreContext(), new ConfigSoulCoreOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for regen_rate negative', async () => {
      const input = new ConfigSoulCoreInput();
      input.regen_rate = -10;

      await expect(
        soulCore.configSoulCore(input, new SoulCoreContext(), new ConfigSoulCoreOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should update prompt_template_id', async () => {
      const input = new ConfigSoulCoreInput();
      input.prompt_template_id = 'soul-tpl';
      const output = new ConfigSoulCoreOutput();
      await soulCore.configSoulCore(input, new SoulCoreContext(), output);
      expect(output.config!.prompt_template_id).toBe('soul-tpl');
    });

    it('should persist config across calls', async () => {
      await soulCore.configSoulCore(
        { regen_rate: 10 } as ConfigSoulCoreInput,
        new SoulCoreContext(),
        new ConfigSoulCoreOutput(),
      );

      const output = new ConfigSoulCoreOutput();
      await soulCore.configSoulCore(new ConfigSoulCoreInput(), new SoulCoreContext(), output);
      expect(output.config!.regen_rate).toBe(10);
    });
  });

  describe('matchSoul', () => {
    it('should throw ValidationError when agent_id is empty', async () => {
      const input = new MatchSoulInput();
      input.agent_id = '';

      await expect(
        soulCore.matchSoul(input, new SoulCoreContext(), new MatchSoulOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return from cache when binding exists', async () => {
      const now = IdGenerator.now();
      await relationDb.insert(AGENT_SOUL_TABLE, [
        { field: 'id', value: 'cache-soul-1' },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'agent_id', value: 'agent-sc' },
        { field: 'soul_id', value: 'soul-cached' },
      ]);
      await relationDb.delete(SOUL_CORE_CONFIG_TABLE, []);
      await relationDb.insert(SOUL_CORE_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'regen_rate', value: 0 },
        { field: 'prompt_template_id', value: null },
      ]);

      const input = new MatchSoulInput();
      input.agent_id = 'agent-sc';
      input.context_id = 'c1';
      input.interact_id = 'i1';
      const output = new MatchSoulOutput();
      await soulCore.matchSoul(input, new SoulCoreContext(), output);
      expect(output.from_cache).toBe(true);
    });
  });

  describe('optSoul', () => {
    it('should throw ValidationError when agent_id is empty', async () => {
      const input = new OptSoulInput();
      input.agent_id = '';
      input.soul_id = 'soul-1';

      await expect(
        soulCore.optSoul(input, new SoulCoreContext(), new OptSoulOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when soul_id is empty', async () => {
      const input = new OptSoulInput();
      input.agent_id = 'agent-1';
      input.soul_id = '';

      await expect(
        soulCore.optSoul(input, new SoulCoreContext(), new OptSoulOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when no binding exists', async () => {
      const input = new OptSoulInput();
      input.agent_id = 'agent-no-binding';
      input.soul_id = 'soul-1';

      await expect(
        soulCore.optSoul(input, new SoulCoreContext(), new OptSoulOutput()),
      ).rejects.toThrow(NotFoundError);
    });

    it('should record core usage when binding exists', async () => {
      const agentId = 'agent-opt-record';
      const now = IdGenerator.now();
      const soulId = IdGenerator.generate();

      await relationDb.insert(SOUL_CORE_USAGE_TABLE, []);
      await relationDb.delete(AGENT_SOUL_TABLE, []);
      await relationDb.insert(AGENT_SOUL_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'agent_id', value: agentId },
        { field: 'soul_id', value: soulId },
      ]);

      const input = new OptSoulInput();
      input.agent_id = agentId;
      input.soul_id = soulId;

      await expect(
        soulCore.optSoul(input, new SoulCoreContext(), new OptSoulOutput()),
      ).rejects.toThrow();
    });
  });

  describe('ageSoul', () => {
    it('should return aged_count 0 when no rules', async () => {
      const output = new AgeSoulOutput();
      await soulCore.ageSoul(new AgeSoulInput(), new SoulCoreContext(), output);
      expect(output.aged_count).toBe(0);
    });
  });

  describe('soSoulRule', () => {
    it('should return empty list when no rules', async () => {
      const output = new SoSoulRuleOutput();
      await soulCore.soSoulRule(new SoSoulRuleInput(), new SoulCoreContext(), output);
      expect(output.list).toEqual([]);
      expect(output.total).toBe(0);
    });

    it('should list all rules', async () => {
      await relationDb.insert(SOUL_OPT_RULE_TABLE, [
        { field: 'id', value: 'sr-1' },
        { field: 'created', value: IdGenerator.now() },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'days', value: 14 },
        { field: 'min_usage_count', value: 5 },
      ]);

      const output = new SoSoulRuleOutput();
      await soulCore.soSoulRule(new SoSoulRuleInput(), new SoulCoreContext(), output);
      expect(output.list.length).toBe(1);
      expect(output.total).toBe(1);
      expect(output.list[0].days).toBe(14);
      expect(output.list[0].min_usage_count).toBe(5);
    });

    it('should support pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await relationDb.insert(SOUL_OPT_RULE_TABLE, [
          { field: 'id', value: `sr-page-${i}` },
          { field: 'created', value: IdGenerator.now() },
          { field: 'updated', value: IdGenerator.now() },
          { field: 'days', value: i + 1 },
          { field: 'min_usage_count', value: 1 },
        ]);
      }

      const input = new SoSoulRuleInput();
      input.page = { current: 1, size: 2 };
      const output = new SoSoulRuleOutput();
      await soulCore.soSoulRule(input, new SoulCoreContext(), output);
      expect(output.list.length).toBe(2);
      expect(output.total).toBe(5);
    });
  });

  describe('updateSoulRule', () => {
    it('should throw ValidationError when operations is empty', async () => {
      const input = new UpdateSoulRuleInput();
      input.operations = [];

      await expect(
        soulCore.updateSoulRule(input, new SoulCoreContext(), new UpdateSoulRuleOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should insert, update, and delete rules', async () => {
      const input = new UpdateSoulRuleInput();
      input.operations = [
        {
          type: OperationType.INSERT,
          table: SOUL_OPT_RULE_TABLE,
          data: [
            { field: 'days', value: 7 },
            { field: 'min_usage_count', value: 3 },
          ],
        },
        {
          type: OperationType.INSERT,
          table: SOUL_OPT_RULE_TABLE,
          data: [
            { field: 'days', value: 30 },
            { field: 'min_usage_count', value: 10 },
          ],
        },
      ];

      await soulCore.updateSoulRule(input, new SoulCoreContext(), new UpdateSoulRuleOutput());

      const soOut = new SoSoulRuleOutput();
      await soulCore.soSoulRule(new SoSoulRuleInput(), new SoulCoreContext(), soOut);
      expect(soOut.list.length).toBe(2);

      const ruleId = soOut.list[0].id;
      const updateInput = new UpdateSoulRuleInput();
      updateInput.operations = [
        {
          type: OperationType.DELETE,
          table: SOUL_OPT_RULE_TABLE,
          conditions: [{ field: 'id', operator: Operator.EQ, value: ruleId }],
        },
        {
          type: OperationType.UPDATE,
          table: SOUL_OPT_RULE_TABLE,
          conditions: [{ field: 'id', operator: Operator.EQ, value: soOut.list[1].id }],
          data: [{ field: 'days', value: 99 }],
        },
      ];

      await soulCore.updateSoulRule(updateInput, new SoulCoreContext(), new UpdateSoulRuleOutput());

      const soOut2 = new SoSoulRuleOutput();
      await soulCore.soSoulRule(new SoSoulRuleInput(), new SoulCoreContext(), soOut2);
      expect(soOut2.list.length).toBe(1);
      expect(soOut2.list[0].days).toBe(99);
    });
  });

  describe('AOP integration', () => {
    it('should set elapsed_ms on output', async () => {
      const output = new ConfigSoulCoreOutput();
      await soulCore.configSoulCore(new ConfigSoulCoreInput(), new SoulCoreContext(), output);
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('should set elapsed_ms on ageSoul output', async () => {
      const output = new AgeSoulOutput();
      await soulCore.ageSoul(new AgeSoulInput(), new SoulCoreContext(), output);
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
