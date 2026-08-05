import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { BOOKMARK_FOLDER_TABLE, BOOKMARK_ITEM_TABLE } from '../domain/types';

export class BookmarkSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${BOOKMARK_FOLDER_TABLE}" (
        "id"         TEXT    NOT NULL PRIMARY KEY,
        "created"    INTEGER NOT NULL,
        "updated"    INTEGER NOT NULL,
        "name"       TEXT    NOT NULL,
        "parent_id"  TEXT    NOT NULL DEFAULT '',
        "sort_order" INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${BOOKMARK_FOLDER_TABLE}_parent" ON "${BOOKMARK_FOLDER_TABLE}" ("parent_id")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${BOOKMARK_ITEM_TABLE}" (
        "id"         TEXT    NOT NULL PRIMARY KEY,
        "created"    INTEGER NOT NULL,
        "updated"    INTEGER NOT NULL,
        "folder_id"  TEXT    NOT NULL,
        "title"      TEXT    NOT NULL,
        "url"        TEXT    NOT NULL,
        "favicon"    TEXT    NOT NULL DEFAULT '',
        "sort_order" INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${BOOKMARK_ITEM_TABLE}_folder" ON "${BOOKMARK_ITEM_TABLE}" ("folder_id")`,
    );
  }
}
