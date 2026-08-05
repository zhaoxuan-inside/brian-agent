/**
 * @fileoverview CDTProvider 表结构初始化。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { CDT_CONFIG_TABLE } from '../domain/types';

export class CDTSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${CDT_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${CDT_CONFIG_TABLE}_updated" ON "${CDT_CONFIG_TABLE}" ("updated")`,
    );
  }
}
