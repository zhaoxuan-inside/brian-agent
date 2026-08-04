import type { RelationDBAccess } from '@brian-agent/base';

const STRATEGY_SELECTOR_PROMPT_TEMPLATE_ID = 'strategy_selector_prompt';

const STRATEGY_SELECTOR_PROMPT_CONTENT = [
  'You are selecting the best orchestration strategy for a user task. Given the user task below, analyze its complexity and choose the appropriate strategy.',
  '',
  'Strategy threshold: complexity >= {{threshold}} → PLANNING (must decompose into subtasks), otherwise SIMPLE (single Agent execution).',
  '',
  '{{ctx_str}}User task: {{user_query}}',
  '',
  'Respond with ONLY the JSON object. Do not include any other text.',
  '',
  '{',
  '  "complexity": <0-100 integer>',
  '  "strategy": "SIMPLE" | "PLANNING"',
  '  "reason": "<brief explanation>"',
  '  "plan": [{"step": 1, "description": "..."}, ...]',
  '}',
  '',
  'Fields:',
  '- complexity: integer 0-100 indicating task complexity.',
  '- strategy: "SIMPLE" for simple queries, "PLANNING" for tasks requiring multi-step decomposition.',
  '- reason: brief explanation of the strategy choice.',
  '- plan: only for PLANNING, lists the decomposed subtasks in execution order.',
].join('\n');

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
      CREATE TABLE IF NOT EXISTS prompt_template (
        id                    TEXT    NOT NULL PRIMARY KEY,
        created               INTEGER NOT NULL,
        updated               INTEGER NOT NULL,
        prompt_template_title TEXT    NOT NULL,
        prompt_template_brief TEXT,
        prompt_template       TEXT    NOT NULL,
        enable                INTEGER NOT NULL DEFAULT 1
      )
    `);

    this.relationDb.executeRaw(`
      INSERT OR IGNORE INTO prompt_template
        (id, created, updated, prompt_template_title, prompt_template_brief, prompt_template, enable)
      VALUES
        ('${STRATEGY_SELECTOR_PROMPT_TEMPLATE_ID}', ${now}, ${now},
         'Orchestration Strategy Selector',
         '分析用户任务复杂度并选择 SIMPLE 或 PLANNING 编排策略',
         '${STRATEGY_SELECTOR_PROMPT_CONTENT.replace(/'/g, "''")}',
         1)
    `);

    this.relationDb.executeRaw(`
      UPDATE prompt_template
      SET prompt_template_title = 'Orchestration Strategy Selector',
          prompt_template_brief = '分析用户任务复杂度并选择 SIMPLE 或 PLANNING 编排策略',
          prompt_template = '${STRATEGY_SELECTOR_PROMPT_CONTENT.replace(/'/g, "''")}',
          updated = ${now}
      WHERE id = '${STRATEGY_SELECTOR_PROMPT_TEMPLATE_ID}'
    `);

    this.relationDb.executeRaw(`
      INSERT OR IGNORE INTO orchestration_config
        (id, created, updated, complexity_decompose_threshold, strategy_prompt_template_id,
         default_strategy, max_recent_works, async_worker_interval, default_strategy_id,
         max_plan_retries, plan_prompt_template_id, max_concurrent, default_max_iterations,
         dag_timeout_ms, max_execution_depth, node_timeout_ms, trace_enabled,
         max_nodes_in_graph)
      VALUES
        ('orchestration_config_default', ${now}, ${now}, 50,
         '${STRATEGY_SELECTOR_PROMPT_TEMPLATE_ID}',
         'SIMPLE', 5, 1000, NULL,
         2, '', 1, 10, 300000, 50, 300000, 1, 50)
    `);

    this.relationDb.executeRaw(`
      UPDATE orchestration_config
      SET strategy_prompt_template_id = '${STRATEGY_SELECTOR_PROMPT_TEMPLATE_ID}',
          updated = ${now}
      WHERE id = 'orchestration_config_default'
        AND (strategy_prompt_template_id = '' OR strategy_prompt_template_id IS NULL)
    `);
  }
}
