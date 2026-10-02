/**
 * 统一组件语义规范生成引擎（R7 · chg-057）
 * 六组件（Agent/MCP/Skill/Soul/Prompt）创建/更新/润色时统一产出：
 * 名称 5-10 字 + 描述 30-40 字（输入/输出/功能）+ 正/负范例各 3-5 条（每条 ≤15 字）。
 * LLM 生成失败时静默回退用户输入或现有值，绝不阻塞创建主链路。
 */
import {
  SEMANTICS_TITLE_MAX,
  SEMANTICS_BRIEF_MAX,
  SEMANTICS_EXAMPLE_MAX_LEN,
  SEMANTICS_EXAMPLES_MAX,
  type ComponentSemantics,
  type ComponentSemanticsKind,
} from '@brian-agent/shared';
import type { Context } from '../base/Context';
import type { Metrics } from '../base/Metrics';

export type { ComponentSemantics, ComponentSemanticsKind };

/** 生成组件语义的注入式任务函数（组合根经 createSemanticsTaskFn 构造） */
export type SemanticsTaskFn = (source: SemanticsSourceContext, context?: Context) => Promise<ComponentSemantics | null>;

export interface SemanticsSourceContext {
  kind: ComponentSemanticsKind;
  /** 现有名称（可为空） */
  title?: string;
  /** 现有描述/用途（可为空） */
  brief?: string;
  /** 正文参考（Soul 人设/Prompt 模板/Skill.md 等，截断使用） */
  content?: string;
  /** 补充上下文（任务领域、工具清单、变量列表等） */
  extra?: string;
}

export interface ResolveSemanticsParams {
  kind: ComponentSemanticsKind;
  /** 供生成的语义上下文 */
  source: SemanticsSourceContext;
  /** 用户显式提供的内容（优先生效，逐字段回退） */
  provided?: Partial<ComponentSemantics>;
  /** LLM 语义生成函数（未注入或失败时跳过生成） */
  semanticsFn?: SemanticsTaskFn;
  context?: Context;
  metrics?: Metrics;
}

export interface ResolveSemanticsResult extends ComponentSemantics {
  /** 本次是否发生了 LLM 语义生成 */
  generated: boolean;
}

const KIND_LABELS: Record<ComponentSemanticsKind, string> = {
  agent: '专职智能体（Agent）',
  mcp: 'MCP 工具集（MCP）',
  skill: '技能（Skill）',
  soul: '人格（Soul）',
  prompt: 'Prompt 模板',
};

/** 统一语义生成 Prompt 契约（data）：输出严格 JSON 四元组 */
export function buildSemanticsPrompt(source: SemanticsSourceContext): string {
  const kindLabel = KIND_LABELS[source.kind] ?? source.kind;
  return [
    '你是组件配置中心的语义规范工程师，为以下组件生成符合全站标准的语义描述。',
    `组件类型：${kindLabel}`,
    source.title ? `现有名称：${source.title.slice(0, 30)}` : '',
    source.brief ? `现有说明：${source.brief.slice(0, 120)}` : '',
    source.content ? `正文参考：${source.content.slice(0, 500)}` : '',
    source.extra ? `补充信息：${source.extra.slice(0, 300)}` : '',
    '',
    '请输出严格 JSON（无代码块包裹、无多余文本），字段标准：',
    '1. title：5-10 个汉字，突出核心功能领域，禁用"助手/智能体/Agent"等无意义后缀；',
    '2. brief：30-40 字的单段自然语言，必须同时包含输入定义、输出定义与功能定义，无标题无列表无换行；',
    '3. positive_examples：3-5 条，每条 ≤15 字，精准匹配该组件专职职责的典型用户原话；',
    '4. negative_examples：3-5 条，每条 ≤15 字，易混淆但应由其他专职组件处理的排除性请求；',
    'JSON 格式：{"title":"...","brief":"...","positive_examples":["..."],"negative_examples":["..."]}',
  ].filter(Boolean).join('\n');
}

/** 从 LLM 输出中容错解析语义 JSON（data）：容忍 ```json 包裹与前后噪声 */
export function parseSemanticsJson(text: string): ComponentSemantics | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof parsed.title !== 'string' && typeof parsed.brief !== 'string') return null;
    return {
      title: String(parsed.title ?? ''),
      brief: String(parsed.brief ?? ''),
      positive_examples: toStringList(parsed.positive_examples),
      negative_examples: toStringList(parsed.negative_examples),
    };
  } catch {
    return null;
  }
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter(Boolean);
}

