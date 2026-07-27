/**
 * Mock 数据 - 所有页面的模拟数据
 * 与业务代码分离，删除 src/mock/ 目录即可完全移除
 */

const now = Date.now()
const dayAgo = (n: number) => now - n * 86400000
const hourAgo = (n: number) => now - n * 3600000

// ============================================================
// Chat
// ============================================================

export const chatList = [
  { sessionId: 'session-1', lastMessage: '帮我分析一下Vue3的响应式原理', lastTime: hourAgo(2) },
  { sessionId: 'session-2', lastMessage: '如何使用TypeScript泛型？', lastTime: hourAgo(5) },
  { sessionId: 'session-3', lastMessage: '推荐一些前端性能优化的方法', lastTime: dayAgo(1) },
  { sessionId: 'session-4', lastMessage: '对比一下React和Vue的区别', lastTime: dayAgo(2) },
  { sessionId: 'session-5', lastMessage: '什么是微前端架构？', lastTime: dayAgo(3) },
]

export const chatHistory = {
  messages: [
    { id: 'msg-1', sessionId: 'session-1', exchangeId: 'ex-1', msgId: 'msg-001', role: 'user', content: '帮我分析一下Vue3的响应式原理', summary: '分析Vue3响应式原理', referenceCount: 0, createdAt: hourAgo(2) },
    { id: 'msg-2', sessionId: 'session-1', exchangeId: 'ex-1', msgId: 'msg-002', role: 'assistant', content: 'Vue3的响应式系统基于Proxy实现...', summary: 'Vue3响应式基于Proxy', referenceCount: 0, createdAt: hourAgo(2) },
    { id: 'msg-3', sessionId: 'session-1', exchangeId: 'ex-2', msgId: 'msg-003', role: 'user', content: '和Vue2有什么区别？', summary: '对比Vue2区别', referenceCount: 1, createdAt: hourAgo(1) },
    { id: 'msg-4', sessionId: 'session-1', exchangeId: 'ex-2', msgId: 'msg-004', role: 'assistant', content: 'Vue2使用Object.defineProperty，Vue3使用Proxy...', summary: 'Vue2用defineProperty，Vue3用Proxy', referenceCount: 1, createdAt: hourAgo(1) },
  ],
  pagination: { page: 1, pageSize: 100, total: 4, totalPages: 1 },
}

export const exchanges = {
  exchanges: [
    {
      exchangeId: 'ex-1',
      userMessage: { msgId: 'msg-001', content: '帮我分析一下Vue3的响应式原理', summary: '分析Vue3响应式原理', referenceCount: 0, createdAt: hourAgo(2) },
      assistantMessage: { msgId: 'msg-002', content: 'Vue3的响应式系统基于Proxy实现，相比Vue2的Object.defineProperty有以下优势...', summary: 'Vue3响应式基于Proxy', referenceCount: 0, createdAt: hourAgo(2) },
      messageCount: 2, firstMessageAt: hourAgo(2), lastMessageAt: hourAgo(2), referencedExchangeIds: [],
    },
    {
      exchangeId: 'ex-2',
      userMessage: { msgId: 'msg-003', content: '和Vue2有什么区别？', summary: '对比Vue2区别', referenceCount: 1, createdAt: hourAgo(1) },
      assistantMessage: { msgId: 'msg-004', content: 'Vue2使用Object.defineProperty，Vue3使用Proxy。主要区别包括...', summary: 'Vue2用defineProperty，Vue3用Proxy', referenceCount: 1, createdAt: hourAgo(1) },
      messageCount: 2, firstMessageAt: hourAgo(1), lastMessageAt: hourAgo(1), referencedExchangeIds: ['ex-1'],
    },
  ],
}

