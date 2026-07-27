import type { LLMService } from '../../core/llm';
import type { LLMResponse, ChatMessage } from '../../shared/types';

export interface ThinkInput {
  session_id: string;
  work_id: string;
  interact_id: string;
  history_info: ChatMessage[];
  system_prompt: string;
  user_prompt: string;
  runtime: {
    step_num: number;
    reasoning_chain: ThinkStep[];
    observation_history: ObserveEntry[];
  };
}

export interface ThinkOutput {
  action: 'FINISH' | 'CALL_TOOL' | 'CONTINUE_THINK';
  reasoning: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  llm_response: LLMResponse;
  elapsed_ms?: number;
}

export interface ThinkStep {
  step_num: number;
  action: string;
  reasoning: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  timestamp: number;
  tokens?: number;
}

export interface ObserveEntry {
  action_type: string;
  raw_result: unknown;
  reasoning: string;
  timestamp: number;
}

export async function execThink(
  input: ThinkInput,
  llmService: LLMService,
): Promise<ThinkOutput> {
  const messages: ChatMessage[] = [
    { role: 'system', content: input.system_prompt },
    ...input.history_info,
    { role: 'user', content: input.user_prompt },
  ];

  const llmResponse = await llmService.chat(messages, {
    temperature: 0.3,
  });

  return parseThinkResult(llmResponse, input);
}

function parseThinkResult(llmResponse: LLMResponse, _input: ThinkInput): ThinkOutput {
  const content = llmResponse.content;

  const actionMatch = content.match(/\b(FINISH|CALL_TOOL|CONTINUE_THINK)\b/i);
  const action = actionMatch
    ? (actionMatch[1].toUpperCase() as 'FINISH' | 'CALL_TOOL' | 'CONTINUE_THINK')
    : 'CONTINUE_THINK';

  const reasoningMatch = content.match(/(?:Thought|Reasoning):\s*(.+?)(?:\n(?:Action|Final Answer|Observation):|$)/is);
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : content;

  let tool_name: string | undefined;
  let tool_args: Record<string, unknown> | undefined;

  if (action === 'CALL_TOOL') {
    const toolMatch = content.match(/Action:\s*(.+?)(?:\n|$)/i);
    const argsMatch = content.match(/Action Input:\s*([\s\S]*?)(?:\n\n|\n(?:Thought|Action|Observation|Final Answer):|$)/i);

    if (toolMatch) {
      tool_name = toolMatch[1].trim();
    }

    if (argsMatch) {
      try {
        tool_args = JSON.parse(argsMatch[1].trim());
      } catch {
        tool_args = { raw: argsMatch[1].trim() };
      }
    }
  }

  return {
    action,
    reasoning,
    tool_name,
    tool_args,
    llm_response: llmResponse,
  };
}
