import { describe, it, expect, beforeAll } from 'vitest';
import { ValidationError } from '@brian-agent/base';
import { AgentBuilderService } from '../AgentBuilder/application/AgentBuilderService';
import { AgentLibraryService } from '../AgentLibrary/application/AgentLibraryService';
import { AgentStrategyService } from '../AgentStrategy/application/AgentStrategyService';
import {
  AgentBuilderContext, BuildPlannerAgentInput, BuildPlannerAgentOutput,
  BuildWriterAgentInput, BuildWriterAgentOutput, BuildEvolutorAgentInput, BuildEvolutorAgentOutput,
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

  describe('buildPlannerAgent', () => {
    it('TC-AB-021: 首次构建 (force_new)', async () => {
      const out = new BuildPlannerAgentOutput();
      await builder.buildPlannerAgent(Object.assign(new BuildPlannerAgentInput(), { force_new: true }), new AgentBuilderContext(), out);
      expect(out.agent_id).toBeTruthy();
    });

    it('TC-AB-022: 复用已有 Planner', async () => {
      const o1 = new BuildPlannerAgentOutput();
      await builder.buildPlannerAgent(new BuildPlannerAgentInput(), new AgentBuilderContext(), o1);
      const o2 = new BuildPlannerAgentOutput();
      await builder.buildPlannerAgent(new BuildPlannerAgentInput(), new AgentBuilderContext(), o2);
      expect(o2.agent_id).toBe(o1.agent_id);
    });
  });

  describe('buildWriterAgent', () => {
    it('TC-AB-025: 首次构建 Writer', async () => {
      const out = new BuildWriterAgentOutput();
      await builder.buildWriterAgent(Object.assign(new BuildWriterAgentInput(), { force_new: true }), new AgentBuilderContext(), out);
      expect(out.agent_id).toBeTruthy();
    });
  });

  describe('buildEvolutorAgent', () => {
    it('TC-AB-028: 首次构建 Evolutor', async () => {
      const out = new BuildEvolutorAgentOutput();
      await builder.buildEvolutorAgent(Object.assign(new BuildEvolutorAgentInput(), { force_new: true }), new AgentBuilderContext(), out);
      expect(out.agent_id).toBeTruthy();
    });
  });

  describe('configAgentBuilder', () => {
    it('TC-AB-031: 配置可用', async () => {
      const out = new ConfigAgentBuilderOutput();
      await builder.configAgentBuilder(new ConfigAgentBuilderInput(), new AgentBuilderContext(), out);
      expect(out.config).toBeTruthy();
    });

    it('TC-AB-036: 更新 auto_optimize', async () => {
      const out = new ConfigAgentBuilderOutput();
      await builder.configAgentBuilder(Object.assign(new ConfigAgentBuilderInput(), { auto_optimize: false }), new AgentBuilderContext(), out);
      expect(out.config!.auto_optimize).toBe(false);
    });
  });
});
