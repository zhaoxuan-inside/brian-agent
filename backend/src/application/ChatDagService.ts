import { ChatMessage } from '../base/LLMWrapper';
import { InformationService, UserMessage } from '../core/information/InformationService';
import { LLMService } from '../core/llm/LLMService';
import { ModelConfigService } from '../core/modelConfig/ModelConfigService';
import { logger } from '../infrastructure/logger';

export interface DagNode {
  msgId: string;
  exchangeId: string;
  role: 'user' | 'assistant' | 'system';
  summary: string;
  createdAt: number;
  messageIndex: number;
  /** 该消息引用了多少条其他消息 */
  referencesOut: number;
  /** 该消息被多少条消息引用 */
  referencesIn: number;
  /** 是否为分支消息（所在 exchange 有引用关系，不参与主序列链） */
  isBranch: boolean;
}

export interface DagEdge {
  from: string;
  to: string;
  /** sequence = 顺序流（向下）；reference = 引用（向右） */
  type: 'sequence' | 'reference';
}

export interface SessionDag {
  nodes: DagNode[];
  edges: DagEdge[];
}

export interface ReferencedMessageBrief {
  msgId: string;
  role: string;
  summary: string;
  createdAt: number;
}

export interface MessageDetail {
  msgId: string;
  exchangeId: string;
  sessionId: string;
  role: string;
  content: string;
  summary: string;
  createdAt: number;
  /** 该消息引用的消息列表 */
  referencesOut: ReferencedMessageBrief[];
  /** 引用该消息的消息列表 */
  referencesIn: ReferencedMessageBrief[];
}

const SUMMARY_MAX_LEN = 20;

function fallbackSummary(content: string): string {
  return content.length <= SUMMARY_MAX_LEN ? content : content.slice(0, SUMMARY_MAX_LEN);
}

/**
 * ChatDagService —— application 层业务逻辑：
 * 会话 DAG 构建、引用记录、祖先闭包上下文、LLM 语义摘要生成与回填。
 * 下层（InformationService / LLMService / ModelConfigService）仅作数据访问与模型调用。
 */
export class ChatDagService {
  constructor(
    private informationService: InformationService,
    private llmService: LLMService,
    private modelConfigService: ModelConfigService
  ) {}

  /**
   * 构建会话的消息级 DAG：节点 = 单条消息；边 = 顺序边（相邻消息）+ 引用边（message_references）。
   */
  async buildSessionDag(userId: string, sessionId: string): Promise<SessionDag> {
    const messages = (await this.informationService.getMessagesByChat(sessionId, userId))
      .filter(m => !m.isLearningMemory);
    const references = await this.informationService.getReferencesBySession(sessionId);

    const msgIdSet = new Set(messages.map(m => m.msgId));

    // 引用计数（只统计会话内两端都存在的引用）
    const outCount = new Map<string, number>();
    const inCount = new Map<string, number>();
    const referenceEdges: DagEdge[] = [];
    for (const ref of references) {
      if (!msgIdSet.has(ref.msgId) || !msgIdSet.has(ref.referencedMsgId)) continue;
      referenceEdges.push({ from: ref.referencedMsgId, to: ref.msgId, type: 'reference' });
      outCount.set(ref.msgId, (outCount.get(ref.msgId) ?? 0) + 1);
      inCount.set(ref.referencedMsgId, (inCount.get(ref.referencedMsgId) ?? 0) + 1);
    }

    // 分支消息：同一 exchange 内有 outgoing 引用（即通过 selectedMessageIds 发送的问答对）
    // 分支消息不参与主序列链，仅通过引用边关联到被选中消息
    const branchExchangeIds = new Set<string>();
    for (const ref of references) {
      const msg = messages.find(m => m.msgId === ref.msgId);
      if (msg) branchExchangeIds.add(msg.exchangeId);
    }
    const branchMsgIds = new Set<string>();
    for (const m of messages) {
      if (branchExchangeIds.has(m.exchangeId)) branchMsgIds.add(m.msgId);
    }

    const nodes: DagNode[] = messages.map(m => ({
      msgId: m.msgId,
      exchangeId: m.exchangeId,
      role: m.role,
      summary: m.summary ? fallbackSummary(m.summary) : fallbackSummary(m.content),
      createdAt: m.createdAt,
      messageIndex: m.messageIndex,
      referencesOut: outCount.get(m.msgId) ?? 0,
      referencesIn: inCount.get(m.msgId) ?? 0,
      isBranch: branchMsgIds.has(m.msgId),
    }));

    // 顺序边：仅连接主链消息（排除分支 exchange），保证主链 = 无引用关系的自然对话流
    const mainChain = messages.filter(m => !branchMsgIds.has(m.msgId));
    const sequenceEdges: DagEdge[] = [];
    for (let i = 1; i < mainChain.length; i++) {
      sequenceEdges.push({ from: mainChain[i - 1].msgId, to: mainChain[i].msgId, type: 'sequence' });
    }

    // 分支 exchange 内部顺序边：同一 exchange 内 user → assistant 仍保持连接
    const branchGroups = new Map<string, { msgId: string; messageIndex: number }[]>();
    for (const m of messages) {
      if (branchMsgIds.has(m.msgId)) {
        const list = branchGroups.get(m.exchangeId) ?? [];
        list.push({ msgId: m.msgId, messageIndex: m.messageIndex });
        branchGroups.set(m.exchangeId, list);
      }
    }
    for (const [, group] of branchGroups) {
      group.sort((a, b) => a.messageIndex - b.messageIndex);
      for (let i = 1; i < group.length; i++) {
        sequenceEdges.push({ from: group[i - 1].msgId, to: group[i].msgId, type: 'sequence' });
      }
    }

    return { nodes, edges: [...sequenceEdges, ...referenceEdges] };
  }

