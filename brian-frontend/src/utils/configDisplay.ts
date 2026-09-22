/**
 * @fileoverview 配置页纯展示映射与导航定义。
 *
 * 全部为无状态纯函数与常量；页面状态与请求编排见 composables/useConfigView。
 */
import {
  Cpu, Bot, Workflow, AppWindow, Server, Database, Boxes, Table2,
  Heart, Wand2, GitBranch, Brain, GraduationCap, HardDrive,
  Lightbulb, Library, RefreshCw, ClipboardList, Briefcase, PenLine,
  Settings, FileText, Network, User, MessageCircle, Sparkles,
  Layers, BarChart3, Zap, Plug, Radio, Monitor, Globe, Terminal, MessageSquare, Send,
  Play, Eye, Code2, Star,
} from '@lucide/vue'
import type { ConfigTreeItem } from '@/api/types'

// ============================================================
// Types
// ============================================================

export type ModuleKey = 'model' | 'soul' | 'work' | 'skill' | 'mcp' | 'agent'
export type FieldType = 'text' | 'number' | 'enum' | 'boolean' | 'json'
export interface RawItem { id: string; enabled?: boolean; isDefault?: boolean; [key: string]: unknown }

export interface ConfigField {
  key: string; label: string; type: FieldType
  value: string | number | boolean; options?: { label: string; value: string | number | boolean }[]
}

export interface DisplayItem {
  key: string; name: string; desc: string
  valueSummary: string; configurable: boolean
  raw?: RawItem; configItem?: ConfigTreeItem
  isEntityItem?: boolean
}

export interface DisplayCategory {
  key: string; name: string; desc: string
  configurable: boolean; itemCount: number
  items: DisplayItem[]; isEntityCategory?: boolean
}

export interface DisplayModule {
  key: string; name: string; desc: string
  icon: typeof Cpu; configurable: boolean
  apiModule?: ModuleKey; categoryCount: number
  categories: DisplayCategory[]
}

export interface DisplayLayer {
  key: string; name: string; desc: string
  icon: typeof Server; hasConfigurable: boolean
  modules: DisplayModule[]
}

export interface NavSubSection {
  key: string; label: string; icon: typeof Cpu
  type: 'entity' | 'params' | 'snapshot'
  entityType?: string; configModule?: string
  configCategories?: string[]; configLayer?: string
}

export interface NavSection {
  key: string; label: string; icon: typeof Cpu; desc: string
  subsections: NavSubSection[]
}

// ============================================================
// Navigation sections
// ============================================================

