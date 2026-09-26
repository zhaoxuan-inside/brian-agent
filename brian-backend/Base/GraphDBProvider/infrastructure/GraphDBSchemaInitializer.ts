import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { GRAPHDB_CONFIG_TABLE } from '../domain/types';

export class GraphDBSchemaInitializer {
  constructor(
    private readonly relationDb: RelationDBAccess,
  ) {}

  

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${GRAPHDB_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
