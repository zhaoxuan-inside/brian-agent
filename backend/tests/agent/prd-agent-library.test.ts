import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { setDatabase } from '../../src/agent/AgentLibrary/db';
import {
  AgentLibraryService,
  createAgentLibraryService,
  AddAgentInput,
  AddAgentContext,
  AddAgentOutput,
  MatchAgentInput,
  MatchAgentContext,
  MatchAgentOutput,
  UpdateAgentInput,
  UpdateAgentContext,
  UpdateAgentOutput,
  RecordAgentUsageInput,
  RecordAgentUsageContext,
  RecordAgentUsageOutput,
  GetAgentInput,
  GetAgentContext,
  GetAgentOutput,
  AgeAgentInput,
  AgeAgentContext,
  AgeAgentOutput,
  GetAgentRuleInput,
  GetAgentRuleContext,
  GetAgentRuleOutput,
  UpdateAgentRuleInput,
  UpdateAgentRuleContext,
  UpdateAgentRuleOutput,
  ConfigAgentLibraryInput,
  ConfigAgentLibraryContext,
  ConfigAgentLibraryOutput,
} from '../../src/agent/AgentLibrary/AgentLibrary';
import { ValidationError, NotFoundError } from '../../src/shared/errors';

const FIXED_DATE = new Date('2025-01-15T12:00:00Z').getTime();

function makeAddAgentInput(overrides: Partial<{
  agent_id: string; agent_type: string; strategy_id: string;
  llm_id: string; soul_id: string; task_signature: string; agent_name: string;
}> = {}) {
  return new AddAgentInput({
    agent_id: 'test-worker-1',
    agent_type: 'WORKER' as const,
    strategy_id: 'strat-react',
    llm_id: 'llm-openai',
    soul_id: 'soul-precise',
    task_signature: '[coding] write a function to process data',
    agent_name: 'Test Worker',
    ...overrides,
  });
}

function makeRecordUsageInput(overrides: Partial<{
  agent_id: string; work_id: string; interact_id: string; usage_context: string;
}> = {}) {
  return new RecordAgentUsageInput({
    agent_id: 'test-worker-1',
    work_id: 'work-001',
    interact_id: 'interact-001',
    ...overrides,
  });
}

