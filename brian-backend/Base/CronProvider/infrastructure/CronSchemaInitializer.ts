import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { CRON_TASK_TABLE, CRON_TASK_RUN_TABLE } from '../domain/types';

export class CronSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CRON_TASK_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "name"        TEXT    NOT NULL UNIQUE,
        "description" TEXT    NOT NULL DEFAULT '',
        "cron"        TEXT    NOT NULL,
        "enabled"     INTEGER NOT NULL DEFAULT 1,
        "last_run"    INTEGER NOT NULL DEFAULT 0,
        "next_run"    INTEGER NOT NULL DEFAULT 0,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL
      )
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CRON_TASK_RUN_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "task_id"     TEXT    NOT NULL,
        "task_name"   TEXT    NOT NULL,
        "started_at"  INTEGER NOT NULL,
        "finished_at" INTEGER NOT NULL DEFAULT 0,
        "status"      TEXT    NOT NULL,
        "result"      TEXT    NOT NULL DEFAULT '',
        "error"       TEXT    NOT NULL DEFAULT '',
        "created"     INTEGER NOT NULL
      )
    `);

    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${CRON_TASK_RUN_TABLE}_task_id" ON "${CRON_TASK_RUN_TABLE}" ("task_id")`,
    );
  }
}
