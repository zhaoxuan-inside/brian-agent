export interface BlockMeta {
  status: 'idle' | 'streaming' | 'done' | 'error'
  visualState?: 'expanded' | 'collapsed' | 'minimized'
  errorMessage?: string
  errorCode?: string
  progress?: number
  createdAt: number
  updatedAt: number
}

// ============================================================
// Agent 执行运行时状态（每个 Agent 独立的"思考中"状态）
// ============================================================

export type AgentExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'ERROR'

export interface AgentRuntimeInfo {
  status: AgentExecutionStatus
  agentName?: string
  updatedAt: number
}

export interface BlockBase {
  id: string
  msgId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  type: string
  meta: BlockMeta
}

export interface TextBlock extends BlockBase {
  type: 'TextParagraph'
  content: string
  citingIds?: string[]
  citedCount?: number
}

export interface HeadingBlock extends BlockBase {
  type: 'Heading'
  level: number
  content: string
}

export interface CodeBlock extends BlockBase {
  type: 'CodeBlock'
  language: string
  content: string
}

// ===== 修改后的 ThinkingBlock 定义（支持完整 Agent 上下文、输入输出及步骤轨迹） =====
export interface ThinkingStep {
  phase: 'THINK' | 'ACT' | 'REFLECT' | string
  iteration?: number
  content?: string
  toolCalls?: Array<{ toolName?: string; toolType?: string; params?: unknown; result?: unknown }>
  reflection?: string
  passed?: boolean
  tokenUsage?: number
  elapsedMs?: number
}

export interface ThinkingBlock extends BlockBase {
  type: 'ThinkingChain'
  content: string
  summary: string
  durationMs: number
  tokenUsage?: number
  inputTokens?: number
  outputTokens?: number
  thinkingStrategy?: string
  prompt?: string
  rawResponse?: string
  agentInfo?: {
    id?: string
    name: string
    type?: string
    role?: string
    llmId?: string
    soulId?: string
    skills?: string[]
    mcps?: string[]
  }
  context?: {
    userProfile?: Record<string, unknown>
    recentWorks?: unknown[]
    selectedMessages?: unknown[]
    citingMessages?: unknown[]
    timelineMessages?: unknown[]
    pinnedMessages?: unknown[]
    similarityMessages?: unknown[]
    tagRelativeMessages?: unknown[]
    keywordMessages?: unknown[]
    randomMessages?: unknown[]
    randomMaxPercent?: number
    categoryIds?: {
      selected?: string[]
      pinned?: string[]
      timeline?: string[]
      citing?: string[]
      tag_relative?: string[]
      similarity?: string[]
      keyword?: string[]
      random?: string[]
    }
    customContext?: string
    strategy?: string
  }
  input?: string | Record<string, unknown>
  output?: string | Record<string, unknown>
  steps?: ThinkingStep[]
  parentMsgId?: string
}

export interface ToolCallBlock extends BlockBase {
  type: 'ToolInvocation'
  toolName: string
  params: Record<string, unknown>
  result?: unknown
  relatedBlockId?: string
}

// ============================================================
// Planning 策略拆解（Task DAG / Agent DAG / 编排执行步骤）
// ============================================================

export interface TaskDagNode {
  id: string
  label: string
  domain?: string
  content?: string
  complexity?: number
  priority?: number
  dependencies?: string[]
}

export interface TaskDagEdge {
  source: string
  target: string
}

export interface TaskDagData {
  nodes: TaskDagNode[]
  edges: TaskDagEdge[]
}

export interface DagNodeItem {
  id: string
  label: string
  domain?: string
  content?: string
  status?: string
  agentName?: string
  agentId?: string
  taskId?: string
  input?: string
  output?: string
  elapsedMs?: number
  tokenUsage?: number
}

export interface DagEdgeItem {
  source: string
  target: string
  label?: string
}

export interface AgentDagData {
  planId?: string
  totalCount?: number
  taskDag?: TaskDagData
  nodes: DagNodeItem[]
  edges: DagEdgeItem[]
}

export interface DagExecutionStep {
  node_id: string
  node_type: string
  status: 'RUNNING' | 'SUCCESS' | 'ERROR' | string
  elapsed_ms?: number
  error?: string
}

export interface PlanningData {
  planId?: string
  taskDag?: TaskDagData
  agentDag?: AgentDagData
  executionSteps?: DagExecutionStep[]
  status: 'idle' | 'streaming' | 'done'
}

export interface ArtifactBlock extends BlockBase {
  type: 'ArtifactPreview'
  title: string
  previewType: 'image' | 'chart' | 'document' | 'code'
  thumbnailUrl?: string
  data?: unknown
}

export interface ErrorBlock extends BlockBase {
  type: 'ErrorFallback'
  message: string
  errorCode: string
  retryAvailable: boolean
  traceId?: string
}

export interface UnsupportedBlock extends BlockBase {
  type: 'Unsupported'
  originalType: string
  rawData: unknown
}

