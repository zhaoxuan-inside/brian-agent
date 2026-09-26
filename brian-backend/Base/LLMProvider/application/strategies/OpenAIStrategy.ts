import { BaseLLMStrategy } from './BaseLLMStrategy';

export class OpenAIStrategy extends BaseLLMStrategy {
  override readonly name: string = 'openai';
}
