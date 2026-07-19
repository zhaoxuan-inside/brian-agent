import { BaseLLMWrapper, ChatCompletionRequest, ChatCompletionResponse, EmbeddingRequest, EmbeddingResponse } from './LLMWrapper';

export class GoogleWrapper extends BaseLLMWrapper {
  constructor(apiKey: string, baseUrl: string = 'https://generativelanguage.googleapis.com') {
    super('google', baseUrl, apiKey);
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const body = {
      model: request.model,
      contents: request.messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }],
      })),
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
      topP: request.topP,
    };

    const response = await this.fetchWithRetry<any>(
      `${this.baseUrl}/v1beta/models/${request.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const candidate = response.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';

    return {
      id: response.candidates?.[0]?.finishReason || '',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant' as const,
          content,
        },
        finishReason: candidate?.finishReason || 'stop',
      }],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  async* streamChatCompletion(request: ChatCompletionRequest): AsyncIterable<string> {
    const body = {
      model: request.model,
      contents: request.messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }],
      })),
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
      topP: request.topP,
    };

    const response = await fetch(
      `${this.baseUrl}/v1beta/models/${request.model}:streamGenerateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

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
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) yield text;
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const body = {
      model: request.model,
      content: {
        parts: [{ text: typeof request.input === 'string' ? request.input : request.input.join(' ') }],
      },
    };

    const response = await this.fetchWithRetry<any>(
      `${this.baseUrl}/v1beta/models/${request.model}:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    return {
      id: '',
      object: 'embedding',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      data: [{
        index: 0,
        embedding: response.embedding?.values || [],
      }],
      usage: {
        promptTokens: 0,
        totalTokens: 0,
      },
    };
  }

  async validateConfig(): Promise<{ success: boolean; message: string }> {
    try {
      await this.fetchWithRetry(
        `${this.baseUrl}/v1beta/models?key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        1
      );
      return { success: true, message: 'Google configuration is valid' };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }
}