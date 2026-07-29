import { Input, Context, Output } from '../../shared/base';
import { ValidationError, NotFoundError } from '../../shared/errors';
import { logger } from '../../infrastructure/logger';
import { AopProxy } from '../infra/aopProxy';
import * as db from './db';
import type { AgentTypeEnum } from './agentTypes';

class AddAgentInput extends Input {
  agent_id!: string;
  agent_type!: AgentTypeEnum;
  strategy_id!: string;
  llm_id!: string;
  soul_id!: string;
  task_signature!: string;
  agent_name!: string;
  constructor(data: Partial<AddAgentInput>) { super(data); Object.assign(this, data); }
}
class AddAgentContext extends Context { }
class AddAgentOutput extends Output { agent_id?: string; }

class MatchAgentInput extends Input {
  task_signature!: string;
  agent_type?: AgentTypeEnum;
  similarity_threshold?: number;
  constructor(data: Partial<MatchAgentInput>) { super(data); Object.assign(this, data); }
}
class MatchAgentContext extends Context { }
class MatchAgentOutput extends Output { agent_id?: string; similarity_score?: number; }

class UpdateAgentInput extends Input {
  agent_id!: string;
  agent_name?: string;
  task_signature?: string;
  eval_score?: number;
  enable?: boolean;
  strategy_id?: string;
  constructor(data: Partial<UpdateAgentInput>) { super(data); Object.assign(this, data); }
}
class UpdateAgentContext extends Context { }
class UpdateAgentOutput extends Output { }

class RecordAgentUsageInput extends Input {
  agent_id!: string;
  work_id!: string;
  interact_id!: string;
  usage_context?: string;
  constructor(data: Partial<RecordAgentUsageInput>) { super(data); Object.assign(this, data); }
}
class RecordAgentUsageContext extends Context { }
class RecordAgentUsageOutput extends Output { }

class GetAgentInput extends Input {
  agent_id?: string;
  agent_type?: AgentTypeEnum;
  conditions?: string;
  order_by?: string;
  page_num?: number;
  page_size?: number;
  constructor(data: Partial<GetAgentInput>) { super(data); Object.assign(this, data); }
}
class GetAgentContext extends Context { }
class GetAgentOutput extends Output { agents?: db.AgentRow[]; }

class AgeAgentInput extends Input { }
class AgeAgentContext extends Context { }
class AgeAgentOutput extends Output { aged_count?: number; }

class GetAgentRuleInput extends Input {
  conditions?: string;
  order_by?: string;
  page_num?: number;
  page_size?: number;
  constructor(data: Partial<GetAgentRuleInput>) { super(data); Object.assign(this, data); }
}
class GetAgentRuleContext extends Context { }
class GetAgentRuleOutput extends Output { rules?: db.AgentOptRuleRow[]; }

class UpdateAgentRuleInput extends Input {
  operations!: { type: 'INSERT' | 'UPDATE' | 'DELETE'; id?: string; data?: { days?: number; min_usage_count?: number; min_eval_score?: number } }[];
  constructor(data: Partial<UpdateAgentRuleInput>) { super(data); Object.assign(this, data); }
}
class UpdateAgentRuleContext extends Context { }
class UpdateAgentRuleOutput extends Output { }

class ConfigAgentLibraryInput extends Input {
  prompt_template_id?: string;
  similarity_threshold?: number;
  max_agent_count?: number;
  constructor(data: Partial<ConfigAgentLibraryInput>) { super(data); Object.assign(this, data); }
}
class ConfigAgentLibraryContext extends Context { }
class ConfigAgentLibraryOutput extends Output {
  prompt_template_id?: string;
  similarity_threshold?: number;
  max_agent_count?: number;
}

export { AddAgentInput, MatchAgentInput, UpdateAgentInput, RecordAgentUsageInput, GetAgentInput, AgeAgentInput, GetAgentRuleInput, UpdateAgentRuleInput, ConfigAgentLibraryInput };
export { AddAgentContext, MatchAgentContext, UpdateAgentContext, RecordAgentUsageContext, GetAgentContext, AgeAgentContext, GetAgentRuleContext, UpdateAgentRuleContext, ConfigAgentLibraryContext };
export { AddAgentOutput, MatchAgentOutput, UpdateAgentOutput, RecordAgentUsageOutput, GetAgentOutput, AgeAgentOutput, GetAgentRuleOutput, UpdateAgentRuleOutput, ConfigAgentLibraryOutput };

const MODULE = 'AgentLibrary';

