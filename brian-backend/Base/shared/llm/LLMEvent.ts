export interface LLMToolSpec {
  
  tool_id: string;
  
  description: string;
  
  parameters: Record<string, unknown>;
}

export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMToolCallWire {
  
  id: string;
  
  type?: 'function';
  
  function: {
    name: string;
    
    arguments: string;
  };
}

export interface LLMMessage {
  role: LLMMessageRole;
  
  content: string;
  
  tool_call_id?: string;
  
  tool_calls?: LLMToolCallWire[];
}

export interface ParsedToolCall {
  
  index: number;
  
  id: string;
  
  tool_id: string;
  
  arguments: string;
}

export interface TokenUsage {
  
  input_tokens: number;
  
  output_tokens: number;
}

export type LLMEvent =
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'text_delta'; delta: string }
  | {
      type: 'tool_call_delta';
      
      index: number;
      
      id?: string;
      
      tool_id?: string;
      
      args_delta?: string;
    }
  | {
      type: 'finish';
      
      finish_reason: 'tool-calls' | 'stop' | 'aborted' | 'error';
      
      tool_calls: ParsedToolCall[];
      
      usage: TokenUsage;
    };
