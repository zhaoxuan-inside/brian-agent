import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RelationDBAccess, ValidationError, Operator } from '@brian-agent/base';
import { UserProfileService } from '../UserProfile/application/UserProfileService';
import { UserProfileSchemaInitializer } from '../UserProfile/infrastructure/UserProfileSchemaInitializer';
import {
  UserProfileContext, ConfigProfileDirectionInput, ConfigProfileDirectionOutput,
  GetProfileDirectionInput, GetProfileDirectionOutput, GetUserProfileInput,
  GetUserProfileOutput, GenerateProfileInput, GenerateProfileOutput,
  SaveUserPreferenceInput, SaveUserPreferenceOutput, GetProfileHistoryInput,
  GetProfileHistoryOutput, GetProfileByVersionInput, GetProfileByVersionOutput,
  ConfigUserProfileInput, ConfigUserProfileOutput,
} from '../UserProfile/domain/types';
import { setupRealTestEnvironment, cleanupTempDirs } from './real-test-helpers';
import type { RealTestContext } from './real-test-helpers';

function ctx(): UserProfileContext { return new UserProfileContext(); }

describe('UserProfileService', () => {
  let testCtx: RealTestContext;
  let db: RelationDBAccess;
  let writerAgent: RealTestContext['writerAgent'];
  let evolutorAgent: RealTestContext['evolutorAgent'];
  let infoCore: RealTestContext['infoCore'];
  let llmCore: RealTestContext['llmCore'];
  let llmAccess: RealTestContext['llmAccess'];
  let promptsAccess: RealTestContext['promptsAccess'];
  let service: UserProfileService;

  beforeEach(async () => {
    testCtx = await setupRealTestEnvironment();
    db = testCtx.relationDb;
    writerAgent = testCtx.writerAgent;
    evolutorAgent = testCtx.evolutorAgent;
    infoCore = testCtx.infoCore;
    llmCore = testCtx.llmCore;
    llmAccess = testCtx.llmAccess;
    promptsAccess = testCtx.promptsAccess;

    await new UserProfileSchemaInitializer(db).init();

    service = new UserProfileService(
      db, writerAgent, evolutorAgent, infoCore, llmCore, llmAccess, promptsAccess,
    );
  });

  afterEach(() => {
    cleanupTempDirs();
    vi.restoreAllMocks();
  });

  // =====================================================================
  // configProfileDirection
  // =====================================================================

  describe('configProfileDirection', () => {
    it('TC-UP-001: Config single direction → returns true, DB has record', async () => {
      const input = new ConfigProfileDirectionInput();
      input.directions = [
        { direction_key: 'test_dir', direction_name: 'Test Direction', weight: 50, enable: true },
      ];
      const output = new ConfigProfileDirectionOutput();

      const result = await service.configProfileDirection(input, ctx(), output);
      expect(result).toBe(true);

      const record = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: 'test_dir' },
      ]);
      expect(record).toBeTruthy();
      expect(record.direction_name).toBe('Test Direction');
      expect(record.weight).toBe(50);
      expect(record.enable).toBe(1);
      expect(record.direction_description).toBe('');
    });

    it('TC-UP-002: Batch config multiple directions', async () => {
      const input = new ConfigProfileDirectionInput();
      input.directions = [
        { direction_key: 'dir_1', direction_name: 'Direction 1', weight: 10, enable: true },
        { direction_key: 'dir_2', direction_name: 'Direction 2', weight: 20, enable: true },
        { direction_key: 'dir_3', direction_name: 'Direction 3', weight: 30, enable: false },
      ];
      const output = new ConfigProfileDirectionOutput();

      const result = await service.configProfileDirection(input, ctx(), output);
      expect(result).toBe(true);

      const record1 = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: 'dir_1' },
      ]);
      const record2 = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: 'dir_2' },
      ]);
      const record3 = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: 'dir_3' },
      ]);
      expect(record1).toBeTruthy();
      expect(record2).toBeTruthy();
      expect(record3).toBeTruthy();
      expect(record1.weight).toBe(10);
      expect(record2.weight).toBe(20);
      expect(record3.weight).toBe(30);
    });

    it('TC-UP-003: Upsert existing direction → updates', async () => {
      const input1 = new ConfigProfileDirectionInput();
      input1.directions = [
        { direction_key: 'upsert_test', direction_name: 'Original', weight: 30, enable: true },
      ];
      await service.configProfileDirection(input1, ctx(), new ConfigProfileDirectionOutput());

      const input2 = new ConfigProfileDirectionInput();
      input2.directions = [
        { direction_key: 'upsert_test', direction_name: 'Updated Name', weight: 80, enable: false },
      ];
      await service.configProfileDirection(input2, ctx(), new ConfigProfileDirectionOutput());

      const record = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: 'upsert_test' },
      ]);
      expect(record.direction_name).toBe('Updated Name');
      expect(record.weight).toBe(80);
      expect(record.enable).toBe(0);
    });

    it('TC-UP-004: All fields including direction_key/name/description/weight/enable', async () => {
      const input = new ConfigProfileDirectionInput();
      input.directions = [{
        direction_key: 'full_dir',
        direction_name: 'Full Direction',
        direction_description: 'A complete description',
        weight: 75,
        enable: true,
      }];
      await service.configProfileDirection(input, ctx(), new ConfigProfileDirectionOutput());

      const record = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: 'full_dir' },
      ]);
      expect(record.direction_key).toBe('full_dir');
      expect(record.direction_name).toBe('Full Direction');
      expect(record.direction_description).toBe('A complete description');
      expect(record.weight).toBe(75);
      expect(record.enable).toBe(1);
      expect(record.id).toBeTruthy();
      expect(record.created).toBeTruthy();
      expect(record.updated).toBeTruthy();
    });

    it('TC-UP-005: weight=0 → accepted', async () => {
      const input = new ConfigProfileDirectionInput();
      input.directions = [
        { direction_key: 'weight_zero', direction_name: 'Zero Weight', weight: 0, enable: true },
      ];
      await service.configProfileDirection(input, ctx(), new ConfigProfileDirectionOutput());

      const record = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: 'weight_zero' },
      ]);
      expect(record.weight).toBe(0);
    });

    it('TC-UP-006: weight=100 → accepted', async () => {
      const input = new ConfigProfileDirectionInput();
      input.directions = [
        { direction_key: 'weight_100', direction_name: 'Weight 100', weight: 100, enable: true },
      ];
      await service.configProfileDirection(input, ctx(), new ConfigProfileDirectionOutput());

      const record = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: 'weight_100' },
      ]);
      expect(record.weight).toBe(100);
    });

    it('TC-UP-007: enable=false → stored correctly', async () => {
      const input = new ConfigProfileDirectionInput();
      input.directions = [
        { direction_key: 'disabled_dir', direction_name: 'Disabled', weight: 10, enable: false },
      ];
      await service.configProfileDirection(input, ctx(), new ConfigProfileDirectionOutput());

      const record = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: 'disabled_dir' },
      ]);
      expect(record.enable).toBe(0);
    });

    it('TC-UP-008: direction_key empty → accepted by service, DB enforces uniqueness', async () => {
      const input = new ConfigProfileDirectionInput();
      input.directions = [
        { direction_key: '', direction_name: 'Empty Key', weight: 10, enable: true },
      ];
      const output = new ConfigProfileDirectionOutput();

      const result = await service.configProfileDirection(input, ctx(), output);
      expect(result).toBe(true);

      const record = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: '' },
      ]);
      expect(record).toBeTruthy();
    });

    it('TC-UP-009: weight > 100 → accepted and stored', async () => {
      const input = new ConfigProfileDirectionInput();
      input.directions = [
        { direction_key: 'high_weight', direction_name: 'High Weight', weight: 150, enable: true },
      ];
      const result = await service.configProfileDirection(input, ctx(), new ConfigProfileDirectionOutput());
      expect(result).toBe(true);

      const record = await db.selectOne('user_profile_direction', [
        { field: 'direction_key', operator: Operator.EQ, value: 'high_weight' },
      ]);
      expect(record.weight).toBe(150);
    });

    it('TC-UP-010: Empty directions array → handled gracefully', async () => {
      const input = new ConfigProfileDirectionInput();
      input.directions = [];
      const output = new ConfigProfileDirectionOutput();

      const result = await service.configProfileDirection(input, ctx(), output);
      expect(result).toBe(true);

      const builtinRecords = await db.select('user_profile_direction', { conditions: [] });
      expect(builtinRecords.length).toBe(5);
    });

    it('TC-UP-011: Missing direction_key → DB rejects undefined key', async () => {
      const input = new ConfigProfileDirectionInput();
      input.directions = [{ direction_name: 'No Key', weight: 10, enable: true } as any];
      const output = new ConfigProfileDirectionOutput();

      await expect(service.configProfileDirection(input, ctx(), output)).rejects.toThrow();
    });
  });

  // =====================================================================
  // getProfileDirection
  // =====================================================================

  describe('getProfileDirection', () => {
    it('TC-UP-015: Get all directions → returns dimensions list', async () => {
      const input1 = new ConfigProfileDirectionInput();
      input1.directions = [
        { direction_key: 'custom_dir', direction_name: 'Custom Dir', weight: 50, enable: true },
      ];
      await service.configProfileDirection(input1, ctx(), new ConfigProfileDirectionOutput());

      const input = new GetProfileDirectionInput();
      const output = new GetProfileDirectionOutput();
      const result = await service.getProfileDirection(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.directions.length).toBe(6);
      expect(output.directions[0].direction_key).toBeDefined();
    });

    it('TC-UP-016: No config → returns builtin defaults or empty', async () => {
      const input = new GetProfileDirectionInput();
      const output = new GetProfileDirectionOutput();
      const result = await service.getProfileDirection(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.directions.length).toBe(5);
    });

    it('TC-UP-017: Builtin dimensions exist (5 built-in)', async () => {
      const input = new GetProfileDirectionInput();
      const output = new GetProfileDirectionOutput();
      await service.getProfileDirection(input, ctx(), output);

      const keys = output.directions.map((d: Record<string, unknown>) => d.direction_key);
      expect(keys).toContain('language_preference');
      expect(keys).toContain('reply_style');
      expect(keys).toContain('knowledge_interest');
      expect(keys).toContain('interaction_habit');
      expect(keys).toContain('feedback_sensitivity');
    });

    it('TC-UP-018: Default weights correct', async () => {
      const input = new GetProfileDirectionInput();
      const output = new GetProfileDirectionOutput();
      await service.getProfileDirection(input, ctx(), output);

      const weights: Record<string, number> = {};
      for (const d of output.directions) {
        weights[String(d.direction_key)] = Number(d.weight);
      }
      expect(weights.language_preference).toBe(20);
      expect(weights.reply_style).toBe(25);
      expect(weights.knowledge_interest).toBe(30);
      expect(weights.interaction_habit).toBe(15);
      expect(weights.feedback_sensitivity).toBe(10);
    });
  });

  // =====================================================================
  // getUserProfile
  // =====================================================================

  describe('getUserProfile', () => {
    it('TC-UP-025: Get global profile → returns complete profile data', async () => {
      const input = new GetUserProfileInput();
      const output = new GetUserProfileOutput();
      const result = await service.getUserProfile(input, ctx(), output);

      expect(result).toBe(true);
      expect(output.session_id).toBeUndefined();
      expect(output.profile_version).toBe(0);
      expect(typeof output.generated_at).toBe('number');
      expect(typeof output.dimensions).toBe('object');
      expect(Object.keys(output.dimensions).length).toBeGreaterThanOrEqual(1);
      expect(output.profile_summary).toBeTruthy();
    });

    it('TC-UP-026: By session_id', async () => {
      const input = new GetUserProfileInput();
      input.session_id = 'test-session-001';
      const output = new GetUserProfileOutput();
      await service.getUserProfile(input, ctx(), output);

      expect(output.session_id).toBe('test-session-001');
    });

    it('TC-UP-027: By version (version field on input is accepted)', async () => {
      const input = new GetUserProfileInput();
      input.version = 2;
      const output = new GetUserProfileOutput();
      const result = await service.getUserProfile(input, ctx(), output);

      expect(result).toBe(true);
    });

    it('TC-UP-028: language_preference dimension', async () => {
      const input = new GetUserProfileInput();
      input.session_id = 'test-session-028';
      const output = new GetUserProfileOutput();
      await service.getUserProfile(input, ctx(), output);

      const lp = output.dimensions.language_preference as Record<string, unknown>;
      expect(lp).toBeDefined();
      expect(lp.value).toBe('zh-CN');
      expect(typeof lp.confidence).toBe('number');
      expect(Array.isArray(lp.evidence)).toBe(true);
    });

    it('TC-UP-029: reply_style dimension', async () => {
      const input = new GetUserProfileInput();
      input.session_id = 'test-session-029';
      const output = new GetUserProfileOutput();
      await service.getUserProfile(input, ctx(), output);

      const rs = output.dimensions.reply_style as Record<string, unknown>;
      expect(rs).toBeDefined();
      expect(typeof rs.confidence).toBe('number');
      const value = rs.value as Record<string, unknown>;
      expect(value.style).toBeDefined();
      expect(value.depth).toBeDefined();
      expect(value.format).toBeDefined();
    });

    it('TC-UP-030: knowledge_interest dimension', async () => {
      const input = new GetUserProfileInput();
      const output = new GetUserProfileOutput();
      await service.getUserProfile(input, ctx(), output);

      const ki = output.dimensions.knowledge_interest as Record<string, unknown>;
      expect(ki).toBeDefined();
      expect(Array.isArray(ki.value)).toBe(true);
    });

    it('TC-UP-031: interaction_habit dimension', async () => {
      const input = new GetUserProfileInput();
      const output = new GetUserProfileOutput();
      await service.getUserProfile(input, ctx(), output);

      const ih = output.dimensions.interaction_habit as Record<string, unknown>;
      expect(ih).toBeDefined();
      const value = ih.value as Record<string, unknown>;
      expect(value).toBeDefined();
      expect(typeof value.message_count).toBe('number');
    });

    it('TC-UP-032: feedback_sensitivity dimension', async () => {
      const input = new GetUserProfileInput();
      const output = new GetUserProfileOutput();
      await service.getUserProfile(input, ctx(), output);

      const fs = output.dimensions.feedback_sensitivity as Record<string, unknown>;
      expect(fs).toBeDefined();
      const value = fs.value as Record<string, unknown>;
      expect(typeof value.evaluation_count).toBe('number');
      expect(typeof value.avg_overall_score).toBe('number');
    });

    it('TC-UP-033: profile_summary present', async () => {
      const input = new GetUserProfileInput();
      const output = new GetUserProfileOutput();
      await service.getUserProfile(input, ctx(), output);

      expect(output.profile_summary).toBeTruthy();
      expect(typeof output.profile_summary).toBe('string');
    });

    it('TC-UP-034: evolution_trend correct', async () => {
      const input = new GetUserProfileInput();
      const output = new GetUserProfileOutput();
      await service.getUserProfile(input, ctx(), output);

      expect(Array.isArray(output.evolution_trend)).toBe(true);
    });

    it('TC-UP-035: Profile not generated → dimensions populated, version=0, fallback summary', async () => {
      const input = new GetUserProfileInput();
      const output = new GetUserProfileOutput();
      await service.getUserProfile(input, ctx(), output);

      expect(output.profile_version).toBe(0);
      expect(output.profile_summary).toBeTruthy();
      expect(output.profile_summary).not.toBe('');
      const lp = output.dimensions.language_preference as Record<string, unknown>;
      expect(lp).toBeDefined();
      expect(lp.value).toBe('zh-CN');
    });

    it('TC-UP-037: Non-existent version (999) → version input accepted without error, returns default profile', async () => {
      const input = new GetUserProfileInput();
      input.version = 999;
      const output = new GetUserProfileOutput();

      const result = await service.getUserProfile(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.profile_version).toBe(0);
      expect(typeof output.dimensions).toBe('object');
    });

    it('TC-UP-038: Handles writerAgent failure gracefully', async () => {
      vi.spyOn(writerAgent as any, 'getUserProfile').mockRejectedValueOnce(new Error('writer down'));

      const input = new GetUserProfileInput();
      input.session_id = 'test-session-002';
      const output = new GetUserProfileOutput();
      await service.getUserProfile(input, ctx(), output);

      expect(output.session_id).toBe('test-session-002');
      expect(output.dimensions).toBeDefined();
    });

    it('TC-UP-036: getProfile with non-existent session_id → returns profile with empty dimensions', async () => {
      const input = new GetUserProfileInput();
      input.session_id = 'non-existent-session-xyz';
      const output = new GetUserProfileOutput();
      const result = await service.getUserProfile(input, ctx(), output);

      expect(result).toBe(true);
      expect(output.session_id).toBe('non-existent-session-xyz');
      expect(typeof output.dimensions).toBe('object');
    });
  });

  // =====================================================================
  // generateProfile
  // =====================================================================

  describe('generateProfile', () => {
    function setupProfileLLM(value = 'test-profile-value', confidence = 0.85) {
      vi.spyOn(llmCore as any, 'matchLLM' as any).mockImplementation(async (_i: any, _c: any, o: any) => {
        o.llm_id = 'test-llm-1';
        o.llm = { llm_provider_id: 'provider-1' };
        return true;
      });
      (llmAccess.execLLM as any).mockImplementation(async (_i: any, _c: any, o: any) => {
        o.result = JSON.stringify({ value, confidence, evidence: ['evidence-1', 'evidence-2'] });
        return true;
      });
    }

    it('TC-UP-045: Generate profile → version increments, records created', async () => {
      setupProfileLLM();

      const input = new GenerateProfileInput();
      const output = new GenerateProfileOutput();
      const result = await service.generateProfile(input, ctx(), output);

      expect(result).toBe(true);
      expect(output.profile.version).toBe(1);
      expect(output.profile.generated_at).toBeDefined();
      expect(output.profile.profile_summary).toBeTruthy();

      const records = await db.select('user_profile_record', {
        conditions: [],
        order_by: [{ field: 'version', direction: 'DESC' }],
      });
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(Number(records[0].version)).toBe(1);

      const dimRows = await db.select('user_profile_dimension_data', {
        conditions: [{ field: 'profile_record_id', operator: Operator.EQ, value: records[0].id }],
      });
      expect(dimRows.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-UP-046: With session_id scope', async () => {
      setupProfileLLM();

      const input = new GenerateProfileInput();
      input.session_id = 'session-scope-1';
      const output = new GenerateProfileOutput();
      await service.generateProfile(input, ctx(), output);

      const records = await db.select('user_profile_record', {
        conditions: [],
        order_by: [{ field: 'version', direction: 'DESC' }],
      });
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records[0].session_id).toBe('session-scope-1');
      expect(output.profile.session_id).toBe('session-scope-1');
    });

    it('TC-UP-047: Specific directions only', async () => {
      setupProfileLLM();

      const input = new GenerateProfileInput();
      input.directions = ['language_preference', 'reply_style'];
      const output = new GenerateProfileOutput();
      await service.generateProfile(input, ctx(), output);

      const dims = output.profile.dimensions as Record<string, unknown>;
      expect(Object.keys(dims)).toHaveLength(2);
      expect(dims.language_preference).toBeDefined();
      expect(dims.reply_style).toBeDefined();
      expect(dims.knowledge_interest).toBeUndefined();
    });

    it('TC-UP-048: All enabled directions auto-generated', async () => {
      setupProfileLLM();

      const input = new GenerateProfileInput();
      const output = new GenerateProfileOutput();
      await service.generateProfile(input, ctx(), output);

      const dims = output.profile.dimensions as Record<string, unknown>;
      expect(Object.keys(dims).length).toBeGreaterThanOrEqual(4);
    });

    it('TC-UP-049: Preferences synced to WriterAgent', async () => {
      setupProfileLLM();

      vi.spyOn(writerAgent as any, 'saveUserProfile' as any).mockResolvedValue(true);

      const input = new GenerateProfileInput();
      input.session_id = 'sync-session';
      const output = new GenerateProfileOutput();
      await service.generateProfile(input, ctx(), output);

      expect(writerAgent.saveUserProfile).toHaveBeenCalled();
    });

    it('TC-UP-050: Version number increments across multiple generations', async () => {
      setupProfileLLM();

      const input1 = new GenerateProfileInput();
      const out1 = new GenerateProfileOutput();
      await service.generateProfile(input1, ctx(), out1);
      expect(out1.profile.version).toBe(1);

      const input2 = new GenerateProfileInput();
      const out2 = new GenerateProfileOutput();
      await service.generateProfile(input2, ctx(), out2);
      expect(out2.profile.version).toBe(2);
    });

    it('TC-UP-051: Second generation with same session_id → version increments', async () => {
      setupProfileLLM();

      const sid = 'repeat-session';
      const in1 = new GenerateProfileInput();
      in1.session_id = sid;
      const out1 = new GenerateProfileOutput();
      await service.generateProfile(in1, ctx(), out1);

      const in2 = new GenerateProfileInput();
      in2.session_id = sid;
      const out2 = new GenerateProfileOutput();
      await service.generateProfile(in2, ctx(), out2);

      expect(out2.profile.version).toBe(2);
    });

    it('TC-UP-052: profile_summary contains dimension data', async () => {
      setupProfileLLM('analytical and concise', 0.9);

      const input = new GenerateProfileInput();
      const output = new GenerateProfileOutput();
      await service.generateProfile(input, ctx(), output);

      expect(output.profile.profile_summary).toBeTruthy();
      expect(typeof output.profile.profile_summary).toBe('string');
    });

    it('TC-UP-053: default profile_analysis_prompt_template_id empty → uses built-in prompt', async () => {
      setupProfileLLM('some-value', 0.7);

      vi.spyOn(promptsAccess as any, 'execPrompt' as any).mockRejectedValue(new Error('should not be called'));

      const input = new GenerateProfileInput();
      const output = new GenerateProfileOutput();
      const result = await service.generateProfile(input, ctx(), output);

      expect(result).toBe(true);
      expect(promptsAccess.execPrompt).not.toHaveBeenCalled();
    });

    it('TC-UP-055: Non-existent direction → handled gracefully', async () => {
      setupProfileLLM();

      const input = new GenerateProfileInput();
      input.directions = ['non_existent_direction'];
      const output = new GenerateProfileOutput();
      await service.generateProfile(input, ctx(), output);

      const dims = output.profile.dimensions as Record<string, unknown>;
      expect(Object.keys(dims)).toHaveLength(0);
    });

    it('TC-UP-056: LLM fails → dimensions still saved, summary is default', async () => {
      vi.spyOn(llmCore as any, 'matchLLM' as any).mockRejectedValue(new Error('LLM unavailable'));

      const input = new GenerateProfileInput();
      const output = new GenerateProfileOutput();
      await service.generateProfile(input, ctx(), output);

      expect(output.profile.version).toBe(1);
      expect(output.profile.profile_summary).toBe('Profile generated');

      const records = await db.select('user_profile_record', {
        conditions: [],
        order_by: [{ field: 'version', direction: 'DESC' }],
      });
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(String(records[0].profile_summary)).toBe('Profile generated');

      const dimRows = await db.select('user_profile_dimension_data', {
        conditions: [{ field: 'profile_record_id', operator: Operator.EQ, value: records[0].id }],
      });
      expect(dimRows.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-UP-054: Generate with directions including disabled dimension → disabled direction not in enabled dirs, excluded from generation', async () => {
      setupProfileLLM('disabled-dim-value', 0.75);

      const cfgInput = new ConfigProfileDirectionInput();
      cfgInput.directions = [
        { direction_key: 'disabled_dim', direction_name: 'Disabled Dim', weight: 10, enable: false },
      ];
      await service.configProfileDirection(cfgInput, ctx(), new ConfigProfileDirectionOutput());

      const input = new GenerateProfileInput();
      input.directions = ['disabled_dim'];
      const output = new GenerateProfileOutput();
      await service.generateProfile(input, ctx(), output);

      expect(output.profile.version).toBe(1);
      const dims = output.profile.dimensions as Record<string, unknown>;
      expect(Object.keys(dims)).toHaveLength(0);
    });

    it('TC-UP-057-B: No conversation data → still generates profile', async () => {
      setupProfileLLM('no_data_value', 0.6);

      vi.spyOn(infoCore as any, 'lastNInfo' as any).mockImplementation(async (_i: any, _c: any, o: any) => {
        o.list = [];
        o.total = 0;
        return true;
      });

      const input = new GenerateProfileInput();
      const output = new GenerateProfileOutput();
      await service.generateProfile(input, ctx(), output);

      expect(output.profile.version).toBe(1);
    });

    it('TC-UP-057: Version retention — generate 25 profiles, oldest versions cleaned up, total ≤ 20', async () => {
      setupProfileLLM('retention-val', 0.5);

      for (let i = 0; i < 25; i++) {
        const input = new GenerateProfileInput();
        input.session_id = 'retention-session';
        const output = new GenerateProfileOutput();
        await service.generateProfile(input, ctx(), output);
      }

      const records = await db.select('user_profile_record', {
        conditions: [{ field: 'session_id', operator: Operator.EQ, value: 'retention-session' }],
        order_by: [{ field: 'version', direction: 'DESC' }],
      });
      expect(records.length).toBeLessThanOrEqual(20);
      expect(Number(records[0].version)).toBe(25);
      expect(Number(records[records.length - 1].version)).toBeGreaterThanOrEqual(6);
    });
  });

  // =====================================================================
  // saveUserPreference
  // =====================================================================

  describe('saveUserPreference', () => {
    it('TC-UP-060: Save complete preferences → calls writerAgent.saveUserProfile', async () => {
      vi.spyOn(writerAgent as any, 'saveUserProfile' as any).mockResolvedValue(true);

      const input = new SaveUserPreferenceInput();
      input.session_id = 'pref-session-1';
      input.language = 'en-US';
      input.style = 'detailed';
      input.depth = 'deep';
      input.format = 'MARKDOWN';
      input.additional_preferences = 'some extra pref';

      const output = new SaveUserPreferenceOutput();
      const result = await service.saveUserPreference(input, ctx(), output);

      expect(result).toBe(true);
      expect(writerAgent.saveUserProfile).toHaveBeenCalledTimes(1);
    });

    it('TC-UP-061: Partial preferences → only specified fields updated', async () => {
      vi.spyOn(writerAgent as any, 'saveUserProfile' as any).mockResolvedValue(true);

      const input = new SaveUserPreferenceInput();
      input.session_id = 'pref-session-2';
      input.language = 'fr-FR';

      const output = new SaveUserPreferenceOutput();
      const result = await service.saveUserPreference(input, ctx(), output);

      expect(result).toBe(true);
      expect(writerAgent.saveUserProfile).toHaveBeenCalledTimes(1);
    });

    it('TC-UP-062: Valid style enum "detailed" → accepted', async () => {
      vi.spyOn(writerAgent as any, 'saveUserProfile' as any).mockResolvedValue(true);

      const input = new SaveUserPreferenceInput();
      input.session_id = 'style-test';
      input.style = 'detailed';

      const output = new SaveUserPreferenceOutput();
      const result = await service.saveUserPreference(input, ctx(), output);
      expect(result).toBe(true);
    });

    it('TC-UP-063: Invalid style enum throws ValidationError', async () => {
      const input = new SaveUserPreferenceInput();
      input.session_id = 'style-invalid';
      input.style = 'INVALID_STYLE';

      const output = new SaveUserPreferenceOutput();
      await expect(service.saveUserPreference(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-UP-064: Valid depth enum "deep" → accepted', async () => {
      vi.spyOn(writerAgent as any, 'saveUserProfile' as any).mockResolvedValue(true);

      const input = new SaveUserPreferenceInput();
      input.session_id = 'depth-test';
      input.depth = 'deep';

      const output = new SaveUserPreferenceOutput();
      const result = await service.saveUserPreference(input, ctx(), output);
      expect(result).toBe(true);
    });

    it('TC-UP-065: Invalid depth throws ValidationError', async () => {
      const input = new SaveUserPreferenceInput();
      input.session_id = 'depth-invalid';
      input.depth = 'INVALID_DEPTH';

      const output = new SaveUserPreferenceOutput();
      await expect(service.saveUserPreference(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-UP-066: Valid format enum "MARKDOWN" → accepted', async () => {
      vi.spyOn(writerAgent as any, 'saveUserProfile' as any).mockResolvedValue(true);

      const input = new SaveUserPreferenceInput();
      input.session_id = 'format-test';
      input.format = 'MARKDOWN';

      const output = new SaveUserPreferenceOutput();
      const result = await service.saveUserPreference(input, ctx(), output);
      expect(result).toBe(true);
    });

    it('TC-UP-067: Invalid format throws ValidationError', async () => {
      const input = new SaveUserPreferenceInput();
      input.session_id = 'format-invalid';
      input.format = 'INVALID_FORMAT';

      const output = new SaveUserPreferenceOutput();
      await expect(service.saveUserPreference(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-UP-068: Missing session_id throws ValidationError', async () => {
      const input = new SaveUserPreferenceInput();
      input.language = 'en-US';

      const output = new SaveUserPreferenceOutput();
      await expect(service.saveUserPreference(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-UP-069: additional_preferences string passed through', async () => {
      vi.spyOn(writerAgent as any, 'saveUserProfile' as any).mockResolvedValue(true);

      const input = new SaveUserPreferenceInput();
      input.session_id = 'extra-pref';
      input.additional_preferences = 'custom extra preference data';

      const output = new SaveUserPreferenceOutput();
      await service.saveUserPreference(input, ctx(), output);
      expect(writerAgent.saveUserProfile).toHaveBeenCalled();
    });

    it('TC-UP-069-LONG: additional_preferences > 10000 characters → throws ValidationError', async () => {
      const input = new SaveUserPreferenceInput();
      input.session_id = 'long-pref';
      input.additional_preferences = 'A'.repeat(10001);

      const output = new SaveUserPreferenceOutput();
      await expect(service.saveUserPreference(input, ctx(), output)).rejects.toThrow(ValidationError);
    });
  });

  // =====================================================================
  // getProfileHistory
  // =====================================================================

  describe('getProfileHistory', () => {
    function setupProfileLLMForGen() {
      vi.spyOn(llmCore as any, 'matchLLM' as any).mockImplementation(async (_i: any, _c: any, o: any) => {
        o.llm_id = 'hist-llm';
        o.llm = { llm_provider_id: 'p1' };
        return true;
      });
      (llmAccess.execLLM as any).mockImplementation(async (_i: any, _c: any, o: any) => {
        o.result = JSON.stringify({ value: 'hist-val', confidence: 0.9, evidence: [] });
        return true;
      });
    }

    async function generateProfile(sessionId?: string, directions?: string[]) {
      const input = new GenerateProfileInput();
      if (sessionId) input.session_id = sessionId;
      if (directions) input.directions = directions;
      await service.generateProfile(input, ctx(), new GenerateProfileOutput());
    }

    it('TC-UP-075: Get global history → returns history array', async () => {
      setupProfileLLMForGen();
      await generateProfile();
      await generateProfile();

      const input = new GetProfileHistoryInput();
      const output = new GetProfileHistoryOutput();
      const result = await service.getProfileHistory(input, ctx(), output);

      expect(result).toBe(true);
      expect(Array.isArray(output.history)).toBe(true);
      expect(output.history.length).toBe(2);
      expect(output.history[0].version).toBe(2);
      expect(output.history[1].version).toBe(1);
      expect(output.history[0].profile_summary).toBeTruthy();
      expect(typeof output.history[0].generated_at).toBe('number');
    });

    it('TC-UP-076: By session_id', async () => {
      setupProfileLLMForGen();
      await generateProfile('hist-session-A');
      await generateProfile('hist-session-B');

      const input = new GetProfileHistoryInput();
      input.session_id = 'hist-session-A';
      const output = new GetProfileHistoryOutput();
      await service.getProfileHistory(input, ctx(), output);

      expect(output.history.every((h: Record<string, unknown>) => h.session_id === 'hist-session-A')).toBe(true);
    });

    it('TC-UP-077: limit=5 → max 5 items', async () => {
      setupProfileLLMForGen();
      for (let i = 0; i < 7; i++) {
        await generateProfile();
      }

      const input = new GetProfileHistoryInput();
      input.limit = 5;
      const output = new GetProfileHistoryOutput();
      await service.getProfileHistory(input, ctx(), output);

      expect(output.history.length).toBeLessThanOrEqual(5);
    });

    it('TC-UP-078: Default limit=20', async () => {
      setupProfileLLMForGen();
      await generateProfile();

      const input = new GetProfileHistoryInput();
      const output = new GetProfileHistoryOutput();
      await service.getProfileHistory(input, ctx(), output);

      expect(output.history.length).toBe(1);
    });

    it('TC-UP-079: Version DESC order', async () => {
      setupProfileLLMForGen();
      await generateProfile();
      await generateProfile();
      await generateProfile();

      const input = new GetProfileHistoryInput();
      const output = new GetProfileHistoryOutput();
      await service.getProfileHistory(input, ctx(), output);

      const versions = output.history.map((h: Record<string, unknown>) => h.version);
      for (let i = 1; i < versions.length; i++) {
        expect(Number(versions[i - 1])).toBeGreaterThan(Number(versions[i]));
      }
    });

    it('TC-UP-080: No history → empty array', async () => {
      const input = new GetProfileHistoryInput();
      const output = new GetProfileHistoryOutput();
      const result = await service.getProfileHistory(input, ctx(), output);

      expect(result).toBe(true);
      expect(output.history).toEqual([]);
    });

    it('TC-UP-081: Invalid session_id → empty array', async () => {
      setupProfileLLMForGen();
      await generateProfile('real-session');

      const input = new GetProfileHistoryInput();
      input.session_id = 'non-existent-session';
      const output = new GetProfileHistoryOutput();
      await service.getProfileHistory(input, ctx(), output);

      expect(output.history).toEqual([]);
    });
  });

  // =====================================================================
  // getProfileByVersion
  // =====================================================================

  describe('getProfileByVersion', () => {
    function setupProfileLLMForVersion() {
      vi.spyOn(llmCore as any, 'matchLLM' as any).mockImplementation(async (_i: any, _c: any, o: any) => {
        o.llm_id = 'ver-llm';
        o.llm = { llm_provider_id: 'p1' };
        return true;
      });
      (llmAccess.execLLM as any).mockImplementation(async (_i: any, _c: any, o: any) => {
        o.result = JSON.stringify({ value: 'ver-val', confidence: 0.88, evidence: ['ev1'] });
        return true;
      });
    }

    it('TC-UP-085: Valid version → returns profile', async () => {
      setupProfileLLMForVersion();

      const genIn = new GenerateProfileInput();
      const genOut = new GenerateProfileOutput();
      await service.generateProfile(genIn, ctx(), genOut);

      const input = new GetProfileByVersionInput();
      input.version = 1;
      const output = new GetProfileByVersionOutput();
      const result = await service.getProfileByVersion(input, ctx(), output);

      expect(result).toBe(true);
      expect(output.profile.version).toBe(1);
      expect(output.profile.profile_summary).toBeTruthy();
      expect(output.profile.dimensions).toBeDefined();
      expect(Object.keys(output.profile.dimensions).length).toBeGreaterThanOrEqual(1);
    });

    it('TC-UP-086: With session_id + version', async () => {
      setupProfileLLMForVersion();

      const genIn = new GenerateProfileInput();
      genIn.session_id = 'ver-session-1';
      const genOut = new GenerateProfileOutput();
      await service.generateProfile(genIn, ctx(), genOut);

      const input = new GetProfileByVersionInput();
      input.session_id = 'ver-session-1';
      input.version = 1;
      const output = new GetProfileByVersionOutput();
      await service.getProfileByVersion(input, ctx(), output);

      expect(output.profile.version).toBe(1);
      expect(output.profile.session_id).toBe('ver-session-1');
    });

    it('TC-UP-087: Non-existent version → throws NotFoundError', async () => {
      const input = new GetProfileByVersionInput();
      input.version = 999;
      const output = new GetProfileByVersionOutput();

      await expect(service.getProfileByVersion(input, ctx(), output)).rejects.toThrow();
    });

    it('TC-UP-088: version=0 → throws error', async () => {
      const input = new GetProfileByVersionInput();
      input.version = 0;
      const output = new GetProfileByVersionOutput();

      await expect(service.getProfileByVersion(input, ctx(), output)).rejects.toThrow();
    });
  });

  // =====================================================================
  // configUserProfile
  // =====================================================================

  describe('configUserProfile', () => {
    it('configUserProfile: update config → returns updated config', async () => {
      const input = new ConfigUserProfileInput();
      input.max_conversation_sample_count = 1000;
      input.min_confidence_threshold = 0.7;
      const output = new ConfigUserProfileOutput();

      const result = await service.configUserProfile(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.config).toBeDefined();
      expect(output.config.max_conversation_sample_count).toBe(1000);
      expect(output.config.min_confidence_threshold).toBe(0.7);
      expect(output.config.auto_generate_interval_ms).toBe(86400000);
      expect(output.config.profile_retention_versions).toBe(20);
    });

    it('configUserProfile: partial update only modifies specified fields', async () => {
      const input = new ConfigUserProfileInput();
      input.auto_generate_interval_ms = 3600000;
      const output = new ConfigUserProfileOutput();

      await service.configUserProfile(input, ctx(), output);
      expect(output.config.auto_generate_interval_ms).toBe(3600000);
      expect(output.config.max_conversation_sample_count).toBe(500);
    });

    it('configUserProfile: returns full config after update', async () => {
      const input = new ConfigUserProfileInput();
      input.profile_retention_versions = 10;
      const output = new ConfigUserProfileOutput();

      await service.configUserProfile(input, ctx(), output);
      const cfg = output.config;
      expect(cfg.profile_retention_versions).toBe(10);
      expect('auto_generate_interval_ms' in cfg).toBe(true);
      expect('profile_analysis_prompt_template_id' in cfg).toBe(true);
      expect('max_conversation_sample_count' in cfg).toBe(true);
      expect('min_confidence_threshold' in cfg).toBe(true);
    });
  });

  describe('config proxy', () => {
    it('TC-UP-095: configUserProfile is internal method — callable directly on service, routed through Config Application for HTTP access', async () => {
      const input = new ConfigUserProfileInput();
      input.profile_retention_versions = 5;
      const output = new ConfigUserProfileOutput();

      const result = await service.configUserProfile(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.config).toBeDefined();
      expect(output.config.profile_retention_versions).toBe(5);
    });
  });
});
