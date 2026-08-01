import type {
  ChatSession, ChatMessage, AgentChainNode,
  DagNode, DagEdge, MemoryItem, GraphNode, GraphEdge,
  ModelProvider, ModelInfo, LearningStats, LearningProgress,
  SystemHealth, UserProfile, LibraryPath
} from './types'

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `HTTP ${res.status}`)
  }
  return res.json()
}

export const chatApi = {
  list: (userId: string) => request<{ sessions: ChatSession[] }>(`/chat/list?userId=${encodeURIComponent(userId)}`).then(r => r.sessions),
  history: (sessionId: string, userId: string) =>
    request<{ messages: ChatMessage[] }>(`/chat/history/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(userId)}`).then(r => r.messages),
  exchanges: (sessionId: string, userId: string) =>
    request<{ exchanges: unknown[] }>(`/chat/exchanges/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(userId)}`).then(r => r.exchanges),
  dag: (sessionId: string, userId: string) =>
    request<{ nodes: DagNode[]; edges: DagEdge[] }>(`/chat/dag?sessionId=${encodeURIComponent(sessionId)}&userId=${encodeURIComponent(userId)}`),
  sendMessage: (sessionId: string, content: string, citingIds?: string[]) =>
    request<{ msgId: string; workId: string }>('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, msg_content: content, citing_msg_ids: citingIds || [] })
    }),
  deleteSession: (sessionId: string) =>
    request<void>(`/chat/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  search: (keyword: string) =>
    request<{ sessions: ChatSession[] }>(`/chat/search?keyword=${encodeURIComponent(keyword)}`).then(r => r.sessions),
  agentChain: (exchangeId: string) =>
    request<{ nodes: AgentChainNode[] }>(`/chat/agent-chain/${encodeURIComponent(exchangeId)}`).then(r => r.nodes),
  cancelTask: (exchangeId: string) =>
    request<void>(`/chat/cancel/${encodeURIComponent(exchangeId)}`, { method: 'POST' })
}

export const memoryApi = {
  list: () => request<{ memories: MemoryItem[] }>('/memory/list').then(r => r.memories),
  byTag: (userId: string, tag: string) =>
    request<MemoryItem[]>(`/memory/tag/${encodeURIComponent(userId)}/${encodeURIComponent(tag)}`),
  search: (userId: string, keyword: string, type?: string, limit = 20) =>
    request<MemoryItem[]>(`/memory/search?userId=${encodeURIComponent(userId)}&keyword=${encodeURIComponent(keyword)}${type ? `&type=${type}` : ''}&limit=${limit}`),
  tags: () => request<{ tags: string[] }>('/memory/tags').then(r => r.tags),
  tagGraph: () => request<{ nodes: GraphNode[]; edges: GraphEdge[] }>('/memory/tag-graph'),
  keywordGraph: () => request<{ nodes: GraphNode[]; edges: GraphEdge[] }>('/memory/keyword-graph'),
  stats: (userId: string) =>
    request<{ totalMemories: number; byType: Record<string, number> }>(`/memory/stats/${encodeURIComponent(userId)}`)
}

export const configApi = {
  getConfig: () => request<{ config: Record<string, unknown> }>('/config'),
  updateConfig: (data: Record<string, unknown>) =>
    request<void>('/config', { method: 'PUT', body: JSON.stringify(data) }),
  model: {
    list: () => request<ModelInfo[]>('/config/model'),
    get: (id: string) => request<ModelInfo>(`/config/model/${encodeURIComponent(id)}`),
    update: (id: string, data: Record<string, unknown>) =>
      request<void>(`/config/model/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/config/model/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    setDefault: (id: string) =>
      request<void>(`/config/model/${encodeURIComponent(id)}/default`, { method: 'POST' }),
    test: (id: string) =>
      request<{ success: boolean; latency: number; message: string }>(`/config/model/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  },
  provider: {
    list: () => request<ModelProvider[]>('/config/provider'),
    create: (data: Record<string, unknown>) =>
      request<ModelProvider>('/config/provider', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<void>(`/config/provider/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/config/provider/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  soul: {
    list: () => request<{ id: string; name: string; description: string; traits: string[]; enabled: boolean }[]>('/config/soul'),
    update: (id: string, data: Record<string, unknown>) =>
      request<void>(`/config/soul/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/config/soul/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  work: {
    list: () => request<{ id: string; name: string; description: string; steps: string[]; enabled: boolean }[]>('/config/work'),
    update: (id: string, data: Record<string, unknown>) =>
      request<void>(`/config/work/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/config/work/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  mcp: {
    list: () => request<unknown[]>('/config/mcp'),
    update: (id: string, data: Record<string, unknown>) =>
      request<void>(`/config/mcp/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/config/mcp/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  }
}

export const skillApi = {
  list: () => request<{ skills: unknown[] }>('/skill'),
  get: (id: string) => request<unknown>(`/skill/${encodeURIComponent(id)}`),
  create: (data: Record<string, unknown>) =>
    request<unknown>('/skill', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<void>(`/skill/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/skill/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  toggle: (id: string) =>
    request<void>(`/skill/${encodeURIComponent(id)}/toggle`, { method: 'POST' }),
}

export const agentApi = {
  list: () => request<{ agents: unknown[] }>('/agent'),
  get: (id: string) => request<unknown>(`/agent/${encodeURIComponent(id)}`),
  create: (data: Record<string, unknown>) =>
    request<unknown>('/agent', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<void>(`/agent/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/agent/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  toggle: (id: string) =>
    request<void>(`/agent/${encodeURIComponent(id)}/toggle`, { method: 'POST' }),
}

export const mcpApi = {
  installed: () => request<{ installed: unknown[] }>('/mcp'),
  market: () => request<{ market: unknown[] }>('/mcp/market'),
  install: (id: string) =>
    request<void>(`/mcp/${encodeURIComponent(id)}/install`, { method: 'POST' }),
  uninstall: (id: string) =>
    request<void>(`/mcp/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  toggle: (id: string) =>
    request<void>(`/mcp/${encodeURIComponent(id)}/toggle`, { method: 'POST' }),
}

export const learningApi = {
  start: () => request<void>('/learning/start', { method: 'POST' }),
  stop: () => request<void>('/learning/stop', { method: 'POST' }),
  setMode: (mode: string) =>
    request<void>('/learning/mode', { method: 'PUT', body: JSON.stringify({ mode }) }),
  setDriverWeights: (randomFactor: number) =>
    request<void>('/learning/driver-weights', { method: 'PUT', body: JSON.stringify({ randomFactor }) }),
  getStats: () => request<LearningStats>('/learning/stats'),
  getProgress: () => request<LearningProgress>('/learning/progress-enhanced'),
  getQueue: () => request<{ tasks: unknown[] }>('/learning/queue').then(r => r.tasks),
  getKnowledge: () => request<{ items: unknown[] }>('/learning/knowledge').then(r => r.items),
  getInsights: () => request<{ items: unknown[] }>('/learning/insights').then(r => r.items),
}

export const monitorApi = {
  health: () => request<SystemHealth>('/monitor/health-all'),
  resources: () => request<{ cpu: number; memory: number; disk: number }>('/monitor/resources'),
  tokenTrend: () => request<{ points: { date: string; tokens: number }[] }>('/analytics/token-trend').then(r => r.points),
  modelDistribution: () => request<{ models: { model: string; tokens: number }[] }>('/analytics/model-distribution').then(r => r.models),
  logs: (level?: string, limit = 100) =>
    request<{ entries: { timestamp: number; level: string; source: string; message: string }[] }>(
      `/monitor/logs/query?${level ? `level=${level}&` : ''}limit=${limit}`
    ).then(r => r.entries),
}

export const feedbackApi = {
  submit: (msgId: string, rating: number, type: 'rating' | 'like' | 'dislike') =>
    request<void>('/feedback', { method: 'POST', body: JSON.stringify({ msg_id: msgId, score: rating, type }) }),
}

export const libraryApi = {
  paths: () => request<{ paths: LibraryPath[] }>('/library/paths').then(r => r.paths),
  addPath: (data: { name: string; path: string; category: string; description: string }) =>
    request<LibraryPath>('/library/paths', { method: 'POST', body: JSON.stringify(data) }),
  deletePath: (id: string) =>
    request<void>(`/library/paths/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  checkPath: (path: string) =>
    request<{ exists: boolean; isReadable: boolean; isWritable: boolean }>('/library/check-path', {
      method: 'POST', body: JSON.stringify({ path })
    }),
}

export const profileApi = {
  get: (userId: string) => request<UserProfile>(`/profile/${encodeURIComponent(userId)}`),
  update: (userId: string, data: Partial<UserProfile>) =>
    request<void>(`/profile/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify(data) }),
}

export { request as fetchApi }
