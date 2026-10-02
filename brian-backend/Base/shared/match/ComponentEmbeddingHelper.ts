import { createHash } from 'crypto';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { Operator } from '../query';
import type { DataObject } from '../query';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import type { Context } from '../base/Context';
import type { Metrics } from '../base/Metrics';

export interface ComponentEmbeddingRecord {
  id: string;
  created: number;
  updated: number;
  target_id: string;
  model: string;
  dimension: number;
  content_hash: string;
  content: string;
  embedding: string;
  trace_id?: string;
}

export interface ComponentExampleEmbeddingRecord {
  id: string;
  created: number;
  updated: number;
  target_id: string;
  example_text: string;
  example_type?: 'positive' | 'negative';
  model: string;
  dimension: number;
  content_hash: string;
  embedding: string;
  trace_id?: string;
}

export interface ComponentExampleItem {
  text: string;
  type?: 'positive' | 'negative';
}

export interface SyncEmbeddingParams {
  relationDb: RelationDBAccess;
  table: string;
  targetIdField: string;
  targetId: string;
  text: string;
  embedFn?: (text: string, context?: Context) => Promise<number[]>;
  context?: Context;
  metrics?: Metrics;
}

export interface SyncExampleEmbeddingsParams {
  relationDb: RelationDBAccess;
  table: string;
  targetIdField: string;
  targetId: string;
  examples?: Array<string | ComponentExampleItem>;
  positiveExamples?: string[];
  negativeExamples?: string[];
  embedFn?: (text: string, context?: Context) => Promise<number[]>;
  context?: Context;
  metrics?: Metrics;
}

export interface DualExampleEmbeddings {
  positiveMap: Map<string, number[][]>;
  negativeMap: Map<string, number[][]>;
}

/** 组件范例文本集合（卡片 DTO 与编辑回显使用） */
export interface ComponentExamplesText {
  positive: string[];
  negative: string[];
}

export interface BatchGetEmbeddingParams {
  relationDb: RelationDBAccess;
  table: string;
  targetIdField: string;
  items: Array<{ id: string; text: string }>;
  embedFn?: (text: string, context?: Context) => Promise<number[]>;
  context?: Context;
  metrics?: Metrics;
}

export interface BatchGetExampleEmbeddingsParams {
  relationDb: RelationDBAccess;
  table: string;
  targetIdField: string;
  targetIds: string[];
}

export const AGENT_EMBEDDING_TABLE = 'agent_embedding_record';
export const AGENT_EXAMPLE_EMBEDDING_TABLE = 'agent_example_embedding_record';
export const MCP_EMBEDDING_TABLE = 'mcp_embedding_record';
export const MCP_EXAMPLE_EMBEDDING_TABLE = 'mcp_example_embedding_record';
export const SKILL_EMBEDDING_TABLE = 'skill_embedding_record';
export const SKILL_EXAMPLE_EMBEDDING_TABLE = 'skill_example_embedding_record';
export const PROMPT_TEMPLATE_EMBEDDING_TABLE = 'prompt_template_embedding_record';
export const PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE = 'prompt_template_example_embedding_record';
export const SOUL_EMBEDDING_TABLE = 'soul_embedding_record';
export const SOUL_EXAMPLE_EMBEDDING_TABLE = 'soul_example_embedding_record';

export function createEmbedTaskFn(llmAccess: {
  embedLLM: (input: any, output: any, context?: any, metrics?: any, report?: any) => Promise<boolean>;
}): (text: string, context?: Context) => Promise<number[]> {
  return async (text: string, context?: Context): Promise<number[]> => {
    const output = { embedding: [] as number[] };
    const input = { id: '', input: text };
    try {
      const ok = await llmAccess.embedLLM(input, output, context);
      return ok && Array.isArray(output.embedding) ? output.embedding : [];
    } catch {
      return [];
    }
  };
}

export function computeContentHash(text: string): string {
  return createHash('sha256').update(String(text ?? '').trim()).digest('hex');
}

/**
 * 同步组件描述的向量记录：
 * 1. 若文本未变（hash 匹配）且已有向量有效，直接复用；
 * 2. 若文本改变或不存在，调用模型重新计算并保存；
 * 3. 若模型不可用/计算失败，安全删除旧记录，防止脏数据遗留。
 */
