import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator, Operator, ValidationError, NotFoundError, ExecLLMInput, ExecLLMOutput, LLMContext, InfoType, type DataObject } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import { SaveInfoInput, SaveInfoOutput, ContextInfoInput, ContextInfoOutput, InfoCoreContext } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import {
  AGENT_PLAN_TABLE, PLANNER_AGENT_CONFIG_TABLE,
  type PlannerAgentConfigRecord, type AgentPlanRecord,
  PlannerAgentContext,
  PlanInput, PlanOutput,
  PlanHierarchicalInput, PlanHierarchicalOutput,
  ReplanInput, ReplanOutput,
  GetPlanInput, GetPlanOutput,
  ConfigPlannerAgentInput, ConfigPlannerAgentOutput,
  type PlanTaskNode, type PlanTaskEdge, type PlanTaskDAG, type PlanClarification,
} from '../domain/types';
import {
  BuildSystemAgentInput, BuildSystemAgentOutput, AgentBuilderContext,
} from '../../AgentBuilder/domain/types';
import {
  GetAgentInput, GetAgentOutput, AgentLibraryContext,
} from '../../AgentLibrary/domain/types';
import { parseJsonObject } from '../../shared/signature';
import { formatContextCategories } from '@brian-agent/base';
import { assertPromptExists, renderPromptWithFallback, resolveAgentLlm } from '../../shared/AgentKit';

type TaskDag = PlanTaskDAG;

/** 递归拆解最大深度（在 LLM 单次层级拆解基础上额外递归，防止无限拆解） */
const MAX_DECOMPOSE_DEPTH = 2;

/** 单次拆解的完整上下文（LLM 绑定、阈值、上限等），供 plan / planHierarchical 复用 */
interface PlanDecomposeContext {
  dag: TaskDag;
  clarifications: PlanClarification[];
  threshold: number;
  maxSub: number;
  llmId: string;
  soulId: string;
  promptId: string;
  contextExtra: string;
}

