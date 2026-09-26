import type { LLMProviderRecord } from '../../domain/types';
import type { ParsedModelItem } from './ILLMProviderStrategy';
import { BaseLLMStrategy } from './BaseLLMStrategy';

export class VolcanoEngineStrategy extends BaseLLMStrategy {
  override readonly name: string = 'volcano';

  override supports(provider: LLMProviderRecord): boolean {
    const title = provider.llm_provider_title?.toLowerCase() ?? '';
    const url = provider.llm_provider_url?.toLowerCase() ?? '';
    return (
      url.includes('volces.com') ||
      url.includes('ark.cn-beijing') ||
      title.includes('volcano') ||
      title.includes('volc') ||
      title.includes('火山') ||
      title.includes('方舟')
    );
  }

  override parseListModelsResponse(json: unknown, _rawText: string): ParsedModelItem[] {
    let modelsArray: Array<Record<string, unknown>> = [];
    if (json && typeof json === 'object') {
      const obj = json as Record<string, unknown>;
      if (Array.isArray(obj.data)) {
        modelsArray = obj.data as Array<Record<string, unknown>>;
      } else if (Array.isArray(obj.models)) {
        modelsArray = obj.models as Array<Record<string, unknown>>;
      }
    } else if (Array.isArray(json)) {
      modelsArray = json as Array<Record<string, unknown>>;
    }

    const result: ParsedModelItem[] = [];
    for (const m of modelsArray) {
      if (!m || typeof m !== 'object') continue;
      
      
      const status = String(m.status ?? '').trim().toLowerCase();
      if (status === 'shutdown' || status === 'retiring') continue;
      
      const rawName = String(m.id || m.name || '');
      if (!rawName) continue;
      const modelId = rawName.replace(/^models\//, '');
      let brief: string | undefined;
      if (m.displayName) {
        brief = m.description ? `${m.displayName} - ${m.description}` : String(m.displayName);
      } else if (m.owned_by) {
        brief = `owned_by: ${String(m.owned_by)}`;
      } else if (m.description) {
        brief = String(m.description);
      }

      const tl = m.token_limits as Record<string, unknown> | undefined;
      const topProvider = m.top_provider as Record<string, unknown> | undefined;
      const maxTokens = Number(
        m.max_completion_tokens || (topProvider?.max_completion_tokens)
        || m.max_tokens || m.inputTokenLimit || m.context_length
        || tl?.context_window || 0,
      );

      result.push({
        modelId,
        displayName: m.displayName ? String(m.displayName) : undefined,
        description: brief,
        maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 0,
        raw: m,
      });
    }
    return result;
  }
}
