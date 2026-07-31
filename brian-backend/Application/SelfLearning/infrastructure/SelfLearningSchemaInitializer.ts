import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';

export class SelfLearningSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS chat_session (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        session_id TEXT UNIQUE NOT NULL,
        session_name TEXT,
        is_active INTEGER DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_chat_session_session_id ON chat_session(session_id)',
    );

    this.relationDb.executeRaw(`
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
    `);
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_library_library_id ON self_learning_library(library_id)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS self_learning_file (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        library_id TEXT NOT NULL,
        file_id TEXT UNIQUE NOT NULL,
        file_name TEXT,
        file_path TEXT,
        file_size INTEGER,
        status TEXT DEFAULT 'PENDING',
        error_message TEXT,
        learned_at INTEGER
      )
    `);
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_file_library_id ON self_learning_file(library_id)',
    );
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_file_file_id ON self_learning_file(file_id)',
    );
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_file_status ON self_learning_file(status)',
    );

    this.relationDb.executeRaw(`
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
    `);
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_task_task_id ON self_learning_task(task_id)',
    );
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_task_status ON self_learning_task(status)',
    );

    this.relationDb.executeRaw(`
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
    `);
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_builtin_task_task_id ON self_learning_builtin_task(task_id)',
    );

    this.relationDb.executeRaw(`
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
    `);
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_result_result_id ON self_learning_result(result_id)',
    );
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_result_type ON self_learning_result(type)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS self_learning_result_tag (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        result_id TEXT NOT NULL,
        tag TEXT NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_result_tag_result_id ON self_learning_result_tag(result_id)',
    );
    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_sl_result_tag_tag ON self_learning_result_tag(tag)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS self_learning_config (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        random_factor INTEGER DEFAULT 10,
        document_weight INTEGER DEFAULT 40,
        conversation_weight INTEGER DEFAULT 30,
        tag_maintenance_weight INTEGER DEFAULT 30,
        learning_interval_ms INTEGER DEFAULT 600000,
        default_learning_rate INTEGER DEFAULT 5,
        tag_connection_check_interval_ms INTEGER DEFAULT 1800000,
        tag_aging_cron TEXT DEFAULT '0 0 2 * * *',
        orphan_tag_check_cron TEXT DEFAULT '0 0 3 * * *',
        document_split_threshold INTEGER DEFAULT 5000
      )
    `);

    const configCount = await this.relationDb.count('self_learning_config');
    if (configCount === 0) {
      const now = IdGenerator.now();
      await this.relationDb.insert('self_learning_config', [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
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
      ]);
    }

    const builtinCount = await this.relationDb.count('self_learning_builtin_task');
    if (builtinCount === 0) {
      const now = IdGenerator.now();
      const tasks = [
        {
          id: IdGenerator.generate(),
          task_id: 'builtin_task_1',
          task_name: 'Tag Connection Maintenance',
          task_type: 'TAG_MAINTENANCE_CONNECTION',
          cron: '0 */30 * * * *',
        },
        {
          id: IdGenerator.generate(),
          task_id: 'builtin_task_2',
          task_name: 'Tag Connection Establishment',
          task_type: 'TAG_MAINTENANCE_ESTABLISH',
          cron: '0 */30 * * * *',
        },
        {
          id: IdGenerator.generate(),
          task_id: 'builtin_task_3',
          task_name: 'Tag Aging',
          task_type: 'TAG_MAINTENANCE_AGING',
          cron: '0 0 2 * * *',
        },
      ];

      for (const task of tasks) {
        await this.relationDb.insert('self_learning_builtin_task', [
          { field: 'id', value: task.id },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'task_id', value: task.task_id },
          { field: 'task_name', value: task.task_name },
          { field: 'task_type', value: task.task_type },
          { field: 'cron', value: task.cron },
          { field: 'status', value: 'ENABLED' },
        ]);
      }
    }
  }
}
