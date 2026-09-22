/**
 * @fileoverview LLM 缓存领域服务：模型列表缓存相关的纯规则与映射，零 I/O。
 *
 * 从 LLMService.listLLM 剥离的数据处理职责（流程与 I/O 留在应用服务）：
 * - 模型缓存新鲜度判定（TTL）
 * - 拉取结果 → llm_cache 表字段映射（insert / update 两种补丁）
 * - 远端 HTTP 错误信息提取
 */

import type { DataObject } from '../../../shared/query';
import { newPatch, newRecord } from '../../../shared/query';

/** 单条拉取结果模型 */
export interface ParsedModel {
  modelId: string;
  displayName?: string;
  description?: string;
  maxTokens?: number;
  raw: Record<string, unknown>;
}

/** 模型列表缓存默认 TTL（毫秒） */
export const MODELS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * 判定模型列表缓存是否新鲜（未指定 force 且未超过 TTL）。
 *
 * @param modelsFetchedAt 上次拉取时间戳（毫秒；null/0 表示从未拉取）
 * @param force 是否强制刷新
 * @param now 当前时间戳
 */
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

/**
 * 提取远端 HTTP 错误的详情文本：优先解析 JSON 错误体中的 error.message，
 * 解析失败则保留状态码。
 */
export function extractRemoteErrorDetail(status: number, bodyText: string): string {
  let detail = `HTTP ${status}`;
  try {
    const errJson = JSON.parse(bodyText) as { error?: { message?: string } };
    if (errJson.error?.message) detail += ` - ${errJson.error.message}`;
  } catch {
    /* 非 JSON 错误体（纯文本/HTML）属预期：领域纯函数无日志通道，保留状态码即可 */
  }
  return detail;
}

/**
 * 将拉取到的模型映射为 llm_cache 表的 insert 记录（自动补 id/created/updated）。
 *
 * @param providerId 归属 LLM 提供商 ID
 */
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

/**
 * 将拉取到的模型映射为 llm_cache 表的 update 补丁（自动补 updated）。
 */
export function toCacheUpdatePatch(model: ParsedModel): DataObject[] {
  return newPatch({
    llm_brief: model.description ?? null,
    llm_param: JSON.stringify(model.raw),
    max_tokens: model.maxTokens ?? 0,
  });
}
