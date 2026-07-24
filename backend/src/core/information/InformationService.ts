import { z } from 'zod';
import { DBWrapper } from '../../base/DBWrapper';
import { EmbeddingRequest, EmbeddingResponse } from '../../base/LLMWrapper';
import { LLMService } from '../llm/LLMService';
import { logger } from '../../infrastructure/logger';

export const MemoryTypeSchema = z.enum(['working', 'episodic', 'semantic', 'procedural', 'tag_neural', 'random', 'user_profile', 'knowledge_base']);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const UserMessageSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  exchangeId: z.string(),
  msgId: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  summary: z.string().default(''),
  tokens: z.number().default(0),
  embeddingId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).default([]),
  isLearningMemory: z.boolean().default(false),
  messageIndex: z.number(),
  referenceCount: z.number().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type UserMessage = z.infer<typeof UserMessageSchema>;

export const MemoryNodeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  content: z.string(),
  type: MemoryTypeSchema,
  source: z.string(),
  tags: z.array(z.string()).default([]),
  confidence: z.number().default(0.8),
  importance: z.number().default(0.5),
  embedding: z.array(z.number()).default([]),
  embeddingId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
  accessedAt: z.number(),
  accessCount: z.number().default(0),
  isLearningMemory: z.boolean().default(false),
  relatedNodeIds: z.array(z.string()).default([]),
});

export type MemoryNode = z.infer<typeof MemoryNodeSchema>;

export const MemoryRatioConfigSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workingMemory: z.number().default(0.35),
  tagNeuralMemory: z.number().default(0.40),
  semanticMemory: z.number().default(0.15),
  episodicMemory: z.number().default(0.15),
  proceduralMemory: z.number().default(0.10),
  randomMemory: z.number().default(0.20),
  userProfileMemory: z.number().default(0.05),
  knowledgeBaseMemory: z.number().default(0.15),
  contextWindowTokens: z.number().default(8192),
  contextWindowMessages: z.number().default(50),
  updatedAt: z.number(),
});

export type MemoryRatioConfig = z.infer<typeof MemoryRatioConfigSchema>;

export class InformationService {
  constructor(private db: DBWrapper, private llmService: LLMService) {}

