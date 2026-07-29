import { describe, it, expect, beforeAll } from 'vitest';
import { ValidationError } from '@brian-agent/base';
import { WriterAgentService } from '../WriterAgent/application/WriterAgentService';
import { AgentBuilderService } from '../AgentBuilder/application/AgentBuilderService';
import { AgentLibraryService } from '../AgentLibrary/application/AgentLibraryService';
import { AgentStrategyService } from '../AgentStrategy/application/AgentStrategyService';
import { createTestDb, makeAccess, setupAgentTestMocks,
  WriterAgentContext, SaveUserProfileInput, SaveUserProfileOutput,
  GetUserProfileInput, GetUserProfileOutput, ConfigWriterAgentInput, ConfigWriterAgentOutput,
} from '../WriterAgent/domain/types';
import { createTestDb, makeAccess, setupAgentTestMocks,
  NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS, NOOP_INFO_CORE,
  NOOP_LLM_CORE, NOOP_MCP_CORE, NOOP_SKILL_CORE, NOOP_SOUL_CORE,
} from './test-helpers';

describe('WriterAgent', () => {
  let writer: WriterAgentService;
  let builder: AgentBuilderService;
  let libSvc: AgentLibraryService;
  let stratSvc: AgentStrategyService;

  beforeAll(async () => {
    await setupAgentTestMocks();
    const db = await createTestDb();
    libSvc = new AgentLibraryService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
    stratSvc = new AgentStrategyService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
    
    builder = new AgentBuilderService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS,
      makeAccess(libSvc), makeAccess(stratSvc), NOOP_LLM_CORE, NOOP_MCP_CORE, NOOP_SKILL_CORE, NOOP_SOUL_CORE);
    writer = new WriterAgentService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS, NOOP_INFO_CORE, makeAccess(builder), makeAccess(libSvc));
  });

  function sid() { return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

  describe('saveUserProfile', () => {
    it('TC-WR-001: 首次保存用户配置', async () => {
      const s = sid();
      await writer.saveUserProfile(Object.assign(new SaveUserProfileInput(), {
        session_id: s, language: 'en', style: 'concise', depth: 'short', format: 'TEXT',
      }), new WriterAgentContext(), new SaveUserProfileOutput());
      const out = new GetUserProfileOutput();
      await writer.getUserProfile(Object.assign(new GetUserProfileInput(), { session_id: s }), new WriterAgentContext(), out);
      expect(out.user_profile.language).toBe('en');
    });

    it('TC-WR-002: 更新已有配置', async () => {
      const s = sid();
      await writer.saveUserProfile(Object.assign(new SaveUserProfileInput(), { session_id: s, language: 'en' }),
        new WriterAgentContext(), new SaveUserProfileOutput());
      await writer.saveUserProfile(Object.assign(new SaveUserProfileInput(), { session_id: s, language: 'ja' }),
        new WriterAgentContext(), new SaveUserProfileOutput());
      const out = new GetUserProfileOutput();
      await writer.getUserProfile(Object.assign(new GetUserProfileInput(), { session_id: s }), new WriterAgentContext(), out);
      expect(out.user_profile.language).toBe('ja');
    });

    it('TC-WR-003: format 非法值抛异常', async () => {
      await expect(writer.saveUserProfile(Object.assign(new SaveUserProfileInput(), {
        session_id: sid(), format: 'INVALID',
      }), new WriterAgentContext(), new SaveUserProfileOutput())).rejects.toThrow(ValidationError);
    });

    it('TC-WR-004: 不存在的用户返回默认值', async () => {
      const out = new GetUserProfileOutput();
      await writer.getUserProfile(Object.assign(new GetUserProfileInput(), { session_id: sid() }), new WriterAgentContext(), out);
      expect(out.user_profile.language).toBe('zh-CN');
    });
  });

  describe('configWriterAgent', () => {
    it('TC-WR-010: 配置可用', async () => {
      const out = new ConfigWriterAgentOutput();
      await writer.configWriterAgent(new ConfigWriterAgentInput(), new WriterAgentContext(), out);
      expect(out.config).toBeTruthy();
    });

    it('TC-WR-012: default_format 非法值抛异常', async () => {
      await expect(writer.configWriterAgent(Object.assign(new ConfigWriterAgentInput(), { default_format: 'PDF' }),
        new WriterAgentContext(), new ConfigWriterAgentOutput())).rejects.toThrow(ValidationError);
    });
  });
});
