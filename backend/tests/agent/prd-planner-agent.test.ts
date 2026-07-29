import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPlannerAgentService,
  PlanInput,
  PlanContext,
  PlanOutput,
  ReplanInput,
  ReplanContext,
  ReplanOutput,
  GetPlanInput,
  GetPlanContext,
  GetPlanOutput,
  ConfigPlannerAgentInput,
  ConfigPlannerAgentContext,
  ConfigPlannerAgentOutput,
  validateDAG,
  mergeSimilarTasks,
  DagNode,
  DagEdge,
  TaskDag,
} from '../../src/agent/PlannerAgent/PlannerAgent';

let db: Database.Database;
let service: ReturnType<typeof createPlannerAgentService>;
let mockLlmService: { chatCompletion: ReturnType<typeof vi.fn> };

beforeEach(() => {
  db = new Database(':memory:');
  mockLlmService = {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"nodes":[{"task_id":"n1","task_content":"Design DB schema","task_complexity":30,"task_domain":"database","priority":1,"dependencies":[]},{"task_id":"n2","task_content":"Implement API","task_complexity":50,"task_domain":"backend","priority":2,"dependencies":["n1"]}],"edges":[{"from_task_id":"n1","to_task_id":"n2"}]}' } }],
      usage: { totalTokens: 100 },
    }),
  };
  service = createPlannerAgentService(db, mockLlmService as any);
});

afterEach(() => {
  db.close();
});

