import { HandleResultType, formatDynamicContext } from '@brian-agent/base';

/**
 * 子 Agent 执行产物（WriteInput.agent_results 元素）。
 * answer 与 result 兼容读取：编排层两字段语义等价，answer 优先。
 */
export interface WriterAgentResult {
  agent_id: string;
  task_content?: string;
  result?: string;
  answer?: string;
  handle_result_type?: string;
}

/** 子 Agent 结果的注入形态：纯拼接兜底文本 + 动态执行上下文包装版 + 错误产物列表。 */
export interface WriterResultsContext {
  /** 非 error 结果纯拼接文本（LLM 失败降级兜底用） */
  results: string;
  /** 动态执行上下文包装版（与静态记忆上下文在模板内可视区分） */
  agentResultsContext: string;
  /** error 产物列表（不参与 Writer 汇总，全为错误时直接透传） */
  errorResults: WriterAgentResult[];
}

const DYNAMIC_CONTEXT_PURPOSE = '以下内容是本次任务执行过程中由各个执行 Agent 实时产出的工作结果，属于动态执行上下文：'
  + '它们反映本次任务的真实执行进展，时效性最高、可直接引用；'
  + '请与 static-memory-context（历史记忆）区分使用——执行结果与记忆冲突时，以执行结果为准。';

/**
 * 判定子 Agent 结果是否为错误产物（CALL_ERROR / INTERNAL_ERROR）。
 * 错误信息不参与 Writer 汇总；结果全为错误时跳过 LLM 直接透传。
 */
export function isErrorAgentResult(r: WriterAgentResult): boolean {
  return r.handle_result_type === HandleResultType.CALL_ERROR
    || r.handle_result_type === HandleResultType.INTERNAL_ERROR;
}

/** 将单条子 Agent 结果格式化为 `[agent_id] 任务: 文本` 行（answer 优先于 result）。 */
export function formatAgentResult(r: WriterAgentResult): string {
  const text = r.answer ?? r.result ?? '';
  const taskContent = r.task_content ?? '';
  return `[${r.agent_id}] ${taskContent}: ${text}`;
}

/**
 * 构建子 Agent 结果注入上下文。
 *
 * 非 error 结果按「动态执行上下文」语义包装（formatDynamicContext），与
 * formatContextCategories 渲染的静态记忆上下文（任务开始前检索的历史，不可修改）
 * 明确区分：前者描述功能与使用方式，动态块声明为本轮执行新产生的信息，
 * 时效最高、与记忆冲突时以其为准；纯拼接 results 保留供 LLM 失败降级兜底使用。
 */
export function buildWriterResultsContext(agentResults: WriterAgentResult[]): WriterResultsContext {
  const okResults = agentResults.filter((r) => !isErrorAgentResult(r));
  return {
    results: okResults.map(formatAgentResult).join('\n'),
    agentResultsContext: formatDynamicContext(DYNAMIC_CONTEXT_PURPOSE, okResults.map(formatAgentResult)),
    errorResults: agentResults.filter(isErrorAgentResult),
  };
}

/** 清理降级兜底文本中的内部调试标签与前缀（`[w2-xxx]`、`Summary:`），以自然段落输出。 */
export function cleanFallbackResults(results: string): string {
  return results
    .replace(/\[(?:w2-)?[^\]]+\]\s*/g, '')
    .replace(/^Summary:\s*/g, '')
    .trim();
}
