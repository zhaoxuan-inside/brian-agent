import type {
  ChatSession, ChatMessage, AgentChainNode,
  DagNode, DagEdge, MemoryItem, GraphNode, GraphEdge,
  ModelProvider, ModelInfo, LearningStats, LearningProgress,
  SystemHealth, UserProfile, LibraryPath,
  ConfigTreeLayer,
} from './types'

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.error || err.message || `HTTP ${res.status}`)
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

export interface GraphSearchNode { id: string; tag: string; info_ids: string[]; depth: number }
export interface GraphSearchEdge { from_id: string; to_id: string; weight: number; active: boolean; compositeWeight: number }
export interface GraphSearchPath { root_tag: string; root_id: string; nodes: GraphSearchNode[]; edges: GraphSearchEdge[] }

export const graphDbApi = {
  tagGraph: () => request<{ nodes: GraphNode[]; edges: Array<{ source: string; target: string; weight: number; isActive?: boolean }> }>('/memory/tag-graph'),
  search: (query: string, maxDepth = 2, onlyActive = true) =>
    request<{ root_tags: Array<{ tag: string; info_ids: string[] }>; paths: GraphSearchPath[] }>('/memory/graph-search', {
      method: 'POST',
      body: JSON.stringify({ query, max_depth: maxDepth, only_active: onlyActive }),
    }),
}

export const configApi = {
  getConfig: () => request<{ config: Record<string, unknown> }>('/config'),
  updateConfig: (data: Record<string, unknown>) =>
    request<void>('/config', { method: 'PUT', body: JSON.stringify(data) }),
  configTree: () => request<{ config: { layers: ConfigTreeLayer[] } }>('/config'),
  entityList: (type: string) => {
    const map: Record<string, () => Promise<unknown[]>> = {
      provider: () => configApi.provider.list(),
      model: () => configApi.model.list(),
      soul: () => configApi.soul.list(),
      skill: () => skillApi.list().then(r => r.skills || []),
      mcp: () => configApi.mcp.list(),
    }
    return map[type] ? map[type]() : Promise.resolve([])
  },
  configItem: {
    get: (configKey: string) =>
      request<{ config_item: Record<string, unknown> }>(`/config/item/${encodeURIComponent(configKey)}`),
    update: (configKey: string, value: unknown) =>
      request<void>('/config', { method: 'PUT', body: JSON.stringify({ config_key: configKey, value }) }),
    create: (data: { layer: string; module: string; category: string; config_key: string; config_name: string; config_description?: string; config_type: string; config_default: unknown; config_enum_values?: unknown[] }) =>
      request<{ config_item: Record<string, unknown> }>('/config/item', { method: 'POST', body: JSON.stringify(data) }),
    delete: (configKey: string) =>
      request<void>(`/config/item/${encodeURIComponent(configKey)}`, { method: 'DELETE' }),
  },
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
    market: () => request<unknown[]>('/config/mcp/market'),
    update: (id: string, data: Record<string, unknown>) =>
      request<void>(`/config/mcp/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/config/mcp/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  prompts: {
    list: () => request<{ prompts: { id: string; title: string; brief: string; enabled: boolean }[] }>('/prompts').then(r => r.prompts),
    get: (id: string) => request<{ id: string; title: string; brief: string; template: string; enabled: boolean }>(`/prompts/${encodeURIComponent(id)}`),
    create: (data: { title: string; brief?: string; template: string; enabled?: boolean }) =>
      request<{ id: string }>('/prompts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { title?: string; brief?: string; template?: string; enabled?: boolean }) =>
      request<void>(`/prompts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/prompts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
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

export interface VectorSearchResult { id: string; content: string; score: number; user_id: string | null; metadata: Record<string, unknown> | null }

export const vectorDbApi = {
  searchByText: (text: string, topK?: number, threshold?: number) =>
    request<{ results: VectorSearchResult[]; count: number }>('/vectordb/search', {
      method: 'POST',
      body: JSON.stringify({ text, top_k: topK, similarity_threshold: threshold }),
    }),
}

export interface MQMessage { id: string; queue: string; payload: unknown; priority: number; status: string; retry_count: number; max_retries: number; created: number; updated: number; processed_at: number | null }
export interface MQStats { pending: number; processing: number; completed: number; failed: number; total: number }

export const mqApi = {
  send: (queue: string, payload: string, priority?: number) =>
    request<{ success: boolean; id: string }>('/config/mq/send', { method: 'POST', body: JSON.stringify({ queue, payload, priority }) }),
  consume: (queue: string) =>
    request<{ message: MQMessage | null }>('/config/mq/consume', { method: 'POST', body: JSON.stringify({ queue }) }),
  stats: (queue?: string) =>
    request<MQStats>(`/config/mq/stats${queue ? `?queue=${encodeURIComponent(queue)}` : ''}`),
  queues: () =>
    request<{ queues: string[] }>('/config/mq/queues').then(r => r.queues),
  purge: (queue: string) =>
    request<{ deleted: number; queue: string }>('/config/mq/purge', { method: 'DELETE', body: JSON.stringify({ queue }) }),
  reset: (queue: string, fromTime?: number) =>
    request<{ reset: number; queue: string; from_time?: number }>('/config/mq/reset', { method: 'POST', body: JSON.stringify({ queue, from_time: fromTime }) }),
}

export interface CDTStatus { running: boolean; pid: number; port: number; endpoint?: string }

export const cdtApi = {
  start: () => request<CDTStatus>('/cdt/start', { method: 'POST' }),
  stop: () => request<void>('/cdt/stop', { method: 'POST' }),
  status: () => request<CDTStatus>('/cdt/status'),
  navigate: (url: string) =>
    request<{ result?: unknown; error?: string }>('/cdt/navigate', { method: 'POST', body: JSON.stringify({ url }) }),
  evaluate: (expression: string) =>
    request<{ result?: unknown; error?: string }>('/cdt/evaluate', { method: 'POST', body: JSON.stringify({ expression }) }),
  // Remote Browser
  screencastStart: (w = 1920, h = 1080, q = 80) =>
    request<{ started: boolean }>(`/cdt/screencast/start?w=${w}&h=${h}&q=${q}`),
  frame: () => request<{ dataUrl: string; width: number; height: number }>('/cdt/frame'),
  mouse: (type: string, x: number, y: number, button = 'left', clickCount = 1, deltaX = 0, deltaY = 0, ctrl = false, alt = false, shift = false, meta = false) =>
    fetch(`${API_BASE}/cdt/mouse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, x, y, button, clickCount, deltaX, deltaY, ctrl, alt, shift, meta }) }),
  click: (x: number, y: number, ctrl = false, alt = false, shift = false, meta = false) =>
    fetch(`${API_BASE}/cdt/click`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x, y, ctrl, alt, shift, meta }) }),
  rightclick: (x: number, y: number) =>
    fetch(`${API_BASE}/cdt/rightclick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x, y }) }),
  dblclick: (x: number, y: number, ctrl = false, alt = false, shift = false, meta = false) =>
    fetch(`${API_BASE}/cdt/dblclick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x, y, ctrl, alt, shift, meta }) }),
  key: (type: string, text = '', key = '', ctrl = false, alt = false, shift = false, meta = false) =>
    fetch(`${API_BASE}/cdt/key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, text, key, ctrl, alt, shift, meta }) }),
  keyBatch: (events: Array<{ type: string; text?: string; key?: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }>) =>
    fetch(`${API_BASE}/cdt/key-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) }),
  insertText: (text: string) =>
    fetch(`${API_BASE}/cdt/insert-text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }),
  spoofEnv: (env: Record<string, unknown>) =>
    fetch(`${API_BASE}/cdt/spoof-env`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env) }),
}

