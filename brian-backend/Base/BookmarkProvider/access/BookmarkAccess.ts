import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { BookmarkSchemaInitializer } from '../infrastructure/BookmarkSchemaInitializer';
import { BookmarkService } from '../application/BookmarkService';
import type { BookmarkFolderRecord, BookmarkItemRecord, BookmarkFolderNode } from '../domain/types';

export class BookmarkAccess {
  private readonly service: BookmarkService;

  constructor(relationDb: RelationDBAccess, _logger?: unknown) {
    new BookmarkSchemaInitializer(relationDb).init();
    this.service = new BookmarkService(relationDb);
  }

  getTree(): BookmarkFolderNode[] { return this.service.getTree(); }
  getFlatFolders(): BookmarkFolderRecord[] { return this.service.getFlatFolders(); }
  createFolder(name: string, parentId?: string): BookmarkFolderRecord { return this.service.createFolder(name, parentId); }
  createItem(folderId: string, title: string, url: string, favicon?: string): BookmarkItemRecord { return this.service.createItem(folderId, title, url, favicon); }
  updateFolder(id: string, name: string): void { this.service.updateFolder(id, name); }
  updateItem(id: string, title: string, url: string): void { this.service.updateItem(id, title, url); }
  deleteFolder(id: string): void { this.service.deleteFolder(id); }
  deleteItem(id: string): void { this.service.deleteItem(id); }
  moveItem(id: string, targetFolderId: string): void { this.service.moveItem(id, targetFolderId); }
}
