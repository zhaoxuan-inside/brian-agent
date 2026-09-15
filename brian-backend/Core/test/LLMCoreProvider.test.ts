import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  LLMAccess,
  PromptsAccess,
  Operator,
  IdGenerator,
} from '@brian-agent/base';
import {
  LLMCoreAccess,
  LLMCoreContext,
  MatchLLMInput,
  MatchLLMOutput,
  LimitLLMInput,
  LimitLLMOutput,
  CheckLLMQuotaInput,
  CheckLLMQuotaOutput,
  ConfigLLMCoreInput,
  ConfigLLMCoreOutput,
  RecordLLMUsageInput,
  RecordLLMUsageOutput,
  LLM_PROVIDER_QUOTA_TABLE,
  LLM_CORE_USAGE_TABLE,
  LLM_CORE_CONFIG_TABLE,
  AGENT_LLM_TABLE,
} from '../LLMCoreProvider';
import { ValidationError, NotFoundError } from '../shared/errors';

describe('LLMCoreProvider', () => {
  let tempDir: string;
  let dbPath: string;
  let relationDb: RelationDBAccess;
  let llmAccess: LLMAccess;
  let promptsAccess: PromptsAccess;
  let llmCore: LLMCoreAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-llm-'));
    dbPath = path.join(tempDir, 'test.db');
    relationDb = new RelationDBAccess({ dbPath });
    await relationDb.initialize();
    llmAccess = new LLMAccess(relationDb);
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    llmCore = new LLMCoreAccess(relationDb, llmAccess, promptsAccess);
    await llmCore.initialize();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('matchLLM', () => {
    it('should throw ValidationError when agent_id is empty', async () => {
      const input = new MatchLLMInput();
      input.agent_id = '';
      input.context_id = 'c1';
      input.run_id = 'i1';

      await expect(
        llmCore.matchLLM(input, new MatchLLMOutput(), new LLMCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return from cache when available and regen allows', async () => {
      const now = IdGenerator.now();
      await relationDb.insert('llm_available', [
        { field: 'id', value: 'llm-1' },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'llm_provider_id', value: 'provider-1' },
        { field: 'llm_title', value: 'agent-cached' },
        { field: 'llm_brief', value: 'brief' },
        { field: 'llm_type', value: 'CHAT' },
        { field: 'enable', value: 1 },
      ]);
      await relationDb.insert(AGENT_LLM_TABLE, [
        { field: 'id', value: 'cache-1' },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'agent_id', value: 'agent-cached' },
        { field: 'llm_id', value: 'llm-1' },
      ]);
      await relationDb.delete(LLM_CORE_CONFIG_TABLE, []);
      await relationDb.insert(LLM_CORE_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'regen_rate', value: 0 },
        { field: 'similarity_threshold', value: 0.0 },
        { field: 'prompt_template_id', value: null },
      ]);

      const input = new MatchLLMInput();
      input.agent_id = 'agent-cached';
      input.context_id = 'c1';
      input.run_id = 'i1';
      const output = new MatchLLMOutput();
      await llmCore.matchLLM(input, output, new LLMCoreContext());
      expect(output.from_cache).toBe(true);
    });

    it('绑定失效（LLM 已从 DB 删除）时清除缓存重新匹配，不返回合成记录', async () => {
      const now = IdGenerator.now();
      // 绑定指向 llm-gone，但 llm_available 中不存在该行（已被删除）：
      // 旧实现会返回合成记录 { id: 'llm-gone', llm_title: 'llm-gone', enable: true }，
      // 新实现先经 DB 校验，校验失败清除绑定并走第 2/3 层重新匹配。
      await relationDb.insert(AGENT_LLM_TABLE, [
        { field: 'id', value: 'cache-stale' },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'agent_id', value: 'agent-stale' },
        { field: 'llm_id', value: 'llm-gone' },
      ]);
      await relationDb.delete(LLM_CORE_CONFIG_TABLE, []);
      await relationDb.insert(LLM_CORE_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'regen_rate', value: 0 },
        { field: 'similarity_threshold', value: 0.0 },
        { field: 'prompt_template_id', value: null },
      ]);

      const input = new MatchLLMInput();
      input.agent_id = 'agent-stale';
      input.context_id = 'c1';
      input.run_id = 'i1';
      // 无可用 LLM 时重新匹配抛 NotFoundError（证明未走合成记录缓存返回）
      await expect(
        llmCore.matchLLM(input, new MatchLLMOutput(), new LLMCoreContext()),
      ).rejects.toThrow(NotFoundError);
      // 失效绑定缓存已被清理
      const rows = await relationDb.select(AGENT_LLM_TABLE, {
        conditions: [{ field: 'agent_id', operator: Operator.EQ, value: 'agent-stale' }],
      });
      expect(rows.length).toBe(0);
    });

    it('should throw NotFoundError when no LLMs available and not cached', async () => {
      const input = new MatchLLMInput();
      input.agent_id = 'agent-unknown';
      input.context_id = 'c1';
      input.run_id = 'i1';

      await expect(
        llmCore.matchLLM(input, new MatchLLMOutput(), new LLMCoreContext()),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('limitLLM', () => {
    it('should create quota for new provider', async () => {
      const input = new LimitLLMInput();
      input.llm_provider_id = 'provider-new';
      input.quota_tokens_per_day = 10000;
      const output = new LimitLLMOutput();

      await llmCore.limitLLM(input, output, new LLMCoreContext());
      expect(output.id).toBeTruthy();
    });

    it('should update existing provider quota', async () => {
      const input1 = new LimitLLMInput();
      input1.llm_provider_id = 'provider-update';
      input1.quota_tokens_per_day = 5000;
      const out1 = new LimitLLMOutput();
      await llmCore.limitLLM(input1, out1, new LLMCoreContext());

      const input2 = new LimitLLMInput();
      input2.llm_provider_id = 'provider-update';
      input2.quota_tokens_per_day = 10000;
      const out2 = new LimitLLMOutput();
      await llmCore.limitLLM(input2, out2, new LLMCoreContext());

      expect(out1.id).toBe(out2.id);
    });

    it('should throw ValidationError when llm_provider_id is empty', async () => {
      const input = new LimitLLMInput();
      input.llm_provider_id = '';

      await expect(
        llmCore.limitLLM(input, new LimitLLMOutput(), new LLMCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should set all quota fields with defaults', async () => {
      const input = new LimitLLMInput();
      input.llm_provider_id = 'provider-full';
      input.quota_tokens_per_day = 1000;
      input.quota_calls_per_month = 100;
      const output = new LimitLLMOutput();
      await llmCore.limitLLM(input, output, new LLMCoreContext());

      const checkInput = new CheckLLMQuotaInput();
      checkInput.llm_provider_id = 'provider-full';
      const checkOutput = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(checkInput, checkOutput, new LLMCoreContext());

      expect(checkOutput.quota.daily.limit).toBe(1000);
      expect(checkOutput.quota.monthly.limit).toBe(100);
    });
  });

  describe('checkLLMQuota', () => {
    it('should return zero usage for provider with no usage', async () => {
      await llmCore.limitLLM(
        { llm_provider_id: 'provider-empty' } as LimitLLMInput,
        new LimitLLMOutput(), new LLMCoreContext(),
      );

      const input = new CheckLLMQuotaInput();
      input.llm_provider_id = 'provider-empty';
      const output = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(input, output, new LLMCoreContext());

      expect(output.quota.daily.used).toBe(0);
      expect(output.quota.weekly.used).toBe(0);
      expect(output.quota.monthly.used).toBe(0);
    });

    it('should reflect usage from recordLLMUsage', async () => {
      await llmCore.limitLLM(
        { llm_provider_id: 'provider-with-usage', quota_tokens_per_day: 10000 } as LimitLLMInput,
        new LimitLLMOutput(), new LLMCoreContext(),
      );
      await llmCore.recordLLMUsage(
        { llm_provider_id: 'provider-with-usage', tokens_used: 500 } as RecordLLMUsageInput,
        new RecordLLMUsageOutput(), new LLMCoreContext(),
      );

      const input = new CheckLLMQuotaInput();
      input.llm_provider_id = 'provider-with-usage';
      const output = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(input, output, new LLMCoreContext());

      expect(output.quota.daily.used).toBeGreaterThan(0);
    });

    it('should throw ValidationError when llm_provider_id is empty', async () => {
      await expect(
        llmCore.checkLLMQuota(
          { llm_provider_id: '' } as CheckLLMQuotaInput,
          new CheckLLMQuotaOutput(), new LLMCoreContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should work for provider without quota record (unlimited)', async () => {
      const input = new CheckLLMQuotaInput();
      input.llm_provider_id = 'provider-no-quota';
      const output = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(input, output, new LLMCoreContext());

      expect(output.quota.daily.available).toBe(-1);
    });
  });

  describe('configLLMCore', () => {
    it('should return default config', async () => {
      const output = new ConfigLLMCoreOutput();
      await llmCore.configLLMCore(new ConfigLLMCoreInput(), output, new LLMCoreContext());
      expect(output.config).not.toBeNull();
      expect(output.config!.regen_rate).toBeGreaterThanOrEqual(0);
    });

    it('should throw ValidationError for regen_rate out of range', async () => {
      const input = new ConfigLLMCoreInput();
      input.regen_rate = 150;

      await expect(
        llmCore.configLLMCore(input, new ConfigLLMCoreOutput(), new LLMCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for regen_rate below 0', async () => {
      const input = new ConfigLLMCoreInput();
      input.regen_rate = -5;

      await expect(
        llmCore.configLLMCore(input, new ConfigLLMCoreOutput(), new LLMCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should update regen_rate', async () => {
      const input = new ConfigLLMCoreInput();
      input.regen_rate = 50;
      const output = new ConfigLLMCoreOutput();
      await llmCore.configLLMCore(input, output, new LLMCoreContext());
      expect(output.config!.regen_rate).toBe(50);
    });

    it('should reject invalid prompt_template_id', async () => {
      const input = new ConfigLLMCoreInput();
      input.prompt_template_id = IdGenerator.generate();

      await expect(
        llmCore.configLLMCore(input, new ConfigLLMCoreOutput(), new LLMCoreContext()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('recordLLMUsage', () => {
    it('should record usage and return id', async () => {
      const input = new RecordLLMUsageInput();
      input.llm_provider_id = 'provider-record';
      input.tokens_used = 100;
      const output = new RecordLLMUsageOutput();

      await llmCore.recordLLMUsage(input, output, new LLMCoreContext());
      expect(output.id).toBeTruthy();
    });

    it('should use default call_count of 1', async () => {
      await llmCore.recordLLMUsage(
        { llm_provider_id: 'provider-callcount', tokens_used: 50 } as RecordLLMUsageInput,
        new RecordLLMUsageOutput(), new LLMCoreContext(),
      );

      const quotaInput = new CheckLLMQuotaInput();
      quotaInput.llm_provider_id = 'provider-callcount';
      const quotaOutput = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(quotaInput, quotaOutput, new LLMCoreContext());

      expect(quotaOutput.quota.daily.used).toBeGreaterThanOrEqual(1);
    });

    it('should throw ValidationError when llm_provider_id is empty', async () => {
      await expect(
        llmCore.recordLLMUsage(
          { llm_provider_id: '', tokens_used: 100 } as RecordLLMUsageInput,
          new RecordLLMUsageOutput(), new LLMCoreContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should record multiple usages', async () => {
      const providerId = 'provider-multi-usage';
      for (let i = 0; i < 3; i++) {
        await llmCore.recordLLMUsage(
          { llm_provider_id: providerId, tokens_used: 10 } as RecordLLMUsageInput,
          new RecordLLMUsageOutput(), new LLMCoreContext(),
        );
      }

      const checkOutput = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(
        { llm_provider_id: providerId } as CheckLLMQuotaInput,
        checkOutput, new LLMCoreContext(),
      );
      // call_count contributions reflected in usage
      expect(checkOutput.quota.daily.used).toBeGreaterThan(0);
    });
  });

  describe('AOP integration', () => {
    it('should set elapsed_ms on output', async () => {
      const input = new RecordLLMUsageInput();
      input.llm_provider_id = 'provider-aop';
      input.tokens_used = 42;
      const output = new RecordLLMUsageOutput();
      await llmCore.recordLLMUsage(input, output, new LLMCoreContext());
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
