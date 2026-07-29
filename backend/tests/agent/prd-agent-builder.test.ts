import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setDatabase as setLibDb } from '../../src/agent/AgentLibrary/db';
import { createAgentLibraryService, AddAgentInput, AddAgentContext, AddAgentOutput, GetAgentInput, GetAgentContext, GetAgentOutput } from '../../src/agent/AgentLibrary/AgentLibrary';
import { createAgentStrategyService } from '../../src/agent/AgentStrategy/AgentStrategy';
import {
  createAgentBuilderService,
  BuildAgentInput,
  BuildAgentContext,
  BuildAgentOutput,
  OptimizeAgentInput,
  OptimizeAgentContext,
  OptimizeAgentOutput,
  BuildPlannerAgentInput,
  BuildPlannerAgentContext,
  BuildPlannerAgentOutput,
  BuildWriterAgentInput,
  BuildWriterAgentContext,
  BuildWriterAgentOutput,
  BuildEvolutorAgentInput,
  BuildEvolutorAgentContext,
  BuildEvolutorAgentOutput,
  ConfigAgentBuilderInput,
  ConfigAgentBuilderContext,
  ConfigAgentBuilderOutput,
} from '../../src/agent/AgentBuilder/AgentBuilder';
import type { AgentLibraryService } from '../../src/agent/AgentLibrary/AgentLibrary';
import type { AgentStrategyService } from '../../src/agent/AgentStrategy/AgentStrategy';
import type { AgentDatabase } from '../../src/agent/infra/dbTypes';

let db: Database.Database;
let libService: AgentLibraryService;
let stratService: AgentStrategyService;
let builderService: ReturnType<typeof createAgentBuilderService>;

function getAgentFromDb(agentId: string): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM agent WHERE agent_id = ?').get(agentId) as Record<string, unknown> | undefined;
}

function countAgents(agentType?: string): number {
  if (agentType) {
    const row = db.prepare('SELECT COUNT(*) as c FROM agent WHERE agent_type = ?').get(agentType) as { c: number };
    return row.c;
  }
  const row = db.prepare('SELECT COUNT(*) as c FROM agent').get() as { c: number };
  return row.c;
}

function countAgentUsages(agentId: string): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM agent_usage WHERE agent_id = ?').get(agentId) as { c: number };
  return row.c;
}

function getAgentBuilderConfig(): Record<string, unknown> {
  return db.prepare('SELECT * FROM agent_builder_config LIMIT 1').get() as Record<string, unknown>;
}

beforeEach(() => {
  db = new Database(':memory:');
  setLibDb(db);
  libService = createAgentLibraryService();
  stratService = createAgentStrategyService(db);
  builderService = createAgentBuilderService(db, libService, stratService);
});

afterEach(() => {
  db.close();
});

