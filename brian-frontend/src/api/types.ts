export interface BlockMeta {
  status: 'idle' | 'streaming' | 'done' | 'error'
  visualState?: 'expanded' | 'collapsed' | 'minimized'
  errorMessage?: string
  errorCode?: string
  progress?: number
  createdAt: number
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

export interface ThinkingBlock extends BlockBase {
  type: 'ThinkingChain'
  content: string
  summary: string
  durationMs: number
  agentInfo?: { name: string; type: string }
  parentMsgId?: string
}

export interface ToolCallBlock extends BlockBase {
  type: 'ToolInvocation'
  toolName: string
  params: Record<string, unknown>
  result?: unknown
  relatedBlockId?: string
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

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  blocks?: Block[]
  sessionId?: string
  workId?: string
  interactId?: string
  citingIds?: string[]
  citedCount?: number
}

export interface ChatSession {
  sessionId: string
  lastMessage: string
  lastTime: number
  messageCount: number
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
}

export interface DagEdge {
  source: string
  target: string
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
  status: 'active' | 'inactive'
}

export interface LearningStats {
  totalLearnCount: number
  knowledgeCount: number
  insightCount: number
  weeklyLearnCount: number
}

export interface LearningProgress {
  mode: string
  running: boolean
  randomFactor: number
  queueSize: number
  completedToday: number
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  components: { name: string; status: string; message?: string }[]
  uptime: number
}

export interface TokenUsage {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  modelDistribution: { model: string; tokens: number }[]
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