  async saveMessage(message: Omit<UserMessage, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserMessage> {
    const id = require('uuid').v4();
    const now = Date.now();
    const msg: UserMessage = {
      ...message,
      id,
      createdAt: now,
      updatedAt: now,
    };

    logger.info('InformationService', `[saveMessage] ====== START ====== id=${id} userId=${msg.userId} sessionId=${msg.sessionId} exchangeId=${msg.exchangeId}`);
    logger.info('InformationService', `[saveMessage] role=${msg.role} contentLen=${msg.content.length} tokens=${msg.tokens} messageIndex=${msg.messageIndex}`);
    logger.info('InformationService', `[saveMessage] hasEmbeddingId=${!!msg.embeddingId} isLearningMemory=${msg.isLearningMemory} referenceCount=${msg.referenceCount}`);

    try {
      logger.info('InformationService', `[saveMessage] inserting into user_messages table...`);
      await this.db.run(`
        INSERT INTO user_messages (id, user_id, session_id, exchange_id, msg_id, role, content, summary, tokens, embedding_id, metadata, tags, is_learning_memory, message_index, reference_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        msg.id,
        msg.userId,
        msg.sessionId,
        msg.exchangeId,
        msg.msgId,
        msg.role,
        msg.content,
        msg.summary,
        msg.tokens,
        msg.embeddingId || null,
        JSON.stringify(msg.metadata || {}),
        JSON.stringify(msg.tags),
        msg.isLearningMemory ? 1 : 0,
        msg.messageIndex,
        msg.referenceCount,
        msg.createdAt,
        msg.updatedAt,
      ]);
      logger.info('InformationService', `[saveMessage] user_messages insert completed successfully`);
    } catch (e: any) {
      logger.info('InformationService', `[saveMessage] FAILED to insert into user_messages: ${e.message || e}`);
      logger.info('InformationService', `[saveMessage] Error details: id=${msg.id} userId=${msg.userId} sessionId=${msg.sessionId} role=${msg.role}`);
      throw e;
    }

    if (message.tags && message.tags.length > 0) {
      logger.info('InformationService', `[saveMessage] inserting ${message.tags.length} keywords into user_message_keyword table...`);
      for (const keyword of message.tags) {
        try {
          await this.db.run(`
            INSERT OR IGNORE INTO user_message_keyword (id, msg_id, keyword, created_at)
            VALUES (?, ?, ?, ?)
          `, [require('uuid').v4(), msg.id, keyword, now]);
        } catch (e: any) {
          logger.info('InformationService', `[saveMessage] FAILED to insert keyword '${keyword}': ${e.message || e}`);
        }
      }
      logger.info('InformationService', `[saveMessage] keywords insertion completed`);
    }

    logger.info('InformationService', `[saveMessage] ====== END ====== id=${id}`);
    return msg;
  }

  async getMessage(id: string): Promise<UserMessage | undefined> {
    const row = await this.db.get<any>('SELECT * FROM user_messages WHERE id = ?', [id]);
    return row ? this.mapRowToUserMessage(row) : undefined;
  }

  async getMessagesByChat(sessionId: string, userId?: string): Promise<UserMessage[]> {
    if (userId) {
      const rows = await this.db.query<any>(
        'SELECT * FROM user_messages WHERE session_id = ? AND user_id = ? ORDER BY message_index ASC',
        [sessionId, userId]
      );
      return rows.map(row => this.mapRowToUserMessage(row));
    }
    const rows = await this.db.query<any>(
      'SELECT * FROM user_messages WHERE session_id = ? ORDER BY message_index ASC',
      [sessionId]
    );
    return rows.map(row => this.mapRowToUserMessage(row));
  }

  async getAllMessagesByUser(userId: string): Promise<UserMessage[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM user_messages WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(row => this.mapRowToUserMessage(row));
  }

  async getWorkingMemory(userId: string, sessionId: string, limit: number = 50): Promise<UserMessage[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM user_messages WHERE user_id = ? AND session_id = ? AND is_learning_memory = 0 ORDER BY created_at DESC LIMIT ?',
      [userId, sessionId, limit]
    );
    return rows.map(row => this.mapRowToUserMessage(row));
  }

  async searchByKeywords(userId: string, query: string): Promise<UserMessage[]> {
    const rows = await this.db.query<any>(`
      SELECT um.* FROM user_messages um
      JOIN user_messages_fts fts ON um.rowid = fts.rowid
      WHERE um.user_id = ? AND user_messages_fts MATCH ?
      AND um.is_learning_memory = 0
      ORDER BY rank
    `, [userId, query]);
    return rows.map(row => this.mapRowToUserMessage(row));
  }

  async getExchangesBySession(sessionId: string, userId: string): Promise<{
    exchangeId: string;
    userMessage: UserMessage | null;
    assistantMessage: UserMessage | null;
    messageCount: number;
    firstMessageAt: number;
    lastMessageAt: number;
  }[]> {
    logger.info('InformationService', `[getExchangesBySession] sessionId=${sessionId} userId=${userId}`);
    const rows = await this.db.query<any>(`
      SELECT
        exchange_id,
        COUNT(*) as message_count,
        MIN(created_at) as first_message_at,
        MAX(created_at) as last_message_at
      FROM user_messages
      WHERE session_id = ? AND user_id = ? AND is_learning_memory = 0
      GROUP BY exchange_id
      ORDER BY first_message_at ASC
    `, [sessionId, userId]);

    const exchanges = await Promise.all(rows.map(async (row: any) => {
      const messages = (await this.db.query<any>(
        'SELECT * FROM user_messages WHERE exchange_id = ? AND is_learning_memory = 0 ORDER BY message_index ASC',
        [row.exchange_id]
      )).map((r: any) => this.mapRowToUserMessage(r));
      const userMsg = messages.find(m => m.role === 'user') || null;
      const assistantMsg = messages.find(m => m.role === 'assistant') || null;
      return {
        exchangeId: row.exchange_id,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        messageCount: row.message_count,
        firstMessageAt: row.first_message_at,
        lastMessageAt: row.last_message_at,
      };
    }));

    logger.info('InformationService', `[getExchangesBySession] returned ${exchanges.length} exchanges`);
    return exchanges;
  }

  async searchMessages(userId: string, query: string, limit: number = 20): Promise<UserMessage[]> {
    logger.info('InformationService', `[searchMessages] userId=${userId} query="${query}" limit=${limit}`);
    const results = await this.db.query<any>(`
      SELECT um.* FROM user_messages um
      JOIN user_messages_fts fts ON um.rowid = fts.rowid
      WHERE um.user_id = ? AND user_messages_fts MATCH ?
      AND um.is_learning_memory = 0
      ORDER BY rank
      LIMIT ?
    `, [userId, query, limit]);
    logger.info('InformationService', `[searchMessages] found ${results.length} results`);
    return results.map(row => this.mapRowToUserMessage(row));
  }

  async incrementReferenceCount(msgId: string): Promise<void> {
    await this.db.run(
      'UPDATE user_messages SET reference_count = reference_count + 1, updated_at = ? WHERE msg_id = ?',
      [Date.now(), msgId]
    );
  }

  async getExchangeIdsByMsgIds(msgIds: string[]): Promise<Map<string, string>> {
    if (msgIds.length === 0) return new Map();
    const placeholders = msgIds.map(() => '?').join(',');
    const rows = await this.db.query<{ msg_id: string; exchange_id: string }>(
      `SELECT msg_id, exchange_id FROM user_messages WHERE msg_id IN (${placeholders})`,
      msgIds
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.msg_id, row.exchange_id);
    }
    return map;
  }

  // ── message_references 数据访问（薄方法，业务逻辑在 application 层）──

  async saveReferences(sessionId: string, msgId: string, referencedMsgIds: string[]): Promise<void> {
    const now = Date.now();
    for (const referencedMsgId of referencedMsgIds) {
      await this.db.run(
        'INSERT OR IGNORE INTO message_references (id, session_id, msg_id, referenced_msg_id, created_at) VALUES (?, ?, ?, ?, ?)',
        [require('uuid').v4(), sessionId, msgId, referencedMsgId, now]
      );
    }
  }

  async getReferencesBySession(sessionId: string): Promise<{ msgId: string; referencedMsgId: string }[]> {
    const rows = await this.db.query<{ msg_id: string; referenced_msg_id: string }>(
      'SELECT msg_id, referenced_msg_id FROM message_references WHERE session_id = ?',
      [sessionId]
    );
    return rows.map(r => ({ msgId: r.msg_id, referencedMsgId: r.referenced_msg_id }));
  }

  async getMessageByMsgId(msgId: string): Promise<UserMessage | undefined> {
    const row = await this.db.get<any>('SELECT * FROM user_messages WHERE msg_id = ?', [msgId]);
    return row ? this.mapRowToUserMessage(row) : undefined;
  }

  async getMessagesByMsgIds(msgIds: string[]): Promise<UserMessage[]> {
    if (msgIds.length === 0) return [];
    const placeholders = msgIds.map(() => '?').join(',');
    const rows = await this.db.query<any>(
      `SELECT * FROM user_messages WHERE msg_id IN (${placeholders}) AND is_learning_memory = 0`,
      msgIds
    );
    return rows.map(row => this.mapRowToUserMessage(row));
  }

  async updateMessageSummary(msgId: string, summary: string): Promise<void> {
    await this.db.run(
      'UPDATE user_messages SET summary = ?, updated_at = ? WHERE msg_id = ?',
      [summary, Date.now(), msgId]
    );
  }

  async getMessagesNeedingSummary(limit: number = 200): Promise<UserMessage[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM user_messages WHERE is_learning_memory = 0 AND (summary = '' OR length(summary) > 20) ORDER BY created_at ASC LIMIT ?`,
      [limit]
    );
    return rows.map(row => this.mapRowToUserMessage(row));
  }

  async saveAgentChain(sessionId: string, exchangeId: string, chain: any[]): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO exchange_agent_chains (exchange_id, session_id, chain_json, created_at) VALUES (?, ?, ?, ?)`,
      [exchangeId, sessionId, JSON.stringify(chain), Date.now()]
    );
  }

  async getAgentChain(exchangeId: string): Promise<any[] | null> {
    const row = await this.db.get<{ chain_json: string }>(
      'SELECT chain_json FROM exchange_agent_chains WHERE exchange_id = ?',
      [exchangeId]
    );
    if (!row) return null;
    try {
      return JSON.parse(row.chain_json);
    } catch {
      return null;
    }
  }

  async searchByEmbedding(userId: string, embedding: number[], topK: number = 10): Promise<UserMessage[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM user_messages WHERE user_id = ? AND is_learning_memory = 0 ORDER BY created_at DESC LIMIT ?',
      [userId, topK]
    );
    return rows.map(row => this.mapRowToUserMessage(row));
  }

  async generateEmbedding(content: string): Promise<number[]> {
    const request: EmbeddingRequest = {
      model: 'text-embedding-3-small',
      input: content,
    };

    try {
      const response = await this.llmService.generateEmbedding(request);
      return response.data[0]?.embedding || [];
    } catch {
      return [];
    }
  }

  async getMemoryRatioConfig(userId: string): Promise<MemoryRatioConfig> {
    const existing = await this.db.get<MemoryRatioConfig>('SELECT * FROM memory_ratio_config WHERE user_id = ?', [userId]);
    if (existing) return existing;

    const id = require('uuid').v4();
    const config: MemoryRatioConfig = {
      id,
      userId,
      workingMemory: 0.35,
      tagNeuralMemory: 0.40,
      semanticMemory: 0.15,
      episodicMemory: 0.15,
      proceduralMemory: 0.10,
      randomMemory: 0.20,
      userProfileMemory: 0.05,
      knowledgeBaseMemory: 0.15,
      contextWindowTokens: 8192,
      contextWindowMessages: 50,
      updatedAt: Date.now(),
    };

    await this.db.run(`
      INSERT INTO memory_ratio_config (id, user_id, working_memory, tag_neural_memory, semantic_memory, episodic_memory, procedural_memory, random_memory, user_profile_memory, knowledge_base_memory, context_window_tokens, context_window_messages, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      config.id,
      config.userId,
      config.workingMemory,
      config.tagNeuralMemory,
      config.semanticMemory,
      config.episodicMemory,
      config.proceduralMemory,
      config.randomMemory,
      config.userProfileMemory,
      config.knowledgeBaseMemory,
      config.contextWindowTokens,
      config.contextWindowMessages,
      config.updatedAt,
    ]);

    return config;
  }

