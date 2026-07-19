import { generateUUIDv7 } from '../../infrastructure/uuid';
import { getDatabase } from '../../infrastructure/database';

function now(): number {
  return Date.now();
}

export class SQLiteStorage {
  private db = getDatabase();

  // ============================================================
  // Conversations
  // ============================================================

  createConversation(id: string, userId: string, title?: string): { id: string } {
    const ts = now();
    const stmt = this.db.prepare(
      `INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    );
    stmt.run(id, userId, title || null, ts, ts);
    return { id };
  }

  getConversation(id: string): any {
    const row = this.db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      messages: JSON.parse(row.messages as string),
      agentChain: row.agent_chain ? JSON.parse(row.agent_chain as string) : undefined,
      summary: row.summary,
      status: row.status,
      metadata: JSON.parse(row.metadata as string),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listConversations(userId: string): any[] {
    const rows = this.db.prepare(
      `SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC`
    ).all(userId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      messages: JSON.parse(row.messages as string),
      agentChain: row.agent_chain ? JSON.parse(row.agent_chain as string) : undefined,
      summary: row.summary,
      status: row.status,
      metadata: JSON.parse(row.metadata as string),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  updateConversation(id: string, updates: { title?: string }): void {
    const ts = now();
    if (updates.title !== undefined) {
      this.db.prepare(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`).run(updates.title, ts, id);
    }
  }

  deleteConversation(id: string): void {
    this.db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
  }

  // ============================================================
  // Messages
  // ============================================================

  createMessage(msg: {
    id: string;
    conversationId: string;
    role: string;
    content: string;
    agentId?: string;
    tokens?: number;
    latencyMs?: number;
  }): { id: string } {
    const ts = now();
    const stmt = this.db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, agent_id, tokens_used, latency_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(msg.id, msg.conversationId, msg.role, msg.content, msg.agentId || null, msg.tokens || 0, msg.latencyMs || 0, ts);
    return { id: msg.id };
  }

  getMessages(conversationId: string, limit?: number): any[] {
    const query = limit
      ? `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`
      : `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`;
    const rows = limit
      ? (this.db.prepare(query).all(conversationId, limit) as Record<string, unknown>[])
      : (this.db.prepare(query).all(conversationId) as Record<string, unknown>[]);
    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      agentId: row.agent_id,
      feedbackRating: row.feedback_rating,
      feedbackReason: row.feedback_reason,
      tokens: row.tokens_used,
      latencyMs: row.latency_ms,
      metadata: JSON.parse(row.metadata as string),
      createdAt: row.created_at,
    }));
  }

  getMessage(id: string): any {
    const row = this.db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      agentId: row.agent_id,
      feedbackRating: row.feedback_rating,
      feedbackReason: row.feedback_reason,
      tokens: row.tokens_used,
      latencyMs: row.latency_ms,
      metadata: JSON.parse(row.metadata as string),
      createdAt: row.created_at,
    };
  }

  // ============================================================
  // Call History
  // ============================================================

  recordCall(model: string, provider: string, tokens: number, latencyMs: number): void {
    const ts = now();
    const id = generateUUIDv7();
    this.db.prepare(
      `INSERT INTO call_history (id, provider_id, model_id, tokens, latency_ms, success, timestamp) VALUES (?, ?, ?, ?, ?, 1, ?)`
    ).run(id, provider, model, tokens, latencyMs, ts);
  }

  getCallHistory(limit?: number): any[] {
    const query = limit
      ? `SELECT * FROM call_history ORDER BY timestamp DESC LIMIT ?`
      : `SELECT * FROM call_history ORDER BY timestamp DESC`;
    const rows = limit
      ? (this.db.prepare(query).all(limit) as Record<string, unknown>[])
      : (this.db.prepare(query).all() as Record<string, unknown>[]);
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider_id,
      model: row.model_id,
      tokens: row.tokens,
      latencyMs: row.latency_ms,
      success: row.success,
      errorMessage: row.error_message,
      timestamp: row.timestamp,
    }));
  }

  // ============================================================
  // User Preferences
  // ============================================================

  setPreference(
    userId: string,
    category: string,
    key: string,
    value: string,
    confidence?: number,
    source?: string
  ): void {
    const ts = now();
    const id = generateUUIDv7();
    this.db.prepare(
      `INSERT INTO user_preferences (id, user_id, category, key, value, confidence, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, category, key, value, confidence ?? 0.5, source || null, ts, ts);
  }

  getPreferences(userId: string, category?: string): any[] {
    const query = category
      ? `SELECT * FROM user_preferences WHERE user_id = ? AND category = ? ORDER BY updated_at DESC`
      : `SELECT * FROM user_preferences WHERE user_id = ? ORDER BY updated_at DESC`;
    const rows = category
      ? (this.db.prepare(query).all(userId, category) as Record<string, unknown>[])
      : (this.db.prepare(query).all(userId) as Record<string, unknown>[]);
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      key: row.key,
      value: row.value,
      confidence: row.confidence,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  deletePreference(id: string): void {
    this.db.prepare(`DELETE FROM user_preferences WHERE id = ?`).run(id);
  }

  // ============================================================
  // Time Series
  // ============================================================

  insertTimeSeries(metric: string, value: number, tags?: Record<string, string>): void {
    const ts = now();
    const id = generateUUIDv7();
    this.db.prepare(
      `INSERT INTO time_series_data (id, metric, value, timestamp, tags) VALUES (?, ?, ?, ?, ?)`
    ).run(id, metric, value, ts, tags ? JSON.stringify(tags) : '{}');
  }

  queryTimeSeries(
    metric: string,
    startTime: number,
    endTime: number
  ): { timestamp: number; value: number; tags: Record<string, string> }[] {
    const rows = this.db.prepare(
      `SELECT * FROM time_series_data WHERE metric = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`
    ).all(metric, startTime, endTime) as Record<string, unknown>[];
    return rows.map((row) => ({
      timestamp: row.timestamp as number,
      value: row.value as number,
      tags: JSON.parse(row.tags as string),
    }));
  }

  // ============================================================
  // Feedback
  // ============================================================

  createFeedback(feedback: {
    id: string;
    messageId: string;
    conversationId: string;
    userId: string;
    rating: string;
    reason?: string;
    errorInfo?: string;
    includeContext?: number;
    originalQuestion?: string;
    originalAnswer?: string;
    contextMessages?: string;
    logTraceId?: string;
    relatedLogs?: string;
  }): void {
    const ts = now();
    this.db.prepare(
      `INSERT INTO feedback (id, message_id, conversation_id, user_id, rating, reason, error_info,
        include_context, original_question, original_answer, context_messages, log_trace_id,
        related_logs, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(
      feedback.id,
      feedback.messageId,
      feedback.conversationId,
      feedback.userId,
      feedback.rating,
      feedback.reason || null,
      feedback.errorInfo || null,
      feedback.includeContext ?? 1,
      feedback.originalQuestion || null,
      feedback.originalAnswer || null,
      feedback.contextMessages || null,
      feedback.logTraceId || null,
      feedback.relatedLogs || null,
      ts,
      ts
    );
  }

  updateFeedback(id: string, updates: {
    reason?: string;
    errorInfo?: string;
    relatedLogs?: string;
  }): void {
    const ts = now();
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.reason !== undefined) {
      setClauses.push('reason = ?');
      params.push(updates.reason);
    }
    if (updates.errorInfo !== undefined) {
      setClauses.push('error_info = ?');
      params.push(updates.errorInfo);
    }
    if (updates.relatedLogs !== undefined) {
      setClauses.push('related_logs = ?');
      params.push(updates.relatedLogs);
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      params.push(ts);
      params.push(id);
      this.db.prepare(`UPDATE feedback SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
    }
  }

  getFeedback(id: string): any {
    const row = this.db.prepare(`SELECT * FROM feedback WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      messageId: row.message_id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      rating: row.rating,
      reason: row.reason,
      errorInfo: row.error_info ? JSON.parse(row.error_info as string) : undefined,
      includeContext: row.include_context,
      originalQuestion: row.original_question,
      originalAnswer: row.original_answer,
      contextMessages: row.context_messages ? JSON.parse(row.context_messages as string) : undefined,
      logTraceId: row.log_trace_id,
      relatedLogs: row.related_logs ? JSON.parse(row.related_logs as string) : undefined,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listFeedback(filters?: { status?: string; rating?: string; start?: number; end?: number }): any[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.rating) {
      conditions.push('rating = ?');
      params.push(filters.rating);
    }
    if (filters?.start !== undefined) {
      conditions.push('created_at >= ?');
      params.push(filters.start);
    }
    if (filters?.end !== undefined) {
      conditions.push('created_at <= ?');
      params.push(filters.end);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(
      `SELECT * FROM feedback ${where} ORDER BY created_at DESC`
    ).all(...params) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id,
      messageId: row.message_id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      rating: row.rating,
      reason: row.reason,
      errorInfo: row.error_info ? JSON.parse(row.error_info as string) : undefined,
      includeContext: row.include_context,
      originalQuestion: row.original_question,
      originalAnswer: row.original_answer,
      contextMessages: row.context_messages ? JSON.parse(row.context_messages as string) : undefined,
      logTraceId: row.log_trace_id,
      relatedLogs: row.related_logs ? JSON.parse(row.related_logs as string) : undefined,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  updateFeedbackStatus(id: string, status: string): void {
    const ts = now();
    this.db.prepare(`UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?`).run(status, ts, id);
  }

  // ============================================================
  // Skills
  // ============================================================

  createSkill(skill: {
    id: string;
    name: string;
    description?: string;
    mode: string;
    userInput?: string;
    userOutput?: string;
    userProcess?: string;
    normalizedSpec?: string;
    manualContent?: string;
    review?: string;
    enabled?: number;
  }): void {
    const ts = now();
    this.db.prepare(
      `INSERT INTO skills (id, name, description, mode, user_input, user_output, user_process,
        normalized_spec, manual_content, review, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      skill.id,
      skill.name,
      skill.description || '',
      skill.mode,
      skill.userInput || null,
      skill.userOutput || null,
      skill.userProcess || null,
      skill.normalizedSpec || null,
      skill.manualContent || null,
      skill.review || null,
      skill.enabled ?? 1,
      ts,
      ts
    );
  }

  getSkill(id: string): any {
    const row = this.db.prepare(`SELECT * FROM skills WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      mode: row.mode,
      userInput: row.user_input,
      userOutput: row.user_output,
      userProcess: row.user_process,
      normalizedSpec: row.normalized_spec ? JSON.parse(row.normalized_spec as string) : null,
      manualContent: row.manual_content,
      review: row.review ? JSON.parse(row.review as string) : null,
      active: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listSkills(search?: string, status?: string): any[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }
    if (status !== undefined) {
      conditions.push('enabled = ?');
      params.push(status === 'active' ? 1 : 0);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(
      `SELECT * FROM skills ${where} ORDER BY created_at DESC`
    ).all(...params) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      mode: row.mode,
      userInput: row.user_input,
      userOutput: row.user_output,
      userProcess: row.user_process,
      normalizedSpec: row.normalized_spec ? JSON.parse(row.normalized_spec as string) : null,
      manualContent: row.manual_content,
      review: row.review ? JSON.parse(row.review as string) : null,
      active: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  updateSkill(id: string, updates: Record<string, unknown>): void {
    const ts = now();
    const setClauses: string[] = [];
    const params: unknown[] = [];

    const columnMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      mode: 'mode',
      userInput: 'user_input',
      userOutput: 'user_output',
      userProcess: 'user_process',
      normalizedSpec: 'normalized_spec',
      manualContent: 'manual_content',
      review: 'review',
      active: 'active',
    };

    for (const [key, value] of Object.entries(updates)) {
      const col = columnMap[key];
      if (col) {
        setClauses.push(`${col} = ?`);
        if (key === 'normalizedSpec' || key === 'review') {
          params.push(typeof value === 'string' ? value : JSON.stringify(value));
        } else {
          params.push(value);
        }
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      params.push(ts);
      params.push(id);
      this.db.prepare(`UPDATE skills SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
    }
  }

  deleteSkill(id: string): void {
    this.db.prepare(`DELETE FROM skills WHERE id = ?`).run(id);
  }

  toggleSkill(id: string): void {
    const ts = now();
    this.db.prepare(
      `UPDATE skills SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?`
    ).run(ts, id);
  }

  // ============================================================
  // Custom Agents
  // ============================================================

  createAgent(agent: {
    id: string;
    name: string;
    role: string;
    description?: string;
    strategy?: string;
    capabilities?: string;
    infra?: string;
    active?: number;
  }): void {
    const ts = Date.now();
    this.db.prepare(
      `INSERT INTO custom_agents (id, name, role, description, strategy, llm_config, prompt, skills, mcp_endpoints, soul, sources, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      agent.id,
      agent.name,
      agent.role,
      agent.description || '',
      agent.strategy || '{}',
      '{}',
      '{}',
      '[]',
      '[]',
      '{}',
      '{}',
      agent.active ?? 1,
      ts,
      ts
    );
  }

  getAgent(id: string): any {
    const row = this.db.prepare(`SELECT * FROM custom_agents WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      description: row.description,
      strategy: JSON.parse(row.strategy as string),
      llmConfig: JSON.parse(row.llm_config as string),
      prompt: JSON.parse(row.prompt as string),
      skills: JSON.parse(row.skills as string),
      mcpEndpoints: JSON.parse(row.mcp_endpoints as string),
      soul: JSON.parse(row.soul as string),
      sources: JSON.parse(row.sources as string),
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listAgents(search?: string): any[] {
    const query = search
      ? `SELECT * FROM custom_agents WHERE name LIKE ? OR description LIKE ? OR role LIKE ? ORDER BY created_at DESC`
      : `SELECT * FROM custom_agents ORDER BY created_at DESC`;
    const pattern = search ? `%${search}%` : '';
    const rows = search
      ? (this.db.prepare(query).all(pattern, pattern, pattern) as Record<string, unknown>[])
      : (this.db.prepare(query).all() as Record<string, unknown>[]);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      description: row.description,
      strategy: JSON.parse(row.strategy as string),
      llmConfig: JSON.parse(row.llm_config as string),
      prompt: JSON.parse(row.prompt as string),
      skills: JSON.parse(row.skills as string),
      mcpEndpoints: JSON.parse(row.mcp_endpoints as string),
      soul: JSON.parse(row.soul as string),
      sources: JSON.parse(row.sources as string),
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  updateAgent(id: string, updates: Record<string, unknown>): void {
    const ts = Date.now();
    const setClauses: string[] = [];
    const params: unknown[] = [];

    const columnMap: Record<string, string> = {
      name: 'name',
      role: 'role',
      description: 'description',
      strategy: 'strategy',
      llmConfig: 'llm_config',
      prompt: 'prompt',
      skills: 'skills',
      mcpEndpoints: 'mcp_endpoints',
      soul: 'soul',
      sources: 'sources',
      active: 'active',
    };

    for (const [key, value] of Object.entries(updates)) {
      const col = columnMap[key];
      if (col) {
        setClauses.push(`${col} = ?`);
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      params.push(ts);
      params.push(id);
      this.db.prepare(`UPDATE custom_agents SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
    }
  }

  deleteAgent(id: string): void {
    this.db.prepare(`DELETE FROM custom_agents WHERE id = ?`).run(id);
  }

  toggleAgent(id: string): void {
    const ts = Date.now();
    this.db.prepare(
      `UPDATE custom_agents SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?`
    ).run(ts, id);
  }

  // ============================================================
  // MCP Installed
  // ============================================================

  createMcpInstalled(mcp: {
    id: string;
    packageName: string;
    displayName?: string;
    version?: string;
    toolsJson?: string;
    active?: number;
  }): void {
    const ts = Date.now();
    this.db.prepare(
      `INSERT INTO mcp_installed (id, package_name, display_name, version, tools, active, server_status, installed_at)
       VALUES (?, ?, ?, ?, ?, ?, 'stopped', ?)`
    ).run(
      mcp.id,
      mcp.packageName,
      mcp.displayName || mcp.packageName,
      mcp.version || '0.0.0',
      mcp.toolsJson || '[]',
      mcp.active ?? 1,
      ts
    );
  }

  getMcpInstalled(id: string): any {
    const row = this.db.prepare(`SELECT * FROM mcp_installed WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      packageName: row.package_name,
      displayName: row.display_name,
      version: row.version,
      tools: JSON.parse(row.tools as string),
      active: row.active,
      serverStatus: row.server_status,
      installedAt: row.installed_at,
    };
  }

  listMcpInstalled(): any[] {
    const rows = this.db.prepare(`SELECT * FROM mcp_installed ORDER BY installed_at DESC`).all() as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id,
      packageName: row.package_name,
      displayName: row.display_name,
      version: row.version,
      tools: JSON.parse(row.tools as string),
      active: row.active,
      serverStatus: row.server_status,
      installedAt: row.installed_at,
    }));
  }

  deleteMcpInstalled(id: string): void {
    this.db.prepare(`DELETE FROM mcp_installed WHERE id = ?`).run(id);
  }

  // ============================================================
  // Library Paths
  // ============================================================

  createLibraryPath(path: string): { id: string } {
    const ts = now();
    const id = generateUUIDv7();
    this.db.prepare(
      `INSERT INTO library_paths (id, name, path, category, description, metadata, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', '{}', 1, ?, ?)`
    ).run(id, path, path, 'general', ts, ts);
    return { id };
  }

  listLibraryPaths(): any[] {
    const rows = this.db.prepare(
      `SELECT * FROM library_paths WHERE active = 1 ORDER BY created_at DESC`
    ).all() as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      path: row.path,
      category: row.category,
      description: row.description,
      metadata: JSON.parse(row.metadata as string),
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  deleteLibraryPath(id: string): void {
    this.db.prepare(`DELETE FROM library_paths WHERE id = ?`).run(id);
  }

  checkPathExists(path: string): boolean {
    const row = this.db.prepare(
      `SELECT COUNT(*) as count FROM library_paths WHERE path = ? AND active = 1`
    ).get(path) as { count: number };
    return row.count > 0;
  }

  // ============================================================
  // Agent Library (Meta-Agent)
  // ============================================================

  createAgentLibraryEntry(entry: {
    id: string;
    name: string;
    taskFeatures: string;
    strategy: string;
    llmConfig: string;
    promptConfig: string;
    skills: string;
    mcpEndpoints: string;
    soul: string;
    strength: number;
    useCount: number;
    reliability: number;
  }): void {
    const ts = now();
    this.db.prepare(
      `INSERT INTO agent_library (id, name, task_features, strategy, llm_config, prompt, skills, mcp_endpoints,
        soul, strength, use_count, last_used_at, feedback_history, reliability, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, ?)`
    ).run(
      entry.id,
      entry.name,
      entry.taskFeatures,
      entry.strategy,
      entry.llmConfig,
      entry.promptConfig,
      entry.skills,
      entry.mcpEndpoints,
      entry.soul,
      entry.strength,
      entry.useCount,
      entry.reliability,
      ts,
      ts
    );
  }

  getAgentLibraryEntry(id: string): any {
    const row = this.db.prepare(`SELECT * FROM agent_library WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      taskFeatures: JSON.parse(row.task_features as string),
      strategy: row.strategy,
      llmConfig: JSON.parse(row.llm_config as string),
      prompt: JSON.parse(row.prompt as string),
      skills: JSON.parse(row.skills as string),
      mcpEndpoints: JSON.parse(row.mcp_endpoints as string),
      soul: JSON.parse(row.soul as string),
      strength: row.strength,
      useCount: row.use_count,
      lastUsedAt: row.last_used_at,
      feedbackHistory: JSON.parse(row.feedback_history as string),
      reliability: row.reliability,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listAgentLibrary(): any[] {
    const rows = this.db.prepare(
      `SELECT * FROM agent_library ORDER BY strength DESC, use_count DESC`
    ).all() as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      taskFeatures: JSON.parse(row.task_features as string),
      strategy: row.strategy,
      llmConfig: JSON.parse(row.llm_config as string),
      prompt: JSON.parse(row.prompt as string),
      skills: JSON.parse(row.skills as string),
      mcpEndpoints: JSON.parse(row.mcp_endpoints as string),
      soul: JSON.parse(row.soul as string),
      strength: row.strength,
      useCount: row.use_count,
      lastUsedAt: row.last_used_at,
      feedbackHistory: JSON.parse(row.feedback_history as string),
      reliability: row.reliability,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  updateAgentLibraryEntry(id: string, updates: Record<string, unknown>): void {
    const ts = now();
    const setClauses: string[] = [];
    const params: unknown[] = [];

    const columnMap: Record<string, string> = {
      name: 'name',
      taskFeatures: 'task_features',
      strategy: 'strategy',
      llmConfig: 'llm_config',
      promptConfig: 'prompt',
      skills: 'skills',
      mcpEndpoints: 'mcp_endpoints',
      soul: 'soul',
      strength: 'strength',
      useCount: 'use_count',
      reliability: 'reliability',
    };

    for (const [key, value] of Object.entries(updates)) {
      const col = columnMap[key];
      if (col) {
        setClauses.push(`${col} = ?`);
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      params.push(ts);
      params.push(id);
      this.db.prepare(`UPDATE agent_library SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
    }
  }

  deleteAgentLibraryEntry(id: string): void {
    this.db.prepare(`DELETE FROM agent_library WHERE id = ?`).run(id);
  }

  // ============================================================
  // Agent-MCP Association
  // ============================================================

  createAgentMcp(agentId: string, mcpId: string): void {
    const id = generateUUIDv7();
    this.db.prepare(
      `INSERT OR IGNORE INTO agent_mcp (id, agent_id, mcp_id) VALUES (?, ?, ?)`
    ).run(id, agentId, mcpId);
  }

  deleteAgentMcp(agentId: string, mcpId: string): void {
    this.db.prepare(`DELETE FROM agent_mcp WHERE agent_id = ? AND mcp_id = ?`).run(agentId, mcpId);
  }

  deleteAllAgentMcps(agentId: string): void {
    this.db.prepare(`DELETE FROM agent_mcp WHERE agent_id = ?`).run(agentId);
  }

  getAgentMcpIds(agentId: string): string[] {
    const rows = this.db.prepare(`SELECT mcp_id FROM agent_mcp WHERE agent_id = ?`).all(agentId) as Record<string, unknown>[];
    return rows.map(row => String(row.mcp_id));
  }

  getAgentMcpDetails(agentId: string): any[] {
    const rows = this.db.prepare(
      `SELECT mi.* FROM agent_mcp am JOIN mcp_installed mi ON am.mcp_id = mi.id WHERE am.agent_id = ?`
    ).all(agentId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id,
      packageName: row.package_name,
      displayName: row.display_name,
      version: row.version,
      tools: JSON.parse(row.tools as string),
      active: row.active,
      serverStatus: row.server_status,
      installedAt: row.installed_at,
    }));
  }
}