  /**
   * 消息详情：完整内容 + 双向引用消息摘要列表（供徽标弹窗）。
   */
  async getMessageDetail(msgId: string): Promise<MessageDetail | null> {
    const msg = await this.informationService.getMessageByMsgId(msgId);
    if (!msg) return null;

    const references = await this.informationService.getReferencesBySession(msg.sessionId);
    const outIds = references.filter(r => r.msgId === msgId).map(r => r.referencedMsgId);
    const inIds = references.filter(r => r.referencedMsgId === msgId).map(r => r.msgId);

    const related = await this.informationService.getMessagesByMsgIds([...new Set([...outIds, ...inIds])]);
    const briefMap = new Map<string, ReferencedMessageBrief>();
    for (const m of related) {
      briefMap.set(m.msgId, {
        msgId: m.msgId,
        role: m.role,
        summary: m.summary ? fallbackSummary(m.summary) : fallbackSummary(m.content),
        createdAt: m.createdAt,
      });
    }

    const byIndex = (a: ReferencedMessageBrief, b: ReferencedMessageBrief) => a.createdAt - b.createdAt;
    return {
      msgId: msg.msgId,
      exchangeId: msg.exchangeId,
      sessionId: msg.sessionId,
      role: msg.role,
      content: msg.content,
      summary: msg.summary ? fallbackSummary(msg.summary) : fallbackSummary(msg.content),
      createdAt: msg.createdAt,
      referencesOut: outIds.map(id => briefMap.get(id)).filter((b): b is ReferencedMessageBrief => !!b).sort(byIndex),
      referencesIn: inIds.map(id => briefMap.get(id)).filter((b): b is ReferencedMessageBrief => !!b).sort(byIndex),
    };
  }

  /**
   * 记录一条消息对他消息的引用（用户勾选复选框发送时调用）。
   */
  async recordReferences(sessionId: string, msgId: string, referencedMsgIds: string[]): Promise<void> {
    const valid = referencedMsgIds.filter(id => typeof id === 'string' && id && id !== msgId);
    if (valid.length === 0) return;
    await this.informationService.saveReferences(sessionId, msgId, valid);
    logger.info('ChatDagService', `[recordReferences] sessionId=${sessionId} msgId=${msgId} refs=${valid.length}`);
  }

