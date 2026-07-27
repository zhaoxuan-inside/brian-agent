import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import {
  AGENT_PLAN_TABLE, PLANNER_AGENT_CONFIG_TABLE,
  type PlannerAgentConfigRecord, type AgentPlanRecord,
  PlanInput, PlanOutput,
  ReplanInput, ReplanOutput,
  GetPlanInput, GetPlanOutput,
  ConfigPlannerAgentInput, ConfigPlannerAgentOutput,
} from '../domain/types';
import { BuildPlannerAgentInput, BuildPlannerAgentOutput } from '../../AgentBuilder/domain/types';
import { GetAgentInput, GetAgentOutput } from '../../AgentLibrary/domain/types';

export class PlannerAgentService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
  ) {}

  async plan(input: PlanInput, _ctx: unknown, output: PlanOutput): Promise<boolean> {
    const buildOut = new BuildPlannerAgentOutput();
    await this.agentBuilder.buildPlannerAgent(new BuildPlannerAgentInput(), {}, buildOut);
    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }), {}, getOut);

    const config = this.getConfig();
    const threshold = config?.complexity_decompose_threshold ?? 50;
    const complexity = this.estimateComplexity(input.task_content);

    if (complexity < threshold) {
      const dag = {
        nodes: [{ task_id: IdGenerator.uuid(), task_content: input.task_content, task_complexity: complexity, task_domain: '', priority: 1, dependencies: [] as string[] }],
        edges: [] as Array<{ from_task_id: string; to_task_id: string }>,
      };
      const planId = IdGenerator.uuid();
      const now = Math.floor(Date.now() / 1000);
      this.relationDb.executeRaw(
        `INSERT INTO ${AGENT_PLAN_TABLE} (id, created, updated, plan_id, work_id, interact_id, task_dag, parent_plan_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [IdGenerator.uuid(), now, now, planId, input.work_id, input.interact_id, JSON.stringify(dag), ''],
      );
      output.plan_id = planId;
      output.task_dag = dag;
      return true;
    }

    const maxSubtasks = config?.max_subtask_count ?? 10;
    const nodeCount = Math.min(maxSubtasks, Math.max(1, Math.floor(complexity / 20) + 1));
    const nodes: PlanOutput['task_dag']['nodes'] = [];
    const edges: PlanOutput['task_dag']['edges'] = [];

    for (let i = 0; i < nodeCount; i++) {
      const taskId = IdGenerator.uuid();
      nodes.push({ task_id: taskId, task_content: `Subtask ${i + 1}: ${input.task_content.slice(0, 100)}`, task_complexity: Math.floor(complexity / nodeCount), task_domain: '', priority: i + 1, dependencies: i > 0 ? [nodes[i - 1].task_id] : [] });
      if (i > 0) edges.push({ from_task_id: nodes[i - 1].task_id, to_task_id: taskId });
    }

    const dag = { nodes, edges };
    const planId = IdGenerator.uuid();
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_PLAN_TABLE} (id, created, updated, plan_id, work_id, interact_id, task_dag, parent_plan_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [IdGenerator.uuid(), now, now, planId, input.work_id, input.interact_id, JSON.stringify(dag), ''],
    );

    output.plan_id = planId;
    output.task_dag = dag;
    return true;
  }

  async replan(input: ReplanInput, _ctx: unknown, output: ReplanOutput): Promise<boolean> {
    const rows = this.relationDb.queryRaw<AgentPlanRecord>(
      `SELECT * FROM ${AGENT_PLAN_TABLE} WHERE plan_id = ?`, [input.plan_id],
    );
    if (rows.length === 0) { output.error = 'Plan not found'; return false; }
    const oldDag = JSON.parse(rows[0].task_dag);

    const completedSet = new Set(input.completed_task_ids);
    const remainingNodes = oldDag.nodes.filter((n: { task_id: string }) => !completedSet.has(n.task_id));

    const newDag = { nodes: remainingNodes, edges: oldDag.edges.filter((e: { from_task_id: string; to_task_id: string }) => !completedSet.has(e.from_task_id) && !completedSet.has(e.to_task_id)) };
    const newPlanId = IdGenerator.uuid();
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_PLAN_TABLE} (id, created, updated, plan_id, work_id, interact_id, task_dag, parent_plan_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [IdGenerator.uuid(), now, now, newPlanId, rows[0].work_id, rows[0].interact_id, JSON.stringify(newDag), input.plan_id],
    );
    output.new_plan_id = newPlanId;
    output.task_dag = newDag;
    return true;
  }

  async getPlan(input: GetPlanInput, _ctx: unknown, output: GetPlanOutput): Promise<boolean> {
    if (input.plan_id) {
      const rows = this.relationDb.queryRaw<AgentPlanRecord>(
        `SELECT * FROM ${AGENT_PLAN_TABLE} WHERE plan_id = ?`, [input.plan_id],
      );
      output.plans = rows;
    } else if (input.work_id) {
      output.plans = this.relationDb.queryRaw<AgentPlanRecord>(
        `SELECT * FROM ${AGENT_PLAN_TABLE} WHERE work_id = ?`, [input.work_id],
      );
    }
    return true;
  }

  async configPlannerAgent(input: ConfigPlannerAgentInput, _ctx: unknown, output: ConfigPlannerAgentOutput): Promise<boolean> {
    let config = this.getConfig();
    if (!config) {
      const now = Math.floor(Date.now() / 1000);
      this.relationDb.executeRaw(
        `INSERT INTO ${PLANNER_AGENT_CONFIG_TABLE} (id, created, updated, complexity_decompose_threshold, plan_prompt_template_id, max_subtask_count) VALUES (?, ?, ?, 50, ?, 10)`,
        [IdGenerator.uuid(), now, now, ''],
      );
      config = this.getConfig();
    }
    if (!config) { output.error = 'config init failed'; return false; }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.complexity_decompose_threshold !== undefined) { sets.push('complexity_decompose_threshold = ?'); vals.push(input.complexity_decompose_threshold); }
    if (input.plan_prompt_template_id !== undefined) { sets.push('plan_prompt_template_id = ?'); vals.push(input.plan_prompt_template_id); }
    if (input.max_subtask_count !== undefined) { sets.push('max_subtask_count = ?'); vals.push(input.max_subtask_count); }
    if (sets.length > 0) {
      sets.push('updated = ?'); vals.push(Math.floor(Date.now() / 1000)); vals.push(config.id);
      this.relationDb.executeRaw(`UPDATE ${PLANNER_AGENT_CONFIG_TABLE} SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    output.config = this.getConfig();
    return true;
  }

  private getConfig(): PlannerAgentConfigRecord | null {
    const rows = this.relationDb.queryRaw<PlannerAgentConfigRecord>(
      `SELECT * FROM ${PLANNER_AGENT_CONFIG_TABLE} LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  private estimateComplexity(task: string): number {
    const len = task.length;
    if (len < 50) return 20;
    if (len < 200) return 45;
    return 70;
  }
}
