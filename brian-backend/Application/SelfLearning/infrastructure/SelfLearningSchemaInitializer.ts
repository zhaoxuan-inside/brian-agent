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
        library_name TEXT,
        library_path TEXT NOT NULL,
        enable_self_learning INTEGER DEFAULT 1,
        learning_rate INTEGER DEFAULT 5
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_sl_library_id ON self_learning_library(id)',
    { sql: `ALTER TABLE self_learning_library ADD COLUMN "category" TEXT DEFAULT ''`, ignoreReason: '已存在 category 列时忽略' },
    { sql: `ALTER TABLE self_learning_library ADD COLUMN "description" TEXT DEFAULT ''`, ignoreReason: '已存在 description 列时忽略' },

    `
      CREATE TABLE IF NOT EXISTS self_learning_file (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        library_id TEXT NOT NULL,
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
    'CREATE INDEX IF NOT EXISTS idx_sl_file_id ON self_learning_file(id)',
    'CREATE INDEX IF NOT EXISTS idx_sl_file_status ON self_learning_file(status)',
    { sql: `ALTER TABLE self_learning_file ADD COLUMN "relative_path" TEXT DEFAULT ''`, ignoreReason: '已存在 relative_path 列时忽略' },
    { sql: `ALTER TABLE self_learning_file ADD COLUMN "parent_path" TEXT DEFAULT ''`, ignoreReason: '已存在 parent_path 列时忽略' },
    { sql: `ALTER TABLE self_learning_file ADD COLUMN "is_directory" INTEGER DEFAULT 0`, ignoreReason: '已存在 is_directory 列时忽略' },
    'CREATE INDEX IF NOT EXISTS idx_sl_file_parent_path ON self_learning_file(parent_path)',
    'CREATE INDEX IF NOT EXISTS idx_sl_file_lib_parent_created ON self_learning_file(library_id, parent_path, created, id)',

    `
      CREATE TABLE IF NOT EXISTS self_learning_task (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        task_name TEXT,
        task_type TEXT,
        source TEXT NOT NULL DEFAULT 'generated',
        cron TEXT,
        last_run_at INTEGER,
        next_run_at INTEGER,
        status TEXT DEFAULT 'PENDING',
        progress INTEGER DEFAULT 0,
        scheduled_at INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        error_message TEXT
      )
    `,
    // 旧库补 builtin 合并列(source/cron):必须先于 seedBuiltinTasks 的 count/insert
    { sql: `ALTER TABLE self_learning_task ADD COLUMN source TEXT NOT NULL DEFAULT 'generated'`, ignoreReason: '已存在 source 列时忽略' },
    { sql: `ALTER TABLE self_learning_task ADD COLUMN cron TEXT`, ignoreReason: '已存在 cron 列时忽略' },
    'CREATE INDEX IF NOT EXISTS idx_sl_task_id ON self_learning_task(id)',
    'CREATE INDEX IF NOT EXISTS idx_sl_task_status ON self_learning_task(status)',

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
      CREATE TABLE IF NOT EXISTS self_learning_config_record (
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
    { sql: `ALTER TABLE self_learning_config_record ADD COLUMN "learning_mode" TEXT DEFAULT 'ALL'`, ignoreReason: '已存在 learning_mode 列时忽略' },
    { sql: `ALTER TABLE self_learning_config_record ADD COLUMN "document_auto_enable" INTEGER DEFAULT 1`, ignoreReason: '已存在 document_auto_enable 列时忽略' },
    { sql: `ALTER TABLE self_learning_config_record ADD COLUMN "conversation_auto_enable" INTEGER DEFAULT 1`, ignoreReason: '已存在 conversation_auto_enable 列时忽略' },
    { sql: `ALTER TABLE self_learning_config_record ADD COLUMN "tag_auto_enable" INTEGER DEFAULT 1`, ignoreReason: '已存在 tag_auto_enable 列时忽略' },
    { sql: `ALTER TABLE self_learning_config_record ADD COLUMN "document_random_factor" INTEGER DEFAULT 10`, ignoreReason: '已存在 document_random_factor 列时忽略' },
    { sql: `ALTER TABLE self_learning_config_record ADD COLUMN "conversation_random_factor" INTEGER DEFAULT 10`, ignoreReason: '已存在 conversation_random_factor 列时忽略' },
    { sql: `ALTER TABLE self_learning_config_record ADD COLUMN "tag_random_factor" INTEGER DEFAULT 10`, ignoreReason: '已存在 tag_random_factor 列时忽略' },
    { sql: `ALTER TABLE self_learning_config_record ADD COLUMN "document_query_prompt_template_id" TEXT DEFAULT ''`, ignoreReason: '已存在 document_query_prompt_template_id 列时忽略' },
    { sql: `ALTER TABLE self_learning_config_record ADD COLUMN "document_query_llm_id" TEXT DEFAULT ''`, ignoreReason: '已存在 document_query_llm_id 列时忽略' },

    { sql: 'CREATE INDEX IF NOT EXISTS idx_chat_session_session_id ON chat_session(session_id)', ignoreReason: 'chat_session 表尚未创建时忽略（Chat 模块负责建表）' },
  ];

  private readonly builtinTaskSeeds: readonly BuiltinTaskSeed[] = [
    { task_id: 'builtin_task_1', task_name: 'Tag Connection Maintenance', task_type: 'TAG_MAINTENANCE_CONNECTION', cron: '0 */30 * * * *' },
    { task_id: 'builtin_task_2', task_name: 'Tag Connection Establishment', task_type: 'TAG_MAINTENANCE_ESTABLISH', cron: '0 */30 * * * *' },
    { task_id: 'builtin_task_3', task_name: 'Tag Aging', task_type: 'TAG_MAINTENANCE_AGING', cron: '0 0 2 * * *' },
  ];

  async init(): Promise<void> {
    this.initDDL();
    this.migrateLegacyBusinessKeys();
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
    const configCount = await this.relationDb.count('self_learning_config_record');
    if (configCount === 0) {
      const now = IdGenerator.now();
      await this.relationDb.insert('self_learning_config_record', [
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

  /** ADR-012:builtin 任务并入 self_learning_task(以 source='builtin' 区分),原独立表退役 */
  private async seedBuiltinTasks(): Promise<void> {
    const builtinCount = await this.relationDb.count('self_learning_task', [
      { field: 'source', operator: '=', value: 'builtin' },
    ]);
    if (builtinCount !== 0) return;
    const now = IdGenerator.now();
    for (const seed of this.builtinTaskSeeds) {
      await this.relationDb.insert('self_learning_task', [
        { field: 'id', value: seed.task_id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'task_name', value: seed.task_name },
        { field: 'task_type', value: seed.task_type },
        { field: 'source', value: 'builtin' },
        { field: 'cron', value: seed.cron },
        { field: 'status', value: 'ENABLED' },
      ]);
    }
  }


  /** ADR-012:去 library_id/file_id/task_id 冗余业务键,id 统一承接(幂等) */
  private migrateLegacyBusinessKeys(): void {
    // ADR-012: 业务键(library_id/file_id/task_id)为 UNIQUE NOT NULL,SQLite 禁止 DROP COLUMN——整表重建
    try { this.relationDb.executeRaw(`UPDATE "self_learning_library" SET "id" = "library_id" WHERE "id" != "library_id"`); } catch {  }
    this.rebuildIfLegacyKeys('self_learning_library', 'library_id',
      `id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, library_name TEXT, library_path TEXT NOT NULL, enable_self_learning INTEGER DEFAULT 1, learning_rate INTEGER DEFAULT 5, category TEXT DEFAULT '', description TEXT DEFAULT ''`,
      `id, created, updated, library_name, library_path, enable_self_learning, learning_rate, category, description`,
      [`CREATE INDEX IF NOT EXISTS idx_sl_library_id ON self_learning_library(id)`]);
    try { this.relationDb.executeRaw(`UPDATE "self_learning_file" SET "id" = "file_id" WHERE "id" != "file_id"`); } catch {  }
    this.rebuildIfLegacyKeys('self_learning_file', 'file_id',
      `id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, library_id TEXT NOT NULL, file_name TEXT, file_path TEXT, relative_path TEXT DEFAULT '', parent_path TEXT DEFAULT '', is_directory INTEGER DEFAULT 0, file_size INTEGER, status TEXT DEFAULT 'PENDING', error_message TEXT, learned_at INTEGER`,
      `id, created, updated, library_id, file_name, file_path, relative_path, parent_path, is_directory, file_size, status, error_message, learned_at`,
      [`CREATE INDEX IF NOT EXISTS idx_sl_file_library_id ON self_learning_file(library_id)`,
       `CREATE INDEX IF NOT EXISTS idx_sl_file_id ON self_learning_file(id)`,
       `CREATE INDEX IF NOT EXISTS idx_sl_file_status ON self_learning_file(status)`,
       `CREATE INDEX IF NOT EXISTS idx_sl_file_parent_path ON self_learning_file(parent_path)`,
       `CREATE INDEX IF NOT EXISTS idx_sl_file_lib_parent_created ON self_learning_file(library_id, parent_path, created, id)`]);
    try { this.relationDb.executeRaw(`UPDATE "self_learning_task" SET "id" = "task_id" WHERE "id" != "task_id"`); } catch {  }
    this.rebuildIfLegacyKeys('self_learning_task', 'task_id',
      `id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, task_name TEXT, task_type TEXT, source TEXT NOT NULL DEFAULT 'generated', cron TEXT, last_run_at INTEGER, next_run_at INTEGER, status TEXT DEFAULT 'PENDING', progress INTEGER DEFAULT 0, scheduled_at INTEGER, started_at INTEGER, completed_at INTEGER, error_message TEXT`,
      `id, created, updated, task_name, task_type, source, cron, last_run_at, next_run_at, status, progress, scheduled_at, started_at, completed_at, error_message`,
      [`CREATE INDEX IF NOT EXISTS idx_sl_task_id ON self_learning_task(id)`,
       `CREATE INDEX IF NOT EXISTS idx_sl_task_status ON self_learning_task(status)`]);
    // builtin 任务并入 self_learning_task(source='builtin')
    try {
      this.relationDb.executeRaw(`INSERT OR IGNORE INTO "self_learning_task" ("id","created","updated","task_name","task_type","source","cron","status")
        SELECT "id","created","updated","task_name","task_type",'builtin',"cron","status" FROM "self_learning_builtin_task"`);
      this.relationDb.executeRaw(`DROP TABLE IF EXISTS "self_learning_builtin_task"`);
    } catch {  }
  }

  /** 旧表含 UNIQUE NOT NULL 业务键时整表重建到 targetDdl;失败静默保留旧表(现状行为) */
  private rebuildIfLegacyKeys(table: string, legacyKey: string, targetDdl: string, columns: string, indexes: string[]): void {
    let cols: string[];
    try {
      cols = this.relationDb.queryRaw<{ name: string }>(`PRAGMA table_info("${table}")`).map(c => c.name);
    } catch { return; }
    if (!cols.includes(legacyKey)) return;
    try {
      this.relationDb.executeRaw(`CREATE TABLE "${table}_mig" (${targetDdl})`);
      const keep = columns.split(', ').filter(c => cols.includes(c));
      this.relationDb.executeRaw(`INSERT INTO "${table}_mig" (${keep.join(', ')}) SELECT ${keep.join(', ')} FROM "${table}"`);
      this.relationDb.executeRaw(`DROP TABLE "${table}"`);
      this.relationDb.executeRaw(`ALTER TABLE "${table}_mig" RENAME TO "${table}"`);
      for (const idx of indexes) this.relationDb.executeRaw(idx);
    } catch { try { this.relationDb.executeRaw(`DROP TABLE IF EXISTS "${table}_mig"`); } catch {  } }
  }
}
