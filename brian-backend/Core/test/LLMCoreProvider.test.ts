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
      input.interact_id = 'i1';

      await expect(
        llmCore.matchLLM(input, new LLMCoreContext(), new MatchLLMOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return from cache when available and regen allows', async () => {
      const now = IdGenerator.now();
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
        { field: 'prompt_template_id', value: null },
      ]);

      const input = new MatchLLMInput();
      input.agent_id = 'agent-cached';
      input.context_id = 'c1';
      input.interact_id = 'i1';
      const output = new MatchLLMOutput();
      await llmCore.matchLLM(input, new LLMCoreContext(), output);
      expect(output.from_cache).toBe(true);
    });

    it('should throw NotFoundError when no LLMs available and not cached', async () => {
      const input = new MatchLLMInput();
      input.agent_id = 'agent-unknown';
      input.context_id = 'c1';
      input.interact_id = 'i1';

      await expect(
        llmCore.matchLLM(input, new LLMCoreContext(), new MatchLLMOutput()),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('limitLLM', () => {
    it('should create quota for new provider', async () => {
      const input = new LimitLLMInput();
      input.llm_provider_id = 'provider-new';
      input.quota_tokens_per_day = 10000;
      const output = new LimitLLMOutput();

      await llmCore.limitLLM(input, new LLMCoreContext(), output);
      expect(output.id).toBeTruthy();
    });

    it('should update existing provider quota', async () => {
      const input1 = new LimitLLMInput();
      input1.llm_provider_id = 'provider-update';
      input1.quota_tokens_per_day = 5000;
      const out1 = new LimitLLMOutput();
      await llmCore.limitLLM(input1, new LLMCoreContext(), out1);

      const input2 = new LimitLLMInput();
      input2.llm_provider_id = 'provider-update';
      input2.quota_tokens_per_day = 10000;
      const out2 = new LimitLLMOutput();
      await llmCore.limitLLM(input2, new LLMCoreContext(), out2);

      expect(out1.id).toBe(out2.id);
    });

    it('should throw ValidationError when llm_provider_id is empty', async () => {
      const input = new LimitLLMInput();
      input.llm_provider_id = '';

      await expect(
        llmCore.limitLLM(input, new LLMCoreContext(), new LimitLLMOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should set all quota fields with defaults', async () => {
      const input = new LimitLLMInput();
      input.llm_provider_id = 'provider-full';
      input.quota_tokens_per_day = 1000;
      input.quota_calls_per_month = 100;
      const output = new LimitLLMOutput();
      await llmCore.limitLLM(input, new LLMCoreContext(), output);

      const checkInput = new CheckLLMQuotaInput();
      checkInput.llm_provider_id = 'provider-full';
      const checkOutput = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(checkInput, new LLMCoreContext(), checkOutput);

      expect(checkOutput.quota.daily.limit).toBe(1000);
      expect(checkOutput.quota.monthly.limit).toBe(100);
    });
  });

  describe('checkLLMQuota', () => {
    it('should return zero usage for provider with no usage', async () => {
      await llmCore.limitLLM(
        { llm_provider_id: 'provider-empty' } as LimitLLMInput,
        new LLMCoreContext(),
        new LimitLLMOutput(),
      );

      const input = new CheckLLMQuotaInput();
      input.llm_provider_id = 'provider-empty';
      const output = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(input, new LLMCoreContext(), output);

      expect(output.quota.daily.used).toBe(0);
      expect(output.quota.weekly.used).toBe(0);
      expect(output.quota.monthly.used).toBe(0);
    });

    it('should reflect usage from recordLLMUsage', async () => {
      await llmCore.limitLLM(
        { llm_provider_id: 'provider-with-usage', quota_tokens_per_day: 10000 } as LimitLLMInput,
        new LLMCoreContext(),
        new LimitLLMOutput(),
      );
      await llmCore.recordLLMUsage(
        { llm_provider_id: 'provider-with-usage', tokens_used: 500 } as RecordLLMUsageInput,
        new LLMCoreContext(),
        new RecordLLMUsageOutput(),
      );

      const input = new CheckLLMQuotaInput();
      input.llm_provider_id = 'provider-with-usage';
      const output = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(input, new LLMCoreContext(), output);

      expect(output.quota.daily.used).toBeGreaterThan(0);
    });

    it('should throw ValidationError when llm_provider_id is empty', async () => {
      await expect(
        llmCore.checkLLMQuota(
          { llm_provider_id: '' } as CheckLLMQuotaInput,
          new LLMCoreContext(),
          new CheckLLMQuotaOutput(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should work for provider without quota record (unlimited)', async () => {
      const input = new CheckLLMQuotaInput();
      input.llm_provider_id = 'provider-no-quota';
      const output = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(input, new LLMCoreContext(), output);

      expect(output.quota.daily.available).toBe(-1);
    });
  });

  describe('configLLMCore', () => {
    it('should return default config', async () => {
      const output = new ConfigLLMCoreOutput();
      await llmCore.configLLMCore(new ConfigLLMCoreInput(), new LLMCoreContext(), output);
      expect(output.config).not.toBeNull();
      expect(output.config!.regen_rate).toBeGreaterThanOrEqual(0);
    });

    it('should throw ValidationError for regen_rate out of range', async () => {
      const input = new ConfigLLMCoreInput();
      input.regen_rate = 150;

      await expect(
        llmCore.configLLMCore(input, new LLMCoreContext(), new ConfigLLMCoreOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for regen_rate below 0', async () => {
      const input = new ConfigLLMCoreInput();
      input.regen_rate = -5;

      await expect(
        llmCore.configLLMCore(input, new LLMCoreContext(), new ConfigLLMCoreOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should update regen_rate', async () => {
      const input = new ConfigLLMCoreInput();
      input.regen_rate = 50;
      const output = new ConfigLLMCoreOutput();
      await llmCore.configLLMCore(input, new LLMCoreContext(), output);
      expect(output.config!.regen_rate).toBe(50);
    });

    it('should reject invalid prompt_template_id', async () => {
      const input = new ConfigLLMCoreInput();
      input.prompt_template_id = 'nonexistent-template';

      await expect(
        llmCore.configLLMCore(input, new LLMCoreContext(), new ConfigLLMCoreOutput()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('recordLLMUsage', () => {
    it('should record usage and return id', async () => {
      const input = new RecordLLMUsageInput();
      input.llm_provider_id = 'provider-record';
      input.tokens_used = 100;
      const output = new RecordLLMUsageOutput();

      await llmCore.recordLLMUsage(input, new LLMCoreContext(), output);
      expect(output.id).toBeTruthy();
    });

    it('should use default call_count of 1', async () => {
      await llmCore.recordLLMUsage(
        { llm_provider_id: 'provider-callcount', tokens_used: 50 } as RecordLLMUsageInput,
        new LLMCoreContext(),
        new RecordLLMUsageOutput(),
      );

      const quotaInput = new CheckLLMQuotaInput();
      quotaInput.llm_provider_id = 'provider-callcount';
      const quotaOutput = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(quotaInput, new LLMCoreContext(), quotaOutput);

      expect(quotaOutput.quota.daily.used).toBeGreaterThanOrEqual(1);
    });

    it('should throw ValidationError when llm_provider_id is empty', async () => {
      await expect(
        llmCore.recordLLMUsage(
          { llm_provider_id: '', tokens_used: 100 } as RecordLLMUsageInput,
          new LLMCoreContext(),
          new RecordLLMUsageOutput(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should record multiple usages', async () => {
      const providerId = 'provider-multi-usage';
      for (let i = 0; i < 3; i++) {
        await llmCore.recordLLMUsage(
          { llm_provider_id: providerId, tokens_used: 10 } as RecordLLMUsageInput,
          new LLMCoreContext(),
          new RecordLLMUsageOutput(),
        );
      }

      const checkOutput = new CheckLLMQuotaOutput();
      await llmCore.checkLLMQuota(
        { llm_provider_id: providerId } as CheckLLMQuotaInput,
        new LLMCoreContext(),
        checkOutput,
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
      await llmCore.recordLLMUsage(input, new LLMCoreContext(), output);
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
