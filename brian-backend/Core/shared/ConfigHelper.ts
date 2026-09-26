import type { RelationDBAccess } from '@brian-agent/base';
import type { DataObject } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';

export async function ensureDefaultConfig(
  relationDb: RelationDBAccess,
  tableName: string,
  defaults: DataObject[],
): Promise<void> {
  const count = await relationDb.count(tableName);
  if (count === 0) {
    const now = IdGenerator.now();
    const record: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      ...defaults,
    ];
    await relationDb.insert(tableName, record);
  }
}
