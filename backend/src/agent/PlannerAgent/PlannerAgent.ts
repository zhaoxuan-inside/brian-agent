import { Input, Context, Output } from '../../shared/base';
import { logger } from '../../infrastructure/logger';
import { AopProxy } from '../infra/aopProxy';
import { generateId } from '../AgentLibrary/agentTypes';
import type { LLMService } from '../../core/llm/LLMService';
import type { ChatCompletionRequest } from '../../base/LLMWrapper';
import { getDatabase } from '../../infrastructure/database';

const DB = getDatabase();
const MODULE = 'PlannerAgent';

DB.exec(`CREATE TABLE IF NOT EXISTS agent_plan (
  id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
  plan_id TEXT NOT NULL UNIQUE, work_id TEXT NOT NULL DEFAULT '',
  interact_id TEXT NOT NULL DEFAULT '', task_dag TEXT NOT NULL DEFAULT '{}',
  parent_plan_id TEXT
)`);
DB.prepare('CREATE INDEX IF NOT EXISTS idx_agent_plan_work_id ON agent_plan(work_id)').run();

DB.exec(`CREATE TABLE IF NOT EXISTS planner_agent_config (
  id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
  complexity_decompose_threshold INTEGER NOT NULL DEFAULT 50,
  plan_prompt_template_id TEXT NOT NULL DEFAULT '',
  max_subtask_count INTEGER NOT NULL DEFAULT 10
)`);

