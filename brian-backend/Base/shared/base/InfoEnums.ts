export enum InfoType {
  REQUEST = 'REQUEST',
  RESPONSE = 'RESPONSE',
  THINK = 'THINK',
  REFLECT = 'REFLECT',
  ACT = 'ACT',
  SKILL = 'SKILL',
  MCP = 'MCP',
  CDT = 'CDT',
  PERMISSION = 'PERMISSION',
  SELF_LEARNING = 'SELF_LEARNING',
  AGENT = 'AGENT',
}

export enum CollectionSource {
  PINNED = 'PINNED',
  TIMELINE = 'TIMELINE',
  CITING = 'CITING',
  TAG_RELATIVE = 'TAG_RELATIVE',
  SIMILARITY = 'SIMILARITY',
  KEYWORD = 'KEYWORD',
  RANDOM = 'RANDOM',
  CUSTOM = 'CUSTOM',
  CURRENT = 'CURRENT',
}

export const ContextSource = CollectionSource;
export type ContextSource = CollectionSource;

export enum HandleResultType {
  CORRECT = 'correct',
  CALL_ERROR = 'call_error',
  INTERNAL_ERROR = 'internal_error',
}

export const DEFAULT_HANDLE_RESULT_TYPE = HandleResultType.CORRECT;

export type HandleErrorSource = 'external' | 'internal';

const NETWORK_ERROR_PATTERN = /(ECONNREFUSED|ECONNRESET|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|EHOSTUNREACH|ENETUNREACH|ERR_NETWORK|ERR_CONNECTION|ERR_TIMED_OUT|ERR_HTTP2_|ERR_INTERNET_DISCONNECTED|socket|network|timeout|timed out|fetch failed|connection refused|connect e|dns|AbortError|undici)/i;

export function classifyHandleResult(error: unknown, source: HandleErrorSource): HandleResultType {
  if (source === 'internal') {
    return HandleResultType.INTERNAL_ERROR;
  }
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return NETWORK_ERROR_PATTERN.test(message) ? HandleResultType.INTERNAL_ERROR : HandleResultType.CALL_ERROR;
}
