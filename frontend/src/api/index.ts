const BASE_URL = '/api';

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const method = options.method || 'GET';
  
  console.log('[fetchApi] ====== REQUEST START ======');
  console.log('[fetchApi] URL:', url);
  console.log('[fetchApi] Method:', method);
  console.log('[fetchApi] Headers:', JSON.stringify(options.headers || {}));
  if (options.body) {
    try {
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      console.log('[fetchApi] Body:', JSON.stringify(body, null, 2));
    } catch {
      console.log('[fetchApi] Body:', options.body);
    }
  }
  console.log('[fetchApi] Timestamp:', new Date().toISOString());
  console.log('[fetchApi] ====== REQUEST END ======');

  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const duration = Date.now() - startTime;
    console.log('[fetchApi] ====== RESPONSE START ======');
    console.log('[fetchApi] URL:', url);
    console.log('[fetchApi] Status:', response.status, response.statusText);
    console.log('[fetchApi] Duration:', duration, 'ms');
    console.log('[fetchApi] Headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let responseData: any;
    try {
      responseData = await response.json();
      const dataStr = JSON.stringify(responseData);
      console.log('[fetchApi] Response Data:', dataStr.length > 2000 ? dataStr.substring(0, 2000) + '...' : dataStr);
    } catch (parseError) {
      console.log('[fetchApi] Response parse error:', parseError);
      responseData = null;
    }
    console.log('[fetchApi] ====== RESPONSE END ======');

    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${responseData?.error || response.statusText}`);
    }

    return responseData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    const duration = Date.now() - startTime;
    console.error('[fetchApi] ====== ERROR START ======');
    console.error('[fetchApi] URL:', url);
    console.error('[fetchApi] Method:', method);
    console.error('[fetchApi] Duration:', duration, 'ms');
    console.error('[fetchApi] Error Name:', e.name);
    console.error('[fetchApi] Error Message:', e.message);
    console.error('[fetchApi] Error Stack:', e.stack);
    console.error('[fetchApi] Error Cause:', e.cause);
    console.error('[fetchApi] Network Error:', e.name === 'TypeError' && e.message === 'Failed to fetch');
    console.error('[fetchApi] ====== ERROR END ======');

    if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
      console.warn('[fetchApi] Retrying after 1000ms...');
      await new Promise(r => setTimeout(r, 1000));
      
      const retryStartTime = Date.now();
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        const retryDuration = Date.now() - retryStartTime;
        console.log('[fetchApi] ====== RETRY RESPONSE START ======');
        console.log('[fetchApi] URL:', url);
        console.log('[fetchApi] Status:', response.status, response.statusText);
        console.log('[fetchApi] Retry Duration:', retryDuration, 'ms');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let responseData: any;
        try {
          responseData = await response.json();
          const dataStr = JSON.stringify(responseData);
          console.log('[fetchApi] Retry Response Data:', dataStr.length > 2000 ? dataStr.substring(0, 2000) + '...' : dataStr);
        } catch (parseError) {
          console.log('[fetchApi] Retry Response parse error:', parseError);
          responseData = null;
        }
        console.log('[fetchApi] ====== RETRY RESPONSE END ======');

        if (!response.ok) {
          throw new Error(`API error ${response.status}: ${responseData?.error || response.statusText}`);
        }

        return responseData;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (retryError: any) {
        const retryDuration = Date.now() - retryStartTime;
        console.error('[fetchApi] ====== RETRY ERROR START ======');
        console.error('[fetchApi] URL:', url);
        console.error('[fetchApi] Retry Duration:', retryDuration, 'ms');
        console.error('[fetchApi] Retry Error:', retryError.message);
        console.error('[fetchApi] ====== RETRY ERROR END ======');
        throw retryError;
      }
    }
    throw e;
  }
}

// ============================================================
// 共享类型定义
// ============================================================

export interface MemoryItem {
  id: string;
  userId: string;
  content: string;
  summary?: string;
  type: string;
  source: string;
  tags: string[];
  role?: 'user' | 'assistant' | 'system';
  strength?: number;
  confidence: number;
  importance: number;
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  accessCount: number;
  [key: string]: unknown;
}

export interface ConfigItem {
  id?: string;
  name?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface ModelConfigItem {
  id: string;
  userId: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  maxTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
  quotaTokensPerDay: number;
  quotaTokensPerWeek: number;
  quotaTokensPerMonth: number;
  quotaCallsPerDay: number;
  quotaCallsPerWeek: number;
  quotaCallsPerMonth: number;
  isDefault: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface FeedbackItem {
  id: number;
  userId: string;
  messageId: string;
  rating: 'positive' | 'negative' | 'neutral';
  comment?: string;
  tags?: string[];
  createdAt: number;
  [key: string]: unknown;
}

export interface DocumentItem {
  id: string;
  userId: string;
  name: string;
  content: string;
  type: string;
  tags?: string[];
  createdAt: number;
  [key: string]: unknown;
}

export interface ProfileData {
  userId: string;
  name: string;
  avatar: string;
  preferences: Record<string, unknown>;
  tags?: string[];
  updatedAt?: number | string;
  confidence?: number;
  [key: string]: unknown;
}

export interface GraphData {
  nodes: { id: string; label?: string; type?: string; [key: string]: unknown }[];
  edges: { source: string; target: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

// ============================================================
// Chat API
// ============================================================

export const chatApi = {
  send: (data: { userId: string; message: string; sessionId?: string; exchangeId?: string; selectedMessageIds?: string[] }) =>
    fetchApi<{ id: string; sessionId: string; exchangeId: string; msgId: string; userId: string; content: string; role: string; timestamp: number }>(
      '/chat/send',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  stream: (data: { userId: string; message: string; sessionId?: string; exchangeId?: string }) =>
    fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  history: (sessionId: string, userId: string, page?: number, pageSize?: number) =>
    fetchApi<{
      messages: { id: string; sessionId: string; exchangeId: string; msgId: string; role: string; content: string; summary: string; referenceCount: number; createdAt: number }[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    }>(
      `/chat/history/${sessionId}?userId=${userId}&page=${page || 1}&pageSize=${pageSize || 100}`
    ),

  list: (userId: string) =>
    fetchApi<{ sessionId: string; lastMessage: string; lastTime: number }[]>(
      `/chat/list?userId=${userId}`
    ),

  deleteSession: (sessionId: string) =>
    fetchApi<{ success: boolean }>(`/chat/session/${sessionId}`, { method: 'DELETE' }),

  exchanges: (sessionId: string, userId: string) =>
    fetchApi<{
      exchanges: {
        exchangeId: string;
        userMessage: { msgId: string; content: string; summary: string; referenceCount: number; createdAt: number } | null;
        assistantMessage: { msgId: string; content: string; summary: string; referenceCount: number; createdAt: number } | null;
        messageCount: number;
        firstMessageAt: number;
        lastMessageAt: number;
        referencedExchangeIds: string[];
      }[];
    }>(`/chat/exchanges/${sessionId}?userId=${userId}`),

  dag: (sessionId: string, userId: string) =>
    fetchApi<{
      nodes: {
        msgId: string;
        exchangeId: string;
        role: 'user' | 'assistant' | 'system';
        summary: string;
        createdAt: number;
        messageIndex: number;
        referencesOut: number;
        referencesIn: number;
        isBranch: boolean;
      }[];
      edges: { from: string; to: string; type: 'sequence' | 'reference' }[];
    }>(`/chat/dag/${sessionId}?userId=${userId}`),

  message: (msgId: string) =>
    fetchApi<{
      msgId: string;
      exchangeId: string;
      sessionId: string;
      role: string;
      content: string;
      summary: string;
      createdAt: number;
      referencesOut: { msgId: string; role: string; summary: string; createdAt: number }[];
      referencesIn: { msgId: string; role: string; summary: string; createdAt: number }[];
    }>(`/chat/message/${msgId}`),
  agentChain: (exchangeId: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchApi<{ agentChain: any[] }>(`/chat/agent-chain/${exchangeId}`),

  search: (userId: string, query: string, limit?: number) =>
    fetchApi<{ messages: { id: string; msgId: string; sessionId: string; exchangeId: string; role: string; content: string; summary: string; createdAt: number }[] }>(
      `/chat/search?userId=${userId}&q=${encodeURIComponent(query)}&limit=${limit || 20}`
    ),
};

// ============================================================
// Memory API
// ============================================================

export const memoryApi = {
  working: (userId: string, chatId: string, limit?: number) =>
    fetchApi<MemoryItem[]>(`/memory/working/${userId}/${chatId}${limit ? `?limit=${limit}` : ''}`),

  semantic: (userId: string, query: string, limit?: number) =>
    fetchApi<MemoryItem[]>(`/memory/semantic/${userId}?query=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}`),

  episodic: (userId: string, limit?: number) =>
    fetchApi<MemoryItem[]>(`/memory/episodic/${userId}${limit ? `?limit=${limit}` : ''}`),

  procedural: (userId: string, limit?: number) =>
    fetchApi<MemoryItem[]>(`/memory/procedural/${userId}${limit ? `?limit=${limit}` : ''}`),

  byTag: (userId: string, tag: string) =>
    fetchApi<MemoryItem[]>(`/memory/tag/${userId}/${encodeURIComponent(tag)}`),

  ratios: (userId: string) =>
    fetchApi<Record<string, number>>(`/memory/ratio/${userId}`),

  updateRatios: (userId: string, ratios: Record<string, number>) =>
    fetchApi<{ success: boolean }>(`/memory/ratio/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(ratios),
    }),

  all: (userId: string) =>
    fetchApi<MemoryItem[]>(`/memory/${userId}`),

  list: () =>
    fetchApi<{ memories: MemoryItem[] }>('/memory'),

  tags: () =>
    fetchApi<{ tags: string[] }>('/memory/tags'),

  groups: () =>
    fetchApi<{ groups: Record<string, MemoryItem[]> }>('/memory/groups'),

  tagGraph: () =>
    fetchApi<{ nodes: Array<{ id: string; name: string; weight: number; degree: number }>; edges: Array<{ source: string; target: string; weight: number }> }>('/memory/tag-graph'),

  search: (userId: string, query: string, type?: string, limit?: number, includeLearning?: boolean) =>
    fetchApi<MemoryItem[]>(`/memory/search/${userId}?query=${encodeURIComponent(query)}${type ? `&type=${type}` : ''}${limit ? `&limit=${limit}` : ''}${includeLearning ? `&includeLearning=true` : ''}`),

  stats: (userId: string) =>
    fetchApi<Record<string, unknown>>(`/memory/stats/${userId}`),
};

