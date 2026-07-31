import type { RelationDBAccess } from '@brian-agent/base';

export class ChatSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS chat_session (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        session_id TEXT NOT NULL UNIQUE,
        session_title TEXT NOT NULL DEFAULT '新会话'
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_chat_session_session_id ON chat_session(session_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_chat_session_created ON chat_session(created)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_chat_session_updated ON chat_session(updated)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS chat_config (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        max_messages_per_session INTEGER NOT NULL DEFAULT 1000,
        sse_heartbeat_interval_ms INTEGER NOT NULL DEFAULT 30000,
        default_history_lastN INTEGER NOT NULL DEFAULT 50
      )
    `);

    const now = Date.now();
    this.relationDb.executeRaw(`
      INSERT OR IGNORE INTO chat_config
        (id, created, updated, max_messages_per_session, sse_heartbeat_interval_ms, default_history_lastN)
      VALUES
        ('chat_config_default', ${now}, ${now}, 1000, 30000, 50)
    `);
  }
}
