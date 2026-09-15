import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ValidationError, NotFoundError } from '@brian-agent/base';
import { EvolutorAgentService } from '../EvolutorAgent/application/EvolutorAgentService';
import { AgentBuilderService } from '../AgentBuilder/application/AgentBuilderService';
import { AgentLibraryService } from '../AgentLibrary/application/AgentLibraryService';
import { AgentStrategyService } from '../AgentStrategy/application/AgentStrategyService';
import { createTestDb, makeAccess, setupAgentTestMocks,
  EvolutorAgentContext, EvalWorkAgentInput, EvalWorkAgentOutput,
  EvalWriterAgentInput, EvalWriterAgentOutput,
  GetEvaluationInput, GetEvaluationOutput, GetEvolutionReportInput, GetEvolutionReportOutput,
  ConfigEvolutorAgentInput, ConfigEvolutorAgentOutput,
} from '../EvolutorAgent/domain/types';
import { AgentLibraryContext, AddAgentInput, AddAgentOutput,
  UpdateAgentInput, UpdateAgentOutput, RecordAgentUsageInput, RecordAgentUsageOutput,
  GetAgentInput, GetAgentOutput } from '../AgentLibrary/domain/types';
import { createTestDb, makeAccess, setupAgentTestMocks,
  NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS, NOOP_MQ_ACCESS,
  NOOP_INFO_CORE, NOOP_MQ_CORE,
  NOOP_LLM_CORE, NOOP_MCP_CORE, NOOP_SKILL_CORE, NOOP_SOUL_CORE,
} from './test-helpers';

const NOOP_AGENT_EXECUTION = {
  soTrace: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => { o.trace = null; return true; }),
} as any;