export async function syncComponentEmbedding(params: SyncEmbeddingParams): Promise<boolean> {
  const { relationDb, table, targetIdField, targetId, text, embedFn, context, metrics } = params;
  if (!targetId) return false;
  const cleanText = String(text ?? '').trim();
  if (!cleanText) {
    await deleteComponentEmbedding({ relationDb, table, targetIdField, targetId });
    return true;
  }
  const hash = computeContentHash(cleanText);
  const existing = await relationDb.selectOne(table, [
    { field: targetIdField, operator: Operator.EQ, value: targetId },
  ]).catch(() => null);

  if (existing && existing.content_hash === hash && existing.embedding) {
    return true;
  }

  if (!embedFn) {
    await deleteComponentEmbedding({ relationDb, table, targetIdField, targetId });
    return false;
  }

  try {
    const vec = await embedFn(cleanText, context);
    if (vec && Array.isArray(vec) && vec.length > 0) {
      await upsertEmbeddingRecord(relationDb, table, targetIdField, targetId, cleanText, hash, vec, existing);
      metrics?.info('ComponentEmbeddingHelper 同步向量成功', { table, targetId, dimension: vec.length });
      return true;
    }
  } catch (err) {
    metrics?.warn('ComponentEmbeddingHelper 向量模型不可用，清理旧向量记录', {
      table, targetId, error: err instanceof Error ? err.message : String(err),
    });
  }

  await deleteComponentEmbedding({ relationDb, table, targetIdField, targetId });
  return false;
}

/**
 * 删除指定组件的向量记录
 */
export async function deleteComponentEmbedding(params: {
  relationDb: RelationDBAccess;
  table: string;
  targetIdField: string;
  targetId: string;
}): Promise<boolean> {
  const { relationDb, table, targetIdField, targetId } = params;
  if (!targetId) return true;
  await relationDb.delete(table, [
    { field: targetIdField, operator: Operator.EQ, value: targetId },
  ]).catch(() => null);
  return true;
}

/**
 * 批量获取或懒加载计算组件的向量记录
 */
export async function batchGetOrComputeEmbeddings(params: BatchGetEmbeddingParams): Promise<Map<string, number[]>> {
  const { relationDb, table, targetIdField, items, embedFn, context, metrics } = params;
  const result = new Map<string, number[]>();
  if (!items || items.length === 0) return result;

  const validItems = items.filter((i) => i.id && String(i.text ?? '').trim().length > 0);
  if (validItems.length === 0) return result;

  const rowMap = await fetchExistingRowMap(relationDb, table, targetIdField, validItems.map((i) => i.id));

  for (const item of validItems) {
    const hash = computeContentHash(item.text);
    const row = rowMap.get(item.id);
    const parsedVec = parseValidEmbedding(row, hash);
    if (parsedVec) {
      result.set(item.id, parsedVec);
      continue;
    }
    if (embedFn) {
      await lazyComputeAndSave(relationDb, table, targetIdField, item, hash, embedFn, context, result, metrics);
    }
  }

  return result;
}

async function fetchExistingRowMap(
  relationDb: RelationDBAccess,
  table: string,
  targetIdField: string,
  ids: string[],
): Promise<Map<string, any>> {
  const rowMap = new Map<string, any>();
  try {
    const rows = await relationDb.select(table, {
      conditions: [{ field: targetIdField, operator: Operator.IN, value: ids }],
    });
    for (const r of rows) {
      const tid = String((r as any)[targetIdField] ?? '');
      if (tid) rowMap.set(tid, r);
    }
  } catch { /* 容错 */ }
  return rowMap;
}