export const dag = {
  nodes: [
    { msgId: 'msg-001', exchangeId: 'ex-1', role: 'user', summary: '分析Vue3响应式原理', createdAt: hourAgo(2), messageIndex: 0, referencesOut: 0, referencesIn: 1, isBranch: false },
    { msgId: 'msg-002', exchangeId: 'ex-1', role: 'assistant', summary: 'Vue3响应式基于Proxy', createdAt: hourAgo(2), messageIndex: 1, referencesOut: 0, referencesIn: 1, isBranch: false },
    { msgId: 'msg-003', exchangeId: 'ex-2', role: 'user', summary: '对比Vue2区别', createdAt: hourAgo(1), messageIndex: 2, referencesOut: 1, referencesIn: 0, isBranch: false },
    { msgId: 'msg-004', exchangeId: 'ex-2', role: 'assistant', summary: 'Vue2用defineProperty，Vue3用Proxy', createdAt: hourAgo(1), messageIndex: 3, referencesOut: 1, referencesIn: 0, isBranch: false },
  ],
  edges: [
    { from: 'msg-001', to: 'msg-002', type: 'sequence' },
    { from: 'msg-002', to: 'msg-003', type: 'sequence' },
    { from: 'msg-003', to: 'msg-004', type: 'sequence' },
    { from: 'msg-003', to: 'msg-001', type: 'reference' },
    { from: 'msg-004', to: 'msg-002', type: 'reference' },
  ],
}

export const messageDetail = {
  msgId: 'msg-002', exchangeId: 'ex-1', sessionId: 'session-1', role: 'assistant',
  content: 'Vue3的响应式系统基于Proxy实现...',
  summary: 'Vue3响应式基于Proxy', createdAt: hourAgo(2),
  referencesOut: [], referencesIn: [{ msgId: 'msg-003', role: 'user', summary: '对比Vue2区别', createdAt: hourAgo(1) }],
}

export const agentChain = [
  { id: 'planner', name: 'Planner Agent', type: 'planner', role: 'coordinator', description: '分析用户意图，制定执行计划', status: 'completed', startTime: hourAgo(2), endTime: hourAgo(2), children: [], output: [{ type: 'system', content: '任务分析完成', timestamp: hourAgo(2) }] },
  { id: 'writer', name: 'Writer Agent', type: 'writer', role: 'executor', description: '生成回答内容', status: 'completed', startTime: hourAgo(2), endTime: hourAgo(2), children: [], output: [{ type: 'stdout', content: '正在生成回答...', timestamp: hourAgo(2) }] },
]

export const searchResults = [
  { id: 'msg-1', msgId: 'msg-001', sessionId: 'session-1', exchangeId: 'ex-1', role: 'user', content: '帮我分析一下Vue3的响应式原理', summary: '分析Vue3响应式原理', createdAt: hourAgo(2) },
]

export const sendResponse = {
  id: 'msg-new', sessionId: 'session-1', exchangeId: 'ex-new', msgId: 'msg-new', userId: 'user-1',
  content: '收到消息', role: 'user', timestamp: now,
}

export const streamResponse = { ok: true }

// ============================================================
// Memory
// ============================================================

export const memories = [
  { id: 'mem-1', userId: 'user-1', content: '用户对Vue3响应式原理感兴趣', summary: 'Vue3响应式兴趣', type: 'semantic', source: 'chat', tags: ['Vue3', '响应式', '前端'], role: 'assistant', strength: 0.9, confidence: 0.95, importance: 0.8, createdAt: hourAgo(2), updatedAt: hourAgo(2), accessedAt: hourAgo(1), accessCount: 3 },
  { id: 'mem-2', userId: 'user-1', content: '用户询问了TypeScript泛型的用法', summary: 'TypeScript泛型', type: 'semantic', source: 'chat', tags: ['TypeScript', '泛型', '前端'], role: 'assistant', strength: 0.7, confidence: 0.85, importance: 0.6, createdAt: hourAgo(5), updatedAt: hourAgo(5), accessedAt: hourAgo(3), accessCount: 2 },
  { id: 'mem-3', userId: 'user-1', content: '讨论了前端性能优化的多种方法', summary: '前端性能优化', type: 'episodic', source: 'chat', tags: ['性能优化', '前端'], role: 'assistant', strength: 0.85, confidence: 0.9, importance: 0.75, createdAt: dayAgo(1), updatedAt: dayAgo(1), accessedAt: dayAgo(1), accessCount: 1 },
  { id: 'mem-4', userId: 'user-1', content: '用户偏好使用Pinia进行状态管理', summary: 'Pinia状态管理偏好', type: 'procedural', source: 'chat', tags: ['Pinia', '状态管理', 'Vue3'], role: 'assistant', strength: 0.8, confidence: 0.88, importance: 0.7, createdAt: dayAgo(2), updatedAt: dayAgo(2), accessedAt: dayAgo(1), accessCount: 4 },
  { id: 'mem-5', userId: 'user-1', content: '对比了React和Vue的响应式系统', summary: 'React vs Vue响应式', type: 'episodic', source: 'chat', tags: ['React', 'Vue', '响应式', '前端'], role: 'assistant', strength: 0.75, confidence: 0.82, importance: 0.65, createdAt: dayAgo(2), updatedAt: dayAgo(2), accessedAt: dayAgo(2), accessCount: 2 },
  { id: 'mem-6', userId: 'user-1', content: '用户询问了微前端架构的概念', summary: '微前端架构', type: 'semantic', source: 'chat', tags: ['微前端', '架构', '前端'], role: 'assistant', strength: 0.6, confidence: 0.78, importance: 0.55, createdAt: dayAgo(3), updatedAt: dayAgo(3), accessedAt: dayAgo(3), accessCount: 1 },
]