describe('EvolutorAgent', () => {
  let evolutor: EvolutorAgentService;
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
    evolutor = new EvolutorAgentService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS,
      NOOP_INFO_CORE, NOOP_MQ_ACCESS, NOOP_MQ_CORE,
      makeAccess(builder), makeAccess(libSvc), NOOP_AGENT_EXECUTION);
  });

  function aid() { return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

  async function addTestAgent(id: string) {
    await libSvc.addAgent(Object.assign(new AddAgentInput(), {
      agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
    }), new AddAgentOutput(), new AgentLibraryContext());
  }

  describe('evalWorkAgent', () => {
    it('TC-EA-001: 使用默认评分', async () => {
      const agentId = aid();
      await addTestAgent(agentId);
      const out = new EvalWorkAgentOutput();
      await evolutor.evalWorkAgent(Object.assign(new EvalWorkAgentInput(), {
        agent_id: agentId, work_id: 'w', run_id: 'i', task_content: 'test', agent_output: 'result', trace_id: 'tr-1',
      }), out, new EvolutorAgentContext());
      expect(out.eval_id).toBeTruthy();
    });

    it('TC-EA-002: need_optimize 基于阈值', async () => {
      const agentId = aid();
      await addTestAgent(agentId);
      await evolutor.configEvolutorAgent(Object.assign(new ConfigEvolutorAgentInput(), { optimize_threshold: 30 }),
        new ConfigEvolutorAgentOutput(), new EvolutorAgentContext());
      const out = new EvalWorkAgentOutput();
      await evolutor.evalWorkAgent(Object.assign(new EvalWorkAgentInput(), {
        agent_id: agentId, work_id: 'w', run_id: 'i', task_content: 't', agent_output: 'o', trace_id: 'tr',
      }), out, new EvolutorAgentContext());
      expect(out.need_optimize).toBe(false);
    });

    it('TC-EA-003: usage_count 加权平均更新 eval_score', async () => {
      const agentId = aid();
      await addTestAgent(agentId);
      await libSvc.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: agentId, eval_score: 70 }),
        new UpdateAgentOutput(), new AgentLibraryContext());
      for (let i = 0; i < 5; i++) {
        await libSvc.recordAgentUsage(Object.assign(new RecordAgentUsageInput(), {
          agent_id: agentId, work_id: `w-${i}`, run_id: 'i', usage_context: '{}',
        }), new RecordAgentUsageOutput(), new AgentLibraryContext());
      }
      await evolutor.evalWorkAgent(Object.assign(new EvalWorkAgentInput(), {
        agent_id: agentId, work_id: 'w-x', run_id: 'i', task_content: 't', agent_output: 'o', trace_id: 'tr',
      }), new EvalWorkAgentOutput(), new EvolutorAgentContext());
      // (70*5 + 50) / 6 = 400/6 = 66.67 → 67
      const getOut = new GetAgentOutput();
      await libSvc.soAgent(Object.assign(new GetAgentInput(), { agent_id: agentId }),
        getOut, new AgentLibraryContext());
      expect(getOut.agents[0].eval_score).toBe(67);
    });
  });

  describe('soEvaluation', () => {
    it('TC-EA-010: 查询评估记录', async () => {
      const out = new GetEvaluationOutput();
      await evolutor.soEvaluation(new GetEvaluationInput(), out, new EvolutorAgentContext());
      expect(Array.isArray(out.evaluations)).toBe(true);
    });
  });

  describe('soEvolutionReport', () => {
    it('TC-EA-020: 不存在抛 NotFoundError', async () => {
      await expect(evolutor.soEvolutionReport(Object.assign(new GetEvolutionReportInput(), { agent_id: 'nx-no-such-agent' }),
        new GetEvolutionReportOutput(), new EvolutorAgentContext())).rejects.toThrow(NotFoundError);
    });

    it('TC-EA-021: 返回趋势数据', async () => {
      const agentId = aid();
      await addTestAgent(agentId);
      const out = new GetEvolutionReportOutput();
      await evolutor.soEvolutionReport(Object.assign(new GetEvolutionReportInput(), { agent_id: agentId }), out, new EvolutorAgentContext());
      expect(out.report).toBeTruthy();
      expect(out.report!.agent_id).toBe(agentId);
    });
  });

  describe('configEvolutorAgent', () => {
    it('TC-EA-030: 配置可用', async () => {
      const out = new ConfigEvolutorAgentOutput();
      await evolutor.configEvolutorAgent(new ConfigEvolutorAgentInput(), out, new EvolutorAgentContext());
      expect(out.config).toBeTruthy();
    });

    it('TC-EA-031: optimize_threshold 范围校验', async () => {
      await expect(evolutor.configEvolutorAgent(Object.assign(new ConfigEvolutorAgentInput(), { optimize_threshold: 150 }),
        new ConfigEvolutorAgentOutput(), new EvolutorAgentContext())).rejects.toThrow(ValidationError);
    });

    it('TC-EA-032: eval_frequency_threshold 非正整数抛异常', async () => {
      await expect(evolutor.configEvolutorAgent(Object.assign(new ConfigEvolutorAgentInput(), { eval_frequency_threshold: 0 }),
        new ConfigEvolutorAgentOutput(), new EvolutorAgentContext())).rejects.toThrow(ValidationError);
      await expect(evolutor.configEvolutorAgent(Object.assign(new ConfigEvolutorAgentInput(), { eval_frequency_threshold: -1 }),
        new ConfigEvolutorAgentOutput(), new EvolutorAgentContext())).rejects.toThrow(ValidationError);
      await expect(evolutor.configEvolutorAgent(Object.assign(new ConfigEvolutorAgentInput(), { eval_frequency_threshold: 2.5 }),
        new ConfigEvolutorAgentOutput(), new EvolutorAgentContext())).rejects.toThrow(ValidationError);
    });

    it('TC-EA-033: 更新 llm_id', async () => {
      const out = new ConfigEvolutorAgentOutput();
      await evolutor.configEvolutorAgent(Object.assign(new ConfigEvolutorAgentInput(), { llm_id: 'evolutor-model-1' }),
        out, new EvolutorAgentContext());
      expect(out.config?.llm_id).toBe('evolutor-model-1');
    });
  });

  describe('evalWriterAgent', () => {
    it('TC-EA-040: evalWriterAgent 记录执行轨迹（trace_id + token 用量）', async () => {
      const mockLLM = {
        execLLM: vi.fn().mockImplementation(async (_i: unknown, o: { result?: string; input_tokens?: number; output_tokens?: number; raw_response?: string }, _c: unknown) => {
          o.result = JSON.stringify({ clarity: 80, informativeness: 80, user_alignment: 80, conciseness: 80, overall: 80, suggestions: [] });
          o.input_tokens = 60;
          o.output_tokens = 40;
          o.raw_response = '{"overall":80}';
          return true;
        }),
      } as any;
      const traceEvolutor = new EvolutorAgentService(db, mockLLM, NOOP_PROMPTS_ACCESS,
        NOOP_INFO_CORE, NOOP_MQ_ACCESS, NOOP_MQ_CORE,
        makeAccess(builder), makeAccess(libSvc), NOOP_AGENT_EXECUTION);
      const out = new EvalWriterAgentOutput();
      await traceEvolutor.evalWriterAgent(Object.assign(new EvalWriterAgentInput(), {
        agent_id: 'writer-1', work_id: 'w-1', run_id: 'i-1',
        user_query: '帮我汇总', final_response: '最终回复',
        agent_results: [{ agent_id: 'a1', task_content: 't1', result: 'r1' }],
      }), out, new EvolutorAgentContext());
      expect(out.trace_id).toBeTruthy();
      const rows = db.queryRaw<{ trace_id: string; total_token_usage: number }>(
        'SELECT "trace_id", "total_token_usage" FROM "agent_execution_trace" WHERE "trace_id" = ?',
        [out.trace_id],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].total_token_usage).toBe(100);
    });
  });
});
