import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createAgentStrategyService,
  MatchStrategyInput,
  MatchStrategyContext,
  MatchStrategyOutput,
  GetStrategyInput,
  GetStrategyContext,
  GetStrategyOutput,
  SoStrategyInput,
  SoStrategyContext,
  SoStrategyOutput,
  AddStrategyInput,
  AddStrategyContext,
  AddStrategyOutput,
  UpdateStrategyInput,
  UpdateStrategyContext,
  UpdateStrategyOutput,
  ConfigAgentStrategyInput,
  ConfigAgentStrategyContext,
  ConfigAgentStrategyOutput,
} from '../../src/agent/AgentStrategy/AgentStrategy';
import { ValidationError } from '../../src/shared/errors';

let db: Database.Database;
let service: ReturnType<typeof createAgentStrategyService>;

beforeEach(() => {
  db = new Database(':memory:');
  service = createAgentStrategyService(db);
});

afterEach(() => {
  db.close();
});

function seedStrategy(label: string): Record<string, unknown> {
  return db.prepare('SELECT * FROM agent_strategy WHERE strategy_label = ?').get(label) as Record<string, unknown>;
}

function getAllStrategies(): Record<string, unknown>[] {
  return db.prepare('SELECT * FROM agent_strategy ORDER BY created ASC').all() as Record<string, unknown>[];
}

function getConfig(): Record<string, unknown> {
  return db.prepare('SELECT * FROM agent_strategy_match_config LIMIT 1').get() as Record<string, unknown>;
}