export const NAV_SECTIONS: NavSection[] = [
  { key: 'llm', label: 'LLM 配置', icon: Cpu, desc: 'LLM 提供商、模型管理与运行参数', subsections: [
    { key: 'llm-provider', label: '模型提供商管理', icon: Globe, type: 'entity', entityType: 'provider' },
    { key: 'llm-model', label: 'Model 管理', icon: Boxes, type: 'entity', entityType: 'model' },
    { key: 'llm-params', label: '运行参数', icon: Settings, type: 'params', configModule: 'llm_core', configCategories: ['basic'] },
  ]},
  { key: 'agent', label: 'Agent 配置', icon: Bot, desc: 'Agent 实例、策略、构建、执行与进化', subsections: [
    { key: 'agent-instance', label: 'Agent 实例', icon: Library, type: 'entity', entityType: 'agent' },
    { key: 'agent-strategy', label: '执行策略', icon: GitBranch, type: 'entity', entityType: 'strategy' },
    { key: 'agent-builder', label: '构建参数', icon: Briefcase, type: 'params', configModule: 'agent_builder', configCategories: ['basic'] },
    { key: 'agent-library', label: 'Agent 库参数', icon: Library, type: 'params', configModule: 'agent_library', configCategories: ['basic'] },
    { key: 'agent-execution', label: '执行参数', icon: Zap, type: 'params', configModule: 'agent_execution', configCategories: ['basic'] },
    { key: 'agent-planner', label: 'Planner Agent', icon: ClipboardList, type: 'params', configModule: 'planner_agent', configCategories: ['basic'] },
    { key: 'agent-writer', label: 'Writer Agent', icon: PenLine, type: 'params', configModule: 'writer_agent', configCategories: ['basic'] },
    { key: 'agent-evolutor', label: 'Evolutor Agent', icon: Sparkles, type: 'params', configModule: 'evolutor_agent', configCategories: ['basic'] },
  ]},
  { key: 'memory', label: '记忆与信息', icon: Brain, desc: '信息存储、标签、摘要、向量化与上下文构建', subsections: [
    { key: 'memory-storage', label: '存储参数', icon: HardDrive, type: 'params', configModule: 'info_core', configCategories: ['config'] },
    { key: 'memory-tag', label: '标签生成', icon: Lightbulb, type: 'params', configModule: 'info_core', configCategories: ['tag_config'] },
    { key: 'memory-summary', label: '摘要生成', icon: FileText, type: 'params', configModule: 'info_core', configCategories: ['summary_config'] },
    { key: 'memory-vector', label: '向量化', icon: Layers, type: 'params', configModule: 'info_core', configCategories: ['vector_config'] },
    { key: 'memory-context', label: '上下文构建', icon: Network, type: 'params', configModule: 'info_core', configCategories: ['context_config'] },
  ]},
  { key: 'mcp', label: 'MCP 配置', icon: Plug, desc: 'MCP 市场、实例管理与运行参数', subsections: [
    { key: 'mcp-market', label: 'MCP 市场', icon: Globe, type: 'entity', entityType: 'mcp-provider' },
    { key: 'mcp-instance', label: 'MCP 实例', icon: Plug, type: 'entity', entityType: 'mcp' },
    { key: 'mcp-params', label: '运行参数', icon: Settings, type: 'params', configModule: 'mcp_core', configCategories: ['basic'] },
    { key: 'mcp-stats', label: '调用统计', icon: BarChart3, type: 'entity', entityType: 'mcp-stats' },
  ]},
  { key: 'skills', label: 'Skill 配置', icon: Wand2, desc: 'Skill 管理与匹配优化', subsections: [
    { key: 'skills-list', label: 'Skill 管理', icon: Wand2, type: 'entity', entityType: 'skill' },
    { key: 'skills-match', label: '匹配与优化', icon: Zap, type: 'params', configModule: 'skill_core', configCategories: ['basic', 'opt_rule'] },
  ]},
  { key: 'roles', label: '角色与提示词', icon: Heart, desc: 'Soul 人格管理与 Prompt 模板', subsections: [
    { key: 'roles-soul', label: 'Soul 管理', icon: Heart, type: 'entity', entityType: 'soul' },
    { key: 'roles-match', label: '匹配与优化', icon: Zap, type: 'params', configModule: 'soul_core', configCategories: ['basic', 'opt_rule'] },
    { key: 'roles-prompt', label: 'Prompt 模板', icon: MessageSquare, type: 'entity', entityType: 'prompt' },
  ]},
  { key: 'orchestration', label: '编排配置', icon: Workflow, desc: '任务编排的策略、执行与可视化', subsections: [
    { key: 'orch-entry', label: '入口参数', icon: Settings, type: 'params', configModule: 'entry', configCategories: ['basic'] },
    { key: 'orch-strategy-params', label: '策略参数', icon: GitBranch, type: 'params', configModule: 'strategy', configCategories: ['basic'] },
    { key: 'orch-strategy', label: '策略管理', icon: GitBranch, type: 'entity', entityType: 'orch-strategy' },
    { key: 'orch-execution', label: '执行参数', icon: Zap, type: 'params', configModule: 'execution', configCategories: ['basic'] },
    { key: 'orch-jsonnode', label: 'JSONNode 参数', icon: Boxes, type: 'params', configModule: 'jsonnode', configCategories: ['basic'] },
    { key: 'orch-visual', label: 'Agent DAG 可视化', icon: Monitor, type: 'params', configModule: 'visualization', configCategories: ['basic'], configLayer: 'ORCHESTRATION' },
  ]},
  { key: 'infra', label: '基础设施', icon: Server, desc: '底层运行时参数：日志、消息队列、存储后端', subsections: [
    { key: 'infra-log', label: '日志', icon: Terminal, type: 'params', configModule: 'log_provider', configCategories: ['basic', 'aging'] },
    { key: 'infra-mq', label: '消息队列', icon: Radio, type: 'params', configModule: 'mq_provider', configCategories: ['basic'] },
    { key: 'infra-graphdb', label: '图数据库', icon: Database, type: 'params', configModule: 'graphdb_provider', configCategories: ['basic', 'aging', 'weight'] },
    { key: 'infra-vectordb', label: '向量数据库', icon: Table2, type: 'params', configModule: 'vectordb_provider', configCategories: ['basic'] },
    { key: 'infra-tool', label: 'HTTP / 工具', icon: Globe, type: 'params', configModule: 'tool_provider', configCategories: ['basic'] },
  ]},
  { key: 'application', label: '应用配置', icon: AppWindow, desc: '对话、自学习、用户画像、可视化', subsections: [
    { key: 'app-chat', label: '对话', icon: MessageCircle, type: 'params', configModule: 'chat', configCategories: ['basic'] },
    { key: 'app-selflearning', label: '自学习', icon: GraduationCap, type: 'params', configModule: 'self_learning', configCategories: ['basic', 'weight', 'interval'] },
    { key: 'app-profile', label: '用户画像', icon: User, type: 'params', configModule: 'user_profile', configCategories: ['basic'] },
    { key: 'app-profile-direction', label: '画像维度', icon: Layers, type: 'entity', entityType: 'profile-direction' },
    { key: 'app-visualization', label: '消息可视化', icon: BarChart3, type: 'params', configModule: 'visualization', configCategories: ['basic'], configLayer: 'APPLICATION' },
  ]},
  { key: 'cdt', label: 'CDT / 浏览器', icon: Monitor, desc: 'Chrome 远程浏览器控制与网页访问', subsections: [
    { key: 'cdt-status', label: '浏览器状态', icon: Radio, type: 'entity', entityType: 'cdt-status' },
    { key: 'cdt-page', label: '网页访问', icon: Globe, type: 'entity', entityType: 'cdt-page' },
    { key: 'cdt-params', label: '浏览器参数', icon: Settings, type: 'params', configModule: 'cdt_provider', configCategories: ['basic'] },
  ]},
  { key: 'maintenance', label: '维护', icon: RefreshCw, desc: '配置重置与快照管理', subsections: [
    { key: 'snapshot', label: '重置与快照', icon: RefreshCw, type: 'snapshot' },
  ]},
  { key: 'feedback', label: '反馈设置', icon: Star, desc: '用户反馈处理的阈值与自动解散策略', subsections: [
    { key: 'feedback-config', label: '解散与阈值', icon: Settings, type: 'params', configModule: 'feedback_handler', configCategories: ['basic'] },
  ]},
]