  async updateMemoryRatioConfig(userId: string, updates: Partial<MemoryRatioConfig>): Promise<MemoryRatioConfig> {
    const existing = await this.getMemoryRatioConfig(userId);
    const updated: MemoryRatioConfig = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.run(`
      UPDATE memory_ratio_config
      SET working_memory = ?, tag_neural_memory = ?, semantic_memory = ?, episodic_memory = ?, procedural_memory = ?, random_memory = ?, user_profile_memory = ?, knowledge_base_memory = ?, context_window_tokens = ?, context_window_messages = ?, updated_at = ?
      WHERE user_id = ?
    `, [
      updated.workingMemory,
      updated.tagNeuralMemory,
      updated.semanticMemory,
      updated.episodicMemory,
      updated.proceduralMemory,
      updated.randomMemory,
      updated.userProfileMemory,
      updated.knowledgeBaseMemory,
      updated.contextWindowTokens,
      updated.contextWindowMessages,
      updated.updatedAt,
      userId,
    ]);

    return updated;
  }

  async getSelectedMessages(userId: string, messageIds: string[]): Promise<UserMessage[]> {
    if (messageIds.length === 0) return [];

    const placeholders = messageIds.map(() => '?').join(',');
    const rows = await this.db.query<any>(
      `SELECT * FROM user_messages WHERE user_id = ? AND id IN (${placeholders}) AND is_learning_memory = 0`,
      [userId, ...messageIds]
    );
    return rows.map(row => this.mapRowToUserMessage(row));
  }

