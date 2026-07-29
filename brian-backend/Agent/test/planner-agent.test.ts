import { describe, it, expect, beforeAll } from 'vitest';
import { ValidationError } from '@brian-agent/base';
import { PlannerAgentService } from '../PlannerAgent/application/PlannerAgentService';
import { AgentBuilderService } from '../AgentBuilder/application/AgentBuilderService';
import { AgentLibraryService } from '../AgentLibrary/application/AgentLibraryService';
import { AgentStrategyService } from '../AgentStrategy/application/AgentStrategyService';
import { PlannerAgentContext, PlanInput, PlanOutput, ConfigPlannerAgentInput, ConfigPlannerAgentOutput } from '../PlannerAgent/domain/types';
import { createTestDb, makeAccess, setupAgentTestMocks,
  NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS, NOOP_INFO_CORE,
  NOOP_LLM_CORE, NOOP_MCP_CORE, NOOP_SKILL_CORE, NOOP_SOUL_CORE,
} from './test-helpers';

describe('PlannerAgent', () => {
  let planner: PlannerAgentService;
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
    planner = new PlannerAgentService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS, NOOP_INFO_CORE, makeAccess(builder), makeAccess(libSvc));
  });

  describe('plan', () => {
    it('TC-PA-001: 生成单节点 DAG', async () => {
      const out = new PlanOutput();
      await planner.plan(Object.assign(new PlanInput(), {
        work_id: `w-${Math.random().toString(36).slice(2, 8)}`, interact_id: 'i1', task_content: 'simple task',
      }), new PlannerAgentContext(), out);
      expect(out.plan_id).toBeTruthy();
      expect(out.task_dag.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-PA-002: plan_id 唯一', async () => {
      const o1 = new PlanOutput(); const o2 = new PlanOutput();
      await planner.plan(Object.assign(new PlanInput(), { work_id: `wa-${Math.random().toString(36).slice(2, 8)}`, interact_id: 'i1', task_content: 'a' }), new PlannerAgentContext(), o1);
      await planner.plan(Object.assign(new PlanInput(), { work_id: `wb-${Math.random().toString(36).slice(2, 8)}`, interact_id: 'i2', task_content: 'b' }), new PlannerAgentContext(), o2);
      expect(o1.plan_id).not.toBe(o2.plan_id);
    });
  });

  describe('configPlannerAgent', () => {
    it('TC-PA-010: 配置可用', async () => {
      const out = new ConfigPlannerAgentOutput();
      await planner.configPlannerAgent(new ConfigPlannerAgentInput(), new PlannerAgentContext(), out);
      expect(out.config).toBeTruthy();
    });

    it('TC-PA-012: threshold 超出范围抛异常', async () => {
      await expect(planner.configPlannerAgent(Object.assign(new ConfigPlannerAgentInput(), { complexity_decompose_threshold: 150 }),
        new PlannerAgentContext(), new ConfigPlannerAgentOutput())).rejects.toThrow(ValidationError);
    });
  });
});