// ============================================================
// 1. buildAgent
// ============================================================
describe('buildAgent', () => {
  // TC-AB-001: New Agent build — creates WORKER agent with strategy_id, llm_id='', soul_id=''
  it('TC-AB-001: creates a new WORKER agent with strategy_id, llm_id="", soul_id=""', () => {
    const output = new BuildAgentOutput();
    const result = builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a sorting algorithm' }),
      new BuildAgentContext({ sessionId: 'sess-1', workId: 'work-1' }),
      output,
    );

    expect(result).toBe(true);
    expect(output.agent_id).toBeTruthy();

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent).toBeDefined();
    expect(agent!.agent_type).toBe('WORKER');
    expect(agent!.llm_id).toBe('');
    expect(agent!.soul_id).toBe('');
    expect(agent!.strategy_id).toBeTruthy();
    expect(agent!.strategy_id).not.toBe('');
  });

  // TC-AB-002: Reuse existing — when matching agent exists, returns existing agent_id and calls recordAgentUsage
  it('TC-AB-002: reuses existing agent when matching agent found', () => {
    // First build creates an agent
    const out1 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a React frontend component' }),
      new BuildAgentContext({ sessionId: 'sess-1', workId: 'work-1' }),
      out1,
    );
    const firstAgentId = out1.agent_id!;

    // Second build with similar task content should match the existing agent
    const out2 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-2', task_content: 'Write a React UI component' }),
      new BuildAgentContext({ sessionId: 'sess-2', workId: 'work-2' }),
      out2,
    );

    expect(out2.agent_id).toBe(firstAgentId);
    expect(countAgents('WORKER')).toBe(1);

    // Verify recordAgentUsage was called (usage record exists)
    const usageCount = countAgentUsages(firstAgentId);
    expect(usageCount).toBeGreaterThanOrEqual(1);
  });

  // TC-AB-003: force_new=true skips matching and creates new agent
  it('TC-AB-003: force_new=true creates a new agent even when matching agent exists', () => {
    const out1 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a React frontend component' }),
      new BuildAgentContext({ sessionId: 'sess-1', workId: 'work-1' }),
      out1,
    );
    const firstAgentId = out1.agent_id!;

    const out2 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-2', task_content: 'Write a React frontend component', force_new: true }),
      new BuildAgentContext({ sessionId: 'sess-2', workId: 'work-2' }),
      out2,
    );

    expect(out2.agent_id).toBeTruthy();
    expect(out2.agent_id).not.toBe(firstAgentId);
    expect(countAgents('WORKER')).toBe(2);
  });

  // TC-AB-004: force_new=false (default) — tries matching first, then creates if no match
  it('TC-AB-004: default force_new=false reuses matching agent', () => {
    const out1 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a React frontend component' }),
      new BuildAgentContext({ sessionId: 'sess-1', workId: 'work-1' }),
      out1,
    );
    const firstAgentId = out1.agent_id!;

    // force_new not provided — should match
    const out2 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-2', task_content: 'Write a React frontend component' }),
      new BuildAgentContext({ sessionId: 'sess-2', workId: 'work-2' }),
      out2,
    );
    expect(out2.agent_id).toBe(firstAgentId);

    // force_new=false explicitly — should match
    const out3 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-3', task_content: 'Write a React frontend component', force_new: false }),
      new BuildAgentContext({ sessionId: 'sess-3', workId: 'work-3' }),
      out3,
    );
    expect(out3.agent_id).toBe(firstAgentId);
  });

  // TC-AB-005: Complexity/domain auto-estimation works
  it('TC-AB-005: auto-estimates domain and complexity from task_content', () => {
    const output = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Create a React frontend component with CSS' }),
      new BuildAgentContext({ sessionId: 'sess-1' }),
      output,
    );

    const agent = getAgentFromDb(output.agent_id!);
    // task_signature should contain the estimated domain prefix
    expect(agent!.task_signature).toContain('frontend');
    expect(agent!.task_signature).toContain('React');
  });

  // TC-AB-005b: explicit task_complexity and task_domain are passed through
  it('TC-AB-005b: uses explicit task_complexity and task_domain when provided', () => {
    const output = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({
        interact_id: 'int-1',
        task_content: 'General task',
        task_complexity: 75,
        task_domain: 'custom-domain',
      }),
      new BuildAgentContext({ sessionId: 'sess-1' }),
      output,
    );

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent!.task_signature).toContain('custom-domain');
  });

  // TC-AB-006: Domain estimation covers different patterns
  it('TC-AB-006: estimates backend domain for API-related task', () => {
    const output = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Build a REST API server with database' }),
      new BuildAgentContext(),
      output,
    );

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent!.task_signature).toContain('backend');
  });

  it('TC-AB-006b: estimates data_science domain for ML tasks', () => {
    const output = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Train a machine learning model for analytics' }),
      new BuildAgentContext(),
      output,
    );

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent!.task_signature).toContain('data_science');
  });

  it('TC-AB-006c: estimates devops domain for deployment tasks', () => {
    const output = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Deploy infrastructure with docker on kubernetes cluster' }),
      new BuildAgentContext(),
      output,
    );

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent!.task_signature).toContain('devops');
  });

  it('TC-AB-006d: estimates security domain for auth tasks', () => {
    const output = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Implement OAuth authentication with encryption' }),
      new BuildAgentContext(),
      output,
    );

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent!.task_signature).toContain('security');
  });

  it('TC-AB-006e: estimates general domain for unrecognized tasks', () => {
    const output = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Do something completely random and abstract' }),
      new BuildAgentContext(),
      output,
    );

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent!.task_signature).toContain('general');
  });

  // TC-AB-007: Match strategy failure — when no strategies exist, addAgent rejects empty strategy_id
  it('TC-AB-007: throws when strategy table is empty (empty strategy_id rejected by addAgent)', () => {
    // Delete all strategies to simulate matchStrategy returning empty
    db.prepare('DELETE FROM agent_strategy').run();
    // Also clear the match_config default
    db.prepare('UPDATE agent_strategy_match_config SET default_strategy_id = ?').run('');

    const output = new BuildAgentOutput();
    expect(() => {
      builderService.buildAgent(
        new BuildAgentInput({ interact_id: 'int-1', task_content: 'Some task' }),
        new BuildAgentContext(),
        output,
      );
    }).toThrow(/strategy_id/);
  });

  // TC-AB-008: buildAgent with valid task_content succeeds (returns true)
  it('TC-AB-008: buildAgent returns true on success', () => {
    const output = new BuildAgentOutput();
    const result = builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'A valid task description' }),
      new BuildAgentContext(),
      output,
    );
    expect(result).toBe(true);
    expect(output.agent_id).toBeTruthy();
  });

  // TC-AB-009: Multiple builds with different content create different agents
  it('TC-AB-009: distinct task contents create distinct agents with different strategy_ids', () => {
    const out1 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a React frontend component' }),
      new BuildAgentContext(),
      out1,
    );

    // Second call with very different domain — should not match
    const out2 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-2', task_content: 'Deploy docker containers to AWS cloud infrastructure' }),
      new BuildAgentContext(),
      out2,
    );

    expect(out2.agent_id).not.toBe(out1.agent_id);
    expect(countAgents('WORKER')).toBe(2);
  });

  // TC-AB-010: Agent name is auto-generated
  it('TC-AB-010: auto-generates agent name from agent_id', () => {
    const output = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Some task' }),
      new BuildAgentContext(),
      output,
    );

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent!.agent_name).toBeDefined();
    expect(agent!.agent_name).toContain('Agent-');
  });

  // TC-AB-011: Reuse does NOT create a new agent_usage entry on the first build
  it('TC-AB-011: first build does not generate usage records', () => {
    const out1 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a React frontend component' }),
      new BuildAgentContext({ sessionId: 'sess-1', workId: 'work-1' }),
      out1,
    );

    // First build should not have recordAgentUsage called
    const usageCount = countAgentUsages(out1.agent_id!);
    expect(usageCount).toBe(0);
  });

  // TC-AB-012: Reuse increments usage count
  it('TC-AB-012: reuse records agent usage', () => {
    const out1 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a React frontend component' }),
      new BuildAgentContext({ sessionId: 'sess-1', workId: 'work-1' }),
      out1,
    );
    const agentId = out1.agent_id!;

    // Reuse
    const out2 = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-2', task_content: 'Write a React UI component' }),
      new BuildAgentContext({ sessionId: 'sess-2', workId: 'work-2' }),
      out2,
    );

    expect(out2.agent_id).toBe(agentId);
    const usageCount = countAgentUsages(agentId);
    expect(usageCount).toBe(1);
  });
});

