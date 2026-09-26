import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { BookmarkSchemaInitializer } from '../infrastructure/BookmarkSchemaInitializer';
import { BookmarkService } from '../application/BookmarkService';
import { AopProxy } from '../../shared/aop/AopProxy';
import {
  SoTreeInput, SoTreeOutput,
  SoFlatFoldersInput, SoFlatFoldersOutput,
  AddFolderInput, AddFolderOutput,
  AddItemInput, AddItemOutput,
  UpdateFolderInput, UpdateFolderOutput,
  UpdateItemInput, UpdateItemOutput,
  DelFolderInput, DelFolderOutput,
  DelItemInput, DelItemOutput,
  MoveItemInput, MoveItemOutput,
  BookmarkContext,
} from '../domain/types';
import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';

export class BookmarkAccess {
  private readonly service: BookmarkService;

  constructor(relationDb: RelationDBAccess, _logger?: unknown) {
    new BookmarkSchemaInitializer(relationDb).init();
    this.service = AopProxy.wrap(new BookmarkService(relationDb));
  }

  async soTree(input: SoTreeInput, output: SoTreeOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.soTree(input, output, context, metrics, report);
  }

  async soFlatFolders(input: SoFlatFoldersInput, output: SoFlatFoldersOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.soFlatFolders(input, output, context, metrics, report);
  }

  async addFolder(input: AddFolderInput, output: AddFolderOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.addFolder(input, output, context, metrics, report);
  }

  async addItem(input: AddItemInput, output: AddItemOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.addItem(input, output, context, metrics, report);
  }

  async updateFolder(input: UpdateFolderInput, output: UpdateFolderOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updateFolder(input, output, context, metrics, report);
  }

  async updateItem(input: UpdateItemInput, output: UpdateItemOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updateItem(input, output, context, metrics, report);
  }

  async delFolder(input: DelFolderInput, output: DelFolderOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.delFolder(input, output, context, metrics, report);
  }

  async delItem(input: DelItemInput, output: DelItemOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.delItem(input, output, context, metrics, report);
  }

  async moveItem(input: MoveItemInput, output: MoveItemOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.moveItem(input, output, context, metrics, report);
  }
}
