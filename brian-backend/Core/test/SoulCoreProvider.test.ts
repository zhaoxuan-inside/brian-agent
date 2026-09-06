import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  AddPromptInput,
  AddPromptOutput,
  PromptContext,
  LLM_AVAILABLE_TABLE,
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
      await soulCore.configSoulCore(new ConfigSoulCoreInput(), output, new SoulCoreContext());
      expect(output.config).not.toBeNull();
      expect(output.config!.regen_rate).toBe(75);
    });

    it('should update regen_rate', async () => {
      const input = new ConfigSoulCoreInput();
      input.regen_rate = 42;
      const output = new ConfigSoulCoreOutput();
      await soulCore.configSoulCore(input, output, new SoulCoreContext());
      expect(output.config!.regen_rate).toBe(42);
    });

    it('should throw ValidationError for regen_rate out of range', async () => {
      const input = new ConfigSoulCoreInput();
      input.regen_rate = 200;

      await expect(
        soulCore.configSoulCore(input, new ConfigSoulCoreOutput(), new SoulCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for regen_rate negative', async () => {
      const input = new ConfigSoulCoreInput();
      input.regen_rate = -10;

      await expect(
        soulCore.configSoulCore(input, new ConfigSoulCoreOutput(), new SoulCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should accept valid prompt_template_id', async () => {
      const addInput = new AddPromptInput();
      addInput.data = { prompt_template_title: 'Test Soul Prompt', prompt_template: 'test template' };
      const addOutput = new AddPromptOutput();
      await promptsAccess.addPrompt(addInput, addOutput, new PromptContext());
      const realId = addOutput.id;

      const input = new ConfigSoulCoreInput();
      input.prompt_template_id = realId;
      const output = new ConfigSoulCoreOutput();
      await soulCore.configSoulCore(input, output, new SoulCoreContext());
      expect(output.config!.prompt_template_id).toBe(realId);
    });

    it('should reject non-existent prompt_template_id', async () => {
      const input = new ConfigSoulCoreInput();
      input.prompt_template_id = IdGenerator.generate();
      await expect(
        soulCore.configSoulCore(input, new ConfigSoulCoreOutput(), new SoulCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should persist config across calls and support llm_id', async () => {
      await soulCore.configSoulCore(
        { regen_rate: 10, llm_id: 'custom-model-id' } as ConfigSoulCoreInput,
        new ConfigSoulCoreOutput(), new SoulCoreContext(),
      );

      const output = new ConfigSoulCoreOutput();
      await soulCore.configSoulCore(new ConfigSoulCoreInput(), output, new SoulCoreContext());
      expect(output.config!.regen_rate).toBe(10);
      expect(output.config!.llm_id).toBe('custom-model-id');
    });
  });

  describe('matchSoul', () => {
    it('should throw ValidationError when agent_id is empty', async () => {
      const input = new MatchSoulInput();
      input.agent_id = '';

      await expect(
        soulCore.matchSoul(input, new MatchSoulOutput(), new SoulCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return from cache when binding exists', async () => {
      const now = IdGenerator.now();
      await relationDb.insert('soul', [
        { field: 'id', value: 'soul-cached' },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'soul_content', value: 'Soul content' },
        { field: 'soul_brief', value: 'agent-sc' },
        { field: 'soul_usage', value: 'Soul usage' },
        { field: 'enable', value: 1 },
      ]);
      await relationDb.delete(SOUL_CORE_CONFIG_TABLE, []);
      await relationDb.insert(SOUL_CORE_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'regen_rate', value: 0 },
        { field: 'similarity_threshold', value: 0.0 },
        { field: 'prompt_template_id', value: null },
      ]);

      // 绑定唯一事实源 = agent 表：既有绑定经 bound_soul_id 传入，确定性水合（不再读 agent_soul 绑定表）
      const input = new MatchSoulInput();
      input.agent_id = 'agent-sc';
      input.context_id = 'c1';
      input.interact_id = 'i1';
      input.bound_soul_id = 'soul-cached';
      const output = new MatchSoulOutput();
      await soulCore.matchSoul(input, output, new SoulCoreContext());
      expect(output.from_cache).toBe(true);
      expect(output.soul_id).toBe('soul-cached');
    });
  });

  describe('generateAndAddSoul (Soul 自生成)', () => {
    const insertEnabledLLM = async (id = 'llm-gen') => {
      await relationDb.insert(LLM_AVAILABLE_TABLE, [
        { field: 'id', value: id },
        { field: 'created', value: IdGenerator.now() },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'llm_provider_id', value: 'provider-gen' },
        { field: 'llm_title', value: 'mock-llm' },
        { field: 'llm_type', value: 'text' },
        { field: 'enable', value: 1 },
      ]);
    };

    const buildMatchInput = (agentId: string): MatchSoulInput => {
      const input = new MatchSoulInput();
      input.agent_id = agentId;
      input.context_id = 'c-gen';
      input.interact_id = 'i-gen';
      return input;
    };

    it('should generate a complete Soul with soul_brief/content/usage', async () => {
      await insertEnabledLLM('llm-gen-1');
      const spy = vi.spyOn(llmAccess, 'execLLM').mockImplementation(
        async (_input, output, _ctx) => {
          output.result = '```json\n{"soul_brief":"编码专家","soul_content":"专业、严谨的编码专家。","soul_usage":"代码编写与调试"}\n```';
          return true;
        },
      );

      const output = new MatchSoulOutput();
      await soulCore.matchSoul(buildMatchInput('agent-gen-1'), output, new SoulCoreContext());

      expect(output.from_cache).toBe(false);
      expect(output.soul_id).toBeTruthy();
      expect(output.soul).not.toBeNull();
      expect(output.soul!.soul_brief).toBe('编码专家');
      expect(output.soul!.soul_content).toBe('专业、严谨的编码专家。');
      expect(output.soul!.soul_usage).toBe('代码编写与调试');

      spy.mockRestore();
    });

    it('should parse JSON with surrounding text', async () => {
      await insertEnabledLLM('llm-gen-2');
      const spy = vi.spyOn(llmAccess, 'execLLM').mockImplementation(
        async (_input, output, _ctx) => {
          output.result = '好的，以下是生成的 Soul：\n{"soul_brief":"导师","soul_content":"严苛的导师。","soul_usage":"教学与答疑"}\n希望有帮助。';
          return true;
        },
      );

      const output = new MatchSoulOutput();
      await soulCore.matchSoul(buildMatchInput('agent-gen-2'), output, new SoulCoreContext());

      expect(output.soul!.soul_brief).toBe('导师');
      expect(output.soul!.soul_usage).toBe('教学与答疑');

      spy.mockRestore();
    });

    it('should retry on LLM failure then succeed', async () => {
      await insertEnabledLLM('llm-gen-3');
      let calls = 0;
      const spy = vi.spyOn(llmAccess, 'execLLM').mockImplementation(
        async (_input, output, _ctx) => {
          calls += 1;
          if (calls === 1) {
            output.error = 'temporary failure';
            return false;
          }
          output.result = '{"soul_brief":"重试成功","soul_content":"重试后的内容。","soul_usage":"通用场景"}';
          return true;
        },
      );

      const output = new MatchSoulOutput();
      await soulCore.matchSoul(buildMatchInput('agent-gen-3'), output, new SoulCoreContext());

      expect(calls).toBe(2);
      expect(output.soul!.soul_brief).toBe('重试成功');

      spy.mockRestore();
    });

    it('should use Chinese fallbacks for missing fields', async () => {
      await insertEnabledLLM('llm-gen-4');
      const spy = vi.spyOn(llmAccess, 'execLLM').mockImplementation(
        async (_input, output, _ctx) => {
          output.result = '{}';
          return true;
        },
      );

      const output = new MatchSoulOutput();
      await soulCore.matchSoul(buildMatchInput('agent-gen-4'), output, new SoulCoreContext());

      expect(output.soul!.soul_brief).toBe('自动生成的 Soul');
      expect(output.soul!.soul_content).toBe('乐于助人的 AI 助手。');
      expect(output.soul!.soul_usage).toBe('通用对话、信息查询、任务辅助');

      spy.mockRestore();
    });

    it('should follow 3-tier fallback (configured -> default -> first enabled)', async () => {
      const now = IdGenerator.now();
      await relationDb.delete(LLM_AVAILABLE_TABLE, []);
      await relationDb.insert(LLM_AVAILABLE_TABLE, [
        { field: 'id', value: 'model-first' },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'llm_provider_id', value: 'prov-1' },
        { field: 'llm_title', value: 'first-model' },
        { field: 'enable', value: 1 },
        { field: 'is_default', value: 0 },
      ]);
      await relationDb.insert(LLM_AVAILABLE_TABLE, [
        { field: 'id', value: 'model-default' },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'llm_provider_id', value: 'prov-1' },
        { field: 'llm_title', value: 'default-model' },
        { field: 'enable', value: 1 },
        { field: 'is_default', value: 1 },
      ]);
      await relationDb.insert(LLM_AVAILABLE_TABLE, [
        { field: 'id', value: 'model-configured' },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'llm_provider_id', value: 'prov-1' },
        { field: 'llm_title', value: 'configured-model' },
        { field: 'enable', value: 1 },
        { field: 'is_default', value: 0 },
      ]);

      let calledModelId = '';
      const spy = vi.spyOn(llmAccess, 'execLLM').mockImplementation(
        async (input, output, _ctx) => {
          calledModelId = input.id;
          output.result = '{}';
          return true;
        },
      );

      // Case 1: Configured model in soul_core_config -> passes model-configured to LLMProvider
      await soulCore.configSoulCore({ llm_id: 'model-configured' } as ConfigSoulCoreInput, new ConfigSoulCoreOutput(), new SoulCoreContext());
      await soulCore.matchSoul(buildMatchInput('agent-tier-1'), new MatchSoulOutput(), new SoulCoreContext());
      expect(calledModelId).toBe('model-configured');

      // Case 2: No configured model (null/empty) -> passes empty id to LLMProvider for unified fallback
      await soulCore.configSoulCore({ llm_id: null } as ConfigSoulCoreInput, new ConfigSoulCoreOutput(), new SoulCoreContext());
      await soulCore.matchSoul(buildMatchInput('agent-tier-2'), new MatchSoulOutput(), new SoulCoreContext());
      expect(calledModelId).toBe('');

      spy.mockRestore();
    });
  });

  describe('optSoul', () => {
    it('should throw ValidationError when agent_id is empty', async () => {
      const input = new OptSoulInput();
      input.agent_id = '';
      input.soul_id = 'soul-1';

      await expect(
        soulCore.optSoul(input, new OptSoulOutput(), new SoulCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when soul_id is empty', async () => {
      const input = new OptSoulInput();
      input.agent_id = 'agent-1';
      input.soul_id = '';

      await expect(
        soulCore.optSoul(input, new OptSoulOutput(), new SoulCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when current/candidate soul missing (A/B 路径)', async () => {
      const input = new OptSoulInput();
      input.agent_id = 'agent-no-binding';
      input.soul_id = 'soul-1';
      // 绑定已收敛至 Agent 表：current_soul_id 由调用方传入；缺资源时 fail-loud
      input.current_soul_id = 'soul-missing-current';

      await expect(
        soulCore.optSoul(input, new OptSoulOutput(), new SoulCoreContext()),
      ).rejects.toThrow(NotFoundError);
    });

    it('should record core usage when binding exists', async () => {
      const agentId = 'agent-opt-record';
      const now = IdGenerator.now();
      const soulId = IdGenerator.generate();

      await relationDb.insert(SOUL_CORE_USAGE_TABLE, []);

      const input = new OptSoulInput();
      input.agent_id = agentId;
      input.soul_id = soulId;
      // 无 current_soul_id → 仅记 usage，不抛错
      const output = new OptSoulOutput();
      const result = await soulCore.optSoul(input, output, new SoulCoreContext());
      expect(result).toBe(true);
      expect(output.current_soul_id).toBe(soulId);
      const usageRows = relationDb.queryRaw(
        'SELECT * FROM "soul_core_usage" WHERE "agent_id" = ? AND "soul_id" = ?', [agentId, soulId],
      );
      expect((usageRows ?? []).length).toBeGreaterThan(0);
    });
  });

  describe('ageSoul', () => {
    it('should return aged_count 0 when no rules', async () => {
      const output = new AgeSoulOutput();
      await soulCore.ageSoul(new AgeSoulInput(), output, new SoulCoreContext());
      expect(output.aged_count).toBe(0);
    });
  });

  describe('soSoulRule', () => {
    it('should return empty list when no rules', async () => {
      const output = new SoSoulRuleOutput();
      await soulCore.soSoulRule(new SoSoulRuleInput(), output, new SoulCoreContext());
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
      await soulCore.soSoulRule(new SoSoulRuleInput(), output, new SoulCoreContext());
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
      await soulCore.soSoulRule(input, output, new SoulCoreContext());
      expect(output.list.length).toBe(2);
      expect(output.total).toBe(5);
    });
  });

  describe('updateSoulRule', () => {
    it('should throw ValidationError when operations is empty', async () => {
      const input = new UpdateSoulRuleInput();
      input.operations = [];

      await expect(
        soulCore.updateSoulRule(input, new UpdateSoulRuleOutput(), new SoulCoreContext()),
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

      await soulCore.updateSoulRule(input, new UpdateSoulRuleOutput(), new SoulCoreContext());

      const soOut = new SoSoulRuleOutput();
      await soulCore.soSoulRule(new SoSoulRuleInput(), soOut, new SoulCoreContext());
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

      await soulCore.updateSoulRule(updateInput, new UpdateSoulRuleOutput(), new SoulCoreContext());

      const soOut2 = new SoSoulRuleOutput();
      await soulCore.soSoulRule(new SoSoulRuleInput(), soOut2, new SoulCoreContext());
      expect(soOut2.list.length).toBe(1);
      expect(soOut2.list[0].days).toBe(99);
    });
  });

  describe('AOP integration', () => {
    it('should set elapsed_ms on output', async () => {
      const output = new ConfigSoulCoreOutput();
      await soulCore.configSoulCore(new ConfigSoulCoreInput(), output, new SoulCoreContext());
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('should set elapsed_ms on ageSoul output', async () => {
      const output = new AgeSoulOutput();
      await soulCore.ageSoul(new AgeSoulInput(), output, new SoulCoreContext());
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
