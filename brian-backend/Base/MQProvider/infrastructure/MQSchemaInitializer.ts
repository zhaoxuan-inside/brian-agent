import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { QUEUE_MESSAGE_TABLE, MQ_CONFIG_TABLE } from '../domain/types';

export class MQSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${QUEUE_MESSAGE_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "queue"        TEXT    NOT NULL,
        "payload"      TEXT    NOT NULL,
        "priority"     INTEGER NOT NULL DEFAULT 5,
        "status"       TEXT    NOT NULL,
        "retry_count"  INTEGER NOT NULL DEFAULT 0,
        "max_retries"  INTEGER NOT NULL DEFAULT 3,
        "processed_at" INTEGER
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${QUEUE_MESSAGE_TABLE}_created" ON "${QUEUE_MESSAGE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${QUEUE_MESSAGE_TABLE}_updated" ON "${QUEUE_MESSAGE_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${QUEUE_MESSAGE_TABLE}_queue" ON "${QUEUE_MESSAGE_TABLE}" ("queue")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${QUEUE_MESSAGE_TABLE}_status" ON "${QUEUE_MESSAGE_TABLE}" ("status")`,
    );

    try { this.relationDb.executeRaw(`ALTER TABLE "${QUEUE_MESSAGE_TABLE}" ADD COLUMN "next_retry_at" INTEGER`); } catch {  }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${MQ_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
