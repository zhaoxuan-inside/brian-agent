import type { DataObject } from '../../../shared/query';
import { newPatch, newRecord } from '../../../shared/query';

export interface ParsedModel {
  modelId: string;
  displayName?: string;
  description?: string;
  maxTokens?: number;
  raw: Record<string, unknown>;
}

export const MODELS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function isModelsCacheFresh(
  modelsFetchedAt: number | null | undefined,
  force: boolean | undefined,
  now: number,
  ttlMs: number = MODELS_CACHE_TTL_MS,
): boolean {
  if (force) return false;
  if (!modelsFetchedAt) return false;
  return now - modelsFetchedAt < ttlMs;
}

export function extractRemoteErrorDetail(status: number, bodyText: string): string {
  let detail = `HTTP ${status}`;
  try {
    const errJson = JSON.parse(bodyText) as { error?: { message?: string } };
    if (errJson.error?.message) detail += ` - ${errJson.error.message}`;
  } catch {

  }
  return detail;
}

export function toCacheInsertRecord(
  providerId: string,
  model: ParsedModel,
): DataObject[] {
  return newRecord({
    llm_provider_id: providerId,
    llm_title: model.modelId,
    llm_brief: model.description ?? null,
    llm_param: JSON.stringify(model.raw),
    max_tokens: model.maxTokens ?? 0,
  });
}

export function toCacheUpdatePatch(model: ParsedModel): DataObject[] {
  return newPatch({
    llm_brief: model.description ?? null,
    llm_param: JSON.stringify(model.raw),
    max_tokens: model.maxTokens ?? 0,
  });
}