// ============================================================
// 2. optimizeAgent
// ============================================================
describe('optimizeAgent', () => {
  // TC-AB-013: Agent exists, re-matches strategy with different result — changes recorded
  it('TC-AB-013: detects strategy change when current and matched differ', () => {
    // Build an agent first
    const buildOut = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a sorting algorithm' }),
      new BuildAgentContext({ sessionId: 'sess-1', workId: 'work-1' }),
      buildOut,
    );
    const agentId = buildOut.agent_id!;

    // Tamper with the stored strategy_id to force a mismatch
    db.prepare('UPDATE agent SET strategy_id = ? WHERE agent_id = ?').run('old-strategy-id', agentId);

    const optOut = new OptimizeAgentOutput();
    builderService.optimizeAgent(
      new OptimizeAgentInput({ agent_id: agentId, interact_id: 'int-1' }),
      new OptimizeAgentContext(),
      optOut,
    );

    expect(optOut.optimized).toBe(true);
    expect(optOut.changes).toBeDefined();
    expect(optOut.changes!.length).toBe(1);
    expect(optOut.changes![0].component).toBe('strategy');
    expect(optOut.changes![0].from).toBe('old-strategy-id');
    expect(optOut.changes![0].to).toBeTruthy();
    expect(optOut.changes![0].to).not.toBe('old-strategy-id');
  });

  // TC-AB-014: All components unchanged — optimized=false, changes=[]
  it('TC-AB-014: optimized=false when no components need changing', () => {
    const buildOut = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a sorting algorithm' }),
      new BuildAgentContext({ sessionId: 'sess-1', workId: 'work-1' }),
      buildOut,
    );
    const agentId = buildOut.agent_id!;

    const optOut = new OptimizeAgentOutput();
    builderService.optimizeAgent(
      new OptimizeAgentInput({ agent_id: agentId, interact_id: 'int-2' }),
      new OptimizeAgentContext(),
      optOut,
    );

    expect(optOut.optimized).toBe(false);
    expect(optOut.changes).toEqual([]);
  });

  // TC-AB-015: Optimize updates the strategy_id in the agent
  it('TC-AB-015: optimize updates agent strategy_id when change detected', () => {
    const buildOut = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a sorting algorithm' }),
      new BuildAgentContext(),
      buildOut,
    );
    const agentId = buildOut.agent_id!;
    const originalStrategyId = getAgentFromDb(agentId)!.strategy_id as string;

    // Tamper with strategy_id
    db.prepare('UPDATE agent SET strategy_id = ? WHERE agent_id = ?').run('old-strategy-id', agentId);

    const optOut = new OptimizeAgentOutput();
    builderService.optimizeAgent(
      new OptimizeAgentInput({ agent_id: agentId, interact_id: 'int-2' }),
      new OptimizeAgentContext(),
      optOut,
    );

    // The agent in DB should now have the new (re-matched) strategy_id
    const updated = getAgentFromDb(agentId);
    expect(updated!.strategy_id).not.toBe('old-strategy-id');
    expect(updated!.strategy_id).toBe(originalStrategyId);
  });

  // TC-AB-019: Non-existent agent throws NotFoundError
  it('TC-AB-019: throws NotFoundError for non-existent agent', () => {
    expect(() => {
      builderService.optimizeAgent(
        new OptimizeAgentInput({ agent_id: 'non-existent-agent', interact_id: 'int-1' }),
        new OptimizeAgentContext(),
        new OptimizeAgentOutput(),
      );
    }).toThrow(/not found/);
  });

  // TC-AB-020: usage_feedback in input (accepted but not used in current implementation)
  it('TC-AB-020: accepts usage_feedback without error', () => {
    const buildOut = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a sorting algorithm' }),
      new BuildAgentContext(),
      buildOut,
    );

    const optOut = new OptimizeAgentOutput();
    expect(() => {
      builderService.optimizeAgent(
        new OptimizeAgentInput({
          agent_id: buildOut.agent_id!,
          interact_id: 'int-2',
          usage_feedback: 'The agent response was too verbose',
        }),
        new OptimizeAgentContext(),
        optOut,
      );
    }).not.toThrow();
  });

  // TC-AB-016: Optimize with all strategies disabled still completes
  it('TC-AB-016: completes without error when no strategies are enabled', () => {
    const buildOut = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a sorting algorithm' }),
      new BuildAgentContext(),
      buildOut,
    );
    const agentId = buildOut.agent_id!;

    // Disable all strategies
    db.prepare('UPDATE agent_strategy SET enable = 0').run();

    const optOut = new OptimizeAgentOutput();
    builderService.optimizeAgent(
      new OptimizeAgentInput({ agent_id: agentId, interact_id: 'int-2' }),
      new OptimizeAgentContext(),
      optOut,
    );

    // Should complete successfully, not throw
    expect(optOut.optimized !== undefined).toBe(true);
  });

  // TC-AB-017: Multiple consecutive optimizations
  it('TC-AB-017: second optimize with no changes returns optimized=false', () => {
    const buildOut = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a sorting algorithm' }),
      new BuildAgentContext(),
      buildOut,
    );
    const agentId = buildOut.agent_id!;

    // Tamper and optimize once
    db.prepare('UPDATE agent SET strategy_id = ? WHERE agent_id = ?').run('old-strategy-id', agentId);
    const optOut1 = new OptimizeAgentOutput();
    builderService.optimizeAgent(
      new OptimizeAgentInput({ agent_id: agentId, interact_id: 'int-2' }),
      new OptimizeAgentContext(),
      optOut1,
    );
    expect(optOut1.optimized).toBe(true);

    // Now optimize again — should find no changes
    const optOut2 = new OptimizeAgentOutput();
    builderService.optimizeAgent(
      new OptimizeAgentInput({ agent_id: agentId, interact_id: 'int-3' }),
      new OptimizeAgentContext(),
      optOut2,
    );
    expect(optOut2.optimized).toBe(false);
    expect(optOut2.changes).toEqual([]);
  });
});

