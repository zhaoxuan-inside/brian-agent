export interface BlockMeta {
  status: 'idle' | 'streaming' | 'done' | 'error'
  visualState?: 'expanded' | 'collapsed' | 'minimized'
  errorMessage?: string
  errorCode?: string
  progress?: number
  createdAt: number
  updatedAt: number
}

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

export interface ThinkingStep {
  phase: 'THINK' | 'ACT' | 'REFLECT' | string
  iteration?: number
  content?: string
  toolCalls?: Array<{ toolName?: string; toolType?: string; params?: unknown; result?: unknown }>
  reflection?: string
  passed?: boolean
  tokenUsage?: number
  elapsedMs?: number
  
  input?: string
  
  output?: string
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
    llm?: { id: string; name: string }
    soul?: { id: string; name: string }
    prompt?: { id: string; name: string }
    skills?: Array<{ id: string; name: string }>
    mcps?: Array<{ id: string; name: string }>
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
  totalCount?: number
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
  runId?: string
  workId?: string
  sessionId?: string
}

export interface FeedbackProcessLogRecord {
  id: string
  created: number
  process_id: string
  feedback_id: string
  action: 'submitted' | 'disbanded' | 'skipped'
  agent_id: string
  run_id: string
  work_id: string
  rating: number
  details: string
}

export interface FeedbackProcessLogListItem extends FeedbackProcessLogRecord {
  
  source?: 'user' | 'agent'
  
  category?: string
  
  comment?: string
  
  user_question?: string
}

export interface FeedbackProcessLogDetail {
  log: FeedbackProcessLogRecord | null
  feedback: {
    id: string; created: number; feedback_id: string
    source: string; agent_id: string; work_id: string; run_id: string
    rating: number; comment: string; suggestions: string; category: string
  } | null
  user_question: string
  system_answer: string
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
  run_id: string
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
  runId?: string
  traceId?: string
  citingIds?: string[]
  citedCount?: number
  citingCount?: number
  citedInfoIds?: string[]
  citingInfoIds?: string[]
  pin?: boolean
  
  permission?: PermissionCardData
  
  askUser?: AskUserCardData
}

export interface AskUserCardData {
  askId: string
  question: string
  kind: 'clarify' | 'confirm'
  status: 'pending' | 'answered'
  askedAt?: number
  answeredAt?: number
}

export interface PermissionCardData {
  permissionId: string
  toolId: string
  input: unknown
  status: 'pending' | 'allowed' | 'denied'
  askedAt?: number
  answeredAt?: number
  
  runId?: string
}

export interface ThinkingTimelineItem {
  seq: number
  ts: number
  event: string
  title: string
  detail?: string
  kind: string
  
  target?: string
  
  tooltip?: string
  
  elapsedMs?: number
}

export interface ThinkingToolTrace {
  index: number
  partId: string
  
  targetKey?: string
  toolId: string
  params: unknown
  result: unknown
  status: string
  elapsedMs: number
  tokenCount: number
  
  builtin?: boolean
  
  componentKind?: 'skill' | 'mcp' | ''
  
  componentId?: string
  
  componentName?: string
  
  componentSubTool?: string
}

export interface ThinkingPermissionTrace {
  permissionId: string
  
  targetKey?: string
  toolId: string
  input: unknown
  status: string
  askedAt: number
  answeredAt: number
  autoApproved?: boolean
  
  builtin?: boolean
  
  componentKind?: 'skill' | 'mcp' | ''
  
  componentId?: string
  
  componentName?: string
  
  componentSubTool?: string
}

export interface ThinkingRunTrace {
  id: string
  status: string
  agentDefId: string
  agentName: string
  llmId?: string
  soulId?: string
  durationMs: number
  tokenUsage: number
  
  inputTokens?: number
  
  outputTokens?: number
  budgetUsed: number
  toolCount: number
  permissionCount: number
  thinkChars: number
  replyChars: number
  startedAt: number
  settledAt: number
  
  components?: {
    agent?: { id: string; name: string } | null
    llm?: { id: string; name: string } | null
    prompt?: { id: string; name: string } | null
    soul?: { id: string; name: string } | null
    skills: Array<{ id: string; name: string }>
    mcps: Array<{ id: string; name: string }>
  }
}

export interface ThinkingContextRound {
  round: number
  
  targetKey?: string
  messageCount: number
  messages: Array<{ role: string; content: string }>
}

export interface ThinkingNodeTrace {
  seq: number
  
  targetKey: string
  title: string
  kind: string
  detail?: string
  
  fields: Array<{ label: string; value: string; id?: string }>
}

export interface ThinkingTrace {
  run: ThinkingRunTrace
  timeline: ThinkingTimelineItem[]
  tools: ThinkingToolTrace[]
  permissions: ThinkingPermissionTrace[]
  
  nodes: ThinkingNodeTrace[]
  contextRounds: ThinkingContextRound[]
}

export interface IntentConfirmation {
  session_id: string
  work_id: string
  run_id: string
  original_query: string
  understood_requirement: string
  match_score: number
  threshold_score: number
  reasoning: string
}

export interface ChatSession {
  sessionId: string
  sessionTitle?: string
  lastMessage: string
  lastTime: number
  created?: number
  createdTime?: number
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
  runId?: string
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
  role?: 'user' | 'assistant' | 'system'
  infoType?: string
  creatorRole?: string
  content: string
  tags: string[]
  sessionId?: string
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

/** 后端 browse-dir 返回的本机目录列表(仅子目录);drives 仅 Windows 盘符根层级返回 */
export interface DirListing {
  path: string
  parent: string | null
  drives?: string[]
  entries: { name: string; path: string }[]
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

export interface DocumentAnnotation {
  id: string
  file_id: string
  selection_text: string
  selection_start: number
  selection_end: number
  question: string
  result: string
  llm_id: string
  created: number
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

export interface ConfigTreeLayer {
  layer: string
  label: string
  desc: string
  readable: boolean
  writable: boolean
  modules: ConfigTreeModule[]
}

export interface ConfigHistoryRecord {
  id: string
  config_key: string
  old_value: unknown
  new_value: unknown
  change_time: number
  operator: string
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

export type InfoTabKey = 'history' | 'memory' | 'library' | 'tagGraph' | 'keywordGraph' | 'profile'
