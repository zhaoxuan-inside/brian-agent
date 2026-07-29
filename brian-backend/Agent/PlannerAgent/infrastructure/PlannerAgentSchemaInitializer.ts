import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { AGENT_PLAN_TABLE, PLANNER_AGENT_CONFIG_TABLE } from '../domain/types';

export class PlannerAgentSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_PLAN_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        plan_id TEXT NOT NULL UNIQUE, work_id TEXT NOT NULL, interact_id TEXT NOT NULL,
        task_dag TEXT NOT NULL, parent_plan_id TEXT
      )`,
    );
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_plan_work ON ${AGENT_PLAN_TABLE}(work_id)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_plan_created ON ${AGENT_PLAN_TABLE}(created)`);

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${PLANNER_AGENT_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        complexity_decompose_threshold INTEGER NOT NULL DEFAULT 50,
        plan_prompt_template_id TEXT NOT NULL,
        max_subtask_count INTEGER NOT NULL DEFAULT 10
      )`,
    );

    const count = await this.relationDb.count(PLANNER_AGENT_CONFIG_TABLE);
    if (count > 0) return;
    const now = IdGenerator.now();
    await this.relationDb.insert(PLANNER_AGENT_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'complexity_decompose_threshold', value: 50 },
      { field: 'plan_prompt_template_id', value: '' },
      { field: 'max_subtask_count', value: 10 },
    ]);
  }
}
