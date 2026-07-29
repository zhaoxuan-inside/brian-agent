import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { WRITER_AGENT_CONFIG_TABLE, WRITER_AGENT_USER_PROFILE_TABLE } from '../domain/types';

export class WriterAgentSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${WRITER_AGENT_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        write_prompt_template_id TEXT NOT NULL,
        default_language TEXT NOT NULL DEFAULT 'zh-CN',
        default_style TEXT NOT NULL DEFAULT 'clear',
        default_depth TEXT NOT NULL DEFAULT 'medium',
        default_format TEXT NOT NULL DEFAULT 'MARKDOWN'
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${WRITER_AGENT_USER_PROFILE_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        session_id TEXT NOT NULL UNIQUE,
        language TEXT NOT NULL DEFAULT 'zh-CN',
        style TEXT NOT NULL DEFAULT 'clear',
        depth TEXT NOT NULL DEFAULT 'medium',
        format TEXT NOT NULL DEFAULT 'MARKDOWN',
        additional_preferences TEXT
      )`,
    );
    const count = await this.relationDb.count(WRITER_AGENT_CONFIG_TABLE);
    if (count > 0) return;
    const now = IdGenerator.now();
    await this.relationDb.insert(WRITER_AGENT_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'write_prompt_template_id', value: '' },
      { field: 'default_language', value: 'zh-CN' },
      { field: 'default_style', value: 'clear' },
      { field: 'default_depth', value: 'medium' },
      { field: 'default_format', value: 'MARKDOWN' },
    ]);
  }
}
