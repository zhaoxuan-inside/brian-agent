import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ValidationError } from '@brian-agent/base';
import { PlannerAgentService } from '../PlannerAgent/application/PlannerAgentService';
import { AgentBuilderService } from '../AgentBuilder/application/AgentBuilderService';
import { AgentLibraryService } from '../AgentLibrary/application/AgentLibraryService';
import { AgentStrategyService } from '../AgentStrategy/application/AgentStrategyService';
import { PlannerAgentContext, PlanInput, PlanOutput, PlanHierarchicalInput, PlanHierarchicalOutput, ConfigPlannerAgentInput, ConfigPlannerAgentOutput } from '../PlannerAgent/domain/types';
import { createTestDb, makeAccess, setupAgentTestMocks,
  NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS, NOOP_INFO_CORE,
  NOOP_LLM_CORE, NOOP_MCP_CORE, NOOP_SKILL_CORE, NOOP_SOUL_CORE,
} from './test-helpers';

describe('PlannerAgent', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let planner: PlannerAgentService;
  let builder: AgentBuilderService;
  let libSvc: AgentLibraryService;
  let stratSvc: AgentStrategyService;

  beforeAll(async () => {
    await setupAgentTestMocks();
    db = await createTestDb();
    libSvc = new AgentLibraryService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
    stratSvc = new AgentStrategyService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
    
    builder = new AgentBuilderService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS,
      makeAccess(libSvc), makeAccess(stratSvc), NOOP_LLM_CORE, NOOP_MCP_CORE, NOOP_SKILL_CORE, NOOP_SOUL_CORE);
    planner = new PlannerAgentService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS, NOOP_INFO_CORE, makeAccess(builder), makeAccess(libSvc));
  });

  describe('plan', () => {
    it('TC-PA-001: 生成单节点 DAG', async () => {
      const out = new PlanOutput();
      await planner.execPlan(Object.assign(new PlanInput(), {
        work_id: `w-${Math.random().toString(36).slice(2, 8)}`, run_id: 'i1', task_content: 'simple task',
      }), out, new PlannerAgentContext());
      expect(out.plan_id).toBeTruthy();
      expect(out.task_dag.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-PA-002: plan_id 唯一', async () => {
      const o1 = new PlanOutput(); const o2 = new PlanOutput();
      await planner.execPlan(Object.assign(new PlanInput(), { work_id: `wa-${Math.random().toString(36).slice(2, 8)}`, run_id: 'i1', task_content: 'a' }), o1, new PlannerAgentContext());
      await planner.execPlan(Object.assign(new PlanInput(), { work_id: `wb-${Math.random().toString(36).slice(2, 8)}`, run_id: 'i2', task_content: 'b' }), o2, new PlannerAgentContext());
      expect(o1.plan_id).not.toBe(o2.plan_id);
    });
  });

  describe('planHierarchical', () => {
    function makePlannerWithLlm(llmResult: unknown): PlannerAgentService {
      const llmAccess = {
        execLLM: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
          o.result = JSON.stringify(llmResult);
          return true;
        }),
      } as any;
      return new PlannerAgentService(db, llmAccess, NOOP_PROMPTS_ACCESS, NOOP_INFO_CORE, makeAccess(builder), makeAccess(libSvc));
    }

    it('TC-PH-001: 层级拆解去重重叠子任务并收敛到 max_subtask_count 上限', async () => {
      // 12 个相互重叠的叶子子任务（复杂度均低于阈值，不再触发递归展开）
      const spec: Array<[string, string, number]> = [
        ['1', '调研Agent的定义', 40], ['2', '调研Agent的定义与概念', 40],
        ['3', '调研Agent的核心架构', 40], ['4', '分析Agent核心架构', 40],
        ['5', '调研Agent主流框架', 40], ['6', '整理Agent主流框架', 40],
        ['7', '收集Agent相关文献', 40], ['8', '汇总Agent应用场景', 40],
        ['9', '撰写研究报告', 40], ['10', '评估Agent安全性', 40],
        ['11', '调研Agent的评估标准', 40], ['12', '梳理Agent发展趋势', 40],
      ];
      const nodes = spec.map(([id, content, cx]) => ({
        task_id: id, parent_task_id: '', task_content: content, task_complexity: cx, task_domain: '', priority: 1, dependencies: [],
      }));
      const p = makePlannerWithLlm({ nodes, edges: [] });
      const out = new PlanHierarchicalOutput();
      await p.planHierarchical(Object.assign(new PlanHierarchicalInput(), {
        work_id: 'w-ph-1', run_id: 'i1', task_content: '研究Agent',
      }), out, new PlannerAgentContext());

      expect(out.plan_id).toBeTruthy();
      expect(out.task_dag.nodes.length).toBeLessThanOrEqual(10);
      // 重叠子任务被合并，最终任务内容应唯一（无重复）
      const contents = out.task_dag.nodes.map((n) => n.task_content);
      expect(new Set(contents).size).toBe(contents.length);
      expect(contents.length).toBeLessThan(12);
    });

    it('TC-PH-002: 可无限拆解的 LLM 输出仍能终止且不超上限（深度守卫 + 全局预算）', async () => {
      // 每次拆解都返回「父任务 + 2 个复杂子任务」，无深度守卫时会无限递归
      const p = makePlannerWithLlm({
        nodes: [
          { task_id: 'r', parent_task_id: '', task_content: '总任务', task_complexity: 60, task_domain: '', priority: 1, dependencies: ['a', 'b'] },
          { task_id: 'a', parent_task_id: 'r', task_content: '子任务A', task_complexity: 60, task_domain: '', priority: 2, dependencies: [] },
          { task_id: 'b', parent_task_id: 'r', task_content: '子任务B', task_complexity: 60, task_domain: '', priority: 3, dependencies: [] },
        ],
        edges: [
          { from_task_id: 'a', to_task_id: 'r' },
          { from_task_id: 'b', to_task_id: 'r' },
        ],
      });
      const out = new PlanHierarchicalOutput();
      await p.planHierarchical(Object.assign(new PlanHierarchicalInput(), {
        work_id: 'w-ph-2', run_id: 'i2', task_content: '研究Agent',
      }), out, new PlannerAgentContext());

      expect(out.plan_id).toBeTruthy();
      expect(out.task_dag.nodes.length).toBeLessThanOrEqual(10);
    });
  });

  describe('configPlannerAgent', () => {
    it('TC-PA-010: 配置可用', async () => {
      const out = new ConfigPlannerAgentOutput();
      await planner.configPlannerAgent(new ConfigPlannerAgentInput(), out, new PlannerAgentContext());
      expect(out.config).toBeTruthy();
    });

    it('TC-PA-012: threshold 超出范围抛异常', async () => {
      await expect(planner.configPlannerAgent(Object.assign(new ConfigPlannerAgentInput(), { complexity_decompose_threshold: 150 }),
        new ConfigPlannerAgentOutput(), new PlannerAgentContext())).rejects.toThrow(ValidationError);
    });

    it('TC-PA-013: 更新 llm_id', async () => {
      const out = new ConfigPlannerAgentOutput();
      await planner.configPlannerAgent(Object.assign(new ConfigPlannerAgentInput(), { llm_id: 'planner-model-1' }),
        out, new PlannerAgentContext());
      expect(out.config?.llm_id).toBe('planner-model-1');
    });
  });
});
