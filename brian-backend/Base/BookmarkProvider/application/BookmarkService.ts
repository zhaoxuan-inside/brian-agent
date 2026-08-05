import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../shared/id/IdGenerator';
import { Operator } from '../../shared/query';
import { BOOKMARK_FOLDER_TABLE, BOOKMARK_ITEM_TABLE } from '../domain/types';
import type { BookmarkFolderRecord, BookmarkFolderNode, BookmarkItemRecord } from '../domain/types';

export class BookmarkService {
  constructor(private readonly relationDb: RelationDBAccess) {}

  getTree(): BookmarkFolderNode[] {
    const folders = this.relationDb.queryRaw<BookmarkFolderRecord>(
      `SELECT * FROM "${BOOKMARK_FOLDER_TABLE}" ORDER BY "sort_order", "created"`,
      [],
    );
    const items = this.relationDb.queryRaw<BookmarkItemRecord>(
      `SELECT * FROM "${BOOKMARK_ITEM_TABLE}" ORDER BY "sort_order", "created"`,
      [],
    );

    const itemMap = new Map<string, BookmarkItemRecord[]>();
    for (const item of items) {
      const list = itemMap.get(item.folder_id) || [];
      list.push(item);
      itemMap.set(item.folder_id, list);
    }

    const buildTree = (parentId: string): BookmarkFolderNode[] => {
      return folders
        .filter((f) => f.parent_id === parentId)
        .map((f) => ({
          ...f,
          children: buildTree(f.id),
          items: itemMap.get(f.id) || [],
        }));
    };

    return buildTree('');
  }

  getFlatFolders(): BookmarkFolderRecord[] {
    return this.relationDb.queryRaw<BookmarkFolderRecord>(
      `SELECT * FROM "${BOOKMARK_FOLDER_TABLE}" ORDER BY "name"`,
      [],
    );
  }

  createFolder(name: string, parentId: string = ''): BookmarkFolderRecord {
    const id = IdGenerator.generate();
    const now = IdGenerator.now();
    const nextOrder = this.relationDb.queryRaw<{ c: number }>(
      `SELECT COUNT(*) as c FROM "${BOOKMARK_FOLDER_TABLE}" WHERE "parent_id" = ?`,
      [parentId],
    )[0]?.c || 0;

    this.relationDb.insert(BOOKMARK_FOLDER_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'name', value: name },
      { field: 'parent_id', value: parentId },
      { field: 'sort_order', value: nextOrder },
    ]);
    return { id, created: now, updated: now, name, parent_id: parentId, sort_order: nextOrder };
  }

  createItem(folderId: string, title: string, url: string, favicon = ''): BookmarkItemRecord {
    const id = IdGenerator.generate();
    const now = IdGenerator.now();
    const nextOrder = this.relationDb.queryRaw<{ c: number }>(
      `SELECT COUNT(*) as c FROM "${BOOKMARK_ITEM_TABLE}" WHERE "folder_id" = ?`,
      [folderId],
    )[0]?.c || 0;

    this.relationDb.insert(BOOKMARK_ITEM_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'folder_id', value: folderId },
      { field: 'title', value: title },
      { field: 'url', value: url },
      { field: 'favicon', value: favicon },
      { field: 'sort_order', value: nextOrder },
    ]);
    return { id, created: now, updated: now, folder_id: folderId, title, url, favicon, sort_order: nextOrder };
  }

  updateFolder(id: string, name: string): void {
    this.relationDb.update(
      BOOKMARK_FOLDER_TABLE,
      [
        { field: 'updated', value: IdGenerator.now() },
        { field: 'name', value: name },
      ],
      [{ field: 'id', operator: Operator.EQ, value: id }],
    );
  }

  updateItem(id: string, title: string, url: string): void {
    this.relationDb.update(
      BOOKMARK_ITEM_TABLE,
      [
        { field: 'updated', value: IdGenerator.now() },
        { field: 'title', value: title },
        { field: 'url', value: url },
      ],
      [{ field: 'id', operator: Operator.EQ, value: id }],
    );
  }

  deleteFolder(id: string): void {
    const childFolders = this.relationDb.queryRaw<BookmarkFolderRecord>(
      `SELECT "id" FROM "${BOOKMARK_FOLDER_TABLE}" WHERE "parent_id" = ?`,
      [id],
    );
    for (const f of childFolders) this.deleteFolder(f.id);

    this.relationDb.delete(BOOKMARK_ITEM_TABLE, [
      { field: 'folder_id', operator: Operator.EQ, value: id },
    ]);
    this.relationDb.delete(BOOKMARK_FOLDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: id },
    ]);
  }

  deleteItem(id: string): void {
    this.relationDb.delete(BOOKMARK_ITEM_TABLE, [
      { field: 'id', operator: Operator.EQ, value: id },
    ]);
  }

  moveItem(id: string, targetFolderId: string): void {
    const nextOrder = this.relationDb.queryRaw<{ c: number }>(
      `SELECT COUNT(*) as c FROM "${BOOKMARK_ITEM_TABLE}" WHERE "folder_id" = ?`,
      [targetFolderId],
    )[0]?.c || 0;
    this.relationDb.update(
      BOOKMARK_ITEM_TABLE,
      [
        { field: 'updated', value: IdGenerator.now() },
        { field: 'folder_id', value: targetFolderId },
        { field: 'sort_order', value: nextOrder },
      ],
      [{ field: 'id', operator: Operator.EQ, value: id }],
    );
  }
}
