import type { AgentDatabase } from '../infra/dbTypes';
import { Input, Context, Output } from '../../shared/base';
import { ValidationError } from '../../shared/errors';
import { logger } from '../../infrastructure/logger';
import { AopProxy } from '../infra/aopProxy';
import { generateId } from '../AgentLibrary/agentTypes';

const MODULE = 'AgentStrategy';

function ensureTables(db: AgentDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_strategy (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
    strategy_id TEXT NOT NULL UNIQUE, strategy_label TEXT NOT NULL,
    suitable_complexity_min INTEGER NOT NULL DEFAULT 0,
    suitable_complexity_max INTEGER NOT NULL DEFAULT 100,
    suitable_domains TEXT NOT NULL DEFAULT '["*"]',
    execution_rule TEXT NOT NULL DEFAULT '{}',
    enable INTEGER NOT NULL DEFAULT 1
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS agent_strategy_match_config (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
    default_strategy_id TEXT NOT NULL DEFAULT '',
    match_prompt_template_id TEXT NOT NULL DEFAULT ''
  )`);

  const sconf = db.prepare('SELECT * FROM agent_strategy_match_config LIMIT 1').get() as Record<string, unknown> | undefined;
  if (!sconf) {
    const now = Date.now();
    db.prepare('INSERT INTO agent_strategy_match_config (id,created,updated) VALUES (?,?,?)').run(generateId(), now, now);
  }

  const existing = db.prepare('SELECT COUNT(*) as c FROM agent_strategy').get() as { c: number };
  if (existing.c === 0) {
    logger.info(MODULE, '[seedStrategies] seeding built-in strategies');
    const now = Date.now();
    const strategies = [
      {
        label: 'CoT', cmin: 0, cmax: 40, rule: JSON.stringify({
          version: '1.0', max_iterations: 1,
          steps: [{ step: 'Think', next: 'Answer', on_error: 'Answer' }, { step: 'Answer', next: null }],
        }),
      },
      {
        label: 'ReAct', cmin: 30, cmax: 70, rule: JSON.stringify({
          version: '1.0', max_iterations: 10,
          steps: [
            { step: 'Think', next: 'Act', on_error: 'Answer' },
            { step: 'Act', next: 'Reflect' },
            { step: 'Reflect', condition_field: 'should_continue', true_next: 'Think', false_next: 'Answer' },
            { step: 'Answer', next: null },
          ],
        }),
      },
      {
        label: 'Plan-and-Solve', cmin: 60, cmax: 100, rule: JSON.stringify({
          version: '1.0', max_iterations: 20,
          phases: [
            { phase: 'Plan', steps: [{ step: 'Think', next: 'SolvePhase', on_error: 'Answer' }] },
            {
              phase: 'Solve', loop_over: 'sub_steps',
              steps: [
                { step: 'Act', next: 'Reflect' },
                { step: 'Reflect', condition_field: 'should_continue', true_next: 'Act', false_next: 'SummaryAnswer' },
              ],
            },
            { phase: 'Summary', steps: [{ step: 'Answer', next: null }] },
          ],
        }),
      },
    ];
    for (const s of strategies) {
      const sid = generateId();
      const rid = generateId();
      db.prepare(`INSERT INTO agent_strategy (id,created,updated,strategy_id,strategy_label,suitable_complexity_min,suitable_complexity_max,execution_rule)
        VALUES (?,?,?,?,?,?,?,?)`).run(rid, now, now, sid, s.label, s.cmin, s.cmax, s.rule);
      const defRow = db.prepare('SELECT default_strategy_id FROM agent_strategy_match_config WHERE default_strategy_id != ? LIMIT 1').get('');
      if (!defRow) {
        db.prepare('UPDATE agent_strategy_match_config SET default_strategy_id = ?, updated = ?').run(sid, now);
      }
    }
  }
}

class MatchStrategyInput extends Input {
  task_content!: string;
  task_complexity!: number;
  task_domain!: string;
  constructor(d: Partial<MatchStrategyInput>) { super(d); Object.assign(this, d); }
}
class MatchStrategyContext extends Context { }
class MatchStrategyOutput extends Output { strategy_id?: string; }

class GetStrategyInput extends Input { strategy_id!: string; constructor(d: Partial<GetStrategyInput>) { super(d); Object.assign(this, d); } }
class GetStrategyContext extends Context { }
class GetStrategyOutput extends Output { strategy_id?: string; strategy_label?: string; execution_rule?: string; }

class SoStrategyInput extends Input {
  conditions?: string; order_by?: string; page_num?: number; page_size?: number;
  constructor(d: Partial<SoStrategyInput>) { super(d); Object.assign(this, d); }
}
class SoStrategyContext extends Context { }
class SoStrategyOutput extends Output { strategies?: Record<string, unknown>[]; }

class AddStrategyInput extends Input {
  strategy_label!: string;
  suitable_complexity_min!: number;
  suitable_complexity_max!: number;
  suitable_domains!: string;
  execution_rule!: string;
  constructor(d: Partial<AddStrategyInput>) { super(d); Object.assign(this, d); }
}
class AddStrategyContext extends Context { }
class AddStrategyOutput extends Output { strategy_id?: string; }

class UpdateStrategyInput extends Input {
  strategy_id!: string;
  strategy_label?: string;
  suitable_complexity_min?: number;
  suitable_complexity_max?: number;
  suitable_domains?: string;
  execution_rule?: string;
  enable?: boolean;
  constructor(d: Partial<UpdateStrategyInput>) { super(d); Object.assign(this, d); }
}
class UpdateStrategyContext extends Context { }
class UpdateStrategyOutput extends Output { }

class ConfigAgentStrategyInput extends Input {
  default_strategy_id?: string;
  match_prompt_template_id?: string;
  constructor(d: Partial<ConfigAgentStrategyInput>) { super(d); Object.assign(this, d); }
}
class ConfigAgentStrategyContext extends Context { }
class ConfigAgentStrategyOutput extends Output { default_strategy_id?: string; match_prompt_template_id?: string; }

export { MatchStrategyInput, GetStrategyInput, SoStrategyInput, AddStrategyInput, UpdateStrategyInput, ConfigAgentStrategyInput };
export { MatchStrategyContext, GetStrategyContext, SoStrategyContext, AddStrategyContext, UpdateStrategyContext, ConfigAgentStrategyContext };
export { MatchStrategyOutput, GetStrategyOutput, SoStrategyOutput, AddStrategyOutput, UpdateStrategyOutput, ConfigAgentStrategyOutput };

export class AgentStrategyService {
  private db: AgentDatabase;

  constructor(db: AgentDatabase) {
    this.db = db;
    ensureTables(db);
  }

  matchStrategy(input: MatchStrategyInput, _context: MatchStrategyContext, output: MatchStrategyOutput): boolean {
    logger.info(MODULE, '[matchStrategy] start', { complexity: input.task_complexity });
    const strategies = this.db.prepare('SELECT * FROM agent_strategy WHERE enable=1').all() as Record<string, unknown>[];
    const complexity = input.task_complexity ?? 50;

    const candidates = strategies.filter(s => {
      const cmi = Number(s.suitable_complexity_min) || 0;
      const cma = Number(s.suitable_complexity_max) || 100;
      return complexity >= cmi && complexity <= cma;
    });

    if (candidates.length === 1) {
      output.strategy_id = candidates[0].strategy_id as string;
    } else if (candidates.length > 1) {
      candidates.sort((a, b) => {
        const aMid = ((Number(a.suitable_complexity_min) || 0) + (Number(a.suitable_complexity_max) || 100)) / 2;
        const bMid = ((Number(b.suitable_complexity_min) || 0) + (Number(b.suitable_complexity_max) || 100)) / 2;
        return Math.abs(complexity - aMid) - Math.abs(complexity - bMid);
      });
      output.strategy_id = candidates[0].strategy_id as string;
    } else {
      const def = this.db.prepare('SELECT default_strategy_id FROM agent_strategy_match_config LIMIT 1').get() as Record<string, unknown> | undefined;
      output.strategy_id = (def?.default_strategy_id as string) || (strategies[0]?.strategy_id as string) || '';
    }
    logger.info(MODULE, '[matchStrategy] result', { strategy_id: output.strategy_id });
    return true;
  }

  getStrategy(input: GetStrategyInput, _context: GetStrategyContext, output: GetStrategyOutput): boolean {
    const row = this.db.prepare('SELECT * FROM agent_strategy WHERE strategy_id = ?').get(input.strategy_id) as Record<string, unknown> | undefined;
    if (!row) return false;
    output.strategy_id = row.strategy_id as string;
    output.strategy_label = row.strategy_label as string;
    output.execution_rule = row.execution_rule as string;
    return true;
  }

  soStrategy(input: SoStrategyInput, _context: SoStrategyContext, output: SoStrategyOutput): boolean {
    let sql = 'SELECT * FROM agent_strategy WHERE 1=1';
    const params: unknown[] = [];
    if (input.order_by) { sql += ` ORDER BY ${input.order_by}`; } else { sql += ' ORDER BY created DESC'; }
    if (input.page_num && input.page_size) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(input.page_size, (input.page_num - 1) * input.page_size);
    }
    output.strategies = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return true;
  }

  addStrategy(input: AddStrategyInput, _context: AddStrategyContext, output: AddStrategyOutput): boolean {
    logger.info(MODULE, '[addStrategy] start', { label: input.strategy_label });
    if (!input.strategy_label) return false;
    if (input.suitable_complexity_min > input.suitable_complexity_max) {
      throw new ValidationError('suitable_complexity_min must be <= suitable_complexity_max');
    }
    try { JSON.parse(input.execution_rule); } catch {
      throw new ValidationError('execution_rule must be valid JSON');
    }
    const strategyId = generateId();
    const rowId = generateId();
    const now = Date.now();
    this.db.prepare(`INSERT INTO agent_strategy (id,created,updated,strategy_id,strategy_label,suitable_complexity_min,suitable_complexity_max,suitable_domains,execution_rule)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      rowId, now, now, strategyId, input.strategy_label,
      input.suitable_complexity_min, input.suitable_complexity_max,
      input.suitable_domains, input.execution_rule
    );
    output.strategy_id = strategyId;
    logger.info(MODULE, '[addStrategy] done', { strategy_id: strategyId });
    return true;
  }

  updateStrategy(input: UpdateStrategyInput, _context: UpdateStrategyContext, _output: UpdateStrategyOutput): boolean {
    logger.info(MODULE, '[updateStrategy] start', { strategy_id: input.strategy_id });
    const existing = this.db.prepare('SELECT * FROM agent_strategy WHERE strategy_id = ?').get(input.strategy_id) as Record<string, unknown> | undefined;
    if (!existing) throw new ValidationError(`Strategy ${input.strategy_id} not found`);
    const now = Date.now();
    const sets: string[] = ['updated = ?'];
    const params: unknown[] = [now];
    if (input.strategy_label !== undefined) { sets.push('strategy_label = ?'); params.push(input.strategy_label); }
    if (input.suitable_complexity_min !== undefined) { sets.push('suitable_complexity_min = ?'); params.push(input.suitable_complexity_min); }
    if (input.suitable_complexity_max !== undefined) { sets.push('suitable_complexity_max = ?'); params.push(input.suitable_complexity_max); }
    if (input.suitable_domains !== undefined) { sets.push('suitable_domains = ?'); params.push(input.suitable_domains); }
    if (input.execution_rule !== undefined) { sets.push('execution_rule = ?'); params.push(input.execution_rule); }
    if (input.enable !== undefined) { sets.push('enable = ?'); params.push(input.enable ? 1 : 0); }
    params.push(input.strategy_id);
    this.db.prepare(`UPDATE agent_strategy SET ${sets.join(',')} WHERE strategy_id = ?`).run(...params);
    logger.info(MODULE, '[updateStrategy] done');
    return true;
  }

  configAgentStrategy(input: ConfigAgentStrategyInput, _context: ConfigAgentStrategyContext, output: ConfigAgentStrategyOutput): boolean {
    logger.info(MODULE, '[configAgentStrategy] start');
    const now = Date.now();
    const sets: string[] = ['updated = ?'];
    const params: unknown[] = [now];
    if (input.default_strategy_id !== undefined) { sets.push('default_strategy_id = ?'); params.push(input.default_strategy_id); }
    if (input.match_prompt_template_id !== undefined) { sets.push('match_prompt_template_id = ?'); params.push(input.match_prompt_template_id); }
    this.db.prepare(`UPDATE agent_strategy_match_config SET ${sets.join(',')}`).run(...params);
    const config = this.db.prepare('SELECT * FROM agent_strategy_match_config LIMIT 1').get() as Record<string, unknown>;
    output.default_strategy_id = config.default_strategy_id as string;
    output.match_prompt_template_id = config.match_prompt_template_id as string;
    logger.info(MODULE, '[configAgentStrategy] done');
    return true;
  }
}

export function createAgentStrategyService(db: AgentDatabase): AgentStrategyService {
  return AopProxy(new AgentStrategyService(db));
}