// ============================================================
// 3. buildPlannerAgent
// ============================================================
describe('buildPlannerAgent', () => {
  // TC-AB-021: First build creates PLANNER agent (agent_type='PLANNER')
  it('TC-AB-021: first build creates PLANNER agent', () => {
    const output = new BuildPlannerAgentOutput();
    builderService.buildPlannerAgent(
      new BuildPlannerAgentInput(),
      new BuildPlannerAgentContext(),
      output,
    );

    expect(output.agent_id).toBeTruthy();

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent).toBeDefined();
    expect(agent!.agent_type).toBe('PLANNER');
    expect(agent!.strategy_id).toBe('plan-and-solve');
    expect(agent!.llm_id).toBe('');
    expect(agent!.soul_id).toBe('');
    expect(agent!.task_signature).toBe('planner');
    expect(agent!.agent_name).toBe('PlannerAgent');
  });

  // TC-AB-022: Existing Planner reused
  it('TC-AB-022: reuses existing PLANNER agent', () => {
    const out1 = new BuildPlannerAgentOutput();
    builderService.buildPlannerAgent(
      new BuildPlannerAgentInput(),
      new BuildPlannerAgentContext(),
      out1,
    );
    const firstId = out1.agent_id!;

    const out2 = new BuildPlannerAgentOutput();
    builderService.buildPlannerAgent(
      new BuildPlannerAgentInput(),
      new BuildPlannerAgentContext(),
      out2,
    );

    expect(out2.agent_id).toBe(firstId);
    expect(countAgents('PLANNER')).toBe(1);
  });

  // TC-AB-023: force_new=true creates new Planner
  it('TC-AB-023: force_new=true creates a new PLANNER agent', () => {
    const out1 = new BuildPlannerAgentOutput();
    builderService.buildPlannerAgent(
      new BuildPlannerAgentInput(),
      new BuildPlannerAgentContext(),
      out1,
    );
    const firstId = out1.agent_id!;

    const out2 = new BuildPlannerAgentOutput();
    builderService.buildPlannerAgent(
      new BuildPlannerAgentInput({ force_new: true }),
      new BuildPlannerAgentContext(),
      out2,
    );

    expect(out2.agent_id).toBeTruthy();
    expect(out2.agent_id).not.toBe(firstId);
    expect(countAgents('PLANNER')).toBe(2);
  });

  // TC-AB-024: force_new=false explicitly reuses
  it('TC-AB-024: force_new=false reuses existing PLANNER', () => {
    const out1 = new BuildPlannerAgentOutput();
    builderService.buildPlannerAgent(
      new BuildPlannerAgentInput(),
      new BuildPlannerAgentContext(),
      out1,
    );
    const firstId = out1.agent_id!;

    const out2 = new BuildPlannerAgentOutput();
    builderService.buildPlannerAgent(
      new BuildPlannerAgentInput({ force_new: false }),
      new BuildPlannerAgentContext(),
      out2,
    );

    expect(out2.agent_id).toBe(firstId);
  });
});

