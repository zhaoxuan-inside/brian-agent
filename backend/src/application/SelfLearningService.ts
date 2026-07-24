import { z } from 'zod';
import { InformationService, MemoryNode } from '../core/information/InformationService';
import { LLMService } from '../core/llm/LLMService';
import { ModelConfigService } from '../core/modelConfig/ModelConfigService';
import { logger } from '../infrastructure/logger';

export const LearningResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  learnedCount: z.number(),
  newMemories: z.array(z.object({
    id: z.string(),
    type: z.string(),
    content: z.string(),
    tags: z.array(z.string()),
  })),
});

export type LearningResult = z.infer<typeof LearningResultSchema>;

export class SelfLearningService {
  constructor(
    private informationService: InformationService,
    private llmService: LLMService,
    private modelConfigService: ModelConfigService,
  ) {}

  private async resolveModel(): Promise<string> {
    try {
      const models = await this.modelConfigService.listConfigs();
      const active = models.filter(m => m.status === 'active');
      const dm = active.find(m => m.isDefault) || active[0];
      return dm?.modelId || 'gpt-4o';
    } catch {
      return 'gpt-4o';
    }
  }

  async learnFromChat(userId: string, chatId: string): Promise<LearningResult> {
    logger.info('SelfLearningService', `[learnFromChat] userId=${userId} chatId=${chatId}`);
    const allMessages = await this.informationService.getMessagesByChat(chatId, userId);
    
    if (allMessages.length === 0) {
      logger.warn('SelfLearningService', `[learnFromChat] no messages found for chatId=${chatId}`);
      return { success: false, message: 'No messages found for learning', learnedCount: 0, newMemories: [] };
    }

    // Only analyze the last 10 exchanges (20 messages) to avoid O(n²)
    const recentMessages = allMessages.slice(-20);
    logger.info('SelfLearningService', `[learnFromChat] analyzing ${recentMessages.length} of ${allMessages.length} total messages`);
    const chatContent = recentMessages.map(m => `${m.role}: ${m.content}`).join('\n');
    const modelId = await this.resolveModel();
    
    const learningPrompt = `
Analyze the following conversation and extract meaningful knowledge that should be stored as long-term memory.
Focus on:
1. Facts and information
2. User preferences and interests
3. Important concepts and relationships

Output the knowledge as JSON array with items containing:
- type: "factual", "preference", or "concept"
- content: the knowledge content
- tags: array of relevant tags

${chatContent}
`;

    logger.info('SelfLearningService', `[learnFromChat] calling LLM for extraction, model=${modelId}, promptLen=${learningPrompt.length}`);
    const response = await this.llmService.chatCompletion({
      model: modelId,
      messages: [{ role: 'user', content: learningPrompt }],
      temperature: 0.3,
      maxTokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '[]';
    let learnedItems: { type: string; content: string; tags: string[] }[] = [];
    
    try {
      const jsonMatch = content.match(/\[.*\]/s);
      if (jsonMatch) {
        learnedItems = JSON.parse(jsonMatch[0]);
      }
    } catch {
      logger.warn('SelfLearningService', `[learnFromChat] failed to parse LLM response as JSON`);
      learnedItems = [];
    }

    logger.info('SelfLearningService', `[learnFromChat] extracted ${learnedItems.length} knowledge items`);
    const newMemories: LearningResult['newMemories'] = [];
    
    for (const item of learnedItems) {
      const memory: MemoryNode = {
        id: require('uuid').v4(),
        userId,
        content: item.content,
        type: item.type as any,
        source: 'self_learning',
        tags: item.tags,
        confidence: 0.8,
        importance: this.calculateImportance(item.type),
        embedding: [],
        metadata: {},
        relatedNodeIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessedAt: Date.now(),
        accessCount: 0,
        isLearningMemory: true,
      };

      await this.informationService.saveMemory(memory);
      newMemories.push({
        id: memory.id,
        type: memory.type,
        content: memory.content,
        tags: memory.tags,
      });
    }

    logger.info('SelfLearningService', `[learnFromChat] completed: saved ${newMemories.length} memories`);
    return {
      success: true,
      message: `Successfully learned ${newMemories.length} new items`,
      learnedCount: newMemories.length,
      newMemories,
    };
  }

  async learnFromDocument(userId: string, documentId: string): Promise<LearningResult> {
    logger.info('SelfLearningService', `[learnFromDocument] userId=${userId} documentId=${documentId}`);
    const documents = await this.informationService.searchDocuments(userId, '', 1);
    const document = documents.find(d => d.id === documentId);
    
    if (!document) {
      logger.warn('SelfLearningService', `[learnFromDocument] document not found: ${documentId}`);
      return {
        success: false,
        message: 'Document not found',
        learnedCount: 0,
        newMemories: [],
      };
    }

    logger.info('SelfLearningService', `[learnFromDocument] analyzing document, contentLen=${document.content.length}`);
    const modelId = await this.resolveModel();

    const learningPrompt = `
Analyze the following document and extract meaningful knowledge that should be stored as long-term memory.
Focus on:
1. Key facts and information
2. Important concepts
3. Relationships between concepts

Output the knowledge as JSON array with items containing:
- type: "factual", "concept", or "relationship"
- content: the knowledge content
- tags: array of relevant tags

${document.content}
`;

    logger.info('SelfLearningService', `[learnFromDocument] calling LLM for extraction, model=${modelId}, promptLen=${learningPrompt.length}`);
    const response = await this.llmService.chatCompletion({
      model: modelId,
      messages: [{ role: 'user', content: learningPrompt }],
      temperature: 0.3,
      maxTokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '[]';
    let learnedItems: { type: string; content: string; tags: string[] }[] = [];
    
    try {
      const jsonMatch = content.match(/\[.*\]/s);
      if (jsonMatch) {
        learnedItems = JSON.parse(jsonMatch[0]);
      }
    } catch {
      logger.warn('SelfLearningService', `[learnFromDocument] failed to parse LLM response as JSON`);
      learnedItems = [];
    }

    logger.info('SelfLearningService', `[learnFromDocument] extracted ${learnedItems.length} knowledge items`);

    const newMemories: LearningResult['newMemories'] = [];
    
    for (const item of learnedItems) {
      const memory: MemoryNode = {
        id: require('uuid').v4(),
        userId,
        content: item.content,
        type: item.type as any,
        source: 'document',
        tags: item.tags,
        confidence: 0.85,
        importance: this.calculateImportance(item.type),
        embedding: [],
        metadata: {},
        relatedNodeIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessedAt: Date.now(),
        accessCount: 0,
        isLearningMemory: true,
      };

      await this.informationService.saveMemory(memory);
      newMemories.push({
        id: memory.id,
        type: memory.type,
        content: memory.content,
        tags: memory.tags,
      });
    }

    logger.info('SelfLearningService', `[learnFromDocument] completed: saved ${newMemories.length} memories`);
    return {
      success: true,
      message: `Successfully learned ${newMemories.length} new items from document`,
      learnedCount: newMemories.length,
      newMemories,
    };
  }

  private calculateImportance(type: string): number {
    const importanceMap: Record<string, number> = {
      factual: 0.7,
      preference: 0.9,
      concept: 0.8,
      relationship: 0.75,
    };
    return importanceMap[type] || 0.5;
  }

  async startLearningCycle(): Promise<void> {
    logger.info('SelfLearningService', '[startLearningCycle] starting learning cycle');
    console.log('Starting learning cycle...');
  }
}