  /**
   * 祖先闭包上下文：选中消息 + 沿顺序边/引用边向上回溯的全部消息（传递闭包），
   * 按 message_index 时间正序返回。用于用户自主控制上下文（选中节点以下的消息不包含）。
   */
  async resolveAncestorContext(userId: string, sessionId: string, selectedMsgIds: string[]): Promise<ChatMessage[]> {
    if (selectedMsgIds.length === 0) return [];

    const messages = (await this.informationService.getMessagesByChat(sessionId, userId))
      .filter(m => !m.isLearningMemory);
    const references = await this.informationService.getReferencesBySession(sessionId);

    // 父边映射：child msgId -> parent msgIds（顺序父 = 前一条消息；引用父 = 被引用消息）
    const parents = new Map<string, string[]>();
    for (let i = 1; i < messages.length; i++) {
      parents.set(messages[i].msgId, [messages[i - 1].msgId]);
    }
    for (const ref of references) {
      const list = parents.get(ref.msgId) ?? [];
      list.push(ref.referencedMsgId);
      parents.set(ref.msgId, list);
    }

    // BFS 向上回溯
    const visited = new Set<string>();
    const queue = [...selectedMsgIds];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const p of parents.get(current) ?? []) {
        if (!visited.has(p)) queue.push(p);
      }
    }

    return messages
      .filter(m => visited.has(m.msgId))
      .map(m => ({ role: m.role, content: m.content }) as ChatMessage);
  }

  /**
   * 异步生成并保存 LLM 语义摘要（≤20 字），失败时回退为内容截断。fire-and-forget。
   */
  scheduleSummary(msgId: string, content: string): void {
    this.generateAndSaveSummary(msgId, content).catch(e => {
      logger.warn('ChatDagService', `[scheduleSummary] msgId=${msgId} failed: ${(e as Error).message}`);
    });
  }

  async generateAndSaveSummary(msgId: string, content: string): Promise<void> {
    // 短内容无需摘要
    if (content.length <= SUMMARY_MAX_LEN) {
      await this.informationService.updateMessageSummary(msgId, content);
      return;
    }

    let summary = fallbackSummary(content);
    try {
      const model = await this.resolveDefaultModel();
      if (model) {
        const response = await this.llmService.chatCompletion({
          model: model.modelId,
          messages: [
            { role: 'system', content: `你是摘要助手。用不超过${SUMMARY_MAX_LEN}个字概括用户给出的内容，只输出概括本身，不要输出任何其他文字、标点或引号。` },
            { role: 'user', content: content.slice(0, 2000) },
          ],
          temperature: 0.3,
          maxTokens: 60,
        }, model.configId);
        const text = response.choices?.[0]?.message?.content?.trim();
        if (text) {
          summary = text.length <= SUMMARY_MAX_LEN ? text : text.slice(0, SUMMARY_MAX_LEN);
        }
      }
    } catch (e) {
      logger.warn('ChatDagService', `[generateAndSaveSummary] LLM summary failed, fallback to truncate: ${(e as Error).message}`);
    }

    await this.informationService.updateMessageSummary(msgId, summary);
    logger.info('ChatDagService', `[generateAndSaveSummary] msgId=${msgId} summary="${summary}"`);
  }

  /**
   * 存量消息摘要回填：启动后后台执行，逐批处理 summary 为空或过长的消息。
   */
  async backfillSummaries(maxBatches: number = 10, batchSize: number = 50): Promise<number> {
    let total = 0;
    for (let batch = 0; batch < maxBatches; batch++) {
      const pending: UserMessage[] = await this.informationService.getMessagesNeedingSummary(batchSize);
      if (pending.length === 0) break;
      logger.info('ChatDagService', `[backfillSummaries] batch=${batch + 1} pending=${pending.length}`);
      for (const msg of pending) {
        try {
          await this.generateAndSaveSummary(msg.msgId, msg.content);
          total++;
        } catch (e) {
          logger.warn('ChatDagService', `[backfillSummaries] msgId=${msg.msgId} failed: ${(e as Error).message}`);
        }
      }
      if (pending.length < batchSize) break;
    }
    logger.info('ChatDagService', `[backfillSummaries] completed, processed=${total}`);
    return total;
  }

  private async resolveDefaultModel(): Promise<{ configId: string; modelId: string } | null> {
    try {
      const models = await this.modelConfigService.listConfigs();
      const active = models.filter(m => m.status === 'active');
      const defaultModel = active.find(m => m.isDefault) || active[0];
      return defaultModel ? { configId: defaultModel.id, modelId: defaultModel.modelId } : null;
    } catch {
      return null;
    }
  }
}