export const memoryTags = ['Vue3', 'TypeScript', '前端', '响应式', '泛型', '性能优化', 'Pinia', '状态管理', 'React', '微前端', '架构']

export const memoryGroups = {
  '前端框架': memories.filter(m => m.tags.some(t => ['Vue3', 'React'].includes(t))),
  '编程语言': memories.filter(m => m.tags.some(t => ['TypeScript'].includes(t))),
  '架构设计': memories.filter(m => m.tags.some(t => ['微前端', '架构'].includes(t))),
}

export const tagGraph = {
  nodes: [
    { id: 'Vue3', name: 'Vue3', weight: 5, degree: 4 },
    { id: 'TypeScript', name: 'TypeScript', weight: 3, degree: 3 },
    { id: '前端', name: '前端', weight: 8, degree: 6 },
    { id: '响应式', name: '响应式', weight: 3, degree: 3 },
    { id: 'React', name: 'React', weight: 2, degree: 2 },
    { id: 'Pinia', name: 'Pinia', weight: 2, degree: 2 },
    { id: '性能优化', name: '性能优化', weight: 2, degree: 2 },
    { id: '微前端', name: '微前端', weight: 1, degree: 1 },
    { id: '泛型', name: '泛型', weight: 1, degree: 1 },
    { id: '架构', name: '架构', weight: 2, degree: 2 },
  ],
  edges: [
    { source: 'Vue3', target: '前端', weight: 3 },
    { source: 'Vue3', target: '响应式', weight: 2 },
    { source: 'Vue3', target: 'Pinia', weight: 1 },
    { source: 'TypeScript', target: '前端', weight: 2 },
    { source: 'TypeScript', target: '泛型', weight: 1 },
    { source: 'React', target: '前端', weight: 2 },
    { source: 'React', target: '响应式', weight: 1 },
    { source: 'Pinia', target: '状态管理', weight: 1 },
    { source: '性能优化', target: '前端', weight: 1 },
    { source: '微前端', target: '架构', weight: 1 },
    { source: '微前端', target: '前端', weight: 1 },
  ],
}

export const memoryRatios = { semantic: 0.4, episodic: 0.3, procedural: 0.2, working: 0.1 }

export const memoryStats = {
  total: memories.length,
  byType: { semantic: 3, episodic: 2, procedural: 1, working: 0 },
  topTags: memoryTags.slice(0, 5).map((t, i) => ({ tag: t, count: 5 - i })),
  avgStrength: 0.77,
  avgConfidence: 0.86,
}

// ============================================================
// Config
// ============================================================

export const config = {
  llm: { provider: 'openai', model: 'gpt-4', temperature: 0.7, maxTokens: 4096 },
  agent: { maxConcurrency: 3, timeout: 30000 },
  memory: { workingMemoryLimit: 50, semanticMemoryLimit: 1000 },
}