// ============================================================
// Display name mappings
// ============================================================

export const LAYER_NAMES: Record<string, string> = { BASE: '基础设施层', CORE: '核心层', AGENT: 'Agent层', ORCHESTRATION: '编排层', APPLICATION: '应用层' }
export const LAYER_DESCS: Record<string, string> = { BASE: '提供底层资源与基础配置', CORE: '核心服务编排', AGENT: 'Agent 框架', ORCHESTRATION: '任务与流程编排', APPLICATION: '面向用户的应用入口' }
const LAYER_ICONS: Record<string, typeof Server> = { BASE: Server, CORE: Cpu, AGENT: Bot, ORCHESTRATION: Workflow, APPLICATION: AppWindow }
export const MODULE_NAMES: Record<string, string> = {
  llm_provider: 'LLM Provider', soul_provider: 'Soul Provider', skill_provider: 'Skill Provider', mcp_provider: 'MCP Provider',
  prompts_provider: 'Prompts Provider', log_provider: 'Log Provider', mq_provider: 'MQ Provider', graphdb_provider: 'GraphDB Provider',
  vectordb_provider: 'VectorDB Provider', relationdb_provider: 'RelationDB Provider', llm_core: 'LLM Core', info_core: 'Info Core',
  mcp_core: 'MCP Core', skill_core: 'Skill Core', soul_core: 'Soul Core', agent_library: 'Agent Library', agent_builder: 'Agent Builder',
  agent_execution: 'Agent Execution', agent_strategy: 'Agent Strategy', agent_context: 'Agent Context',
  entry: 'Entry', strategy: 'Strategy', execution: 'Execution', visualization: 'Visualization', jsonnode: 'JSON Node',
  chat: 'Chat', self_learning: 'Self Learning', user_profile: 'User Profile', config: 'Config',
  feedback_handler: 'Feedback Handler',
}
const MODULE_ICONS: Record<string, typeof Cpu> = {
  llm_provider: Cpu, mcp_provider: Plug, soul_provider: Heart, skill_provider: Wand2, prompts_provider: MessageSquare, log_provider: FileText, mq_provider: Send,
  graphdb_provider: Database, vectordb_provider: Boxes, relationdb_provider: Table2, llm_core: Cpu, info_core: Brain, mcp_core: Plug, skill_core: Wand2, soul_core: Heart,
  agent_library: Library, agent_builder: Bot, agent_execution: Play, agent_strategy: GitBranch, agent_context: Layers,
  entry: Workflow, strategy: GitBranch, execution: Play, visualization: Eye, jsonnode: Code2,
  chat: MessageCircle, self_learning: GraduationCap, user_profile: User, config: Settings,
  feedback_handler: Star,
}
const CATEGORY_NAMES: Record<string, string> = { basic: '基础设置', quota: '配额设置', aging: '老化设置', config: '配置', tag_config: '标签配置', summary_config: '摘要配置', vector_config: '向量配置', context_config: '上下文配置', opt_rule: '优化规则', weight: '权重设置', interval: '间隔设置' }

