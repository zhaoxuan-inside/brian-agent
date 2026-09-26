import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { VectorDBComponent } from '../../components/VectorDB/VectorDBComponent';
import { VECTORDB_CONFIG_TABLE } from '../domain/types';

export class VectorDBSchemaInitializer {
  

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly vectorDb: VectorDBComponent,
  ) {}

  

  async init(dimension: number, metric: string = 'cosine'): Promise<void> {
    
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${VECTORDB_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);

    
    await this.vectorDb.init(dimension, metric);
  }
}
