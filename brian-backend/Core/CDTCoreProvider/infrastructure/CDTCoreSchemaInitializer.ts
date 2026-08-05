/**
 * @fileoverview CDTCoreProvider 表结构初始化。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import { CDT_PAGE_SESSION_TABLE, CDT_LOGIN_CREDENTIAL_TABLE } from '../domain/types';

export class CDTCoreSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CDT_PAGE_SESSION_TABLE}" (
        "id"                 TEXT    NOT NULL PRIMARY KEY,
        "created"            INTEGER NOT NULL,
        "updated"            INTEGER NOT NULL,
        "session_name"       TEXT    NOT NULL,
        "cookies_json"       TEXT    NOT NULL DEFAULT '[]',
        "local_storage_json" TEXT    NOT NULL DEFAULT '{}',
        "last_url"           TEXT    NOT NULL DEFAULT '',
        "last_access_time"   INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${CDT_PAGE_SESSION_TABLE}_session_name" ON "${CDT_PAGE_SESSION_TABLE}" ("session_name")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CDT_LOGIN_CREDENTIAL_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "domain"              TEXT    NOT NULL,
        "login_url"           TEXT    NOT NULL,
        "username_field"      TEXT    NOT NULL DEFAULT '',
        "password_field"      TEXT    NOT NULL DEFAULT '',
        "submit_selector"     TEXT    NOT NULL DEFAULT '',
        "logged_in_indicator" TEXT    NOT NULL DEFAULT '',
        "captcha_selector"    TEXT    NOT NULL DEFAULT '',
        "username"            TEXT    NOT NULL DEFAULT '',
        "password"            TEXT    NOT NULL DEFAULT '',
        "cookies_json"        TEXT    NOT NULL DEFAULT '[]',
        "session_id"          TEXT    NOT NULL DEFAULT '',
        "last_login_time"     INTEGER NOT NULL DEFAULT 0,
        "login_success"       INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${CDT_LOGIN_CREDENTIAL_TABLE}_domain" ON "${CDT_LOGIN_CREDENTIAL_TABLE}" ("domain")`,
    );
  }
}