function mapPlan(row: Record<string, unknown>): AgentPlanRecord {
  return {
    id: String(row.id),
    created: Number(row.created),
    updated: Number(row.updated),
    plan_id: String(row.plan_id),
    work_id: String(row.work_id),
    run_id: String(row.run_id),
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
    private readonly llmCore?: LLMCoreAccess,
  ) {}

  async execPlan(input: PlanInput, output: PlanOutput, ctx: PlannerAgentContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    const planCtx = await this.decomposeOnce(input, ctx);
    output.plan_id = await this.persistPlan(planCtx.dag, input.work_id, input.run_id, ctx, '');
    output.task_dag = planCtx.dag;
    output.clarifications = planCtx.clarifications;
    return true;
  }

  /**
   * 层级规划：LLM 单次产出层级 DAG 后，对仍复杂（complexity >= threshold）的叶子任务
   * 递归调用 LLM 继续拆解，直到所有叶子任务为「小任务」或达到最大深度。
   */
  async planHierarchical(input: PlanHierarchicalInput, output: PlanHierarchicalOutput, ctx: PlannerAgentContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const planCtx = await this.decomposeOnce(input, ctx);
    const maxDepth = input.max_depth ?? MAX_DECOMPOSE_DEPTH;
    // ===== 修改：全局粒度控制 =====
    // 原始实现：expandComplexLeaves 后仅 validateDag(dag, maxSub * 4)，且 decomposeLeaf 的
    //   depth 只递减从不校验，导致层级拆解无限递归、子任务爆炸与大量重复任务。
    // 修改后：1) 初始拆解已达 max_subtask_count 上限时不再递归展开；
    //         2) 展开后按语义相似度去重；3) 超上限时硬性收敛到 maxSub；4) 按 maxSub 校验。
    let dag = planCtx.dag;
    if (dag.nodes.length < planCtx.maxSub) {
      dag = await this.expandComplexLeaves(dag, planCtx, maxDepth);
    }
    dag = this.dedupeDag(dag);
    if (dag.nodes.length > planCtx.maxSub) {
      dag = this.limitDagSize(dag, planCtx.maxSub);
    }
    this.validateDag(dag, planCtx.maxSub);
    output.plan_id = await this.persistPlan(dag, input.work_id, input.run_id, ctx, '');
    output.task_dag = dag;
    output.clarifications = planCtx.clarifications;
    return true;
  }

  /** 解析 PlannerAgent、配置、上下文与 LLM 绑定，并执行一次拆解。 */
  private async decomposeOnce(input: PlanInput, ctx: PlannerAgentContext): Promise<PlanDecomposeContext> {
    const agent = await this.resolvePlannerAgent(ctx, input);
    const config = await this.getConfig();
    const threshold = config?.complexity_decompose_threshold ?? 50;
    const maxSub = config?.max_subtask_count ?? 10;
    const contextExtra = await this.buildPlanContext(ctx, input);
    const llmId = await this.resolvePlanLlmId(agent, config);
    const params = { llmId, soulId: agent?.soul_id || '', promptId: config?.plan_prompt_template_id || '', maxSub, threshold };
    const { dag, clarifications } = await this.decomposeTask(input.task_content, contextExtra, params);
    return { dag, clarifications, threshold, maxSub, llmId: params.llmId, soulId: params.soulId, promptId: params.promptId, contextExtra };
  }

  /** 构建 PlannerAgent（存在则复用）并返回其完整配置。 */
  private async resolvePlannerAgent(ctx: PlannerAgentContext, input: PlanInput) {
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: ctx.session_id,
      work_id: input.work_id || ctx.work_id,
      run_id: input.run_id || ctx.run_id,
    });
    const buildOut = new BuildSystemAgentOutput();
    await this.agentBuilder.buildSystemAgent(Object.assign(new BuildSystemAgentInput(), { agent_type: 'PLANNER' }), buildOut, builderCtx);
    if (!buildOut.agent_id) throw new ValidationError('buildPlannerAgent failed');

    const getOut = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      getOut,
      Object.assign(new AgentLibraryContext(), builderCtx),
    );
    const agent = getOut.agents[0];
    if (!agent) throw new NotFoundError('PlannerAgent', buildOut.agent_id);
    return agent;
  }

  /** 构建规划上下文（结构化分类包裹），失败时返回空串。 */
  private async buildPlanContext(ctx: PlannerAgentContext, input: PlanInput): Promise<string> {
    if (!ctx.session_id) return '';
    try {
      const ctxOut = new ContextInfoOutput();
      await this.infoCore.context(
        Object.assign(new ContextInfoInput(), {
          session_id: ctx.session_id,
          work_id: ctx.work_id || '',
          selected_msg_ids: ctx.selected_msg_ids,
          info: input.task_content,
          persist_snapshot: false,
        }),
        ctxOut,
        new InfoCoreContext(),
      );
      return formatContextCategories(ctxOut);
    } catch {
      return '';
    }
  }

  /** 解析 Planner 绑定的 LLM：配置优先，其次经 Core.matchLLM 解析。 */
  private async resolvePlanLlmId(agent: { agent_id?: string }, config: PlannerAgentConfigRecord | null): Promise<string> {
    if (config?.llm_id) return config.llm_id;
    if (agent?.agent_id && this.llmCore) return await this.resolveLlm(agent.agent_id);
    return '';
  }

  /** 执行一次拆解；LLM 失败时降级为单节点 DAG。 */
  private async decomposeTask(
    task: string,
    contextExtra: string,
    params: { llmId: string; soulId: string; promptId: string; maxSub: number },
  ): Promise<{ dag: TaskDag; clarifications: PlanClarification[] }> {
    const result = await this.llmPlan(params.llmId, params.soulId, params.promptId, task, contextExtra, params.maxSub);
    if (result) return result;
    return { dag: this.singleNodeDag(task, this.estimateComplexity(task)), clarifications: [] };
  }

  /** 落库规划并写 InfoCore 记录，返回 plan_id。 */
  private async persistPlan(
    dag: TaskDag,
    workId: string,
    runId: string,
    ctx: PlannerAgentContext,
    parentPlanId: string,
  ): Promise<string> {
    const planId = IdGenerator.generate();
    await this.insertPlan(planId, workId, runId, dag, parentPlanId);
    await this.savePlanInfo(ctx, workId, runId, planId, dag);
    return planId;
  }

  /** 递归拆解：对仍复杂的叶子任务继续调用 LLM 拆解，父任务汇总子任务结果。 */
  private async expandComplexLeaves(dag: TaskDag, planCtx: PlanDecomposeContext, depth: number): Promise<TaskDag> {
    if (depth <= 0) return dag;
    const childMap = this.buildChildMap(dag.nodes);
    const nodes: PlanTaskNode[] = [];
    const edges: PlanTaskEdge[] = [...dag.edges];
    for (const node of dag.nodes) {
      if (this.hasChildren(node.task_id, childMap) || node.task_complexity < planCtx.threshold) {
        nodes.push(node);
      } else {
        await this.decomposeLeaf(node, planCtx, depth, nodes, edges);
      }
    }
    return { nodes, edges };
  }

  /** 拆解单个复杂叶子：当前节点转为父任务，其子任务挂载为新的叶子节点。 */
  private async decomposeLeaf(
    node: PlanTaskNode,
    planCtx: PlanDecomposeContext,
    depth: number,
    nodes: PlanTaskNode[],
    edges: PlanTaskEdge[],
  ): Promise<void> {
    // ===== 修改：新增深度与全局子任务数双重守卫 =====
    // 原始实现：depth 仅用于向下传递，从不校验，且无节点数预算，导致层级拆解无限递归 /
    // 子任务爆炸（大量重复任务），是「任务拆得过细、执行耗时极长」的直接根因。
    if (depth <= 0 || nodes.length >= planCtx.maxSub) {
      nodes.push(node);
      return;
    }
    const subResult = await this.llmPlan(planCtx.llmId, planCtx.soulId, planCtx.promptId, node.task_content, planCtx.contextExtra, planCtx.maxSub);
    if (!subResult || subResult.dag.nodes.length <= 1) {
      nodes.push(node);
      return;
    }
    const subDag = subResult.dag;
    const root = this.findRoot(subDag.nodes);
    const children = this.findChildren(subDag.nodes, root?.task_id);
    // 重置子任务的 dependencies：子任务在 subDag 内部的 dependencies 引用的是 subDag 内部 task_id，
    // 这些 id 不会进入父 DAG，若不重置会在 dedupe 前留下悬空引用；子任务若仍需拆解，由下方递归重新生成。
    const renamed = children.map((c) => ({ ...c, task_id: IdGenerator.generate(), parent_task_id: node.task_id, dependencies: [] }));
    nodes.push({ ...node, task_content: root?.task_content ?? node.task_content, dependencies: renamed.map((c) => c.task_id) });
    for (const child of renamed) {
      edges.push({ from_task_id: child.task_id, to_task_id: node.task_id });
      await this.decomposeLeaf(child, planCtx, depth - 1, nodes, edges);
    }
  }

  private buildChildMap(nodes: PlanTaskNode[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const n of nodes) {
      if (!n.parent_task_id) continue;
      const list = map.get(n.parent_task_id) ?? [];
      list.push(n.task_id);
      map.set(n.parent_task_id, list);
    }
    return map;
  }

  private hasChildren(taskId: string, childMap: Map<string, string[]>): boolean {
    return (childMap.get(taskId)?.length ?? 0) > 0;
  }

  private findRoot(nodes: PlanTaskNode[]): PlanTaskNode | undefined {
    return nodes.find((n) => !n.parent_task_id);
  }

  private findChildren(nodes: PlanTaskNode[], rootId?: string): PlanTaskNode[] {
    if (rootId) {
      const direct = nodes.filter((n) => n.parent_task_id === rootId);
      if (direct.length > 0) return direct;
    }
    return nodes.filter((n) => n.parent_task_id);
  }

  /** 分词（Unicode 字母/数字），用于子任务内容相似度比较。 */
  private tokenize(text: string): Set<string> {
    return new Set(
      text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1),
    );
  }

  /** 基于分词重叠的 containment 相似度：一个任务内容为另一个的子集时相似度接近 1。 */
  private contentSimilarity(a: string, b: string): number {
    const ta = this.tokenize(a);
    const tb = this.tokenize(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    return inter / Math.min(ta.size, tb.size);
  }

  /**
   * 子任务去重：层级拆解会反复产出语义重叠的子任务（如多个「明确目标/范围/框架」类
   * meta-task），按分词相似度（默认 0.7）合并，边与依赖引用重定向到保留节点。
   */
  private dedupeDag(dag: TaskDag): TaskDag {
    if (dag.nodes.length <= 1) return dag;
    const kept: PlanTaskNode[] = [];
    const remap = new Map<string, string>();
    for (const node of dag.nodes) {
      const dup = kept.find((k) => this.contentSimilarity(k.task_content, node.task_content) >= 0.7);
      if (dup) remap.set(node.task_id, dup.task_id);
      else kept.push(node);
    }
    const keptIds = new Set(kept.map((n) => n.task_id));
    const nodes = kept.map((n) => {
      const parent = n.parent_task_id ? (remap.get(n.parent_task_id) ?? n.parent_task_id) : '';
      return {
        ...n,
        // parent_task_id 同样按 keptIds 收敛，避免指向被合并/不存在的节点
        parent_task_id: parent && keptIds.has(parent) ? parent : '',
        dependencies: n.dependencies.map((d) => remap.get(d) ?? d).filter((d) => d !== n.task_id && keptIds.has(d)),
      };
    });
    const seen = new Set<string>();
    const edges: PlanTaskEdge[] = [];
    for (const e of dag.edges) {
      const from = remap.get(e.from_task_id) ?? e.from_task_id;
      const to = remap.get(e.to_task_id) ?? e.to_task_id;
      if (from === to || !keptIds.has(from) || !keptIds.has(to)) continue;
      const key = `${from}->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from_task_id: from, to_task_id: to });
    }
    return { nodes, edges };
  }

  /**
   * 全局子任务数上限兜底：超过 maxSub 时按「任务越具体（复杂度越低）越优先保留」裁剪，
   * 丢弃冗余的父/汇总任务及相关边；最终回复仍由 WriterAgent 汇总全部叶子结果，裁剪父任务不影响交付。
   */
  private limitDagSize(dag: TaskDag, maxSub: number): TaskDag {
    if (dag.nodes.length <= maxSub) return dag;
    const sorted = [...dag.nodes].sort((a, b) => {
      if (a.task_complexity !== b.task_complexity) return a.task_complexity - b.task_complexity;
      return (a.priority ?? 1) - (b.priority ?? 1);
    });
    const kept = sorted.slice(0, maxSub);
    const keptIds = new Set(kept.map((n) => n.task_id));
    // 裁剪后清理指向被丢弃节点的 dependencies / parent_task_id，
    // 避免「节点仍带子任务引用、但子任务已被裁剪」的悬空引用导致 DAG 展示不完整
    // （表现为某节点为非结束节点却找不到其子节点）。
    const nodes = kept.map((n) => ({
      ...n,
      parent_task_id: n.parent_task_id && keptIds.has(n.parent_task_id) ? n.parent_task_id : '',
      dependencies: (n.dependencies ?? []).filter((d) => d !== n.task_id && keptIds.has(d)),
    }));
    const edges = dag.edges.filter(
      (e) => e.from_task_id !== e.to_task_id && keptIds.has(e.from_task_id) && keptIds.has(e.to_task_id),
    );
    return { nodes, edges };
  }

  /**
   * 最大允许的 REPLAN parent 链深度（硬上限，防止无限递归重规划）。
   *
   * 说明：
   * - 每次 replan 会把新 plan 的 parent_plan_id 指向旧 plan，形成链式链表；
   * - handleDAGFailure 在达到 max_plan_retries（默认 2 次）时本就会终止，
   *   但为了防止上层代码误用（重复调用 replan 而不推进 plan_retry_count），
   *   此处再增加一层全局限流保护，<= 4 层时始终允许，超过即拒绝。
   * - 该值为代码常量，不影响现有配置和测试。
   */
  private static readonly MAX_TOTAL_REPLAN_DEPTH = 4;

  async replan(input: ReplanInput, output: ReplanOutput, ctx: PlannerAgentContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    const row = await this.relationDb.selectOne(AGENT_PLAN_TABLE, [
      { field: 'plan_id', operator: Operator.EQ, value: input.plan_id },
    ]);
    if (!row) throw new NotFoundError('Plan', input.plan_id);
    const old = mapPlan(row);

    // ===== 新增：parent_plan_id 链深度检查，防止无限递归 =====
    let depth = 0;
    let cursor: string | null = old.parent_plan_id || null;
    while (cursor) {
      depth++;
      if (depth > PlannerAgentService.MAX_TOTAL_REPLAN_DEPTH) {
        throw new ValidationError(
          `REPLAN 递归深度超过上限 (${PlannerAgentService.MAX_TOTAL_REPLAN_DEPTH})，已强制终止以防止无限循环。请检查 Planner 输出是否产生了相同的失败任务。`,
        );
      }
      const parentRow = await this.relationDb.selectOne(AGENT_PLAN_TABLE, [
        { field: 'plan_id', operator: Operator.EQ, value: cursor },
      ]);
      cursor = parentRow?.parent_plan_id ? String(parentRow.parent_plan_id) : null;
    }
    // ===== 深度检查结束 =====

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
    await this.insertPlan(newPlanId, old.work_id, old.run_id, newDag, input.plan_id);
    await this.savePlanInfo(ctx, old.work_id, old.run_id, newPlanId, newDag);

    output.new_plan_id = newPlanId;
    output.task_dag = newDag;
    return true;
  }

  async soPlan(input: GetPlanInput, output: GetPlanOutput, _ctx: PlannerAgentContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
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

  async configPlannerAgent(input: ConfigPlannerAgentInput, output: ConfigPlannerAgentOutput, _ctx: PlannerAgentContext, _metrics?: Metrics, _report?: Report,
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
    if (input.llm_id !== undefined) {
      data.push({ field: 'llm_id', value: input.llm_id || null });
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
  ): Promise<{ dag: TaskDag; clarifications: PlanClarification[] } | null> {
    try {
      const system = '';
      const prompt = await this.renderPrompt(
        promptId,
        '任务拆分与规划',
        {
          task_content: task,
          context_data: contextExtra,
          max_subtask_count: maxSub,
          soul: soulId,
        },
      );

      const llmOut = new ExecLLMOutput();
      const ok = await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: llmId,
          prompt,
          ...(system ? { system } : {}),
          caller: 'PlannerAgent.execPlan',
        }),
        llmOut,
        new LLMContext(),
      );
      if (!ok || !llmOut.result) return null;

      const parsed = parseJsonObject(llmOut.result);
      if (!parsed) return null;
      const nodes = (parsed.nodes as TaskDag['nodes']) ?? [];
      const edges = (parsed.edges as TaskDag['edges']) ?? [];
      const clarifications = this.parseClarifications(parsed.clarifications);
      if (!Array.isArray(nodes) || nodes.length === 0) return null;
      // 补全 task_id / parent_task_id / dependencies，保证后续层级与执行依赖计算稳定
      for (const n of nodes) {
        if (!n.task_id) n.task_id = IdGenerator.generate();
        if (!n.dependencies) n.dependencies = [];
        if (n.parent_task_id === undefined || n.parent_task_id === null) n.parent_task_id = '';
      }
      return { dag: { nodes, edges }, clarifications };
    } catch {
      return null;
    }
  }

  /** 解析 Planner 输出的 clarifications（需用户补充参数的任务澄清问题）。 */
  private parseClarifications(raw: unknown): PlanClarification[] {
    if (!Array.isArray(raw)) return [];
    const result: PlanClarification[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const q = (item as { question?: unknown }).question;
      const d = (item as { domain?: unknown }).domain;
      const question = typeof q === 'string' ? q.trim() : '';
      if (!question) continue;
      result.push({
        question,
        domain: typeof d === 'string' && d.trim() ? d.trim() : undefined,
      });
    }
    return result;
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
    runId: string,
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
      { field: 'run_id', value: runId },
      { field: 'task_dag', value: JSON.stringify({ ...dag, total_task_count: dag.nodes.length }) },
      { field: 'parent_plan_id', value: parentPlanId },
    ]);
  }

  private async savePlanInfo(
    ctx: PlannerAgentContext,
    workId: string,
    runId: string,
    planId: string,
    dag: TaskDag,
  ): Promise<void> {
    if (!ctx.session_id) return;
    try {
      await this.infoCore.saveInfo(
        Object.assign(new SaveInfoInput(), {
          session_id: ctx.session_id,
          work_id: workId,
          run_id: runId,
          info_type: InfoType.ACT,
          info_creator_role: 'AGENT',
          info_creator_id: planId,
          info: JSON.stringify(dag),
        }),
        new SaveInfoOutput(),
        new InfoCoreContext(),
      );
    } catch { /* best-effort */ }
  }

  private async assertPrompt(id: string, metrics?: Metrics): Promise<void> {
    await assertPromptExists(this.promptsAccess, id, metrics);
  }

  /**
   * 渲染 Prompt：配置模板 → 内置模板 → 内存兜底。
   */
  private async renderPrompt(
    templateId: string | undefined,
    builtinId: string,
    variables: Record<string, unknown>,
    metrics?: Metrics,
  ): Promise<string> {
    return renderPromptWithFallback(this.promptsAccess, templateId, builtinId, variables, metrics);
  }

  /**
   * 通过 Core.matchLLM 解析 PlannerAgent 绑定的 LLM（agent_llm）。
   */
  private async resolveLlm(agentId: string, metrics?: Metrics): Promise<string> {
    return resolveAgentLlm(this.llmCore, agentId, metrics);
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
      llm_id: (row.llm_id as string) || null,
    };
  }

  private estimateComplexity(task: string): number {
    const len = task.length;
    if (len < 50) return 20;
    if (len < 200) return 45;
    return 70;
  }
}
