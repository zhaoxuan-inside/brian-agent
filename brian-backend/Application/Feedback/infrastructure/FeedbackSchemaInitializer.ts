import type { RelationDBAccess } from '@brian-agent/base';
import { FEEDBACK_TABLE } from '../domain/types';

export class FeedbackSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${FEEDBACK_TABLE} (
        id TEXT PRIMARY KEY,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        msg_id TEXT NOT NULL,
        work_id TEXT NOT NULL DEFAULT '',
        session_id TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        comment TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending'
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_${FEEDBACK_TABLE}_msg_id ON ${FEEDBACK_TABLE}(msg_id)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_${FEEDBACK_TABLE}_status ON ${FEEDBACK_TABLE}(status)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_${FEEDBACK_TABLE}_created ON ${FEEDBACK_TABLE}(created)`,
    );
  }
}