function query<T = unknown>(db: Database.Database, sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

function queryAll<T = unknown>(db: Database.Database, sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

describe('AgentLibrary PRD Service', () => {
  let db: Database.Database;
  let service: AgentLibraryService;

  beforeEach(async () => {
    vi.useFakeTimers({ now: FIXED_DATE });
    db = new Database(':memory:');
    setDatabase(db);
    service = createAgentLibraryService();
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  // ==========================================================================
  // 1. addAgent (TC-AL-001 through TC-AL-009)
  // ==========================================================================
  describe('addAgent', () => {
    it('TC-AL-001: normal add WORKER Agent', () => {
      const input = makeAddAgentInput();
      const output = new AddAgentOutput();

      const result = service.addAgent(input, new AddAgentContext(), output);

      expect(result).toBe(true);
      expect(output.agent_id).toBe('test-worker-1');

      const row = query<Record<string, unknown>>(db, 'SELECT * FROM agent WHERE agent_id = ?', 'test-worker-1');
      expect(row).toBeDefined();
      expect(row!.agent_id).toBe('test-worker-1');
      expect(row!.agent_type).toBe('WORKER');
      expect(row!.strategy_id).toBe('strat-react');
      expect(row!.usage_count).toBe(0);
      expect(row!.eval_score).toBe(50);
      expect(row!.enable).toBe(1);
    });

    it('TC-AL-002: add PLANNER agent', () => {
      const input = makeAddAgentInput({ agent_id: 'planner-1', agent_type: 'PLANNER', agent_name: 'Planner' });
      const output = new AddAgentOutput();

      service.addAgent(input, new AddAgentContext(), output);

      const row = query<Record<string, unknown>>(db, 'SELECT * FROM agent WHERE agent_id = ?', 'planner-1');
      expect(row!.agent_type).toBe('PLANNER');
    });

    it('TC-AL-003: add WRITER agent', () => {
      const input = makeAddAgentInput({ agent_id: 'writer-1', agent_type: 'WRITER', agent_name: 'Writer' });
      const output = new AddAgentOutput();

      service.addAgent(input, new AddAgentContext(), output);

      const row = query<Record<string, unknown>>(db, 'SELECT * FROM agent WHERE agent_id = ?', 'writer-1');
      expect(row!.agent_type).toBe('WRITER');
    });

    it('TC-AL-004: add EVOLUTOR agent', () => {
      const input = makeAddAgentInput({ agent_id: 'evolutor-1', agent_type: 'EVOLUTOR', agent_name: 'Evolutor' });
      const output = new AddAgentOutput();

      service.addAgent(input, new AddAgentContext(), output);

      const row = query<Record<string, unknown>>(db, 'SELECT * FROM agent WHERE agent_id = ?', 'evolutor-1');
      expect(row!.agent_type).toBe('EVOLUTOR');
    });

    it('TC-AL-005: empty agent_id throws ValidationError', () => {
      const input = makeAddAgentInput({ agent_id: '' });

      expect(() => service.addAgent(input, new AddAgentContext(), new AddAgentOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-006: invalid agent_type throws ValidationError', () => {
      const input = makeAddAgentInput({ agent_type: 'INVALID_TYPE', agent_name: 'Bad' });

      expect(() => service.addAgent(input, new AddAgentContext(), new AddAgentOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-007: empty strategy_id throws ValidationError', () => {
      const input = makeAddAgentInput({ strategy_id: '' });

      expect(() => service.addAgent(input, new AddAgentContext(), new AddAgentOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-008: optional fields default to empty string or agent_id for name', () => {
      const input = makeAddAgentInput({
        agent_id: 'agent-minimal',
        llm_id: '',
        soul_id: '',
        task_signature: '',
        agent_name: '',
      });
      input.llm_id = '' as unknown as undefined;
      input.soul_id = '' as unknown as undefined;
      input.task_signature = '' as unknown as undefined;

      const output = new AddAgentOutput();
      service.addAgent(input, new AddAgentContext(), output);

      const row = query<Record<string, unknown>>(db, 'SELECT * FROM agent WHERE agent_id = ?', 'agent-minimal');
      expect(row!.llm_id).toBe('');
      expect(row!.soul_id).toBe('');
      expect(row!.task_signature).toBe('');
      expect(row!.agent_name).toBe('agent-minimal');
    });

    it('TC-AL-009: custom agent_name stored correctly', () => {
      const input = makeAddAgentInput({ agent_name: '我的自定义Agent' });
      const output = new AddAgentOutput();

      service.addAgent(input, new AddAgentContext(), output);

      const row = query<Record<string, unknown>>(db, 'SELECT * FROM agent WHERE agent_id = ?', 'test-worker-1');
      expect(row!.agent_name).toBe('我的自定义Agent');
    });
  });

  // ==========================================================================
  // 2. matchAgent (TC-AL-010 through TC-AL-018)
  // ==========================================================================
  describe('matchAgent', () => {
    it('TC-AL-010: empty agent table returns empty agent_id and score 0', () => {
      const input = new MatchAgentInput({ task_signature: '[coding] any task' });
      const output = new MatchAgentOutput();

      const result = service.matchAgent(input, new MatchAgentContext(), output);

      expect(result).toBe(true);
      expect(output.agent_id).toBe('');
      expect(output.similarity_score).toBe(0);
    });

    it('TC-AL-011: similar task_signature matches with score >= threshold', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'sim-agent', task_signature: '[coding] write a function' }),
        new AddAgentContext(),
        new AddAgentOutput(),
      );

      db.prepare('UPDATE agent_library_config SET similarity_threshold = ?').run(0.3);

      const input = new MatchAgentInput({
        task_signature: '[coding] write a function to sort',
        similarity_threshold: 0.3,
      });
      const output = new MatchAgentOutput();

      service.matchAgent(input, new MatchAgentContext(), output);

      expect(output.agent_id).toBe('sim-agent');
      expect(output.similarity_score!).toBeGreaterThanOrEqual(0.3);
    });

    it('TC-AL-012: dissimilar signatures score below threshold', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'cooking-agent', task_signature: '[cooking] make pasta' }),
        new AddAgentContext(),
        new AddAgentOutput(),
      );

      db.prepare('UPDATE agent_library_config SET similarity_threshold = ?').run(0.8);

      const input = new MatchAgentInput({ task_signature: '[coding] write code' });
      const output = new MatchAgentOutput();

      service.matchAgent(input, new MatchAgentContext(), output);

      expect(output.agent_id).toBe('');
      expect(output.similarity_score!).toBeLessThan(0.8);
    });

    it('TC-AL-015: agent_type filter works', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'worker-a', agent_type: 'WORKER', task_signature: '[data] process data' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      service.addAgent(
        makeAddAgentInput({ agent_id: 'writer-a', agent_type: 'WRITER', task_signature: '[data] process data' }),
        new AddAgentContext(), new AddAgentOutput(),
      );

      db.prepare('UPDATE agent_library_config SET similarity_threshold = ?').run(0.1);

      const input = new MatchAgentInput({
        task_signature: '[data] process data',
        agent_type: 'WRITER',
      });
      const output = new MatchAgentOutput();

      service.matchAgent(input, new MatchAgentContext(), output);

      expect(output.agent_id).toBe('writer-a');
    });

    it('TC-AL-016: custom similarity_threshold overrides config default', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'partial-agent', task_signature: 'coding function data' }),
        new AddAgentContext(), new AddAgentOutput(),
      );

      db.prepare('UPDATE agent_library_config SET similarity_threshold = ?').run(0.5);

      const input = new MatchAgentInput({
        task_signature: 'coding function',
        similarity_threshold: 0.2,
      });
      const output = new MatchAgentOutput();

      service.matchAgent(input, new MatchAgentContext(), output);

      expect(output.agent_id).toBe('partial-agent');
      expect(output.similarity_score!).toBeGreaterThanOrEqual(0.2);
    });

    it('TC-AL-017: disabled agents not in candidates', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'disabled-agent', task_signature: '[target] match me' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      db.prepare('UPDATE agent SET enable = 0 WHERE agent_id = ?').run('disabled-agent');

      db.prepare('UPDATE agent_library_config SET similarity_threshold = ?').run(0.1);

      const input = new MatchAgentInput({ task_signature: '[target] match me' });
      const output = new MatchAgentOutput();

      service.matchAgent(input, new MatchAgentContext(), output);

      expect(output.agent_id).toBe('');
      expect(output.similarity_score).toBe(0);
    });
  });

  // ==========================================================================
  // 3. updateAgent (TC-AL-019 through TC-AL-028)
  // ==========================================================================
  describe('updateAgent', () => {
    beforeEach(() => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'update-target' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
    });

    it('TC-AL-019: update agent_name', () => {
      const input = new UpdateAgentInput({ agent_id: 'update-target', agent_name: '新名称' });

      service.updateAgent(input, new UpdateAgentContext(), new UpdateAgentOutput());

      const row = query<Record<string, unknown>>(db, 'SELECT agent_name, updated FROM agent WHERE agent_id = ?', 'update-target');
      expect(row!.agent_name).toBe('新名称');
      expect(row!.updated).toBeGreaterThanOrEqual(FIXED_DATE);
    });

    it('TC-AL-020: update eval_score (valid range)', () => {
      const input = new UpdateAgentInput({ agent_id: 'update-target', eval_score: 85 });

      service.updateAgent(input, new UpdateAgentContext(), new UpdateAgentOutput());

      const row = query<Record<string, unknown>>(db, 'SELECT eval_score FROM agent WHERE agent_id = ?', 'update-target');
      expect(row!.eval_score).toBe(85);
    });

    it('TC-AL-021: eval_score=0 (lower boundary)', () => {
      const input = new UpdateAgentInput({ agent_id: 'update-target', eval_score: 0 });

      service.updateAgent(input, new UpdateAgentContext(), new UpdateAgentOutput());

      const row = query<Record<string, unknown>>(db, 'SELECT eval_score FROM agent WHERE agent_id = ?', 'update-target');
      expect(row!.eval_score).toBe(0);
    });

    it('TC-AL-022: eval_score=100 (upper boundary)', () => {
      const input = new UpdateAgentInput({ agent_id: 'update-target', eval_score: 100 });

      service.updateAgent(input, new UpdateAgentContext(), new UpdateAgentOutput());

      const row = query<Record<string, unknown>>(db, 'SELECT eval_score FROM agent WHERE agent_id = ?', 'update-target');
      expect(row!.eval_score).toBe(100);
    });

    it('TC-AL-023: eval_score < 0 throws ValidationError', () => {
      const input = new UpdateAgentInput({ agent_id: 'update-target', eval_score: -1 });

      expect(() => service.updateAgent(input, new UpdateAgentContext(), new UpdateAgentOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-024: eval_score > 100 throws ValidationError', () => {
      const input = new UpdateAgentInput({ agent_id: 'update-target', eval_score: 101 });

      expect(() => service.updateAgent(input, new UpdateAgentContext(), new UpdateAgentOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-025: disable agent (enable true -> false)', () => {
      const input = new UpdateAgentInput({ agent_id: 'update-target', enable: false });

      service.updateAgent(input, new UpdateAgentContext(), new UpdateAgentOutput());

      const row = query<Record<string, unknown>>(db, 'SELECT enable FROM agent WHERE agent_id = ?', 'update-target');
      expect(row!.enable).toBe(0);
    });

    it('TC-AL-026: re-enable agent (enable false -> true)', () => {
      db.prepare('UPDATE agent SET enable = 0 WHERE agent_id = ?').run('update-target');

      const input = new UpdateAgentInput({ agent_id: 'update-target', enable: true });

      service.updateAgent(input, new UpdateAgentContext(), new UpdateAgentOutput());

      const row = query<Record<string, unknown>>(db, 'SELECT enable FROM agent WHERE agent_id = ?', 'update-target');
      expect(row!.enable).toBe(1);
    });

    it('TC-AL-027: update non-existent agent throws NotFoundError', () => {
      const input = new UpdateAgentInput({ agent_id: 'non-existent-agent', agent_name: 'nope' });

      expect(() => service.updateAgent(input, new UpdateAgentContext(), new UpdateAgentOutput()))
        .toThrow(NotFoundError);
    });

    it('TC-AL-028: batch update multiple fields', () => {
      const input = new UpdateAgentInput({
        agent_id: 'update-target',
        agent_name: '新名',
        task_signature: '新签名',
        strategy_id: '新策略',
        eval_score: 75,
      });

      service.updateAgent(input, new UpdateAgentContext(), new UpdateAgentOutput());

      const row = query<Record<string, unknown>>(db, 'SELECT * FROM agent WHERE agent_id = ?', 'update-target');
      expect(row!.agent_name).toBe('新名');
      expect(row!.task_signature).toBe('新签名');
      expect(row!.strategy_id).toBe('新策略');
      expect(row!.eval_score).toBe(75);
    });
  });

  // ==========================================================================
  // 4. recordAgentUsage (TC-AL-029 through TC-AL-033)
  // ==========================================================================
  describe('recordAgentUsage', () => {
    beforeEach(() => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'usage-agent' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
    });

    it('TC-AL-029: normal record usage increments usage_count', () => {
      const input = makeRecordUsageInput({ agent_id: 'usage-agent' });

      service.recordAgentUsage(input, new RecordAgentUsageContext(), new RecordAgentUsageOutput());

      const usageRow = query<Record<string, unknown>>(db, 'SELECT * FROM agent_usage WHERE agent_id = ?', 'usage-agent');
      expect(usageRow).toBeDefined();
      expect(usageRow!.work_id).toBe('work-001');
      expect(usageRow!.interact_id).toBe('interact-001');

      const agentRow = query<Record<string, unknown>>(db, 'SELECT usage_count FROM agent WHERE agent_id = ?', 'usage-agent');
      expect(agentRow!.usage_count).toBe(1);
    });

    it('TC-AL-030: empty agent_id throws NotFoundError', () => {
      const input = makeRecordUsageInput({ agent_id: '' });

      expect(() => service.recordAgentUsage(input, new RecordAgentUsageContext(), new RecordAgentUsageOutput()))
        .toThrow(NotFoundError);
    });

    it('TC-AL-031: non-existent agent throws NotFoundError', () => {
      const input = makeRecordUsageInput({ agent_id: 'ghost-agent' });

      expect(() => service.recordAgentUsage(input, new RecordAgentUsageContext(), new RecordAgentUsageOutput()))
        .toThrow(NotFoundError);
    });

    it('TC-AL-032: multiple calls accumulate usage_count', () => {
      const input = makeRecordUsageInput({ agent_id: 'usage-agent' });

      service.recordAgentUsage(input, new RecordAgentUsageContext(), new RecordAgentUsageOutput());
      service.recordAgentUsage(input, new RecordAgentUsageContext(), new RecordAgentUsageOutput());
      service.recordAgentUsage(input, new RecordAgentUsageContext(), new RecordAgentUsageOutput());

      const usageCount = db.prepare('SELECT COUNT(*) as cnt FROM agent_usage WHERE agent_id = ?').get('usage-agent') as { cnt: number };
      expect(usageCount.cnt).toBe(3);

      const agentRow = query<Record<string, unknown>>(db, 'SELECT usage_count FROM agent WHERE agent_id = ?', 'usage-agent');
      expect(agentRow!.usage_count).toBe(3);
    });

    it('TC-AL-033: custom usage_context stored', () => {
      const input = makeRecordUsageInput({ agent_id: 'usage-agent', usage_context: '{"feedback":"good"}' });

      service.recordAgentUsage(input, new RecordAgentUsageContext(), new RecordAgentUsageOutput());

      const row = query<Record<string, unknown>>(db, 'SELECT usage_context FROM agent_usage WHERE agent_id = ?', 'usage-agent');
      expect(row!.usage_context).toBe('{"feedback":"good"}');
    });
  });

  // ==========================================================================
  // 5. getAgent (TC-AL-034 through TC-AL-038)
  // ==========================================================================
  describe('getAgent', () => {
    beforeEach(() => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'qa-1', agent_type: 'WORKER', agent_name: 'QA1' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      service.addAgent(
        makeAddAgentInput({ agent_id: 'qa-2', agent_type: 'WORKER', agent_name: 'QA2' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      service.addAgent(
        makeAddAgentInput({ agent_id: 'writer-1', agent_type: 'WRITER', agent_name: 'Writer1' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
    });

    it('TC-AL-034: query by agent_id returns single result', () => {
      const input = new GetAgentInput({ agent_id: 'qa-1' });
      const output = new GetAgentOutput();

      service.getAgent(input, new GetAgentContext(), output);

      expect(output.agents).toHaveLength(1);
      expect(output.agents![0].agent_id).toBe('qa-1');
    });

    it('TC-AL-035: query by agent_type filters correctly', () => {
      const input = new GetAgentInput({ agent_type: 'WORKER' });
      const output = new GetAgentOutput();

      service.getAgent(input, new GetAgentContext(), output);

      expect(output.agents).toHaveLength(2);
      output.agents!.forEach(agent => expect(agent.agent_type).toBe('WORKER'));
    });

    it('TC-AL-036: non-existent ID throws NotFoundError', () => {
      const input = new GetAgentInput({ agent_id: 'non-existent-agent' });
      const output = new GetAgentOutput();

      expect(() => service.getAgent(input, new GetAgentContext(), output))
        .toThrow(NotFoundError);
    });

    it('TC-AL-038a: pagination with page_num/page_size works', () => {
      const input = new GetAgentInput({ page_num: 1, page_size: 2, order_by: 'created ASC' });
      const output = new GetAgentOutput();

      service.getAgent(input, new GetAgentContext(), output);

      expect(output.agents).toHaveLength(2);
      expect(output.agents![0].agent_id).toBe('qa-1');
      expect(output.agents![1].agent_id).toBe('qa-2');
    });

    it('TC-AL-038b: second page returns remaining agents', () => {
      const input = new GetAgentInput({ page_num: 2, page_size: 2, order_by: 'created ASC' });
      const output = new GetAgentOutput();

      service.getAgent(input, new GetAgentContext(), output);

      expect(output.agents).toHaveLength(1);
      expect(output.agents![0].agent_id).toBe('writer-1');
    });

    it('TC-AL-038c: order_by works', () => {
      const input = new GetAgentInput({ order_by: 'agent_name ASC' });
      const output = new GetAgentOutput();

      service.getAgent(input, new GetAgentContext(), output);

      const names = output.agents!.map(a => a.agent_name);
      expect(names[0] <= names[1]).toBe(true);
      expect(names[1] <= names[2]).toBe(true);
    });
  });

  // ==========================================================================
  // 6. ageAgent (TC-AL-040 through TC-AL-045)
  // ==========================================================================
  describe('ageAgent', () => {
    it('TC-AL-040: no rules returns aged_count=0', () => {
      const input = new AgeAgentInput();
      const output = new AgeAgentOutput();

      service.ageAgent(input, new AgeAgentContext(), output);

      expect(output.aged_count).toBe(0);
    });

    it('TC-AL-041: agent ages when any rule matches (any-rule OR semantics)', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'age-worker', agent_type: 'WORKER' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      db.prepare('UPDATE agent SET eval_score = 20 WHERE agent_id = ?').run('age-worker');

      db.prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('rule-1', FIXED_DATE, FIXED_DATE, 365, 5, 30);
      db.prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('rule-2', FIXED_DATE, FIXED_DATE, 365, 1, 10);

      const output = new AgeAgentOutput();
      service.ageAgent(new AgeAgentInput(), new AgeAgentContext(), output);

      expect(output.aged_count).toBe(1);
      const row = query<Record<string, unknown>>(db, 'SELECT enable FROM agent WHERE agent_id = ?', 'age-worker');
      expect(row!.enable).toBe(0);
    });

    it('TC-AL-042: single rule with matching conditions ages the agent', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'age-single', agent_type: 'WORKER' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      db.prepare('UPDATE agent SET eval_score = 20 WHERE agent_id = ?').run('age-single');

      db.prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('rule-solo', FIXED_DATE, FIXED_DATE, 365, 5, 30);

      const output = new AgeAgentOutput();
      service.ageAgent(new AgeAgentInput(), new AgeAgentContext(), output);

      expect(output.aged_count).toBe(1);
      const row = query<Record<string, unknown>>(db, 'SELECT enable FROM agent WHERE agent_id = ?', 'age-single');
      expect(row!.enable).toBe(0);
    });

    it('TC-AL-043: system agents (PLANNER/WRITER/EVOLUTOR) excluded from aging', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'sys-planner', agent_type: 'PLANNER' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      service.addAgent(
        makeAddAgentInput({ agent_id: 'sys-writer', agent_type: 'WRITER' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      service.addAgent(
        makeAddAgentInput({ agent_id: 'sys-evolutor', agent_type: 'EVOLUTOR' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      db.prepare('UPDATE agent SET eval_score = 20 WHERE agent_id IN (?, ?, ?)').run('sys-planner', 'sys-writer', 'sys-evolutor');

      db.prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('rule-sys', FIXED_DATE, FIXED_DATE, 365, 5, 30);

      const output = new AgeAgentOutput();
      service.ageAgent(new AgeAgentInput(), new AgeAgentContext(), output);

      expect(output.aged_count).toBe(0);
    });

    it('TC-AL-044: already disabled agents skipped', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'already-disabled', agent_type: 'WORKER' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      db.prepare('UPDATE agent SET enable = 0, eval_score = 20 WHERE agent_id = ?').run('already-disabled');

      db.prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('rule-dis', FIXED_DATE, FIXED_DATE, 365, 5, 30);

      const output = new AgeAgentOutput();
      service.ageAgent(new AgeAgentInput(), new AgeAgentContext(), output);

      expect(output.aged_count).toBe(0);
    });

    it('TC-AL-045: high usage_count prevents aging when usage >= min_usage_count', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'busy-agent', agent_type: 'WORKER' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      db.prepare('UPDATE agent SET eval_score = 20 WHERE agent_id = ?').run('busy-agent');

      for (let i = 0; i < 10; i++) {
        db.prepare(`INSERT INTO agent_usage (id, created, updated, agent_id, work_id, interact_id)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .run(`usage-${i}`, FIXED_DATE, FIXED_DATE, 'busy-agent', `work-${i}`, `interact-${i}`);
      }

      db.prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('rule-busy', FIXED_DATE, FIXED_DATE, 365, 5, 30);

      const output = new AgeAgentOutput();
      service.ageAgent(new AgeAgentInput(), new AgeAgentContext(), output);

      expect(output.aged_count).toBe(0);
      const row = query<Record<string, unknown>>(db, 'SELECT enable FROM agent WHERE agent_id = ?', 'busy-agent');
      expect(row!.enable).toBe(1);
    });
  });

  // ==========================================================================
  // 7. getAgentRule / updateAgentRule (TC-AL-046 through TC-AL-054)
  // ==========================================================================
  describe('getAgentRule', () => {
    it('TC-AL-046: empty rules returns empty list', () => {
      const output = new GetAgentRuleOutput();

      service.getAgentRule(new GetAgentRuleInput(), new GetAgentRuleContext(), output);

      expect(output.rules).toEqual([]);
    });

    it('returns all rules when present', () => {
      service.getAgentRule(new GetAgentRuleInput(), new GetAgentRuleContext(), new GetAgentRuleOutput());

      db.prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('r-1', FIXED_DATE, FIXED_DATE, 7, 3, 50);
      db.prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('r-2', FIXED_DATE, FIXED_DATE, 30, 5, 60);

      const output = new GetAgentRuleOutput();
      service.getAgentRule(new GetAgentRuleInput(), new GetAgentRuleContext(), output);

      expect(output.rules).toHaveLength(2);
      expect(output.rules![0].days).toBe(7);
      expect(output.rules![1].days).toBe(30);
    });
  });

  describe('updateAgentRule', () => {
    it('TC-AL-048: INSERT a new rule', () => {
      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'INSERT', data: { days: 7, min_usage_count: 3, min_eval_score: 50 } }],
      });

      service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput());

      const rules = queryAll<Record<string, unknown>>(db, 'SELECT * FROM agent_opt_rule');
      expect(rules).toHaveLength(1);
      expect(rules[0].days).toBe(7);
      expect(rules[0].min_usage_count).toBe(3);
      expect(rules[0].min_eval_score).toBe(50);
    });

    it('TC-AL-049: INSERT with days <= 0 throws ValidationError', () => {
      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'INSERT', data: { days: 0, min_usage_count: 3, min_eval_score: 50 } }],
      });

      expect(() => service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-049b: INSERT with negative days throws ValidationError', () => {
      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'INSERT', data: { days: -1, min_usage_count: 3, min_eval_score: 50 } }],
      });

      expect(() => service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-050: UPDATE an existing rule', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'bootstrap', agent_name: 'boot' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      db.prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('rule-upd', FIXED_DATE, FIXED_DATE, 7, 3, 50);

      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'UPDATE', id: 'rule-upd', data: { days: 14 } }],
      });

      service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput());

      const row = query<Record<string, unknown>>(db, 'SELECT days, updated FROM agent_opt_rule WHERE id = ?', 'rule-upd');
      expect(row!.days).toBe(14);
      expect(row!.updated).toBeGreaterThanOrEqual(FIXED_DATE);
    });

    it('TC-AL-051: DELETE a rule', () => {
      service.addAgent(
        makeAddAgentInput({ agent_id: 'bootstrap', agent_name: 'boot' }),
        new AddAgentContext(), new AddAgentOutput(),
      );
      db.prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('rule-del', FIXED_DATE, FIXED_DATE, 7, 3, 50);

      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'DELETE', id: 'rule-del' }],
      });

      service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput());

      const count = db.prepare('SELECT COUNT(*) as cnt FROM agent_opt_rule').get() as { cnt: number };
      expect(count.cnt).toBe(0);
    });

    it('TC-AL-052: empty operations returns true (no-op)', () => {
      const input = new UpdateAgentRuleInput({ operations: [] });

      const result = service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput());

      expect(result).toBe(true);
    });

    it('TC-AL-053: INSERT with min_eval_score out of 0-100 throws ValidationError', () => {
      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'INSERT', data: { days: 30, min_usage_count: 3, min_eval_score: 150 } }],
      });

      expect(() => service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-053b: INSERT with negative min_eval_score throws ValidationError', () => {
      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'INSERT', data: { days: 30, min_usage_count: 3, min_eval_score: -5 } }],
      });

      expect(() => service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-053c: INSERT with negative min_usage_count throws ValidationError', () => {
      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'INSERT', data: { days: 30, min_usage_count: -1, min_eval_score: 50 } }],
      });

      expect(() => service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-054: UPDATE non-existent rule throws NotFoundError', () => {
      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'UPDATE', id: 'non-existent-rule', data: { days: 14 } }],
      });

      expect(() => service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput()))
        .toThrow(NotFoundError);
    });

    it('TC-AL-054b: DELETE without id throws ValidationError', () => {
      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'DELETE' } as { type: 'INSERT' | 'UPDATE' | 'DELETE'; id: string }],
      });

      expect(() => service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-054c: UPDATE without id throws ValidationError', () => {
      const input = new UpdateAgentRuleInput({
        operations: [{ type: 'UPDATE' } as { type: 'INSERT' | 'UPDATE' | 'DELETE'; id: string }],
      });

      expect(() => service.updateAgentRule(input, new UpdateAgentRuleContext(), new UpdateAgentRuleOutput()))
        .toThrow(ValidationError);
    });
  });

  // ==========================================================================
  // 8. configAgentLibrary (TC-AL-055 through TC-AL-060)
  // ==========================================================================
  describe('configAgentLibrary', () => {
    it('TC-AL-055: initial config has defaults', () => {
      const input = new ConfigAgentLibraryInput({});
      const output = new ConfigAgentLibraryOutput();

      service.configAgentLibrary(input, new ConfigAgentLibraryContext(), output);

      expect(output.similarity_threshold).toBe(0.7);
      expect(output.max_agent_count).toBe(100);
      expect(output.prompt_template_id).toBe('');
    });

    it('TC-AL-056: update similarity_threshold', () => {
      const input = new ConfigAgentLibraryInput({ similarity_threshold: 0.85 });
      const output = new ConfigAgentLibraryOutput();

      service.configAgentLibrary(input, new ConfigAgentLibraryContext(), output);

      expect(output.similarity_threshold).toBe(0.85);

      const config = query<Record<string, unknown>>(db, 'SELECT similarity_threshold FROM agent_library_config LIMIT 1');
      expect(config!.similarity_threshold).toBe(0.85);
    });

    it('TC-AL-057: update max_agent_count', () => {
      const input = new ConfigAgentLibraryInput({ max_agent_count: 30 });
      const output = new ConfigAgentLibraryOutput();

      service.configAgentLibrary(input, new ConfigAgentLibraryContext(), output);

      expect(output.max_agent_count).toBe(30);

      const config = query<Record<string, unknown>>(db, 'SELECT max_agent_count FROM agent_library_config LIMIT 1');
      expect(config!.max_agent_count).toBe(30);
    });

    it('TC-AL-058: similarity_threshold > 1 throws ValidationError', () => {
      const input = new ConfigAgentLibraryInput({ similarity_threshold: 1.5 });

      expect(() => service.configAgentLibrary(input, new ConfigAgentLibraryContext(), new ConfigAgentLibraryOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-058b: similarity_threshold < 0 throws ValidationError', () => {
      const input = new ConfigAgentLibraryInput({ similarity_threshold: -0.5 });

      expect(() => service.configAgentLibrary(input, new ConfigAgentLibraryContext(), new ConfigAgentLibraryOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-059: max_agent_count=0 throws ValidationError', () => {
      const input = new ConfigAgentLibraryInput({ max_agent_count: 0 });

      expect(() => service.configAgentLibrary(input, new ConfigAgentLibraryContext(), new ConfigAgentLibraryOutput()))
        .toThrow(ValidationError);
    });

    it('TC-AL-059b: max_agent_count negative throws ValidationError', () => {
      const input = new ConfigAgentLibraryInput({ max_agent_count: -5 });

      expect(() => service.configAgentLibrary(input, new ConfigAgentLibraryContext(), new ConfigAgentLibraryOutput()))
        .toThrow(ValidationError);
    });
  });

  // ==========================================================================
  // 9. calculateSimilarity (Jaccard similarity)
  // ==========================================================================
  describe('calculateSimilarity', () => {
    it('same strings return 1.0', () => {
      expect(service.calculateSimilarity('coding write function', 'coding write function')).toBe(1.0);
    });

    it('completely different strings return 0.0', () => {
      expect(service.calculateSimilarity('coding write function', 'cooking make pasta')).toBe(0.0);
    });

    it('empty first string returns 0.0', () => {
      expect(service.calculateSimilarity('', 'coding write function')).toBe(0.0);
    });

    it('empty second string returns 0.0', () => {
      expect(service.calculateSimilarity('coding write function', '')).toBe(0.0);
    });

    it('both empty strings returns 0.0', () => {
      expect(service.calculateSimilarity('', '')).toBe(0.0);
    });

    it('partial overlap calculates correct Jaccard coefficient', () => {
      expect(service.calculateSimilarity('coding write function', 'coding write test')).toBe(2 / 4);
    });

    it('one word common with different lengths', () => {
      expect(service.calculateSimilarity('a b c d e', 'a x y')).toBe(1 / 7);
    });

    it('case insensitive comparison', () => {
      expect(service.calculateSimilarity('CODING Write FUNCTION', 'coding write function')).toBe(1.0);
    });

    it('treats commas as word separators', () => {
      expect(service.calculateSimilarity('coding,write,function', 'coding write function')).toBe(1.0);
    });

    it('treats underscores as word separators', () => {
      expect(service.calculateSimilarity('coding_write_function', 'coding write function')).toBe(1.0);
    });

    it('treats hyphens as word separators', () => {
      expect(service.calculateSimilarity('coding-write-function', 'coding write function')).toBe(1.0);
    });

    it('ignores duplicate words within each string', () => {
      expect(service.calculateSimilarity('coding coding write write', 'coding write')).toBe(1.0);
    });
  });
});