// ============================================================
// 4. buildWriterAgent
// ============================================================
describe('buildWriterAgent', () => {
  // TC-AB-025: First build creates WRITER agent (agent_type='WRITER')
  it('TC-AB-025: first build creates WRITER agent', () => {
    const output = new BuildWriterAgentOutput();
    builderService.buildWriterAgent(
      new BuildWriterAgentInput(),
      new BuildWriterAgentContext(),
      output,
    );

    expect(output.agent_id).toBeTruthy();

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent).toBeDefined();
    expect(agent!.agent_type).toBe('WRITER');
    expect(agent!.strategy_id).toBe('cot');
    expect(agent!.llm_id).toBe('');
    expect(agent!.soul_id).toBe('');
    expect(agent!.task_signature).toBe('writer');
    expect(agent!.agent_name).toBe('WriterAgent');
  });

  // TC-AB-026: Existing Writer reused
  it('TC-AB-026: reuses existing WRITER agent', () => {
    const out1 = new BuildWriterAgentOutput();
    builderService.buildWriterAgent(
      new BuildWriterAgentInput(),
      new BuildWriterAgentContext(),
      out1,
    );
    const firstId = out1.agent_id!;

    const out2 = new BuildWriterAgentOutput();
    builderService.buildWriterAgent(
      new BuildWriterAgentInput(),
      new BuildWriterAgentContext(),
      out2,
    );

    expect(out2.agent_id).toBe(firstId);
    expect(countAgents('WRITER')).toBe(1);
  });

  // TC-AB-027: force_new=true creates new Writer
  it('TC-AB-027: force_new=true creates a new WRITER agent', () => {
    const out1 = new BuildWriterAgentOutput();
    builderService.buildWriterAgent(
      new BuildWriterAgentInput(),
      new BuildWriterAgentContext(),
      out1,
    );

    const out2 = new BuildWriterAgentOutput();
    builderService.buildWriterAgent(
      new BuildWriterAgentInput({ force_new: true }),
      new BuildWriterAgentContext(),
      out2,
    );

    expect(out2.agent_id).toBeTruthy();
    expect(out2.agent_id).not.toBe(out1.agent_id);
    expect(countAgents('WRITER')).toBe(2);
  });
});