  async saveMemory(memory: MemoryNode): Promise<MemoryNode> {
    logger.info('InformationService', `[saveMemory] id=${memory.id} userId=${memory.userId} type=${memory.type} source=${memory.source} confidence=${memory.confidence} importance=${memory.importance} isLearning=${memory.isLearningMemory}`);

    await this.db.run(`
      INSERT INTO memory_nodes (id, user_id, content, type, source, tags, confidence, importance, embedding, embedding_id, metadata, created_at, updated_at, accessed_at, access_count, is_learning_memory, related_node_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      memory.id,
      memory.userId,
      memory.content,
      memory.type,
      memory.source,
      JSON.stringify(memory.tags || []),
      memory.confidence,
      memory.importance,
      JSON.stringify(memory.embedding || []),
      memory.embeddingId || null,
      JSON.stringify(memory.metadata || {}),
      memory.createdAt,
      memory.updatedAt,
      memory.accessedAt,
      memory.accessCount,
      memory.isLearningMemory ? 1 : 0,
      JSON.stringify(memory.relatedNodeIds || []),
    ]);

    return memory;
  }

  async getMemory(id: string): Promise<MemoryNode | undefined> {
    const row = await this.db.get<any>('SELECT * FROM memory_nodes WHERE id = ?', [id]);
    if (!row) return undefined;
    return this.mapRowToMemoryNode(row);
  }

  async getMemoriesByType(userId: string, type: MemoryType, limit: number = 50, includeLearning: boolean = false): Promise<MemoryNode[]> {
    let query = 'SELECT * FROM memory_nodes WHERE user_id = ? AND type = ?';
    const params: any[] = [userId, type];

    if (!includeLearning) {
      query += ' AND is_learning_memory = 0';
    }

    query += ' ORDER BY importance DESC, created_at DESC LIMIT ?';
    params.push(limit);

    const rows = await this.db.query<any>(query, params);
    return rows.map(this.mapRowToMemoryNode);
  }

  async searchMemories(userId: string, query: string, type?: MemoryType, limit: number = 20, includeLearning: boolean = false): Promise<MemoryNode[]> {
    let sql = 'SELECT * FROM memory_nodes WHERE user_id = ?';
    const params: any[] = [userId];

    if (!includeLearning) {
      sql += ' AND is_learning_memory = 0';
    }

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' AND (content LIKE ? OR tags LIKE ?)';
    params.push(`%${query}%`, `%${query}%`);

    sql += ' ORDER BY importance DESC LIMIT ?';
    params.push(limit);

    const rows = await this.db.query<any>(sql, params);
    return rows.map(this.mapRowToMemoryNode);
  }

  async updateMemory(id: string, updates: Partial<MemoryNode>): Promise<MemoryNode | undefined> {
    const existing = await this.getMemory(id);
    if (!existing) return undefined;

    const updated: MemoryNode = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.db.run(`
      UPDATE memory_nodes
      SET content = ?, type = ?, tags = ?, confidence = ?, importance = ?, metadata = ?, updated_at = ?, is_learning_memory = ?, related_node_ids = ?
      WHERE id = ?
    `, [
      updated.content,
      updated.type,
      JSON.stringify(updated.tags),
      updated.confidence,
      updated.importance,
      JSON.stringify(updated.metadata),
      updated.updatedAt,
      updated.isLearningMemory ? 1 : 0,
      JSON.stringify(updated.relatedNodeIds),
      id,
    ]);

    return updated;
  }

  async deleteMemory(id: string): Promise<void> {
    await this.db.run('DELETE FROM memory_nodes WHERE id = ?', [id]);
  }

  async incrementMemoryAccess(id: string): Promise<void> {
    await this.db.run(`
      UPDATE memory_nodes
      SET access_count = access_count + 1, accessed_at = ?
      WHERE id = ?
    `, [Date.now(), id]);
  }

  // ============================================================
  // 路由兼容方法：为 memoryRoutes 提供简洁的 API
  // ============================================================

  async getSemanticMemory(userId: string, query?: string, limit: number = 10): Promise<MemoryNode[]> {
    if (query) {
      return this.searchMemories(userId, query, 'semantic', limit);
    }
    return this.getMemoriesByType(userId, 'semantic', limit);
  }

  async getEpisodicMemory(userId: string, limit: number = 10): Promise<MemoryNode[]> {
    return this.getMemoriesByType(userId, 'episodic', limit);
  }

  async getProceduralMemory(userId: string, limit: number = 10): Promise<MemoryNode[]> {
    return this.getMemoriesByType(userId, 'procedural', limit);
  }

  async getMemoryByTag(userId: string, tag: string): Promise<MemoryNode[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM memory_nodes WHERE user_id = ? AND tags LIKE ? ORDER BY importance DESC, created_at DESC',
      [userId, `%"${tag}"%`]
    );
    return rows.map(this.mapRowToMemoryNode);
  }

  async getMemoryRatios(userId: string): Promise<MemoryRatioConfig> {
    return this.getMemoryRatioConfig(userId);
  }

  async updateMemoryRatios(userId: string, updates: Partial<MemoryRatioConfig>): Promise<MemoryRatioConfig> {
    return this.updateMemoryRatioConfig(userId, updates);
  }

  async getAllMemory(userId: string): Promise<MemoryNode[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM memory_nodes WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(this.mapRowToMemoryNode);
  }

  async getMemoryStats(userId: string): Promise<{
    total: number;
    byType: Record<MemoryType, number>;
    learningCount: number;
  }> {
    const all = await this.db.query<any>('SELECT type, is_learning_memory, COUNT(*) as count FROM memory_nodes WHERE user_id = ? GROUP BY type, is_learning_memory', [userId]);

    const byType: Record<string, number> = {};
    let total = 0;
    let learningCount = 0;

    for (const row of all) {
      byType[row.type] = (byType[row.type] || 0) + row.count;
      total += row.count;
      if (row.is_learning_memory) {
        learningCount += row.count;
      }
    }

    return {
      total,
      byType: byType as Record<MemoryType, number>,
      learningCount,
    };
  }

  async getMessageStats(userId?: string, startDate?: string, endDate?: string): Promise<{
    totalMessages: number;
    byRole: Record<string, number>;
    bySession: Record<string, number>;
    dateRange?: { start: string; end: string };
  }> {
    let queryStr = 'SELECT role, session_id, COUNT(*) as count FROM user_messages';
    const params: any[] = [];

    const conditions: string[] = [];
    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }
    if (startDate) {
      conditions.push('created_at >= ?');
      params.push(parseInt(startDate));
    }
    if (endDate) {
      conditions.push('created_at <= ?');
      params.push(parseInt(endDate));
    }
    if (conditions.length > 0) {
      queryStr += ' WHERE ' + conditions.join(' AND ');
    }
    queryStr += ' GROUP BY role, session_id';

    const rows = await this.db.query<any>(queryStr, params);

    const byRole: Record<string, number> = {};
    const bySession: Record<string, number> = {};
    let totalMessages = 0;

    for (const row of rows) {
      byRole[row.role] = (byRole[row.role] || 0) + row.count;
      bySession[row.session_id] = (bySession[row.session_id] || 0) + row.count;
      totalMessages += row.count;
    }

    return {
      totalMessages,
      byRole,
      bySession,
      dateRange: startDate && endDate ? { start: startDate, end: endDate } : undefined,
    };
  }

  async getMemoryGraph(userId: string): Promise<{
    nodes: { id: string; label: string; type: string; importance: number }[];
    edges: { source: string; target: string; weight: number }[];
  }> {
    const memoryNodes = await this.db.query<any>(
      'SELECT id, content, type, importance FROM memory_nodes WHERE user_id = ? ORDER BY importance DESC LIMIT 100',
      [userId]
    );

    const edges = await this.db.query<any>(
      `SELECT e.source_node_id as source, e.target_node_id as target, e.weight
       FROM memory_edges e
       JOIN memory_nodes n1 ON e.source_node_id = n1.id
       JOIN memory_nodes n2 ON e.target_node_id = n2.id
       WHERE n1.user_id = ? AND n2.user_id = ?`,
      [userId, userId]
    );

    return {
      nodes: memoryNodes.map((n: any) => ({
        id: n.id,
        label: n.content?.substring(0, 50) || n.id,
        type: n.type,
        importance: n.importance,
      })),
      edges: edges.map((e: any) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      })),
    };
  }

  async saveDocument(userId: string, document: { id?: string; title: string; content: string; tags?: string[] }): Promise<{ id: string; title: string; content: string; tags: string[]; userId: string; createdAt: number; updatedAt: number }> {
    const id = document.id || require('uuid').v4();
    const now = Date.now();
    const doc = {
      id,
      userId,
      title: document.title,
      content: document.content,
      tags: document.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    await this.db.run(`
      INSERT INTO documents (id, user_id, title, content, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      doc.id,
      doc.userId,
      doc.title,
      doc.content,
      JSON.stringify(doc.tags),
      doc.createdAt,
      doc.updatedAt,
    ]);

    return doc;
  }