export interface BookmarkFolder { id: string; name: string; parent_id: string; sort_order: number; children: BookmarkFolder[]; items: BookmarkItem[] }
export interface BookmarkItem { id: string; folder_id: string; title: string; url: string; favicon: string; sort_order: number }
export interface BookmarkFlatFolder { id: string; name: string; parent_id: string; sort_order: number }

export const bookmarkApi = {
  tree: () => request<{ tree: BookmarkFolder[] }>('/bookmark/tree').then(r => r.tree),
  flatFolders: () => request<{ folders: BookmarkFlatFolder[] }>('/bookmark/folders').then(r => r.folders),
  createFolder: (name: string, parentId = '') =>
    request<BookmarkFolder>('/bookmark/folder', { method: 'POST', body: JSON.stringify({ name, parent_id: parentId }) }),
  updateFolder: (id: string, name: string) =>
    request<void>('/bookmark/folder/update', { method: 'PUT', body: JSON.stringify({ id, name }) }),
  deleteFolder: (id: string) =>
    request<void>('/bookmark/folder', { method: 'DELETE', body: JSON.stringify({ id }) }),
  createItem: (folderId: string, title: string, url: string, favicon = '') =>
    request<BookmarkItem>('/bookmark/item', { method: 'POST', body: JSON.stringify({ folder_id: folderId, title, url, favicon }) }),
  updateItem: (id: string, title: string, url: string) =>
    request<void>('/bookmark/item/update', { method: 'PUT', body: JSON.stringify({ id, title, url }) }),
  moveItem: (id: string, targetFolderId: string) =>
    request<void>('/bookmark/item/move', { method: 'PUT', body: JSON.stringify({ id, target_folder_id: targetFolderId }) }),
  deleteItem: (id: string) =>
    request<void>('/bookmark/item', { method: 'DELETE', body: JSON.stringify({ id }) }),
}

export { request as fetchApi }