describe('validateDAG (standalone)', () => {
  it('valid DAG with no cycles passes', () => {
    const nodes: DagNode[] = [
      { task_id: 't1', task_content: 'A', dependencies: [] },
      { task_id: 't2', task_content: 'B', dependencies: ['t1'] },
      { task_id: 't3', task_content: 'C', dependencies: ['t1', 't2'] },
    ];
    const edges: DagEdge[] = [
      { from_task_id: 't1', to_task_id: 't2' },
      { from_task_id: 't2', to_task_id: 't3' },
    ];
    const result = validateDAG(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('cycle detection: 3-node cycle detected', () => {
    const nodes: DagNode[] = [
      { task_id: 'a', task_content: 'A', dependencies: ['b'] },
      { task_id: 'b', task_content: 'B', dependencies: ['c'] },
      { task_id: 'c', task_content: 'C', dependencies: ['a'] },
    ];
    const edges: DagEdge[] = [];
    const result = validateDAG(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cycle');
    expect(result.cycles).toBeDefined();
    expect(result.cycles!.length).toBeGreaterThanOrEqual(1);
  });

  it('unknown from_task_id in edge: error', () => {
    const nodes: DagNode[] = [
      { task_id: 't1', task_content: 'A', dependencies: [] },
    ];
    const edges: DagEdge[] = [
      { from_task_id: 'ghost', to_task_id: 't1' },
    ];
    const result = validateDAG(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('unknown from_task_id');
    expect(result.error).toContain('ghost');
  });

  it('unknown to_task_id in edge: error', () => {
    const nodes: DagNode[] = [
      { task_id: 't1', task_content: 'A', dependencies: [] },
    ];
    const edges: DagEdge[] = [
      { from_task_id: 't1', to_task_id: 'ghost' },
    ];
    const result = validateDAG(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('unknown to_task_id');
    expect(result.error).toContain('ghost');
  });

  it('unknown dependency in node.dependencies: error', () => {
    const nodes: DagNode[] = [
      { task_id: 't1', task_content: 'A', dependencies: ['nonexistent'] },
    ];
    const edges: DagEdge[] = [];
    const result = validateDAG(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('unknown dependency');
    expect(result.error).toContain('nonexistent');
  });

  it('single node, no edges: valid', () => {
    const nodes: DagNode[] = [
      { task_id: 'single', task_content: 'Just one task', dependencies: [] },
    ];
    const edges: DagEdge[] = [];
    const result = validateDAG(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('diamond dependency (1->2, 1->3, 2->4, 3->4): valid (no cycles)', () => {
    const nodes: DagNode[] = [
      { task_id: '1', task_content: 'Root', dependencies: [] },
      { task_id: '2', task_content: 'Left', dependencies: ['1'] },
      { task_id: '3', task_content: 'Right', dependencies: ['1'] },
      { task_id: '4', task_content: 'Merge', dependencies: ['2', '3'] },
    ];
    const edges: DagEdge[] = [
      { from_task_id: '1', to_task_id: '2' },
      { from_task_id: '1', to_task_id: '3' },
      { from_task_id: '2', to_task_id: '4' },
      { from_task_id: '3', to_task_id: '4' },
    ];
    const result = validateDAG(nodes, edges);
    expect(result.valid).toBe(true);
  });
});

describe('plan', () => {
  it('TC-PA-001: simple task (short content, below threshold=50) returns single-node DAG', async () => {
    const input = new PlanInput({ work_id: 'w1', interact_id: 'i1', task_content: 'Short task' });
    const context = new PlanContext();
    const output = new PlanOutput();

    const result = await service.plan(input, context, output);
    expect(result).toBe(true);
    expect(output.plan_id).toBeDefined();
    expect(output.plan_id).toBeTruthy();

    const dag = output.task_dag as Record<string, unknown>;
    expect(dag).toBeDefined();
    expect(Array.isArray(dag.nodes)).toBe(true);
    expect((dag.nodes as unknown[]).length).toBe(1);
    expect((dag.edges as unknown[]).length).toBe(0);

    // LLM should not have been called for simple task
    expect(mockLlmService.chatCompletion).not.toHaveBeenCalled();
  });

  it('TC-PA-002: complex task (long content > 200 chars) triggers LLM and returns multi-node DAG', async () => {
    const longContent = 'A'.repeat(250);
    const input = new PlanInput({ work_id: 'w2', interact_id: 'i2', task_content: longContent });
    const context = new PlanContext();
    const output = new PlanOutput();

    const result = await service.plan(input, context, output);
    expect(result).toBe(true);
    expect(output.plan_id).toBeDefined();

    const dag = output.task_dag as Record<string, unknown>;
    expect(dag).toBeDefined();
    expect((dag.nodes as unknown[]).length).toBe(2);

    expect(mockLlmService.chatCompletion).toHaveBeenCalled();
  });

  it('TC-PA-003: plan returns plan_id and task_dag with nodes', async () => {
    const input = new PlanInput({ work_id: 'w3', interact_id: 'i3', task_content: 'Another short task' });
    const context = new PlanContext();
    const output = new PlanOutput();

    const result = await service.plan(input, context, output);
    expect(result).toBe(true);
    expect(typeof output.plan_id).toBe('string');
    expect(output.plan_id!.length).toBeGreaterThan(0);

    const dag = output.task_dag as Record<string, unknown>;
    expect(dag).toBeDefined();
    expect(dag.nodes).toBeDefined();
    const nodes = dag.nodes as Record<string, unknown>[];
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    expect(nodes[0].task_id).toBeDefined();
    expect(nodes[0].task_content).toBe('Another short task');
  });

  it('TC-PA-004: LLM returns invalid DAG (with cycle) falls back to heuristic DAG', async () => {
    // Override mock to return cyclic JSON for both attempts
    const cyclicJson = '{"nodes":[{"task_id":"a","task_content":"Design DB","task_domain":"db","priority":1,"dependencies":["b"]},{"task_id":"b","task_content":"Implement API","task_domain":"backend","priority":2,"dependencies":["a"]}],"edges":[]}';
    mockLlmService.chatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: { content: cyclicJson } }],
      usage: { totalTokens: 100 },
    });
    service = createPlannerAgentService(db, mockLlmService as any);

    const input = new PlanInput({ work_id: 'w4', interact_id: 'i4', task_content: 'A'.repeat(300) });
    const context = new PlanContext();
    const output = new PlanOutput();

    const result = await service.plan(input, context, output);
    expect(result).toBe(true);
    expect(output.plan_id).toBeDefined();

    const dag = output.task_dag as Record<string, unknown>;
    expect(dag).toBeDefined();
    const nodes = dag.nodes as Record<string, unknown>[];
    // Heuristic DAG creates nodes with "Sub-task" prefix
    expect(nodes.length).toBeGreaterThan(1);
    expect(String(nodes[0].task_content)).toContain('Sub-task');

    // LLM should have been called twice (2 attempts)
    expect(mockLlmService.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('TC-PA-005: without LLM service falls back to heuristic DAG', async () => {
    const serviceNoLLM = createPlannerAgentService(db);

    const input = new PlanInput({ work_id: 'w5', interact_id: 'i5', task_content: 'A'.repeat(250) });
    const context = new PlanContext();
    const output = new PlanOutput();

    const result = await serviceNoLLM.plan(input, context, output);
    expect(result).toBe(true);
    expect(output.plan_id).toBeDefined();

    const dag = output.task_dag as Record<string, unknown>;
    expect(dag).toBeDefined();
    const nodes = dag.nodes as Record<string, unknown>[];
    expect(nodes.length).toBeGreaterThan(1);
    expect(String(nodes[0].task_content)).toContain('Sub-task');
  });

  it('TC-PA-006: plan result persists in DB and can be directly queried', async () => {
    const input = new PlanInput({ work_id: 'w6', interact_id: 'i6', task_content: 'Persist test task' });
    const context = new PlanContext();
    const output = new PlanOutput();

    const result = await service.plan(input, context, output);
    expect(result).toBe(true);

    const row = db.prepare('SELECT * FROM agent_plan WHERE plan_id = ?').get(output.plan_id) as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row!.plan_id).toBe(output.plan_id);
    expect(row!.work_id).toBe('w6');
    expect(row!.interact_id).toBe('i6');

    const storedDag = JSON.parse(row!.task_dag as string);
    expect(storedDag.nodes).toBeDefined();
    expect(storedDag.nodes.length).toBe(1);
  });

  it('TC-PA-007: content at complexity threshold border (200 chars → complexity=50) triggers decomposition', async () => {
    // 200 chars gives complexity = 50, which is NOT < 50, so it triggers LLM/heuristic
    const borderlineContent = 'A'.repeat(200);
    const input = new PlanInput({ work_id: 'w7', interact_id: 'i7', task_content: borderlineContent });
    const context = new PlanContext();
    const output = new PlanOutput();

    const result = await service.plan(input, context, output);
    expect(result).toBe(true);

    // Since complexity >= 50, LLM should be invoked
    expect(mockLlmService.chatCompletion).toHaveBeenCalled();
  });

  it('TC-PA-008: LLM returns JSON without edges but with valid dependencies — still valid DAG', async () => {
    const noEdgesJson = '{"nodes":[{"task_id":"x1","task_content":"Setup project","task_domain":"setup","priority":1,"dependencies":[]},{"task_id":"x2","task_content":"Write tests","task_domain":"testing","priority":2,"dependencies":["x1"]}],"edges":[]}';
    mockLlmService.chatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: { content: noEdgesJson } }],
      usage: { totalTokens: 100 },
    });
    service = createPlannerAgentService(db, mockLlmService as any);

    const input = new PlanInput({ work_id: 'w8', interact_id: 'i8', task_content: 'A'.repeat(250) });
    const context = new PlanContext();
    const output = new PlanOutput();

    const result = await service.plan(input, context, output);
    expect(result).toBe(true);

    const dag = output.task_dag as Record<string, unknown>;
    expect((dag.nodes as unknown[]).length).toBe(2);
  });

  it('TC-PA-009: LLM throws error falls back to heuristic DAG', async () => {
    mockLlmService.chatCompletion = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
    service = createPlannerAgentService(db, mockLlmService as any);

    const input = new PlanInput({ work_id: 'w9', interact_id: 'i9', task_content: 'A'.repeat(250) });
    const context = new PlanContext();
    const output = new PlanOutput();

    const result = await service.plan(input, context, output);
    expect(result).toBe(true);
    expect(output.plan_id).toBeDefined();

    const dag = output.task_dag as Record<string, unknown>;
    expect((dag.nodes as unknown[]).length).toBeGreaterThan(1);
    // Heuristic fallback: sub-task names
    expect(String((dag.nodes as Record<string, unknown>[])[0].task_content)).toContain('Sub-task');
  });

  it('TC-PA-010: multiple distinct work_ids save separate plans', async () => {
    const input1 = new PlanInput({ work_id: 'work_a', interact_id: 'ia', task_content: 'Task for work A' });
    const output1 = new PlanOutput();
    await service.plan(input1, new PlanContext(), output1);

    const input2 = new PlanInput({ work_id: 'work_b', interact_id: 'ib', task_content: 'Task for work B' });
    const output2 = new PlanOutput();
    await service.plan(input2, new PlanContext(), output2);

    const rowsA = db.prepare('SELECT * FROM agent_plan WHERE work_id = ?').all('work_a') as Record<string, unknown>[];
    const rowsB = db.prepare('SELECT * FROM agent_plan WHERE work_id = ?').all('work_b') as Record<string, unknown>[];
    expect(rowsA.length).toBe(1);
    expect(rowsB.length).toBe(1);
    expect(rowsA[0].plan_id).toBe(output1.plan_id);
    expect(rowsB[0].plan_id).toBe(output2.plan_id);
    expect(output2.plan_id).not.toBe(output1.plan_id);
  });
});

describe('replan', () => {
  it('TC-PA-011: create a plan then replan with a failed task succeeds', async () => {
    const longContent = 'A'.repeat(250);
    const planInput = new PlanInput({ work_id: 'rw1', interact_id: 'ri1', task_content: longContent });
    const planOutput = new PlanOutput();
    await service.plan(planInput, new PlanContext(), planOutput);

    const originalPlanId = planOutput.plan_id!;
    const originalDag = planOutput.task_dag as Record<string, unknown>;
    const originalNodes = originalDag.nodes as Record<string, unknown>[];
    const failedTaskId = originalNodes[0].task_id as string;

    const replanInput = new ReplanInput({
      plan_id: originalPlanId,
      failed_task_id: failedTaskId,
      failure_reason: 'Test failure',
      completed_task_ids: [],
    });
    const replanContext = new ReplanContext();
    const replanOutput = new ReplanOutput();

    const result = service.replan(replanInput, replanContext, replanOutput);
    expect(result).toBe(true);
    expect(replanOutput.new_plan_id).toBeDefined();
    expect(replanOutput.new_plan_id).toBeTruthy();
    expect(replanOutput.task_dag).toBeDefined();
  });

  it('TC-PA-012: replan with non-existent plan_id returns false', () => {
    const input = new ReplanInput({
      plan_id: 'nonexistent-plan-id',
      failed_task_id: 'task-1',
      failure_reason: 'Not found',
      completed_task_ids: [],
    });
    const context = new ReplanContext();
    const output = new ReplanOutput();

    const result = service.replan(input, context, output);
    expect(result).toBe(false);
    expect(output.new_plan_id).toBeUndefined();
  });

  it('TC-PA-013: new_plan_id differs from original plan', async () => {
    const longContent = 'A'.repeat(250);
    const planInput = new PlanInput({ work_id: 'rw2', interact_id: 'ri2', task_content: longContent });
    const planOutput = new PlanOutput();
    await service.plan(planInput, new PlanContext(), planOutput);

    const originalPlanId = planOutput.plan_id!;
    const originalDag = planOutput.task_dag as Record<string, unknown>;
    const originalNodes = originalDag.nodes as Record<string, unknown>[];
    const failedTaskId = originalNodes[0].task_id as string;

    const replanInput = new ReplanInput({
      plan_id: originalPlanId,
      failed_task_id: failedTaskId,
      failure_reason: 'Failure',
      completed_task_ids: [],
    });
    const replanOutput = new ReplanOutput();
    service.replan(replanInput, new ReplanContext(), replanOutput);

    expect(replanOutput.new_plan_id).toBeDefined();
    expect(replanOutput.new_plan_id).not.toBe(originalPlanId);
  });

  it('TC-PA-014: parent_plan_id links to original plan', async () => {
    const longContent = 'A'.repeat(250);
    const planInput = new PlanInput({ work_id: 'rw3', interact_id: 'ri3', task_content: longContent });
    const planOutput = new PlanOutput();
    await service.plan(planInput, new PlanContext(), planOutput);

    const originalPlanId = planOutput.plan_id!;
    const originalDag = planOutput.task_dag as Record<string, unknown>;
    const originalNodes = originalDag.nodes as Record<string, unknown>[];
    const failedTaskId = originalNodes[0].task_id as string;

    const replanInput = new ReplanInput({
      plan_id: originalPlanId,
      failed_task_id: failedTaskId,
      failure_reason: 'Failure',
      completed_task_ids: [],
    });
    const replanContext = new ReplanContext();
    const replanOutput = new ReplanOutput();
    service.replan(replanInput, replanContext, replanOutput);

    const newPlanRow = db.prepare('SELECT * FROM agent_plan WHERE plan_id = ?').get(replanOutput.new_plan_id) as Record<string, unknown>;
    expect(newPlanRow).toBeDefined();
    expect(newPlanRow.parent_plan_id).toBe(originalPlanId);
  });
});

describe('getPlan', () => {
  it('TC-PA-015: query by plan_id returns one plan', async () => {
    const input = new PlanInput({ work_id: 'gw1', interact_id: 'gi1', task_content: 'GetPlan test task' });
    const planOutput = new PlanOutput();
    await service.plan(input, new PlanContext(), planOutput);

    const getInput = new GetPlanInput({ plan_id: planOutput.plan_id });
    const getOutput = new GetPlanOutput();

    const result = service.getPlan(getInput, new GetPlanContext(), getOutput);
    expect(result).toBe(true);
    expect(getOutput.plans).toBeDefined();
    expect(getOutput.plans!.length).toBe(1);
    expect((getOutput.plans![0] as Record<string, unknown>).plan_id).toBe(planOutput.plan_id);
  });

  it('TC-PA-016: query by work_id returns all plans for that work', async () => {
    const workId = 'gw2';
    const input1 = new PlanInput({ work_id: workId, interact_id: 'gi2a', task_content: 'First task for work' });
    const output1 = new PlanOutput();
    await service.plan(input1, new PlanContext(), output1);

    const input2 = new PlanInput({ work_id: workId, interact_id: 'gi2b', task_content: 'Second task for work' });
    const output2 = new PlanOutput();
    await service.plan(input2, new PlanContext(), output2);

    const getInput = new GetPlanInput({ work_id: workId });
    const getOutput = new GetPlanOutput();
    const result = service.getPlan(getInput, new GetPlanContext(), getOutput);

    expect(result).toBe(true);
    expect(getOutput.plans).toBeDefined();
    expect(getOutput.plans!.length).toBe(2);
  });

  it('TC-PA-017: non-existent plan_id returns false', () => {
    const getInput = new GetPlanInput({ plan_id: 'nonexistent-plan' });
    const getOutput = new GetPlanOutput();

    const result = service.getPlan(getInput, new GetPlanContext(), getOutput);
    expect(result).toBe(false);
    expect(getOutput.plans).toBeUndefined();
  });

  it('TC-PA-018: getPlan without plan_id or work_id returns empty plans', () => {
    const getInput = new GetPlanInput({});
    const getOutput = new GetPlanOutput();

    const result = service.getPlan(getInput, new GetPlanContext(), getOutput);
    expect(result).toBe(true);
    expect(getOutput.plans).toBeDefined();
    expect(getOutput.plans!.length).toBe(0);
  });
});

describe('configPlannerAgent', () => {
  it('TC-PA-019: initial config returns complexity_decompose_threshold=50, plan_prompt_template_id=\'\', max_subtask_count=10', () => {
    const input = new ConfigPlannerAgentInput({});
    const context = new ConfigPlannerAgentContext();
    const output = new ConfigPlannerAgentOutput();

    const result = service.configPlannerAgent(input, context, output);
    expect(result).toBe(true);
    expect(output.complexity_decompose_threshold).toBe(50);
    expect(output.plan_prompt_template_id).toBe('');
    expect(output.max_subtask_count).toBe(10);
  });

  it('TC-PA-020: update complexity_decompose_threshold and max_subtask_count works', () => {
    const input = new ConfigPlannerAgentInput({
      complexity_decompose_threshold: 80,
      max_subtask_count: 20,
    });
    const context = new ConfigPlannerAgentContext();
    const output = new ConfigPlannerAgentOutput();

    const result = service.configPlannerAgent(input, context, output);
    expect(result).toBe(true);
    expect(output.complexity_decompose_threshold).toBe(80);
    expect(output.max_subtask_count).toBe(20);
    // plan_prompt_template_id should remain unchanged
    expect(output.plan_prompt_template_id).toBe('');
  });

  it('TC-PA-021: update only plan_prompt_template_id leaves other config at defaults', () => {
    // First set custom values
    const preInput = new ConfigPlannerAgentInput({
      complexity_decompose_threshold: 80,
      max_subtask_count: 20,
    });
    const preOutput = new ConfigPlannerAgentOutput();
    service.configPlannerAgent(preInput, new ConfigPlannerAgentContext(), preOutput);

    // Now update only plan_prompt_template_id
    const input = new ConfigPlannerAgentInput({
      plan_prompt_template_id: 'prompt-v2',
    });
    const context = new ConfigPlannerAgentContext();
    const output = new ConfigPlannerAgentOutput();

    const result = service.configPlannerAgent(input, context, output);
    expect(result).toBe(true);
    expect(output.plan_prompt_template_id).toBe('prompt-v2');
    expect(output.complexity_decompose_threshold).toBe(80);
    expect(output.max_subtask_count).toBe(20);
  });
});