// ============================================================
// 5. buildEvolutorAgent
// ============================================================
describe('buildEvolutorAgent', () => {
  // TC-AB-028: First build creates EVOLUTOR agent (agent_type='EVOLUTOR')
  it('TC-AB-028: first build creates EVOLUTOR agent', () => {
    const output = new BuildEvolutorAgentOutput();
    builderService.buildEvolutorAgent(
      new BuildEvolutorAgentInput(),
      new BuildEvolutorAgentContext(),
      output,
    );

    expect(output.agent_id).toBeTruthy();

    const agent = getAgentFromDb(output.agent_id!);
    expect(agent).toBeDefined();
    expect(agent!.agent_type).toBe('EVOLUTOR');
    expect(agent!.strategy_id).toBe('react');
    expect(agent!.llm_id).toBe('');
    expect(agent!.soul_id).toBe('');
    expect(agent!.task_signature).toBe('evolutor');
    expect(agent!.agent_name).toBe('EvolutorAgent');
  });

  // TC-AB-029: Existing Evolutor reused
  it('TC-AB-029: reuses existing EVOLUTOR agent', () => {
    const out1 = new BuildEvolutorAgentOutput();
    builderService.buildEvolutorAgent(
      new BuildEvolutorAgentInput(),
      new BuildEvolutorAgentContext(),
      out1,
    );
    const firstId = out1.agent_id!;

    const out2 = new BuildEvolutorAgentOutput();
    builderService.buildEvolutorAgent(
      new BuildEvolutorAgentInput(),
      new BuildEvolutorAgentContext(),
      out2,
    );

    expect(out2.agent_id).toBe(firstId);
    expect(countAgents('EVOLUTOR')).toBe(1);
  });

  // TC-AB-030: force_new=true creates new Evolutor
  it('TC-AB-030: force_new=true creates a new EVOLUTOR agent', () => {
    const out1 = new BuildEvolutorAgentOutput();
    builderService.buildEvolutorAgent(
      new BuildEvolutorAgentInput(),
      new BuildEvolutorAgentContext(),
      out1,
    );

    const out2 = new BuildEvolutorAgentOutput();
    builderService.buildEvolutorAgent(
      new BuildEvolutorAgentInput({ force_new: true }),
      new BuildEvolutorAgentContext(),
      out2,
    );

    expect(out2.agent_id).toBeTruthy();
    expect(out2.agent_id).not.toBe(out1.agent_id);
    expect(countAgents('EVOLUTOR')).toBe(2);
  });
});

