import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError, NotFoundError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
  type DataObject,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  SaveInfoInput, SaveInfoOutput, ContextInfoInput, ContextInfoOutput, InfoCoreContext,
} from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import {
  AGENT_PLAN_TABLE, PLANNER_AGENT_CONFIG_TABLE,
  type PlannerAgentConfigRecord, type AgentPlanRecord,
  PlannerAgentContext,
  PlanInput, PlanOutput,
  ReplanInput, ReplanOutput,
  GetPlanInput, GetPlanOutput,
  ConfigPlannerAgentInput, ConfigPlannerAgentOutput,
} from '../domain/types';
import {
  BuildPlannerAgentInput, BuildPlannerAgentOutput, AgentBuilderContext,
} from '../../AgentBuilder/domain/types';
import {
  GetAgentInput, GetAgentOutput, AgentLibraryContext,
} from '../../AgentLibrary/domain/types';
import { parseJsonObject } from '../../shared/signature';

type TaskDag = PlanOutput['task_dag'];

function mapPlan(row: Record<string, unknown>): AgentPlanRecord {
  return {
    id: String(row.id),
    created: Number(row.created),
    updated: Number(row.updated),
    plan_id: String(row.plan_id),
    work_id: String(row.work_id),
    interact_id: String(row.interact_id),
    task_dag: String(row.task_dag),
    parent_plan_id: String(row.parent_plan_id ?? ''),
  };
}

