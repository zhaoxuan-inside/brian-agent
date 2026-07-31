/**
 * @fileoverview Config 表结构初始化。
 *
 * 创建 config_registry、config_layer_privilege、config_module_privilege、
 * config_config 四张表并写入默认数据。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  CONFIG_REGISTRY_TABLE,
  CONFIG_LAYER_PRIVILEGE_TABLE,
  CONFIG_MODULE_PRIVILEGE_TABLE,
  CONFIG_CONFIG_TABLE,
  VALID_LAYERS,
} from '../domain/types';

export class ConfigSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

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
        "readable"           INTEGER DEFAULT 1,
        "writable"           INTEGER DEFAULT 1
      )
    `);

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
