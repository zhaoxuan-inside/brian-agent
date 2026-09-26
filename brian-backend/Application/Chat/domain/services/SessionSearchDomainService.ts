import type { SearchSessionOutput } from '../types';

export interface SessionAggregateMaps {
  
  statMap: Map<string, { qa_count: number; question_chars: number; answer_chars: number }>;
  
  tagsMap: Map<string, string[]>;
  
  tokenMap: Map<string, { input_tokens: number; output_tokens: number }>;
  
  countMap: Map<string, number>;
  
  lastMsgMap: Map<string, { time: number; msg: string }>;
}

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
