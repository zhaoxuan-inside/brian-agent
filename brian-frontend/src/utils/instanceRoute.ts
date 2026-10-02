/**
 * 组件实例 → 配置中心路由映射。
 * 实例 ID 是唯一关联锚点（事件 payload 规范），名称仅作展示。
 */
import type { RouteLocationRaw } from 'vue-router'

export type InstanceKind = 'agent' | 'llm' | 'prompt' | 'soul' | 'skill' | 'mcp'

const INSTANCE_ROUTE: Record<InstanceKind, { section: string; sub: string }> = {
  agent: { section: 'agent', sub: 'agent-instance' },
  llm: { section: 'llm', sub: 'llm-model' },
  prompt: { section: 'roles', sub: 'roles-prompt' },
  soul: { section: 'roles', sub: 'roles-soul' },
  skill: { section: 'skills', sub: 'skills-list' },
  mcp: { section: 'mcp', sub: 'mcp-instance' },
}

/** 生成实例定位路由（ConfigView 支持 ?id= 高亮定位） */
export function instanceRoute(kind: InstanceKind, id?: string): RouteLocationRaw {
  const base = INSTANCE_ROUTE[kind]
  return { path: '/config', query: id ? { ...base, id } : { ...base } }
}
