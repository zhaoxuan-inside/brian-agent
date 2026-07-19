import { z } from 'zod';
import { InformationService } from '../core/information/InformationService';
import { logger } from '../infrastructure/logger';

export const DocumentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  content: z.string(),
  type: z.enum(['markdown', 'text', 'pdf']),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.any()).default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Document = z.infer<typeof DocumentSchema>;

// InformationService 内部文档类型 (title 而非 name)
type InfoDoc = { id: string; title: string; content: string; tags: string[]; userId: string; createdAt: number; updatedAt: number };

export class DocumentService {
  constructor(private informationService: InformationService) {}

  async uploadDocument(userId: string, name: string, content: string, type: 'markdown' | 'text' | 'pdf', tags?: string[]): Promise<Document> {
    const now = Date.now();
    const id = require('uuid').v4();
    logger.info('DocumentService', `[uploadDocument] userId=${userId} name=${name} type=${type} contentLen=${content.length} tags=${(tags || []).length}`);

    await this.informationService.saveDocument(userId, { id, title: name, content, tags: tags || [] });

    logger.info('DocumentService', `[uploadDocument] saved: id=${id}`);
    return {
      id,
      userId,
      name,
      content,
      type,
      tags: tags || [],
      metadata: { uploadTime: now },
      createdAt: now,
      updatedAt: now,
    };
  }

  private mapToDocument(row: InfoDoc): Document {
    return {
      id: row.id,
      userId: row.userId,
      name: row.title,
      content: row.content,
      type: 'markdown',
      tags: row.tags,
      metadata: {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getDocument(userId: string, documentId: string): Promise<Document | null> {
    logger.info('DocumentService', `[getDocument] userId=${userId} documentId=${documentId}`);
    const documents = await this.informationService.searchDocuments(userId, '', 100);
    const doc = documents.find(d => d.id === documentId);
    logger.info('DocumentService', `[getDocument] found=${!!doc}`);
    return doc ? this.mapToDocument(doc) : null;
  }

  async listDocuments(userId: string): Promise<Document[]> {
    logger.info('DocumentService', `[listDocuments] userId=${userId}`);
    const documents = await this.informationService.searchDocuments(userId, '', 100);
    logger.info('DocumentService', `[listDocuments] returned ${documents.length} documents`);
    return documents.map(d => this.mapToDocument(d));
  }

  async updateDocument(userId: string, documentId: string, updates: Partial<Document>): Promise<Document | null> {
    logger.info('DocumentService', `[updateDocument] userId=${userId} documentId=${documentId} keys=${Object.keys(updates).join(',')}`);
    const document = await this.getDocument(userId, documentId);
    if (!document) {
      logger.warn('DocumentService', `[updateDocument] document not found: ${documentId}`);
      return null;
    }

    Object.assign(document, updates);
    document.updatedAt = Date.now();

    await this.informationService.saveDocument(userId, {
      id: document.id,
      title: document.name,
      content: document.content,
      tags: document.tags,
    });
    return document;
  }

  async deleteDocument(userId: string, documentId: string): Promise<boolean> {
    logger.info('DocumentService', `[deleteDocument] userId=${userId} documentId=${documentId}`);
    await this.informationService.deleteDocument(documentId);
    return true;
  }

  async searchDocuments(userId: string, query: string, limit: number = 10): Promise<Document[]> {
    logger.info('DocumentService', `[searchDocuments] userId=${userId} query=${query || 'all'} limit=${limit}`);
    const documents = await this.informationService.searchDocuments(userId, query, limit);
    logger.info('DocumentService', `[searchDocuments] returned ${documents.length} results`);
    return documents.map(d => this.mapToDocument(d));
  }

  async extractTextFromMarkdown(markdown: string): Promise<string> {
    return markdown.replace(/[#*`>\[\]()]/g, '');
  }
}
