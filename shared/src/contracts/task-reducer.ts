/**
 * RunObservation 统一投影模型与 Reducer（OBS v2 · ADR-013）
 * 全项目唯一的事件→视图状态映射：实时（SSE 逐事件）与历史（task_event_record 重放）走同一 reduce。
 * seq 幂等：ev.seq <= lastSeq 直接返回原状态，支撑"历史拉取 + 实时叠加"合流。
 */
import type { TaskEvent } from './task-event'
import type { FunnelMechanism } from './task-event-payloads'

export type RunPhase =
  | 'accepted' | 'assembling' | 'reasoning' | 'acting'
  | 'writing' | 'evaluating' | 'settled' | 'failed'

export interface TimelinePoint {
  seq: number
  ts: number
  type: string
  kind: 'lifecycle' | 'lifecycle-ok' | 'lifecycle-fail' | 'intent' | 'agent' | 'model'
    | 'context' | 'think' | 'reply' | 'tool' | 'tool-ok' | 'tool-fail'
    | 'permission' | 'permission-ok' | 'eval' | 'writer'
  title: string
  detail: string
  target: string
  elapsedMs?: number
  spanDepth: number
  /** 选中/命中原因（agent、llm、prompt、soul、skill、mcp、thought 等选举类步骤） */
  reason?: string
  /** Agent 匹配方式（session_affinity / exact / ref / election / built） */
  matchedBy?: string
  /** 组件实例锚点（跳转配置中心用；ID 为唯一关联键，名称仅展示） */
  agentId?: string
  agentName?: string
  llmId?: string
  llmName?: string
  promptId?: string
  promptName?: string
  soulId?: string
  soulName?: string
  skills?: Array<{ id: string; name?: string; system?: boolean }>
  mcps?: Array<{ id: string; name?: string }>
  /** 第 0 轮记忆召回：各维度计数与召回条目（tab 切换展示） */
  memorySources?: ContextSourceCount[]
  memoryItems?: MemoryCategoryItems[]
  /** 模型调用明细（首Token/思考/响应拆分 + token + 原始输出） */
  llmDetail?: LlmInvokeDetail
  /** 上下文构建阶段来源（主循环缺省 / writer / eval） */
  stage?: 'writer' | 'eval'
}

/** 记忆召回：单个维度的条目内容（每条已由服务端截断） */
export interface MemoryCategoryItems {
  source: string
  label: string
  entries: Array<{ id?: string; text: string }>
}

/** llm.invoked 阶段拆分明细 */
export interface LlmInvokeDetail {
  llmId: string
  ttftMs: number
  thinkingMs?: number
  responseMs?: number
  tokensIn: number
  tokensOut: number
  caller: string
  output?: string
}

export interface ThinkingRound {
  round: number
  text: string
  startedTs: number
  durationMs?: number
  thoughtMode?: string
  finishReason?: string
  nextAction?: string
}

export interface ContextSourceCount {
  source: string
  label: string
  count: number
  messageIds: string[]
}

export interface ContextRound {
  round: number
  messageCount: number
  thoughtMode?: string
  system?: string
  messages: Array<{ role: string; content: string; tool_calls?: string[] }>
  sources?: ContextSourceCount[]
  /** 构建阶段（缺省=主循环轮次；writer/eval 为对应子阶段的上下文） */
  stage?: 'writer' | 'eval'
}

export interface ToolTrace {
  partId: string
  toolId: string
  name: string
  params?: unknown
  output?: unknown
  status: 'running' | 'ok' | 'error'
  startedTs: number
  elapsedMs?: number
  executeId?: string
}

export interface PermissionTrace {
  permissionId: string
  toolId: string
  input?: unknown
  status: 'pending' | 'allowed' | 'denied'
  askedTs: number
  answeredTs?: number
}

export interface ComponentSpec {
  soul?: { id: string; name: string }
  prompt?: { id: string; name: string }
  llm?: { id: string; name: string }
  skills: Array<{ id: string; name: string; system?: boolean }>
  mcps: Array<{ id: string; name: string }>
}

export interface ProfileSnapshot {
  version?: number
  summary?: string
  updatedAt?: number
  dimensions: Array<{ key: string; label?: string; value?: string; confidence?: number; evidence?: string[] }>
}

export interface MergeChild {
  subRunId: string
  agentName: string
  task: string
  output: string
  status: string
  durationMs?: number
}

export interface RunSummary {
  startedTs: number
  settledTs?: number
  tokensIn: number
  tokensOut: number
  llmCalls: number
  toolCalls: number
  permissionCount: number
  agentId?: string
  agentName?: string
  llmId?: string
  thoughtMode?: string
}

/** 按 caller 归组的阶段用量（llm.invoked 聚合，供分布条渲染） */
export interface UsageStage {
  label: string
  tokensIn: number
  tokensOut: number
  durationMs: number
  calls: number
}

export interface RunObservation {
  runId: string
  sessionId: string
  workId: string
  phase: RunPhase
  round: number
  lastSeq: number
  stopReason: string
  error: string
  summary: RunSummary
  usageStages: UsageStage[]
  timeline: TimelinePoint[]
  thinking: { active: boolean; rounds: ThinkingRound[] }
  contextRounds: ContextRound[]
  tools: ToolTrace[]
  permissions: PermissionTrace[]
  reply: { msgId: string; text: string; createdTs?: number }
  components: ComponentSpec | null
  /** agent.match 选举明细（agent.selected 事件透传，ADR-013） */
  agentMatch: FunnelMechanism[] | null
  funnels: Record<string, FunnelMechanism[]>
  merge: { children: MergeChild[] } | null
  profile: ProfileSnapshot | null
}

export function initialObservation(ev: TaskEvent): RunObservation {
  return {
    runId: ev.run_id,
    sessionId: ev.session_id,
    workId: ev.work_id,
    phase: 'accepted',
    round: 0,
    lastSeq: 0,
    stopReason: '',
    error: '',
    summary: {
      startedTs: ev.ts, settledTs: undefined,
      tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0, permissionCount: 0,
      agentId: undefined, agentName: undefined, llmId: undefined, thoughtMode: undefined,
    },
    usageStages: [],
    timeline: [],
    thinking: { active: false, rounds: [] },
    contextRounds: [],
    tools: [],
    permissions: [],
    reply: { msgId: '', text: '' },
    components: null,
    agentMatch: null,
    funnels: {},
    merge: null,
    profile: null,
  }
}
