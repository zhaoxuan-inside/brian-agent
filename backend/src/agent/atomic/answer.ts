import type { LLMService } from '../../core/llm';
import type { ThinkStep, ObserveEntry } from './think';

export interface AnswerInput {
  task_goal: string;
  reasoning_chain: ThinkStep[];
  observation_history: ObserveEntry[];
  system_prompt: string;
}

export interface AnswerOutput {
  final_answer: string;
  total_tokens: number;
  elapsed_ms?: number;
}

const ANSWER_PROMPT_TEMPLATE = `You are a final answer generator. Based on the complete execution trace below,
generate a concise, accurate, and well-formatted final answer for the user.

Task Goal: {{task_goal}}

Execution Trace:
- Reasoning Chain: {{reasoning_chain}}
- Observations: {{observation_history}}

Generate the final answer. If the task was completed successfully, provide the answer clearly.
If there were failures or timeouts, mention them and provide whatever partial results are available.
If everything failed, provide a friendly error message with suggestions for retrying.

Please respond in Chinese unless the user's question was in another language.`;

export async function execAnswer(
  input: AnswerInput,
  llmService: LLMService,
): Promise<AnswerOutput> {
  const start = Date.now();
  const reasoningText = input.reasoning_chain
    .map(s => `[Step ${s.step_num}] ${s.action}: ${s.reasoning}${s.tool_name ? ` → ${s.tool_name}` : ''}`)
    .join('\n');

  const observationText = input.observation_history
    .map(o => `[${o.action_type}] ${o.reasoning}`)
    .join('\n');

  const prompt = ANSWER_PROMPT_TEMPLATE
    .replace('{{task_goal}}', input.task_goal)
    .replace('{{reasoning_chain}}', reasoningText || '(no reasoning steps)')
    .replace('{{observation_history}}', observationText || '(no observations)');

  const messages = [
    { role: 'system' as const, content: input.system_prompt },
    { role: 'user' as const, content: prompt },
  ];

  try {
    const response = await llmService.chat(messages, { temperature: 0.5 });
    let final_answer = response.content;

    // Post-processing: strip internal markers
    final_answer = final_answer.replace(/Thought:[\s\S]*?(?=\n\n|$)/g, '');
    final_answer = final_answer.replace(/Action:[\s\S]*?(?=\n\n|$)/g, '');
    final_answer = final_answer.replace(/Action Input:[\s\S]*?(?=\n\n|$)/g, '');
    final_answer = final_answer.replace(/Observation:[\s\S]*?(?=\n\n|$)/g, '');
    final_answer = final_answer.trim();

    // Length truncation protection (default 8000 chars)
    if (final_answer.length > 8000) {
      final_answer = final_answer.substring(0, 8000) + '\n\n...(内容已截断)';
    }

    return {
      final_answer,
      total_tokens: response.usage?.totalTokens || 0,
      elapsed_ms: Date.now() - start,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      final_answer: `抱歉，生成最终答案时出错：${message}\n\n以下是执行的中间结果：\n${reasoningText}`,
      total_tokens: 0,
      elapsed_ms: Date.now() - start,
    };
  }
}
