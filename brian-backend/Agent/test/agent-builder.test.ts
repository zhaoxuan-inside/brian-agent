import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeAll } from 'vitest';
import { ValidationError } from '@brian-agent/base';
import { AgentBuilderService } from '../AgentBuilder/application/AgentBuilderService';
import { AgentLibraryService } from '../AgentLibrary/application/AgentLibraryService';
import { AgentStrategyService } from '../AgentStrategy/application/AgentStrategyService';
import {
  AgentBuilderContext,
  BuildSystemAgentInput, BuildSystemAgentOutput,
  ConfigAgentBuilderInput, ConfigAgentBuilderOutput,
} from '../AgentBuilder/domain/types';
import {
  createTestDb, makeAccess, setupAgentTestMocks,
  NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS,
  NOOP_LLM_CORE, NOOP_MCP_CORE, NOOP_SKILL_CORE, NOOP_SOUL_CORE,
} from './test-helpers';

describe('AgentBuilder', () => {
  let builder: AgentBuilderService;
  let libSvc: AgentLibraryService;
  let stratSvc: AgentStrategyService;

  beforeAll(async () => {
    await setupAgentTestMocks();
    const db = await createTestDb();
    libSvc = new AgentLibraryService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
    stratSvc = new AgentStrategyService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
    
    builder = new AgentBuilderService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS,
      makeAccess(libSvc), makeAccess(stratSvc),
      NOOP_LLM_CORE, NOOP_MCP_CORE, NOOP_SKILL_CORE, NOOP_SOUL_CORE);
  });

  describe('buildWriterAgent', () => {
    it('TC-AB-025: 首次构建 Writer', async () => {
      const out = new BuildSystemAgentOutput();
      await builder.buildSystemAgent(Object.assign(new BuildSystemAgentInput(), { agent_type: 'WRITER', force_new: true }), out, new AgentBuilderContext());
      expect(out.agent_id).toBeTruthy();
    });
  });

  describe('buildEvolutorAgent', () => {
    it('TC-AB-028: 首次构建 Evolutor', async () => {
      const out = new BuildSystemAgentOutput();
      await builder.buildSystemAgent(Object.assign(new BuildSystemAgentInput(), { agent_type: 'EVOLUTOR', force_new: true }), out, new AgentBuilderContext());
      expect(out.agent_id).toBeTruthy();
    });
  });

  describe('configAgentBuilder', () => {
    it('TC-AB-031: 配置可用', async () => {
      const out = new ConfigAgentBuilderOutput();
      await builder.configAgentBuilder(new ConfigAgentBuilderInput(), out, new AgentBuilderContext());
      expect(out.config).toBeTruthy();
    });

    it('TC-AB-036: 更新 auto_optimize', async () => {
      const out = new ConfigAgentBuilderOutput();
      await builder.configAgentBuilder(Object.assign(new ConfigAgentBuilderInput(), { auto_optimize: false }), out, new AgentBuilderContext());
      expect(out.config!.auto_optimize).toBe(false);
    });
  });
});