export interface RelationLineBlock extends BlockBase {
  type: 'RelationLine'
  sourceBlockId: string
  targetBlockId: string
}

export interface FeedbackBlock extends BlockBase {
  type: 'Feedback'
  msgId: string
  rating?: number
  liked?: boolean
  traceId?: string
  workId?: string
  sessionId?: string
}

export type Block =
  | TextBlock
  | HeadingBlock
  | CodeBlock
  | ThinkingBlock
  | ToolCallBlock
  | ArtifactBlock
  | ErrorBlock
  | UnsupportedBlock
  | RelationLineBlock
  | FeedbackBlock

export interface MessageGroup {
  msgId: string
  blocks: Block[]
}

export interface SSEChatEvent {
  event: string
  data: Record<string, unknown>
}

export type SSEMessageType = 'TEXT' | 'DAG' | 'CONTEXT' | 'AGENT_SPEC' | 'TRACE' | 'CONTROL'

export interface BrianSSEMessage<T = unknown> {
  msg_id: string
  seq: number
  session_id: string
  interact_id: string
  work_id: string
  agent_id?: string
  node_id?: string
  task_id?: string
  event: string
  msg_type: SSEMessageType
  full_length?: number
  chunk_length: number
  accumulated_length: number
  timestamp: number
  data: T
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  blocks?: Block[]
  agentDag?: AgentDagData
  sessionId?: string
  workId?: string
  interactId?: string
  traceId?: string
  citingIds?: string[]
  citedCount?: number
  citingCount?: number
  citedInfoIds?: string[]
  citingInfoIds?: string[]
  pin?: boolean
}

// ============================================================
// 需求理解确认 / 需求补充（流式事件驱动的对话区内联卡片）
// ============================================================

/** 需求理解确认：IntentAgent 匹配得分低于阈值时，由 intent_confirmation_required 事件驱动 */
export interface IntentConfirmation {
  session_id: string
  work_id: string
  interact_id: string
  original_query: string
  understood_requirement: string
  match_score: number
  threshold_score: number
  reasoning: string
}

/** 需求补充：Planner 识别出需用户补充参数才能执行的任务时，由 clarification_required 事件驱动 */
export interface ClarificationRequest {
  session_id: string
  work_id: string
  interact_id: string
  original_query: string
  clarifications: Array<{ question: string; domain?: string; answer: string }>
}

export interface ChatSession {
  sessionId: string
  sessionTitle?: string
  lastMessage: string
  lastTime: number
  messageCount: number
  qaCount?: number
  questionChars?: number
  answerChars?: number
  inputTokens?: number
  outputTokens?: number
  tags?: string[]
}

export interface AgentChainNode {
  id: string
  name: string
  type: string
  status: 'pending' | 'running' | 'done' | 'error'
  input?: unknown
  output?: unknown
  tokenUsage?: number
  durationMs?: number
  children: string[]
}

export interface DagNode {
  id: string
  label: string
  x: number
  y: number
  status: string
  agent_id?: string
}

export interface DagEdge {
  source: string
  target: string
}

export interface ChatMapNode {
  id: string
  infoId: string
  infoType: string
  role: string
  summary: string
  info: string
  infoLength: number
  created: number
  pin: boolean
  citingCount: number
  citedCount: number
  citingInfoIds: string[]
  citedInfoIds: string[]
  workId?: string
  interactId?: string
  traceId?: string
  handleResultType?: string
  x: number
  y: number
}

export interface ChatMapEdge {
  source: string
  target: string
  edgeType: 'QUESTION_ANSWER' | 'CITATION' | 'FOLLOW_UP'
}

export interface MemoryItem {
  id: string
  type: 'semantic' | 'episodic' | 'procedural' | 'working'
  content: string
  tags: string[]
  confidence: number
  createdAt: number
  updatedAt: number
}

export interface LibraryPath {
  id: string
  name: string
  path: string
  category: string
  description: string
  createdAt: number
  totalFiles?: number
  learnedFiles?: number
  enableSelfLearning?: boolean
}

export interface LibraryFileEntry {
  id: string
  name: string
  path: string
  relativePath: string
  parentPath: string
  isDirectory: boolean
  size: number
  status: string
  learnedAt: number
}

export interface LibraryFilePage {
  files: LibraryFileEntry[]
  has_more: boolean
  next_cursor: string | null
}

export interface LibraryTreeNode {
  file_id: string
  name: string
  relative_path: string
  is_directory: boolean
  children: LibraryTreeNode[]
}

export interface GraphNode {
  id: string
  name: string
  weight: number
  degree: number
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
}

export interface ModelProvider {
  id: string
  providerName: string
  baseURL: string
  apiKey: string
  models: ModelInfo[]
  enabled: boolean
}

export interface ModelInfo {
  id: string
  modelName: string
  maxTokens: number
  supportsVision: boolean
  supportsTools: boolean
  isDefault: boolean
  enable: boolean
}

