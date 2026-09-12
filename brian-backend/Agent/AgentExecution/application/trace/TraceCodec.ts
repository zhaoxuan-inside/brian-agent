/**
 * @fileoverview Trace 序列化器（TraceCodec）。
 *
 * 负责把执行产出的 step 结果编码为「去 prompt 化」的轨迹段，并提供轨迹序列化能力。
 * 完整 prompt 不在此存储，改存 {@link PromptReference}（模板引用 + 小变量）。
 */
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

/** 构建 prompt 引用：用模板引用 + 小变量替代完整 prompt（不含 context_data / history / soul 全文）。 */
export function buildPromptRef(
  templateId: string | undefined,
  fallbackId: string,
  variables: PromptVariables,
): PromptReference {
  return { template_id: templateId || fallbackId, variables };
}

/** 从 Think 输出 + prompt 引用构建 Think 轨迹段。 */
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

/** 从 Act 输出构建 Act 轨迹段（无 LLM 调用，无 prompt）。 */
export function buildActStep(out: ActOutput): ActStep {
  return { result: out.result, tool_type: out.tool_type, tool_id: out.tool_id };
}

/** 从 Reflect 输出 + prompt 引用构建 Reflect 轨迹段。 */
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

/** 从 Answer 输出 + prompt 引用构建 Answer 轨迹段。 */
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

/** 序列化轨迹（去 prompt 化后体积大幅缩减）。 */
export function stringifyTrace(iterations: TraceIterations): string {
  return JSON.stringify(iterations);
}

/**
 * 构建系统 Agent（Writer / Evolutor 等非 ReACT 单次 LLM 调用）的单迭代 Answer 轨迹。
 *
 * 系统 Agent 无 think / act / reflect 循环，仅一次 LLM 调用产出最终结果，
 * 因此轨迹退化为「单条 iteration + answer 步」，与 Work Agent 无规则（no-rule）
 * 直答路径（iteration_index 0 仅含 answer）保持结构一致。
 */
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

/** 构建 info_raw 中的轻量 trace 引用（供 ChatMap 展示，不含完整 iterations）。 */
export function buildLightTraceRef(
  traceId: string,
  answer: string,
  totalTokens: number,
): LightTraceRef {
  return { type: TRACE_LIGHT_TYPE, trace_id: traceId, answer, total_token_usage: totalTokens };
}
