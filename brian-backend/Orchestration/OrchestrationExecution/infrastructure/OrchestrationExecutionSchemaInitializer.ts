import type { RelationDBAccess } from '@brian-agent/base';

export class OrchestrationExecutionSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_task_agent (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        plan_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        task_complexity INTEGER,
        task_domain TEXT
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_task_agent_plan_id ON orchestration_task_agent(plan_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_task_agent_task_id ON orchestration_task_agent(task_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_task_agent_agent_id ON orchestration_task_agent(agent_id)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_agent_dag (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        plan_id TEXT NOT NULL,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT NOT NULL
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_agent_dag_plan_id ON orchestration_agent_dag(plan_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_agent_dag_from ON orchestration_agent_dag(from_agent_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_agent_dag_to ON orchestration_agent_dag(to_agent_id)',
    );

    this.relationDb.executeRaw(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_dag_edge ON orchestration_agent_dag(from_agent_id, to_agent_id)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_agent_dag_record (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        plan_id TEXT NOT NULL UNIQUE,
        total_agent_count INTEGER NOT NULL,
        agent_dag_json TEXT NOT NULL
      )
    `);

    this.relationDb.executeRaw(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_dag_record_plan_id ON orchestration_agent_dag_record(plan_id)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_agent_execution (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        work_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        plan_id TEXT,
        task_id TEXT,
        execution_type TEXT NOT NULL,
        task_content TEXT NOT NULL,
        status TEXT NOT NULL,
        answer TEXT,
        trace_id TEXT,
        iterations INTEGER,
        elapsed_ms INTEGER,
        error_info TEXT
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_agent_exec_work_id ON orchestration_agent_execution(work_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_agent_exec_agent_id ON orchestration_agent_execution(agent_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_agent_exec_plan_id ON orchestration_agent_execution(plan_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_agent_exec_status ON orchestration_agent_execution(status)',
    );
  }
}
