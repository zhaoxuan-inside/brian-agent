/**
 * TaskEvent payload 契约（32 事件，字段级 zod）。
 * 宽松策略：未知字段 passthrough 保留，字段缺失给默认值 —— 执行层发射即合法。
 */
import { z } from 'zod'
import { TaskEventType as T } from './task-event'

export const FunnelMechanismSchema = z.object({
  mechanism: z.string(),
  label: z.string().optional(),
  adopted: z.boolean().optional(),
  candidates: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    score: z.coerce.number().optional(),
    reason: z.string().optional(),
  })).default([]),
  prompt: z.string().optional(),
  output: z.string().optional(),
})
export type FunnelMechanism = z.infer<typeof FunnelMechanismSchema>

const MsgSchema = z.object({
  role: z.string(),
  content: z.string().default(''),
  tool_calls: z.array(z.string()).optional(),
})

export const PayloadSchemas = {
  [T.RunAccepted]: z.object({ run_id: z.string() }).passthrough(),
  [T.RunStarted]: z.object({ agent_id: z.string().optional(), agent_name: z.string().optional() }).passthrough(),
  [T.RunFinished]: z.object({ stop_reason: z.string().default(''), iterations: z.number().optional() }).passthrough(),
  [T.RunFailed]: z.object({ error: z.string().default(''), stop_reason: z.string().optional() }).passthrough(),
  [T.LoopTurnStarted]: z.object({ round: z.number(), thought_mode: z.string().optional(), final_turn: z.boolean().optional() }).passthrough(),
  [T.LoopTurnResult]: z.object({
    round: z.number(),
    finish_reason: z.string().optional(),
    result_preview: z.string().optional(),
    result_length: z.number().optional(),
    tool_calls: z.array(z.string()).optional(),
    next_action: z.string().optional(),
    decision_reason: z.string().optional(),
  }).passthrough(),
  [T.LoopTurnCompleted]: z.object({ round: z.number() }).passthrough(),
  [T.IntentStarted]: z.object({ candidates_count: z.number().optional() }).passthrough(),
  [T.IntentAnalyzed]: z.object({
    score: z.coerce.number().default(0),
    reason: z.string().optional(),
    agent_id: z.string().optional(),
    agent_name: z.string().optional(),
    adopted: z.boolean().optional(),
    candidates_count: z.number().optional(),
    matched_via: z.string().optional(),
  }).passthrough(),
  [T.RunMerge]: z.object({
    children: z.array(z.object({
      sub_run_id: z.string(),
      agent_name: z.string().default(''),
      task: z.string().default(''),
      output: z.string().default(''),
      status: z.string().default(''),
      duration_ms: z.number().optional(),
    })).default([]),
  }).passthrough(),

  [T.AgentSelected]: z.object({
    agent_id: z.string().optional(),
    agent_name: z.string().optional(),
    matched_by: z.string().optional(),
    mechanisms: z.array(FunnelMechanismSchema).optional(),
  }).passthrough(),
  [T.AgentBuilt]: z.object({ agent_id: z.string().optional(), name: z.string().optional(), purpose: z.string().optional() }).passthrough(),
  [T.AgentDisbanded]: z.object({ agent_id: z.string().optional(), reason: z.string().optional() }).passthrough(),
  [T.AgentComponents]: z.object({
    soul_id: z.string().optional(),
    soul_name: z.string().optional(),
    prompt_template_id: z.string().optional(),
    prompt_name: z.string().optional(),
    llm_id: z.string().optional(),
    llm_name: z.string().optional(),
    skills: z.array(z.object({ id: z.string(), brief: z.string().optional(), system: z.boolean().optional() })).optional(),
    mcps: z.array(z.object({ id: z.string(), brief: z.string().optional() })).optional(),
  }).passthrough(),
  [T.ThoughtSelected]: z.object({ thought_mode: z.string().default('CoT'), reason: z.string().optional(), skills_count: z.number().optional(), mcps_count: z.number().optional() }).passthrough(),
  [T.SoulSelected]: z.object({ soul_id: z.string().optional(), brief: z.string().optional() }).passthrough(),
  [T.PromptSelected]: z.object({ template_id: z.string().optional(), prompt_name: z.string().optional(), system: z.string().optional() }).passthrough(),
  [T.SkillSelected]: z.object({ skills: z.array(z.object({ id: z.string(), brief: z.string().optional(), system: z.boolean().optional() })).optional(), reason: z.string().optional() }).passthrough(),
  [T.McpSelected]: z.object({ mcps: z.array(z.object({ id: z.string(), brief: z.string().optional() })).optional(), reason: z.string().optional() }).passthrough(),
  [T.LlmSelected]: z.object({ llm_id: z.string().default(''), llm_name: z.string().optional() }).passthrough(),
  [T.ComponentFunnel]: z.object({
    component: z.string(),
    agent_id: z.string().optional(),
    detail: z.string().optional(),
    mechanisms: z.array(FunnelMechanismSchema).default([]),
  }).passthrough(),

  [T.ContextBuilt]: z.object({
    round: z.number().default(0),
    thought_mode: z.string().optional(),
    message_count: z.number().optional(),
    system: z.string().optional(),
    messages: z.array(MsgSchema).default([]),
    sources: z.array(z.object({
      source: z.string(),
      label: z.string().optional(),
      count: z.number().default(0),
      message_ids: z.array(z.string()).default([]),
    })).optional(),
  }).passthrough(),
  [T.ProfileSnapshot]: z.object({
    version: z.number().optional(),
    summary: z.string().optional(),
    updated_at: z.number().optional(),
    dimensions: z.array(z.object({
      key: z.string(),
      label: z.string().optional(),
      value: z.string().optional(),
      confidence: z.coerce.number().optional(),
      evidence: z.array(z.string()).optional(),
    })).default([]),
  }).passthrough(),

  [T.ThinkCreated]: z.object({ msg_id: z.string().optional(), part_id: z.string().optional() }).passthrough(),
  [T.ThinkDelta]: z.object({ delta: z.string().default('') }).passthrough(),
  [T.ReplyCreated]: z.object({ msg_id: z.string().optional(), part_id: z.string().optional() }).passthrough(),
  [T.ReplyDelta]: z.object({ delta: z.string().default('') }).passthrough(),

  [T.SkillStarted]: z.object({ part_id: z.string().optional(), tool_id: z.string().optional(), skill_id: z.string().optional(), input: z.unknown().optional() }).passthrough(),
  [T.SkillResult]: z.object({
    part_id: z.string().optional(),
    tool_id: z.string().optional(),
    skill_id: z.string().optional(),
    status: z.string().optional(),
    output: z.unknown().optional(),
    elapsed_ms: z.number().optional(),
  }).passthrough(),

  [T.LlmInvoked]: z.object({
    caller: z.string().default(''),
    llm_id: z.string().default(''),
    attempt: z.number().default(1),
    status: z.string().default('ok'),
    input_tokens: z.number().default(0),
    output_tokens: z.number().default(0),
    duration_ms: z.number().default(0),
    connect_ms: z.number().default(0),
    ttft_ms: z.number().default(0),
    stream_ms: z.number().default(0),
    error: z.string().optional(),
  }).passthrough(),

  [T.PermissionAsked]: z.object({
    permission_id: z.string(),
    tool_id: z.string().optional(),
    skill_id: z.string().optional(),
    input: z.unknown().optional(),
    kind: z.string().optional(),
  }).passthrough(),
  [T.PermissionAnswered]: z.object({
    permission_id: z.string(),
    tool_id: z.string().optional(),
    skill_id: z.string().optional(),
    approved: z.boolean(),
    auto_approved: z.boolean().optional(),
    remember: z.boolean().optional(),
  }).passthrough(),

  [T.EvaluationStarted]: z.object({ work_id: z.string().optional(), mode: z.string().optional() }).passthrough(),
  [T.EvaluationCompleted]: z.object({
    eval_type: z.string().optional(),
    scores: z.record(z.unknown()).optional(),
    suggestions: z.array(z.string()).optional(),
    need_optimize: z.boolean().optional(),
  }).passthrough(),

  [T.WriterStarted]: z.object({ work_id: z.string().optional() }).passthrough(),
  [T.WriterCompleted]: z.object({ format: z.string().optional(), length: z.number().optional(), has_mermaid: z.boolean().optional() }).passthrough(),

  [T.ErrorOccurred]: z.object({ error: z.string().default(''), agent_id: z.string().optional() }).passthrough(),
} as const

/** 解析并校验 payload（未知字段保留）；schema 未登记的类型原样透传 */
export function parsePayload(type: string, payload: unknown): unknown {
  const schema = (PayloadSchemas as Record<string, z.ZodTypeAny | undefined>)[type]
  if (!schema) return payload
  const parsed = schema.safeParse(payload ?? {})
  return parsed.success ? parsed.data : (payload ?? {})
}
