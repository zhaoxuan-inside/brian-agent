import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';

export async function ensureColumn(
  db: RelationDBAccess,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  try {
    await db.executeRaw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${ddl}`, []);
  } catch {

  }
}

export async function ensureIndex(
  db: RelationDBAccess,
  table: string,
  columns: string[],
  unique = false,
): Promise<void> {
  const name = `idx_${table}_${columns.join('_')}`;
  const kind = unique ? 'UNIQUE INDEX' : 'INDEX';
  await db.executeRaw(
    `CREATE ${kind} IF NOT EXISTS "${name}" ON "${table}" ("${columns.join('", "')}")`,
    [],
  );
}
