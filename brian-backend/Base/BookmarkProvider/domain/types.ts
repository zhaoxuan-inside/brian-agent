export const BOOKMARK_FOLDER_TABLE = 'bookmark_folder_record';
export const BOOKMARK_ITEM_TABLE = 'bookmark_item_record';

export interface BookmarkFolderRecord {
  id: string; created: number; updated: number;
  name: string; parent_id: string; sort_order: number;
}

export interface BookmarkFolderNode extends BookmarkFolderRecord {
  children: BookmarkFolderNode[];
  items: BookmarkItemRecord[];
}

export interface BookmarkItemRecord {
  id: string; created: number; updated: number;
  folder_id: string; title: string; url: string;
  favicon: string; sort_order: number;
}

import { Input } from '../../shared/base/Input';
import { Output } from '../../shared/base/Output';
import { Context } from '../../shared/base/Context';

export class BookmarkContext extends Context {}

export class SoTreeInput extends Input {}
export class SoTreeOutput extends Output {
  tree: BookmarkFolderNode[] = [];
}

export class SoFlatFoldersInput extends Input {}
export class SoFlatFoldersOutput extends Output {
  folders: BookmarkFolderRecord[] = [];
}

export class AddFolderInput extends Input {
  name!: string;
  parent_id?: string;
}
export class AddFolderOutput extends Output {
  folder!: BookmarkFolderRecord;
}

export class AddItemInput extends Input {
  folder_id!: string;
  title!: string;
  url!: string;
  favicon?: string;
}
export class AddItemOutput extends Output {
  item!: BookmarkItemRecord;
}

export class UpdateFolderInput extends Input {
  id!: string;
  name!: string;
}
export class UpdateFolderOutput extends Output {}

export class UpdateItemInput extends Input {
  id!: string;
  title!: string;
  url!: string;
}
export class UpdateItemOutput extends Output {}

export class DelFolderInput extends Input {
  id!: string;
}
export class DelFolderOutput extends Output {}

export class DelItemInput extends Input {
  id!: string;
}
export class DelItemOutput extends Output {}

export class MoveItemInput extends Input {
  id!: string;
  target_folder_id!: string;
}
export class MoveItemOutput extends Output {}
