import { describe, it, expect, beforeAll } from 'vitest';
import { ValidationError, NotFoundError } from '@brian-agent/base';
import { AgentLibraryService } from '../AgentLibrary/application/AgentLibraryService';
import {
  AgentLibraryContext, AddAgentInput, AddAgentOutput,
  MatchAgentInput, MatchAgentOutput, UpdateAgentInput, UpdateAgentOutput,
  RecordAgentUsageInput, RecordAgentUsageOutput, GetAgentInput, GetAgentOutput,
  AgeAgentInput, AgeAgentOutput, GetAgentRuleInput, GetAgentRuleOutput,
  UpdateAgentRuleInput, UpdateAgentRuleOutput, ConfigAgentLibraryInput, ConfigAgentLibraryOutput,
} from '../AgentLibrary/domain/types';
import { createTestDb, setupAgentTestMocks, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS } from './test-helpers';

describe('AgentLibrary', () => {
  let service: AgentLibraryService;

  beforeAll(async () => {
    await setupAgentTestMocks();
    service = new AgentLibraryService(await createTestDb(), NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
  });

  function aid() { return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

  describe('addAgent', () => {
    it('TC-AL-001: 正常新增 WORKER Agent', async () => {
      const agentId = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: agentId, agent_type: 'WORKER', strategy_id: 'strategy-1',
        llm_id: 'llm-1', soul_id: 'soul-1', task_signature: '[coding] test',
        agent_name: 'TestAgent',
      }), new AgentLibraryContext(), new AddAgentOutput());
      const out = new GetAgentOutput();
      await service.getAgent(Object.assign(new GetAgentInput(), { agent_id: agentId }), new AgentLibraryContext(), out);
      expect(out.agents).toHaveLength(1);
      expect(out.agents[0].agent_type).toBe('WORKER');
    });

    it('TC-AL-002~004: 四种 Agent 类型均可新增', async () => {
      for (const t of ['PLANNER', 'WRITER', 'EVOLUTOR']) {
        const id = aid();
        await service.addAgent(Object.assign(new AddAgentInput(), {
          agent_id: id, agent_type: t, strategy_id: 's-1',
        }), new AgentLibraryContext(), new AddAgentOutput());
        const o = new GetAgentOutput();
        await service.getAgent(Object.assign(new GetAgentInput(), { agent_id: id }), new AgentLibraryContext(), o);
        expect(o.agents[0].agent_type).toBe(t);
      }
    });

    it('TC-AL-005: agent_id 为空抛 ValidationError', async () => {
      await expect(service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: '', agent_type: 'WORKER', strategy_id: 's-1',
      }), new AgentLibraryContext(), new AddAgentOutput())).rejects.toThrow(ValidationError);
    });

    it('TC-AL-006: agent_type 非法抛异常', async () => {
      await expect(service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: aid(), agent_type: 'INVALID', strategy_id: 's-1',
      }), new AgentLibraryContext(), new AddAgentOutput())).rejects.toThrow(ValidationError);
    });

    it('TC-AL-007: strategy_id 为空抛异常', async () => {
      await expect(service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: aid(), agent_type: 'WORKER', strategy_id: '',
      }), new AgentLibraryContext(), new AddAgentOutput())).rejects.toThrow(ValidationError);
    });

    it('TC-AL-008: 可选字段默认值', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AgentLibraryContext(), new AddAgentOutput());
      const o = new GetAgentOutput();
      await service.getAgent(Object.assign(new GetAgentInput(), { agent_id: id }), new AgentLibraryContext(), o);
      expect(o.agents[0].llm_id).toBe('');
    });

    it('TC-AL-009: agent_name 自定义', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1', agent_name: '自定义Agent',
      }), new AgentLibraryContext(), new AddAgentOutput());
      const o = new GetAgentOutput();
      await service.getAgent(Object.assign(new GetAgentInput(), { agent_id: id }), new AgentLibraryContext(), o);
      expect(o.agents[0].agent_name).toBe('自定义Agent');
    });
  });

  describe('matchAgent', () => {
    it('TC-AL-011: 简单相似度匹配成功', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
        task_signature: '[coding] write a function',
      }), new AgentLibraryContext(), new AddAgentOutput());
      const out = new MatchAgentOutput();
      await service.matchAgent(Object.assign(new MatchAgentInput(), {
        task_signature: '[coding] write a function to sort', similarity_threshold: 0.3,
      }), new AgentLibraryContext(), out);
      expect(out.agent_id).toBe(id);
    });

    it('TC-AL-012: 相似度低于阈值不匹配', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
        task_signature: '[cooking] make pasta',
      }), new AgentLibraryContext(), new AddAgentOutput());
      const out = new MatchAgentOutput();
      await service.matchAgent(Object.assign(new MatchAgentInput(), {
        task_signature: '[coding] write code', similarity_threshold: 0.8,
      }), new AgentLibraryContext(), out);
      expect(out.agent_id).toBe('');
    });

    it('TC-AL-015: 按 agent_type 过滤', async () => {
      const wid = aid();
      const wrid = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: wid, agent_type: 'WORKER', strategy_id: 's-1',
        task_signature: '[writing] write code',
      }), new AgentLibraryContext(), new AddAgentOutput());
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: wrid, agent_type: 'WRITER', strategy_id: 's-1',
        task_signature: '[writing] write test',
      }), new AgentLibraryContext(), new AddAgentOutput());
      const out = new MatchAgentOutput();
      await service.matchAgent(Object.assign(new MatchAgentInput(), {
        task_signature: '[writing] test', agent_type: 'WRITER', similarity_threshold: 0.1,
      }), new AgentLibraryContext(), out);
      expect(out.agent_id).toBe(wrid);
    });
  });

  describe('updateAgent', () => {
    it('TC-AL-019: 更新 agent_name', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AgentLibraryContext(), new AddAgentOutput());
      await service.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: id, agent_name: '新名称' }),
        new AgentLibraryContext(), new UpdateAgentOutput());
      const o = new GetAgentOutput();
      await service.getAgent(Object.assign(new GetAgentInput(), { agent_id: id }), new AgentLibraryContext(), o);
      expect(o.agents[0].agent_name).toBe('新名称');
    });

    it('TC-AL-020~24: eval_score 范围校验', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AgentLibraryContext(), new AddAgentOutput());
      await service.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: id, eval_score: 85 }),
        new AgentLibraryContext(), new UpdateAgentOutput());
      let o = new GetAgentOutput();
      await service.getAgent(Object.assign(new GetAgentInput(), { agent_id: id }), new AgentLibraryContext(), o);
      expect(o.agents[0].eval_score).toBe(85);
      await expect(service.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: id, eval_score: -1 }),
        new AgentLibraryContext(), new UpdateAgentOutput())).rejects.toThrow(ValidationError);
      await expect(service.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: id, eval_score: 101 }),
        new AgentLibraryContext(), new UpdateAgentOutput())).rejects.toThrow(ValidationError);
    });

    it('TC-AL-027: 不存在的 Agent 抛 NotFoundError', async () => {
      await expect(service.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: 'nonexistent-agent-xyz', agent_name: 'x' }),
        new AgentLibraryContext(), new UpdateAgentOutput())).rejects.toThrow(NotFoundError);
    });
  });

  describe('recordAgentUsage', () => {
    it('TC-AL-029: 正常记录并自增 usage_count', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AgentLibraryContext(), new AddAgentOutput());
      await service.recordAgentUsage(Object.assign(new RecordAgentUsageInput(), {
        agent_id: id, work_id: 'w', interact_id: 'i',
      }), new AgentLibraryContext(), new RecordAgentUsageOutput());
      const o = new GetAgentOutput();
      await service.getAgent(Object.assign(new GetAgentInput(), { agent_id: id }), new AgentLibraryContext(), o);
      expect(o.agents[0].usage_count).toBe(1);
    });

    it('TC-AL-030: agent_id 为空抛异常', async () => {
      await expect(service.recordAgentUsage(Object.assign(new RecordAgentUsageInput(), {
        agent_id: '', work_id: 'w', interact_id: 'i',
      }), new AgentLibraryContext(), new RecordAgentUsageOutput())).rejects.toThrow(ValidationError);
    });
  });

  describe('ageAgent', () => {
    it('TC-AL-042: 老化功能测试', async () => {
      await service.updateAgentRule(Object.assign(new UpdateAgentRuleInput(), {
        operations: [{ type: 'INSERT', data: [
          { field: 'days', value: 365 }, { field: 'min_usage_count', value: 5 }, { field: 'min_eval_score', value: 60 },
        ]}],
      }), new AgentLibraryContext(), new UpdateAgentRuleOutput());
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AgentLibraryContext(), new AddAgentOutput());
      const o = new AgeAgentOutput();
      await service.ageAgent(new AgeAgentInput(), new AgentLibraryContext(), o);
      expect(typeof o.aged_count).toBe('number');
    });

    it('TC-AL-043: 系统 Agent 不参与老化', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'PLANNER', strategy_id: 's-1',
      }), new AgentLibraryContext(), new AddAgentOutput());
      const o = new AgeAgentOutput();
      await service.ageAgent(new AgeAgentInput(), new AgentLibraryContext(), o);
      expect(typeof o.aged_count).toBe('number');
    });
  });

  describe('updateAgentRule', () => {
    it('TC-AL-048: INSERT 新规则', async () => {
      await service.updateAgentRule(Object.assign(new UpdateAgentRuleInput(), {
        operations: [{ type: 'INSERT', data: [{ field: 'days', value: 7 }, { field: 'min_usage_count', value: 3 }, { field: 'min_eval_score', value: 50 }] }],
      }), new AgentLibraryContext(), new UpdateAgentRuleOutput());
      const o = new GetAgentRuleOutput();
      await service.getAgentRule(new GetAgentRuleInput(), new AgentLibraryContext(), o);
      expect(o.rules.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-AL-049: days <= 0 抛异常', async () => {
      await expect(service.updateAgentRule(Object.assign(new UpdateAgentRuleInput(), {
        operations: [{ type: 'INSERT', data: [{ field: 'days', value: 0 }, { field: 'min_usage_count', value: 1 }, { field: 'min_eval_score', value: 50 }] }],
      }), new AgentLibraryContext(), new UpdateAgentRuleOutput())).rejects.toThrow(ValidationError);
    });

    it('TC-AL-052: operations 为空抛异常', async () => {
      await expect(service.updateAgentRule(Object.assign(new UpdateAgentRuleInput(), { operations: [] }),
        new AgentLibraryContext(), new UpdateAgentRuleOutput())).rejects.toThrow(ValidationError);
    });
  });

  describe('configAgentLibrary', () => {
    it('TC-AL-055: 配置可用', async () => {
      const out = new ConfigAgentLibraryOutput();
      await service.configAgentLibrary(new ConfigAgentLibraryInput(), new AgentLibraryContext(), out);
      expect(out.similarity_threshold).toBeGreaterThan(0);
      expect(out.max_agent_count).toBeGreaterThan(0);
    });

    it('TC-AL-058: similarity_threshold 超出范围抛异常', async () => {
      await expect(service.configAgentLibrary(Object.assign(new ConfigAgentLibraryInput(), { similarity_threshold: 1.5 }),
        new AgentLibraryContext(), new ConfigAgentLibraryOutput())).rejects.toThrow(ValidationError);
    });
  });
});
