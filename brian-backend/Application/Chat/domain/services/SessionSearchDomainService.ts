/**
 * @fileoverview 会话检索领域服务：soSession 链路的纯数据加工，零 I/O。
 *
 * 从 ChatService.soSession 剥离的数据处理职责（取数与流程编排留在应用服务）：
 * - info_raw 迭代明细 → 会话 token 用量解析（iterations_json 解析与回退口径）
 * - 会话页行 + 各聚合映射 → 会话摘要列表字段映射
 */

import type { SearchSessionOutput } from '../types';

/** 会话页各批量聚合映射（由应用服务经批量查询装配，领域服务只消费） */
export interface SessionAggregateMaps {
  /** 问答次数 / 问字符数 / 答字符数（info_type = REQUEST/RESPONSE 聚合） */
  statMap: Map<string, { qa_count: number; question_chars: number; answer_chars: number }>;
  /** 会话标签集合（info_tag 关联去重） */
  tagsMap: Map<string, string[]>;
  /** token 用量（iterations 明细优先，total_token_usage 兜底） */
  tokenMap: Map<string, { input_tokens: number; output_tokens: number }>;
  /** 消息条数 */
  countMap: Map<string, number>;
  /** 最后一条消息（时间 + 内容） */
  lastMsgMap: Map<string, { time: number; msg: string }>;
}

/**
 * 解析单条 trace 的迭代明细为 token 用量；明细汇总为 0 时回退 total_token_usage。
 *
 * iterations_json 非 JSON 时抛错，由调用方负责告警与 total_token_usage 兜底
 * （领域纯函数无日志通道，保持零 I/O）。
 *
 * @param iterationsJson orchestration_agent_execution.iterations_json 原文
 * @param fallbackTotalTokens 明细为空时的输出 token 兜底值（trace.total_token_usage）
 */
export function toTraceTokenUsage(
  iterationsJson: string,
  fallbackTotalTokens: number,
): { input_tokens: number; output_tokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  const iterations = JSON.parse(iterationsJson || '[]');
  if (Array.isArray(iterations)) {
    for (const it of iterations) {
      for (const key of ['think', 'reflect', 'answer']) {
        const piece = it?.[key];
        if (piece && typeof piece === 'object') {
          inputTokens += Number(piece.input_tokens ?? 0) || 0;
          outputTokens += Number(piece.output_tokens ?? 0) || 0;
        }
      }
    }
  }
  if (inputTokens === 0 && outputTokens === 0) {
    outputTokens = fallbackTotalTokens;
  }
  return { input_tokens: inputTokens, output_tokens: outputTokens };
}

/**
 * 将会话页行与各聚合映射装配为会话摘要列表（纯映射，缺省值口径与原实现一致）。
 */
export function toSessionSummaries(
  rows: Array<Record<string, unknown>>,
  maps: SessionAggregateMaps,
): SearchSessionOutput['sessions'] {
  const sessions: SearchSessionOutput['sessions'] = [];
  for (const row of rows) {
    const sessionId = row.session_id as string;
    const countInfo = maps.countMap.get(sessionId);
    const messageCount = countInfo ?? 0;
    const lastInfo = maps.lastMsgMap.get(sessionId);
    const lastMessageTime = lastInfo?.time ?? 0;
    const lastMessage = lastInfo?.msg ?? '';
    const stat = maps.statMap.get(sessionId) ?? { qa_count: 0, question_chars: 0, answer_chars: 0 };
    const token = maps.tokenMap.get(sessionId) ?? { input_tokens: 0, output_tokens: 0 };
    sessions.push({
      session_id: sessionId,
      session_title: (row.session_title as string) ?? '',
      message_count: messageCount,
      last_message_time: lastMessageTime,
      last_message: lastMessage || (row.session_title as string) || '',
      created: (row.created as number) ?? 0,
      updated: (row.updated as number) ?? 0,
      qa_count: stat.qa_count,
      question_chars: stat.question_chars,
      answer_chars: stat.answer_chars,
      input_tokens: token.input_tokens,
      output_tokens: token.output_tokens,
      tags: maps.tagsMap.get(sessionId) ?? [],
    });
  }
  return sessions;
}