export class AgentLibraryService {
  addAgent(input: AddAgentInput, _context: AddAgentContext, output: AddAgentOutput): boolean {
    logger.info(MODULE, '[addAgent] start', { agent_id: input.agent_id, agent_type: input.agent_type });
    if (!input.agent_id || !input.agent_type || !input.strategy_id) {
      throw new ValidationError('agent_id, agent_type, and strategy_id are required');
    }
    const validTypes: AgentTypeEnum[] = ['WORKER', 'PLANNER', 'WRITER', 'EVOLUTOR'];
    if (!validTypes.includes(input.agent_type)) {
      throw new ValidationError(`Invalid agent_type: ${input.agent_type}`);
    }
    output.agent_id = db.addAgent({
      agent_id: input.agent_id,
      agent_type: input.agent_type,
      strategy_id: input.strategy_id,
      llm_id: input.llm_id || '',
      soul_id: input.soul_id || '',
      task_signature: input.task_signature || '',
      agent_name: input.agent_name || input.agent_id,
    });
    logger.info(MODULE, '[addAgent] done', { agent_id: output.agent_id });
    return true;
  }

  matchAgent(input: MatchAgentInput, _context: MatchAgentContext, output: MatchAgentOutput): boolean {
    logger.info(MODULE, '[matchAgent] start', { task_signature: input.task_signature?.substring(0, 100), agent_type: input.agent_type });
    const config = db.getAgentLibraryConfig();
    const threshold = input.similarity_threshold ?? config.similarity_threshold;

    const agents = db.listAgents({ enable: true });
    if (input.agent_type) {
      const filtered = agents.filter(a => a.agent_type === input.agent_type);
      if (filtered.length > 0) {
        const scored = filtered.map(a => ({
          agent: a,
          similarity: this.calculateSimilarity(input.task_signature, a.task_signature),
        }));
        scored.sort((a, b) => b.similarity - a.similarity);
        if (scored[0].similarity >= threshold) {
          output.agent_id = scored[0].agent.agent_id;
          output.similarity_score = scored[0].similarity;
          logger.info(MODULE, '[matchAgent] matched by type filter', { agent_id: output.agent_id, score: output.similarity_score });
          return true;
        }
      }
    }

    const scored = agents.map(a => ({
      agent: a,
      similarity: this.calculateSimilarity(input.task_signature, a.task_signature),
    }));
    scored.sort((a, b) => b.similarity - a.similarity);

    if (scored.length > 0 && scored[0].similarity >= threshold) {
      output.agent_id = scored[0].agent.agent_id;
      output.similarity_score = scored[0].similarity;
    } else {
      output.agent_id = '';
      output.similarity_score = 0;
    }
    logger.info(MODULE, '[matchAgent] result', { agent_id: output.agent_id, score: output.similarity_score });
    return true;
  }

  updateAgent(input: UpdateAgentInput, _context: UpdateAgentContext, _output: UpdateAgentOutput): boolean {
    logger.info(MODULE, '[updateAgent] start', { agent_id: input.agent_id });
    const existing = db.getAgentByAgentId(input.agent_id);
    if (!existing) throw new NotFoundError(`Agent ${input.agent_id}`);

    const updates: Record<string, unknown> = {};
    if (input.agent_name !== undefined) updates.agent_name = input.agent_name;
    if (input.task_signature !== undefined) updates.task_signature = input.task_signature;
    if (input.eval_score !== undefined) {
      if (input.eval_score < 0 || input.eval_score > 100) throw new ValidationError('eval_score must be 0-100');
      updates.eval_score = input.eval_score;
    }
    if (input.enable !== undefined) updates.enable = input.enable ? 1 : 0;
    if (input.strategy_id !== undefined) updates.strategy_id = input.strategy_id;

    if (Object.keys(updates).length === 0) return true;
    db.updateAgent(input.agent_id, updates as never);
    logger.info(MODULE, '[updateAgent] done', { agent_id: input.agent_id });
    return true;
  }

  recordAgentUsage(input: RecordAgentUsageInput, _context: RecordAgentUsageContext, _output: RecordAgentUsageOutput): boolean {
    logger.info(MODULE, '[recordAgentUsage] start', { agent_id: input.agent_id, work_id: input.work_id });
    const existing = db.getAgentByAgentId(input.agent_id);
    if (!existing) throw new NotFoundError(`Agent ${input.agent_id}`);
    db.recordAgentUsage({
      agent_id: input.agent_id,
      work_id: input.work_id || '',
      interact_id: input.interact_id || '',
      usage_context: input.usage_context,
    });
    logger.info(MODULE, '[recordAgentUsage] done');
    return true;
  }

  getAgent(input: GetAgentInput, _context: GetAgentContext, output: GetAgentOutput): boolean {
    logger.info(MODULE, '[getAgent] start', { agent_id: input.agent_id, agent_type: input.agent_type });
    if (input.agent_id) {
      const agent = db.getAgentByAgentId(input.agent_id);
      if (!agent) throw new NotFoundError(`Agent ${input.agent_id}`);
      output.agents = [agent];
    } else {
      output.agents = db.listAgents({
        agent_type: input.agent_type,
        enable: true,
        order_by: input.order_by,
        page_num: input.page_num,
        page_size: input.page_size,
      });
    }
    return true;
  }

