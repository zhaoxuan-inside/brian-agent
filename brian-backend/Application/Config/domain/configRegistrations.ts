/**
 * @fileoverview 全系统配置注册表定义。
 *
 * 集中管理所有层（BASE / CORE / AGENT / ORCHESTRATION / APPLICATION）
 * 各个模块的配置项元数据。ConfigService 在初始化时通过 registerConfig()
 * 将这些配置项批量注册到 config_registry 表。
 */
import type { ConfigRegistration } from './types';

function base(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration {
  return { layer: 'BASE', module: mod, category: cat, config_key: `${mod}.${key}`, config_name: name, config_type: type, config_default: def, config_description: desc, config_enum_values: enumVals };
}

function core(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration {
  return { layer: 'CORE', module: mod, category: cat, config_key: `${mod}.${key}`, config_name: name, config_type: type, config_default: def, config_description: desc, config_enum_values: enumVals };
}

function orch(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration {
  return { layer: 'ORCHESTRATION', module: mod, category: cat, config_key: `orchestration.${mod}.${key}`, config_name: name, config_type: type, config_default: def, config_description: desc, config_enum_values: enumVals };
}

function app(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration {
  return { layer: 'APPLICATION', module: mod, category: cat, config_key: `${mod}.${key}`, config_name: name, config_type: type, config_default: def, config_description: desc, config_enum_values: enumVals };
}

function agent(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration {
  return { layer: 'AGENT', module: mod, category: cat, config_key: `${mod}.${key}`, config_name: name, config_type: type, config_default: def, config_description: desc, config_enum_values: enumVals };
}

// ===========================================================================
// 层级 / 模块 / 分类 的显示元数据
// ===========================================================================

export const LAYER_LABELS: Record<string, { label: string; desc: string }> = {
  BASE: { label: '基础设施层', desc: '提供底层资源与基础配置：模型、MCP、存储、Soul、Skill 等' },
  CORE: { label: '核心层', desc: '核心服务编排：LLM、信息、学习、MCP、技能、灵魂等核心模块' },
  AGENT: { label: 'Agent层', desc: 'Agent 框架：构建、库、生命周期与各类 Agent' },
  ORCHESTRATION: { label: '编排层', desc: '任务与流程编排' },
  APPLICATION: { label: '应用层', desc: '面向用户的应用入口：对话、文档、网关、画像等' },
};

export const MODULE_LABELS: Record<string, { label: string; desc: string }> = {
  llm_provider: { label: 'LLM Provider', desc: 'LLM 提供商管理与模型配置' },
  soul_provider: { label: 'Soul Provider', desc: '灵魂角色管理' },
  skill_provider: { label: 'Skill Provider', desc: '技能管理' },
  mcp_provider: { label: 'MCP Provider', desc: 'MCP 服务提供商管理' },
  prompts_provider: { label: 'Prompts Provider', desc: '提示词模板配置' },
  log_provider: { label: 'Log Provider', desc: '日志组件配置' },
  mq_provider: { label: 'MQ Provider', desc: '消息队列配置' },
  graphdb_provider: { label: 'GraphDB Provider', desc: '图数据库后端配置' },
  vectordb_provider: { label: 'VectorDB Provider', desc: '向量数据库配置' },
  relationdb_provider: { label: 'RelationDB Provider', desc: '关系型数据库配置' },
  llm_core: { label: 'LLM Core', desc: 'LLM 调用核心' },
  info_core: { label: 'Info Core', desc: '信息/记忆核心' },
  mcp_core: { label: 'MCP Core', desc: 'MCP 调用核心' },
  skill_core: { label: 'Skill Core', desc: '技能调用核心' },
  soul_core: { label: 'Soul Core', desc: '灵魂调用核心' },
  agent_builder: { label: 'AgentBuilder', desc: 'Agent 构建器' },
  agent_library: { label: 'AgentLibrary', desc: 'Agent 库' },
  agent_execution: { label: 'AgentExecution', desc: 'Agent 执行引擎' },
  agent_strategy: { label: 'AgentStrategy', desc: 'Agent 策略管理' },
  agent_context: { label: 'AgentContext', desc: 'Agent 上下文管理' },
  writer_agent: { label: 'WriterAgent', desc: '写作 Agent' },
  evolutor_agent: { label: 'EvolutorAgent', desc: '进化 Agent' },
  entry: { label: 'Entry', desc: '编排入口（复杂度分解、策略选择）' },
  strategy: { label: 'Strategy', desc: '编排策略配置' },
  execution: { label: 'Execution', desc: '编排执行引擎' },
  visualization: { label: 'Visualization', desc: '可视化配置' },
  jsonnode: { label: 'JSON Node', desc: 'JSON 节点执行配置' },
  chat: { label: 'Chat', desc: '对话应用' },
  self_learning: { label: 'SelfLearning', desc: '自学习' },
  user_profile: { label: 'UserProfile', desc: '用户画像' },
  config: { label: 'Config', desc: '配置应用自配置' },
};

export const CATEGORY_LABELS: Record<string, { label: string; desc: string }> = {
  basic: { label: '基础设置', desc: '基础运行配置' },
  quota: { label: '配额设置', desc: '调用配额与限额' },
  aging: { label: '老化策略', desc: '数据老化与清理策略' },
  config: { label: '配置参数', desc: '核心配置参数' },
  tag_config: { label: '标签配置', desc: '标签生成相关配置' },
  summary_config: { label: '摘要配置', desc: '摘要生成相关配置' },
  vector_config: { label: '向量化配置', desc: '向量化相关配置' },
  context_config: { label: '上下文配置', desc: '上下文构建相关配置' },
  opt_rule: { label: '优化规则', desc: '优化规则配置' },
  interval: { label: '调度间隔', desc: '定时调度间隔配置' },
  weight: { label: '权重设置', desc: '权重系数配置' },
};

export const MODULE_ENTITY_TYPES: Record<string, string[]> = {
  llm_provider: ['provider', 'model'],
  soul_provider: ['soul'],
  skill_provider: ['skill'],
  mcp_provider: ['mcp'],
};

export const ALL_CONFIG_REGISTRATIONS: ConfigRegistration[] = [

  // =========================================================================
  // BASE layer
  // =========================================================================

  // --- LLMProvider ---
  base('llm_provider', 'basic', 'enabled', 'LLM 组件启用', 'BOOLEAN', true, 'LLM 组件是否启用'),
  base('llm_provider', 'quota', 'default_quota_tokens_per_day', '默认每日 Token 限额', 'INT', 0, '0 为不限制'),
  base('llm_provider', 'quota', 'default_quota_tokens_per_week', '默认每周 Token 限额', 'INT', 0, '0 为不限制'),
  base('llm_provider', 'quota', 'default_quota_tokens_per_month', '默认每月 Token 限额', 'INT', 0, '0 为不限制'),
  base('llm_provider', 'quota', 'default_quota_calls_per_day', '默认每日调用次数限额', 'INT', 0, '0 为不限制'),
  base('llm_provider', 'quota', 'default_quota_calls_per_week', '默认每周调用次数限额', 'INT', 0, '0 为不限制'),
  base('llm_provider', 'quota', 'default_quota_calls_per_month', '默认每月调用次数限额', 'INT', 0, '0 为不限制'),

  // --- SoulProvider ---
  base('soul_provider', 'basic', 'enabled', 'Soul 组件启用', 'BOOLEAN', true, 'Soul 组件是否启用'),

  // --- SkillProvider ---
  base('skill_provider', 'basic', 'enabled', 'Skill 组件启用', 'BOOLEAN', true, 'Skill 组件是否启用'),

  // --- MCPProvider ---
  base('mcp_provider', 'basic', 'enabled', 'MCP 组件启用', 'BOOLEAN', true, 'MCP 组件是否启用'),
  base('mcp_provider', 'basic', 'cache_ttl', 'MCP 列表缓存 TTL（秒）', 'INT', 86400, '默认 1 天'),

  // --- PromptsProvider ---
  base('prompts_provider', 'basic', 'enabled', 'Prompts 组件启用', 'BOOLEAN', true, 'Prompts 组件是否启用'),

  // --- LogProvider ---
  base('log_provider', 'basic', 'enabled', '日志组件启用', 'BOOLEAN', true, '日志组件是否启用'),
  base('log_provider', 'basic', 'default_level', '默认日志级别', 'ENUM', 'INFO', '默认日志级别', ['DEBUG', 'INFO', 'WARN', 'ERROR']),
  base('log_provider', 'basic', 'file_path', '日志文件根目录', 'STRING', './data/logs', '日志文件存储路径'),
  base('log_provider', 'basic', 'max_file_size', '单文件最大大小（字节）', 'INT', 209715200, '200MB'),
  base('log_provider', 'basic', 'retention_days', '日志保留天数', 'INT', 14, '超过自动清理'),

  // --- MQProvider ---
  base('mq_provider', 'basic', 'enabled', 'MQ 组件启用', 'BOOLEAN', true, 'MQ 组件是否启用'),
  base('mq_provider', 'basic', 'message_ttl', '消息默认保留时间（秒）', 'INT', 86400, '默认 1 天'),
  base('mq_provider', 'basic', 'default_max_retries', '默认最大重试次数', 'INT', 3),
  base('mq_provider', 'basic', 'default_priority', '默认消息优先级（0-10）', 'INT', 5),

  // --- GraphDBProvider ---
  base('graphdb_provider', 'basic', 'enabled', '图数据库启用', 'BOOLEAN', true, '图数据库是否启用'),
  base('graphdb_provider', 'aging', 'retention_days', '激活统计保留天数', 'INT', 30, '老化观察窗口'),
  base('graphdb_provider', 'aging', 'min_activation_count', '窗口内最小激活次数阈值', 'INT', 5),
  base('graphdb_provider', 'basic', 'default_trigger_type', '默认触发类型', 'STRING', 'user_query'),
  base('graphdb_provider', 'basic', 'default_weight', '默认边权重', 'DOUBLE', 1.0),
  base('graphdb_provider', 'basic', 'default_depth', '默认遍历深度', 'INT', 1),
  base('graphdb_provider', 'basic', 'default_only_active', '默认仅遍历激活边', 'BOOLEAN', true),

  // --- VectorDBProvider ---
  base('vectordb_provider', 'basic', 'enabled', '向量数据库启用', 'BOOLEAN', true, '向量数据库是否启用'),
  base('vectordb_provider', 'basic', 'default_top_k', '默认返回结果数量', 'INT', 10, '相似性搜索返回数量'),
  base('vectordb_provider', 'basic', 'default_similarity_threshold', '默认相似度阈值', 'DOUBLE', 0, '归一化阈值 0-100（0=返回全部，100=仅完全匹配），低于此值结果不返回'),
  base('vectordb_provider', 'basic', 'default_distance_metric', '默认距离度量方式', 'ENUM', 'COSINE', '仅写入前可更改（写入数据后锁定）；COSINE 余弦 / L2 欧氏 / IP 内积', ['COSINE', 'L2', 'IP']),

  // --- RelationDBProvider ---
  base('relationdb_provider', 'basic', 'enabled', '关系数据库启用', 'BOOLEAN', true, '关系数据库是否启用'),

  // =========================================================================
  // CORE layer
  // =========================================================================

  // --- LLMCoreProvider ---
  core('llm_core', 'basic', 'regen_rate', 'LLM 重新匹配概率（0-100）', 'INT', 75, '值越大越倾向于重新评估'),
  core('llm_core', 'basic', 'prompt_template_id', 'LLM 匹配排名的 Prompt', 'STRING', '', '用于 LLM 匹配排名'),
  core('llm_core', 'quota', 'quota_tokens_per_day', '每日 Token 限额', 'INT', 0, '0 为不限制'),
  core('llm_core', 'quota', 'quota_tokens_per_week', '每周 Token 限额', 'INT', 0, '0 为不限制'),
  core('llm_core', 'quota', 'quota_tokens_per_month', '每月 Token 限额', 'INT', 0, '0 为不限制'),
  core('llm_core', 'quota', 'quota_calls_per_day', '每日调用次数限额', 'INT', 0, '0 为不限制'),
  core('llm_core', 'quota', 'quota_calls_per_week', '每周调用次数限额', 'INT', 0, '0 为不限制'),
  core('llm_core', 'quota', 'quota_calls_per_month', '每月调用次数限额', 'INT', 0, '0 为不限制'),

  // --- InfoCoreProvider ---
  core('info_core', 'config', 'config.alive_max_days', '信息保留最大天数', 'INT', 30, '超过自动清理'),
  core('info_core', 'tag_config', 'tag_config.llm_id', '标签生成 LLM ID', 'STRING', ''),
  core('info_core', 'tag_config', 'tag_config.prompt_template_id', '标签生成 Prompt 模板 ID', 'STRING', ''),
  core('info_core', 'tag_config', 'tag_config.tag_top_k', '标签 Top-K 数量', 'INT', 5),
  core('info_core', 'tag_config', 'tag_config.enable', '标签生成启用', 'BOOLEAN', false),
  core('info_core', 'summary_config', 'summary_config.llm_id', '摘要生成 LLM ID', 'STRING', ''),
  core('info_core', 'summary_config', 'summary_config.prompt_template_id', '摘要生成 Prompt 模板 ID', 'STRING', ''),
  core('info_core', 'summary_config', 'summary_config.enable', '摘要生成启用', 'BOOLEAN', false),
  core('info_core', 'vector_config', 'vector_config.llm_id', '向量化 LLM ID', 'STRING', ''),
  core('info_core', 'vector_config', 'vector_config.dimension', '向量维度', 'INT', 1024),
  core('info_core', 'vector_config', 'vector_config.enable', '向量化启用', 'BOOLEAN', false),
  core('info_core', 'context_config', 'context_config.base_timeline_count', '时间线基础数量', 'INT', 500, '上下文构建-时间线'),
  core('info_core', 'context_config', 'context_config.base_tag_relative_count', '标签关联基础数量', 'INT', 200, '上下文构建-标签关联'),
  core('info_core', 'context_config', 'context_config.base_similarity_count', '相似度基础数量', 'INT', 150, '上下文构建-相似度'),
  core('info_core', 'context_config', 'context_config.base_keyword_count', '关键词基础数量', 'INT', 100, '上下文构建-关键词'),
  core('info_core', 'context_config', 'context_config.base_random_count', '随机基础数量', 'INT', 50, '上下文构建-随机'),
  core('info_core', 'context_config', 'context_config.total', '上下文总数限制', 'INT', 1000),

  // --- MCPCoreProvider ---
  core('mcp_core', 'basic', 'regen_rate', 'MCP 重新匹配概率（0-100）', 'INT', 75, '值越大越倾向于重新评估'),
  core('mcp_core', 'basic', 'prompt_template_id', 'MCP 匹配排名的 Prompt 模板 ID', 'STRING', '', '用于 MCP 匹配排名'),

  // --- SkillCoreProvider ---
  core('skill_core', 'basic', 'regen_rate', 'Skill 重新生成概率（0-100）', 'INT', 75, '值越大越倾向于重新评估'),
  core('skill_core', 'basic', 'prompt_template_id', 'Skill 匹配排名的 Prompt 模板 ID', 'STRING', '', '用于 Skill 匹配排名'),
  core('skill_core', 'opt_rule', 'opt_rule.days', '优化规则观察天数', 'INT', 30, '技能淘汰/优化规则的观察窗口'),
  core('skill_core', 'opt_rule', 'opt_rule.min_usage_count', '优化规则最小使用次数', 'INT', 5, '低于此次数的技能可能被淘汰'),

  // --- SoulCoreProvider ---
  core('soul_core', 'basic', 'regen_rate', 'Soul 重新生成概率（0-100）', 'INT', 75, '值越大越倾向于重新评估'),
  core('soul_core', 'basic', 'prompt_template_id', 'Soul 匹配排名的 Prompt 模板 ID', 'STRING', '', '用于 Soul 匹配排名'),
  core('soul_core', 'opt_rule', 'opt_rule.days', '优化规则观察天数', 'INT', 30, 'Soul 淘汰/优化规则的观察窗口'),
  core('soul_core', 'opt_rule', 'opt_rule.min_usage_count', '优化规则最小使用次数', 'INT', 5, '低于此次数的 Soul 可能被淘汰'),

  // =========================================================================
  // ORCHESTRATION layer
  // =========================================================================

  // --- OrchestrationEntry ---
  orch('entry', 'basic', 'complexity_decompose_threshold', '复杂度分解阈值', 'INT', 50, '超过此值触发任务分解'),
  orch('entry', 'basic', 'strategy_prompt_template_id', '策略选择 Prompt 模板 ID', 'STRING', ''),
  orch('entry', 'basic', 'default_strategy', '默认编排策略', 'ENUM', 'SIMPLE', '', ['SIMPLE', 'COMPLEX', 'DAG']),
  orch('entry', 'basic', 'max_recent_works', '最大最近工作数', 'INT', 5),
  orch('entry', 'basic', 'async_worker_interval', '异步工作间隔（ms）', 'INT', 1000),

  // --- OrchestrationStrategy ---
  orch('strategy', 'basic', 'default_strategy_id', '默认策略 ID', 'STRING', '', '默认使用的策略 ID'),
  orch('strategy', 'basic', 'max_plan_retries', '最大计划重试次数', 'INT', 2),
  orch('strategy', 'basic', 'plan_prompt_template_id', '计划生成 Prompt 模板 ID', 'STRING', ''),

  // --- OrchestrationExecution ---
  orch('execution', 'basic', 'max_concurrent', '最大并发数', 'INT', 1),
  orch('execution', 'basic', 'default_max_iterations', '默认最大迭代次数', 'INT', 10),
  orch('execution', 'basic', 'async_worker_interval', '异步工作间隔（ms）', 'INT', 1000),
  orch('execution', 'basic', 'dag_timeout_ms', 'DAG 超时（ms）', 'INT', 300000, '5 分钟'),

  // --- OrchestrationVisualization ---
  orch('visualization', 'basic', 'max_nodes_in_graph', '图中最大节点数', 'INT', 50),

  // --- JSONNode ---
  orch('jsonnode', 'basic', 'max_execution_depth', '最大执行深度', 'INT', 50),
  orch('jsonnode', 'basic', 'node_timeout_ms', '节点超时（ms）', 'INT', 300000, '5 分钟'),
  orch('jsonnode', 'basic', 'trace_enabled', '追踪启用', 'BOOLEAN', true, '是否记录 JSONNode 执行追踪'),

  // =========================================================================
  // AGENT layer
  // =========================================================================

  // --- AgentExecution ---
  agent('agent_execution', 'basic', 'think_prompt_template_id', 'Think Prompt 模板 ID', 'STRING', '', 'Worker Think 阶段 Prompt 模板'),
  agent('agent_execution', 'basic', 'reflect_prompt_template_id', 'Reflect Prompt 模板 ID', 'STRING', '', 'Worker Reflect 阶段 Prompt 模板'),
  agent('agent_execution', 'basic', 'answer_prompt_template_id', 'Answer Prompt 模板 ID', 'STRING', '', 'Worker Answer 阶段 Prompt 模板'),
  agent('agent_execution', 'basic', 'default_max_iterations', '默认最大迭代次数', 'INT', 10, 'ReAct 循环最大轮数'),
  agent('agent_execution', 'basic', 'async_worker_interval', '异步工作间隔（ms）', 'INT', 1000),

  // =========================================================================
  // APPLICATION layer
  // =========================================================================

  // --- Chat ---
  app('chat', 'basic', 'max_messages_per_session', '每会话最大消息数', 'INT', 1000),
  app('chat', 'basic', 'sse_heartbeat_interval_ms', 'SSE 心跳间隔（ms）', 'INT', 30000, '30 秒'),
  app('chat', 'basic', 'default_history_lastN', '默认历史消息数', 'INT', 50, '聊天上下文携带的历史消息数'),

  // --- SelfLearning ---
  app('self_learning', 'weight', 'random_factor', '随机因子', 'INT', 10),
  app('self_learning', 'weight', 'document_weight', '文档权重', 'INT', 40),
  app('self_learning', 'weight', 'conversation_weight', '会话权重', 'INT', 30),
  app('self_learning', 'weight', 'tag_maintenance_weight', '标签维护权重', 'INT', 30),
  app('self_learning', 'interval', 'learning_interval_ms', '学习间隔（ms）', 'INT', 600000, '10 分钟'),
  app('self_learning', 'basic', 'default_learning_rate', '默认学习率', 'INT', 5),
  app('self_learning', 'interval', 'tag_connection_check_interval_ms', '标签关联检查间隔（ms）', 'INT', 1800000, '30 分钟'),
  app('self_learning', 'interval', 'tag_aging_cron', '标签老化 Cron', 'STRING', '0 0 2 * * *', '每天凌晨 2:00'),
  app('self_learning', 'interval', 'orphan_tag_check_cron', '孤立标签检查 Cron', 'STRING', '0 0 3 * * *', '每天凌晨 3:00'),
  app('self_learning', 'basic', 'document_split_threshold', '文档分割阈值', 'INT', 5000),

  // --- UserProfile ---
  app('user_profile', 'basic', 'auto_generate_interval_ms', '自动生成间隔（ms）', 'INT', 86400000, '24 小时'),
  app('user_profile', 'basic', 'profile_analysis_prompt_template_id', '画像分析 Prompt 模板 ID', 'STRING', ''),
  app('user_profile', 'basic', 'max_conversation_sample_count', '最大会话采样数', 'INT', 500),
  app('user_profile', 'basic', 'profile_retention_versions', '画像保留版本数', 'INT', 20),
  app('user_profile', 'basic', 'min_confidence_threshold', '最小置信度阈值', 'DOUBLE', 0.5),

  // --- Visualization ---
  app('visualization', 'basic', 'max_nodes_per_graph', '每图最大节点数', 'INT', 200),
  app('visualization', 'basic', 'default_message_summary_length', '默认消息摘要长度', 'INT', 50),
  app('visualization', 'basic', 'resolve_content_by_default', '默认展开内容', 'BOOLEAN', true),
  app('visualization', 'basic', 'max_context_samples_per_source', '每源最大上下文采样数', 'INT', 3),

  // --- Config (self) ---
  app('config', 'basic', 'default_readable', '默认可读', 'BOOLEAN', true, '新注册配置项的默认可读性'),
  app('config', 'basic', 'default_writable', '默认可写', 'BOOLEAN', true, '新注册配置项的默认可写性'),
];
