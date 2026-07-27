import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { AGENT_PLAN_TABLE, PLANNER_AGENT_CONFIG_TABLE } from '../domain/types';

export class PlannerAgentSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
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

    const ex = this.relationDb.queryRaw<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${PLANNER_AGENT_CONFIG_TABLE}`,
    );
    if (ex[0]?.count > 0) return;
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${PLANNER_AGENT_CONFIG_TABLE} (id, created, updated, complexity_decompose_threshold, plan_prompt_template_id, max_subtask_count) VALUES (?, ?, ?, 50, ?, 10)`,
      [IdGenerator.uuid(), now, now, ''],
    );
  }
}
