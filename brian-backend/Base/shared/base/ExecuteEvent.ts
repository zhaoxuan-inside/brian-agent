
export interface ExecuteEvent {
  
  component_id: string;
  
  component_type: string;
  
  session_id?: string;
  
  work_id?: string;
  
  run_id?: string;
  
  trace_id?: string;
  
  agent_id?: string;
  
  start: number;
  
  end: number;
  
  gap: number;
  
  input: unknown;
  
  output: unknown;
  
  status: 'ok' | 'error';
  
  error?: string;
  
  permission_id?: string;
}

export interface ExecuteEventSink {
  
  /** 同步生成并返回 execute_record 行 id(插入经内部链异步完成);非落库事件返回空串 */
  push(event: ExecuteEvent): string;

  /** 等待内部异步写链落库完成(读侧关联前调用,保证可见性) */
  flush?(): Promise<void>;
}

export const EXECUTE_COMPONENT_TYPES = {
  RUN: 'RUN',
  CHAT: 'CHAT',
  ROUTER: 'ROUTER',
  AGENT_LOOP: 'AGENT_LOOP',
  LLM: 'LLM',
  SKILL: 'SKILL',
  MCP: 'MCP',
  CDT: 'CDT',
  WRITER: 'WRITER',
  EVOLUTOR: 'EVOLUTOR',
  SUMMARY: 'SUMMARY',
  EXECUTION: 'EXECUTION',
  BUILDER: 'BUILDER',
  PERMISSION: 'PERMISSION',
  STORAGE: 'STORAGE',
  SELF_LEARNING: 'SELF_LEARNING',
  SYSTEM: 'SYSTEM',
} as const;

const SERVICE_COMPONENT_TYPE_MAP: Record<string, string> = {
  RunGatewayService: EXECUTE_COMPONENT_TYPES.RUN,
  ChatService: EXECUTE_COMPONENT_TYPES.CHAT,
  AgentDefService: EXECUTE_COMPONENT_TYPES.ROUTER,
  IntentAgentService: EXECUTE_COMPONENT_TYPES.ROUTER,
  AgentLoopService: EXECUTE_COMPONENT_TYPES.AGENT_LOOP,
  LLMService: EXECUTE_COMPONENT_TYPES.LLM,
  LLMCoreService: EXECUTE_COMPONENT_TYPES.LLM,
  SkillRuntimeService: EXECUTE_COMPONENT_TYPES.SKILL,
  SkillService: EXECUTE_COMPONENT_TYPES.SKILL,
  SkillCoreService: EXECUTE_COMPONENT_TYPES.SKILL,
  MCPService: EXECUTE_COMPONENT_TYPES.MCP,
  MCPCoreService: EXECUTE_COMPONENT_TYPES.MCP,
  CDTService: EXECUTE_COMPONENT_TYPES.CDT,
  CDTCoreService: EXECUTE_COMPONENT_TYPES.CDT,
  WriterAgentService: EXECUTE_COMPONENT_TYPES.WRITER,
  EvolutorAgentService: EXECUTE_COMPONENT_TYPES.EVOLUTOR,
  SummaryAgentService: EXECUTE_COMPONENT_TYPES.SUMMARY,
  AgentExecutionService: EXECUTE_COMPONENT_TYPES.EXECUTION,
  AgentBuilderService: EXECUTE_COMPONENT_TYPES.BUILDER,
  InfoCoreService: EXECUTE_COMPONENT_TYPES.STORAGE,
  SessionService: EXECUTE_COMPONENT_TYPES.STORAGE,
  SelfLearningService: EXECUTE_COMPONENT_TYPES.SELF_LEARNING,
};

const EXECUTE_EVENT_EXCLUDED_SERVICES = new Set([
  
  'RelationDBService',
  
  'LogService',
  
  'StreamService',
]);

const EXECUTE_EVENT_EXCLUDED_METHOD_PREFIX = 'so';

export function resolveComponentType(targetName: string): string {
  return SERVICE_COMPONENT_TYPE_MAP[targetName] || EXECUTE_COMPONENT_TYPES.SYSTEM;
}

export function isExecuteEventObservable(targetName: string, methodName: string): boolean {
  if (EXECUTE_EVENT_EXCLUDED_SERVICES.has(targetName)) return false;
  if (methodName.startsWith(EXECUTE_EVENT_EXCLUDED_METHOD_PREFIX)) return false;
  return true;
}
