import type { AgentDatabase } from '../infra/dbTypes';
import { Input, Context, Output } from '../../shared/base';
import { logger } from '../../infrastructure/logger';
import { AopProxy } from '../infra/aopProxy';
import { generateId } from '../AgentLibrary/agentTypes';
import type { LLMService } from '../../core/llm/LLMService';
import type { ChatCompletionRequest } from '../../base/LLMWrapper';

const MODULE = 'PlannerAgent';

function ensureTable(db: AgentDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_plan (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
    plan_id TEXT NOT NULL UNIQUE, work_id TEXT NOT NULL DEFAULT '',
    interact_id TEXT NOT NULL DEFAULT '', task_dag TEXT NOT NULL DEFAULT '{}',
    parent_plan_id TEXT
  )`);
  db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_plan_work_id ON agent_plan(work_id)').run();

  db.exec(`CREATE TABLE IF NOT EXISTS planner_agent_config (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
    complexity_decompose_threshold INTEGER NOT NULL DEFAULT 50,
    plan_prompt_template_id TEXT NOT NULL DEFAULT '',
    max_subtask_count INTEGER NOT NULL DEFAULT 10
  )`);

  const pconf = db.prepare('SELECT * FROM planner_agent_config LIMIT 1').get() as Record<string, unknown> | undefined;
  if (!pconf) {
    const now = Date.now();
    db.prepare('INSERT INTO planner_agent_config (id,created,updated) VALUES (?,?,?)').run(generateId(), now, now);
  }
}

interface DagNode {
  task_id: string;
  task_content: string;
  task_complexity?: number;
  task_domain?: string;
  priority?: number;
  dependencies?: string[];
}

interface DagEdge {
  from_task_id: string;
  to_task_id: string;
}

interface TaskDag {
  plan_id?: string;
  total_task_count?: number;
  nodes: DagNode[];
  edges: DagEdge[];
  [key: string]: unknown;
}

function validateDAG(nodes: DagNode[], edges: DagEdge[]): { valid: boolean; error?: string; cycles?: string[][] } {
  const nodeIds = new Set(nodes.map(n => n.task_id));

  for (const edge of edges) {
    if (!nodeIds.has(edge.from_task_id)) {
      return { valid: false, error: `Edge references unknown from_task_id: ${edge.from_task_id}` };
    }
    if (!nodeIds.has(edge.to_task_id)) {
      return { valid: false, error: `Edge references unknown to_task_id: ${edge.to_task_id}` };
    }
  }

  for (const node of nodes) {
    for (const dep of node.dependencies || []) {
      if (!nodeIds.has(dep)) {
        return { valid: false, error: `Node ${node.task_id} references unknown dependency: ${dep}` };
      }
    }
  }

  const adjList = new Map<string, string[]>();
  for (const nodeId of nodeIds) adjList.set(nodeId, []);
  for (const edge of edges) {
    adjList.get(edge.from_task_id)!.push(edge.to_task_id);
  }
  for (const node of nodes) {
    for (const dep of node.dependencies || []) {
      adjList.get(dep)!.push(node.task_id);
    }
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const nid of nodeIds) color.set(nid, WHITE);
  const cycles: string[][] = [];

  function dfsFindCycles(nodeId: string, path: string[]): void {
    color.set(nodeId, GRAY);
    path.push(nodeId);
    for (const neighbor of adjList.get(nodeId) || []) {
      const c = color.get(neighbor)!;
      if (c === GRAY) {
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart).concat(neighbor);
        cycles.push(cycle);
      } else if (c === WHITE) {
        dfsFindCycles(neighbor, path);
      }
    }
    color.set(nodeId, BLACK);
    path.pop();
  }

  for (const nid of nodeIds) {
    if (color.get(nid) === WHITE) {
      dfsFindCycles(nid, []);
    }
  }

  if (cycles.length > 0) {
    return {
      valid: false,
      error: `DAG contains ${cycles.length} cycle(s)`,
      cycles,
    };
  }

  return { valid: true };
}

function mergeSimilarTasks(nodes: DagNode[], similarityThreshold: number = 0.85): { nodes: DagNode[]; edges: DagEdge[] } {
  const merged = new Map<number, boolean>();
  const resultNodes: DagNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    if (merged.has(i)) continue;
    let current = nodes[i];
    const mergedIds = new Map<string, string>();

    for (let j = i + 1; j < nodes.length; j++) {
      if (merged.has(j)) continue;
      const sim = computeContentSimilarity(current.task_content, nodes[j].task_content);
      if (sim >= similarityThreshold) {
        merged.set(j, true);
        mergedIds.set(nodes[j].task_id, current.task_id);
        current = {
          ...current,
          task_content: current.task_content.length >= nodes[j].task_content.length
            ? current.task_content
            : nodes[j].task_content,
        };
      }
    }

    resultNodes.push({
      ...current,
      dependencies: (current.dependencies || []).map(d => mergedIds.get(d) || d),
    });
  }

  const resultEdges: DagEdge[] = [];
  for (const edge of ([] as DagEdge[])) {
    resultEdges.push({
      from_task_id: merged.get(([] as DagEdge[]).indexOf(edge)) !== undefined
        ? '' : edge.from_task_id,
      to_task_id: edge.to_task_id,
    });
  }

  return { nodes: resultNodes, edges: resultEdges };
}

function computeContentSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/[\s,_-]+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/[\s,_-]+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

class PlanInput extends Input {
  work_id!: string; interact_id!: string; task_content!: string;
  constructor(d: Partial<PlanInput>) { super(d); Object.assign(this, d); }
}
class PlanContext extends Context { }
class PlanOutput extends Output { plan_id?: string; task_dag?: Record<string, unknown>; }

class ReplanInput extends Input {
  plan_id!: string; failed_task_id!: string; failure_reason!: string;
  completed_task_ids!: string[];
  constructor(d: Partial<ReplanInput>) { super(d); Object.assign(this, d); }
}
class ReplanContext extends Context { }
class ReplanOutput extends Output { new_plan_id?: string; task_dag?: Record<string, unknown>; }

class GetPlanInput extends Input {
  plan_id?: string; work_id?: string;
  constructor(d: Partial<GetPlanInput>) { super(d); Object.assign(this, d); }
}
class GetPlanContext extends Context { }
class GetPlanOutput extends Output { plans?: Record<string, unknown>[]; }

class ConfigPlannerAgentInput extends Input {
  complexity_decompose_threshold?: number;
  plan_prompt_template_id?: string;
  max_subtask_count?: number;
  constructor(d: Partial<ConfigPlannerAgentInput>) { super(d); Object.assign(this, d); }
}
class ConfigPlannerAgentContext extends Context { }
class ConfigPlannerAgentOutput extends Output {
  complexity_decompose_threshold?: number; plan_prompt_template_id?: string;
  max_subtask_count?: number;
}

export { PlanInput, ReplanInput, GetPlanInput, ConfigPlannerAgentInput };
export { PlanContext, ReplanContext, GetPlanContext, ConfigPlannerAgentContext };
export { PlanOutput, ReplanOutput, GetPlanOutput, ConfigPlannerAgentOutput };

export class PlannerAgentService {
  private db: AgentDatabase;

  constructor(db: AgentDatabase, private llmService?: LLMService) {
    this.db = db;
    ensureTable(db);
  }

  async plan(input: PlanInput, _context: PlanContext, output: PlanOutput): Promise<boolean> {
    logger.info(MODULE, '[plan] start', { work_id: input.work_id, task: input.task_content?.substring(0, 100) });

    const config = this.db.prepare('SELECT * FROM planner_agent_config LIMIT 1').get() as Record<string, unknown>;
    const threshold = Number(config.complexity_decompose_threshold) || 50;
    const complexity = this.estimateComplexity(input.task_content);
    const planId = generateId();

    if (complexity < threshold) {
      const dag: TaskDag = {
        plan_id: planId, total_task_count: 1,
        nodes: [{ task_id: generateId(), task_content: input.task_content, task_complexity: complexity, task_domain: '', priority: 1, dependencies: [] }],
        edges: [],
      };
      this.savePlan(planId, input.work_id, input.interact_id, dag);
      output.plan_id = planId;
      output.task_dag = dag as Record<string, unknown>;
      logger.info(MODULE, '[plan] simple task, single node dag', { plan_id: planId });
      return true;
    }

    let dag: TaskDag | null = null;

    if (this.llmService) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const planRequest: ChatCompletionRequest = {
            model: '',
            messages: [
              { role: 'system', content: 'You are a task decomposition planner. Break down complex tasks into smaller sub-tasks with dependencies. Output JSON with "nodes" (each: task_id, task_content, task_complexity 0-100, task_domain, priority, dependencies[]) and "edges" (each: from_task_id, to_task_id). Every task_id must be a unique random string. Dependencies must reference valid task_ids. No cycles allowed.' },
              { role: 'user', content: `Decompose this task into sub-tasks:\n${input.task_content}\n\nOutput valid JSON only.` },
            ],
            temperature: 0.3,
            maxTokens: 2048,
          };
          const resp = await this.llmService.chatCompletion(planRequest);
          const content = resp.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const rawNodes = (parsed.nodes || []).map((n: Record<string, unknown>, i: number) => ({
              task_id: (n.task_id as string) || generateId(),
              task_content: (n.task_content as string) || n.name as string || `Sub-task ${i + 1}`,
              task_complexity: (n.task_complexity as number) || 50,
              task_domain: (n.task_domain as string) || '',
              priority: (n.priority as number) || (i + 1),
              dependencies: (n.dependencies as string[]) || [],
            }));

            dag = {
              plan_id: planId,
              total_task_count: rawNodes.length,
              nodes: rawNodes,
              edges: (parsed.edges || []).map((e: Record<string, unknown>) => ({
                from_task_id: e.from_task_id as string,
                to_task_id: e.to_task_id as string,
              })),
            };

            const validation = validateDAG(dag.nodes, dag.edges);
            if (!validation.valid) {
              logger.warn(MODULE, `[plan] LLM DAG validation failed (attempt ${attempt + 1}/2): ${validation.error}`);
              dag = null;
              continue;
            }

            const merged = mergeSimilarTasks(dag.nodes, 0.85);
            dag.nodes = merged.nodes;

            break;
          }
        } catch (e) {
          logger.warn(MODULE, `[plan] LLM decomposition attempt ${attempt + 1} failed`, { error: (e as Error).message });
        }
      }
    }

    if (!dag || !dag.nodes || dag.nodes.length === 0) {
      dag = this.buildHeuristicDag(planId, input.task_content, complexity, config);
    }

    this.savePlan(planId, input.work_id, input.interact_id, dag);
    output.plan_id = planId;
    output.task_dag = dag as Record<string, unknown>;
    logger.info(MODULE, '[plan] done', { plan_id: planId, sub_tasks: dag.nodes.length });
    return true;
  }

  replan(input: ReplanInput, _context: ReplanContext, output: ReplanOutput): boolean {
    logger.info(MODULE, '[replan] start', { plan_id: input.plan_id, failed_task_id: input.failed_task_id });
    const row = this.db.prepare('SELECT * FROM agent_plan WHERE plan_id = ?').get(input.plan_id) as Record<string, unknown> | undefined;
    if (!row) return false;

    const originalDag = JSON.parse(row.task_dag as string) as Record<string, unknown>;
    const nodes = (originalDag.nodes as Record<string, unknown>[]) || [];
    const completed = new Set(input.completed_task_ids);
    const remainingNodes = nodes.filter(n => !completed.has(n.task_id as string));

    const newPlanId = generateId();
    const newDag: TaskDag = { plan_id: newPlanId, total_task_count: remainingNodes.length, nodes: remainingNodes as unknown as DagNode[], edges: [] };

    const validation = validateDAG(newDag.nodes, newDag.edges);
    if (!validation.valid) {
      logger.warn(MODULE, `[replan] validation failed: ${validation.error}`);
    }

    const now = Date.now();
    this.db.prepare('INSERT INTO agent_plan (id,created,updated,plan_id,work_id,interact_id,task_dag,parent_plan_id) VALUES (?,?,?,?,?,?,?,?)').run(
      generateId(), now, now, newPlanId, row.work_id || '', row.interact_id || '', JSON.stringify(newDag), input.plan_id
    );

    output.new_plan_id = newPlanId;
    output.task_dag = newDag as Record<string, unknown>;
    logger.info(MODULE, '[replan] done', { new_plan_id: newPlanId, remaining: remainingNodes.length });
    return true;
  }

  getPlan(input: GetPlanInput, _context: GetPlanContext, output: GetPlanOutput): boolean {
    if (input.plan_id) {
      const row = this.db.prepare('SELECT * FROM agent_plan WHERE plan_id = ?').get(input.plan_id) as Record<string, unknown> | undefined;
      if (!row) return false;
      output.plans = [{ ...row, task_dag: JSON.parse(row.task_dag as string) }];
    } else if (input.work_id) {
      const rows = this.db.prepare('SELECT * FROM agent_plan WHERE work_id = ? ORDER BY created DESC').all(input.work_id) as Record<string, unknown>[];
      output.plans = rows.map(r => ({ ...r, task_dag: JSON.parse(r.task_dag as string) }));
    } else {
      output.plans = [];
    }
    return true;
  }

  configPlannerAgent(input: ConfigPlannerAgentInput, _context: ConfigPlannerAgentContext, output: ConfigPlannerAgentOutput): boolean {
    logger.info(MODULE, '[configPlannerAgent] start');
    const now = Date.now();
    const sets: string[] = ['updated = ?'];
    const params: unknown[] = [now];
    if (input.complexity_decompose_threshold !== undefined) { sets.push('complexity_decompose_threshold = ?'); params.push(input.complexity_decompose_threshold); }
    if (input.plan_prompt_template_id !== undefined) { sets.push('plan_prompt_template_id = ?'); params.push(input.plan_prompt_template_id); }
    if (input.max_subtask_count !== undefined) { sets.push('max_subtask_count = ?'); params.push(input.max_subtask_count); }
    this.db.prepare(`UPDATE planner_agent_config SET ${sets.join(',')}`).run(...params);
    const config = this.db.prepare('SELECT * FROM planner_agent_config LIMIT 1').get() as Record<string, unknown>;
    output.complexity_decompose_threshold = Number(config.complexity_decompose_threshold) || 50;
    output.plan_prompt_template_id = config.plan_prompt_template_id as string;
    output.max_subtask_count = Number(config.max_subtask_count) || 10;
    logger.info(MODULE, '[configPlannerAgent] done');
    return true;
  }

  private savePlan(planId: string, workId: string, interactId: string, dag: TaskDag): void {
    const now = Date.now();
    this.db.prepare('INSERT INTO agent_plan (id,created,updated,plan_id,work_id,interact_id,task_dag) VALUES (?,?,?,?,?,?,?)').run(
      generateId(), now, now, planId, workId || '', interactId || '', JSON.stringify(dag)
    );
  }

  private buildHeuristicDag(planId: string, taskContent: string, complexity: number, config: Record<string, unknown>): TaskDag {
    const maxSub = Number(config.max_subtask_count) || 10;
    const subCount = Math.min(Math.max(Math.floor(complexity / 10), 2), maxSub);
    const nodes: DagNode[] = [];
    const edges: DagEdge[] = [];
    let prevId = '';
    for (let i = 0; i < subCount; i++) {
      const tid = generateId();
      nodes.push({
        task_id: tid,
        task_content: `Sub-task ${i + 1}: ${taskContent.substring(0, 80)}... (part ${i + 1}/${subCount})`,
        task_complexity: Math.floor(complexity / subCount),
        task_domain: '', priority: i + 1,
        dependencies: prevId ? [prevId] : [],
      });
      if (prevId) edges.push({ from_task_id: prevId, to_task_id: tid });
      prevId = tid;
    }
    return { plan_id: planId, total_task_count: subCount, nodes, edges };
  }

  private estimateComplexity(content: string): number {
    const len = content.length;
    if (len < 50) return Math.min(len, 49);
    if (len < 200) return 30 + (len - 50) * 0.13;
    if (len < 1000) return 50 + (len - 200) * 0.05;
    return Math.min(100, 90 + (len - 1000) * 0.01);
  }
}

export { validateDAG, mergeSimilarTasks, type DagNode, type DagEdge, type TaskDag };

export function createPlannerAgentService(db: AgentDatabase, llmService?: LLMService): PlannerAgentService {
  return AopProxy(new PlannerAgentService(db, llmService));
}
