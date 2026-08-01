import { BaseLLMWrapper, ChatCompletionRequest, ChatCompletionResponse, EmbeddingRequest, EmbeddingResponse } from './LLMWrapper';

export class AnthropicWrapper extends BaseLLMWrapper {
  constructor(apiKey: string, baseUrl: string = 'https://api.anthropic.com') {
    super('anthropic', baseUrl, apiKey);
  }

  async chatCompletion(request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse> {
    const systemMessage = request.messages.find(m => m.role === 'system');
    const userMessages = request.messages.filter(m => m.role !== 'system');

    const body = {
      model: request.model,
      messages: userMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      system: systemMessage?.content,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    };

    const response = await this.fetchWithRetry<any>(
      `${this.baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      },
      3,
      signal,
    );

    return {
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant' as const,
          content: response.content?.[0]?.text || '',
        },
        finishReason: response.stop_reason || 'end_turn',
      }],
      usage: {
        promptTokens: response.usage?.input_tokens || 0,
        completionTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      },
    };
  }

  async* streamChatCompletion(request: ChatCompletionRequest): AsyncIterable<string> {
    const systemMessage = request.messages.find(m => m.role === 'system');
    const userMessages = request.messages.filter(m => m.role !== 'system');

    const body = {
      model: request.model,
      messages: userMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      system: systemMessage?.content,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }

  async generateEmbedding(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error('Embedding not supported for Anthropic');
  }

  async validateConfig(): Promise<{ success: boolean; message: string }> {
    try {
      await this.fetchWithRetry(
        `${this.baseUrl}/v1/messages`,
        {
          method: 'POST',
          headers: {
            ...this.buildHeaders(),
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-sonnet-20240229',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 1,
          }),
        },
        1
      );
      return { success: true, message: 'Anthropic configuration is valid' };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }
}