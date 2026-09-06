import type {
  ChatSession, ChatMessage, AgentChainNode,
  DagNode, DagEdge, MemoryItem, GraphNode, GraphEdge,
  ModelProvider, ModelInfo, LearningStats, LearningProgress,
  SystemHealth, UserProfile, LibraryPath, LibraryFilePage, LibraryTreeNode,
  ConfigTreeLayer,
  UserProfileData, ProfileVersionData, ProfileHistoryItem,
  VisualizedMessage, MessageGraphNode, MessageGraphEdge, AgentDAG, AgentTrace,
  McpUsageRecord,
  Block, AgentDagData,
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
  list: (userId: string, keyword?: string, startTime?: number, endTime?: number, pageCurrent?: number, pageSize?: number) =>
    request<{ sessions: ChatSession[]; total: number }>(`/chat/list?userId=${encodeURIComponent(userId)}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}${startTime ? `&start_time=${startTime}` : ''}${endTime ? `&end_time=${endTime}` : ''}${pageCurrent ? `&page_current=${pageCurrent}` : ''}${pageSize ? `&page_size=${pageSize}` : ''}`),
  history: (sessionId: string, userId: string) =>
    request<{ messages: ChatMessage[] }>(`/chat/history/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(userId)}`).then(r => r.messages),
  dag: (sessionId: string, userId: string) =>
    request<{ work_id: string; nodes: DagNode[]; edges: DagEdge[] }>(`/chat/dag?sessionId=${encodeURIComponent(sessionId)}&userId=${encodeURIComponent(userId)}`),
  sendMessage: (sessionId: string, content: string, citingIds?: string[], selectedMsgIds?: string[]) =>
    request<{ msgId: string; workId: string }>('/chat/send', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        msg_content: content,
        citing_msg_ids: citingIds || [],
        selected_msg_ids: selectedMsgIds || [],
      })
    }),
  createSession: (title?: string) =>
    request<{ session_id: string; session_title: string; created: number }>('/chat/create-session', {
      method: 'POST',
      body: JSON.stringify({ session_title: title || '' })
    }),
  getSessionDetail: (sessionId: string) =>
    request<{ session: { session_id: string } }>(`/chat/session/${encodeURIComponent(sessionId)}`),
  deleteSession: (sessionId: string) =>
    request<void>(`/chat/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  updateTitle: (sessionId: string, title: string) =>
    request<{ success: boolean; session_id: string; session_title: string }>(`/chat/session/${encodeURIComponent(sessionId)}/title`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    }),
  search: (keyword: string) =>
    request<{ sessions: ChatSession[] }>(`/chat/search?keyword=${encodeURIComponent(keyword)}`).then(r => r.sessions),
  // 会话历史热力图：每日会话数（后端按客户端时区分桶，与列表无关，不受搜索/时间过滤影响）
  dateCounts: () =>
    request<{ dates: Record<string, number> }>(`/chat/date-counts?tz=${-new Date().getTimezoneOffset()}`),
  pinMessage: (infoId: string) =>
    request<{ pin: boolean }>(`/chat/message/${encodeURIComponent(infoId)}/pin`, { method: 'POST' }),
  // ===== 修改后：支持模块化独立的思考过程数据采集 (module='all'|'dag'|'blocks') =====
  thinking: (infoId: string, module: 'all' | 'dag' | 'blocks' = 'all') =>
    request<{ work_id: string; interact_id: string; count: number; blocks: Block[]; dag: AgentDagData | null; module?: string }>(
      `/chat/thinking?info_id=${encodeURIComponent(infoId)}&module=${module}`,
    ).then(r => r),
  evalResult: (infoId: string) =>
    request<{ work_id: string; trace_id: string; found: boolean; evaluation: { answer: string; created: number; elapsed_ms: number; agent_name: string } | null }>(
      `/chat/eval-result?info_id=${encodeURIComponent(infoId)}`,
    ),
  agentChain: (exchangeId: string) =>
    request<{ nodes: AgentChainNode[] }>(`/chat/agent-chain/${encodeURIComponent(exchangeId)}`).then(r => r.nodes),
  cancelTask: (exchangeId: string) =>
    request<void>(`/chat/cancel/${encodeURIComponent(exchangeId)}`, { method: 'POST' }),
}

export interface MemoryPage {
  memories: MemoryItem[]
  has_more: boolean
  next_cursor: string | null
}

export const memoryApi = {
  list: (limit = 50, cursor?: string) =>
    request<MemoryPage>(`/memory/list?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  byTag: (userId: string, tag: string) =>
    request<MemoryItem[]>(`/memory/tag/${encodeURIComponent(userId)}/${encodeURIComponent(tag)}`),
  search: (userId: string, opts?: { keyword?: string; type?: string; tag?: string; startTime?: number; endTime?: number; limit?: number; cursor?: string }) => {
    const q = new URLSearchParams()
    q.set('userId', userId)
    if (opts?.keyword) q.set('keyword', opts.keyword)
    if (opts?.type) q.set('type', opts.type)
    if (opts?.tag) q.set('tag', opts.tag)
    if (opts?.startTime) q.set('start_time', String(opts.startTime))
    if (opts?.endTime) q.set('end_time', String(opts.endTime))
    if (opts?.cursor) q.set('cursor', opts.cursor)
    q.set('limit', String(opts?.limit ?? 50))
    return request<MemoryPage>(`/memory/search?${q.toString()}`)
  },
  tags: () => request<{ tags: string[] }>('/memory/tags').then(r => r.tags),
  delete: (infoIds: string[]) =>
    request<{ deleted_count: number }>('/memory', {
      method: 'DELETE',
      body: JSON.stringify({ info_ids: infoIds }),
    }),
  tagGraph: (limit = 100) =>
    request<{ nodes: GraphNode[]; edges: GraphEdge[] }>(`/memory/tag-graph?limit=${limit}`),
  keywordGraph: (limit = 100) =>
    request<{ nodes: GraphNode[]; edges: GraphEdge[] }>(`/memory/keyword-graph?limit=${limit}`),
  clearTagGraph: () =>
    request<{ deleted_nodes: number }>('/memory/tag-graph', { method: 'DELETE' }),
  clearKeywordGraph: () =>
    request<{ deleted_nodes: number }>('/memory/keyword-graph', { method: 'DELETE' }),
  stats: (userId: string) =>
    request<{ totalMemories: number; byType: Record<string, number> }>(`/memory/stats/${encodeURIComponent(userId)}`),
  dateCounts: () =>
    request<{ dates: Record<string, number> }>(`/memory/date-counts?tz=${-new Date().getTimezoneOffset()}`),
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
  },
  graphVisualization: {
    get: (graphType: string) => request<{ graph_repulsion: number; graph_spring_strength: number; graph_show_labels: boolean }>(`/config/graph-visualization?graph_type=${encodeURIComponent(graphType)}`),
    save: (graphType: string, data: { graph_repulsion?: number; graph_spring_strength?: number; graph_show_labels?: boolean }) =>
      request<void>(`/config/graph-visualization?graph_type=${encodeURIComponent(graphType)}`, { method: 'PUT', body: JSON.stringify(data) }),
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
    chat: (id: string, prompt: string, temperature?: number) =>
      request<{ result: string; raw_response: string; input_tokens: number; output_tokens: number; duration_ms: number; error: string }>(
        `/config/model/${encodeURIComponent(id)}/chat`, { method: 'POST', body: JSON.stringify({ prompt, temperature }) }),
    embed: (id: string, input: string) =>
      request<{ embedding: number[]; dimension: number; raw_response: string; input_tokens: number; duration_ms: number; error: string }>(
        `/config/model/${encodeURIComponent(id)}/embed`, { method: 'POST', body: JSON.stringify({ input }) }),
    autofill: (id: string) =>
      request<{ llm_brief: string; model_usage: string; error: string }>(
        `/config/model/${encodeURIComponent(id)}/autofill`, { method: 'POST' }),
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
    createProvider: (data: Record<string, unknown>) =>
      request<{ id: string }>('/config/mcp/provider', { method: 'POST', body: JSON.stringify(data) }),
    updateProvider: (id: string, data: Record<string, unknown>) =>
      request<void>(`/config/mcp/provider/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteProvider: (id: string) =>
      request<void>(`/config/mcp/provider/${encodeURIComponent(id)}`, { method: 'DELETE' }),
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
  usage: (query?: { mcp_install_id?: string; start_date?: string; end_date?: string }) =>
    request<{ list: McpUsageRecord[]; total: number }>(`/mcp/usage${query ? `?${new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
    ).toString()}` : ''}`),
}

export const learningApi = {
  start: (mode?: string) =>
    request<void>('/learning/start', { method: 'POST', body: JSON.stringify(mode ? { mode } : {}) }),
  stop: () => request<void>('/learning/stop', { method: 'POST' }),
  setMode: (mode: string) =>
    request<void>('/learning/mode', { method: 'PUT', body: JSON.stringify({ mode }) }),
  setAuto: (mode: string, enabled: boolean) =>
    request<void>('/learning/auto', { method: 'PUT', body: JSON.stringify({ mode, enabled }) }),
  setRandomFactor: (mode: string, value: number) =>
    request<void>('/learning/random-factor', { method: 'PUT', body: JSON.stringify({ mode, value }) }),
  setDriverWeights: (randomFactor: number) =>
    request<void>('/learning/driver-weights', { method: 'PUT', body: JSON.stringify({ randomFactor }) }),
  getStats: (source?: string) => request<LearningStats>(`/learning/stats${source ? `?source=${encodeURIComponent(source)}` : ''}`),
  getProgress: () => request<LearningProgress>('/learning/progress-enhanced'),
  getQueue: (source?: string) => request<{ tasks: unknown[] }>(`/learning/queue${source ? `?source=${encodeURIComponent(source)}` : ''}`).then(r => r.tasks),
  getKnowledge: (source?: string) => request<{ items: unknown[] }>(`/learning/knowledge${source ? `?source=${encodeURIComponent(source)}` : ''}`).then(r => r.items),
  getInsights: (source?: string) => request<{ items: unknown[] }>(`/learning/insights${source ? `?source=${encodeURIComponent(source)}` : ''}`).then(r => r.items),
}

export const monitorApi = {
  health: () => request<SystemHealth>('/monitor/health-all'),
  resources: () => request<{ cpu: number; memory: number; disk: number }>('/monitor/resources'),
  tokenTrend: () => request<{ points: { date: string; tokens: number }[] }>('/analytics/token-trend').then(r => r.points),
  modelDistribution: () => request<{ models: { model: string; tokens: number; input_tokens: number; output_tokens: number; deleted?: boolean; type?: string }[] }>('/analytics/model-distribution').then(r => r.models),
  logs: (params?: { level?: string; keyword?: string; trace_id?: string; source?: string; log_source?: string; start_time?: number; end_time?: number; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.level) q.set('level', params.level)
    if (params?.keyword) q.set('keyword', params.keyword)
    if (params?.trace_id) q.set('trace_id', params.trace_id)
    if (params?.source) q.set('source', params.source)
    if (params?.log_source) q.set('log_source', params.log_source)
    if (params?.start_time) q.set('start_time', String(params.start_time))
    if (params?.end_time) q.set('end_time', String(params.end_time))
    q.set('limit', String(params?.limit ?? 100))
    return request<{ entries: { id: string; timestamp: number; level: string; source: string; message: string; trace_id?: string; caller?: string }[] }>(
      `/monitor/logs/query?${q.toString()}`
    ).then(r => r.entries)
  },
  logSources: () => request<{ sources: string[] }>('/monitor/logs/sources').then(r => r.sources),
  deleteLogs: (ids: string[]) =>
    request<{ deleted_count: number }>('/monitor/logs', { method: 'DELETE', body: JSON.stringify({ ids }) }),
  clearLogs: () =>
    request<{ deleted_count: number }>('/monitor/logs/all', { method: 'DELETE' }),
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
  setEnabled: (id: string, enabled: boolean) =>
    request<{ enabled: boolean; fileCount: number; directoryCount: number }>(`/library/paths/${encodeURIComponent(id)}/enabled`, {
      method: 'PUT', body: JSON.stringify({ enabled })
    }),
  files: (id: string, opts?: { directory?: string; keyword?: string; cursor?: string; limit?: number }) => {
    const q = new URLSearchParams()
    if (opts?.directory !== undefined) q.set('directory', opts.directory)
    if (opts?.keyword) q.set('keyword', opts.keyword)
    if (opts?.cursor) q.set('cursor', opts.cursor)
    q.set('limit', String(opts?.limit ?? 50))
    return request<LibraryFilePage>(`/library/paths/${encodeURIComponent(id)}/files?${q.toString()}`)
  },
  tree: (id: string) => request<{ tree: LibraryTreeNode[] }>(`/library/paths/${encodeURIComponent(id)}/tree`).then(r => r.tree),
  fileContent: (fileId: string) =>
    request<{ fileName: string; content: string; learnedAt: number }>(`/library/files/${encodeURIComponent(fileId)}/content`),
  queryDocument: (opts: { selection: string; context_before?: string; context_after?: string; question?: string }) =>
    request<{ result: string; llm_id: string }>('/library/query', {
      method: 'POST', body: JSON.stringify(opts)
    }),
  saveAnnotation: (opts: { library_id?: string; file_id: string; selection_text: string; selection_start: number; selection_end: number; question: string; result: string; llm_id?: string }) =>
    request<{ id: string }>('/library/annotations', { method: 'POST', body: JSON.stringify(opts) }),
  fileAnnotations: (fileId: string) =>
    request<{ annotations: Array<{ id: string; file_id: string; selection_text: string; selection_start: number; selection_end: number; question: string; result: string; llm_id: string; created: number }> }>(`/library/files/${encodeURIComponent(fileId)}/annotations`).then(r => r.annotations),
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

export const userProfileApi = {
  get: (sessionId?: string) =>
    request<UserProfileData>(`/profile${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`),
  generate: (sessionId?: string, directions?: string[]) =>
    request<ProfileVersionData>('/profile/generate', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, directions }),
    }),
  history: (sessionId?: string, limit?: number) =>
    request<{ history: ProfileHistoryItem[] }>(`/profile/history${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}${limit ? `&limit=${limit}` : ''}`).then(r => r.history),
  version: (version: number, sessionId?: string) =>
    request<ProfileVersionData>(`/profile/version/${version}${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`),
  reset: (sessionId?: string) =>
    request<{ success: boolean; reset_count: number }>('/profile/reset', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    }),
}

export const visualizationApi = {
  messages: (query: { session_id?: string; work_id?: string; interact_id?: string; lastN?: number; include_citing_info?: boolean; include_context_source?: boolean; page_current?: number; page_size?: number }) =>
    request<{ messages: VisualizedMessage[]; total: number }>(`/visualization/messages?${new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ).toString()}`),
  messageGraph: (sessionId: string, maxNodes?: number) =>
    request<{ session_id: string; graph: { nodes: MessageGraphNode[]; edges: MessageGraphEdge[] }; metadata: Record<string, unknown> }>(
      `/visualization/message-graph?session_id=${encodeURIComponent(sessionId)}${maxNodes ? `&max_nodes=${maxNodes}` : ''}`
    ),
  agentDAG: (workId: string, resolveContent = true) =>
    request<AgentDAG>(`/visualization/work/${encodeURIComponent(workId)}/dag?resolve_content=${resolveContent}`),
  workFlow: (workId: string) =>
    request<Record<string, unknown>>(`/visualization/work/${encodeURIComponent(workId)}/timeline`),
  agentTrace: (agentId: string, traceId?: string) =>
    request<AgentTrace>(`/visualization/agent/${encodeURIComponent(agentId)}/trace${traceId ? `?trace_id=${encodeURIComponent(traceId)}` : ''}`),
  messageDAG: (query: { session_id: string; work_id?: string; include_question_answer_edges?: boolean; include_citation_edges?: boolean; max_nodes?: number }) =>
    request<{ session_id: string; graph: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> }; metadata: Record<string, unknown> }>(
      `/visualization/message-dag?${new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
      ).toString()}`
    ),
  resource: (resourceType: string, resourceId: string) =>
    request<Record<string, unknown>>(`/visualization/resource/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`),
}

/** 语义搜索结果：命中信息记录（相似度搜索直接返回 info 的 id 及其详情） */
export interface VectorSearchInfo {
  info_id: string;
  info_type: string;
  info_creator_role: string;
  info_creator_id: string;
  info: string;
  info_length: number;
  created: number;
  session_id: string;
  work_id: string;
  interact_id: string;
  score: number;
}

export const vectorDbApi = {
  searchByText: (text: string, topK?: number, threshold?: number) =>
    request<{ results: VectorSearchInfo[]; count: number }>('/vectordb/search', {
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
  cookies: () => request<{ cookiesJson: string }>('/cdt/cookies'),
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

export interface ToolCheckResult { valid: boolean; error: string }
export interface ToolTransformResult { valid: boolean; error: string; result: string }
export interface ToolRegexResult {
  valid: boolean; error: string; matched: boolean; matches: string[];
  count: number; groups?: Array<Record<string, string>>;
}

export const toolApi = {
  generateId: (count = 1) =>
    request<{ ids: string[] }>('/tool/id', { method: 'POST', body: JSON.stringify({ count }) }),
  jsonCheck: (text: string) =>
    request<ToolCheckResult>('/tool/json/check', { method: 'POST', body: JSON.stringify({ text }) }),
  jsonFormat: (text: string, indent = 2) =>
    request<ToolTransformResult>('/tool/json/format', { method: 'POST', body: JSON.stringify({ text, indent }) }),
  jsonMinify: (text: string) =>
    request<ToolTransformResult>('/tool/json/minify', { method: 'POST', body: JSON.stringify({ text }) }),
  xmlCheck: (text: string) =>
    request<ToolCheckResult>('/tool/xml/check', { method: 'POST', body: JSON.stringify({ text }) }),
  xmlFormat: (text: string, indent = 2) =>
    request<ToolTransformResult>('/tool/xml/format', { method: 'POST', body: JSON.stringify({ text, indent }) }),
  xmlMinify: (text: string) =>
    request<ToolTransformResult>('/tool/xml/minify', { method: 'POST', body: JSON.stringify({ text }) }),
  regex: (pattern: string, text: string, flags = '') =>
    request<ToolRegexResult>('/tool/regex', { method: 'POST', body: JSON.stringify({ pattern, text, flags }) }),
}

// ============================================================
// Cron 定时任务
// ============================================================

export interface CronTask {
  id: string;
  name: string;
  description: string;
  cron: string;
  enabled: number;
  last_run: number;
  next_run: number;
  created: number;
  updated: number;
}

export interface CronTaskRun {
  id: string;
  task_id: string;
  task_name: string;
  started_at: number;
  finished_at: number;
  status: string;
  result: string;
  error: string;
  created: number;
}

export interface CronFields {
  second: string;
  minute: string;
  hour: string;
  day: string;
  month: string;
  week: string;
}

export const cronApi = {
  tasks: () => request<{ tasks: CronTask[] }>('/cron/tasks').then(r => r.tasks),
  task: (name: string) =>
    request<{ task: CronTask | null }>(`/cron/tasks/${encodeURIComponent(name)}`).then(r => r.task),
  setCron: (name: string, cron: string) =>
    request<{ task: CronTask | null }>(`/cron/tasks/${encodeURIComponent(name)}`, {
      method: 'PUT', body: JSON.stringify({ cron }),
    }).then(r => r.task),
  setEnabled: (name: string, enabled: boolean) =>
    request<{ task: CronTask | null }>(`/cron/tasks/${encodeURIComponent(name)}/enabled`, {
      method: 'PUT', body: JSON.stringify({ enabled }),
    }).then(r => r.task),
  trigger: (name: string) =>
    request<{ run: CronTaskRun | null }>(`/cron/tasks/${encodeURIComponent(name)}/trigger`, { method: 'POST' }),
  runs: (name: string, limit = 50) =>
    request<{ runs: CronTaskRun[] }>(`/cron/tasks/${encodeURIComponent(name)}/runs?limit=${limit}`).then(r => r.runs),
}

export const cronToolApi = {
  check: (expression: string) =>
    request<{ valid: boolean; error: string; normalized: string }>('/tool/cron/check', {
      method: 'POST', body: JSON.stringify({ expression }),
    }),
  generate: (fields: CronFields) =>
    request<{ valid: boolean; error: string; expression: string }>('/tool/cron/generate', {
      method: 'POST', body: JSON.stringify(fields),
    }),
  parse: (expression: string) =>
    request<{ valid: boolean; error: string; fields: CronFields | null }>('/tool/cron/parse', {
      method: 'POST', body: JSON.stringify({ expression }),
    }),
  next: (expression: string) =>
    request<{ valid: boolean; error: string; next_time: number | null }>('/tool/cron/next', {
      method: 'POST', body: JSON.stringify({ expression }),
    }),
}

export { request as fetchApi }

/** 权限应答（v2 权限门：permission.asked → 应答唤醒挂起的 Loop） */
export function answerPermission(permission_id: string, approved: boolean): Promise<{ ok: boolean; answered: boolean }> {
  return request('/chat/permission/answer', { method: 'POST', body: JSON.stringify({ permission_id, approved }) })
}