export const configDefaults = {
  llm: { temperature: 0.7, maxTokens: 4096 },
  agent: { maxConcurrency: 3, timeout: 30000 },
  memory: { workingMemoryLimit: 50, semanticMemoryLimit: 1000 },
}

export const llmConfigs = [
  { id: 'llm-1', name: 'OpenAI GPT-4', enabled: true, provider: 'openai', model: 'gpt-4' },
  { id: 'llm-2', name: 'Claude 3.5 Sonnet', enabled: true, provider: 'anthropic', model: 'claude-3-5-sonnet' },
  { id: 'llm-3', name: 'DeepSeek Chat', enabled: false, provider: 'deepseek', model: 'deepseek-chat' },
]

export const modelConfigs = [
  { id: 'model-1', userId: 'user-1', providerId: 'openai', providerName: 'OpenAI', modelId: 'gpt-4', modelName: 'GPT-4', maxTokens: 8192, supportsVision: false, supportsTools: true, quotaTokensPerDay: 1000000, quotaTokensPerWeek: 5000000, quotaTokensPerMonth: 20000000, quotaCallsPerDay: 1000, quotaCallsPerWeek: 5000, quotaCallsPerMonth: 20000, isDefault: true, status: 'active', createdAt: '2024-01-01', updatedAt: '2024-06-01' },
  { id: 'model-2', userId: 'user-1', providerId: 'anthropic', providerName: 'Anthropic', modelId: 'claude-3-5-sonnet', modelName: 'Claude 3.5 Sonnet', maxTokens: 8192, supportsVision: true, supportsTools: true, quotaTokensPerDay: 500000, quotaTokensPerWeek: 2500000, quotaTokensPerMonth: 10000000, quotaCallsPerDay: 500, quotaCallsPerWeek: 2500, quotaCallsPerMonth: 10000, isDefault: false, status: 'active', createdAt: '2024-02-01', updatedAt: '2024-06-01' },
  { id: 'model-3', userId: 'user-1', providerId: 'deepseek', providerName: 'DeepSeek', modelId: 'deepseek-chat', modelName: 'DeepSeek Chat', maxTokens: 4096, supportsVision: false, supportsTools: false, quotaTokensPerDay: 200000, quotaTokensPerWeek: 1000000, quotaTokensPerMonth: 4000000, quotaCallsPerDay: 200, quotaCallsPerWeek: 1000, quotaCallsPerMonth: 4000, isDefault: false, status: 'inactive', createdAt: '2024-03-01', updatedAt: '2024-06-01' },
]

export const soulConfigs = [
  { id: 'soul-1', name: '技术助手', enabled: true, description: '专注技术问答的AI助手', prompt: '你是一个专业的技术助手...', traits: ['专业', '耐心', '严谨'] },
  { id: 'soul-2', name: '创意伙伴', enabled: true, description: '激发创意思维的伙伴', prompt: '你是一个富有创意的伙伴...', traits: ['创意', '活跃', '开放'] },
  { id: 'soul-3', name: '学习导师', enabled: false, description: '引导学习的导师', prompt: '你是一个循循善诱的学习导师...', traits: ['耐心', '引导', '鼓励'] },
]

export const workConfigs = [
  { id: 'work-1', name: '代码审查', enabled: true, description: '审查代码质量和规范', steps: ['读取代码', '检查规范', '提出建议'] },
  { id: 'work-2', name: '文档生成', enabled: true, description: '自动生成技术文档', steps: ['分析代码', '提取接口', '生成文档'] },
  { id: 'work-3', name: '测试用例', enabled: false, description: '生成单元测试', steps: ['分析函数', '设计用例', '生成代码'] },
]

export const mcpConfigs = [
  { id: 'mcp-1', name: 'filesystem', enabled: true, version: '1.0.0', url: 'npx:@modelcontextprotocol/server-filesystem' },
  { id: 'mcp-2', name: 'git', enabled: true, version: '1.2.0', url: 'npx:@modelcontextprotocol/server-git' },
  { id: 'mcp-3', name: 'sqlite', enabled: false, version: '0.9.0', url: 'npx:@modelcontextprotocol/server-sqlite' },
]

