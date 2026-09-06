import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeAll } from 'vitest';
import { ValidationError, NotFoundError, IdGenerator } from '@brian-agent/base';
import type { RelationDBAccess } from '@brian-agent/base';
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
  let db: RelationDBAccess;

  beforeAll(async () => {
    await setupAgentTestMocks();
    db = await createTestDb();
    try {
      db.executeRaw('ALTER TABLE agent_library_config ADD COLUMN regen_rate INTEGER NOT NULL DEFAULT 75');
    } catch {}
    service = new AgentLibraryService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
  });

  function aid() { return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

  describe('addAgent', () => {
    it('TC-AL-001: 正常新增 WORKER Agent', async () => {
      const agentId = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: agentId, agent_type: 'WORKER', strategy_id: 'strategy-1',
        llm_id: 'llm-1', soul_id: 'soul-1', task_signature: '[coding] test',
        agent_name: 'TestAgent',
      }), new AddAgentOutput(), new AgentLibraryContext());
      const out = new GetAgentOutput();
      await service.soAgent(Object.assign(new GetAgentInput(), { agent_id: agentId }), out, new AgentLibraryContext());
      expect(out.agents).toHaveLength(1);
      expect(out.agents[0].agent_type).toBe('WORKER');
    });

    it('TC-AL-002~004: 四种 Agent 类型均可新增', async () => {
      for (const t of ['PLANNER', 'WRITER', 'EVOLUTOR']) {
        const id = aid();
        await service.addAgent(Object.assign(new AddAgentInput(), {
          agent_id: id, agent_type: t, strategy_id: 's-1',
        }), new AddAgentOutput(), new AgentLibraryContext());
        const o = new GetAgentOutput();
        await service.soAgent(Object.assign(new GetAgentInput(), { agent_id: id }), o, new AgentLibraryContext());
        expect(o.agents[0].agent_type).toBe(t);
      }
    });

    it('TC-AL-005: agent_id 为空抛 ValidationError', async () => {
      await expect(service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: '', agent_type: 'WORKER', strategy_id: 's-1',
      }), new AddAgentOutput(), new AgentLibraryContext())).rejects.toThrow(ValidationError);
    });

    it('TC-AL-006: agent_type 非法抛异常', async () => {
      await expect(service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: aid(), agent_type: 'INVALID', strategy_id: 's-1',
      }), new AddAgentOutput(), new AgentLibraryContext())).rejects.toThrow(ValidationError);
    });

    it('TC-AL-007: strategy_id 为空抛异常', async () => {
      await expect(service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: aid(), agent_type: 'WORKER', strategy_id: '',
      }), new AddAgentOutput(), new AgentLibraryContext())).rejects.toThrow(ValidationError);
    });

    it('TC-AL-008: 可选字段默认值', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AddAgentOutput(), new AgentLibraryContext());
      const o = new GetAgentOutput();
      await service.soAgent(Object.assign(new GetAgentInput(), { agent_id: id }), o, new AgentLibraryContext());
      expect(o.agents[0].soul_id).toBe('');
    });

    it('TC-AL-009: agent_name 自定义', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1', agent_name: '自定义Agent',
      }), new AddAgentOutput(), new AgentLibraryContext());
      const o = new GetAgentOutput();
      await service.soAgent(Object.assign(new GetAgentInput(), { agent_id: id }), o, new AgentLibraryContext());
      expect(o.agents[0].agent_name).toBe('自定义Agent');
    });
  });

  describe('matchAgent', () => {
    it('TC-AL-011: 简单相似度匹配成功', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
        task_signature: '[coding] write a function',
      }), new AddAgentOutput(), new AgentLibraryContext());
      const out = new MatchAgentOutput();
      await service.configAgentLibrary(Object.assign(new ConfigAgentLibraryInput(), { regen_rate: 0 }), new ConfigAgentLibraryOutput(), new AgentLibraryContext());
      await service.matchAgent(Object.assign(new MatchAgentInput(), {
        task_signature: '[coding] write a function to sort', similarity_threshold: 0.3,
      }), out, new AgentLibraryContext());
      expect(out.agent_id).toBe(id);
    });

    it('TC-AL-012: 相似度低于阈值不匹配', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
        task_signature: '[cooking] make pasta',
      }), new AddAgentOutput(), new AgentLibraryContext());
      const out = new MatchAgentOutput();
      await service.configAgentLibrary(Object.assign(new ConfigAgentLibraryInput(), { regen_rate: 0 }), new ConfigAgentLibraryOutput(), new AgentLibraryContext());
      await service.matchAgent(Object.assign(new MatchAgentInput(), {
        task_signature: '[general] 请问如何开发一个 Agent 助手框架？', similarity_threshold: 0.5,
      }), out, new AgentLibraryContext());
      expect(out.agent_id).toBe('');
    });

    it('TC-AL-013: 中文及类似提问成功精准匹配复用已有 Agent', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
        task_signature: '[general] 如何开发一个个人Agent？',
      }), new AddAgentOutput(), new AgentLibraryContext());

      const out = new MatchAgentOutput();
      await service.configAgentLibrary(Object.assign(new ConfigAgentLibraryInput(), { regen_rate: 0 }), new ConfigAgentLibraryOutput(), new AgentLibraryContext());
      await service.matchAgent(Object.assign(new MatchAgentInput(), {
        task_signature: '[general] 如何开发一个个人Agent',
        similarity_threshold: 0.7,
      }), out, new AgentLibraryContext());

      expect(out.agent_id).toBe(id);
      expect(out.similarity_score).toBeGreaterThanOrEqual(0.7);
    });

    it('TC-AL-015: 按 agent_type 过滤', async () => {
      const wid = aid();
      const wrid = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: wid, agent_type: 'WORKER', strategy_id: 's-1',
        task_signature: '[writing] write code',
      }), new AddAgentOutput(), new AgentLibraryContext());
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: wrid, agent_type: 'WRITER', strategy_id: 's-1',
        task_signature: '[writing] write test',
      }), new AddAgentOutput(), new AgentLibraryContext());
      const out = new MatchAgentOutput();
      await service.configAgentLibrary(Object.assign(new ConfigAgentLibraryInput(), { regen_rate: 0 }), new ConfigAgentLibraryOutput(), new AgentLibraryContext());
      await service.matchAgent(Object.assign(new MatchAgentInput(), {
        task_signature: '[writing] test', agent_type: 'WRITER', similarity_threshold: 0.1,
      }), out, new AgentLibraryContext());
      expect(out.agent_id).toBe(wrid);
    });
  });

  describe('updateAgent', () => {
    it('TC-AL-019: 更新 agent_name', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AddAgentOutput(), new AgentLibraryContext());
      await service.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: id, agent_name: '新名称' }),
        new UpdateAgentOutput(), new AgentLibraryContext());
      const o = new GetAgentOutput();
      await service.soAgent(Object.assign(new GetAgentInput(), { agent_id: id }), o, new AgentLibraryContext());
      expect(o.agents[0].agent_name).toBe('新名称');
    });

    it('TC-AL-020~24: eval_score 范围校验', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AddAgentOutput(), new AgentLibraryContext());
      await service.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: id, eval_score: 85 }),
        new UpdateAgentOutput(), new AgentLibraryContext());
      let o = new GetAgentOutput();
      await service.soAgent(Object.assign(new GetAgentInput(), { agent_id: id }), o, new AgentLibraryContext());
      expect(o.agents[0].eval_score).toBe(85);
      await expect(service.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: id, eval_score: -1 }),
        new UpdateAgentOutput(), new AgentLibraryContext())).rejects.toThrow(ValidationError);
      await expect(service.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: id, eval_score: 101 }),
        new UpdateAgentOutput(), new AgentLibraryContext())).rejects.toThrow(ValidationError);
    });

    it('TC-AL-027: 不存在的 Agent 抛 NotFoundError', async () => {
      await expect(service.updateAgent(Object.assign(new UpdateAgentInput(), { agent_id: 'nonexistent-agent-xyz', agent_name: 'x' }),
        new UpdateAgentOutput(), new AgentLibraryContext())).rejects.toThrow(NotFoundError);
    });
  });

  describe('recordAgentUsage', () => {
    it('TC-AL-029: 正常记录并自增 usage_count', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AddAgentOutput(), new AgentLibraryContext());
      await service.recordAgentUsage(Object.assign(new RecordAgentUsageInput(), {
        agent_id: id, work_id: 'w', interact_id: 'i',
      }), new RecordAgentUsageOutput(), new AgentLibraryContext());
      const o = new GetAgentOutput();
      await service.soAgent(Object.assign(new GetAgentInput(), { agent_id: id }), o, new AgentLibraryContext());
      expect(o.agents[0].usage_count).toBe(1);
    });

    it('TC-AL-029b: 按日统计表 agent_usage_daily 当天计数自增', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AddAgentOutput(), new AgentLibraryContext());
      for (let i = 0; i < 3; i++) {
        await service.recordAgentUsage(Object.assign(new RecordAgentUsageInput(), {
          agent_id: id, work_id: 'w', interact_id: 'i',
        }), new RecordAgentUsageOutput(), new AgentLibraryContext());
      }
      const daily = db.queryRaw<{ usage_date: string; usage_count: number }>(
        'SELECT "usage_date", "usage_count" FROM "agent_usage_daily" WHERE "agent_id" = ?', [id],
      );
      expect(daily.length).toBe(1);
      expect(daily[0].usage_count).toBe(3);
      expect(daily[0].usage_date).toBe(IdGenerator.today());
    });

    it('TC-AL-030: agent_id 为空抛异常', async () => {
      await expect(service.recordAgentUsage(Object.assign(new RecordAgentUsageInput(), {
        agent_id: '', work_id: 'w', interact_id: 'i',
      }), new RecordAgentUsageOutput(), new AgentLibraryContext())).rejects.toThrow(ValidationError);
    });
  });

  describe('ageAgent', () => {
    it('TC-AL-042: 老化功能测试', async () => {
      await service.updateAgentRule(Object.assign(new UpdateAgentRuleInput(), {
        operations: [{ type: 'INSERT', data: [
          { field: 'days', value: 365 }, { field: 'min_usage_count', value: 5 }, { field: 'min_eval_score', value: 60 },
        ]}],
      }), new UpdateAgentRuleOutput(), new AgentLibraryContext());
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'WORKER', strategy_id: 's-1',
      }), new AddAgentOutput(), new AgentLibraryContext());
      const o = new AgeAgentOutput();
      await service.ageAgent(new AgeAgentInput(), o, new AgentLibraryContext());
      expect(typeof o.aged_count).toBe('number');
    });

    it('TC-AL-043: 系统 Agent 不参与老化', async () => {
      const id = aid();
      await service.addAgent(Object.assign(new AddAgentInput(), {
        agent_id: id, agent_type: 'PLANNER', strategy_id: 's-1',
      }), new AddAgentOutput(), new AgentLibraryContext());
      const o = new AgeAgentOutput();
      await service.ageAgent(new AgeAgentInput(), o, new AgentLibraryContext());
      expect(typeof o.aged_count).toBe('number');
    });
  });

  describe('updateAgentRule', () => {
    it('TC-AL-048: INSERT 新规则', async () => {
      await service.updateAgentRule(Object.assign(new UpdateAgentRuleInput(), {
        operations: [{ type: 'INSERT', data: [{ field: 'days', value: 7 }, { field: 'min_usage_count', value: 3 }, { field: 'min_eval_score', value: 50 }] }],
      }), new UpdateAgentRuleOutput(), new AgentLibraryContext());
      const o = new GetAgentRuleOutput();
      await service.soAgentRule(new GetAgentRuleInput(), o, new AgentLibraryContext());
      expect(o.rules.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-AL-049: days <= 0 抛异常', async () => {
      await expect(service.updateAgentRule(Object.assign(new UpdateAgentRuleInput(), {
        operations: [{ type: 'INSERT', data: [{ field: 'days', value: 0 }, { field: 'min_usage_count', value: 1 }, { field: 'min_eval_score', value: 50 }] }],
      }), new UpdateAgentRuleOutput(), new AgentLibraryContext())).rejects.toThrow(ValidationError);
    });

    it('TC-AL-052: operations 为空抛异常', async () => {
      await expect(service.updateAgentRule(Object.assign(new UpdateAgentRuleInput(), { operations: [] }),
        new UpdateAgentRuleOutput(), new AgentLibraryContext())).rejects.toThrow(ValidationError);
    });
  });

  describe('configAgentLibrary', () => {
    it('TC-AL-055: 配置可用', async () => {
      const out = new ConfigAgentLibraryOutput();
      await service.configAgentLibrary(new ConfigAgentLibraryInput(), out, new AgentLibraryContext());
      expect(out.similarity_threshold).toBeGreaterThan(0);
      expect(out.max_agent_count).toBeGreaterThan(0);
    });

    it('TC-AL-058: similarity_threshold 超出范围抛异常', async () => {
      await expect(service.configAgentLibrary(Object.assign(new ConfigAgentLibraryInput(), { similarity_threshold: 1.5 }),
        new ConfigAgentLibraryOutput(), new AgentLibraryContext())).rejects.toThrow(ValidationError);
    });
  });
});


