import { z } from 'zod';
import { DBWrapper } from '../../base/DBWrapper';

export const LibrarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['public', 'private']),
  documentCount: z.number().default(0),
  indexedAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Library = z.infer<typeof LibrarySchema>;

export const DocumentUploadSchema = z.object({
  userId: z.string(),
  title: z.string(),
  content: z.string(),
  sourceType: z.enum(['upload', 'url', 'manual']),
  tags: z.array(z.string()).optional(),
});

export type DocumentUpload = z.infer<typeof DocumentUploadSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  libraryId: z.string(),
  userId: z.string(),
  title: z.string(),
  content: z.string(),
  sourceType: z.enum(['upload', 'url', 'manual']),
  tags: z.array(z.string()).default([]),
  wordCount: z.number().default(0),
  knowledgeCount: z.number().default(0),
  indexedAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Document = z.infer<typeof DocumentSchema>;

export const SearchResultSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  content: z.string(),
  score: z.number(),
  tags: z.array(z.string()),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export class LibraryService {
  constructor(private db: DBWrapper) {}

  async createLibrary(library: Omit<Library, 'id' | 'documentCount' | 'createdAt' | 'updatedAt'>): Promise<Library> {
    const id = require('uuid').v4();
    const now = Date.now();
    const lib: Library = {
      ...library,
      id,
      documentCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.run(`
      INSERT INTO libraries (id, user_id, name, description, type, document_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      lib.id,
      lib.userId,
      lib.name,
      lib.description,
      lib.type,
      lib.documentCount,
      lib.createdAt,
      lib.updatedAt,
    ]);

    return lib;
  }

  async getLibrary(id: string): Promise<Library | undefined> {
    return this.db.get<Library>('SELECT * FROM libraries WHERE id = ?', [id]);
  }

  async listLibraries(userId?: string): Promise<Library[]> {
    if (userId) {
      return this.db.query<Library>('SELECT * FROM libraries WHERE user_id = ?', [userId]);
    }
    return this.db.query<Library>('SELECT * FROM libraries');
  }

  async updateLibrary(id: string, updates: Partial<Library>): Promise<Library | undefined> {
    const existing = await this.getLibrary(id);
    if (!existing) return undefined;

    const now = Date.now();
    const updated: Library = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.db.run(`
      UPDATE libraries
      SET name = ?, description = ?, type = ?, updated_at = ?
      WHERE id = ?
    `, [
      updated.name,
      updated.description,
      updated.type,
      updated.updatedAt,
      id,
    ]);

    return updated;
  }

  async deleteLibrary(id: string): Promise<void> {
    await this.db.run('DELETE FROM documents WHERE library_id = ?', [id]);
    await this.db.run('DELETE FROM libraries WHERE id = ?', [id]);
  }

  async addDocument(libraryId: string, document: Omit<Document, 'id' | 'libraryId' | 'wordCount' | 'knowledgeCount' | 'createdAt' | 'updatedAt'>): Promise<Document> {
    const id = require('uuid').v4();
    const now = Date.now();
    const doc: Document = {
      ...document,
      id,
      libraryId,
      wordCount: document.content.length,
      knowledgeCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.run(`
      INSERT INTO documents (id, library_id, user_id, title, content, source_type, tags, word_count, knowledge_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      doc.id,
      doc.libraryId,
      doc.userId,
      doc.title,
      doc.content,
      doc.sourceType,
      JSON.stringify(doc.tags),
      doc.wordCount,
      doc.knowledgeCount,
      doc.createdAt,
      doc.updatedAt,
    ]);

    await this.db.run('UPDATE libraries SET document_count = document_count + 1 WHERE id = ?', [libraryId]);

    return doc;
  }

  async removeDocument(libraryId: string, documentId: string): Promise<void> {
    await this.db.run('DELETE FROM documents WHERE id = ? AND library_id = ?', [documentId, libraryId]);
    await this.db.run('UPDATE libraries SET document_count = document_count - 1 WHERE id = ?', [libraryId]);
  }

  async listDocuments(libraryId: string): Promise<Document[]> {
    return this.db.query<Document>('SELECT * FROM documents WHERE library_id = ?', [libraryId]);
  }

  async getDocument(id: string): Promise<Document | undefined> {
    return this.db.get<Document>('SELECT * FROM documents WHERE id = ?', [id]);
  }

  async searchLibrary(libraryId: string, query: string): Promise<SearchResult[]> {
    const results = await this.db.query<Document>(
      'SELECT * FROM documents WHERE library_id = ? AND content LIKE ?',
      [libraryId, `%${query}%`]
    );

    return results.map(doc => ({
      documentId: doc.id,
      title: doc.title,
      content: doc.content.slice(0, 200),
      score: 1,
      tags: doc.tags,
    }));
  }

  async indexDocument(documentId: string): Promise<void> {
    await this.db.run('UPDATE documents SET indexed_at = ? WHERE id = ?', [Date.now(), documentId]);
  }
}