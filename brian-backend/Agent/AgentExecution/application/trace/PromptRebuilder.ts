import {
  PromptsAccess, SoulAccess,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  GetSoulInput, GetSoulOutput, SoulContext,
  formatContextCategories,
} from '@brian-agent/base';
import { PromptReference, TraceIterations } from '../../domain/trace';

export class PromptRebuilder {
  constructor(
    private readonly promptsAccess: PromptsAccess,
    private readonly soulAccess: SoulAccess,
  ) {}

  
  async rebuildPrompt(ref: PromptReference, contextData: string, history: string): Promise<string> {
    const soul = await this.loadSoul(ref.variables.soul_id);
    const variables = this.assembleVariables(ref, contextData, history, soul);
    return this.render(ref.template_id, variables);
  }

  
  rebuildHistory(iterations: TraceIterations, beforeIndex: number): string {
    let history = '';
    for (let i = 0; i < beforeIndex; i++) {
      history = this.appendIterationHistory(iterations[i], history);
    }
    return history;
  }

  
  formatContextText(sourceIdsMap: Record<string, string[]>, contentMap: Record<string, string>): string {
    const toItems = (key: string) =>
      (sourceIdsMap[key] ?? []).map((id) => ({ info: contentMap[id] ?? '' })).filter((i) => i.info);
    return formatContextCategories({
      categories: {
        selected: toItems('CUSTOM'),
        pinned: toItems('PINNED'),
        timeline: toItems('TIMELINE'),
        citing: toItems('CITING'),
        tag_relative: toItems('TAG_RELATIVE'),
        similarity: toItems('SIMILARITY'),
        keyword: toItems('KEYWORD'),
        random: toItems('RANDOM'),
      },
    });
  }

  private appendIterationHistory(iter: TraceIterations[number], history: string): string {
    let out = history;
    if (iter.think) out += `\nThink: ${iter.think.reasoning}\nNext: ${iter.think.next_action}`;
    if (iter.act) out += `\nAct: ${iter.act.result}`;
    if (iter.reflect) out += `\nReflect: ${iter.reflect.reflection}`;
    return out;
  }

  
  private assembleVariables(
    ref: PromptReference,
    contextData: string,
    history: string,
    soul: string,
  ): Record<string, unknown> {
    const v = ref.variables;
    return {
      agent_name: v.agent_name,
      soul,
      task_content: v.task_content,
      context_data: contextData,
      history,
      iteration: v.iteration,
      max_iterations: v.max_iterations,
      tools_json: v.tools_json,
      domain: v.domain,
    };
  }

  private async loadSoul(soulId: string): Promise<string> {
    if (!soulId) return '';
    try {
      const out = new GetSoulOutput();
      await this.soulAccess.soSoulById(
        Object.assign(new GetSoulInput(), { id: soulId }),
        out,
        new SoulContext(),
      );
      return out.soul?.soul_content ?? out.soul?.soul_brief ?? '';
    } catch {
      return '';
    }
  }

  private async render(templateId: string, variables: Record<string, unknown>): Promise<string> {
    const out = new ExecPromptOutput();
    const ok = await this.promptsAccess.execPrompt(
      Object.assign(new ExecPromptInput(), { id: templateId, variables }),
      out,
      new PromptContext(),
    );
    return ok && out.prompt ? out.prompt : '';
  }
}