// ============================================================
// Agent
// ============================================================

export const agents = [
  { id: 'agent-1', name: 'Planner Agent', type: 'planner', description: '分析用户意图，制定执行计划', enabled: true, soul: 'soul-1', model: 'gpt-4', works: ['work-1'], skills: ['skill-1'], mcps: ['mcp-1'] },
  { id: 'agent-2', name: 'Writer Agent', type: 'writer', description: '生成回答内容', enabled: true, soul: 'soul-2', model: 'claude-3-5-sonnet', works: ['work-2'], skills: ['skill-2'], mcps: [] },
  { id: 'agent-3', name: 'Search Agent', type: 'searcher', description: '搜索和检索信息', enabled: true, soul: 'soul-1', model: 'deepseek-chat', works: [], skills: ['skill-3'], mcps: ['mcp-2'] },
  { id: 'agent-4', name: 'Code Agent', type: 'coder', description: '编写和审查代码', enabled: false, soul: 'soul-1', model: 'gpt-4', works: ['work-1', 'work-3'], skills: ['skill-1', 'skill-4'], mcps: ['mcp-1', 'mcp-3'] },
]

export const agentModels = [
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' },
]

// ============================================================
// Skill
// ============================================================

export const skills = [
  { id: 'skill-1', name: '代码分析', description: '分析代码结构和质量', enabled: true, category: '编程' },
  { id: 'skill-2', name: '文档撰写', description: '撰写技术文档和博客', enabled: true, category: '写作' },
  { id: 'skill-3', name: '网络搜索', description: '搜索互联网获取信息', enabled: true, category: '工具' },
  { id: 'skill-4', name: '测试生成', description: '自动生成单元测试', enabled: false, category: '编程' },
]

// ============================================================
// MCP
// ============================================================

export const mcpInstalled = [
  { id: 'mcp-1', name: 'filesystem', displayName: 'File System', version: '1.0.0', enabled: true, description: '文件系统访问' },
  { id: 'mcp-2', name: 'git', displayName: 'Git', version: '1.2.0', enabled: true, description: 'Git仓库操作' },
  { id: 'mcp-3', name: 'sqlite', displayName: 'SQLite', version: '0.9.0', enabled: false, description: 'SQLite数据库操作' },
]

export const mcpHot = [
  { id: 'hot-1', marketId: 'official', packageName: '@modelcontextprotocol/server-filesystem', displayName: 'File System', description: '文件系统访问MCP服务器', author: 'Anthropic', version: '1.0.0', repository: 'github.com/modelcontextprotocol/servers', category: '文件', tags: ['文件', '系统'], tools: [{ name: 'read_file', description: '读取文件' }, { name: 'write_file', description: '写入文件' }] },
  { id: 'hot-2', marketId: 'official', packageName: '@modelcontextprotocol/server-git', displayName: 'Git', description: 'Git仓库操作MCP服务器', author: 'Anthropic', version: '1.2.0', repository: 'github.com/modelcontextprotocol/servers', category: '版本控制', tags: ['Git', '版本控制'], tools: [{ name: 'git_status', description: '查看Git状态' }, { name: 'git_diff', description: '查看差异' }] },
]

// ============================================================
// Learning
// ============================================================

export const learningQueue = [
  { id: 'learn-1', status: 'pending', priority: 1, content: 'Vue3 Composition API的最佳实践', confidence: 0.85 },
  { id: 'learn-2', status: 'pending', priority: 2, content: 'TypeScript高级类型的使用场景', confidence: 0.72 },
  { id: 'learn-3', status: 'learning', priority: 0, content: 'Pinia状态管理模式', confidence: 0.9 },
  { id: 'learn-4', status: 'completed', priority: 0, content: 'Vue3响应式原理', confidence: 0.95 },
]

export const learningQueueStats = { pending: 2, approved: 0, learning: 1, completed: 1, skipped: 0 }

export const learningProgress = {
  phases: [
    { status: 'completed', items: [{ name: '知识提取', progress: 100 }] },
    { status: 'in_progress', items: [{ name: '知识整合', progress: 60 }] },
    { status: 'pending', items: [{ name: '知识应用', progress: 0 }] },
  ],
}

