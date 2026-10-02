import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { RUN_STATE_TABLE, TASK_EVENT_TABLE } from '../domain/types';

/** OBS v2：建 task_event_record / run_state_record，并删除 stream_event_record（历史事件不迁移，ADR-013） */
export class TaskEventSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.createTaskEventTable();
    this.createRunStateTable();
    try { this.relationDb.executeRaw(`DROP TABLE IF EXISTS "stream_event_record"`); } catch { /* 容忍 */ }
  }

  private createTaskEventTable(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${TASK_EVENT_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "session_id"   TEXT    NOT NULL,
        "run_id"       TEXT    NOT NULL,
        "work_id"      TEXT    NOT NULL DEFAULT '',
        "seq"          INTEGER NOT NULL,
        "kind"         TEXT    NOT NULL,
        "event_type"   TEXT    NOT NULL,
        "ts"           INTEGER NOT NULL,
        "agent_id"     TEXT    NOT NULL DEFAULT '',
        "round"        INTEGER,
        "span_json"    TEXT    NOT NULL DEFAULT '{}',
        "ref_json"     TEXT    NOT NULL DEFAULT '{}',
        "payload_json" TEXT    NOT NULL DEFAULT '{}'
      )
    `);
    this.relationDb.executeRaw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ux_task_event_run_seq" ON "${TASK_EVENT_TABLE}" ("run_id", "seq")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_task_event_session" ON "${TASK_EVENT_TABLE}" ("session_id", "ts")`,
    );
  }

  private createRunStateTable(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUN_STATE_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "session_id"   TEXT    NOT NULL,
        "work_id"      TEXT    NOT NULL DEFAULT '',
        "phase"        TEXT    NOT NULL DEFAULT 'accepted',
        "round"        INTEGER NOT NULL DEFAULT 0,
        "agent_id"     TEXT    NOT NULL DEFAULT '',
        "llm_id"       TEXT    NOT NULL DEFAULT '',
        "thought_mode" TEXT    NOT NULL DEFAULT '',
        "tokens_in"    INTEGER NOT NULL DEFAULT 0,
        "tokens_out"   INTEGER NOT NULL DEFAULT 0,
        "tool_calls"   INTEGER NOT NULL DEFAULT 0,
        "started_ts"   INTEGER NOT NULL DEFAULT 0,
        "settled_ts"   INTEGER NOT NULL DEFAULT 0,
        "stop_reason"  TEXT    NOT NULL DEFAULT '',
        "error"        TEXT    NOT NULL DEFAULT ''
      )
    `);
  }
}
