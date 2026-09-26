import type { LLMAccess } from '../../LLMProvider/access/LLMAccess';
import { ExecLLMInput, ExecLLMOutput, LLMContext } from '../../LLMProvider/domain/types';
import { ProviderError } from '../../shared/errors';

export interface CallLLMJsonOptions<T> {
  
  llmId?: string;
  
  prompt: string;
  
  system?: string;
  
  parse: (text: string) => T | null;
  
  retries?: number;
  
  fallback?: () => T;
  
  onError?: (error: unknown, attempt: number) => void;
  
  extra?: Partial<ExecLLMInput>;
  
  caller?: string;
}

export async function callLLMJson<T>(
  llmAccess: LLMAccess,
  opts: CallLLMJsonOptions<T>,
): Promise<T | null> {
  const retries = opts.retries ?? 0;
  const maxAttempts = retries + 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = new ExecLLMOutput();
      const input = Object.assign(new ExecLLMInput(), {
        id: opts.llmId ?? '',
        prompt: opts.prompt,
        caller: opts.caller ?? '',
        ...(opts.extra ?? {}),
        extra: { ...(opts.extra?.extra ?? {}), thinking: { type: 'disabled' } },
        ...(opts.system !== undefined ? { system: opts.system } : {}),
      });
      const ok = await llmAccess.execLLM(input, out, new LLMContext());
      if (!ok) throw new Error(out.error || 'LLM 调用失败');
      const parsed = opts.parse(out.result || '');
      if (parsed === null) throw new Error('LLM 输出 JSON 解析失败');
      return parsed;
    } catch (err: unknown) {
      lastError = err;
      opts.onError?.(err, attempt);
    }
  }

  if (opts.fallback) return opts.fallback();
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ProviderError(`LLM JSON 调用失败: ${msg}`, 'LLM_JSON_ERROR');
}
