import { HandleResultType, formatDynamicContext } from '@brian-agent/base';

export interface WriterAgentResult {
  agent_id: string;
  task_content?: string;
  result?: string;
  answer?: string;
  handle_result_type?: string;
}

export interface WriterResultsContext {
  
  results: string;
  
  agentResultsContext: string;
  
  errorResults: WriterAgentResult[];
}

const DYNAMIC_CONTEXT_PURPOSE = '以下内容是本次任务执行过程中由各个执行 Agent 实时产出的工作结果，属于动态执行上下文：'
  + '它们反映本次任务的真实执行进展，时效性最高、可直接引用；'
  + '请与 static-memory-context（历史记忆）区分使用——执行结果与记忆冲突时，以执行结果为准。';

export function isErrorAgentResult(r: WriterAgentResult): boolean {
  return r.handle_result_type === HandleResultType.CALL_ERROR
    || r.handle_result_type === HandleResultType.INTERNAL_ERROR;
}

export function formatAgentResult(r: WriterAgentResult): string {
  const text = r.answer ?? r.result ?? '';
  const taskContent = r.task_content ?? '';
  return `[${r.agent_id}] ${taskContent}: ${text}`;
}

export function buildWriterResultsContext(agentResults: WriterAgentResult[]): WriterResultsContext {
  const okResults = agentResults.filter((r) => !isErrorAgentResult(r));
  return {
    results: okResults.map(formatAgentResult).join('\n'),
    agentResultsContext: formatDynamicContext(DYNAMIC_CONTEXT_PURPOSE, okResults.map(formatAgentResult)),
    errorResults: agentResults.filter(isErrorAgentResult),
  };
}

export function cleanFallbackResults(results: string): string {
  return results
    .replace(/\[(?:w2-)?[^\]]+\]\s*/g, '')
    .replace(/^Summary:\s*/g, '')
    .trim();
}