export interface LearningStats {
  totalLearnCount: number
  knowledgeCount: number
  insightCount: number
  weeklyLearnCount: number
  trend?: { date: string; count: number }[]
}

export interface LearningProgress {
  mode: string
  running: boolean
  randomFactor: number
  queueSize: number
  completedToday: number
  modes?: Record<string, { auto: boolean; randomFactor: number }>
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  components: { name: string; status: string; message?: string; details?: Record<string, string | number> }[]
  uptime: number
}

export interface TokenUsage {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  modelDistribution: { model: string; tokens: number; input_tokens: number; output_tokens: number }[]
}

export interface UserProfile {
  id: string
  name: string
  email: string
  avatar?: string
  interests: string[]
  updatedAt: number
}

// ============================================================
// Config tree types
// ============================================================

export interface ConfigTreeLayer {
  layer: string
  label: string
  desc: string
  readable: boolean
  writable: boolean
  modules: ConfigTreeModule[]
}

export interface ConfigTreeModule {
  module: string
  label: string
  desc: string
  readable: boolean
  writable: boolean
  effective_readable: boolean
  effective_writable: boolean
  entity_types: string[]
  categories: ConfigTreeCategory[]
}

export interface ConfigTreeCategory {
  category: string
  label: string
  desc: string
  items: ConfigTreeItem[]
}

export interface ConfigTreeItem {
  config_key: string
  config_name: string
  config_description?: string
  config_type: string
  config_default: unknown
  config_enum_values: unknown[] | null
  readable: boolean
  writable: boolean
  effective_readable: boolean
  effective_writable: boolean
  current_value: unknown
}

// ============================================================
// MQ types (message queue)
// ============================================================

export interface MQMessage {
  id: string
  queue: string
  payload: unknown
  priority: number
  status: string
  retry_count: number
  max_retries: number
  created: number
  updated: number
  processed_at: number | null
}

export interface MQStats {
  pending: number
  processing: number
  completed: number
  failed: number
  total: number
}

export interface McpUsageRecord {
  mcp_install_id: string
  mcp_title: string
  usage_date: string
  usage_count: number
}

// ============================================================
// 用户画像 types
// ============================================================

export interface ProfileDimension {
  value: unknown
  confidence: number
  evidence: Array<Record<string, unknown>>
  stability?: 'stable' | 'drifting' | 'emerging'
  direction_key?: string
  direction_name?: string
}

export interface ProfileEvolutionItem {
  version: number
  generated_at: number
  profile_summary: string
  change_summary: string
}

export interface UserProfileData {
  session_id?: string
  profile_version: number
  generated_at: number
  dimensions: Record<string, ProfileDimension>
  profile_summary: string
  evolution_trend: ProfileEvolutionItem[]
}

export interface ProfileHistoryItem {
  id: string
  version: number
  session_id: string
  generated_at: number
  profile_summary: string
  change_summary: string
}

export interface ProfileVersionData {
  version: number
  generated_at: number
  session_id: string
  dimensions: Record<string, ProfileDimension>
  profile_summary: string
}

// ============================================================
// 可视化 types
// ============================================================

export interface VisualizedMessage {
  info_id: string
  info_type: string
  info_creator_role: string
  info: string
  info_length: number
  created: number
  pin: boolean
  citing_count: number
  citing_info_ids: string[]
  cited_info_ids: string[]
  context_source: string | null
  parent_info_ids: string[]
  handle_result_type?: string
}

export interface MessageGraphNode {
  id: string
  label: string
  info_id: string
  info_type?: string
  info_creator_role?: string
  handle_result_type?: string
  info_summary: string
  citing_count: number
  cited_count: number
}

export interface MessageGraphEdge {
  id: string
  from: string
  to: string
  citing_info_id: string
  cited_info_id: string
  edge_type: string
}

export interface AgentDAGNode {
  agent_id: string
  agent_name?: string
  agent_type?: string
  status?: string
  [key: string]: unknown
}

export interface AgentDAG {
  graph?: { nodes?: AgentDAGNode[]; edges?: Array<Record<string, unknown>> }
  nodes?: AgentDAGNode[]
  component_refs?: Record<string, unknown>
  context_source_refs?: Record<string, unknown>
  result_refs?: Record<string, unknown>
  [key: string]: unknown
}

export interface AgentTraceStep {
  step: number
  phase: string
  content: string
  token_usage: number
  elapsed_ms: number
  timestamp: string
  tool_calls?: Array<Record<string, unknown>>
}

export interface AgentTrace {
  trace_id: string
  agent_id: string
  agent_name: string
  agent_type: string
  status: string
  total_elapsed_ms: number
  total_token_usage: number
  iterations: number
  steps: AgentTraceStep[]
  final_answer?: Record<string, unknown>
}

export interface ComponentMatchConfig {
  regen_rate: number
  similarity_threshold: number
  prompt_template_id?: string
}

/** 信息页页签标识 */
export type InfoTabKey = 'history' | 'memory' | 'library' | 'tagGraph' | 'keywordGraph' | 'profile'