describe('AgentLibrary.matchAgent 流程语义（匹配最佳 Agent / 失效概率重构）', () => {
  let service: AgentLibraryService;

  beforeAll(async () => {
    await setupAgentTestMocks();
    const db = await createTestDb();
    try {
      db.executeRaw('ALTER TABLE agent_library_config ADD COLUMN regen_rate INTEGER NOT NULL DEFAULT 75');
    } catch { /* 已存在 */ }
    service = new AgentLibraryService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
  });

  async function seed(agentId: string, purpose: string, signature: string) {
    await service.addAgent(Object.assign(new AddAgentInput(), {
      agent_id: agentId, agent_type: 'WORKER', strategy_id: 'strategy-1',
      soul_id: '', task_signature: signature, agent_name: agentId, agent_purpose: purpose,
    }), new AddAgentOutput(), new AgentLibraryContext());
  }

  it('说明（agent_purpose）应参与匹配：签名不匹配但说明语义相近可命中', async () => {
    // regen_rate=0 → 恒复用（排除失效概率干扰，验证匹配面）
    await service.configAgentLibrary(Object.assign(new ConfigAgentLibraryInput(), { regen_rate: 0 }), new ConfigAgentLibraryOutput(), new AgentLibraryContext());
    // 说明与任务文本高重叠，而 task_signature 刻意不同：命中只能来自说明参与匹配
    await seed('flow-purpose', '负责天气查询与城市天气预报', '[general] other');
    const out = new MatchAgentOutput();
    await service.matchAgent(Object.assign(new MatchAgentInput(), {
      task_signature: '[general] totally-different',
      task_content: '天气查询与城市天气预报',
      agent_type: 'WORKER',
      similarity_threshold: 0.2,
    }), out, new AgentLibraryContext());
    expect(out.matched).toBe(true);
    expect(out.agent_id).toBe('flow-purpose');
    expect(out.matched_by).toBe('SIMILARITY');
  });

  it('失效概率命中时应输出 regenerate=true 且不返回 agent_id（触发 Agent 重构）', async () => {
    // regen_rate=100 → shouldReuseByRegenRate 恒 false：命中也必须重构（确定性）
    await service.configAgentLibrary(Object.assign(new ConfigAgentLibraryInput(), { regen_rate: 100 }), new ConfigAgentLibraryOutput(), new AgentLibraryContext());
    await seed('flow-regen', '负责电商订单领域任务处理', '[general] other-2');
    const out = new MatchAgentOutput();
    await service.matchAgent(Object.assign(new MatchAgentInput(), {
      task_signature: '[general] other-2',
      task_content: '',
      agent_type: 'WORKER',
      similarity_threshold: 0.1,
    }), out, new AgentLibraryContext());
    expect(out.matched).toBe(true);
    expect(out.regenerate).toBe(true);
    expect(out.agent_id).toBe('');
  });
});
