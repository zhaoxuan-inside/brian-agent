export type NodeType = 'memory' | 'tag' | 'concept' | 'entity';
export type AgentType = 'root' | 'work' | 'sub' | 'coordinator' | 'searcher' | 'caller' | 'skiller' | 'generator';
export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed';
export type MessageType = 'agent_created' | 'agent_status_change' | 'agent_output' | 'agent_complete' | 'message_received' | 'message_response' | 'feedback_submitted' | 'error';
export type DataType = 'conversation' | 'preferences' | 'memory' | 'all';
export type ConsentState = {
    granted: boolean;
    timestamp: number;
    scope: DataType[];
};
export type CommandRiskLevel = 'safe' | 'dangerous' | 'high_risk';
export type UserPreferenceCategory = 'aesthetic' | 'content' | 'communication' | 'behavior';
export interface MemoryNode {
    id: string;
    type: NodeType;
    content: string;
    metadata: Record<string, unknown>;
    salienceScore: number;
    emotionalTag?: string;
    retrievalCount: number;
    lastRetrieved?: number;
    strength: number;
    decayRate: number;
    createdAt: number;
    updatedAt: number;
}
export interface MemoryEdge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    weight: number;
    label?: string;
    activationCount: number;
    direction: 'undirected' | 'directed';
    createdAt: number;
    updatedAt: number;
}
export interface UserIdentity {
    name: string;
    age?: number;
    gender?: string;
    occupation?: string;
    interests?: string[];
}
export interface UserPreference {
    id: string;
    category: UserPreferenceCategory;
    key: string;
    value: string;
    confidence: number;
    source: string;
    timestamp: number;
}
export interface EmotionalPattern {
    id: string;
    emotionType: string;
    triggers: string[];
    intensity: number;
    valence: 'positive' | 'negative' | 'neutral' | 'mixed';
}
export interface UserProfile {
    id: string;
    identity: UserIdentity;
    preferences: UserPreference[];
    emotionalPatterns: EmotionalPattern[];
    learningHistory: LearningEvent[];
}
export interface LearningEvent {
    id: string;
    type: 'passive' | 'active';
    content: string;
    insights: string[];
    timestamp: number;
}
export interface Message {
    id: string;
    userId: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: number;
    rating?: 'good' | 'neutral' | 'bad';
    agentId?: string;
}
export interface AgentNode {
    id: string;
    name: string;
    type: AgentType;
    role: string;
    description: string;
    status: AgentStatus;
    parentId?: string;
    children: string[];
    startTime?: number;
    endTime?: number;
    output: AgentOutputItem[];
    error?: string;
}
export interface AgentChain {
    id: string;
    rootAgent: AgentNode;
    agents: Map<string, AgentNode>;
    createdAt: number;
}
export interface WebSocketMessage<T = unknown> {
    type: MessageType;
    payload: T;
    timestamp: number;
}
export interface AgentCreatedPayload {
    agentId: string;
    name: string;
    type: AgentType;
    parentId?: string;
}
export interface AgentStatusChangePayload {
    agentId: string;
    status: AgentStatus;
    error?: string;
}
export interface AgentOutputPayload {
    agentId: string;
    output: string;
    timestamp: number;
}
export interface AgentOutputItem {
    type: 'stdout' | 'stderr' | 'system';
    content: string;
    timestamp: number;
}
export interface AgentCompletePayload {
    agentId: string;
    result: string;
    duration: number;
}
export interface TaskRequest {
    id: string;
    userId: string;
    content: string;
    context?: Message[];
}
export interface Task {
    id: string;
    userId: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    createdAt: number;
    updatedAt: number;
}
export interface ExecutionContext {
    userId: string;
    workingDirectory: string;
    environment: Record<string, string>;
}
export interface ExecutionResult {
    success: boolean;
    output?: string;
    error?: string;
    rollbackPlan?: RollbackPlan;
}
export interface RollbackPlan {
    originalState: Record<string, unknown>;
    rollbackCommands: string[];
    snapshotPath?: string;
}
export interface AuthorizationScope {
    commands: string[];
    directories: string[];
    duration: number;
}
export interface MigrationResult {
    success: boolean;
    importedCount: number;
    errors: string[];
}
export interface FeedbackAnalysis {
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
    commonIssues: string[];
    suggestions: string[];
}
export interface StrategyType {
    id: string;
    type: 'problem-solving' | 'creative' | 'analytical' | 'empathetic';
    rules: string[];
    effectiveness: number;
}