describe('AgentStrategyService', () => {
  describe('seed data', () => {
    it('auto-seeds 3 built-in strategies on first construction', () => {
      const rows = getAllStrategies();
      expect(rows).toHaveLength(3);
      const labels = rows.map(r => r.strategy_label as string);
      expect(labels).toContain('CoT');
      expect(labels).toContain('ReAct');
      expect(labels).toContain('Plan-and-Solve');
    });

    it('seeded strategies have correct complexity ranges', () => {
      const cot = seedStrategy('CoT');
      const react = seedStrategy('ReAct');
      const pas = seedStrategy('Plan-and-Solve');

      expect(cot.suitable_complexity_min).toBe(0);
      expect(cot.suitable_complexity_max).toBe(40);
      expect(react.suitable_complexity_min).toBe(30);
      expect(react.suitable_complexity_max).toBe(70);
      expect(pas.suitable_complexity_min).toBe(60);
      expect(pas.suitable_complexity_max).toBe(100);
    });

    it('seeded strategies have enable=1', () => {
      const rows = getAllStrategies();
      for (const r of rows) {
        expect(r.enable).toBe(1);
      }
    });

    it('seeded strategies have valid JSON execution_rule', () => {
      const rows = getAllStrategies();
      for (const r of rows) {
        expect(() => JSON.parse(r.execution_rule as string)).not.toThrow();
      }
    });

    it('seed is idempotent (second service construction does not add duplicates)', () => {
      createAgentStrategyService(db);
      const rows = getAllStrategies();
      expect(rows).toHaveLength(3);
    });
  });

  describe('matchStrategy', () => {
    it('TC-AS-001: complexity=20 matches CoT (sole candidate in 0-40 range)', () => {
      const input = new MatchStrategyInput({ task_content: 'simple task', task_complexity: 20, task_domain: 'general' });
      const context = new MatchStrategyContext();
      const output = new MatchStrategyOutput();

      const result = service.matchStrategy(input, context, output);
      expect(result).toBe(true);

      const cot = seedStrategy('CoT');
      expect(output.strategy_id).toBe(cot.strategy_id);
    });

    it('TC-AS-002: complexity=50 matches ReAct (sole candidate in 30-70 range)', () => {
      const input = new MatchStrategyInput({ task_content: 'medium task', task_complexity: 50, task_domain: 'general' });
      const context = new MatchStrategyContext();
      const output = new MatchStrategyOutput();

      service.matchStrategy(input, context, output);
      const react = seedStrategy('ReAct');
      expect(output.strategy_id).toBe(react.strategy_id);
    });

    it('TC-AS-003: complexity=80 matches Plan-and-Solve (sole candidate in 60-100 range)', () => {
      const input = new MatchStrategyInput({ task_content: 'complex task', task_complexity: 80, task_domain: 'general' });
      const context = new MatchStrategyContext();
      const output = new MatchStrategyOutput();

      service.matchStrategy(input, context, output);
      const pas = seedStrategy('Plan-and-Solve');
      expect(output.strategy_id).toBe(pas.strategy_id);
    });

    it('TC-AS-004: complexity=40 boundary — selects by nearest midpoint (ReAct midpoint 50 is closer than CoT midpoint 20)', () => {
      const input = new MatchStrategyInput({ task_content: 'boundary task', task_complexity: 40, task_domain: 'general' });
      const context = new MatchStrategyContext();
      const output = new MatchStrategyOutput();

      service.matchStrategy(input, context, output);

      const react = seedStrategy('ReAct');
      expect(output.strategy_id).toBe(react.strategy_id);
    });

    it('TC-AS-005: complexity=120 beyond all max ranges falls back to default_strategy_id', () => {
      const input = new MatchStrategyInput({ task_content: 'impossible task', task_complexity: 120, task_domain: 'general' });
      const context = new MatchStrategyContext();
      const output = new MatchStrategyOutput();

      service.matchStrategy(input, context, output);

      const config = getConfig();
      expect(output.strategy_id).toBe(config.default_strategy_id);
    });

    it('TC-AS-006: complexity=-10 below all min ranges falls back to default_strategy_id', () => {
      const input = new MatchStrategyInput({ task_content: 'trivial task', task_complexity: -10, task_domain: 'general' });
      const context = new MatchStrategyContext();
      const output = new MatchStrategyOutput();

      service.matchStrategy(input, context, output);

      const config = getConfig();
      expect(output.strategy_id).toBe(config.default_strategy_id);
    });

    it('TC-AS-007: when multiple candidates, selects by nearest mid-point distance (complexity=30, CoT midpoint 20 distance 10, ReAct midpoint 50 distance 20)', () => {
      const input = new MatchStrategyInput({ task_content: 'overlap task', task_complexity: 30, task_domain: 'general' });
      const context = new MatchStrategyContext();
      const output = new MatchStrategyOutput();

      service.matchStrategy(input, context, output);

      const cot = seedStrategy('CoT');
      expect(output.strategy_id).toBe(cot.strategy_id);
    });

    it('TC-AS-008: no candidates falls back to default_strategy_id from config when set', () => {
      const config = getConfig();
      expect(config.default_strategy_id).toBeTruthy();

      const input = new MatchStrategyInput({ task_content: 'unmatched task', task_complexity: 150, task_domain: 'general' });
      const context = new MatchStrategyContext();
      const output = new MatchStrategyOutput();

      service.matchStrategy(input, context, output);

      expect(output.strategy_id).toBe(config.default_strategy_id);
      expect(output.strategy_id).toBeTruthy();
    });

    it('TC-AS-009: returns a strategy_id even when only one enabled strategy exists', () => {
      db.prepare('UPDATE agent_strategy SET enable = 0 WHERE strategy_label != ?').run('CoT');

      const input = new MatchStrategyInput({ task_content: 'test', task_complexity: 20, task_domain: 'general' });
      const context = new MatchStrategyContext();
      const output = new MatchStrategyOutput();

      const result = service.matchStrategy(input, context, output);
      expect(result).toBe(true);
      expect(output.strategy_id).toBeTruthy();
    });

    it('TC-AS-010: returns empty string when no enabled strategies exist and no default is configured', () => {
      db.prepare('UPDATE agent_strategy SET enable = 0').run();
      db.prepare("UPDATE agent_strategy_match_config SET default_strategy_id = ''").run();

      const input = new MatchStrategyInput({ task_content: 'test', task_complexity: 50, task_domain: 'general' });
      const context = new MatchStrategyContext();
      const output = new MatchStrategyOutput();

      const result = service.matchStrategy(input, context, output);
      expect(result).toBe(true);
      expect(output.strategy_id).toBe('');
    });
  });

  describe('getStrategy', () => {
    it('TC-AS-011: query by strategy_id returns correct label and execution_rule', () => {
      const cot = seedStrategy('CoT');

      const input = new GetStrategyInput({ strategy_id: cot.strategy_id as string });
      const context = new GetStrategyContext();
      const output = new GetStrategyOutput();

      const result = service.getStrategy(input, context, output);
      expect(result).toBe(true);
      expect(output.strategy_id).toBe(cot.strategy_id);
      expect(output.strategy_label).toBe('CoT');
      expect(output.execution_rule).toBeTruthy();
    });

    it('TC-AS-012: non-existent strategy_id returns false', () => {
      const input = new GetStrategyInput({ strategy_id: 'non-existent-id' });
      const context = new GetStrategyContext();
      const output = new GetStrategyOutput();

      const result = service.getStrategy(input, context, output);
      expect(result).toBe(false);
    });

    it('execution_rule is a valid JSON string', () => {
      const cot = seedStrategy('CoT');

      const input = new GetStrategyInput({ strategy_id: cot.strategy_id as string });
      const context = new GetStrategyContext();
      const output = new GetStrategyOutput();

      service.getStrategy(input, context, output);

      expect(() => JSON.parse(output.execution_rule!)).not.toThrow();
      const parsed = JSON.parse(output.execution_rule!);
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('steps');
    });
  });

  describe('soStrategy', () => {
    it('TC-AS-013: query all returns 3 seed strategies', () => {
      const input = new SoStrategyInput({});
      const context = new SoStrategyContext();
      const output = new SoStrategyOutput();

      const result = service.soStrategy(input, context, output);
      expect(result).toBe(true);
      expect(output.strategies).toHaveLength(3);
    });

    it('TC-AS-014: returns all strategies regardless of conditions (conditions field not used for SQL filtering)', () => {
      const input = new SoStrategyInput({ conditions: "strategy_label = 'CoT'" });
      const context = new SoStrategyContext();
      const output = new SoStrategyOutput();

      service.soStrategy(input, context, output);
      expect(output.strategies).toHaveLength(3);
    });

    it('TC-AS-015: pagination returns correct page', () => {
      const input = new SoStrategyInput({ page_num: 1, page_size: 1 });
      const context = new SoStrategyContext();
      const output = new SoStrategyOutput();

      service.soStrategy(input, context, output);
      expect(output.strategies!.length).toBeLessThanOrEqual(1);
    });

    it('page 2 returns next strategy', () => {
      const page1 = new SoStrategyOutput();
      service.soStrategy(new SoStrategyInput({ page_num: 1, page_size: 1, order_by: 'strategy_label ASC' }), new SoStrategyContext(), page1);

      const page2 = new SoStrategyOutput();
      service.soStrategy(new SoStrategyInput({ page_num: 2, page_size: 1, order_by: 'strategy_label ASC' }), new SoStrategyContext(), page2);

      expect(page1.strategies![0].strategy_id).not.toBe(page2.strategies![0].strategy_id);
    });

    it('TC-AS-016: order_by works (ASC vs DESC on strategy_label)', () => {
      const ascInput = new SoStrategyInput({ order_by: 'strategy_label ASC' });
      const ascContext = new SoStrategyContext();
      const ascOutput = new SoStrategyOutput();
      service.soStrategy(ascInput, ascContext, ascOutput);

      const descInput = new SoStrategyInput({ order_by: 'strategy_label DESC' });
      const descContext = new SoStrategyContext();
      const descOutput = new SoStrategyOutput();
      service.soStrategy(descInput, descContext, descOutput);

      expect(ascOutput.strategies).toHaveLength(3);
      expect(descOutput.strategies).toHaveLength(3);
      expect(ascOutput.strategies![0].strategy_id).not.toBe(descOutput.strategies![0].strategy_id);
      expect(ascOutput.strategies![0].strategy_id).toBe(descOutput.strategies![2].strategy_id);
    });

    it('order_by defaults to created DESC when not specified', () => {
      const input = new SoStrategyInput({});
      const context = new SoStrategyContext();
      const output = new SoStrategyOutput();

      service.soStrategy(input, context, output);
      expect(output.strategies).toHaveLength(3);
    });
  });

  describe('addStrategy', () => {
    it('TC-AS-017: add custom strategy with valid data returns true and generates a strategy_id', () => {
      const input = new AddStrategyInput({
        strategy_label: 'Custom Strategy',
        suitable_complexity_min: 10,
        suitable_complexity_max: 50,
        suitable_domains: '["code"]',
        execution_rule: JSON.stringify({ version: '1.0', type: 'custom' }),
      });
      const context = new AddStrategyContext();
      const output = new AddStrategyOutput();

      const result = service.addStrategy(input, context, output);
      expect(result).toBe(true);
      expect(output.strategy_id).toBeTruthy();
      expect(typeof output.strategy_id).toBe('string');
    });

    it('newly added strategy is retrievable via getStrategy', () => {
      const input = new AddStrategyInput({
        strategy_label: 'Retrievable',
        suitable_complexity_min: 0,
        suitable_complexity_max: 100,
        suitable_domains: '["*"]',
        execution_rule: '{}',
      });
      const context = new AddStrategyContext();
      const output = new AddStrategyOutput();
      service.addStrategy(input, context, output);

      const getInput = new GetStrategyInput({ strategy_id: output.strategy_id! });
      const getOutput = new GetStrategyOutput();
      const found = service.getStrategy(getInput, new GetStrategyContext(), getOutput);
      expect(found).toBe(true);
      expect(getOutput.strategy_label).toBe('Retrievable');
    });

    it('TC-AS-018: empty/falsy strategy_label returns false', () => {
      const input = new AddStrategyInput({
        strategy_label: '',
        suitable_complexity_min: 0,
        suitable_complexity_max: 100,
        suitable_domains: '["*"]',
        execution_rule: '{}',
      });
      const context = new AddStrategyContext();
      const output = new AddStrategyOutput();

      const result = service.addStrategy(input, context, output);
      expect(result).toBe(false);
    });

    it('TC-AS-019: invalid JSON execution_rule throws ValidationError', () => {
      const input = new AddStrategyInput({
        strategy_label: 'BadJSON',
        suitable_complexity_min: 0,
        suitable_complexity_max: 100,
        suitable_domains: '["*"]',
        execution_rule: 'not-valid-json',
      });
      const context = new AddStrategyContext();
      const output = new AddStrategyOutput();

      expect(() => service.addStrategy(input, context, output)).toThrow(ValidationError);
      expect(() => service.addStrategy(input, context, output)).toThrow('execution_rule must be valid JSON');
    });

    it('TC-AS-020: complexity_min > complexity_max throws ValidationError', () => {
      const input = new AddStrategyInput({
        strategy_label: 'InvertedRange',
        suitable_complexity_min: 80,
        suitable_complexity_max: 20,
        suitable_domains: '["*"]',
        execution_rule: '{}',
      });
      const context = new AddStrategyContext();
      const output = new AddStrategyOutput();

      expect(() => service.addStrategy(input, context, output)).toThrow(ValidationError);
      expect(() => service.addStrategy(input, context, output)).toThrow('suitable_complexity_min must be <= suitable_complexity_max');
    });

    it('TC-AS-021: steps mode execution_rule accepted (JSON with steps array)', () => {
      const stepsRule = JSON.stringify({
        version: '1.0',
        max_iterations: 5,
        steps: [
          { step: 'Think', next: 'Answer', on_error: 'Answer' },
          { step: 'Answer', next: null },
        ],
      });

      const input = new AddStrategyInput({
        strategy_label: 'StepsMode',
        suitable_complexity_min: 0,
        suitable_complexity_max: 100,
        suitable_domains: '["*"]',
        execution_rule: stepsRule,
      });
      const context = new AddStrategyContext();
      const output = new AddStrategyOutput();

      const result = service.addStrategy(input, context, output);
      expect(result).toBe(true);
      expect(output.strategy_id).toBeTruthy();

      const stored = db.prepare('SELECT execution_rule FROM agent_strategy WHERE strategy_id = ?').get(output.strategy_id) as { execution_rule: string };
      const parsed = JSON.parse(stored.execution_rule);
      expect(parsed.steps).toHaveLength(2);
    });

    it('TC-AS-022: phases mode execution_rule accepted (JSON with phases array)', () => {
      const phasesRule = JSON.stringify({
        version: '1.0',
        max_iterations: 20,
        phases: [
          { phase: 'Plan', steps: [{ step: 'Think', next: 'Next' }] },
          { phase: 'Execute', steps: [{ step: 'Act', next: null }] },
        ],
      });

      const input = new AddStrategyInput({
        strategy_label: 'PhasesMode',
        suitable_complexity_min: 0,
        suitable_complexity_max: 100,
        suitable_domains: '["*"]',
        execution_rule: phasesRule,
      });
      const context = new AddStrategyContext();
      const output = new AddStrategyOutput();

      const result = service.addStrategy(input, context, output);
      expect(result).toBe(true);

      const stored = db.prepare('SELECT execution_rule FROM agent_strategy WHERE strategy_id = ?').get(output.strategy_id) as { execution_rule: string };
      const parsed = JSON.parse(stored.execution_rule);
      expect(parsed.phases).toHaveLength(2);
    });
  });

  describe('updateStrategy', () => {
    it('TC-AS-023: update strategy_label works', () => {
      const cot = seedStrategy('CoT');

      const input = new UpdateStrategyInput({
        strategy_id: cot.strategy_id as string,
        strategy_label: 'CoT-Updated',
      });
      const context = new UpdateStrategyContext();
      const output = new UpdateStrategyOutput();

      const result = service.updateStrategy(input, context, output);
      expect(result).toBe(true);

      const updated = db.prepare('SELECT strategy_label FROM agent_strategy WHERE strategy_id = ?').get(cot.strategy_id) as { strategy_label: string };
      expect(updated.strategy_label).toBe('CoT-Updated');
    });

    it('TC-AS-024: update complexity range works', () => {
      const cot = seedStrategy('CoT');

      const input = new UpdateStrategyInput({
        strategy_id: cot.strategy_id as string,
        suitable_complexity_min: 5,
        suitable_complexity_max: 45,
      });
      const context = new UpdateStrategyContext();
      const output = new UpdateStrategyOutput();

      service.updateStrategy(input, context, output);

      const updated = db.prepare('SELECT suitable_complexity_min, suitable_complexity_max FROM agent_strategy WHERE strategy_id = ?').get(cot.strategy_id) as { suitable_complexity_min: number; suitable_complexity_max: number };
      expect(updated.suitable_complexity_min).toBe(5);
      expect(updated.suitable_complexity_max).toBe(45);
    });

    it('TC-AS-025: update enable status toggles (true → false and false → true)', () => {
      const cot = seedStrategy('CoT');

      const disableInput = new UpdateStrategyInput({
        strategy_id: cot.strategy_id as string,
        enable: false,
      });
      service.updateStrategy(disableInput, new UpdateStrategyContext(), new UpdateStrategyOutput());

      let updated = db.prepare('SELECT enable FROM agent_strategy WHERE strategy_id = ?').get(cot.strategy_id) as { enable: number };
      expect(updated.enable).toBe(0);

      const enableInput = new UpdateStrategyInput({
        strategy_id: cot.strategy_id as string,
        enable: true,
      });
      service.updateStrategy(enableInput, new UpdateStrategyContext(), new UpdateStrategyOutput());

      updated = db.prepare('SELECT enable FROM agent_strategy WHERE strategy_id = ?').get(cot.strategy_id) as { enable: number };
      expect(updated.enable).toBe(1);
    });

    it('TC-AS-026: update execution_rule works', () => {
      const cot = seedStrategy('CoT');
      const newRule = JSON.stringify({ version: '2.0', steps: [{ step: 'Custom' }] });

      const input = new UpdateStrategyInput({
        strategy_id: cot.strategy_id as string,
        execution_rule: newRule,
      });
      const context = new UpdateStrategyContext();
      const output = new UpdateStrategyOutput();

      service.updateStrategy(input, context, output);

      const updated = db.prepare('SELECT execution_rule FROM agent_strategy WHERE strategy_id = ?').get(cot.strategy_id) as { execution_rule: string };
      expect(JSON.parse(updated.execution_rule)).toEqual({ version: '2.0', steps: [{ step: 'Custom' }] });
    });

    it('TC-AS-027: non-existent strategy_id throws ValidationError', () => {
      const input = new UpdateStrategyInput({
        strategy_id: 'non-existent-id',
        strategy_label: 'Ghost',
      });
      const context = new UpdateStrategyContext();
      const output = new UpdateStrategyOutput();

      expect(() => service.updateStrategy(input, context, output)).toThrow(ValidationError);
      expect(() => service.updateStrategy(input, context, output)).toThrow('not found');
    });

    it('partial update: only specified fields are changed', () => {
      const cot = seedStrategy('CoT');
      const originalLabel = cot.strategy_label as string;
      const originalComplexityMax = cot.suitable_complexity_max as number;

      const input = new UpdateStrategyInput({
        strategy_id: cot.strategy_id as string,
        suitable_complexity_min: 15,
      });
      service.updateStrategy(input, new UpdateStrategyContext(), new UpdateStrategyOutput());

      const updated = db.prepare('SELECT * FROM agent_strategy WHERE strategy_id = ?').get(cot.strategy_id) as Record<string, unknown>;
      expect(updated.suitable_complexity_min).toBe(15);
      expect(updated.strategy_label).toBe(originalLabel);
      expect(updated.suitable_complexity_max).toBe(originalComplexityMax);
    });
  });

  describe('configAgentStrategy', () => {
    it('TC-AS-028: config initialized with default_strategy_id set to first seed strategy (CoT)', () => {
      const config = getConfig();
      const cot = seedStrategy('CoT');

      expect(config.default_strategy_id).toBeTruthy();
      expect(config.default_strategy_id).toBe(cot.strategy_id);
    });

    it('TC-AS-029: update default_strategy_id works', () => {
      const pas = seedStrategy('Plan-and-Solve');

      const input = new ConfigAgentStrategyInput({
        default_strategy_id: pas.strategy_id as string,
      });
      const context = new ConfigAgentStrategyContext();
      const output = new ConfigAgentStrategyOutput();

      const result = service.configAgentStrategy(input, context, output);
      expect(result).toBe(true);
      expect(output.default_strategy_id).toBe(pas.strategy_id);

      const config = getConfig();
      expect(config.default_strategy_id).toBe(pas.strategy_id);
    });

    it('TC-AS-030: update match_prompt_template_id works', () => {
      const input = new ConfigAgentStrategyInput({
        match_prompt_template_id: 'test-template-123',
      });
      const context = new ConfigAgentStrategyContext();
      const output = new ConfigAgentStrategyOutput();

      const result = service.configAgentStrategy(input, context, output);
      expect(result).toBe(true);
      expect(output.match_prompt_template_id).toBe('test-template-123');

      const config = getConfig();
      expect(config.match_prompt_template_id).toBe('test-template-123');
    });

    it('TC-AS-031: config returns both default_strategy_id and match_prompt_template_id', () => {
      const input = new ConfigAgentStrategyInput({
        default_strategy_id: 'dsid-1',
        match_prompt_template_id: 'mptid-1',
      });
      const context = new ConfigAgentStrategyContext();
      const output = new ConfigAgentStrategyOutput();

      service.configAgentStrategy(input, context, output);

      expect(output.default_strategy_id).toBe('dsid-1');
      expect(output.match_prompt_template_id).toBe('mptid-1');
    });

    it('partial config update: only specified fields are updated', () => {
      const pas = seedStrategy('Plan-and-Solve');

      const firstInput = new ConfigAgentStrategyInput({ match_prompt_template_id: 'original-template' });
      service.configAgentStrategy(firstInput, new ConfigAgentStrategyContext(), new ConfigAgentStrategyOutput());

      const secondInput = new ConfigAgentStrategyInput({ default_strategy_id: pas.strategy_id as string });
      const secondOutput = new ConfigAgentStrategyOutput();
      service.configAgentStrategy(secondInput, new ConfigAgentStrategyContext(), secondOutput);

      expect(secondOutput.default_strategy_id).toBe(pas.strategy_id);
      expect(secondOutput.match_prompt_template_id).toBe('original-template');
    });
  });
});
