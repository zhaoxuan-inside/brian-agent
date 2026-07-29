import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ValidationError, NotFoundError } from '@brian-agent/base';
import { EvolutorAgentService } from '../EvolutorAgent/application/EvolutorAgentService';
import { AgentBuilderService } from '../AgentBuilder/application/AgentBuilderService';
import { AgentLibraryService } from '../AgentLibrary/application/AgentLibraryService';
import { AgentStrategyService } from '../AgentStrategy/application/AgentStrategyService';
import { createTestDb, makeAccess, setupAgentTestMocks,
  EvolutorAgentContext, EvalWorkAgentInput, EvalWorkAgentOutput,
  GetEvaluationInput, GetEvaluationOutput, GetEvolutionReportInput, GetEvolutionReportOutput,
  ConfigEvolutorAgentInput, ConfigEvolutorAgentOutput,
} from '../EvolutorAgent/domain/types';
import { AgentLibraryContext, AddAgentInput, AddAgentOutput } from '../AgentLibrary/domain/types';
import { createTestDb, makeAccess, setupAgentTestMocks,
  NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS, NOOP_MQ_ACCESS,
  NOOP_INFO_CORE, NOOP_MQ_CORE,
  NOOP_LLM_CORE, NOOP_MCP_CORE, NOOP_SKILL_CORE, NOOP_SOUL_CORE,
} from './test-helpers';

const NOOP_AGENT_EXECUTION = {
  getTrace: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.trace = null; return true; }),
} as any;

describe('EvolutorAgent', () => {
  let evolutor: EvolutorAgentService;
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
    evolutor = new EvolutorAgentService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS,
      NOOP_INFO_CORE, NOOP_MQ_ACCESS, NOOP_MQ_CORE,
      makeAccess(builder), makeAccess(libSvc), NOOP_AGENT_EXECUTION);
  });

  function aid() { return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

  async function addTestAgent(id: string) {
    await libSvc.addAgent(Object.assign(new AddAgentInput(), {
      agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
    }), new AgentLibraryContext(), new AddAgentOutput());
  }

  describe('evalWorkAgent', () => {
    it('TC-EA-001: 使用默认评分', async () => {
      const agentId = aid();
      await addTestAgent(agentId);
      const out = new EvalWorkAgentOutput();
      await evolutor.evalWorkAgent(Object.assign(new EvalWorkAgentInput(), {
        agent_id: agentId, work_id: 'w', interact_id: 'i', task_content: 'test', agent_output: 'result', trace_id: 'tr-1',
      }), new EvolutorAgentContext(), out);
      expect(out.eval_id).toBeTruthy();
    });

    it('TC-EA-002: need_optimize 基于阈值', async () => {
      const agentId = aid();
      await addTestAgent(agentId);
      await evolutor.configEvolutorAgent(Object.assign(new ConfigEvolutorAgentInput(), { optimize_threshold: 30 }),
        new EvolutorAgentContext(), new ConfigEvolutorAgentOutput());
      const out = new EvalWorkAgentOutput();
      await evolutor.evalWorkAgent(Object.assign(new EvalWorkAgentInput(), {
        agent_id: agentId, work_id: 'w', interact_id: 'i', task_content: 't', agent_output: 'o', trace_id: 'tr',
      }), new EvolutorAgentContext(), out);
      expect(out.need_optimize).toBe(false);
    });
  });

  describe('getEvaluation', () => {
    it('TC-EA-010: 查询评估记录', async () => {
      const out = new GetEvaluationOutput();
      await evolutor.getEvaluation(new GetEvaluationInput(), new EvolutorAgentContext(), out);
      expect(Array.isArray(out.evaluations)).toBe(true);
    });
  });

  describe('getEvolutionReport', () => {
    it('TC-EA-020: 不存在抛 NotFoundError', async () => {
      await expect(evolutor.getEvolutionReport(Object.assign(new GetEvolutionReportInput(), { agent_id: 'nx-no-such-agent' }),
        new EvolutorAgentContext(), new GetEvolutionReportOutput())).rejects.toThrow(NotFoundError);
    });

    it('TC-EA-021: 返回趋势数据', async () => {
      const agentId = aid();
      await addTestAgent(agentId);
      const out = new GetEvolutionReportOutput();
      await evolutor.getEvolutionReport(Object.assign(new GetEvolutionReportInput(), { agent_id: agentId }), new EvolutorAgentContext(), out);
      expect(out.report).toBeTruthy();
      expect(out.report!.agent_id).toBe(agentId);
    });
  });

  describe('configEvolutorAgent', () => {
    it('TC-EA-030: 配置可用', async () => {
      const out = new ConfigEvolutorAgentOutput();
      await evolutor.configEvolutorAgent(new ConfigEvolutorAgentInput(), new EvolutorAgentContext(), out);
      expect(out.config).toBeTruthy();
    });

    it('TC-EA-031: optimize_threshold 范围校验', async () => {
      await expect(evolutor.configEvolutorAgent(Object.assign(new ConfigEvolutorAgentInput(), { optimize_threshold: 150 }),
        new EvolutorAgentContext(), new ConfigEvolutorAgentOutput())).rejects.toThrow(ValidationError);
    });
  });
});
