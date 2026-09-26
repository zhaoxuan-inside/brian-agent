import type { LLMProviderRecord } from '../../domain/types';
import type { ParsedModelItem } from './ILLMProviderStrategy';
import { BaseLLMStrategy } from './BaseLLMStrategy';

export class OllamaStrategy extends BaseLLMStrategy {
  override readonly name: string = 'ollama';

  override supports(provider: LLMProviderRecord): boolean {
    const title = provider.llm_provider_title?.toLowerCase() ?? '';
    const url = provider.llm_provider_url?.toLowerCase() ?? '';
    return title.includes('ollama') || url.includes(':11434');
  }

  override parseListModelsResponse(json: unknown, rawText: string): ParsedModelItem[] {
    
    if (json && typeof json === 'object') {
      const obj = json as { models?: Array<Record<string, unknown>> };
      if (Array.isArray(obj.models) && obj.models.some((m) => m && typeof m === 'object' && ('details' in m || 'size' in m))) {
        return obj.models.map((m) => {
          const modelId = String(m.name || m.model || '');
          const details = m.details as Record<string, unknown> | undefined;
          const family = details?.family ? String(details.family) : '';
          const paramSize = details?.parameter_size ? String(details.parameter_size) : '';
          const brief = [family, paramSize].filter(Boolean).join(' ') || undefined;

          return {
            modelId,
            displayName: modelId,
            description: brief,
            maxTokens: 0,
            raw: m,
          };
        }).filter((item) => Boolean(item.modelId));
      }
    }

    
    return super.parseListModelsResponse(json, rawText);
  }
}
