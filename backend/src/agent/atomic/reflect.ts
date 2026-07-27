import type { LLMService } from '../../core/llm';

export interface ReflectInput {
  raw_result: string;
  task_goal: string;
  history_info: { step_num: number; summary: string }[];
}

export interface ReflectOutput {
  action_type: 'FINISH' | 'CALL_TOOL' | 'CONTINUE_THINK';
  reasoning: string;
  quality_score?: number;
  elapsed_ms?: number;
}

const REFLECT_PROMPT = `You are a task reflection evaluator. Given a tool execution result and the task goal,
determine the next action.

Evaluate if the result satisfies the task goal:
- FINISH: The result clearly answers the user's question and the task is complete.
- CALL_TOOL: The result provides intermediate data but further tool calls are needed.
- CONTINUE_THINK: The result is insufficient or unclear; more analysis is needed before acting.

Respond with JSON:
{
  "action_type": "FINISH" | "CALL_TOOL" | "CONTINUE_THINK",
  "reasoning": "explanation of the decision",
  "quality_score": 0-1 (how well the result addresses the goal)
}`;

export async function execReflect(
  input: ReflectInput,
  llmService: LLMService,
): Promise<ReflectOutput> {
  const start = Date.now();
  try {
    const messages = [
      { role: 'system' as const, content: REFLECT_PROMPT },
      {
        role: 'user' as const,
        content: `Task Goal: ${input.task_goal}\n\nTool Result: ${input.raw_result}\n\nExecution History:\n${JSON.stringify(input.history_info)}`,
      },
    ];

    const response = await llmService.chat(messages, { temperature: 0.1 });
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        action_type: parsed.action_type || 'CONTINUE_THINK',
        reasoning: parsed.reasoning || response.content,
        quality_score: parsed.quality_score,
        elapsed_ms: Date.now() - start,
      };
    }

    return heuristicReflect(input, start);
  } catch {
    return heuristicReflect(input, start);
  }
}

function heuristicReflect(input: ReflectInput, start: number): ReflectOutput {
  const raw = input.raw_result.toLowerCase();

  if (raw.length > 50 && !/error|fail|sorry|unable|cannot/i.test(raw)) {
    return {
      action_type: 'FINISH',
      reasoning: 'Result appears valid and complete (heuristic)',
      quality_score: 0.7,
      elapsed_ms: Date.now() - start,
    };
  }

  if (/error|fail|exception|timeout/i.test(raw)) {
    return {
      action_type: 'CONTINUE_THINK',
      reasoning: 'Result contains errors, need re-evaluation (heuristic)',
      quality_score: 0.3,
      elapsed_ms: Date.now() - start,
    };
  }

  return {
    action_type: 'CALL_TOOL',
    reasoning: 'Result incomplete, may need further actions (heuristic)',
    quality_score: 0.5,
    elapsed_ms: Date.now() - start,
  };
}