function parseValidEmbedding(row: any, expectedHash: string): number[] | null {
  if (!row || row.content_hash !== expectedHash || !row.embedding) return null;
  try {
    const parsed = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function lazyComputeAndSave(
  relationDb: RelationDBAccess,
  table: string,
  targetIdField: string,
  item: { id: string; text: string },
  hash: string,
  embedFn: (text: string, context?: Context) => Promise<number[]>,
  context: Context | undefined,
  result: Map<string, number[]>,
  metrics: Metrics | undefined,
): Promise<void> {
  try {
    const vec = await embedFn(item.text, context);
    if (vec && Array.isArray(vec) && vec.length > 0) {
      result.set(item.id, vec);
      const existing = await relationDb.selectOne(table, [
        { field: targetIdField, operator: Operator.EQ, value: item.id },
      ]).catch(() => null);
      await upsertEmbeddingRecord(relationDb, table, targetIdField, item.id, item.text, hash, vec, existing);
    }
  } catch (err) {
    metrics?.warn('ComponentEmbeddingHelper 懒加载计算失败', {
      table, targetId: item.id, error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function upsertEmbeddingRecord(
  relationDb: RelationDBAccess,
  table: string,
  targetIdField: string,
  targetId: string,
  content: string,
  hash: string,
  vec: number[],
  existing: any,
): Promise<void> {
  const now = IdGenerator.now();
  const serialized = JSON.stringify(vec);
  if (existing) {
    const updates: DataObject[] = [
      { field: 'updated', value: now },
      { field: 'content_hash', value: hash },
      { field: 'content', value: content },
      { field: 'dimension', value: vec.length },
      { field: 'embedding', value: serialized },
      { field: 'model', value: 'default' },
    ];
    await relationDb.update(table, updates, [
      { field: targetIdField, operator: Operator.EQ, value: targetId },
    ]);
  } else {
    const inserts: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: targetIdField, value: targetId },
      { field: 'model', value: 'default' },
      { field: 'dimension', value: vec.length },
      { field: 'content_hash', value: hash },
      { field: 'content', value: content },
      { field: 'embedding', value: serialized },
    ];
    await relationDb.insert(table, inserts);
  }
}

/**
 * 同步组件范例集的向量记录：
 * 1. 针对每条正向/负向范例根据 hash 校验复用已有向量；
 * 2. 缺失或变更时调用 embedFn 计算并插入；
 * 3. 清理已废弃的旧范例向量记录。
 */
export async function syncComponentExamples(params: SyncExampleEmbeddingsParams): Promise<boolean> {
  const { relationDb, table, targetIdField, targetId, embedFn, context, metrics } = params;
  if (!targetId) return false;
  const items = extractNormalizedExamples(params);
  if (items.length === 0) {
    await deleteComponentExamples({ relationDb, table, targetIdField, targetId });
    return true;
  }
  return syncExamplesCore(relationDb, table, targetIdField, targetId, items, embedFn, context, metrics);
}

function extractNormalizedExamples(params: SyncExampleEmbeddingsParams): ComponentExampleItem[] {
  const list: ComponentExampleItem[] = [];
  if (params.positiveExamples) {
    for (const text of params.positiveExamples) {
      const clean = String(text ?? '').trim();
      if (clean) list.push({ text: clean, type: 'positive' });
    }
  }
  if (params.negativeExamples) {
    for (const text of params.negativeExamples) {
      const clean = String(text ?? '').trim();
      if (clean) list.push({ text: clean, type: 'negative' });
    }
  }
  if (params.examples) {
    for (const item of params.examples) {
      if (typeof item === 'string') {
        const clean = item.trim();
        if (clean) list.push({ text: clean, type: 'positive' });
      } else if (item && item.text) {
        const clean = item.text.trim();
        if (clean) list.push({ text: clean, type: item.type || 'positive' });
      }
    }
  }
  const seen = new Set<string>();
  return list.filter((i) => {
    const key = `${i.type || 'positive'}:${i.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function syncExamplesCore(
  relationDb: RelationDBAccess,
  table: string,
  targetIdField: string,
  targetId: string,
  examples: ComponentExampleItem[],
  embedFn: ((text: string, context?: Context) => Promise<number[]>) | undefined,
  context: Context | undefined,
  metrics: Metrics | undefined,
): Promise<boolean> {
  const rows = await relationDb.select(table, {
    conditions: [{ field: targetIdField, operator: Operator.EQ, value: targetId }],
  }).catch(() => []);
  const byHash = new Map<string, any>(rows.map((r) => [(r as any).content_hash, r]));
  const keepIds = new Set<string>();

  for (const item of examples) {
    const hash = computeContentHash(`${item.type || 'positive'}:${item.text}`);
    const existing = byHash.get(hash);
    if (existing && existing.embedding) {
      keepIds.add(String(existing.id));
      continue;
    }
    if (!embedFn) continue;
    const id = await computeAndInsertExample(relationDb, table, targetIdField, targetId, item, hash, embedFn, context, metrics);
    if (id) keepIds.add(id);
  }
  await pruneObsoleteExamples(relationDb, table, rows, keepIds);
  return true;
}

async function computeAndInsertExample(
  relationDb: RelationDBAccess,
  table: string,
  targetIdField: string,
  targetId: string,
  item: ComponentExampleItem,
  hash: string,
  embedFn: (text: string, context?: Context) => Promise<number[]>,
  context: Context | undefined,
  metrics: Metrics | undefined,
): Promise<string | null> {
  try {
    const vec = await embedFn(item.text, context);
    if (!vec || !Array.isArray(vec) || vec.length === 0) return null;
    const id = IdGenerator.generate();
    const now = IdGenerator.now();
    await relationDb.insert(table, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: targetIdField, value: targetId },
      { field: 'example_text', value: item.text },
      { field: 'example_type', value: item.type || 'positive' },
      { field: 'model', value: 'default' },
      { field: 'dimension', value: vec.length },
      { field: 'content_hash', value: hash },
      { field: 'embedding', value: JSON.stringify(vec) },
    ]);
    metrics?.info('ComponentEmbeddingHelper 同步范例向量成功', { table, targetId, type: item.type, dimension: vec.length });
    return id;
  } catch (err) {
    metrics?.warn('ComponentEmbeddingHelper 范例向量计算失败', {
      table, targetId, error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function pruneObsoleteExamples(
  relationDb: RelationDBAccess,
  table: string,
  existingRows: any[],
  keepIds: Set<string>,
): Promise<void> {
  const toDelete = existingRows.filter((r) => !keepIds.has(String(r.id))).map((r) => String(r.id));
  if (toDelete.length > 0) {
    await relationDb.delete(table, [
      { field: 'id', operator: Operator.IN, value: toDelete },
    ]).catch(() => null);
  }
}

/**
 * 删除指定组件的全部范例向量记录
 */
export async function deleteComponentExamples(params: {
  relationDb: RelationDBAccess;
  table: string;
  targetIdField: string;
  targetId: string;
}): Promise<boolean> {
  const { relationDb, table, targetIdField, targetId } = params;
  if (!targetId) return true;
  await relationDb.delete(table, [
    { field: targetIdField, operator: Operator.EQ, value: targetId },
  ]).catch(() => null);
  return true;
}

/**
 * 批量获取组件列表关联的正向和负向范例向量集合
 */
export async function batchGetDualExampleEmbeddings(params: BatchGetExampleEmbeddingsParams): Promise<DualExampleEmbeddings> {
  const { relationDb, table, targetIdField, targetIds } = params;
  const positiveMap = new Map<string, number[][]>();
  const negativeMap = new Map<string, number[][]>();
  if (!targetIds || targetIds.length === 0) return { positiveMap, negativeMap };
  try {
    const rows = await relationDb.select(table, {
      conditions: [{ field: targetIdField, operator: Operator.IN, value: targetIds }],
    });
    for (const r of rows) {
      const tid = String((r as any)[targetIdField] ?? '');
      if (!tid) continue;
      const vec = parseValidExampleVector(r);
      if (!vec) continue;
      const type = String((r as any).example_type || 'positive');
      const targetMap = type === 'negative' ? negativeMap : positiveMap;
      const list = targetMap.get(tid) || [];
      list.push(vec);
      targetMap.set(tid, list);
    }
  } catch { /* 容错 */ }
  return { positiveMap, negativeMap };
}

/**
 * 批量获取组件列表关联的全部正向范例向量集合
 */
export async function batchGetExampleEmbeddings(params: BatchGetExampleEmbeddingsParams): Promise<Map<string, number[][]>> {
  const { positiveMap } = await batchGetDualExampleEmbeddings(params);
  return positiveMap;
}

/**
 * 批量读取组件范例原文（按正负分组，保持写入顺序），供卡片 DTO 与编辑回显
 */
export async function batchGetComponentExamples(params: BatchGetExampleEmbeddingsParams): Promise<Map<string, ComponentExamplesText>> {
  const { relationDb, table, targetIdField, targetIds } = params;
  const result = new Map<string, ComponentExamplesText>();
  if (!targetIds || targetIds.length === 0) return result;
  try {
    const rows = await relationDb.select(table, {
      conditions: [{ field: targetIdField, operator: Operator.IN, value: targetIds }],
      order_by: [{ field: 'created', direction: 'ASC' }],
    });
    for (const r of rows) {
      const tid = String((r as any)[targetIdField] ?? '');
      const text = String((r as any).example_text ?? '').trim();
      if (!tid || !text) continue;
      const entry = result.get(tid) || { positive: [], negative: [] };
      if (String((r as any).example_type || 'positive') === 'negative') entry.negative.push(text);
      else entry.positive.push(text);
      result.set(tid, entry);
    }
  } catch { /* 容错 */ }
  return result;
}

function parseValidExampleVector(row: any): number[] | null {
  if (!row || !row.embedding) return null;
  try {
    const parsed = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