export class PlannerAgentService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
  ) {}

  async plan(input: PlanInput, ctx: PlannerAgentContext, output: PlanOutput): Promise<boolean> {
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: ctx.session_id,
      work_id: input.work_id || ctx.work_id,
      interact_id: input.interact_id || ctx.interact_id,
    });
    const buildOut = new BuildPlannerAgentOutput();
    await this.agentBuilder.buildPlannerAgent(new BuildPlannerAgentInput(), builderCtx, buildOut);
    if (!buildOut.agent_id) throw new ValidationError('buildPlannerAgent failed');

    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      Object.assign(new AgentLibraryContext(), builderCtx),
      getOut,
    );
    const agent = getOut.agents[0];
    if (!agent) throw new NotFoundError('PlannerAgent', buildOut.agent_id);

    const config = await this.getConfig();
    const threshold = config?.complexity_decompose_threshold ?? 50;
    const maxSub = config?.max_subtask_count ?? 10;

    let contextExtra = '';
    if (ctx.session_id) {
      try {
        const ctxOut = new ContextInfoOutput();
        await this.infoCore.context(
          Object.assign(new ContextInfoInput(), { session_id: ctx.session_id }),
          new InfoCoreContext(),
          ctxOut,
        );
        contextExtra = (ctxOut.list ?? []).map((i) => String((i as { info?: string }).info ?? '')).join('\n');
      } catch { /* best-effort */ }
    }

    let dag: TaskDag | null = null;
    if (agent.llm_id && config?.plan_prompt_template_id) {
      dag = await this.llmPlan(agent.llm_id, agent.soul_id, config.plan_prompt_template_id, input.task_content, contextExtra, maxSub);
    }
    if (!dag) {
      const complexity = this.estimateComplexity(input.task_content);
      if (complexity < threshold) {
        dag = this.singleNodeDag(input.task_content, complexity);
      } else {
        // 无 LLM 时保守单节点，避免假拆分
        dag = this.singleNodeDag(input.task_content, complexity);
      }
    }

    this.validateDag(dag, maxSub);
    const planId = IdGenerator.generate();
    await this.insertPlan(planId, input.work_id, input.interact_id, dag, '');
    await this.savePlanInfo(ctx, input.work_id, input.interact_id, planId, dag);

    output.plan_id = planId;
    output.task_dag = dag;
    return true;
  }

  async replan(input: ReplanInput, ctx: PlannerAgentContext, output: ReplanOutput): Promise<boolean> {
    const row = await this.relationDb.selectOne(AGENT_PLAN_TABLE, [
      { field: 'plan_id', operator: Operator.EQ, value: input.plan_id },
    ]);
    if (!row) throw new NotFoundError('Plan', input.plan_id);
    const old = mapPlan(row);
    const oldDag = JSON.parse(old.task_dag) as TaskDag;
    const completed = new Set(input.completed_task_ids ?? []);

    let remainingNodes = oldDag.nodes.filter((n) => !completed.has(n.task_id));
    // 失败任务重写内容
    remainingNodes = remainingNodes.map((n) => {
      if (n.task_id === input.failed_task_id) {
        return {
          ...n,
          task_content: `${n.task_content}\n[RETRY after failure: ${input.failure_reason}]`,
        };
      }
      return n;
    });
    const remainingIds = new Set(remainingNodes.map((n) => n.task_id));
    const edges = oldDag.edges.filter(
      (e) => remainingIds.has(e.from_task_id) && remainingIds.has(e.to_task_id),
    );
    const newDag: TaskDag = { nodes: remainingNodes, edges };
    this.validateDag(newDag, 100);

    const newPlanId = IdGenerator.generate();
    await this.insertPlan(newPlanId, old.work_id, old.interact_id, newDag, input.plan_id);
    await this.savePlanInfo(ctx, old.work_id, old.interact_id, newPlanId, newDag);

    output.new_plan_id = newPlanId;
    output.task_dag = newDag;
    return true;
  }

  async getPlan(input: GetPlanInput, _ctx: PlannerAgentContext, output: GetPlanOutput): Promise<boolean> {
    if (input.plan_id) {
      const row = await this.relationDb.selectOne(AGENT_PLAN_TABLE, [
        { field: 'plan_id', operator: Operator.EQ, value: input.plan_id },
      ]);
      output.plans = row ? [mapPlan(row)] : [];
      return true;
    }
    if (input.work_id) {
      const rows = await this.relationDb.select(AGENT_PLAN_TABLE, {
        conditions: [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }],
      });
      output.plans = rows.map(mapPlan);
      return true;
    }
    output.plans = [];
    return true;
  }

  async configPlannerAgent(
    input: ConfigPlannerAgentInput,
    _ctx: PlannerAgentContext,
    output: ConfigPlannerAgentOutput,
  ): Promise<boolean> {
    let config = await this.getConfig();
    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(PLANNER_AGENT_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'complexity_decompose_threshold', value: 50 },
        { field: 'plan_prompt_template_id', value: '' },
        { field: 'max_subtask_count', value: 10 },
      ]);
      config = await this.getConfig();
    }
    if (!config) throw new ValidationError('config init failed');

    const data: DataObject[] = [];
    if (input.complexity_decompose_threshold !== undefined) {
      if (input.complexity_decompose_threshold < 0 || input.complexity_decompose_threshold > 100) {
        throw new ValidationError('complexity_decompose_threshold 必须在 0-100');
      }
      data.push({ field: 'complexity_decompose_threshold', value: input.complexity_decompose_threshold });
    }
    if (input.plan_prompt_template_id !== undefined) {
      if (input.plan_prompt_template_id) await this.assertPrompt(input.plan_prompt_template_id);
      data.push({ field: 'plan_prompt_template_id', value: input.plan_prompt_template_id });
    }
    if (input.max_subtask_count !== undefined) {
      if (!Number.isInteger(input.max_subtask_count) || input.max_subtask_count <= 0) {
        throw new ValidationError('max_subtask_count 必须为正整数');
      }
      data.push({ field: 'max_subtask_count', value: input.max_subtask_count });
    }
    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(
        PLANNER_AGENT_CONFIG_TABLE,
        data,
        [{ field: 'id', operator: Operator.EQ, value: config.id }],
      );
    }
    output.config = await this.getConfig();
    return true;
  }

  private async llmPlan(
    llmId: string,
    soulId: string,
    promptId: string,
    task: string,
    contextExtra: string,
    maxSub: number,
  ): Promise<TaskDag | null> {
    try {
      const system = '';
      // soul optional - get via raw if needed skipped
      const promptOut = new ExecPromptOutput();
      await this.promptsAccess.execPrompt(
        Object.assign(new ExecPromptInput(), {
          id: promptId,
          variables: { task_content: task, context: contextExtra, max_subtask_count: maxSub, soul_id: soulId },
        }),
        new PromptContext(),
        promptOut,
      );
      if (!promptOut.prompt) return null;

      const llmOut = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: llmId,
          prompt: promptOut.prompt,
          params: system ? { system } : undefined,
        }),
        new LLMContext(),
        llmOut,
      );
      const parsed = parseJsonObject(llmOut.result);
      if (!parsed) return null;
      const nodes = (parsed.nodes as TaskDag['nodes']) ?? [];
      const edges = (parsed.edges as TaskDag['edges']) ?? [];
      if (!Array.isArray(nodes) || nodes.length === 0) return null;
      // 补全 task_id
      for (const n of nodes) {
        if (!n.task_id) n.task_id = IdGenerator.generate();
        if (!n.dependencies) n.dependencies = [];
      }
      return { nodes, edges };
    } catch {
      return null;
    }
  }

  private singleNodeDag(task: string, complexity: number): TaskDag {
    const taskId = IdGenerator.generate();
    return {
      nodes: [{
        task_id: taskId,
        task_content: task,
        task_complexity: complexity,
        task_domain: '',
        priority: 1,
        dependencies: [],
      }],
      edges: [],
    };
  }

  private validateDag(dag: TaskDag, maxSub: number): void {
    if (!dag.nodes?.length) throw new ValidationError('task_dag.nodes 不能为空');
    if (dag.nodes.length > maxSub) throw new ValidationError(`子任务数超过 max_subtask_count=${maxSub}`);
    const ids = dag.nodes.map((n) => n.task_id);
    if (new Set(ids).size !== ids.length) throw new ValidationError('task_id 必须唯一');
    const idSet = new Set(ids);
    for (const e of dag.edges ?? []) {
      if (!idSet.has(e.from_task_id) || !idSet.has(e.to_task_id)) {
        throw new ValidationError('edge 引用了不存在的 task_id');
      }
    }
    // 简单环检测
    const adj = new Map<string, string[]>();
    for (const id of ids) adj.set(id, []);
    for (const e of dag.edges ?? []) adj.get(e.from_task_id)!.push(e.to_task_id);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const dfs = (u: string): boolean => {
      if (visiting.has(u)) return true;
      if (visited.has(u)) return false;
      visiting.add(u);
      for (const v of adj.get(u) ?? []) {
        if (dfs(v)) return true;
      }
      visiting.delete(u);
      visited.add(u);
      return false;
    };
    for (const id of ids) {
      if (dfs(id)) throw new ValidationError('task_dag 存在环');
    }
  }

  private async insertPlan(
    planId: string,
    workId: string,
    interactId: string,
    dag: TaskDag,
    parentPlanId: string,
  ): Promise<void> {
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_PLAN_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'plan_id', value: planId },
      { field: 'work_id', value: workId },
      { field: 'interact_id', value: interactId },
      { field: 'task_dag', value: JSON.stringify({ ...dag, total_task_count: dag.nodes.length }) },
      { field: 'parent_plan_id', value: parentPlanId },
    ]);
  }

  private async savePlanInfo(
    ctx: PlannerAgentContext,
    workId: string,
    interactId: string,
    planId: string,
    dag: TaskDag,
  ): Promise<void> {
    if (!ctx.session_id) return;
    try {
      await this.infoCore.saveInfo(
        Object.assign(new SaveInfoInput(), {
          session_id: ctx.session_id,
          work_id: workId,
          interact_id: interactId,
          info_creator_id: planId,
          info_creator_role: 'AGENT',
          info: JSON.stringify(dag),
        }),
        new InfoCoreContext(),
        new SaveInfoOutput(),
      );
    } catch { /* best-effort */ }
  }

  private async assertPrompt(id: string): Promise<void> {
    const out = new SoPromptOutput();
    await this.promptsAccess.soPrompt(
      Object.assign(new SoPromptInput(), {
        conditions: [{ field: 'id', operator: Operator.EQ, value: id }],
      }),
      new PromptContext(),
      out,
    );
    if (!out.list?.length) throw new ValidationError(`prompt_template_id 不存在: ${id}`);
  }

  private async getConfig(): Promise<PlannerAgentConfigRecord | null> {
    const row = await this.relationDb.selectOne(PLANNER_AGENT_CONFIG_TABLE, []);
    if (!row) return null;
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      complexity_decompose_threshold: Number(row.complexity_decompose_threshold ?? 50),
      plan_prompt_template_id: String(row.plan_prompt_template_id ?? ''),
      max_subtask_count: Number(row.max_subtask_count ?? 10),
    };
  }

  private estimateComplexity(task: string): number {
    const len = task.length;
    if (len < 50) return 20;
    if (len < 200) return 45;
    return 70;
  }
}