  async searchDocuments(userId: string, query: string, limit: number = 20): Promise<{ id: string; title: string; content: string; tags: string[]; userId: string; createdAt: number; updatedAt: number }[]> {
    const rows = await this.db.query<any>(`
      SELECT * FROM documents
      WHERE user_id = ? AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)
      ORDER BY updated_at DESC
      LIMIT ?
    `, [userId, `%${query}%`, `%${query}%`, `%${query}%`, limit]);

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async deleteDocument(id: string): Promise<void> {
    await this.db.run('DELETE FROM documents WHERE id = ?', [id]);
  }

  private mapRowToUserMessage(row: any): UserMessage {
    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      exchangeId: row.exchange_id,
      msgId: row.msg_id,
      role: row.role,
      content: row.content,
      summary: row.summary ?? '',
      tokens: row.tokens ?? 0,
      embeddingId: row.embedding_id ?? undefined,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags || [],
      isLearningMemory: !!row.is_learning_memory,
      messageIndex: row.message_index ?? 0,
      referenceCount: row.reference_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToMemoryNode(row: any): MemoryNode {
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      type: row.type as MemoryType,
      source: row.source,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
      confidence: row.confidence,
      importance: row.importance,
      embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding || [],
      embeddingId: row.embedding_id,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessedAt: row.accessed_at,
      accessCount: row.access_count,
      isLearningMemory: !!row.is_learning_memory,
      relatedNodeIds: typeof row.related_node_ids === 'string' ? JSON.parse(row.related_node_ids) : row.related_node_ids || [],
    };
  }
}