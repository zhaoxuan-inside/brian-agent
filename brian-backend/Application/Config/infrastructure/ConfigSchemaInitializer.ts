import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  CONFIG_REGISTRY_TABLE,
  CONFIG_LAYER_PRIVILEGE_TABLE,
  CONFIG_MODULE_PRIVILEGE_TABLE,
  CONFIG_CONFIG_TABLE,
  CONFIG_SNAPSHOT_TABLE,
  CONFIG_HISTORY_TABLE,
  VALID_LAYERS,
} from '../domain/types';

export class ConfigSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  /** ADR-012: config 中心六表改名(幂等,独立初始化路径兜底) */
  private migrateLegacyTableNames(): void {
    const renames: Array<[string, string]> = [
      ['config_registry', CONFIG_REGISTRY_TABLE],
      ['config_config', CONFIG_CONFIG_TABLE],
      ['config_layer_privilege', CONFIG_LAYER_PRIVILEGE_TABLE],
      ['config_module_privilege', CONFIG_MODULE_PRIVILEGE_TABLE],
      ['config_snapshot', CONFIG_SNAPSHOT_TABLE],
      ['config_history', CONFIG_HISTORY_TABLE],
    ];
    for (const [oldName, newName] of renames) {
      try {
        this.relationDb.executeRaw(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
      } catch { /* 旧表不存在或已改名 */ }
    }
  }

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CONFIG_REGISTRY_TABLE}" (
        "id"                 TEXT    NOT NULL PRIMARY KEY,
        "created"            INTEGER NOT NULL,
        "updated"            INTEGER NOT NULL,
        "config_key"         TEXT    UNIQUE,
        "layer"              TEXT,
        "module"             TEXT,
        "category"           TEXT,
        "config_name"        TEXT,
        "config_description" TEXT,
        "config_type"        TEXT,
        "config_default"     TEXT,
        "config_enum_values" TEXT,
        "config_value"       TEXT,
        "readable"           INTEGER DEFAULT 1,
        "writable"           INTEGER DEFAULT 1
      )
    `);

    try { this.relationDb.executeRaw(`ALTER TABLE "${CONFIG_REGISTRY_TABLE}" ADD COLUMN "config_value" TEXT`); } catch {  }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CONFIG_LAYER_PRIVILEGE_TABLE}" (
        "id"       TEXT    NOT NULL PRIMARY KEY,
        "created"  INTEGER NOT NULL,
        "updated"  INTEGER NOT NULL,
        "layer"    TEXT    UNIQUE,
        "readable" INTEGER DEFAULT 1,
        "writable" INTEGER DEFAULT 1
      )
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CONFIG_MODULE_PRIVILEGE_TABLE}" (
        "id"       TEXT    NOT NULL PRIMARY KEY,
        "created"  INTEGER NOT NULL,
        "updated"  INTEGER NOT NULL,
        "module"   TEXT    UNIQUE,
        "layer"    TEXT,
        "readable" INTEGER DEFAULT 1,
        "writable" INTEGER DEFAULT 1
      )
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CONFIG_CONFIG_TABLE}" (
        "id"                TEXT    NOT NULL PRIMARY KEY,
        "created"           INTEGER NOT NULL,
        "updated"           INTEGER NOT NULL,
        "default_readable"  INTEGER DEFAULT 1,
        "default_writable"  INTEGER DEFAULT 1
      )
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CONFIG_SNAPSHOT_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "name"          TEXT    NOT NULL,
        "snapshot_data" TEXT    NOT NULL
      )
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CONFIG_HISTORY_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "config_key"  TEXT    NOT NULL,
        "old_value"   TEXT,
        "new_value"   TEXT,
        "change_time" INTEGER NOT NULL,
        "operator"    TEXT
      )
    `);

    this.ensureDefaults();
  }

  private ensureDefaults(): void {
    const now = IdGenerator.now();

    for (const layer of VALID_LAYERS) {
      const existing = this.relationDb.queryRaw<{ id: string }>(
        `SELECT "id" FROM "${CONFIG_LAYER_PRIVILEGE_TABLE}" WHERE "layer" = ?`,
        [layer],
      );
      if (existing.length === 0) {
        this.relationDb.executeRaw(
          `INSERT INTO "${CONFIG_LAYER_PRIVILEGE_TABLE}" ("id", "created", "updated", "layer", "readable", "writable") VALUES (?, ?, ?, ?, 1, 1)`,
          [IdGenerator.generate(), now, now, layer],
        );
      }
    }

    const existingConfig = this.relationDb.queryRaw<{ id: string }>(
      `SELECT "id" FROM "${CONFIG_CONFIG_TABLE}" LIMIT 1`,
    );
    if (existingConfig.length === 0) {
      this.relationDb.executeRaw(
        `INSERT INTO "${CONFIG_CONFIG_TABLE}" ("id", "created", "updated", "default_readable", "default_writable") VALUES (?, ?, ?, 1, 1)`,
        [IdGenerator.generate(), now, now],
      );
    }
  }
}
