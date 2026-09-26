import { IdGenerator } from '../../ToolProvider/IdGenerator';
import type { DataObject } from './QueryObjects';

export function toDataObject(partial: Record<string, unknown>): DataObject[] {
  return Object.entries(partial)
    .filter(([, v]) => v !== undefined)
    .map(([field, value]) => ({ field, value }));
}

export function newRecord(partial: Record<string, unknown>): DataObject[] {
  const now = IdGenerator.now();
  return [
    { field: 'id', value: (partial.id as string) || IdGenerator.generate() },
    { field: 'created', value: now },
    { field: 'updated', value: now },
    ...toDataObject(partial),
  ];
}

export function newPatch(partial: Record<string, unknown>): DataObject[] {
  return [{ field: 'updated', value: IdGenerator.now() }, ...toDataObject(partial)];
}