export const learningKnowledge = [
  { id: 'know-1', content: 'Vue3的Proxy响应式相比Vue2的defineProperty支持数组索引和新增属性监听', topic: 'Vue3', source: 'chat', tags: ['Vue3', '响应式'] },
  { id: 'know-2', content: 'Pinia是Vue3推荐的状态管理库，相比Vuex更简洁', topic: 'Pinia', source: 'chat', tags: ['Pinia', '状态管理'] },
  { id: 'know-3', content: 'TypeScript泛型可以在函数、接口和类中使用，提高代码复用性', topic: 'TypeScript', source: 'document', tags: ['TypeScript', '泛型'] },
]

export const learningInsights = [
  { timestamp: hourAgo(1), insight: '用户对前端框架的响应式系统有持续兴趣，建议深入讲解' },
  { timestamp: dayAgo(1), insight: '用户偏好使用TypeScript进行开发，可以推荐更多类型相关的最佳实践' },
  { timestamp: dayAgo(2), insight: '用户关注性能优化，可以引入Web Vitals相关的知识' },
]

export const documents = [
  { id: 'doc-1', userId: 'user-1', name: 'Vue3最佳实践.md', content: '# Vue3最佳实践\n\n## Composition API\n...', type: 'markdown', tags: ['Vue3', '前端'], createdAt: dayAgo(5) },
  { id: 'doc-2', userId: 'user-1', name: 'TypeScript泛型指南.txt', content: 'TypeScript泛型是一种创建可复用组件的方式...', type: 'text', tags: ['TypeScript'], createdAt: dayAgo(10) },
]

// ============================================================
// Profile
// ============================================================

export const profile = {
  userId: 'user-1', name: 'User', avatar: '', preferences: { theme: 'light', language: 'zh-CN' },
  tags: ['前端开发', 'Vue3', 'TypeScript', '全栈'], updatedAt: hourAgo(1), confidence: 0.88,
}

export const profileInterests = [
  { topic: 'Vue3', score: 0.95 },
  { topic: 'TypeScript', score: 0.88 },
  { topic: '前端性能', score: 0.75 },
  { topic: '架构设计', score: 0.68 },
  { topic: 'React', score: 0.55 },
]

// ============================================================
// Analytics
// ============================================================

export const tokenUsage = {
  total: 1250000,
  today: 35000,
  week: 210000,
  month: 850000,
  byModel: { 'gpt-4': 600000, 'claude-3-5-sonnet': 450000, 'deepseek-chat': 200000 },
  trend: Array.from({ length: 7 }, (_, i) => ({ date: dayAgo(6 - i), tokens: Math.floor(20000 + Math.random() * 30000) })),
}

export const analyticsSummary = {
  totalMessages: 342,
  totalSessions: 28,
  avgResponseTime: 1250,
  satisfactionRate: 0.87,
  activeDays: 15,
}

export const analyticsRing = {
  memory: { used: 750, total: 1000, unit: 'MB' },
  storage: { used: 2.3, total: 10, unit: 'GB' },
  tokens: { used: 1.25, total: 5, unit: 'M' },
}

export const perModelUsage = [
  { model: 'GPT-4', tokens: 600000, calls: 320, cost: 12.5 },
  { model: 'Claude 3.5', tokens: 450000, calls: 210, cost: 9.0 },
  { model: 'DeepSeek', tokens: 200000, calls: 180, cost: 1.2 },
]

export const contribution = {
  year: 2026,
  data: Array.from({ length: 365 }, (_, i) => ({ date: i, count: Math.floor(Math.random() * 20) })),
}

export const vectorDbStats = {
  totalVectors: 15420,
  totalDocuments: 342,
  indexSize: '45.2 MB',
  avgQueryTime: 12,
}

export const messageStats = {
  total: 342,
  byRole: { user: 171, assistant: 171 },
  avgPerSession: 12.2,
  avgLength: 256,
}

// ============================================================
// System
// ============================================================

