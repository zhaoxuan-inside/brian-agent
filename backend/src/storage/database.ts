import Database from 'better-sqlite3';
import { config } from '../config';
import path from 'path';
import fs from 'fs';

export class SQLiteDatabase {
  private db: Database.Database;

  constructor() {
    this.ensureDataDir();
    this.db = new Database(config.dbPath);
    this.initTables();
  }

  private ensureDataDir(): void {
    const dataDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('memory', 'tag', 'concept', 'entity')),
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        salience_score REAL DEFAULT 0.5,
        emotional_tag TEXT,
        retrieval_count INTEGER DEFAULT 0,
        last_retrieved INTEGER,
        strength REAL DEFAULT 0.5,
        decay_rate REAL DEFAULT 0.05,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_nodes_type ON memory_nodes(type);
      CREATE INDEX IF NOT EXISTS idx_memory_nodes_created_at ON memory_nodes(created_at);

      CREATE TABLE IF NOT EXISTS memory_edges (
        id TEXT PRIMARY KEY,
        source_node_id TEXT NOT NULL REFERENCES memory_nodes(id),
        target_node_id TEXT NOT NULL REFERENCES memory_nodes(id),
        weight REAL DEFAULT 0.5,
        label TEXT,
        activation_count INTEGER DEFAULT 0,
        direction TEXT CHECK(direction IN ('undirected', 'directed')) DEFAULT 'undirected',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_edges_source ON memory_edges(source_node_id);
      CREATE INDEX IF NOT EXISTS idx_memory_edges_target ON memory_edges(target_node_id);

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT,
        messages TEXT NOT NULL DEFAULT '[]',
        agent_chain TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

      CREATE TABLE IF NOT EXISTS user_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('aesthetic', 'content', 'communication', 'behavior')),
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
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        user_id TEXT NOT NULL,
        rating TEXT NOT NULL CHECK(rating IN ('good', 'neutral', 'bad')),
        reason TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_message_id ON feedback(message_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
    `);
  }

  getInstance(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

export const db = new SQLiteDatabase();

// Simple in-memory vector store
class InMemoryVectorStore {
  private vectors: Map<string, { vector: number[]; metadata: any }> = new Map();
  
  add(id: string, vector: number[], metadata?: any) { this.vectors.set(id, { vector, metadata }); }
  search(queryVector: number[], topK: number = 5) {
    // Cosine similarity search
    const results: { id: string; score: number; metadata: any }[] = [];
    for (const [id, entry] of this.vectors) {
      const score = this.cosineSimilarity(queryVector, entry.vector);
      results.push({ id, score, metadata: entry.metadata });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }
  private cosineSimilarity(a: number[], b: number[]) {
    const dot = a.reduce((s, v, i) => s + v * (b[i] || 0), 0);
    const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return normA && normB ? dot / (normA * normB) : 0;
  }
  get isActive() { return true; }
}

// Simple in-memory graph store
class InMemoryGraphStore {
  private nodes: Map<string, { label: string; properties: any }> = new Map();
  private edges: { source: string; target: string; type: string; weight: number }[] = [];
  
  addNode(id: string, label: string, properties?: any) { this.nodes.set(id, { label, properties }); }
  addEdge(source: string, target: string, type: string, weight: number = 1) { this.edges.push({ source, target, type, weight }); }
  get isActive() { return true; }
}

export const vectorStore = new InMemoryVectorStore();
export const graphStore = new InMemoryGraphStore();
