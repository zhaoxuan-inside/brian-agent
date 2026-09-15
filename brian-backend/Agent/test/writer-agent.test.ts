import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ValidationError } from '@brian-agent/base';
import { WriterAgentService } from '../WriterAgent/application/WriterAgentService';
import { AgentBuilderService } from '../AgentBuilder/application/AgentBuilderService';
import { AgentLibraryService } from '../AgentLibrary/application/AgentLibraryService';
import { AgentStrategyService } from '../AgentStrategy/application/AgentStrategyService';
import { createTestDb, makeAccess, setupAgentTestMocks,
  WriterAgentContext, SaveUserProfileInput, SaveUserProfileOutput,
  GetUserProfileInput, GetUserProfileOutput, ConfigWriterAgentInput, ConfigWriterAgentOutput,
  WriteInput, WriteOutput,
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
  let db: any;

  beforeAll(async () => {
    await setupAgentTestMocks();
    db = await createTestDb();
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
        session_id: s, language: 'en-US', style: 'concise', depth: 'shallow', format: 'TEXT',
      }), new SaveUserProfileOutput(), new WriterAgentContext());
      const out = new GetUserProfileOutput();
      await writer.soUserProfile(Object.assign(new GetUserProfileInput(), { session_id: s }), out, new WriterAgentContext());
      expect(out.user_profile.language).toBe('en-US');
    });

    it('TC-WR-002: 更新已有配置', async () => {
      const s = sid();
      await writer.saveUserProfile(Object.assign(new SaveUserProfileInput(), { session_id: s, language: 'en-US' }),
        new SaveUserProfileOutput(), new WriterAgentContext());
      await writer.saveUserProfile(Object.assign(new SaveUserProfileInput(), { session_id: s, language: 'zh-CN' }),
        new SaveUserProfileOutput(), new WriterAgentContext());
      const out = new GetUserProfileOutput();
      await writer.soUserProfile(Object.assign(new GetUserProfileInput(), { session_id: s }), out, new WriterAgentContext());
      expect(out.user_profile.language).toBe('zh-CN');
    });

    it('TC-WR-003: format 非法值抛异常', async () => {
      await expect(writer.saveUserProfile(Object.assign(new SaveUserProfileInput(), {
        session_id: sid(), format: 'INVALID',
      }), new SaveUserProfileOutput(), new WriterAgentContext())).rejects.toThrow(ValidationError);
    });

    it('TC-WR-004: 不存在的用户返回默认值', async () => {
      const out = new GetUserProfileOutput();
      await writer.soUserProfile(Object.assign(new GetUserProfileInput(), { session_id: sid() }), out, new WriterAgentContext());
      expect(out.user_profile.language).toBe('zh-CN');
    });

    it('TC-WR-005: language 非法值抛异常', async () => {
      await expect(writer.saveUserProfile(Object.assign(new SaveUserProfileInput(), {
        session_id: sid(), language: 'fr',
      }), new SaveUserProfileOutput(), new WriterAgentContext())).rejects.toThrow(ValidationError);
    });
  });

  describe('configWriterAgent', () => {
    it('TC-WR-010: 配置可用', async () => {
      const out = new ConfigWriterAgentOutput();
      await writer.configWriterAgent(new ConfigWriterAgentInput(), out, new WriterAgentContext());
      expect(out.config).toBeTruthy();
    });

    it('TC-WR-012: default_format 非法值抛异常', async () => {
      await expect(writer.configWriterAgent(Object.assign(new ConfigWriterAgentInput(), { default_format: 'PDF' }),
        new ConfigWriterAgentOutput(), new WriterAgentContext())).rejects.toThrow(ValidationError);
    });

    it('TC-WR-013: default_depth 非法值抛异常', async () => {
      await expect(writer.configWriterAgent(Object.assign(new ConfigWriterAgentInput(), { default_depth: 'ultra' }),
        new ConfigWriterAgentOutput(), new WriterAgentContext())).rejects.toThrow(ValidationError);
    });

    it('TC-WR-014: default_style 非法值抛异常', async () => {
      await expect(writer.configWriterAgent(Object.assign(new ConfigWriterAgentInput(), { default_style: 'fancy' }),
        new ConfigWriterAgentOutput(), new WriterAgentContext())).rejects.toThrow(ValidationError);
    });

    it('TC-WR-015: default_language 非法值抛异常', async () => {
      await expect(writer.configWriterAgent(Object.assign(new ConfigWriterAgentInput(), { default_language: 'fr' }),
        new ConfigWriterAgentOutput(), new WriterAgentContext())).rejects.toThrow(ValidationError);
    });

    it('TC-WR-016: 更新 llm_id', async () => {
      const out = new ConfigWriterAgentOutput();
      await writer.configWriterAgent(Object.assign(new ConfigWriterAgentInput(), { llm_id: 'writer-model-1' }),
        out, new WriterAgentContext());
      expect(out.config?.llm_id).toBe('writer-model-1');
    });
  });

  describe('write', () => {
    it('TC-WR-020: write 记录执行轨迹（trace_id + token 用量）', async () => {
      const mockLLM = {
        execLLM: vi.fn().mockImplementation(async (_i: unknown, o: { result?: string; input_tokens?: number; output_tokens?: number; raw_response?: string }, _c: unknown) => {
          o.result = JSON.stringify([{ type: 'text_paragraph', content: '汇总结果' }]);
          o.input_tokens = 120;
          o.output_tokens = 80;
          o.raw_response = '{"result":"ok"}';
          return true;
        }),
      } as any;
      const traceWriter = new WriterAgentService(db, mockLLM, NOOP_PROMPTS_ACCESS, NOOP_INFO_CORE, makeAccess(builder), makeAccess(libSvc));
      const out = new WriteOutput();
      await traceWriter.execWrite(Object.assign(new WriteInput(), {
        work_id: 'w-1', run_id: 'i-1', user_query: '帮我汇总',
        agent_results: [{ agent_id: 'a1', task_content: 't1', result: 'r1' }],
      }), out, new WriterAgentContext());
      expect(out.trace_id).toBeTruthy();
      const rows = db.queryRaw<{ trace_id: string; total_token_usage: number; answer: string }>(
        'SELECT "trace_id", "total_token_usage", "answer" FROM "agent_execution_trace" WHERE "trace_id" = ?',
        [out.trace_id],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].total_token_usage).toBe(200);
    });
  });
});
