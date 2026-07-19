import { z } from 'zod';

export const LLMProviderSchema = z.enum(['openai', 'anthropic', 'google']);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  name: z.string().optional(),
  toolCall: z.object({
    id: z.string(),
    function: z.object({
      name: z.string(),
      arguments: z.record(z.string(), z.any()),
    }),
  }).optional(),
  toolResult: z.object({
    toolCallId: z.string(),
    content: z.string(),
    status: z.enum(['success', 'error']),
  }).optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(128000).default(4096),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  stop: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.record(z.string(), z.any()),
    }),
  })).optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    message: ChatMessageSchema,
    finishReason: z.string(),
  })),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }),
});

export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;

export const EmbeddingRequestSchema = z.object({
  model: z.string(),
  input: z.union([z.string(), z.array(z.string())]),
});

export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;

export const EmbeddingResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  data: z.array(z.object({
    index: z.number(),
    embedding: z.array(z.number()),
  })),
  usage: z.object({
    promptTokens: z.number(),
    totalTokens: z.number(),
  }),
});

export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;

export interface LLMWrapper {
  provider: LLMProvider;
  baseUrl: string;
  apiKey: string;

  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  streamChatCompletion(request: ChatCompletionRequest): AsyncIterable<string>;
  generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  validateConfig(): Promise<{ success: boolean; message: string }>;
}

export abstract class BaseLLMWrapper implements LLMWrapper {
  constructor(
    public provider: LLMProvider,
    public baseUrl: string,
    public apiKey: string
  ) {}

  abstract chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  abstract streamChatCompletion(request: ChatCompletionRequest): AsyncIterable<string>;
  abstract generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  abstract validateConfig(): Promise<{ success: boolean; message: string }>;

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  protected async fetchWithRetry<T>(
    url: string,
    options: RequestInit,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          if (response.status === 429 && i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            continue;
          }
          const errorText = await response.text();
          throw new Error(`HTTP error ${response.status}: ${errorText}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }
    throw lastError || new Error('Unknown error');
  }
}