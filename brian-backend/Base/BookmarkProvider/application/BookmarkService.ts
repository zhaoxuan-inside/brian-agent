import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator } from '../../shared/query';
import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import { BOOKMARK_FOLDER_TABLE, BOOKMARK_ITEM_TABLE } from '../domain/types';
import type { BookmarkFolderRecord, BookmarkFolderNode, BookmarkItemRecord } from '../domain/types';
import type {
  SoTreeInput, SoTreeOutput,
  SoFlatFoldersInput, SoFlatFoldersOutput,
  AddFolderInput, AddFolderOutput,
  AddItemInput, AddItemOutput,
  UpdateFolderInput, UpdateFolderOutput,
  UpdateItemInput, UpdateItemOutput,
  MoveItemInput, MoveItemOutput,
  BookmarkContext,
} from '../domain/types';
import { DelFolderInput, DelFolderOutput, DelItemInput, DelItemOutput } from '../domain/types';

export class BookmarkService {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async soTree(_input: SoTreeInput, output: SoTreeOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
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

    output.tree = buildTree('');
    return true;
  }

  async soFlatFolders(_input: SoFlatFoldersInput, output: SoFlatFoldersOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.folders = this.relationDb.queryRaw<BookmarkFolderRecord>(
      `SELECT * FROM "${BOOKMARK_FOLDER_TABLE}" ORDER BY "name"`,
      [],
    );
    return true;
  }

  async addFolder(input: AddFolderInput, output: AddFolderOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    const name = input.name;
    const parentId = input.parent_id || '';
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
    output.folder = { id, created: now, updated: now, name, parent_id: parentId, sort_order: nextOrder };
    return true;
  }

  async addItem(input: AddItemInput, output: AddItemOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    const folderId = input.folder_id;
    const title = input.title;
    const url = input.url;
    const favicon = input.favicon || '';
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
    output.item = { id, created: now, updated: now, folder_id: folderId, title, url, favicon, sort_order: nextOrder };
    return true;
  }

  async updateFolder(input: UpdateFolderInput, _output: UpdateFolderOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    this.relationDb.update(
      BOOKMARK_FOLDER_TABLE,
      [
        { field: 'updated', value: IdGenerator.now() },
        { field: 'name', value: input.name },
      ],
      [{ field: 'id', operator: Operator.EQ, value: input.id }],
    );
    return true;
  }

  async updateItem(input: UpdateItemInput, _output: UpdateItemOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    this.relationDb.update(
      BOOKMARK_ITEM_TABLE,
      [
        { field: 'updated', value: IdGenerator.now() },
        { field: 'title', value: input.title },
        { field: 'url', value: input.url },
      ],
      [{ field: 'id', operator: Operator.EQ, value: input.id }],
    );
    return true;
  }

  async delFolder(input: DelFolderInput, _output: DelFolderOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    const childFolders = this.relationDb.queryRaw<BookmarkFolderRecord>(
      `SELECT "id" FROM "${BOOKMARK_FOLDER_TABLE}" WHERE "parent_id" = ?`,
      [input.id],
    );
    for (const f of childFolders) {
      await this.delFolder(
        Object.assign(new DelFolderInput(), { id: f.id }),
        new DelFolderOutput(),
        context, metrics, report,
      );
    }

    this.relationDb.delete(BOOKMARK_ITEM_TABLE, [
      { field: 'folder_id', operator: Operator.EQ, value: input.id },
    ]);
    this.relationDb.delete(BOOKMARK_FOLDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    return true;
  }

  async delItem(input: DelItemInput, _output: DelItemOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    this.relationDb.delete(BOOKMARK_ITEM_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    return true;
  }

  async moveItem(input: MoveItemInput, _output: MoveItemOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    const nextOrder = this.relationDb.queryRaw<{ c: number }>(
      `SELECT COUNT(*) as c FROM "${BOOKMARK_ITEM_TABLE}" WHERE "folder_id" = ?`,
      [input.target_folder_id],
    )[0]?.c || 0;
    this.relationDb.update(
      BOOKMARK_ITEM_TABLE,
      [
        { field: 'updated', value: IdGenerator.now() },
        { field: 'folder_id', value: input.target_folder_id },
        { field: 'sort_order', value: nextOrder },
      ],
      [{ field: 'id', operator: Operator.EQ, value: input.id }],
    );
    return true;
  }
}
