import { z } from 'zod';

export const NodeTypeSchema = z.enum(['memory', 'tag', 'concept', 'entity']);

export const AgentTypeSchema = z.enum(['root', 'work', 'sub']);

export const AgentStatusSchema = z.enum(['idle', 'running', 'completed', 'failed']);

export const MessageTypeSchema = z.enum([
  'agent_created',
  'agent_status_change',
  'agent_output',
  'agent_complete',
  'message_received',
  'message_response',
  'feedback_submitted',
  'error'
]);

export const DataTypeSchema = z.enum(['conversation', 'preferences', 'memory', 'all']);

export const CommandRiskLevelSchema = z.enum(['safe', 'dangerous', 'high_risk']);

export const UserPreferenceCategorySchema = z.enum(['aesthetic', 'content', 'communication', 'behavior']);

export const MemoryNodeSchema = z.object({
  id: z.string(),
  type: NodeTypeSchema,
  content: z.string(),
  metadata: z.record(z.unknown()),
  salienceScore: z.number().min(0).max(1),
  emotionalTag: z.string().optional(),
  retrievalCount: z.number().int().nonnegative(),
  lastRetrieved: z.number().optional(),
  strength: z.number().min(0).max(1),
  decayRate: z.number().min(0).max(1),
  createdAt: z.number(),
  updatedAt: z.number()
});

export const MemoryEdgeSchema = z.object({
  id: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  weight: z.number().min(0).max(1),
  label: z.string().optional(),
  activationCount: z.number().int().nonnegative(),
  direction: z.enum(['undirected', 'directed']),
  createdAt: z.number(),
  updatedAt: z.number()
});

export const UserIdentitySchema = z.object({
  name: z.string(),
  age: z.number().int().optional(),
  gender: z.string().optional(),
  occupation: z.string().optional(),
  interests: z.array(z.string()).optional()
});

export const UserPreferenceSchema = z.object({
  id: z.string(),
  category: UserPreferenceCategorySchema,
  key: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.string(),
  timestamp: z.number()
});

export const EmotionalPatternSchema = z.object({
  id: z.string(),
  emotionType: z.string(),
  triggers: z.array(z.string()),
  intensity: z.number().min(0).max(1),
  valence: z.enum(['positive', 'negative', 'neutral', 'mixed'])
});

export const UserProfileSchema = z.object({
  id: z.string(),
  identity: UserIdentitySchema,
  preferences: z.array(UserPreferenceSchema),
  emotionalPatterns: z.array(EmotionalPatternSchema),
  learningHistory: z.array(z.object({
    id: z.string(),
    type: z.enum(['passive', 'active']),
    content: z.string(),
    insights: z.array(z.string()),
    timestamp: z.number()
  }))
});

export const MessageSchema = z.object({
  id: z.string(),
  userId: z.string(),
  content: z.string(),
  role: z.enum(['user', 'assistant']),
  timestamp: z.number(),
  rating: z.enum(['good', 'neutral', 'bad']).optional(),
  agentId: z.string().optional()
});

export const AgentNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: AgentTypeSchema,
  status: AgentStatusSchema,
  parentId: z.string().optional(),
  children: z.array(z.string()),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  output: z.array(z.string()),
  error: z.string().optional()
});

export const TaskRequestSchema = z.object({
  id: z.string(),
  userId: z.string(),
  content: z.string(),
  context: z.array(MessageSchema).optional()
});

export const ExecutionContextSchema = z.object({
  userId: z.string(),
  workingDirectory: z.string(),
  environment: z.record(z.string())
});

export const ExecutionResultSchema = z.object({
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
  rollbackPlan: z.object({
    originalState: z.record(z.unknown()),
    rollbackCommands: z.array(z.string()),
    snapshotPath: z.string().optional()
  }).optional()
});

export const AuthorizationScopeSchema = z.object({
  commands: z.array(z.string()),
  directories: z.array(z.string()),
  duration: z.number().positive()
});