// ============================================================
// Config API
// ============================================================

export const configApi = {
  getConfig: () => fetchApi<Record<string, unknown>>('/config'),

  getDefaults: () => fetchApi<Record<string, unknown>>('/config/defaults'),

  updateDefaults: (data: Record<string, number>) =>
    fetchApi<Record<string, unknown>>('/config/defaults', { method: 'PUT', body: JSON.stringify(data) }),

  llm: {
    list: () => fetchApi<ConfigItem[]>('/config/llm'),
    create: (config: Record<string, unknown>) => fetchApi<{ success: boolean }>('/config/llm', { method: 'POST', body: JSON.stringify(config) }),
    update: (id: string, config: Record<string, unknown>) => fetchApi<{ success: boolean }>(`/config/llm/${id}`, { method: 'PUT', body: JSON.stringify(config) }),
    delete: (id: string) => fetchApi<{ success: boolean }>(`/config/llm/${id}`, { method: 'DELETE' }),
  },

  provider: {
    create: (data: { id: string; name: string; type: string; baseUrl: string; apiKey: string }) =>
      fetchApi<Record<string, unknown>>('/config/provider', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      fetchApi<Record<string, unknown>>(`/config/provider/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    test: (id: string) =>
      fetchApi<{ success: boolean; message: string; latency: number }>(`/config/provider/${id}/test`, { method: 'POST' }),
    delete: (id: string) =>
      fetchApi<{ success: boolean }>(`/config/provider/${id}`, { method: 'DELETE' }),
    fetchModels: (id: string) =>
      fetchApi<{ code: number; msg: string; content?: string; models?: Array<{ id: string; name: string; maxTokens: number; supportsVision: boolean; supportsTools: boolean }> }>(`/config/provider/${id}/fetch-models`, { method: 'POST' }),
    models: (id: string) =>
      fetchApi<{ models: Array<{ id: string; name: string; maxTokens: number; supportsVision: boolean; supportsTools: boolean }> }>(`/config/provider/${id}/models`),
  },

  mcp: {
    list: () => fetchApi<ConfigItem[]>('/config/mcp'),
    install: (data: { name: string; version: string; url: string }) =>
      fetchApi<{ success: boolean }>('/config/mcp/install', { method: 'POST', body: JSON.stringify(data) }),
    uninstall: (name: string) =>
      fetchApi<{ success: boolean }>(`/config/mcp/uninstall/${name}`, { method: 'POST' }),
    update: (id: string, config: Record<string, unknown>) =>
      fetchApi<ConfigItem>(`/config/mcp/${id}`, { method: 'PUT', body: JSON.stringify(config) }),
  },

  soul: {
    list: () => fetchApi<ConfigItem[]>('/config/soul'),
    create: (config: Record<string, unknown>) => fetchApi<ConfigItem>('/config/soul', { method: 'POST', body: JSON.stringify(config) }),
    update: (id: string, config: Record<string, unknown>) => fetchApi<ConfigItem>(`/config/soul/${id}`, { method: 'PUT', body: JSON.stringify(config) }),
    delete: (id: string) => fetchApi<{ success: boolean }>(`/config/soul/${id}`, { method: 'DELETE' }),
  },

  work: {
    list: () => fetchApi<ConfigItem[]>('/config/work'),
    create: (config: Record<string, unknown>) => fetchApi<ConfigItem>('/config/work', { method: 'POST', body: JSON.stringify(config) }),
    update: (id: string, config: Record<string, unknown>) => fetchApi<ConfigItem>(`/config/work/${id}`, { method: 'PUT', body: JSON.stringify(config) }),
    delete: (id: string) => fetchApi<{ success: boolean }>(`/config/work/${id}`, { method: 'DELETE' }),
  },

  model: {
    list: () => fetchApi<ModelConfigItem[]>('/config/model'),
    batchSave: (data: { providerId: string; modelIds: string[]; userId?: string }) =>
      fetchApi<{ success: boolean; configs: ModelConfigItem[]; count: number }>('/config/model/batch', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, config: Record<string, unknown>) => fetchApi<ModelConfigItem>(`/config/model/${id}`, { method: 'PUT', body: JSON.stringify(config) }),
    setDefault: (id: string) => fetchApi<{ success: boolean; config: ModelConfigItem }>(`/config/model/${id}/default`, { method: 'PUT' }),
    unsetDefault: (id: string) => fetchApi<{ success: boolean; config: ModelConfigItem }>(`/config/model/${id}/default`, { method: 'DELETE' }),
    test: (id: string) =>
      fetchApi<{ success: boolean; message: string; latency: number }>(`/config/model/${id}/test`, { method: 'POST' }),
    defaults: () => fetchApi<Record<string, unknown>>('/config/model/defaults'),
    delete: (id: string) => fetchApi<{ success: boolean }>(`/config/model/${id}`, { method: 'DELETE' }),
  },
};

// ============================================================
// Statistics API
// ============================================================

export const analyticsApi = {
  tokenUsage: () => fetchApi<Record<string, unknown>>('/analytics/token-usage'),
  userTokenUsage: (userId: string) => fetchApi<Record<string, unknown>>(`/analytics/token-usage/${userId}`),
  memoryStats: (userId: string) => fetchApi<Record<string, unknown>>(`/analytics/memory-stats?userId=${userId}`),
  messageStats: (userId?: string, startDate?: string, endDate?: string) => {
    let url = '/analytics/message-stats';
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (params.size) url += `?${params.toString()}`;
    return fetchApi<Record<string, unknown>>(url);
  },
  summary: () => fetchApi<Record<string, unknown>>('/analytics/summary'),
  ring: () => fetchApi<Record<string, unknown>>('/analytics/ring'),
  contribution: (year?: number, modelId?: string) => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (modelId) params.set('modelId', modelId);
    const qs = params.toString();
    return fetchApi<Record<string, unknown>>('/analytics/contribution' + (qs ? `?${qs}` : ''));
  },
  vectorDb: () => fetchApi<Record<string, unknown>>('/analytics/vector-db'),
  perModel: () => fetchApi<Record<string, unknown>>('/analytics/per-model'),
};

// ============================================================
// Feedback API
// ============================================================

export const feedbackApi = {
  create: (data: { userId: string; messageId: string; rating: 'positive' | 'negative' | 'neutral'; comment?: string; tags?: string[] }) =>
    fetchApi<{ success: boolean; id: number }>('/feedback', { method: 'POST', body: JSON.stringify(data) }),

  list: (userId?: string, messageId?: string) => {
    let url = '/feedback';
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (messageId) params.set('messageId', messageId);
    if (params.size) url += `?${params.toString()}`;
    return fetchApi<FeedbackItem[]>(url);
  },

  get: (id: number) => fetchApi<FeedbackItem>(`/feedback/${id}`),

  stats: () => fetchApi<{ total: number; positive: number; negative: number; neutral: number }>('/feedback/stats'),
};

// ============================================================
// Learning API
// ============================================================

export const learningApi = {
  fromChat: (chatId: string, userId: string) =>
    fetchApi<{ success: boolean; message: string; learnedCount: number }>(`/learning/chat/${chatId}`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  fromDocument: (documentId: string, userId: string) =>
    fetchApi<{ success: boolean; message: string; learnedCount: number }>(`/learning/document/${documentId}`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  upload: (data: { userId: string; name: string; content: string; type: 'markdown' | 'text' | 'pdf'; tags?: string[] }) =>
    fetchApi<DocumentItem>('/learning/upload', { method: 'POST', body: JSON.stringify(data) }),

  listDocuments: (userId: string) => fetchApi<DocumentItem[]>(`/learning/documents/${userId}`),

  getDocument: (userId: string, documentId: string) => fetchApi<DocumentItem>(`/learning/document/${userId}/${documentId}`),

  deleteDocument: (userId: string, documentId: string) =>
    fetchApi<{ success: boolean }>(`/learning/document/${userId}/${documentId}`, { method: 'DELETE' }),

  search: (userId: string, query: string, limit?: number) =>
    fetchApi<DocumentItem[]>(`/learning/search/${userId}?query=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}`),

  // 学习队列管理
  getQueue: () => fetchApi<Array<{ id: string; status: string; priority?: number; content?: string; confidence?: number }>>('/learning/queue'),

  getQueueStats: () => fetchApi<{ pending: number; approved: number; learning: number; completed: number; skipped: number }>('/learning/queue/stats'),

  setPriority: (id: string, priority: number) =>
    fetchApi<{ success: boolean }>(`/learning/queue/${id}/priority`, { method: 'PUT', body: JSON.stringify({ priority }) }),

  skipTask: (id: string) =>
    fetchApi<{ success: boolean }>(`/learning/queue/${id}/skip`, { method: 'PUT' }),

  batchApprove: (ids: string[]) =>
    fetchApi<{ success: boolean }>('/learning/queue/batch-approve', { method: 'POST', body: JSON.stringify({ ids }) }),

  // 学习进度
  getProgress: () => fetchApi<{ phases?: Array<{ status?: string; items?: unknown[] }> }>('/learning/progress'),

  // 知识图谱
  getKnowledge: (source?: string) =>
    fetchApi<Array<{ id: string; content?: string; topic?: string; source?: string; tags: string[] }>>(`/learning/knowledge${source ? `?source=${encodeURIComponent(source)}` : ''}`),

  // 洞察
  getInsights: (limit?: number) =>
    fetchApi<Array<{ timestamp: number; insight?: string; content?: string }>>(`/learning/insights${limit ? `?limit=${limit}` : ''}`),

  // 学习控制（后端尚未实现，调用失败会优雅降级）
  startLearning: () =>
    fetchApi<{ success: boolean }>('/learning/start', { method: 'POST' }),

  stopLearning: () =>
    fetchApi<{ success: boolean }>('/learning/stop', { method: 'POST' }),

  configDriverWeights: (weights: Record<string, number>) =>
    fetchApi<{ success: boolean }>('/learning/driver-weights', { method: 'PUT', body: JSON.stringify(weights) }),
};

// ============================================================
// Profile API
// ============================================================

export const profileApi = {
  get: (userId: string) => fetchApi<ProfileData>(`/profile/${userId}`),

  update: (userId: string, data: Partial<ProfileData>) =>
    fetchApi<ProfileData>(`/profile/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),

  interests: (userId: string) => fetchApi<{ topic: string; score: number }[]>(`/profile/${userId}/interests`),

  addTag: (userId: string, tag: string) =>
    fetchApi<{ success: boolean }>(`/profile/${userId}/tags`, { method: 'POST', body: JSON.stringify({ tag }) }),

  removeTag: (userId: string, tag: string) =>
    fetchApi<{ success: boolean }>(`/profile/${userId}/tags/${tag}`, { method: 'DELETE' }),
};

// ============================================================
// Visual API
// ============================================================

export const visualApi = {
  memoryGraph: (userId: string) => fetchApi<GraphData>(`/visual/memory-graph/${userId}`),

  chatFlow: (chatId: string, userId: string) =>
    fetchApi<GraphData>(`/visual/chat-flow/${chatId}?userId=${userId}`),

  agentStatus: () => fetchApi<Record<string, unknown>>('/visual/agent-status'),
};

// ============================================================
// Gateway API
// ============================================================

export const gatewayApi = {
  message: (data: { userId: string; message: string; chatId?: string; selectedMessageIds?: string[] }) =>
    fetchApi<Record<string, unknown>>('/gateway/message', { method: 'POST', body: JSON.stringify(data) }),

  health: () => fetchApi<{ status: string; timestamp: number }>('/gateway/health'),
};

// ============================================================
// Stats API
// ============================================================

export const systemApi = {
  system: (params?: { tokenYear?: number; latencyYear?: number }) => {
    let url = '/system';
    if (params) {
      const searchParams = new URLSearchParams();
      if (params.tokenYear) searchParams.set('tokenYear', String(params.tokenYear));
      if (params.latencyYear) searchParams.set('latencyYear', String(params.latencyYear));
      if (searchParams.size) url += `?${searchParams.toString()}`;
    }
    return fetchApi<Record<string, unknown>>(url);
  },
};

// ============================================================
// Library API
// ============================================================

export const libraryApi = {
  paths: () => fetchApi<{ paths: Record<string, unknown>[]; count: number }>('/library/paths'),
  addPath: (data: { name: string; path: string; category: string; description?: string; metadata?: Record<string, unknown> }) =>
    fetchApi<Record<string, unknown>>('/library/paths', { method: 'POST', body: JSON.stringify(data) }),
  deletePath: (id: string) =>
    fetchApi<{ success: boolean }>(`/library/paths/${id}`, { method: 'DELETE' }),
  checkPath: (path: string) =>
    fetchApi<{ path: string; exists: boolean; isDirectory: boolean; isReadable: boolean; isWritable: boolean }>(
      '/library/check-path', { method: 'POST', body: JSON.stringify({ path }) }
    ),
};

// ============================================================
// Agent API
// ============================================================

export const agentApi = {
  list: (search?: string) =>
    fetchApi<{ agents: Record<string, unknown>[]; count: number }>(`/agent${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  models: () => fetchApi<Record<string, unknown>[]>('/agent/models'),
  get: (id: string) => fetchApi<Record<string, unknown>>(`/agent/${id}`),
  create: (data: Record<string, unknown>) => fetchApi<Record<string, unknown>>('/agent/create', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) => fetchApi<Record<string, unknown>>(`/agent/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi<{ success: boolean }>(`/agent/${id}`, { method: 'DELETE' }),
  toggle: (id: string) => fetchApi<Record<string, unknown>>(`/agent/${id}/toggle`, { method: 'POST' }),
  clone: (id: string) => fetchApi<Record<string, unknown>>(`/agent/${id}/clone`, { method: 'POST' }),
  getMcps: (id: string) => fetchApi<{ mcps: Record<string, unknown>[]; count: number }>(`/agent/${id}/mcps`),
  getSkills: (id: string) => fetchApi<{ skills: Record<string, unknown>[]; count: number }>(`/agent/${id}/skills`),
  getSoul: (id: string) => fetchApi<{ soul: Record<string, unknown> | null }>(`/agent/${id}/soul`),
  getWorks: (id: string) => fetchApi<{ works: Record<string, unknown>[]; count: number }>(`/agent/${id}/works`),
  generatePrompt: (data: { purpose: string; constraints?: string }) =>
    fetchApi<Record<string, unknown>>('/agent/generate-prompt', { method: 'POST', body: JSON.stringify(data) }),
  generateSoul: (data: { purpose: string; preference?: string }) =>
    fetchApi<Record<string, unknown>>('/agent/generate-soul', { method: 'POST', body: JSON.stringify(data) }),
  suggestSkills: (data: { purpose: string; description?: string }) =>
    fetchApi<{ skills: Record<string, unknown>[]; count: number }>('/agent/suggest-skills', { method: 'POST', body: JSON.stringify(data) }),
  suggestMcps: (data: { purpose: string; description?: string }) =>
    fetchApi<{ mcps: Record<string, unknown>[]; count: number }>('/agent/suggest-mcps', { method: 'POST', body: JSON.stringify(data) }),
  suggestSouls: (data: { purpose: string; description?: string }) =>
    fetchApi<{ souls: Record<string, unknown>[]; count: number }>('/agent/suggest-souls', { method: 'POST', body: JSON.stringify(data) }),
  suggestWorks: (data: { purpose: string; description?: string }) =>
    fetchApi<{ works: Record<string, unknown>[]; count: number }>('/agent/suggest-works', { method: 'POST', body: JSON.stringify(data) }),
};

// ============================================================
// MCP Market API (standalone /api/mcp routes)
// ============================================================

export const mcpMarketApi = {
  market: (search?: string, category?: string) => {
    let url = '/mcp/market';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    if (params.size) url += `?${params.toString()}`;
    return fetchApi<{ packages: Record<string, unknown>[]; count: number }>(url);
  },
  sync: () => fetchApi<{ success: boolean; message: string }>('/mcp/market/sync', { method: 'POST' }),
  detail: (id: string) => fetchApi<Record<string, unknown>>(`/mcp/market/${id}`),
  install: (id: string) => fetchApi<Record<string, unknown>>(`/mcp/market/${id}`, { method: 'POST' }),
  uninstall: (id: string) => fetchApi<{ success: boolean }>(`/mcp/market/${id}`, { method: 'DELETE' }),
  installed: (page?: number, pageSize?: number) => {
    let url = '/mcp/installed';
    const params = new URLSearchParams();
    if (page) params.set('page', String(page));
    if (pageSize) params.set('pageSize', String(pageSize));
    if (params.size) url += `?${params.toString()}`;
    return fetchApi<{ installed: Record<string, unknown>[]; total: number; page: number; pageSize: number }>(url);
  },
  toggle: (id: string) => fetchApi<Record<string, unknown>>(`/mcp/${id}/toggle`, { method: 'POST' }),

  // Market management
  listMarkets: () => fetchApi<{ markets: Array<{ id: string; name: string; url: string; description: string; enabled: boolean }>; count: number }>('/mcp/markets'),
  addMarket: (data: { name: string; url: string; description: string }) =>
    fetchApi<{ id: string; name: string; url: string; description: string; enabled: boolean }>('/mcp/markets', { method: 'POST', body: JSON.stringify(data) }),
  deleteMarket: (id: string) => fetchApi<{ success: boolean }>(`/mcp/markets/${id}`, { method: 'DELETE' }),

  // Hot MCP
  getHotMcps: () => fetchApi<{ code: number; msg: string; data: Array<{ id: string; marketId: string; packageName: string; displayName: string; description: string; author: string; version: string; repository: string; category: string; tags: string[]; tools: Array<{ name: string; description: string }> }> }>('/mcp/hot'),

  // Market MCP list (paginated)
  getMarketMcps: (marketId: string, page: number = 1, pageSize: number = 20, search?: string) => {
    let url = `/mcp/market/${marketId}/mcps?page=${page}&pageSize=${pageSize}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return fetchApi<{ code: number; msg: string; data: { mcps: Array<Record<string, unknown>>; total: number; page: number; pageSize: number } }>(url);
  },

  // Install from market
  installFromMarket: (marketId: string, packageName: string, displayName?: string, repository?: string) =>
    fetchApi<{ code: number; msg: string; content?: string; id?: string }>(`/mcp/market/${marketId}/install`, { method: 'POST', body: JSON.stringify({ packageName, displayName, repository }) }),
};

// ============================================================
// Standalone Skill API (/api/skill routes)
// ============================================================

export const skillApi = {
  list: (search?: string) =>
    fetchApi<{ skills: Record<string, unknown>[]; count: number }>(`/skill${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  get: (id: string) => fetchApi<Record<string, unknown>>(`/skill/${id}`),
  create: (data: Record<string, unknown>) => fetchApi<Record<string, unknown>>('/skill/create', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) => fetchApi<Record<string, unknown>>(`/skill/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi<{ success: boolean }>(`/skill/${id}`, { method: 'DELETE' }),
  toggle: (id: string) => fetchApi<Record<string, unknown>>(`/skill/${id}/toggle`, { method: 'POST' }),
  install: (id: string) => fetchApi<Record<string, unknown>>(`/skill/${id}/install`, { method: 'POST' }),
  uninstall: (id: string) => fetchApi<Record<string, unknown>>(`/skill/${id}/uninstall`, { method: 'POST' }),
};