function cleanTitleText(text: string): string {
  return String(text ?? '')
    .replace(/[a-zA-Z0-9_-]/g, '')
    .replace(/智能体$|智能助手$|助手$|Agent$/gi, '')
    .replace(/[，。；、！？.，:：\s]+$/g, '')
    .trim();
}

function clampTitle(title: string, brief: string): string {
  let name = cleanTitleText(title);
  if (!name) name = cleanTitleText(brief).slice(0, SEMANTICS_TITLE_MAX);
  return name.slice(0, SEMANTICS_TITLE_MAX).trim();
}

function clampBrief(brief: string): string {
  const clean = String(brief ?? '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, SEMANTICS_BRIEF_MAX).replace(/[，、;；]+$/g, '').trim();
}

/**
 * 规则强制收敛（algorithm）：对任意来源的语义四元组按全站标准裁剪，
 * 保证 title ≤10 字、brief ≤40 字、范例每条 ≤15 字且最多 5 条。
 */
export function clampComponentSemantics(raw: Partial<ComponentSemantics>): ComponentSemantics {
  const title = clampTitle(String(raw.title ?? ''), String(raw.brief ?? ''));
  const brief = clampBrief(String(raw.brief ?? ''));
  return {
    title,
    brief,
    positive_examples: clampExampleList(raw.positive_examples),
    negative_examples: clampExampleList(raw.negative_examples),
  };
}

function clampExampleList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const clean = String(item ?? '').replace(/\s+/g, '').trim();
    if (!clean || clean.length > SEMANTICS_EXAMPLE_MAX_LEN || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length >= SEMANTICS_EXAMPLES_MAX) break;
  }
  return result;
}

/**
 * 组件语义终值裁决（orchestration）：用户显式内容优先（仅去空白，尊重用户原文，
 * 合规性由前端编辑校验器提示），缺口由 LLM 生成回填并经 clamp 收敛；
 * LLM 不可用时仅使用用户/现有值（generated=false）。
 */
export async function resolveComponentSemantics(params: ResolveSemanticsParams): Promise<ResolveSemanticsResult> {
  const providedTitle = String(params.provided?.title ?? '').trim();
  const providedBrief = String(params.provided?.brief ?? '').trim();
  const providedPos = trimExampleList(params.provided?.positive_examples);
  const providedNeg = trimExampleList(params.provided?.negative_examples);
  let generatedSem: ComponentSemantics | null = null;
  const needsGeneration = !providedTitle || !providedBrief
    || providedPos.length === 0 || providedNeg.length === 0;
  if (params.semanticsFn && needsGeneration) {
    generatedSem = await params.semanticsFn(params.source, params.context).catch(() => null);
    if (generatedSem) params.metrics?.info('ComponentSemanticsGenerator 语义生成成功', { kind: params.source.kind });
    else params.metrics?.warn('ComponentSemanticsGenerator 语义生成不可用，回退用户值', { kind: params.source.kind });
  }
  const clamped = generatedSem ? clampComponentSemantics(generatedSem) : null;
  return {
    title: providedTitle || clamped?.title || '',
    brief: providedBrief || clamped?.brief || '',
    positive_examples: providedPos.length > 0 ? providedPos : clamped?.positive_examples ?? [],
    negative_examples: providedNeg.length > 0 ? providedNeg : clamped?.negative_examples ?? [],
    generated: generatedSem !== null,
  };
}

function trimExampleList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const clean = String(item ?? '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length >= SEMANTICS_EXAMPLES_MAX) break;
  }
  return result;
}

/** LLM 语义任务工厂：组合根注入 llmAccess，产出 SemanticsTaskFn（同 createEmbedTaskFn 模式） */
export function createSemanticsTaskFn(llmAccess: {
  execLLM: (input: any, output: any, context?: any, metrics?: any, report?: any) => Promise<boolean>;
}): SemanticsTaskFn {
  return async (source: SemanticsSourceContext, context?: Context): Promise<ComponentSemantics | null> => {
    const execInput = { id: '', prompt: buildSemanticsPrompt(source), max_tokens: 600, caller: 'ComponentSemanticsGenerator' };
    const execOutput = { result: '' };
    const ok = await llmAccess.execLLM(execInput, execOutput, context).catch(() => false);
    if (!ok) return null;
    return parseSemanticsJson(execOutput.result ?? '');
  };
}
