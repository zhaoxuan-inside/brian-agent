import type { LLMProviderRecord } from '../../domain/types';
import type { ILLMProviderStrategy } from './ILLMProviderStrategy';
import { BaseLLMStrategy } from './BaseLLMStrategy';
import { OpenAIStrategy } from './OpenAIStrategy';
import { GoogleStrategy } from './GoogleStrategy';
import { AnthropicStrategy } from './AnthropicStrategy';
import { OllamaStrategy } from './OllamaStrategy';
import { VolcanoEngineStrategy } from './VolcanoEngineStrategy';

export class LLMStrategyFactory {
  private static readonly strategies: ILLMProviderStrategy[] = [];
  private static readonly fallbackStrategy: ILLMProviderStrategy = new BaseLLMStrategy();

  static {
    
    this.registerStrategy(new GoogleStrategy());
    this.registerStrategy(new AnthropicStrategy());
    this.registerStrategy(new OllamaStrategy());
    this.registerStrategy(new VolcanoEngineStrategy());
    this.registerStrategy(new OpenAIStrategy());
  }

  

  static registerStrategy(strategy: ILLMProviderStrategy): void {
    const existingIdx = this.strategies.findIndex((s) => s.name === strategy.name);
    if (existingIdx >= 0) {
      this.strategies[existingIdx] = strategy;
    } else {
      this.strategies.unshift(strategy);
    }
  }

  

  static soStrategyById(provider: LLMProviderRecord): ILLMProviderStrategy {
    for (const strategy of this.strategies) {
      
      if (strategy.name === 'openai-compatible' || strategy.name === 'openai') {
        continue;
      }
      if (strategy.supports(provider)) {
        return strategy;
      }
    }
    
    const openAi = this.strategies.find((s) => s.name === 'openai');
    return openAi || this.fallbackStrategy;
  }
}
