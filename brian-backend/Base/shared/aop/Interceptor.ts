export interface InterceptContext {
  
  targetName: string;
  
  methodName: string;
  
  input: unknown;
  
  context: unknown;
  
  output: unknown;
  
  metrics?: unknown;
  

  traceId?: string;
  
  report?: unknown;
  
  startedAt: number;
  
  elapsedMs: number;
}

export interface Interceptor {
  

  beforeExecute?(ctx: InterceptContext): void;

  

  preExecute?(ctx: InterceptContext): void;

  

  postExecute?(ctx: InterceptContext, result: unknown): void;

  

  afterExecute?(ctx: InterceptContext, error?: Error): void;
}
