import type { LLMService } from '../../core/llm';
import { logger } from '../../infrastructure/logger';

export interface WriteResultInput {
  work_contents: WorkContent[];
  user_query: string;
  max_output_length?: number;
}

export interface WorkContent {
  task_id: string;
  description: string;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  result?: string;
  error?: string;
}

export interface WriteResultOutput {
  msg_id: string;
  final_text: string;
  elapsed_ms?: number;
}

const WRITER_SYSTEM_PROMPT = `你是信息汇总专家。你需要将多个子任务的结果整合为连贯、易读、结构化的人类友好回复。

汇总规则：
1. 按任务逻辑顺序排列结果
2. 成功任务的结论用清晰的方式呈现（分点、标题等 Markdown 格式）
3. 失败或超时的任务，在回复中标注"以下部分未能完成"并给出简要说明
4. 若所有子任务均失败，生成友好的错误提示（含重试建议）
5. 保持专业、正式的语气

请使用中文回复。`;

export class WriterAgent {
  private llmService: LLMService;

  constructor(llmService: LLMService) {
    this.llmService = llmService;
  }

  async writeResult(input: WriteResultInput): Promise<WriteResultOutput> {
    const start = Date.now();
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      const sorted = this.sortByStatus(input.work_contents);

      const successTasks = sorted
        .filter(w => w.status === 'SUCCESS')
        .map(w => ({
          description: w.description,
          summary: this.truncate(w.result || '', 2000),
        }));

      const failedTasks = sorted
        .filter(w => w.status !== 'SUCCESS')
        .map(w => ({
          description: w.description,
          error: w.error || '未知错误',
          partial: this.truncate(w.result || '', 500),
        }));

      const prompt = this.buildPrompt(successTasks, failedTasks, input.user_query);

      const messages = [
        { role: 'system' as const, content: WRITER_SYSTEM_PROMPT },
        { role: 'user' as const, content: prompt },
      ];

      const response = await this.llmService.chat(messages, { temperature: 0.5 });
      let finalText = response.content;

      finalText = this.postProcess(finalText, input.max_output_length || 8000);

      return {
        msg_id: msgId,
        final_text: finalText,
        elapsed_ms: Date.now() - start,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('WRITER', `writeResult failed: ${msg}`);

      const fallback = this.buildFallback(input.work_contents);
      return {
        msg_id: msgId,
        final_text: fallback,
        elapsed_ms: Date.now() - start,
      };
    }
  }

  private sortByStatus(contents: WorkContent[]): WorkContent[] {
    const priority = { SUCCESS: 0, TIMEOUT: 1, FAILED: 2 };
    return [...contents].sort(
      (a, b) => (priority[a.status] ?? 3) - (priority[b.status] ?? 3),
    );
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '\n\n...(内容已压缩)';
  }

  private buildPrompt(
    successTasks: { description: string; summary: string }[],
    failedTasks: { description: string; error: string; partial: string }[],
    userQuery: string,
  ): string {
    let prompt = `用户提问：${userQuery}\n\n`;

    if (successTasks.length > 0) {
      prompt += '## 成功完成的任务\n';
      for (const t of successTasks) {
        prompt += `### ${t.description}\n${t.summary}\n\n`;
      }
    }

    if (failedTasks.length > 0) {
      prompt += '## 未完成的任务\n';
      for (const t of failedTasks) {
        prompt += `### ${t.description}\n`;
        prompt += `错误：${t.error}\n`;
        if (t.partial) prompt += `部分结果：${t.partial}\n`;
        prompt += '\n';
      }
    }

    prompt += '请基于以上结果，生成最终的汇总回复。';
    return prompt;
  }

  private postProcess(text: string, maxLength: number): string {
    // Strip internal markers
    text = text.replace(/Thought:[\s\S]*?(?=\n\n|$)/g, '');
    text = text.replace(/Action:[\s\S]*?(?=\n\n|$)/g, '');
    text = text.replace(/Observation:[\s\S]*?(?=\n\n|$)/g, '');
    text = text.trim();

    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '\n\n...(内容已截断)';
    }

    return text;
  }

  private buildFallback(contents: WorkContent[]): string {
    const parts: string[] = ['## 任务执行结果汇总\n'];

    const success = contents.filter(c => c.status === 'SUCCESS');
    const failed = contents.filter(c => c.status !== 'SUCCESS');

    for (const c of success) {
      parts.push(`### ✅ ${c.description}\n${this.truncate(c.result || '', 1000)}`);
    }
    for (const c of failed) {
      parts.push(`### ❌ ${c.description}\n错误：${c.error || '未知'}`);
    }

    return parts.join('\n\n');
  }
}