  ageAgent(_input: AgeAgentInput, _context: AgeAgentContext, output: AgeAgentOutput): boolean {
    logger.info(MODULE, '[ageAgent] start');
    const rules = db.listAgentOptRules();
    if (rules.length === 0) { output.aged_count = 0; return true; }

    const agents = db.listAgents({ enable: true });

    const agedSet = new Set<string>();
    for (const rule of rules) {
      for (const agent of agents) {
        if (agent.agent_type === 'PLANNER' || agent.agent_type === 'WRITER' || agent.agent_type === 'EVOLUTOR') continue;
        const usageCount = db.getAgentUsageCount(agent.agent_id, rule.days);
        if (usageCount < rule.min_usage_count && agent.eval_score < rule.min_eval_score) {
          agedSet.add(agent.agent_id);
        }
      }
    }

    const agedArray = Array.from(agedSet);
    output.aged_count = db.disableAgents(agedArray);
    logger.info(MODULE, '[ageAgent] done', { aged_count: output.aged_count });
    return true;
  }

  getAgentRule(_input: GetAgentRuleInput, _context: GetAgentRuleContext, output: GetAgentRuleOutput): boolean {
    output.rules = db.listAgentOptRules();
    return true;
  }

  updateAgentRule(input: UpdateAgentRuleInput, _context: UpdateAgentRuleContext, _output: UpdateAgentRuleOutput): boolean {
    logger.info(MODULE, '[updateAgentRule] start', { ops: input.operations.length });
    for (const op of input.operations) {
      switch (op.type) {
        case 'INSERT': {
          const data = op.data || {};
          if (!data.days || data.days < 1) throw new ValidationError('days must be a positive integer');
          if (data.min_usage_count === undefined || data.min_usage_count < 0) throw new ValidationError('min_usage_count must be >= 0');
          if (data.min_eval_score === undefined || data.min_eval_score < 0 || data.min_eval_score > 100) throw new ValidationError('min_eval_score must be 0-100');
          db.insertAgentOptRule({ days: data.days, min_usage_count: data.min_usage_count, min_eval_score: data.min_eval_score });
          break;
        }
        case 'UPDATE': {
          if (!op.id) throw new ValidationError('id is required for UPDATE');
          const ok = db.updateAgentOptRule(op.id, op.data || {});
          if (!ok) throw new NotFoundError(`Rule ${op.id}`);
          break;
        }
        case 'DELETE': {
          if (!op.id) throw new ValidationError('id is required for DELETE');
          db.deleteAgentOptRule(op.id);
          break;
        }
      }
    }
    logger.info(MODULE, '[updateAgentRule] done');
    return true;
  }

  configAgentLibrary(input: ConfigAgentLibraryInput, _context: ConfigAgentLibraryContext, output: ConfigAgentLibraryOutput): boolean {
    logger.info(MODULE, '[configAgentLibrary] start');
    const updates: Record<string, unknown> = {};
    if (input.prompt_template_id !== undefined) updates.prompt_template_id = input.prompt_template_id;
    if (input.similarity_threshold !== undefined) {
      if (input.similarity_threshold < 0 || input.similarity_threshold > 1) throw new ValidationError('similarity_threshold must be 0-1');
      updates.similarity_threshold = input.similarity_threshold;
    }
    if (input.max_agent_count !== undefined) {
      if (input.max_agent_count < 1) throw new ValidationError('max_agent_count must be >= 1');
      updates.max_agent_count = input.max_agent_count;
    }
    db.updateAgentLibraryConfig(updates as never);

    const config = db.getAgentLibraryConfig();
    output.prompt_template_id = config.prompt_template_id;
    output.similarity_threshold = config.similarity_threshold;
    output.max_agent_count = config.max_agent_count;

    const agentCount = db.listAgents().length;
    if (agentCount > config.max_agent_count) {
      setImmediate(() => {
        try {
          const ageOut = new AgeAgentOutput();
          this.ageAgent(new AgeAgentInput(), new AgeAgentContext(), ageOut);
        } catch (e) {
          logger.warn(MODULE, '[configAgentLibrary] ageAgent fire-and-forget failed', { error: (e as Error).message });
        }
      });
    }
    logger.info(MODULE, '[configAgentLibrary] done', { agentCount, maxCount: config.max_agent_count });
    return true;
  }

  calculateSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const wordsA = new Set(a.toLowerCase().split(/[\s,_-]+/).filter(w => w.length > 0));
    const wordsB = new Set(b.toLowerCase().split(/[\s,_-]+/).filter(w => w.length > 0));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.size / union.size;
  }
}

export function createAgentLibraryService(): AgentLibraryService {
  return AopProxy(new AgentLibraryService());
}
