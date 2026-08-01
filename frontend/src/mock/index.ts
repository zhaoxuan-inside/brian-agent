/**
 * Mock 数据层 - 与业务代码完全分离
 * 删除 src/mock/ 目录并移除 main.ts 中的 import 即可剥离
 */

import { mockData } from './data'

/** 匹配 URL 路径和方法，返回 mock 数据 */
function matchRoute(method: string, url: string): { data?: unknown; status?: number; delay?: number } | null {
  // 去掉 /api 前缀
  const path = url.replace(/^\/api/, '').split('?')[0]
  // ---- Chat ----
  if (path === '/chat/list' && method === 'GET') return { data: mockData.chatList }
  if (path.startsWith('/chat/history/') && method === 'GET') return { data: mockData.chatHistory }
  if (path.startsWith('/chat/exchanges/') && method === 'GET') return { data: mockData.exchanges }
  if (path.startsWith('/chat/dag/') && method === 'GET') return { data: mockData.dag }
  if (path.startsWith('/chat/message/') && method === 'GET') return { data: mockData.messageDetail }
  if (path.startsWith('/chat/agent-chain/') && method === 'GET') return { data: { agentChain: mockData.agentChain } }
  if (path === '/chat/search' && method === 'GET') return { data: { messages: mockData.searchResults } }
  if (path === '/chat/send' && method === 'POST') return { data: mockData.sendResponse }
  if (path === '/chat/stream' && method === 'POST') return { data: mockData.streamResponse, delay: 100 }

  // ---- Memory ----
  if (path === '/memory' && method === 'GET') return { data: { memories: mockData.memories } }
  if (path === '/memory/tags' && method === 'GET') return { data: { tags: mockData.memoryTags } }
  if (path === '/memory/groups' && method === 'GET') return { data: { groups: mockData.memoryGroups } }
  if (path === '/memory/tag-graph' && method === 'GET') return { data: mockData.tagGraph }
  if (path.startsWith('/memory/working/')) return { data: mockData.memories.slice(0, 5) }
  if (path.startsWith('/memory/semantic/')) return { data: mockData.memories.slice(0, 8) }
  if (path.startsWith('/memory/episodic/')) return { data: mockData.memories.slice(0, 10) }
  if (path.startsWith('/memory/procedural/')) return { data: mockData.memories.slice(0, 3) }
  if (path.startsWith('/memory/ratio/')) return { data: mockData.memoryRatios }
  if (path.startsWith('/memory/stats/')) return { data: mockData.memoryStats }
  if (path.startsWith('/memory/search/')) return { data: mockData.memories }
  if (path.match(/^\/memory\/[^/]+$/) && method === 'GET') return { data: mockData.memories }

  // ---- Config ----
  if (path === '/config' && method === 'GET') return { data: mockData.config }
  if (path === '/config/defaults' && method === 'GET') return { data: mockData.configDefaults }
  if (path === '/config/llm' && method === 'GET') return { data: mockData.llmConfigs }
  if (path === '/config/model' && method === 'GET') return { data: mockData.modelConfigs }
  if (path === '/config/soul' && method === 'GET') return { data: mockData.soulConfigs }
  if (path === '/config/work' && method === 'GET') return { data: mockData.workConfigs }
  if (path === '/config/mcp' && method === 'GET') return { data: mockData.mcpConfigs }
  if (path === '/config/provider' && method === 'POST') return { data: { success: true } }

  // ---- Agent ----
  if (path === '/agent' && method === 'GET') return { data: { agents: mockData.agents, count: mockData.agents.length } }
  if (path === '/agent/models' && method === 'GET') return { data: mockData.agentModels }

  // ---- Skill ----
  if (path === '/skill' && method === 'GET') return { data: { skills: mockData.skills, count: mockData.skills.length } }

  // ---- MCP ----
  if (path === '/mcp/installed' && method === 'GET') return { data: { installed: mockData.mcpInstalled, total: mockData.mcpInstalled.length, page: 1, pageSize: 20 } }
  if (path === '/mcp/hot' && method === 'GET') return { data: { code: 0, msg: 'ok', data: mockData.mcpHot } }

  // ---- Learning ----
  if (path === '/learning/queue' && method === 'GET') return { data: mockData.learningQueue }
  if (path === '/learning/queue/stats' && method === 'GET') return { data: mockData.learningQueueStats }
  if (path === '/learning/progress' && method === 'GET') return { data: mockData.learningProgress }
  if (path === '/learning/knowledge' && method === 'GET') return { data: mockData.learningKnowledge }
  if (path === '/learning/insights' && method === 'GET') return { data: mockData.learningInsights }
  if (path.startsWith('/learning/documents/') && method === 'GET') return { data: mockData.documents }

  // ---- Profile ----
  if (path.match(/^\/profile\/[^/]+$/) && method === 'GET') return { data: mockData.profile }
  if (path.match(/^\/profile\/[^/]+\/interests$/) && method === 'GET') return { data: mockData.profileInterests }

  // ---- Analytics ----
  if (path === '/analytics/token-usage' && method === 'GET') return { data: mockData.tokenUsage }
  if (path === '/analytics/summary' && method === 'GET') return { data: mockData.analyticsSummary }
  if (path === '/analytics/ring' && method === 'GET') return { data: mockData.analyticsRing }
  if (path === '/analytics/per-model' && method === 'GET') return { data: mockData.perModelUsage }
  if (path === '/analytics/contribution' && method === 'GET') return { data: mockData.contribution }
  if (path === '/analytics/vector-db' && method === 'GET') return { data: mockData.vectorDbStats }
  if (path === '/analytics/message-stats' && method === 'GET') return { data: mockData.messageStats }

  // ---- System ----
  if (path === '/system' && method === 'GET') return { data: mockData.systemStats }
  if (path === '/gateway/health' && method === 'GET') return { data: { status: 'ok', timestamp: Date.now() } }
  if (path === '/feedback/stats' && method === 'GET') return { data: mockData.feedbackStats }
  if (path === '/library/paths' && method === 'GET') return { data: { paths: mockData.libraryPaths, count: mockData.libraryPaths.length } }

  // ---- Visual ----
  if (path.startsWith('/visual/memory-graph/')) return { data: mockData.memoryGraph }
  if (path.startsWith('/visual/chat-flow/')) return { data: mockData.chatFlow }
  if (path === '/visual/agent-status') return { data: mockData.agentStatus }

  return null
}

/** 安装 mock 拦截器 */
export function setupMock(): void {
  const originalFetch = window.fetch

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method || 'GET').toUpperCase()

    const matched = matchRoute(method, url)

    if (matched) {
      console.log(`[Mock] ${method} ${url}`)
      if (matched.delay) await new Promise(r => setTimeout(r, matched.delay))
      return new Response(JSON.stringify(matched.data), {
        status: matched.status || 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 未匹配的请求走原始 fetch
    console.warn(`[Mock] Unmatched: ${method} ${url} -> falling through to real fetch`)
    return originalFetch(input, init)
  }

  console.log('[Mock] Mock interceptor installed. To disable: set VITE_USE_MOCK=false in .env.local')
}
