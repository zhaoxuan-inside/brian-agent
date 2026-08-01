import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getConfig } from './config.js';
import { logger } from './logger.js';

let dbInstance: Database.Database | null = null;

function ensureDataDir(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createTables(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 迁移：在建表之前检测并清理旧版表结构
  runMigrations(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      messages TEXT NOT NULL DEFAULT '[]',
      agent_chain TEXT,
      summary TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'agent')),
      content TEXT NOT NULL,
      agent_id TEXT,
      feedback_rating TEXT CHECK(feedback_rating IN ('good', 'neutral', 'bad')),
      feedback_reason TEXT,
      tokens_used INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

    CREATE TABLE IF NOT EXISTS memory_nodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0.8,
      importance REAL DEFAULT 0.5,
      embedding TEXT,
      embedding_id TEXT,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0,
      is_learning_memory INTEGER DEFAULT 0,
      related_node_ids TEXT DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_memory_nodes_user_id ON memory_nodes(user_id);
    CREATE INDEX IF NOT EXISTS idx_memory_nodes_type ON memory_nodes(type);
    CREATE INDEX IF NOT EXISTS idx_memory_nodes_created_at ON memory_nodes(created_at);
    CREATE INDEX IF NOT EXISTS idx_memory_nodes_importance ON memory_nodes(importance);

    CREATE TABLE IF NOT EXISTS memory_edges (
      id TEXT PRIMARY KEY,
      source_node_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
      target_node_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
      weight REAL DEFAULT 0.5,
      label TEXT,
      activation_count INTEGER DEFAULT 0,
      direction TEXT CHECK(direction IN ('undirected', 'directed')) DEFAULT 'undirected',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_edges_source ON memory_edges(source_node_id);
    CREATE INDEX IF NOT EXISTS idx_memory_edges_target ON memory_edges(target_node_id);

    CREATE TABLE IF NOT EXISTS user_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      exchange_id TEXT NOT NULL,
      msg_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      summary TEXT DEFAULT '',
      tokens INTEGER DEFAULT 0,
      embedding_id TEXT,
      metadata TEXT DEFAULT '{}',
      tags TEXT DEFAULT '[]',
      is_learning_memory INTEGER DEFAULT 0,
      message_index INTEGER DEFAULT 0,
      reference_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_messages_user_id ON user_messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_messages_session_id ON user_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_user_messages_exchange_id ON user_messages(exchange_id);
    CREATE INDEX IF NOT EXISTS idx_user_messages_msg_id ON user_messages(msg_id);
    CREATE INDEX IF NOT EXISTS idx_user_messages_created_at ON user_messages(created_at);

    CREATE TABLE IF NOT EXISTS user_message_keyword (
      id TEXT PRIMARY KEY,
      msg_id TEXT NOT NULL REFERENCES user_messages(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(msg_id, keyword)
    );

    CREATE INDEX IF NOT EXISTS idx_user_message_keyword_msg_id ON user_message_keyword(msg_id);
    CREATE INDEX IF NOT EXISTS idx_user_message_keyword_keyword ON user_message_keyword(keyword);

    CREATE VIRTUAL TABLE IF NOT EXISTS user_messages_fts USING fts5(
      content, summary,
      tokenize='porter unicode61',
      content='user_messages',
      content_rowid='rowid'
    );

    CREATE TABLE IF NOT EXISTS exchange_agent_chains (
      exchange_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      chain_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS message_references (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      msg_id TEXT NOT NULL,
      referenced_msg_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(msg_id, referenced_msg_id)
    );

    CREATE INDEX IF NOT EXISTS idx_msg_refs_session ON message_references(session_id);
    CREATE INDEX IF NOT EXISTS idx_msg_refs_msg ON message_references(msg_id);
    CREATE INDEX IF NOT EXISTS idx_msg_refs_referenced ON message_references(referenced_msg_id);

    CREATE TABLE IF NOT EXISTS memory_ratio_config (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      working_memory REAL DEFAULT 0.35,
      tag_neural_memory REAL DEFAULT 0.40,
      semantic_memory REAL DEFAULT 0.15,
      episodic_memory REAL DEFAULT 0.15,
      procedural_memory REAL DEFAULT 0.10,
      random_memory REAL DEFAULT 0.20,
      user_profile_memory REAL DEFAULT 0.05,
      knowledge_base_memory REAL DEFAULT 0.15,
      context_window_tokens INTEGER DEFAULT 8192,
      context_window_messages INTEGER DEFAULT 50,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_ratio_config_user_id ON memory_ratio_config(user_id);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);

    CREATE TABLE IF NOT EXISTS agent_chains (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      root_agent_id TEXT NOT NULL,
      agents TEXT NOT NULL DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_chains_conversation ON agent_chains(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_agent_chains_root_agent ON agent_chains(root_agent_id);

    CREATE TABLE IF NOT EXISTS call_history (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      error_message TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_call_history_timestamp ON call_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_call_history_provider ON call_history(provider_id);
    CREATE INDEX IF NOT EXISTS idx_call_history_model ON call_history(model_id);

    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('aesthetic', 'content', 'communication', 'behavior', 'general', 'tool_preference', 'habit', 'preference')),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      source TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_preferences_category ON user_preferences(category);

    CREATE TABLE IF NOT EXISTS time_series_data (
      id TEXT PRIMARY KEY,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      tags TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_time_series_timestamp ON time_series_data(timestamp);
    CREATE INDEX IF NOT EXISTS idx_time_series_metric ON time_series_data(metric);

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating TEXT NOT NULL CHECK(rating IN ('good', 'neutral', 'bad')),
      reason TEXT,
      error_info TEXT,
      include_context INTEGER DEFAULT 1,
      original_question TEXT,
      original_answer TEXT,
      context_messages TEXT,
      log_trace_id TEXT,
      related_logs TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_message_id ON feedback(message_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_conversation_id ON feedback(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      mode TEXT,
      category TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      user_input TEXT,
      user_output TEXT,
      user_process TEXT,
      normalized_spec TEXT,
      manual_content TEXT,
      review TEXT,
      input_schema TEXT NOT NULL DEFAULT '[]',
      output_schema TEXT NOT NULL DEFAULT '[]',
      prompt_template TEXT NOT NULL DEFAULT '',
      tools TEXT NOT NULL DEFAULT '[]',
      is_installed INTEGER NOT NULL DEFAULT 1,
      is_temporary INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      effectiveness_score REAL NOT NULL DEFAULT 0,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
    CREATE INDEX IF NOT EXISTS idx_skills_is_installed ON skills(is_installed);

    CREATE TABLE IF NOT EXISTS custom_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      strategy TEXT NOT NULL,
      llm_config TEXT NOT NULL,
      prompt TEXT NOT NULL,
      skills TEXT DEFAULT '[]',
      mcp_endpoints TEXT DEFAULT '[]',
      soul TEXT NOT NULL,
      sources TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_custom_agents_active ON custom_agents(active);

    CREATE TABLE IF NOT EXISTS mcp_installed (
      id TEXT PRIMARY KEY,
      package_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      version TEXT NOT NULL,
      tools TEXT NOT NULL DEFAULT '[]',
      active INTEGER DEFAULT 1,
      server_status TEXT DEFAULT 'stopped' CHECK(server_status IN ('running', 'stopped', 'error')),
      installed_at INTEGER NOT NULL,
      install_path TEXT DEFAULT '',
      source_market TEXT DEFAULT '',
      start_command TEXT DEFAULT '',
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_installed_active ON mcp_installed(active);

    CREATE TABLE IF NOT EXISTS mcp_markets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_markets_enabled ON mcp_markets(enabled);

    CREATE TABLE IF NOT EXISTS mcp_hot (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL,
      package_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      author TEXT DEFAULT '',
      version TEXT DEFAULT '',
      repository TEXT DEFAULT '',
      category TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      tools TEXT DEFAULT '[]',
      fetch_date TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_hot_fetch_date ON mcp_hot(fetch_date);

    CREATE TABLE IF NOT EXISTS mcps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      functions TEXT NOT NULL DEFAULT '[]',
      config TEXT NOT NULL DEFAULT '{}',
      is_installed INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      effectiveness_score REAL DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mcps_enabled ON mcps(enabled);
    CREATE INDEX IF NOT EXISTS idx_mcps_is_installed ON mcps(is_installed);

    CREATE TABLE IF NOT EXISTS library_paths (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
      active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_library_paths_category ON library_paths(category);

    CREATE TABLE IF NOT EXISTS agent_library (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      task_features TEXT NOT NULL DEFAULT '{}',
      strategy TEXT NOT NULL DEFAULT 'react',
      llm_config TEXT NOT NULL,
      prompt TEXT NOT NULL,
      skills TEXT DEFAULT '[]',
      mcp_endpoints TEXT DEFAULT '[]',
      soul TEXT DEFAULT '{}',
      strength REAL DEFAULT 0.5,
      use_count INTEGER DEFAULT 0,
      last_used_at INTEGER DEFAULT 0,
      feedback_history TEXT DEFAULT '[]',
      reliability REAL DEFAULT 0.5,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_library_strength ON agent_library(strength);
    CREATE INDEX IF NOT EXISTS idx_agent_library_use_count ON agent_library(use_count);

    -- Agent Layer: Strategy execution config
    CREATE TABLE IF NOT EXISTS agent_strategy_config (
      id TEXT PRIMARY KEY,
      strategy_name TEXT NOT NULL UNIQUE,
      agent_strategy_brief TEXT,
      agent_strategy_flow TEXT NOT NULL,
      max_steps INTEGER NOT NULL DEFAULT 10,
      step_timeout_seconds INTEGER NOT NULL DEFAULT 180,
      reuse_probability REAL NOT NULL DEFAULT 0.75,
      retry_count INTEGER NOT NULL DEFAULT 3,
      retry_interval_ms TEXT NOT NULL DEFAULT '[30000,60000,120000]',
      llm_id TEXT NOT NULL DEFAULT '',
      think_prompt_template_id TEXT NOT NULL DEFAULT '',
      answer_prompt_template_id TEXT NOT NULL DEFAULT '',
      is_system INTEGER NOT NULL DEFAULT 0,
      enable INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Agent Layer (PRD): Agent repository (AgentLibrary)
    CREATE TABLE IF NOT EXISTS agent (
      id TEXT PRIMARY KEY,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL,
      agent_id TEXT NOT NULL UNIQUE,
      agent_name TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      strategy_id TEXT NOT NULL DEFAULT '',
      llm_id TEXT NOT NULL DEFAULT '',
      soul_id TEXT NOT NULL DEFAULT '',
      task_signature TEXT NOT NULL DEFAULT '',
      usage_count INTEGER NOT NULL DEFAULT 0,
      eval_score INTEGER NOT NULL DEFAULT 50,
      enable INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_agent_agent_type ON agent(agent_type);
    CREATE INDEX IF NOT EXISTS idx_agent_created ON agent(created);

    CREATE TABLE IF NOT EXISTS agent_usage (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      agent_id TEXT NOT NULL, work_id TEXT NOT NULL DEFAULT '',
      interact_id TEXT NOT NULL DEFAULT '', usage_context TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_usage_agent_id ON agent_usage(agent_id);

    CREATE TABLE IF NOT EXISTS agent_opt_rule (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      days INTEGER NOT NULL DEFAULT 30, min_usage_count INTEGER NOT NULL DEFAULT 0,
      min_eval_score INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS agent_library_config (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      prompt_template_id TEXT NOT NULL DEFAULT '',
      similarity_threshold REAL NOT NULL DEFAULT 0.7,
      max_agent_count INTEGER NOT NULL DEFAULT 100
    );

    CREATE TABLE IF NOT EXISTS agent_strategy (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      strategy_id TEXT NOT NULL UNIQUE, strategy_label TEXT NOT NULL,
      suitable_complexity_min INTEGER NOT NULL DEFAULT 0,
      suitable_complexity_max INTEGER NOT NULL DEFAULT 100,
      suitable_domains TEXT NOT NULL DEFAULT '["*"]',
      execution_rule TEXT NOT NULL DEFAULT '{}',
      enable INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS agent_strategy_match_config (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      default_strategy_id TEXT NOT NULL DEFAULT '',
      match_prompt_template_id TEXT NOT NULL DEFAULT ''
    );

    -- Agent Layer (PRD): Builder config
    CREATE TABLE IF NOT EXISTS agent_builder_config (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      task_analysis_prompt_template_id TEXT NOT NULL DEFAULT '',
      default_strategy_id TEXT NOT NULL DEFAULT '',
      auto_optimize INTEGER NOT NULL DEFAULT 1
    );

    -- Agent Layer (PRD): Execution config and traces
    CREATE TABLE IF NOT EXISTS agent_execution_config (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      think_prompt_template_id TEXT NOT NULL DEFAULT '',
      reflect_prompt_template_id TEXT NOT NULL DEFAULT '',
      answer_prompt_template_id TEXT NOT NULL DEFAULT '',
      default_max_iterations INTEGER NOT NULL DEFAULT 10,
      async_worker_interval INTEGER NOT NULL DEFAULT 1000
    );
    CREATE TABLE IF NOT EXISTS agent_execution_trace (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      trace_id TEXT NOT NULL UNIQUE, agent_id TEXT NOT NULL,
      work_id TEXT NOT NULL DEFAULT '', interact_id TEXT NOT NULL DEFAULT '',
      task_content TEXT NOT NULL DEFAULT '', history TEXT NOT NULL DEFAULT '[]',
      iterations INTEGER NOT NULL DEFAULT 0, answer TEXT NOT NULL DEFAULT '',
      elapsed_ms INTEGER NOT NULL DEFAULT 0, token_usage INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_exec_trace_agent_id ON agent_execution_trace(agent_id);

    -- Agent Layer (PRD): Planner
    CREATE TABLE IF NOT EXISTS agent_plan (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      plan_id TEXT NOT NULL UNIQUE, work_id TEXT NOT NULL DEFAULT '',
      interact_id TEXT NOT NULL DEFAULT '', task_dag TEXT NOT NULL DEFAULT '{}',
      parent_plan_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_plan_work_id ON agent_plan(work_id);

    CREATE TABLE IF NOT EXISTS planner_agent_config (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      complexity_decompose_threshold INTEGER NOT NULL DEFAULT 50,
      plan_prompt_template_id TEXT NOT NULL DEFAULT '',
      max_subtask_count INTEGER NOT NULL DEFAULT 10
    );

    -- Agent Layer (PRD): Writer
    CREATE TABLE IF NOT EXISTS writer_agent_config (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      write_prompt_template_id TEXT NOT NULL DEFAULT '',
      default_language TEXT NOT NULL DEFAULT 'zh-CN',
      default_style TEXT NOT NULL DEFAULT 'clear',
      default_depth TEXT NOT NULL DEFAULT 'medium',
      default_format TEXT NOT NULL DEFAULT 'MARKDOWN'
    );
    CREATE TABLE IF NOT EXISTS writer_agent_user_profile (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      session_id TEXT NOT NULL UNIQUE, language TEXT NOT NULL DEFAULT 'zh-CN',
      style TEXT NOT NULL DEFAULT 'clear', depth TEXT NOT NULL DEFAULT 'medium',
      format TEXT NOT NULL DEFAULT 'MARKDOWN', additional_preferences TEXT
    );

    -- Agent Layer (PRD): Evolutor
    CREATE TABLE IF NOT EXISTS agent_evaluation (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      eval_id TEXT NOT NULL UNIQUE, agent_id TEXT NOT NULL,
      eval_type TEXT NOT NULL, work_id TEXT NOT NULL DEFAULT '',
      interact_id TEXT NOT NULL DEFAULT '', scores TEXT NOT NULL DEFAULT '{}',
      suggestions TEXT, need_optimize INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_agent_eval_agent_id ON agent_evaluation(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_eval_eval_type ON agent_evaluation(eval_type);

    CREATE TABLE IF NOT EXISTS evolutor_agent_config (
      id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      eval_work_prompt_template_id TEXT NOT NULL DEFAULT '',
      eval_write_prompt_template_id TEXT NOT NULL DEFAULT '',
      optimize_threshold INTEGER NOT NULL DEFAULT 60,
      eval_frequency_threshold INTEGER NOT NULL DEFAULT 5,
      eval_schedule_interval_ms INTEGER NOT NULL DEFAULT 3600000,
      eval_batch_size INTEGER NOT NULL DEFAULT 20
    );

    CREATE TABLE IF NOT EXISTS model_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);

    CREATE TABLE IF NOT EXISTS provider_configs (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'openai-compatible',
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_configs_provider_id ON provider_configs(provider_id);

    CREATE TABLE IF NOT EXISTS provider_models (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL REFERENCES provider_configs(id),
      model_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      max_tokens INTEGER NOT NULL DEFAULT 4096,
      supports_vision INTEGER NOT NULL DEFAULT 0,
      supports_tools INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(config_id, model_id)
    );

    CREATE TABLE IF NOT EXISTS user_models (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL REFERENCES provider_configs(id),
      model_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      quota_tokens_per_day INTEGER NOT NULL DEFAULT 100000,
      quota_tokens_per_week INTEGER NOT NULL DEFAULT 5000000,
      quota_tokens_per_month INTEGER NOT NULL DEFAULT 22000000,
      quota_calls_per_day INTEGER NOT NULL DEFAULT 1000,
      quota_calls_per_week INTEGER NOT NULL DEFAULT 5000,
      quota_calls_per_month INTEGER NOT NULL DEFAULT 22000,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(config_id, model_id)
    );

    CREATE TABLE IF NOT EXISTS souls (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      personality TEXT NOT NULL DEFAULT '[]',
      tone TEXT NOT NULL DEFAULT '',
      knowledge_base TEXT NOT NULL DEFAULT '[]',
      constraints TEXT NOT NULL DEFAULT '[]',
      example_responses TEXT NOT NULL DEFAULT '[]',
      is_temporary INTEGER DEFAULT 0,
      expires_at INTEGER,
      effectiveness_score REAL DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_souls_user_id ON souls(user_id);
    CREATE INDEX IF NOT EXISTS idx_souls_effectiveness ON souls(effectiveness_score);

    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      workflow TEXT NOT NULL DEFAULT '[]',
      inputs TEXT NOT NULL DEFAULT '[]',
      outputs TEXT NOT NULL DEFAULT '[]',
      is_temporary INTEGER DEFAULT 0,
      effectiveness_score REAL DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_works_user_id ON works(user_id);
    CREATE INDEX IF NOT EXISTS idx_works_effectiveness ON works(effectiveness_score);

    CREATE TABLE IF NOT EXISTS call_traces (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      user_id TEXT,
      message_id TEXT,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      duration INTEGER,
      user_input TEXT,
      intent TEXT,
      intent_confidence REAL,
      model_interactions TEXT,
      capabilities_loaded TEXT,
      dag TEXT,
      agent_strategies TEXT,
      self_calls TEXT,
      final_output TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_call_traces_message ON call_traces(message_id);
    CREATE INDEX IF NOT EXISTS idx_call_traces_user ON call_traces(user_id);
    CREATE INDEX IF NOT EXISTS idx_call_traces_time ON call_traces(created_at);

    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      properties TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL,
      weight REAL DEFAULT 0.5,
      properties TEXT DEFAULT '{}',
      activation_count INTEGER DEFAULT 0,
      last_activation_time INTEGER DEFAULT (strftime('%s', 'now')),
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON graph_edges(from_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON graph_edges(to_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_relationship ON graph_edges(relationship);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_active ON graph_edges(is_active);

    CREATE TABLE IF NOT EXISTS graph_activation_events (
      id TEXT PRIMARY KEY,
      edge_id TEXT NOT NULL REFERENCES graph_edges(id) ON DELETE CASCADE,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      activation_time INTEGER DEFAULT (strftime('%s', 'now')),
      trigger_type TEXT DEFAULT 'user_query'
    );

    CREATE INDEX IF NOT EXISTS idx_graph_activation_edge ON graph_activation_events(edge_id);
    CREATE INDEX IF NOT EXISTS idx_graph_activation_time ON graph_activation_events(activation_time);

    CREATE TABLE IF NOT EXISTS vector_embeddings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      embedding TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vector_user_id ON vector_embeddings(user_id);

    CREATE TABLE IF NOT EXISTS queue_messages (
      id TEXT PRIMARY KEY,
      queue TEXT NOT NULL,
      payload TEXT NOT NULL,
      priority INTEGER DEFAULT 5,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      processed_at INTEGER,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3
    );

    CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_messages(queue, status);
    CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue_messages(queue, priority DESC, created_at);

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      avatar TEXT,
      preferences TEXT NOT NULL DEFAULT '{}',
      tags TEXT NOT NULL DEFAULT '[]',
      interests TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_mcp (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      mcp_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(agent_id, mcp_id)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_mcp_agent ON agent_mcp(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_mcp_mcp ON agent_mcp(mcp_id);

    -- Core Layer: LLM selection config
    CREATE TABLE IF NOT EXISTS llm_core_config (
      id TEXT PRIMARY KEY,
      regen_rate INTEGER NOT NULL DEFAULT 75,
      prompt_template_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Core Layer: Agent-LLM bindings
    CREATE TABLE IF NOT EXISTS agent_llm (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL UNIQUE,
      llm_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Core Layer: LLM provider quota
    CREATE TABLE IF NOT EXISTS llm_provider_quota (
      id TEXT PRIMARY KEY,
      llm_provider_id TEXT NOT NULL UNIQUE,
      quota_tokens_per_day INTEGER NOT NULL DEFAULT 100000,
      quota_tokens_per_week INTEGER NOT NULL DEFAULT 500000,
      quota_tokens_per_month INTEGER NOT NULL DEFAULT 2000000,
      quota_calls_per_day INTEGER NOT NULL DEFAULT 1000,
      quota_calls_per_week INTEGER NOT NULL DEFAULT 5000,
      quota_calls_per_month INTEGER NOT NULL DEFAULT 20000,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Core Layer: MCP selection config
    CREATE TABLE IF NOT EXISTS mcp_core_config (
      id TEXT PRIMARY KEY,
      regen_rate INTEGER NOT NULL DEFAULT 75,
      prompt_template_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Core Layer: Skill selection config
    CREATE TABLE IF NOT EXISTS skill_core_config (
      id TEXT PRIMARY KEY,
      regen_rate INTEGER NOT NULL DEFAULT 75,
      prompt_template_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Core Layer: Agent-Skill bindings
    CREATE TABLE IF NOT EXISTS agent_skill (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(agent_id, skill_id)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_skill_agent ON agent_skill(agent_id);

    -- Core Layer: Skill aging rules
    CREATE TABLE IF NOT EXISTS skill_opt_rule (
      id TEXT PRIMARY KEY,
      days INTEGER NOT NULL,
      min_usage_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Core Layer: Skill usage tracking
    CREATE TABLE IF NOT EXISTS skill_usage (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(skill_id, usage_date)
    );

    -- Core Layer: Soul selection config
    CREATE TABLE IF NOT EXISTS soul_core_config (
      id TEXT PRIMARY KEY,
      regen_rate INTEGER NOT NULL DEFAULT 75,
      prompt_template_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Core Layer: Agent-Soul bindings
    CREATE TABLE IF NOT EXISTS agent_soul (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL UNIQUE,
      soul_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Core Layer: Soul aging rules
    CREATE TABLE IF NOT EXISTS soul_opt_rule (
      id TEXT PRIMARY KEY,
      days INTEGER NOT NULL,
      min_usage_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Core Layer: Soul usage tracking
    CREATE TABLE IF NOT EXISTS soul_usage (
      id TEXT PRIMARY KEY,
      soul_id TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(soul_id, usage_date)
    );
  `);

  logger.info('Database', 'All tables created successfully');
}

function runMigrations(db: Database.Database): void {
  logger.info('Database', '[runMigrations] ====== START ======');

  // ── P1-7: messages table — add updated_at column ──
  logger.info('Database', '[runMigrations] Checking messages.updated_at column...');
  try {
    db.exec('ALTER TABLE messages ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
    logger.info('Database', '[runMigrations] messages: added updated_at column');
  } catch (_e: any) {
    logger.info('Database', '[runMigrations] messages: updated_at column already exists, skip');
  }

  // ── P2-8: user_preferences — add key index ──
  logger.info('Database', '[runMigrations] Checking user_preferences key index...');
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences(key)');
  } catch (_e: any) {
    logger.info('Database', `[runMigrations] user_preferences key index skipped: ${_e.message || _e}`);
  }

  logger.info('Database', '[runMigrations] Checking user_models table migration...');
  try {
    db.exec('ALTER TABLE user_models ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0');
    logger.info('Database', '[runMigrations] user_models: added is_default column');
  } catch (_e2: any) {
    logger.info('Database', '[runMigrations] user_models: is_default column already exists, skip');
  }

  // ── conversations / feedback — add columns missing in old installs ──
  // Old databases created these tables without the columns below, which makes
  // the CREATE INDEX statements in createTables fail with "no such column".
  const columnMigrations: { table: string; column: string; ddl: string }[] = [
    { table: 'conversations', column: 'summary', ddl: `ALTER TABLE conversations ADD COLUMN summary TEXT` },
    { table: 'conversations', column: 'status', ddl: `ALTER TABLE conversations ADD COLUMN status TEXT DEFAULT 'active'` },
    { table: 'conversations', column: 'metadata', ddl: `ALTER TABLE conversations ADD COLUMN metadata TEXT DEFAULT '{}'` },
    { table: 'feedback', column: 'conversation_id', ddl: `ALTER TABLE feedback ADD COLUMN conversation_id TEXT NOT NULL DEFAULT ''` },
    { table: 'feedback', column: 'error_info', ddl: `ALTER TABLE feedback ADD COLUMN error_info TEXT` },
    { table: 'feedback', column: 'include_context', ddl: `ALTER TABLE feedback ADD COLUMN include_context INTEGER DEFAULT 1` },
    { table: 'feedback', column: 'original_question', ddl: `ALTER TABLE feedback ADD COLUMN original_question TEXT` },
    { table: 'feedback', column: 'original_answer', ddl: `ALTER TABLE feedback ADD COLUMN original_answer TEXT` },
    { table: 'feedback', column: 'context_messages', ddl: `ALTER TABLE feedback ADD COLUMN context_messages TEXT` },
    { table: 'feedback', column: 'log_trace_id', ddl: `ALTER TABLE feedback ADD COLUMN log_trace_id TEXT` },
    { table: 'feedback', column: 'related_logs', ddl: `ALTER TABLE feedback ADD COLUMN related_logs TEXT` },
    { table: 'feedback', column: 'status', ddl: `ALTER TABLE feedback ADD COLUMN status TEXT DEFAULT 'pending'` },
    { table: 'feedback', column: 'updated_at', ddl: `ALTER TABLE feedback ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0` },
  ];
  for (const m of columnMigrations) {
    try {
      db.exec(m.ddl);
      logger.info('Database', `[runMigrations] ${m.table}: added ${m.column} column`);
    } catch (_e: any) {
      logger.info('Database', `[runMigrations] ${m.table}: ${m.column} column already exists, skip`);
    }
  }

  logger.info('Database', '[runMigrations] Checking mcp_installed table migration...');
  try {
    db.exec('ALTER TABLE mcp_installed ADD COLUMN install_path TEXT');
    logger.info('Database', '[runMigrations] mcp_installed: added install_path column');
  } catch (_e: any) {
    logger.info('Database', '[runMigrations] mcp_installed: install_path column already exists, skip');
  }

  try {
    db.exec('ALTER TABLE mcp_installed ADD COLUMN source_market TEXT');
    logger.info('Database', '[runMigrations] mcp_installed: added source_market column');
  } catch (_e: any) {
    logger.info('Database', '[runMigrations] mcp_installed: source_market column already exists, skip');
  }

  try {
    db.exec('ALTER TABLE mcp_installed ADD COLUMN start_command TEXT');
    logger.info('Database', '[runMigrations] mcp_installed: added start_command column');
  } catch (_e: any) {
    logger.info('Database', '[runMigrations] mcp_installed: start_command column already exists, skip');
  }

  try {
    db.exec('ALTER TABLE mcp_installed ADD COLUMN updated_at TEXT');
    logger.info('Database', '[runMigrations] mcp_installed: added updated_at column');
  } catch (_e: any) {
    logger.info('Database', '[runMigrations] mcp_installed: updated_at column already exists, skip');
  }

  logger.info('Database', '[runMigrations] Checking agent_mcp table migration...');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_mcp (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        mcp_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        UNIQUE(agent_id, mcp_id)
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_mcp_agent ON agent_mcp(agent_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_mcp_mcp ON agent_mcp(mcp_id)');
    logger.info('Database', '[runMigrations] agent_mcp: table and indexes created');
  } catch (_e: any) {
    logger.info('Database', '[runMigrations] agent_mcp: table already exists, skip');
  }

  logger.info('Database', '[runMigrations] Checking skills table migration...');
  try {
    const columns = db.pragma('table_info(skills)') as any[];
    if (columns.length > 0 && columns.some((c: any) => c.name === 'mode')) {
      logger.info('Database', '[runMigrations] skills: old schema detected with mode column, dropping table');
      db.exec('DROP TABLE IF EXISTS skills');
      logger.info('Database', '[runMigrations] skills: table dropped successfully');
    } else {
      logger.info('Database', '[runMigrations] skills: no migration needed');
    }
  } catch (_e: any) {
    logger.info('Database', '[runMigrations] skills: table does not exist, skip');
  }

  logger.info('Database', '[runMigrations] Checking memory_nodes table migration...');
  try {
    const columns = db.pragma('table_info(memory_nodes)') as any[];
    if (columns.length > 0 && columns.some((c: any) => c.name === 'salience_score')) {
      logger.info('Database', '[runMigrations] memory_nodes: old schema detected with salience_score column, dropping tables');
      db.exec('DROP TABLE IF EXISTS memory_edges');
      db.exec('DROP TABLE IF EXISTS memory_nodes');
      logger.info('Database', '[runMigrations] memory_nodes: tables dropped successfully');
    } else {
      logger.info('Database', '[runMigrations] memory_nodes: no migration needed');
    }
  } catch (_e: any) {
    logger.info('Database', '[runMigrations] memory_nodes: table does not exist, skip');
  }

  logger.info('Database', '[runMigrations] Checking user_messages table migration...');
  try {
    const msgColumns = db.pragma('table_info(user_messages)') as any[];
    const hasChatId = msgColumns.some((c: any) => c.name === 'chat_id');
    const hasSessionId = msgColumns.some((c: any) => c.name === 'session_id');
    const hasExchangeId = msgColumns.some((c: any) => c.name === 'exchange_id');
    const hasMsgId = msgColumns.some((c: any) => c.name === 'msg_id');
    
    logger.info('Database', `[runMigrations] user_messages: hasChatId=${hasChatId} hasSessionId=${hasSessionId} hasExchangeId=${hasExchangeId} hasMsgId=${hasMsgId}`);
    
    if (hasChatId && !hasSessionId) {
      logger.info('Database', '[runMigrations] user_messages: starting migration from chat_id to session_id');
      
      logger.info('Database', '[runMigrations] user_messages: adding session_id column');
      db.exec('ALTER TABLE user_messages ADD COLUMN session_id TEXT');
      
      logger.info('Database', '[runMigrations] user_messages: adding exchange_id column');
      db.exec('ALTER TABLE user_messages ADD COLUMN exchange_id TEXT');
      
      logger.info('Database', '[runMigrations] user_messages: adding msg_id column');
      db.exec('ALTER TABLE user_messages ADD COLUMN msg_id TEXT');
      
      logger.info('Database', '[runMigrations] user_messages: adding summary column');
      db.exec('ALTER TABLE user_messages ADD COLUMN summary TEXT DEFAULT \'\'');
      
      logger.info('Database', '[runMigrations] user_messages: adding reference_count column');
      db.exec('ALTER TABLE user_messages ADD COLUMN reference_count INTEGER DEFAULT 0');
      
      logger.info('Database', '[runMigrations] user_messages: migrating data from chat_id to session_id');
      db.exec('UPDATE user_messages SET session_id = chat_id, exchange_id = id, msg_id = id');
      
      const countResult = db.prepare('SELECT COUNT(*) as count FROM user_messages').get() as any;
      logger.info('Database', `[runMigrations] user_messages: data migration completed, total records=${countResult.count}`);
      
      logger.info('Database', '[runMigrations] user_messages: dropping chat_id column');
      db.exec('ALTER TABLE user_messages DROP COLUMN chat_id');
      
      logger.info('Database', '[runMigrations] user_messages: migration completed successfully');
    } else if (!hasChatId && !hasSessionId) {
      logger.info('Database', '[runMigrations] user_messages: table does not exist, will be created by CREATE TABLE IF NOT EXISTS');
    } else {
      logger.info('Database', '[runMigrations] user_messages: already migrated, skip');
    }
  } catch (e: any) {
    logger.info('Database', `[runMigrations] user_messages migration skipped or already done: ${e.message || e}`);
  }

  logger.info('Database', '[runMigrations] Checking user_messages_fts table migration...');
  try {
    const ftsExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='user_messages_fts'"
    ).get();
    if (!ftsExists) {
      logger.info('Database', '[runMigrations] user_messages_fts: creating FTS5 virtual table');
      db.exec(`
        CREATE VIRTUAL TABLE user_messages_fts USING fts5(
          content, summary,
          tokenize='porter unicode61',
          content='user_messages',
          content_rowid='rowid'
        )
      `);
      logger.info('Database', '[runMigrations] user_messages_fts: virtual table created, rebuilding index');
      db.exec("INSERT INTO user_messages_fts(user_messages_fts) VALUES('rebuild')");
      const ftsCount = db.prepare('SELECT COUNT(*) as count FROM user_messages_fts').get() as any;
      logger.info('Database', `[runMigrations] user_messages_fts: index rebuilt, ${ftsCount.count} documents indexed`);
    } else {
      logger.info('Database', '[runMigrations] user_messages_fts: already exists, skip');
    }
  } catch (e: any) {
    logger.info('Database', `[runMigrations] user_messages_fts migration failed: ${e.message || e}`);
  }

  // Backfill message_references from legacy user_messages.metadata.selectedMessageIds
  logger.info('Database', '[runMigrations] Checking message_references backfill...');
  try {
    // Migrations run before CREATE TABLE — ensure the table exists first
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_references (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        msg_id TEXT NOT NULL,
        referenced_msg_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(msg_id, referenced_msg_id)
      );
      CREATE INDEX IF NOT EXISTS idx_msg_refs_session ON message_references(session_id);
      CREATE INDEX IF NOT EXISTS idx_msg_refs_msg ON message_references(msg_id);
      CREATE INDEX IF NOT EXISTS idx_msg_refs_referenced ON message_references(referenced_msg_id);
    `);
    const userMessagesExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='user_messages'"
    ).get();
    const legacyRows = userMessagesExists
      ? db.prepare("SELECT session_id, msg_id, metadata FROM user_messages WHERE metadata LIKE '%selectedMessageIds%'").all() as any[]
      : [];
    if (legacyRows.length > 0) {
      const insertRef = db.prepare(
        'INSERT OR IGNORE INTO message_references (id, session_id, msg_id, referenced_msg_id, created_at) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)'
      );
      const findByMsgId = db.prepare('SELECT msg_id FROM user_messages WHERE msg_id = ?');
      const findByRowId = db.prepare('SELECT msg_id FROM user_messages WHERE id = ?');
      let migrated = 0;
      for (const row of legacyRows) {
        try {
          const meta = JSON.parse(row.metadata || '{}');
          const ids: unknown = meta.selectedMessageIds;
          if (!Array.isArray(ids)) continue;
          for (const rawId of ids) {
            if (typeof rawId !== 'string' || !rawId) continue;
            // Legacy data may store either msg_id or row id — resolve to msg_id
            const resolved = (findByMsgId.get(rawId) as any)?.msg_id
              ?? (findByRowId.get(rawId) as any)?.msg_id;
            if (resolved) {
              const r = insertRef.run(row.session_id, row.msg_id, resolved, Date.now());
              migrated += r.changes;
            }
          }
        } catch { /* ignore malformed metadata */ }
      }
      logger.info('Database', `[runMigrations] message_references: backfilled ${migrated} references from ${legacyRows.length} legacy rows`);
    } else {
      logger.info('Database', '[runMigrations] message_references: no legacy selectedMessageIds found, skip');
    }
  } catch (e: any) {
    logger.info('Database', `[runMigrations] message_references backfill failed: ${e.message || e}`);
  }

  logger.info('Database', '[runMigrations] Checking exchange_agent_chains table migration...');
  try {
    // Check if the existing table has a foreign key that needs to be removed
    const chainsExists = db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name='exchange_agent_chains'"
    ).get() as { name: string; sql: string } | undefined;
    if (chainsExists && chainsExists.sql && chainsExists.sql.toUpperCase().includes('FOREIGN KEY')) {
      logger.info('Database', '[runMigrations] exchange_agent_chains: has FOREIGN KEY constraint, recreating without it');
      // Backup existing data, drop table, recreate without FK
      db.exec('ALTER TABLE exchange_agent_chains RENAME TO exchange_agent_chains_old');
      db.exec(`
        CREATE TABLE exchange_agent_chains (
          exchange_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          chain_json TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);
      db.exec('INSERT INTO exchange_agent_chains SELECT exchange_id, session_id, chain_json, created_at FROM exchange_agent_chains_old');
      db.exec('DROP TABLE exchange_agent_chains_old');
      logger.info('Database', '[runMigrations] exchange_agent_chains: recreated without FK');
    } else if (!chainsExists) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS exchange_agent_chains (
          exchange_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          chain_json TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);
      logger.info('Database', '[runMigrations] exchange_agent_chains: created');
    } else {
      logger.info('Database', '[runMigrations] exchange_agent_chains: already exists, skip');
    }
  } catch (e: any) {
    logger.info('Database', `[runMigrations] exchange_agent_chains migration failed: ${e.message || e}`);
  }

  // ── P0-1: Migrate call_history / time_series_data from AUTOINCREMENT to TEXT UUID ──
  logger.info('Database', '[runMigrations] Checking call_history ID type migration...');
  try {
    const chCols = db.pragma('table_info(call_history)') as any[];
    if (chCols.length > 0 && chCols.some((c: any) => c.name === 'id' && String(c.type).toUpperCase().includes('INT'))) {
      logger.info('Database', '[runMigrations] call_history: INTEGER id detected, migrating to TEXT UUID v7');
      db.exec('ALTER TABLE call_history RENAME TO call_history_old');
      db.exec(`
        CREATE TABLE call_history (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          tokens INTEGER NOT NULL,
          latency_ms INTEGER NOT NULL,
          success INTEGER NOT NULL DEFAULT 1,
          error_message TEXT,
          timestamp INTEGER NOT NULL
        )
      `);
      // We can't generate UUID v7 in SQL, so we use a stable hash-based approach
      db.exec(`
        INSERT INTO call_history (id, provider_id, model_id, tokens, latency_ms, success, error_message, timestamp)
        SELECT hex(randomblob(16)), provider_id, model_id, tokens, latency_ms, success, error_message, timestamp
        FROM call_history_old
      `);
      db.exec('DROP TABLE call_history_old');
      db.exec('CREATE INDEX IF NOT EXISTS idx_call_history_timestamp ON call_history(timestamp)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_call_history_provider ON call_history(provider_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_call_history_model ON call_history(model_id)');
      logger.info('Database', '[runMigrations] call_history: migration completed');
    } else {
      logger.info('Database', '[runMigrations] call_history: already TEXT id or does not exist, skip');
    }
  } catch (e: any) {
    logger.info('Database', `[runMigrations] call_history migration skipped: ${e.message || e}`);
  }

  logger.info('Database', '[runMigrations] Checking time_series_data ID type migration...');
  try {
    const tsCols = db.pragma('table_info(time_series_data)') as any[];
    if (tsCols.length > 0 && tsCols.some((c: any) => c.name === 'id' && String(c.type).toUpperCase().includes('INT'))) {
      logger.info('Database', '[runMigrations] time_series_data: INTEGER id detected, migrating to TEXT UUID v7');
      db.exec('ALTER TABLE time_series_data RENAME TO time_series_data_old');
      db.exec(`
        CREATE TABLE time_series_data (
          id TEXT PRIMARY KEY,
          metric TEXT NOT NULL,
          value REAL NOT NULL,
          timestamp INTEGER NOT NULL,
          tags TEXT DEFAULT '{}'
        )
      `);
      db.exec(`
        INSERT INTO time_series_data (id, metric, value, timestamp, tags)
        SELECT hex(randomblob(16)), metric, value, timestamp, tags
        FROM time_series_data_old
      `);
      db.exec('DROP TABLE time_series_data_old');
      db.exec('CREATE INDEX IF NOT EXISTS idx_time_series_timestamp ON time_series_data(timestamp)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_time_series_metric ON time_series_data(metric)');
      logger.info('Database', '[runMigrations] time_series_data: migration completed');
    } else {
      logger.info('Database', '[runMigrations] time_series_data: already TEXT id or does not exist, skip');
    }
  } catch (e: any) {
    logger.info('Database', `[runMigrations] time_series_data migration skipped: ${e.message || e}`);
  }

  // ── P0-2: Convert TEXT date columns to INTEGER (Unix ms timestamps) ──
  const dateTables = [
    { name: 'custom_agents', cols: ['created_at', 'updated_at'] },
    { name: 'provider_configs', cols: ['created_at', 'updated_at'] },
    { name: 'provider_models', cols: ['created_at', 'updated_at'] },
    { name: 'user_models', cols: ['created_at', 'updated_at'] },
    { name: 'mcp_installed', cols: ['installed_at'], extraCols: ['updated_at'] },
  ];

  for (const table of dateTables) {
    try {
      const cols = db.pragma(`table_info(${table.name})`) as any[];
      if (cols.length === 0) continue;

      const allCols = [...table.cols];
      if (table.extraCols) allCols.push(...table.extraCols);

      for (const col of allCols) {
        const colInfo = cols.find((c: any) => c.name === col);
        if (!colInfo) continue;

        // Check if any rows still have TEXT-format dates
        const textRow = db.prepare(
          `SELECT 1 FROM ${table.name} WHERE typeof(${col}) = 'text' LIMIT 1`
        ).get();
        if (!textRow) continue;

        logger.info('Database', `[runMigrations] ${table.name}.${col}: converting TEXT dates to INTEGER`);
        // strftime('%s', ...) gives seconds since epoch; multiply by 1000 for ms
        db.exec(
          `UPDATE ${table.name} SET ${col} = CAST(strftime('%s', ${col}) AS INTEGER) * 1000 WHERE typeof(${col}) = 'text'`
        );
      }
    } catch (e: any) {
      logger.info('Database', `[runMigrations] ${table.name} date conversion skipped: ${e.message || e}`);
    }
  }

  // Migration: convert legacy user_id='default' to user_id='' (empty string for global configs)
  logger.info('Database', '[runMigrations] Checking user_id default migration...');
  const tablesWithUserId = ['skills', 'mcps', 'user_model_config'];
  for (const table of tablesWithUserId) {
    try {
      const hasDefault = db.prepare(
        `SELECT 1 FROM ${table} WHERE user_id = 'default' LIMIT 1`
      ).get();
      if (hasDefault) {
        const result = db.prepare(
          `UPDATE ${table} SET user_id = '' WHERE user_id = 'default'`
        ).run();
        logger.info('Database', `[runMigrations] ${table}: converted ${result.changes} rows from user_id='default' to ''`);
      } else {
        logger.info('Database', `[runMigrations] ${table}: no 'default' rows found, skip`);
      }
    } catch (e: any) {
      logger.info('Database', `[runMigrations] ${table} user_id migration skipped: ${e.message || e}`);
    }
  }

  logger.info('Database', '[runMigrations] ====== END ======');
}

export function initDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const config = getConfig();
  const dbPath = path.resolve(config.dbPath);
  ensureDataDir(dbPath);

  dbInstance = new Database(dbPath);
  
  try {
    createTables(dbInstance);
    logger.info('Database', `Database initialized at ${dbPath}`);
  } catch (e) {
    logger.error('Database', `Failed to create tables: ${e}`);
    throw e;
  }

  return dbInstance;
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    logger.info('Database', 'Database connection closed');
  }
}