const PCONF = DB.prepare('SELECT * FROM planner_agent_config LIMIT 1').get() as Record<string, unknown> | undefined;
if (!PCONF) {
  const now = Date.now();
  DB.prepare('INSERT INTO planner_agent_config (id,created,updated) VALUES (?,?,?)').run(generateId(), now, now);
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
  constructor(private llmService?: LLMService) {}

  async plan(input: PlanInput, _context: PlanContext, output: PlanOutput): Promise<boolean> {
    logger.info(MODULE, '[plan] start', { work_id: input.work_id, task: input.task_content?.substring(0, 100) });

    const config = DB.prepare('SELECT * FROM planner_agent_config LIMIT 1').get() as Record<string, unknown>;
    const threshold = Number(config.complexity_decompose_threshold) || 50;
    const complexity = this.estimateComplexity(input.task_content);
    const planId = generateId();

    if (complexity < threshold) {
      const dag = {
        plan_id: planId, total_task_count: 1,
        nodes: [{ task_id: generateId(), task_content: input.task_content, task_complexity: complexity, task_domain: '', priority: 1, dependencies: [] }],
        edges: [],
      };
      const now = Date.now();
      DB.prepare('INSERT INTO agent_plan (id,created,updated,plan_id,work_id,interact_id,task_dag) VALUES (?,?,?,?,?,?,?)').run(
        generateId(), now, now, planId, input.work_id || '', input.interact_id || '', JSON.stringify(dag)
      );
      output.plan_id = planId;
      output.task_dag = dag as Record<string, unknown>;
      logger.info(MODULE, '[plan] simple task, single node dag', { plan_id: planId });
      return true;
    }

    if (this.llmService) {
      try {
        const planRequest: ChatCompletionRequest = {
          model: '',
          messages: [
            { role: 'system', content: 'You are a task decomposition planner. Break down complex tasks into smaller sub-tasks with dependencies. Output JSON with "nodes" (each: task_id, task_content, task_complexity 0-100, task_domain, priority, dependencies[]) and "edges" (each: from_task_id, to_task_id).' },
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
          const dag = {
            plan_id: planId,
            total_task_count: parsed.nodes?.length || 0,
            nodes: (parsed.nodes || []).map((n: Record<string, unknown>, i: number) => ({
              task_id: generateId(), task_content: n.task_content || n.name || `Sub-task ${i + 1}`,
              task_complexity: n.task_complexity || 50, task_domain: n.task_domain || '',
              priority: n.priority || (i + 1), dependencies: n.dependencies || [],
            })),
            edges: (parsed.edges || []),
          };
          const now = Date.now();
          DB.prepare('INSERT INTO agent_plan (id,created,updated,plan_id,work_id,interact_id,task_dag) VALUES (?,?,?,?,?,?,?)').run(
            generateId(), now, now, planId, input.work_id || '', input.interact_id || '', JSON.stringify(dag)
          );
          output.plan_id = planId;
          output.task_dag = dag as Record<string, unknown>;
          logger.info(MODULE, '[plan] LLM decomposition done', { plan_id: planId, sub_tasks: dag.nodes.length });
          return true;
        }
      } catch (e) {
        logger.warn(MODULE, '[plan] LLM decomposition failed, falling back to heuristic', { error: (e as Error).message });
      }
    }

    const maxSub = Number(config.max_subtask_count) || 10;
    const subCount = Math.min(Math.max(Math.floor(complexity / 10), 2), maxSub);
    const nodes = [];
    const edges = [];
    let prevId = '';
    for (let i = 0; i < subCount; i++) {
      const tid = generateId();
      nodes.push({ task_id: tid, task_content: `Sub-task ${i + 1}: ${input.task_content.substring(0, 80)}... (part ${i + 1}/${subCount})`, task_complexity: Math.floor(complexity / subCount), task_domain: '', priority: i + 1, dependencies: prevId ? [prevId] : [] });
      if (prevId) edges.push({ from_task_id: prevId, to_task_id: tid });
      prevId = tid;
    }

    const dag = { plan_id: planId, total_task_count: subCount, nodes, edges };
    const now = Date.now();
    DB.prepare('INSERT INTO agent_plan (id,created,updated,plan_id,work_id,interact_id,task_dag) VALUES (?,?,?,?,?,?,?)').run(
      generateId(), now, now, planId, input.work_id || '', input.interact_id || '', JSON.stringify(dag)
    );

    output.plan_id = planId;
    output.task_dag = dag as Record<string, unknown>;
    logger.info(MODULE, '[plan] heuristic decomposition done', { plan_id: planId, sub_tasks: subCount });
    return true;
  }

  replan(input: ReplanInput, _context: ReplanContext, output: ReplanOutput): boolean {
    logger.info(MODULE, '[replan] start', { plan_id: input.plan_id, failed_task_id: input.failed_task_id });
    const row = DB.prepare('SELECT * FROM agent_plan WHERE plan_id = ?').get(input.plan_id) as Record<string, unknown> | undefined;
    if (!row) return false;

    const originalDag = JSON.parse(row.task_dag as string) as Record<string, unknown>;
    const nodes = (originalDag.nodes as Record<string, unknown>[]) || [];
    const completed = new Set(input.completed_task_ids);
    const remainingNodes = nodes.filter(n => !completed.has(n.task_id as string));

    const newPlanId = generateId();
    const newDag = { plan_id: newPlanId, total_task_count: remainingNodes.length, nodes: remainingNodes, edges: [] };
    const now = Date.now();
    DB.prepare('INSERT INTO agent_plan (id,created,updated,plan_id,work_id,interact_id,task_dag,parent_plan_id) VALUES (?,?,?,?,?,?,?,?)').run(
      generateId(), now, now, newPlanId, row.work_id || '', row.interact_id || '', JSON.stringify(newDag), input.plan_id
    );

    output.new_plan_id = newPlanId;
    output.task_dag = newDag as Record<string, unknown>;
    logger.info(MODULE, '[replan] done', { new_plan_id: newPlanId, remaining: remainingNodes.length });
    return true;
  }

  getPlan(input: GetPlanInput, _context: GetPlanContext, output: GetPlanOutput): boolean {
    if (input.plan_id) {
      const row = DB.prepare('SELECT * FROM agent_plan WHERE plan_id = ?').get(input.plan_id) as Record<string, unknown> | undefined;
      if (!row) return false;
      output.plans = [{ ...row, task_dag: JSON.parse(row.task_dag as string) }];
    } else if (input.work_id) {
      const rows = DB.prepare('SELECT * FROM agent_plan WHERE work_id = ? ORDER BY created DESC').all(input.work_id) as Record<string, unknown>[];
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
    DB.prepare(`UPDATE planner_agent_config SET ${sets.join(',')}`).run(...params);
    const config = DB.prepare('SELECT * FROM planner_agent_config LIMIT 1').get() as Record<string, unknown>;
    output.complexity_decompose_threshold = Number(config.complexity_decompose_threshold) || 50;
    output.plan_prompt_template_id = config.plan_prompt_template_id as string;
    output.max_subtask_count = Number(config.max_subtask_count) || 10;
    logger.info(MODULE, '[configPlannerAgent] done');
    return true;
  }

  private estimateComplexity(content: string): number {
    const len = content.length;
    if (len < 50) return Math.min(len, 49);
    if (len < 200) return 30 + (len - 50) * 0.13;
    if (len < 1000) return 50 + (len - 200) * 0.05;
    return Math.min(100, 90 + (len - 1000) * 0.01);
  }
}

export function createPlannerAgentService(llmService?: LLMService): PlannerAgentService {
  const raw = new PlannerAgentService(llmService);
  return AopProxy(raw, { logger: { info: (m: string, msg: string) => logger.info(m, msg) } });
}