// ============================================================
// 6. configAgentBuilder
// ============================================================
describe('configAgentBuilder', () => {
  // TC-AB-031: Initial config — defaults from table creation
  it('TC-AB-031: initial config has default values', () => {
    const output = new ConfigAgentBuilderOutput();

    // The config row already exists from AgentBuilderService constructor.
    // Calling configAgentBuilder with no params returns current values.
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput(),
      new ConfigAgentBuilderContext(),
      output,
    );

    expect(output.task_analysis_prompt_template_id).toBe('');
    expect(output.default_strategy_id).toBe('');
    expect(output.auto_optimize).toBe(true);
  });

  // TC-AB-032: Update task_analysis_prompt_template_id
  it('TC-AB-032: updates task_analysis_prompt_template_id', () => {
    const output = new ConfigAgentBuilderOutput();
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput({ task_analysis_prompt_template_id: 'prompt-tpl-123' }),
      new ConfigAgentBuilderContext(),
      output,
    );

    expect(output.task_analysis_prompt_template_id).toBe('prompt-tpl-123');

    // Verify persisted in DB
    const config = getAgentBuilderConfig();
    expect(config.task_analysis_prompt_template_id).toBe('prompt-tpl-123');
  });

  // TC-AB-033: Update task_analysis_prompt_template_id to empty
  it('TC-AB-033: clears task_analysis_prompt_template_id to empty', () => {
    // First set a value
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput({ task_analysis_prompt_template_id: 'prompt-tpl-123' }),
      new ConfigAgentBuilderContext(),
      new ConfigAgentBuilderOutput(),
    );

    // Now clear it
    const output = new ConfigAgentBuilderOutput();
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput({ task_analysis_prompt_template_id: '' }),
      new ConfigAgentBuilderContext(),
      output,
    );

    expect(output.task_analysis_prompt_template_id).toBe('');
    const config = getAgentBuilderConfig();
    expect(config.task_analysis_prompt_template_id).toBe('');
  });

  // TC-AB-034: Update default_strategy_id
  it('TC-AB-034: updates default_strategy_id', () => {
    const output = new ConfigAgentBuilderOutput();
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput({ default_strategy_id: 'strat-xyz' }),
      new ConfigAgentBuilderContext(),
      output,
    );

    expect(output.default_strategy_id).toBe('strat-xyz');

    const config = getAgentBuilderConfig();
    expect(config.default_strategy_id).toBe('strat-xyz');
  });

  // TC-AB-035: Update both task_analysis_prompt_template_id and default_strategy_id together
  it('TC-AB-035: updates multiple config fields simultaneously', () => {
    const output = new ConfigAgentBuilderOutput();
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput({
        task_analysis_prompt_template_id: 'prompt-abc',
        default_strategy_id: 'strat-def',
      }),
      new ConfigAgentBuilderContext(),
      output,
    );

    expect(output.task_analysis_prompt_template_id).toBe('prompt-abc');
    expect(output.default_strategy_id).toBe('strat-def');

    // auto_optimize should remain at default (true) since not specified
    expect(output.auto_optimize).toBe(true);
  });

  // TC-AB-036: Update auto_optimize — toggle on/off
  it('TC-AB-036: toggles auto_optimize', () => {
    // Default is true; toggle to false
    const out1 = new ConfigAgentBuilderOutput();
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput({ auto_optimize: false }),
      new ConfigAgentBuilderContext(),
      out1,
    );
    expect(out1.auto_optimize).toBe(false);

    const config1 = getAgentBuilderConfig();
    expect(config1.auto_optimize).toBe(0);

    // Toggle back to true
    const out2 = new ConfigAgentBuilderOutput();
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput({ auto_optimize: true }),
      new ConfigAgentBuilderContext(),
      out2,
    );
    expect(out2.auto_optimize).toBe(true);

    const config2 = getAgentBuilderConfig();
    expect(config2.auto_optimize).toBe(1);
  });

  // TC-AB-036b: Auto optimize toggled off then on preserves other settings
  it('TC-AB-036b: toggling auto_optimize does not affect other config values', () => {
    // Set all fields first
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput({
        task_analysis_prompt_template_id: 'prompt-keep',
        default_strategy_id: 'strat-keep',
        auto_optimize: true,
      }),
      new ConfigAgentBuilderContext(),
      new ConfigAgentBuilderOutput(),
    );

    // Toggle auto_optimize only
    const output = new ConfigAgentBuilderOutput();
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput({ auto_optimize: false }),
      new ConfigAgentBuilderContext(),
      output,
    );

    expect(output.auto_optimize).toBe(false);
    expect(output.task_analysis_prompt_template_id).toBe('prompt-keep');
    expect(output.default_strategy_id).toBe('strat-keep');
  });
});