export const systemStats = {
  uptime: 86400 * 7,
  cpu: { usage: 23.5, cores: 8 },
  memory: { used: 4.2, total: 16, unit: 'GB' },
  disk: { used: 28.5, total: 100, unit: 'GB' },
  components: {
    api: { status: 'healthy', latency: 12 },
    database: { status: 'healthy', latency: 3 },
    llm: { status: 'healthy', latency: 850 },
    memory_system: { status: 'healthy', latency: 8 },
    learning: { status: 'idle', latency: 0 },
    gateway: { status: 'healthy', latency: 5 },
  },
  tokenStats: {
    total: 1250000,
    today: 35000,
    byModel: { 'gpt-4': 600000, 'claude-3-5-sonnet': 450000, 'deepseek-chat': 200000 },
  },
  ring: {
    memory: { used: 750, total: 1000, unit: 'MB' },
    storage: { used: 28.5, total: 100, unit: 'GB' },
    tokens: { used: 1.25, total: 5, unit: 'M' },
  },
  tokenTrend: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, tokens: Math.floor(50000 + Math.random() * 150000) })),
  perModel: [
    { model: 'GPT-4', tokens: 600000, calls: 320 },
    { model: 'Claude 3.5', tokens: 450000, calls: 210 },
    { model: 'DeepSeek', tokens: 200000, calls: 180 },
  ],
}

export const feedbackStats = { total: 89, positive: 72, negative: 12, neutral: 5 }

export const libraryPaths = [
  { id: 'path-1', name: '项目文档', path: '/home/user/docs', category: 'document', description: '项目相关文档' },
  { id: 'path-2', name: '代码仓库', path: '/home/user/repos', category: 'code', description: '代码仓库目录' },
]

// ============================================================
// Visual
// ============================================================

export const memoryGraph = {
  nodes: [
    { id: 'Vue3', label: 'Vue3', type: 'tag' },
    { id: 'TypeScript', label: 'TypeScript', type: 'tag' },
    { id: '前端', label: '前端', type: 'tag' },
    { id: 'React', label: 'React', type: 'tag' },
    { id: 'mem-1', label: 'Vue3响应式兴趣', type: 'memory' },
    { id: 'mem-2', label: 'TS泛型', type: 'memory' },
  ],
  edges: [
    { source: 'mem-1', target: 'Vue3' },
    { source: 'mem-1', target: '前端' },
    { source: 'mem-2', target: 'TypeScript' },
    { source: 'mem-2', target: '前端' },
    { source: 'Vue3', target: '前端' },
    { source: 'React', target: '前端' },
  ],
}

export const chatFlow = {
  nodes: [
    { id: 'msg-001', label: '用户问题', type: 'user' },
    { id: 'msg-002', label: 'AI回答', type: 'assistant' },
    { id: 'msg-003', label: '追问', type: 'user' },
    { id: 'msg-004', label: 'AI回答', type: 'assistant' },
  ],
  edges: [
    { source: 'msg-001', target: 'msg-002' },
    { source: 'msg-002', target: 'msg-003' },
    { source: 'msg-003', target: 'msg-004' },
  ],
}

export const agentStatus = {
  planner: { status: 'idle', lastActive: hourAgo(1) },
  writer: { status: 'idle', lastActive: hourAgo(2) },
  searcher: { status: 'idle', lastActive: dayAgo(1) },
}

// ============================================================
// 聚合导出 - 供 mock/index.ts 统一引用
// ============================================================
export const mockData = {
  chatList, chatHistory, exchanges, dag, messageDetail, agentChain,
  searchResults, sendResponse, streamResponse,
  memories, memoryTags, memoryGroups, tagGraph, memoryRatios, memoryStats,
  config, configDefaults, llmConfigs, modelConfigs, soulConfigs, workConfigs, mcpConfigs,
  agents, agentModels, skills, mcpInstalled, mcpHot,
  learningQueue, learningQueueStats, learningProgress, learningKnowledge, learningInsights, documents,
  profile, profileInterests,
  tokenUsage, analyticsSummary, analyticsRing, perModelUsage, contribution, vectorDbStats, messageStats,
  systemStats, feedbackStats, libraryPaths,
  memoryGraph, chatFlow, agentStatus,
}
