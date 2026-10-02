/**
 * 统一组件卡片 DTO 与语义规范常量（R7 · chg-057）
 * 六大配置组件（Agent/MCP/Skill/Soul/Prompt/LLM）的统一内容标准与卡片契约，
 * 前后端共用单一事实源：后端生成/校验、前端展示/编辑校验均引用本文件。
 */

/** 语义规范常量：名称 5-10 字、描述 30-40 字、范例 3-5 条且每条 ≤15 字 */
export const SEMANTICS_TITLE_MIN = 5
export const SEMANTICS_TITLE_MAX = 10
export const SEMANTICS_BRIEF_MIN = 30
export const SEMANTICS_BRIEF_MAX = 40
export const SEMANTICS_EXAMPLE_MAX_LEN = 15
export const SEMANTICS_EXAMPLES_MIN = 3
export const SEMANTICS_EXAMPLES_MAX = 5

/** 组件语义类型（语义路由匹配与范例生成的适用组件种类） */
export type ComponentSemanticsKind = 'agent' | 'mcp' | 'skill' | 'soul' | 'prompt'

/** 组件语义四元组：名称 + 描述（输入/输出/功能）+ 正向/负向语义范例 */
export interface ComponentSemantics {
  title: string
  brief: string
  positive_examples: string[]
  negative_examples: string[]
}

export type ExampleType = 'positive' | 'negative'

export interface SemanticsComplianceIssue {
  field: 'title' | 'brief' | 'positive_examples' | 'negative_examples'
  message: string
}

/** 语义规范合规校验（纯函数，前端编辑器实时指示与后端落库前校验共用） */
export function validateSemanticsCompliance(sem: Partial<ComponentSemantics>): SemanticsComplianceIssue[] {
  const issues: SemanticsComplianceIssue[] = []
  const title = String(sem.title ?? '').trim()
  if (title.length < SEMANTICS_TITLE_MIN || title.length > SEMANTICS_TITLE_MAX) {
    issues.push({ field: 'title', message: `名称需 ${SEMANTICS_TITLE_MIN}-${SEMANTICS_TITLE_MAX} 字（当前 ${title.length}）` })
  }
  const brief = String(sem.brief ?? '').trim()
  if (brief.length < SEMANTICS_BRIEF_MIN || brief.length > SEMANTICS_BRIEF_MAX) {
    issues.push({ field: 'brief', message: `描述需 ${SEMANTICS_BRIEF_MIN}-${SEMANTICS_BRIEF_MAX} 字（当前 ${brief.length}）` })
  }
  for (const field of ['positive_examples', 'negative_examples'] as const) {
    const list = Array.isArray(sem[field]) ? sem[field]! : []
    if (list.length < SEMANTICS_EXAMPLES_MIN || list.length > SEMANTICS_EXAMPLES_MAX) {
      issues.push({ field, message: `${field === 'positive_examples' ? '正面' : '负面'}范例需 ${SEMANTICS_EXAMPLES_MIN}-${SEMANTICS_EXAMPLES_MAX} 条（当前 ${list.length}）` })
    }
    for (const item of list) {
      if (String(item ?? '').trim().length > SEMANTICS_EXAMPLE_MAX_LEN) {
        issues.push({ field, message: `范例单条需 ≤${SEMANTICS_EXAMPLE_MAX_LEN} 字：${String(item).slice(0, 20)}` })
      }
    }
  }
  return issues
}

/** 统一组件卡片基础 DTO：六组件卡片共用骨架字段 */
export interface UniversalComponentDTO {
  id: string
  /** 5-10 字，突出核心功能领域 */
  title: string
  /** 30-40 字，自然语言包含输入定义 + 输出定义 + 功能定义 */
  brief: string
  /** 正面范例 3-5 条，每条 ≤15 字 */
  positive_examples: string[]
  /** 负面范例 3-5 条，每条 ≤15 字 */
  negative_examples: string[]
  enabled: boolean
  created: number
  updated: number
}

export interface ComponentRefDTO {
  id: string
  title: string
}

/** Agent 实例卡片 DTO */
export interface AgentInstanceDTO extends UniversalComponentDTO {
  soul: ComponentRefDTO | null
  prompt: ComponentRefDTO | null
  llm: ComponentRefDTO | null
  skills: ComponentRefDTO[]
  mcps: ComponentRefDTO[]
  /** 思维方式：来自执行策略 */
  thought_model: 'CoT' | 'ReACT' | 'Direct'
  strategy_id: string
  strategy_label: string
}

/** LLM 模型卡片 DTO（usage_tokens 由 llm_usage_org 按 llm_available_id 实时聚合） */
export interface LLMModelDTO extends UniversalComponentDTO {
  provider_id: string
  provider_title: string
  max_tokens: number
  llm_type: 'text' | 'embedding' | 'multimodal'
  is_default: boolean
  usage_tokens: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }
}

export interface McpToolDTO {
  name: string
  description: string
  /** 按 inputSchema 自动合成的默认测试入参 JSON（listMcpTools 持久化于 test_params_sample） */
  test_params_sample: Record<string, unknown>
}

/** MCP 实例卡片 DTO */
export interface MCPInstanceDTO extends UniversalComponentDTO {
  provider_title: string
  transport_type: string
  status: 'running' | 'stopped'
  version: string
  tools: McpToolDTO[]
}

export interface SkillResourceDTO {
  name: string
  content: string
}

/** Skill 实例卡片 DTO */
export interface SkillInstanceDTO extends UniversalComponentDTO {
  scripts: SkillResourceDTO[]
  references: SkillResourceDTO[]
  assets: SkillResourceDTO[]
  /** Skill.md 原文 */
  content: string
  system: boolean
}

/** Soul 实例卡片 DTO */
export interface SoulInstanceDTO extends UniversalComponentDTO {
  /** Soul 人设 Markdown 原文 */
  content: string
}

/** Prompt 模板卡片 DTO */
export interface PromptTemplateDTO extends UniversalComponentDTO {
  /** Prompt 模板原文 */
  content: string
  /** 自动提取的 {{变量名}} 列表 */
  variables: string[]
  is_system: boolean
}

/** 提取 Prompt 模板中的 {{变量名}} 列表（去重保序，纯函数） */
export function extractPromptVariables(content: string): string[] {
  const seen = new Set<string>()
  const list: string[] = []
  for (const match of String(content ?? '').matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)) {
    const name = match[1]
    if (!seen.has(name)) {
      seen.add(name)
      list.push(name)
    }
  }
  return list
}