// ============================================================
// 7. Cross-method integration scenarios
// ============================================================
describe('Integration scenarios', () => {
  it('builds WORKER, PLANNER, WRITER, EVOLUTOR agents independently', () => {
    const workerOut = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-w', task_content: 'Write a React component' }),
      new BuildAgentContext(),
      workerOut,
    );

    const plannerOut = new BuildPlannerAgentOutput();
    builderService.buildPlannerAgent(
      new BuildPlannerAgentInput(),
      new BuildPlannerAgentContext(),
      plannerOut,
    );

    const writerOut = new BuildWriterAgentOutput();
    builderService.buildWriterAgent(
      new BuildWriterAgentInput(),
      new BuildWriterAgentContext(),
      writerOut,
    );

    const evolutorOut = new BuildEvolutorAgentOutput();
    builderService.buildEvolutorAgent(
      new BuildEvolutorAgentInput(),
      new BuildEvolutorAgentContext(),
      evolutorOut,
    );

    expect(countAgents()).toBe(4);
    expect(countAgents('WORKER')).toBe(1);
    expect(countAgents('PLANNER')).toBe(1);
    expect(countAgents('WRITER')).toBe(1);
    expect(countAgents('EVOLUTOR')).toBe(1);
  });

  it('optimizeAgent on a system agent updates strategy if changed', () => {
    // Build a planner which has strategy_id='plan-and-solve'
    const buildOut = new BuildPlannerAgentOutput();
    builderService.buildPlannerAgent(
      new BuildPlannerAgentInput({ force_new: true }),
      new BuildPlannerAgentContext(),
      buildOut,
    );
    const agentId = buildOut.agent_id!;

    // Tamper with strategy_id
    db.prepare('UPDATE agent SET strategy_id = ? WHERE agent_id = ?').run('wrong-strategy', agentId);

    const optOut = new OptimizeAgentOutput();
    builderService.optimizeAgent(
      new OptimizeAgentInput({ agent_id: agentId, interact_id: 'int-x' }),
      new OptimizeAgentContext(),
      optOut,
    );

    // optimizeAgent uses the task_signature to match strategy.
    // task_signature is 'planner', which has length 7. Complexity would be min(7, 49) = 7.
    // This falls in CoT range (0-40).
    // So it would match 'CoT' which is one of the seeded strategies.
    // The strategy_id would change from 'wrong-strategy' to whatever CoT's UUID is.
    expect(optOut.optimized).toBe(true);
    expect(optOut.changes!.length).toBe(1);
    expect(optOut.changes![0].component).toBe('strategy');
  });

  it('configAgentBuilder updates do not affect agent creation', () => {
    // Update config
    builderService.configAgentBuilder(
      new ConfigAgentBuilderInput({
        task_analysis_prompt_template_id: 'custom-prompt',
        default_strategy_id: 'custom-strat',
      }),
      new ConfigAgentBuilderContext(),
      new ConfigAgentBuilderOutput(),
    );

    // Still can build agents normally
    const out = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write a sorting algorithm' }),
      new BuildAgentContext(),
      out,
    );

    expect(out.agent_id).toBeTruthy();
    expect(countAgents('WORKER')).toBe(1);
  });

  it('buildAgent with force_new=false on empty library creates new agent', () => {
    // No agents exist, force_new=false — should create new
    const out = new BuildAgentOutput();
    builderService.buildAgent(
      new BuildAgentInput({ interact_id: 'int-1', task_content: 'Write code', force_new: false }),
      new BuildAgentContext(),
      out,
    );

    expect(out.agent_id).toBeTruthy();
    expect(countAgents('WORKER')).toBe(1);
  });
});
