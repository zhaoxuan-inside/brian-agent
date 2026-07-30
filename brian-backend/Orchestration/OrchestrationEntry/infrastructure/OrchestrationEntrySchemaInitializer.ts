import type { RelationDBAccess } from '@brian-agent/base';

export class OrchestrationEntrySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_work (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        work_id TEXT NOT NULL UNIQUE,
        interact_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_query TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CREATED',
        orchestration_strategy TEXT NOT NULL DEFAULT '',
        task_count INTEGER NOT NULL DEFAULT 0,
        completed_task_count INTEGER NOT NULL DEFAULT 0,
        elapsed_ms INTEGER NOT NULL DEFAULT 0,
        cancel_reason TEXT,
        error_message TEXT,
        final_response TEXT,
        metadata TEXT
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orchestration_work_work_id ON orchestration_work(work_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orchestration_work_session_id ON orchestration_work(session_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orchestration_work_status ON orchestration_work(status)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_config (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        complexity_decompose_threshold INTEGER NOT NULL DEFAULT 50,
        strategy_prompt_template_id TEXT NOT NULL DEFAULT '',
        default_strategy TEXT NOT NULL DEFAULT 'SIMPLE',
        max_recent_works INTEGER NOT NULL DEFAULT 5,
        async_worker_interval INTEGER NOT NULL DEFAULT 1000,
        default_strategy_id TEXT,
        max_plan_retries INTEGER NOT NULL DEFAULT 2,
        plan_prompt_template_id TEXT NOT NULL DEFAULT '',
        max_concurrent INTEGER NOT NULL DEFAULT 1,
        default_max_iterations INTEGER NOT NULL DEFAULT 10,
        dag_timeout_ms INTEGER NOT NULL DEFAULT 300000,
        max_execution_depth INTEGER NOT NULL DEFAULT 50,
        node_timeout_ms INTEGER NOT NULL DEFAULT 300000,
        trace_enabled INTEGER NOT NULL DEFAULT 1,
        max_nodes_in_graph INTEGER NOT NULL DEFAULT 50
      )
    `);

    const now = Date.now();
    this.relationDb.executeRaw(`
      INSERT OR IGNORE INTO orchestration_config
        (id, created, updated, complexity_decompose_threshold, strategy_prompt_template_id,
         default_strategy, max_recent_works, async_worker_interval, default_strategy_id,
         max_plan_retries, plan_prompt_template_id, max_concurrent, default_max_iterations,
         dag_timeout_ms, max_execution_depth, node_timeout_ms, trace_enabled,
         max_nodes_in_graph)
      VALUES
        ('orchestration_config_default', ${now}, ${now}, 50, '', 'SIMPLE', 5, 1000, NULL,
         2, '', 1, 10, 300000, 50, 300000, 1, 50)
    `);
  }
}
