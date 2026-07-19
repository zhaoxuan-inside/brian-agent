import { BaseLLMWrapper, ChatCompletionRequest, ChatCompletionResponse, EmbeddingRequest, EmbeddingResponse } from './LLMWrapper';

export class OpenAIWrapper extends BaseLLMWrapper {
  private apiPath: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.openai.com') {
    super('openai', baseUrl, apiKey);
    // If base URL already ends with a version path (e.g. /v1, /v3), use it as-is.
    // Otherwise append /v1 for standard OpenAI-compatible APIs.
    const versionMatch = baseUrl.match(/\/v\d+\/?$/);
    if (versionMatch) {
      this.apiPath = baseUrl.replace(/\/$/, '');
    } else {
      this.apiPath = baseUrl.replace(/\/$/, '') + '/v1';
    }
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const body = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      frequency_penalty: request.frequencyPenalty,
      presence_penalty: request.presencePenalty,
      stop: request.stop,
      tools: request.tools,
    };

    const response = await this.fetchWithRetry<ChatCompletionResponse>(
      `${this.apiPath}/chat/completions`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      }
    );

    return response;
  }

  async* streamChatCompletion(request: ChatCompletionRequest): AsyncIterable<string> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      frequency_penalty: request.frequencyPenalty,
      presence_penalty: request.presencePenalty,
      stop: request.stop,
      tools: request.tools,
      stream: true,
    };
    // Remove undefined fields
    Object.keys(body).forEach(key => {
      if (body[key] === undefined) delete body[key];
    });

    const url = `${this.apiPath}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        // ignore
      }
      throw new Error(`HTTP error ${response.status} from ${url}: ${errorBody.slice(0, 500)}`);
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
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) yield content;
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
      input: request.input,
    };

    const response = await this.fetchWithRetry<EmbeddingResponse>(
      `${this.apiPath}/embeddings`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      }
    );

    return response;
  }

  async validateConfig(): Promise<{ success: boolean; message: string }> {
    try {
      await this.fetchWithRetry(
        `${this.apiPath}/models`,
        {
          method: 'GET',
          headers: this.buildHeaders(),
        },
        1
      );
      return { success: true, message: 'OpenAI configuration is valid' };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }
}