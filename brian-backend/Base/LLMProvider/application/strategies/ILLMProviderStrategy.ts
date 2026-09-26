import type {
  LLMProviderRecord,
  LLMAvailableRecord,
  ExecLLMInput,
  ExecLLMEventsInput,
  EmbedLLMInput,
} from '../../domain/types';

export interface HttpRequestOptions {
  
  url: string;
  
  method: string;
  
  headers: Record<string, string>;
  
  body?: string;
}

export interface ParsedModelItem {
  
  modelId: string;
  
  displayName?: string;
  
  description?: string;
  
  maxTokens?: number;
  
  raw: Record<string, unknown>;
}

export interface ParsedChatResult {
  
  content: string;
  
  inputTokens: number;
  
  outputTokens: number;
}

export interface ParsedEmbedResult {
  
  embedding: number[];
  
  inputTokens: number;
}

export interface ILLMProviderStrategy {
  
  readonly name: string;

  

  supports(provider: LLMProviderRecord): boolean;

  

  buildTestRequest(provider: LLMProviderRecord): HttpRequestOptions;

  

  buildListModelsRequest(provider: LLMProviderRecord): HttpRequestOptions;

  

  parseListModelsResponse(json: unknown, rawText: string): ParsedModelItem[];

  

  buildChatRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: ExecLLMInput,
  ): HttpRequestOptions;

  

  parseChatResponse(json: unknown, rawText: string): ParsedChatResult;

  

  buildChatEventsRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: ExecLLMEventsInput,
  ): HttpRequestOptions;

  

  buildEmbedRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: EmbedLLMInput,
  ): HttpRequestOptions;

  

  parseEmbedResponse(json: unknown, rawText: string): ParsedEmbedResult;
}
