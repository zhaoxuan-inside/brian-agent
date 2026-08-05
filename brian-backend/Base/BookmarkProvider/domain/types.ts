export const BOOKMARK_FOLDER_TABLE = 'bookmark_folder';
export const BOOKMARK_ITEM_TABLE = 'bookmark_item';

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
