import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';

type TolerantDdl = { sql: string; ignoreReason: string };

type DdlEntry = string | TolerantDdl;

type BuiltinTaskSeed = { task_id: string; task_name: string; task_type: string; cron: string };

export class SelfLearningSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  private readonly ddlStatements: readonly DdlEntry[] = [
    `
      CREATE TABLE IF NOT EXISTS self_learning_library (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        library_id TEXT UNIQUE NOT NULL,
        library_name TEXT,
        library_path TEXT NOT NULL,
        enable_self_learning INTEGER DEFAULT 1,
        learning_rate INTEGER DEFAULT 5
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_sl_library_library_id ON self_learning_library(library_id)',
    { sql: `ALTER TABLE self_learning_library ADD COLUMN "category" TEXT DEFAULT ''`, ignoreReason: '已存在 category 列时忽略' },
    { sql: `ALTER TABLE self_learning_library ADD COLUMN "description" TEXT DEFAULT ''`, ignoreReason: '已存在 description 列时忽略' },

    `
      CREATE TABLE IF NOT EXISTS self_learning_file (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        library_id TEXT NOT NULL,
        file_id TEXT UNIQUE NOT NULL,
        file_name TEXT,
        file_path TEXT,
        relative_path TEXT DEFAULT '',
        parent_path TEXT DEFAULT '',
        is_directory INTEGER DEFAULT 0,
        file_size INTEGER,
        status TEXT DEFAULT 'PENDING',
        error_message TEXT,
        learned_at INTEGER
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_sl_file_library_id ON self_learning_file(library_id)',
    'CREATE INDEX IF NOT EXISTS idx_sl_file_file_id ON self_learning_file(file_id)',
    'CREATE INDEX IF NOT EXISTS idx_sl_file_status ON self_learning_file(status)',
    { sql: `ALTER TABLE self_learning_file ADD COLUMN "relative_path" TEXT DEFAULT ''`, ignoreReason: '已存在 relative_path 列时忽略' },
    { sql: `ALTER TABLE self_learning_file ADD COLUMN "parent_path" TEXT DEFAULT ''`, ignoreReason: '已存在 parent_path 列时忽略' },
    { sql: `ALTER TABLE self_learning_file ADD COLUMN "is_directory" INTEGER DEFAULT 0`, ignoreReason: '已存在 is_directory 列时忽略' },
    'CREATE INDEX IF NOT EXISTS idx_sl_file_parent_path ON self_learning_file(parent_path)',
    'CREATE INDEX IF NOT EXISTS idx_sl_file_lib_parent_created ON self_learning_file(library_id, parent_path, created, file_id)',

    `
      CREATE TABLE IF NOT EXISTS self_learning_task (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        task_id TEXT UNIQUE NOT NULL,
        task_name TEXT,
        task_type TEXT,
        status TEXT DEFAULT 'PENDING',
        progress INTEGER DEFAULT 0,
        scheduled_at INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        error_message TEXT
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_sl_task_task_id ON self_learning_task(task_id)',
    'CREATE INDEX IF NOT EXISTS idx_sl_task_status ON self_learning_task(status)',

    `
      CREATE TABLE IF NOT EXISTS self_learning_builtin_task (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        task_id TEXT UNIQUE NOT NULL,
        task_name TEXT,
        task_type TEXT,
        cron TEXT,
        last_run_at INTEGER,
        next_run_at INTEGER,
        status TEXT DEFAULT 'ENABLED'
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_sl_builtin_task_task_id ON self_learning_builtin_task(task_id)',

    `
      CREATE TABLE IF NOT EXISTS self_learning_result (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        result_id TEXT UNIQUE NOT NULL,
        type TEXT,
        source TEXT,
        content TEXT,
        summary TEXT,
        learned_at INTEGER
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_sl_result_result_id ON self_learning_result(result_id)',
    'CREATE INDEX IF NOT EXISTS idx_sl_result_type ON self_learning_result(type)',

    "UPDATE self_learning_result SET source = 'TAG_MAINTENANCE' WHERE source IN ('connection', 'activation', 'aging', 'orphan')",

    `
      CREATE TABLE IF NOT EXISTS self_learning_result_tag (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        result_id TEXT NOT NULL,
        tag TEXT NOT NULL
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_sl_result_tag_result_id ON self_learning_result_tag(result_id)',
    'CREATE INDEX IF NOT EXISTS idx_sl_result_tag_tag ON self_learning_result_tag(tag)',

    `
      CREATE TABLE IF NOT EXISTS document_annotation (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        library_id TEXT DEFAULT '',
        file_id TEXT NOT NULL,
        selection_text TEXT NOT NULL,
        selection_start INTEGER NOT NULL,
        selection_end INTEGER NOT NULL,
        question TEXT NOT NULL,
        result TEXT NOT NULL,
        llm_id TEXT DEFAULT ''
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_doc_annotation_file_id ON document_annotation(file_id)',

    `
      CREATE TABLE IF NOT EXISTS self_learning_config (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        learning_mode TEXT DEFAULT 'ALL',
        document_auto_enable INTEGER DEFAULT 1,
        conversation_auto_enable INTEGER DEFAULT 1,
        tag_auto_enable INTEGER DEFAULT 1,
        document_random_factor INTEGER DEFAULT 10,
        conversation_random_factor INTEGER DEFAULT 10,
        tag_random_factor INTEGER DEFAULT 10,
        random_factor INTEGER DEFAULT 10,
        document_weight INTEGER DEFAULT 40,
        conversation_weight INTEGER DEFAULT 30,
        tag_maintenance_weight INTEGER DEFAULT 30,
        learning_interval_ms INTEGER DEFAULT 600000,
        default_learning_rate INTEGER DEFAULT 5,
        tag_connection_check_interval_ms INTEGER DEFAULT 1800000,
        tag_aging_cron TEXT DEFAULT '0 0 2 * * *',
        orphan_tag_check_cron TEXT DEFAULT '0 0 3 * * *',
        document_split_threshold INTEGER DEFAULT 5000,
        chunk_overlap_ratio REAL DEFAULT 0.2,
        document_query_prompt_template_id TEXT DEFAULT '',
        document_query_llm_id TEXT DEFAULT ''
      )
    `,
    { sql: `ALTER TABLE self_learning_config ADD COLUMN "learning_mode" TEXT DEFAULT 'ALL'`, ignoreReason: '已存在 learning_mode 列时忽略' },
    { sql: `ALTER TABLE self_learning_config ADD COLUMN "document_auto_enable" INTEGER DEFAULT 1`, ignoreReason: '已存在 document_auto_enable 列时忽略' },
    { sql: `ALTER TABLE self_learning_config ADD COLUMN "conversation_auto_enable" INTEGER DEFAULT 1`, ignoreReason: '已存在 conversation_auto_enable 列时忽略' },
    { sql: `ALTER TABLE self_learning_config ADD COLUMN "tag_auto_enable" INTEGER DEFAULT 1`, ignoreReason: '已存在 tag_auto_enable 列时忽略' },
    { sql: `ALTER TABLE self_learning_config ADD COLUMN "document_random_factor" INTEGER DEFAULT 10`, ignoreReason: '已存在 document_random_factor 列时忽略' },
    { sql: `ALTER TABLE self_learning_config ADD COLUMN "conversation_random_factor" INTEGER DEFAULT 10`, ignoreReason: '已存在 conversation_random_factor 列时忽略' },
    { sql: `ALTER TABLE self_learning_config ADD COLUMN "tag_random_factor" INTEGER DEFAULT 10`, ignoreReason: '已存在 tag_random_factor 列时忽略' },
    { sql: `ALTER TABLE self_learning_config ADD COLUMN "document_query_prompt_template_id" TEXT DEFAULT ''`, ignoreReason: '已存在 document_query_prompt_template_id 列时忽略' },
    { sql: `ALTER TABLE self_learning_config ADD COLUMN "document_query_llm_id" TEXT DEFAULT ''`, ignoreReason: '已存在 document_query_llm_id 列时忽略' },

    { sql: 'CREATE INDEX IF NOT EXISTS idx_chat_session_session_id ON chat_session(session_id)', ignoreReason: 'chat_session 表尚未创建时忽略（Chat 模块负责建表）' },
  ];

  private readonly builtinTaskSeeds: readonly BuiltinTaskSeed[] = [
    { task_id: 'builtin_task_1', task_name: 'Tag Connection Maintenance', task_type: 'TAG_MAINTENANCE_CONNECTION', cron: '0 */30 * * * *' },
    { task_id: 'builtin_task_2', task_name: 'Tag Connection Establishment', task_type: 'TAG_MAINTENANCE_ESTABLISH', cron: '0 */30 * * * *' },
    { task_id: 'builtin_task_3', task_name: 'Tag Aging', task_type: 'TAG_MAINTENANCE_AGING', cron: '0 0 2 * * *' },
  ];

  async init(): Promise<void> {
    this.initDDL();
    await this.seedDefaultConfig();
    await this.seedBuiltinTasks();
  }

  private initDDL(): void {
    for (const ddl of this.ddlStatements) {
      if (typeof ddl === 'string') {
        this.relationDb.executeRaw(ddl);
        continue;
      }
      try {
        this.relationDb.executeRaw(ddl.sql);
      } catch {  }
    }
  }

  private async seedDefaultConfig(): Promise<void> {
    const configCount = await this.relationDb.count('self_learning_config');
    if (configCount === 0) {
      const now = IdGenerator.now();
      await this.relationDb.insert('self_learning_config', [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'learning_mode', value: 'ALL' },
        { field: 'document_auto_enable', value: 1 },
        { field: 'conversation_auto_enable', value: 1 },
        { field: 'tag_auto_enable', value: 1 },
        { field: 'document_random_factor', value: 10 },
        { field: 'conversation_random_factor', value: 10 },
        { field: 'tag_random_factor', value: 10 },
        { field: 'random_factor', value: 10 },
        { field: 'document_weight', value: 40 },
        { field: 'conversation_weight', value: 30 },
        { field: 'tag_maintenance_weight', value: 30 },
        { field: 'learning_interval_ms', value: 600000 },
        { field: 'default_learning_rate', value: 5 },
        { field: 'tag_connection_check_interval_ms', value: 1800000 },
        { field: 'tag_aging_cron', value: '0 0 2 * * *' },
        { field: 'orphan_tag_check_cron', value: '0 0 3 * * *' },
        { field: 'document_split_threshold', value: 5000 },
        { field: 'chunk_overlap_ratio', value: 0.2 },
      ]);
    }
  }

  private async seedBuiltinTasks(): Promise<void> {
    const builtinCount = await this.relationDb.count('self_learning_builtin_task');
    if (builtinCount !== 0) return;
    const now = IdGenerator.now();
    for (const seed of this.builtinTaskSeeds) {
      await this.relationDb.insert('self_learning_builtin_task', [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'task_id', value: seed.task_id },
        { field: 'task_name', value: seed.task_name },
        { field: 'task_type', value: seed.task_type },
        { field: 'cron', value: seed.cron },
        { field: 'status', value: 'ENABLED' },
      ]);
    }
  }
}
