export type NodeType = 'memory' | 'tag' | 'concept' | 'entity';
export type AgentType = 'root' | 'work' | 'sub' | 'coordinator' | 'searcher' | 'caller' | 'skiller' | 'generator' | 'custom';
export type AgentRole = 'planner' | 'worker' | 'evaluator';
export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed';
export type MemoryType = 'episodic' | 'semantic' | 'procedural';
export type TagDimension = 'domain' | 'industry' | 'concept' | 'action' | 'sentiment';
export type FeedbackRating = 'good' | 'neutral' | 'bad';
export type FeedbackStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';
export type ModelSelectionStrategy = 'best_quality' | 'lowest_cost' | 'fastest' | 'most_available' | 'auto';
export type StrategyType = 'react' | 'plan-execute' | 'cot' | 'conditional-graph' | 'hybrid';

export interface TagSet {
  domain: string[];
  industry: string[];
  concept: string[];
  action: string[];
  sentiment: string;
}

export interface MemoryNode {
  id: string; type: NodeType; content: string;
  metadata: Record<string, unknown>;
  salienceScore: number; emotionalTag?: string;
  retrievalCount: number; lastRetrieved?: number;
  strength: number; decayRate: number;
  createdAt: number; updatedAt: number;
}

export interface MemoryEdge {
  id: string; sourceNodeId: string; targetNodeId: string;
  weight: number; label?: string; activationCount: number;
  direction: 'undirected' | 'directed';
  createdAt: number; updatedAt: number;
}

export interface UnifiedMemoryItem {
  id: string; type: MemoryType;
  rawContent: string; summary: string; semanticFingerprint: string;
  role: 'user' | 'assistant' | 'system' | 'agent'; agentId?: string;
  tags: TagSet;
  accessHistory: { timestamp: number; context: string; score: number }[];
  createdAt: number; lastAccessedAt: number; temporalDecay: number;
  relatedMemories: { memoryId: string; relation: string; weight: number }[];
}

export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string; }

export interface LLMResponse { content: string; toolCalls?: ToolCall[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; latencyMs: number; }

export interface ToolCall { id: string; name: string; arguments: Record<string, unknown>; }

export interface Tool { name: string; description: string; inputSchema: Record<string, unknown>; execute: (params: Record<string, unknown>) => Promise<string>; }

export interface McpPackage { id: string; name: string; displayName: string; description: string; author: string; version: string; repository: string; packageName: string; category: string; tags: string[]; tools: McpTool[]; installed: boolean; installedVersion?: string; active: boolean; }

export interface McpTool { name: string; description: string; inputSchema: Record<string, unknown>; }

export interface InstalledMcp { id: string; packageName: string; displayName: string; version: string; tools: McpTool[]; active: boolean; serverStatus: 'running' | 'stopped' | 'error'; installedAt: string; }

export interface AgentSkill { id: string; name: string; description: string; mode: 'user' | 'manual'; userInput?: string; userOutput?: string; userProcess?: string; normalizedSpec?: { input: Record<string, unknown>; output: Record<string, unknown>; process: string; constraints: string[]; examples: { input: string; output: string }[] }; manualContent?: string; review?: { score: number; breakdown: { completeness: number; clarity: number; executability: number; safety: number }; summary: string; suggestions: string[]; reviewedAt: string }; active: boolean; createdAt: string; updatedAt: string; }

export interface CustomAgent { id: string; name: string; role: string; description: string; strategy: { type: StrategyType; maxIterations: number; stopConditions: string[] }; llm: { providerId: string; modelId: string; temperature: number; maxTokens: number }; prompt: { system: string; instruction: string; variables: { name: string; description: string; required: boolean }[] }; skillIds: string[]; mcpIds: string[]; soulId: string; workIds: string[]; sources: { knowledgeBase: string[]; webSearch: boolean; searchEngine?: string }; active: boolean; isSystem?: boolean; createdAt: string; updatedAt: string; }

export interface Feedback { id: string; messageId: string; conversationId: string; userId: string; rating: FeedbackRating; reason?: string; errorInfo?: { errorType: string; errorMessage: string; stackTrace?: string; timestamp: number }; includeContext: boolean; originalQuestion?: string; originalAnswer?: string; contextMessages?: { role: string; content: string; timestamp: number }[]; logTraceId?: string; relatedLogs?: { level: string; module: string; message: string; timestamp: number }[]; status: FeedbackStatus; createdAt: number; updatedAt: number; }

export interface RegisteredModel { id: string; providerId: string; providerType: 'openai' | 'anthropic' | 'google'; modelName: string; displayName: string; capabilities: { chat: boolean; stream: boolean; toolCall: boolean; embed: boolean }; config: { temperature: number; maxTokens: number; apiKey: string; baseUrl: string }; quota: { daily: number; weekly: number; monthly: number; used: number }; stats: { totalCalls: number; totalTokens: number; avgLatency: number; successRate: number }; status: 'active' | 'inactive' | 'error'; registeredAt: number; }

export interface WorkAgent { id: string; name: string; taskFeatures: Record<string, unknown>; strategy: StrategyType; llm: { providerId: string; modelId: string; temperature: number; maxTokens: number }; prompt: { system: string; instruction: string }; skillIds: string[]; mcpIds: string[]; soulId: string; strength: number; useCount: number; lastUsedAt: number; feedbackHistory: { rating: FeedbackRating; score: number; timestamp: number }[]; reliability: number; createdAt: number; updatedAt: number; }

export interface GraphState { userMessage: string; taskPlan: { id: string; description: string; agentType: string; dependencies: string[] }[]; subTaskResults: Map<string, unknown>; memoryContext: UnifiedMemoryItem[]; iterationCount: number; maxIterations: number; currentStrategy: StrategyType; qualityScore: number; qualityThreshold: number; finalOutput: string; errors: { message: string; stack?: string }[]; trace: { step: string; timestamp: number; data: Record<string, unknown> }[]; checkpoints: Map<string, GraphState>; }

export interface LearningQueueItem { id: string; knowledgeItem: { content: string; source: string; confidence: number }; priority: number; status: 'pending' | 'approved' | 'skipped' | 'learning' | 'completed'; createdAt: number; }

export interface LearningBatch { id: string; topic: string; items: LearningQueueItem[]; relevanceScore: number; createdAt: number; }

export interface LearningPlan { id: string; batchId: string; phases: { phase: number; name: string; status: 'pending' | 'in_progress' | 'completed'; items: string[]; startedAt?: number; completedAt?: number }[]; createdAt: number; }