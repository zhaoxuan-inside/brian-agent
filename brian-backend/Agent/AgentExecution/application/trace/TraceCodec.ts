import {
  PromptReference,
  PromptVariables,
  ThinkStep,
  ActStep,
  ReflectStep,
  AnswerStep,
  TraceIterations,
  LightTraceRef,
} from '../../domain/trace';
import { ThinkOutput, ActOutput, ReflectOutput, AnswerOutput } from '../../domain/types';

export const TRACE_LIGHT_TYPE = 'trace';

export function buildPromptRef(
  templateId: string | undefined,
  fallbackId: string,
  variables: PromptVariables,
): PromptReference {
  return { template_id: templateId || fallbackId, variables };
}

export function buildThinkStep(out: ThinkOutput, ref?: PromptReference): ThinkStep {
  return {
    reasoning: out.reasoning,
    next_action: out.next_action,
    raw_response: out.raw_response,
    input_tokens: out.input_tokens,
    output_tokens: out.output_tokens,
    token_usage: out.token_usage,
    prompt_ref: ref,
  };
}

export function buildActStep(out: ActOutput): ActStep {
  return { result: out.result, tool_type: out.tool_type, tool_id: out.tool_id };
}

export function buildReflectStep(out: ReflectOutput, ref?: PromptReference): ReflectStep {
  return {
    should_continue: out.should_continue,
    reflection: out.reflection,
    raw_response: out.raw_response,
    input_tokens: out.input_tokens,
    output_tokens: out.output_tokens,
    token_usage: out.token_usage,
    prompt_ref: ref,
  };
}

export function buildAnswerStep(out: AnswerOutput, ref?: PromptReference): AnswerStep {
  return {
    answer: out.answer,
    raw_response: out.raw_response,
    input_tokens: out.input_tokens,
    output_tokens: out.output_tokens,
    token_usage: out.token_usage,
    prompt_ref: ref,
  };
}

export function stringifyTrace(iterations: TraceIterations): string {
  return JSON.stringify(iterations);
}

export function buildSingleAnswerTrace(params: {
  answer: string;
  raw_response: string;
  input_tokens: number;
  output_tokens: number;
  elapsed_ms: number;
  template_id?: string;
  fallback_id?: string;
  builtin_id?: string;
  variables: PromptVariables;
}): TraceIterations {
  const tokenUsage = params.input_tokens + params.output_tokens;
  return [{
    iteration_index: 0,
    answer: {
      answer: params.answer,
      raw_response: params.raw_response,
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      token_usage: tokenUsage,
      prompt_ref: buildPromptRef(params.template_id, params.fallback_id || params.builtin_id || '', params.variables),
    },
    iteration_elapsed_ms: params.elapsed_ms,
  }];
}

export function buildLightTraceRef(
  traceId: string,
  answer: string,
  totalTokens: number,
): LightTraceRef {
  return { type: TRACE_LIGHT_TYPE, trace_id: traceId, answer, total_token_usage: totalTokens };
}