export const ENTITY_MODULES: Record<string, { apiModule: ModuleKey; label: string }> = {
  llm_provider: { apiModule: 'model', label: '模型管理' }, soul_provider: { apiModule: 'soul', label: 'Soul 管理' },
  skill_provider: { apiModule: 'skill', label: 'Skill 管理' }, mcp_provider: { apiModule: 'mcp', label: 'MCP 管理' },
}
export const AGENT_ENTITY_MODULE = { moduleKey: 'meta_agent', apiModule: 'agent' as ModuleKey, label: 'Agent 管理' }
export function layerIcon(layer: string): typeof Server { return LAYER_ICONS[layer] || Layers }
export function moduleIcon(module: string): typeof Cpu { return MODULE_ICONS[module] || Settings }
export function categoryName(category: string): string { return CATEGORY_NAMES[category] || category }

// ============================================================
// Config value helpers
// ============================================================

export function formatValueSummary(item: ConfigTreeItem): string {
  const val = item.current_value ?? item.config_default
  if (val === null || val === undefined) return '未设置'
  if (typeof val === 'boolean') return val ? '启用' : '停用'
  return String(val)
}

export function buildConfigFields(item: ConfigTreeItem): ConfigField[] {
  const val = item.current_value ?? item.config_default
  const type = item.config_type.toUpperCase()
  if (type === 'BOOLEAN' || type === 'BOOL') return [{ key: 'value', label: item.config_name, type: 'boolean', value: !!val }]
  if (type === 'ENUM' && item.config_enum_values) {
    const enumVals = item.config_enum_values as string[]
    return [{ key: 'value', label: item.config_name, type: 'enum', value: String(val ?? ''), options: enumVals.map(v => ({ label: v, value: v })) }]
  }
  if (type === 'INT' || type === 'INTEGER' || type === 'DOUBLE' || type === 'FLOAT' || type === 'NUMBER') {
    return [{ key: 'value', label: item.config_name, type: 'number', value: Number(val ?? 0) }]
  }
  return [{ key: 'value', label: item.config_name, type: 'text', value: String(val ?? '') }]
}

// ============================================================
// Entity field builders (table-driven)
// ============================================================

interface FieldDef { build: (raw: RawItem) => ConfigField }
const text = (key: string, label: string, fallbackKey?: string): FieldDef => ({ build: (raw) => ({ key, label, type: 'text', value: String(raw[fallbackKey || key] || '') }) })
const num = (key: string, label: string): FieldDef => ({ build: (raw) => ({ key, label, type: 'number', value: Number(raw[key] || 0) }) })
const bool = (key: string, label: string): FieldDef => ({ build: (raw) => ({ key, label, type: 'boolean', value: !!raw[key] }) })
const json = (key: string, label: string, fallback: unknown = []): FieldDef => ({ build: (raw) => ({ key, label, type: 'json', value: JSON.stringify(raw[key] || fallback, null, 2) }) })
const enumF = (key: string, label: string, opts: { label: string; value: string | number | boolean }[]): FieldDef => ({ build: (raw) => ({ key, label, type: 'enum', value: String((raw[key] || opts[0]?.value) ?? ''), options: opts }) })

const ENTITY_FIELD_DEFS: Record<ModuleKey, FieldDef[]> = {
  model: [text('providerName', '提供商'), text('modelName', '模型名称'), num('maxTokens', '最大 Token'), enumF('status', '状态', [{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]), bool('isDefault', '设为默认')],
  soul: [text('name', '名称'), text('description', '描述'), json('traits', '特性 (JSON)'), bool('enabled', '启用')],
  work: [text('name', '名称'), text('description', '描述'), json('steps', '步骤 (JSON)'), bool('enabled', '启用')],
  skill: [text('name', '名称'), text('description', '描述'), text('category', '分类'), bool('enabled', '启用')],
  mcp: [text('displayName', '名称', 'name'), text('version', '版本'), text('description', '描述'), bool('enabled', '启用')],
  agent: [text('name', '名称'), text('type', '类型'), text('description', '描述'), bool('enabled', '启用')],
}

export function buildEntityFields(raw: RawItem, m: ModuleKey): ConfigField[] {
  const defs = ENTITY_FIELD_DEFS[m]; if (!defs) return []
  return defs.map((d) => d.build(raw))
}