import { StorageService } from '../storage';
import { LLMService } from '../llm';
import { v4 as uuidv4 } from 'uuid';
import type { UnifiedMemoryItem, TagSet, MemoryType } from '../../shared/types';

interface WorkingMemoryItem {
  id: string;
  content: string;
  type: string;
  relevance: number;
  timestamp: number;
}

interface TagNode {
  id: string;
  name: string;
  weight: number;
  degree: number;
}

interface TagEdge {
  source: string;
  target: string;
  weight: number;
  label: string;
}

// ============================================================
// Keyword Maps for Tag Extraction
// ============================================================

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  'frontend': ['react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt', 'css', 'html', 'dom', 'component', 'spa', 'ssr', 'bundle', 'webpack', 'vite', 'tailwind', 'bootstrap', 'jquery', 'typescript', 'javascript', 'jsx', 'tsx', 'redux', 'zustand', 'mobx'],
  'backend': ['node.js', 'express', 'fastapi', 'django', 'flask', 'spring', 'gin', 'rails', 'laravel', 'graphql', 'rest', 'grpc', 'microservice', 'api', 'middleware', 'routing', 'orm', 'prisma', 'sequelize', 'typeorm', 'postgresql', 'mysql', 'mongodb', 'redis'],
  'devops': ['docker', 'kubernetes', 'k8s', 'helm', 'terraform', 'ansible', 'ci/cd', 'jenkins', 'github actions', 'gitlab ci', 'prometheus', 'grafana', 'nginx', 'haproxy', 'aws', 'azure', 'gcp', 'cloud', 'serverless', 'lambda', 's3', 'ec2'],
  'ai-ml': ['machine learning', 'deep learning', 'neural network', 'transformer', 'gpt', 'bert', 'llm', 'nlp', 'computer vision', 'reinforcement learning', 'pytorch', 'tensorflow', 'keras', 'scikit-learn', 'pandas', 'numpy', 'embedding', 'tokenization', 'fine-tuning', 'rag', 'langchain'],
  'mobile': ['android', 'ios', 'swift', 'kotlin', 'flutter', 'react native', 'expo', 'capacitor', 'pwa', 'app store', 'play store', 'xcode', 'mobile', 'responsive'],
  'database': ['sql', 'nosql', 'acid', 'index', 'query', 'migration', 'replication', 'sharding', 'partition', 'backup', 'transaction', 'normalization', 'schema', 'join', 'aggregate', 'postgres', 'mongo', 'cassandra', 'elasticsearch', 'clickhouse', 'timescale'],
  'security': ['authentication', 'authorization', 'oauth', 'jwt', 'csrf', 'xss', 'sql injection', 'encryption', 'https', 'tls', 'ssl', 'cors', 'csp', 'firewall', 'vulnerability', 'penetration test', 'hashing', 'bcrypt', 'argon2', 'secrets'],
  'testing': ['unit test', 'integration test', 'e2e', 'jest', 'mocha', 'pytest', 'selenium', 'cypress', 'playwright', 'tdd', 'bdd', 'mock', 'stub', 'spy', 'assertion', 'coverage', 'regression', 'snapshot test'],
  'data-engineering': ['etl', 'data pipeline', 'spark', 'hadoop', 'kafka', 'airflow', 'dbt', 'data warehouse', 'data lake', 'bigquery', 'snowflake', 'databricks', 'batch', 'streaming', 'orc', 'parquet', 'avro'],
  'programming': ['algorithm', 'data structure', 'design pattern', 'oop', 'functional', 'concurrency', 'async', 'parallel', 'multithreading', 'memory management', 'garbage collection', 'compiler', 'interpreter', 'runtime', 'debugging', 'profiling', 'optimization'],
};

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  'finance': ['fintech', 'banking', 'payment', 'trading', 'crypto', 'blockchain', 'defi', 'investment', 'insurance', 'accounting', 'tax', 'ledger', 'compliance', 'kyc', 'aml', 'risk management', 'portfolio', 'stock', 'forex'],
  'healthcare': ['medical', 'ehr', 'hipaa', 'fhir', 'telemedicine', 'diagnostics', 'pharmaceutical', 'biotech', 'genomics', 'imaging', 'clinical', 'patient', 'health', 'hospital', 'lab', 'radiology', 'prescription'],
  'ecommerce': ['shop', 'cart', 'checkout', 'payment gateway', 'inventory', 'order', 'catalog', 'marketplace', 'customer', 'retail', 'pos', 'shipping', 'fulfillment', 'crm', 'loyalty', 'coupon', 'discount'],
  'education': ['lms', 'online learning', 'course', 'classroom', 'curriculum', 'assessment', 'quiz', 'grading', 'student', 'teacher', 'mooc', 'edtech', 'certification', 'training', 'onboarding'],
  'gaming': ['game engine', 'unreal', 'unity', 'godot', 'rendering', 'shader', 'physics', 'multiplayer', 'matchmaking', 'leaderboard', 'achievement', 'in-app purchase', 'vr', 'ar', 'metaverse', 'esports'],
  'iot': ['mqtt', 'coap', 'sensor', 'actuator', 'embedded', 'firmware', 'raspberry pi', 'arduino', 'esp32', 'zigbee', 'bluetooth', 'ble', 'edge computing', 'telemetry', 'modbus', 'opc-ua'],
  'automotive': ['autonomous', 'adas', 'can bus', 'lidar', 'infotainment', 'telematics', 'fleet', 'ev', 'charging', 'navigation', 'gps', 'v2x', 'adas', 'autosar'],
  'legal': ['contract', 'compliance', 'regulation', 'gdpr', 'ccpa', 'intellectual property', 'patent', 'trademark', 'copyright', 'license', 'audit', 'litigation', 'discovery', 'e-discovery'],
  'energy': ['smart grid', 'renewable', 'solar', 'wind', 'battery', 'optimization', 'monitoring', 'scada', 'forecasting', 'demand response', 'carbon', 'emissions', 'sustainability'],
  'media': ['streaming', 'cdn', 'transcoding', 'encoding', 'video', 'audio', 'podcast', 'broadcast', 'ott', 'iptv', 'drm', 'codec', 'hls', 'dash', 'webrtc'],
};

const CONCEPT_KEYWORDS: Record<string, string[]> = {
  'architecture': ['monolith', 'microservices', 'serverless', 'soa', 'event-driven', 'cqrs', 'event sourcing', 'hexagonal', 'clean architecture', 'layered', 'mvc', 'mvvm', 'mvp', 'flux', 'pub-sub', 'message queue', 'service mesh', 'api gateway'],
  'performance': ['latency', 'throughput', 'scalability', 'caching', 'load balancing', 'cdn', 'lazy loading', 'code splitting', 'compression', 'minification', 'connection pooling', 'batching', 'debounce', 'throttle', 'memoization', 'virtualization', 'lazy evaluation'],
  'reliability': ['fault tolerance', 'resilience', 'circuit breaker', 'retry', 'fallback', 'timeout', 'bulkhead', 'rate limiting', 'health check', 'graceful degradation', 'idempotency', 'dead letter', 'redundancy', 'replication', 'failover', 'disaster recovery'],
  'patterns': ['singleton', 'factory', 'observer', 'strategy', 'decorator', 'adapter', 'proxy', 'command', 'mediator', 'iterator', 'composite', 'builder', 'prototype', 'facade', 'bridge', 'chain of responsibility', 'repository', 'dependency injection'],
  'paradigms': ['functional programming', 'reactive', 'declarative', 'imperative', 'procedural', 'logic', 'constraint', 'actor model', 'dataflow', 'metaprogramming', 'generic', 'reflection', 'aspect-oriented', 'domain-driven design'],
  'quality': ['code review', 'linting', 'formatting', 'static analysis', 'refactoring', 'technical debt', 'code smell', 'solid', 'dry', 'kiss', 'yagni', 'clean code', 'best practice', 'convention', 'documentation', 'readability', 'maintainability'],
  'monitoring': ['logging', 'metrics', 'tracing', 'alerting', 'dashboard', 'slo', 'sli', 'sla', 'error budget', 'runbook', 'incident', 'postmortem', 'observability', 'opentelemetry', 'jaeger', 'zipkin', 'elk', 'splunk', 'datadog'],
  'collaboration': ['git', 'branching', 'merge', 'pr', 'code review', 'agile', 'scrum', 'kanban', 'sprint', 'standup', 'retrospective', 'backlog', 'story points', 'velocity', 'jira', 'confluence', 'slack', 'teams', 'notion'],
  'data': ['serialization', 'deserialization', 'json', 'yaml', 'xml', 'protobuf', 'avro', 'thrift', 'messagepack', 'bson', 'csv', 'schema', 'validation', 'migration', 'versioning', 'backward compatibility'],
  'networking': ['tcp', 'udp', 'http', 'websocket', 'sse', 'dns', 'load balancer', 'reverse proxy', 'firewall', 'vpn', 'nat', 'subnet', 'ip', 'routing', 'dns', 'cdn', 'edge', 'latency', 'bandwidth', 'packet'],
};

const ACTION_KEYWORDS: Record<string, string[]> = {
  'create': ['build', 'develop', 'implement', 'write', 'code', 'construct', 'design', 'architect', 'prototype', 'scaffold', 'generate', 'bootstrap', 'initialize', 'setup', 'configure', 'provision', 'deploy', 'launch', 'release'],
  'modify': ['update', 'change', 'edit', 'modify', 'refactor', 'rewrite', 'revise', 'adapt', 'adjust', 'tweak', 'enhance', 'improve', 'optimize', 'extend', 'augment', 'upgrade', 'migrate', 'transform', 'convert'],
  'delete': ['remove', 'delete', 'deprecate', 'retire', 'archive', 'purge', 'clean', 'cleanup', 'drop', 'truncate', 'uninstall', 'unregister', 'revoke', 'decommission', 'sunset', 'obsolete', 'prune'],
  'analyze': ['investigate', 'diagnose', 'debug', 'profile', 'inspect', 'examine', 'trace', 'monitor', 'measure', 'benchmark', 'audit', 'review', 'assess', 'evaluate', 'validate', 'verify', 'compare', 'test'],
  'search': ['find', 'query', 'lookup', 'retrieve', 'fetch', 'search', 'scan', 'explore', 'browse', 'discover', 'locate', 'identify', 'grep', 'filter', 'match', 'seek', 'crawl', 'index'],
  'integrate': ['connect', 'link', 'integrate', 'combine', 'merge', 'unify', 'bridge', 'adapt', 'orchestrate', 'synchronize', 'aggregate', 'consolidate', 'join', 'federate', 'interoperate', 'chain', 'pipeline'],
  'automate': ['schedule', 'trigger', 'automate', 'script', 'batch', 'cron', 'workflow', 'ci/cd', 'pipeline', 'webhook', 'event', 'subscribe', 'dispatch', 'execute', 'run', 'process', 'handle', 'delegate'],
  'learn': ['study', 'learn', 'understand', 'comprehend', 'research', 'read', 'document', 'explain', 'teach', 'train', 'educate', 'onboard', 'discover', 'memorize', 'recall', 'summarize', 'extract', 'infer'],
  'secure': ['encrypt', 'decrypt', 'hash', 'sign', 'verify', 'authenticate', 'authorize', 'protect', 'guard', 'sanitize', 'escape', 'validate', 'harden', 'lock', 'isolate', 'sandbox', 'audit', 'comply'],
  'communicate': ['notify', 'alert', 'report', 'log', 'inform', 'announce', 'broadcast', 'publish', 'share', 'collaborate', 'discuss', 'present', 'visualize', 'display', 'render', 'show', 'output', 'respond'],
};

const SENTIMENT_WORDS: Record<string, string> = {
  'positive': 'great excellent amazing wonderful fantastic awesome perfect brilliant outstanding superb excellent love happy good nice beautiful incredible best',
  'negative': 'terrible horrible awful bad poor worst buggy broken slow crash error fail issue problem wrong',
  'neutral': 'okay fine average normal standard regular typical common usual ordinary',
  'frustrated': 'frustrating annoying irritating confusing difficult hard complicated complex tedious painful',
  'excited': 'exciting innovative groundbreaking revolutionary cutting-edge state-of-the-art next-gen modern cool interesting fascinating',
};

// ============================================================
// Simple Hash for Fingerprint
// ============================================================

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

// ============================================================
// InformationService
// ============================================================

export class InformationService {
  private storage: StorageService;
  private _llm: LLMService;
  private workingMemory: Map<string, WorkingMemoryItem[]>;
  private pinnedMemories: Set<string>;
  private _tagEvolutionTimer: ReturnType<typeof setInterval> | null = null;
  private _accessCounters: Map<string, number> = new Map();

  constructor(storage: StorageService, llm: LLMService) {
    this.storage = storage;
    this._llm = llm;
    this.workingMemory = new Map();
    this.pinnedMemories = new Set();
    this.scheduleTagEvolution();
  }

  // ============================================================
  // Working Memory
  // ============================================================

  addToWorking(conversationId: string, item: { content: string; type: string; relevance: number }): string {
    const id = uuidv4();
    const wmItem: WorkingMemoryItem = {
      id,
      content: item.content,
      type: item.type,
      relevance: item.relevance,
      timestamp: Date.now(),
    };

    if (!this.workingMemory.has(conversationId)) {
      this.workingMemory.set(conversationId, []);
    }
    const items = this.workingMemory.get(conversationId)!;
    items.push(wmItem);

    // Keep working memory bounded
    const maxSize = 50;
    if (items.length > maxSize) {
      items.sort((a, b) => b.relevance - a.relevance);
      items.length = maxSize;
    }

    return id;
  }

  getWorking(conversationId: string): WorkingMemoryItem[] {
    const items = this.workingMemory.get(conversationId) || [];
    // Sort by relevance descending
    return [...items].sort((a, b) => b.relevance - a.relevance);
  }

  clearWorking(conversationId: string): void {
    this.workingMemory.delete(conversationId);
  }

  // ============================================================
  // Unified Memory Format
  // ============================================================

  private formatMemory(rawContent: string, type: MemoryType, role: string, tags?: TagSet): Omit<UnifiedMemoryItem, 'id'> {
    const summary = this.generateSummary(rawContent);
    const fingerprint = this.generateFingerprint(rawContent);

    return {
      type,
      rawContent,
      summary,
      semanticFingerprint: fingerprint,
      role: role as UnifiedMemoryItem['role'],
      tags: tags || this.extractTags(rawContent),
      accessHistory: [{ timestamp: Date.now(), context: 'initial_store', score: 1.0 }],
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      temporalDecay: 1.0,
      relatedMemories: [],
    };
  }

  private generateSummary(content: string): string {
    // Generate a summary: first sentence or first 200 chars
    const firstSentence = content.split(/[.!?]\s+/)[0];
    if (firstSentence && firstSentence.length <= 200) {
      return firstSentence.trim();
    }
    return content.substring(0, 200).trim() + '...';
  }

  private generateFingerprint(content: string): string {
    // Normalize: lowercase, strip punctuation, trim whitespace
    const normalized = content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return simpleHash(normalized);
  }

  // ============================================================
  // Store
  // ============================================================

  async storeEpisodic(content: string, role: string, tags?: TagSet): Promise<string> {
    const mem = this.formatMemory(content, 'episodic', role, tags);

    const node = await this.storage.graph.createNode({
      type: 'memory',
      content: JSON.stringify({ ...mem, id: 'TEMP_ID' }),
      metadata: { memoryType: 'episodic', role, tags: mem.tags },
      salienceScore: 0.5,
      retrievalCount: 0,
      strength: 1.0,
      decayRate: 0.01,
    });

    await this.storage.graph.updateNode(node.id, {
      content: JSON.stringify({ ...mem, id: node.id }),
    });

    return node.id;
  }

  async storeSemantic(content: string, role: string, tags?: TagSet): Promise<string> {
    const mem = this.formatMemory(content, 'semantic', role, tags);

    const node = await this.storage.graph.createNode({
      type: 'memory',
      content: JSON.stringify({ ...mem, id: 'TEMP_ID' }),
      metadata: { memoryType: 'semantic', role, tags: mem.tags },
      salienceScore: 0.7,
      retrievalCount: 0,
      strength: 1.0,
      decayRate: 0.005,
    });

    await this.storage.graph.updateNode(node.id, {
      content: JSON.stringify({ ...mem, id: node.id }),
    });

    // Also index in vector store
    this.storage.vector.addVector('memories', node.id, this.textToVector(content), {
      memoryType: 'semantic',
      role,
      tags: JSON.stringify(mem.tags),
    }).catch(() => { /* vector index may not exist yet */ });

    return node.id;
  }

  async storeProcedural(content: string, role: string): Promise<string> {
    const mem = this.formatMemory(content, 'procedural', role);

    const node = await this.storage.graph.createNode({
      type: 'memory',
      content: JSON.stringify({ ...mem, id: 'TEMP_ID' }),
      metadata: { memoryType: 'procedural', role },
      salienceScore: 0.8,
      retrievalCount: 0,
      strength: 1.0,
      decayRate: 0.002,
    });

    await this.storage.graph.updateNode(node.id, {
      content: JSON.stringify({ ...mem, id: node.id }),
    });

    return node.id;
  }

  // ============================================================
  // Dedup
  // ============================================================

  async checkDuplicate(content: string): Promise<{ isDuplicate: boolean; existingId?: string }> {
    const fingerprint = this.generateFingerprint(content);
    const allNodes = await this.storage.graph.getAllNodes();

    for (const node of allNodes) {
      try {
        const item: UnifiedMemoryItem = JSON.parse(node.content);
        if (item.semanticFingerprint === fingerprint) {
          return { isDuplicate: true, existingId: item.id };
        }
      } catch {
        // Skip malformed nodes
      }
    }

    // Also check by similarity using vector search
    const similarities = allNodes
      .filter(n => {
        try {
          const item: UnifiedMemoryItem = JSON.parse(n.content);
          return item.type === 'semantic';
        } catch { return false; }
      })
      .map(n => {
        try {
          const item: UnifiedMemoryItem = JSON.parse(n.content);
          const sim = this.computeTextSimilarity(content, item.rawContent);
          return { id: item.id, similarity: sim };
        } catch { return { id: '', similarity: 0 }; }
      })
      .filter(s => s.similarity > 0.85)
      .sort((a, b) => b.similarity - a.similarity);

    if (similarities.length > 0 && similarities[0].similarity > 0.9) {
      return { isDuplicate: true, existingId: similarities[0].id };
    }

    return { isDuplicate: false };
  }

  async mergeMemories(existingId: string, newContent: string): Promise<void> {
    const node = await this.storage.graph.getNode(existingId);
    if (!node) return;

    try {
      const item: UnifiedMemoryItem = JSON.parse(node.content);
      item.rawContent = item.rawContent + '\n---\n' + newContent;
      item.summary = this.generateSummary(item.rawContent);
      item.semanticFingerprint = this.generateFingerprint(item.rawContent);
      item.lastAccessedAt = Date.now();
      item.accessHistory.push({ timestamp: Date.now(), context: 'merge', score: 0.8 });

      await this.storage.graph.updateNode(existingId, {
        content: JSON.stringify(item),
        strength: Math.min(node.strength + 0.2, 1.0),
        retrievalCount: node.retrievalCount + 1,
      });
    } catch {
      // Skip malformed node
    }
  }

  // ============================================================
  // Activity Score
  // ============================================================

  async calculateActivityScore(memory: any, query?: string): Promise<number> {
    const now = Date.now();

    // Frequency score: based on retrieval count and access history
    const retrievalCount = memory.retrievalCount || 0;
    const accessCount = (memory.accessHistory?.length || 0) + retrievalCount;
    const frequencyScore = Math.min(accessCount / 20, 1.0);

    // Temporal score: based on recency
    const lastAccessed = memory.lastAccessedAt || memory.createdAt || now;
    const ageMs = now - lastAccessed;
    const halfLife = 7 * 24 * 60 * 60 * 1000; // 7 days
    const temporalScore = Math.exp(-ageMs / halfLife);

    // Semantic score: relevance to query if provided
    let semanticScore = 0.5;
    if (query) {
      const content = typeof memory.rawContent === 'string' ? memory.rawContent : (memory.content || '');
      semanticScore = this.computeTextSimilarity(query, content);
    }

    // Relation score: based on connected edges
    let relationScore = 0.3;
    if (memory.id) {
      const outEdges = await this.storage.graph.getEdgesBySource(memory.id);
      const inEdges = await this.storage.graph.getEdgesByTarget(memory.id);
      const totalEdges = outEdges.length + inEdges.length;
      relationScore = Math.min(totalEdges / 10, 1.0);
    }

    // Weighted formula: 0.4 * frequencyScore + 0.3 * temporalScore + 0.2 * semanticScore + 0.1 * relationScore
    return 0.4 * frequencyScore + 0.3 * temporalScore + 0.2 * semanticScore + 0.1 * relationScore;
  }

  // ============================================================
  // Tag System
  // ============================================================

  extractTags(content: string): TagSet {
    const lower = content.toLowerCase();

    const matchKeywords = (keywordMap: Record<string, string[]>): string[] => {
      const matched: Record<string, number> = {};
      for (const [tag, keywords] of Object.entries(keywordMap)) {
        let count = 0;
        for (const kw of keywords) {
          if (lower.includes(kw.toLowerCase())) {
            count++;
          }
        }
        if (count > 0) {
          matched[tag] = count;
        }
      }
      return Object.entries(matched)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);
    };

    const domain = matchKeywords(DOMAIN_KEYWORDS);
    const industry = matchKeywords(INDUSTRY_KEYWORDS);
    const concept = matchKeywords(CONCEPT_KEYWORDS);
    const action = matchKeywords(ACTION_KEYWORDS);

    // Sentiment detection
    let sentiment = 'neutral';
    let maxSentimentScore = 0;
    for (const [sentimentType, wordsStr] of Object.entries(SENTIMENT_WORDS)) {
      const words = wordsStr.split(' ');
      let score = 0;
      for (const w of words) {
        if (lower.includes(w.toLowerCase())) {
          score++;
        }
      }
      if (score > maxSentimentScore) {
        maxSentimentScore = score;
        sentiment = sentimentType;
      }
    }

    return { domain, industry, concept, action, sentiment };
  }

  async buildTagGraph(): Promise<{ nodes: TagNode[]; edges: TagEdge[] }> {
    const allNodes = await this.storage.graph.getAllNodes();
    const tagCount: Map<string, number> = new Map();
    const coOccurrence: Map<string, Map<string, number>> = new Map();

    for (const node of allNodes) {
      try {
        const item: UnifiedMemoryItem = JSON.parse(node.content);
        const tags = item.tags;
        if (!tags) continue;

        const allTags = [
          ...(tags.domain || []),
          ...(tags.industry || []),
          ...(tags.concept || []),
          ...(tags.action || []),
        ];

        // Count individual tags
        for (const tag of allTags) {
          tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
        }

        // Count co-occurrences
        for (let i = 0; i < allTags.length; i++) {
          for (let j = i + 1; j < allTags.length; j++) {
            const [a, b] = [allTags[i], allTags[j]].sort();
            if (!coOccurrence.has(a)) coOccurrence.set(a, new Map());
            const inner = coOccurrence.get(a)!;
            inner.set(b, (inner.get(b) || 0) + 1);
          }
        }
      } catch {
        // Skip malformed
      }
    }

    // Build nodes
    const nodes: TagNode[] = [];
    const tagDegree: Map<string, number> = new Map();

    for (const [tag, weight] of tagCount.entries()) {
      nodes.push({
        id: tag,
        name: tag,
        weight,
        degree: 0, // will be updated
      });
    }

    // Build edges
    const edges: TagEdge[] = [];
    for (const [source, targets] of coOccurrence.entries()) {
      for (const [target, weight] of targets.entries()) {
        edges.push({
          source,
          target,
          weight,
          label: `${weight} co-occurrences`,
        });
        tagDegree.set(source, (tagDegree.get(source) || 0) + 1);
        tagDegree.set(target, (tagDegree.get(target) || 0) + 1);
      }
    }

    // Update degrees in nodes
    for (const node of nodes) {
      node.degree = tagDegree.get(node.name) || 0;
    }

    return { nodes, edges };
  }

  async getTagNeighbors(tag: string, depth: number = 1): Promise<string[]> {
    const tagGraph = await this.buildTagGraph();
    const visited = new Set<string>([tag]);
    const queue: { name: string; d: number }[] = [{ name: tag, d: 0 }];
    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.d > depth) continue;
      if (current.name !== tag) {
        result.push(current.name);
      }

      if (current.d < depth) {
        const neighbors = tagGraph.edges
          .filter(e => e.source === current.name || e.target === current.name)
          .map(e => e.source === current.name ? e.target : e.source);

        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push({ name: n, d: current.d + 1 });
          }
        }
      }
    }

    return result;
  }

  async spreadingActivation(seedTags: string[], maxDepth: number = 3): Promise<{ tag: string; activation: number }[]> {
    const activations: Map<string, number> = new Map();
    const tagGraph = await this.buildTagGraph();

    // Initialize seed activations
    for (const tag of seedTags) {
      activations.set(tag, 1.0);
    }

    // Build adjacency for quick lookup
    const adjacency: Map<string, Map<string, number>> = new Map();
    for (const edge of tagGraph.edges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Map());
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Map());
      adjacency.get(edge.source)!.set(edge.target, edge.weight);
      adjacency.get(edge.target)!.set(edge.source, edge.weight);
    }

    // Spread activation
    for (let depth = 0; depth < maxDepth; depth++) {
      const currentActivations = new Map(activations);
      const decay = 0.5 / (depth + 1);

      for (const [tag, activation] of currentActivations.entries()) {
        const neighbors = adjacency.get(tag);
        if (!neighbors) continue;

        const totalWeight = Array.from(neighbors.values()).reduce((a, b) => a + b, 0);
        if (totalWeight === 0) continue;

        for (const [neighbor, weight] of neighbors.entries()) {
          const spreadAmount = activation * decay * (weight / totalWeight);
          activations.set(neighbor, (activations.get(neighbor) || 0) + spreadAmount);
        }
      }
    }

    // Normalize and sort
    const maxActivation = Math.max(...activations.values(), 1);
    return Array.from(activations.entries())
      .map(([tag, activation]) => ({ tag, activation: activation / maxActivation }))
      .sort((a, b) => b.activation - a.activation);
  }

  async evolveTags(): Promise<void> {
    const allNodes = await this.storage.graph.getAllNodes();
    const tagFrequency: Map<string, number> = new Map();
    let totalMemories = 0;

    for (const node of allNodes) {
      try {
        const item: UnifiedMemoryItem = JSON.parse(node.content);
        totalMemories++;
        const allTags = [
          ...(item.tags?.domain || []),
          ...(item.tags?.industry || []),
          ...(item.tags?.concept || []),
          ...(item.tags?.action || []),
        ];
        for (const tag of allTags) {
          tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1);
        }
      } catch { /* skip */ }
    }

    // Update salience scores based on tag frequency
    for (const node of allNodes) {
      try {
        const item: UnifiedMemoryItem = JSON.parse(node.content);
        const allTags = [
          ...(item.tags?.domain || []),
          ...(item.tags?.industry || []),
          ...(item.tags?.concept || []),
          ...(item.tags?.action || []),
        ];

        // Higher salience for memories with popular tags
        const avgTagFreq = allTags.length > 0
          ? allTags.reduce((sum, t) => sum + (tagFrequency.get(t) || 0), 0) / allTags.length
          : 0;
        const salienceBoost = Math.min(avgTagFreq / Math.max(totalMemories, 1), 0.5);

        await this.storage.graph.updateNode(node.id, {
          salienceScore: Math.min((node.salienceScore || 0.5) + salienceBoost, 1.0),
        });
      } catch { /* skip */ }
    }
  }

  private scheduleTagEvolution(): void {
    // Run tag evolution every 6 hours
    this._tagEvolutionTimer = setInterval(async () => {
      await this.evolveTags();
    }, 6 * 60 * 60 * 1000);
  }

  // ============================================================
  // Retrieval
  // ============================================================

  async retrieve(query: string, maxResults: number = 10): Promise<any[]> {
    const allNodes = await this.storage.graph.getAllNodes();
    const results: { node: any; score: number }[] = [];

    for (const node of allNodes) {
      try {
        const item: UnifiedMemoryItem = JSON.parse(node.content);
        const textSimilarity = this.computeTextSimilarity(query, item.rawContent);
        const tagSimilarity = this.computeTagSimilarity(query, item.tags);
        const activityScore = await this.calculateActivityScore(
          { ...node, ...item, rawContent: item.rawContent },
          query
        );

        // Combined score: 0.5 text + 0.2 tag + 0.3 activity
        const combinedScore = 0.5 * textSimilarity + 0.2 * tagSimilarity + 0.3 * activityScore;

        if (combinedScore > 0.1) {
          results.push({
            node: { ...item, graphNodeId: node.id },
            score: combinedScore,
          });
        }
      } catch {
        // Skip malformed
      }
    }

    // Update retrieval counts
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, maxResults);

    for (const r of topResults) {
      if (r.node.graphNodeId) {
        const node = await this.storage.graph.getNode(r.node.graphNodeId);
        if (node) {
          await this.storage.graph.updateNode(r.node.graphNodeId, {
            retrievalCount: node.retrievalCount + 1,
            lastRetrieved: Date.now(),
          });
        }
      }
    }

    return topResults.map(r => r.node);
  }

  async retrieveByTag(tag: string): Promise<any[]> {
    const allNodes = await this.storage.graph.getAllNodes();
    const results: any[] = [];

    for (const node of allNodes) {
      try {
        const item: UnifiedMemoryItem = JSON.parse(node.content);
        const allTags = [
          ...(item.tags?.domain || []),
          ...(item.tags?.industry || []),
          ...(item.tags?.concept || []),
          ...(item.tags?.action || []),
        ];
        if (allTags.includes(tag)) {
          results.push({ ...item, graphNodeId: node.id });
        }
      } catch { /* skip */ }
    }

    return results;
  }

  async retrieveByTimeRange(start: number, end: number): Promise<any[]> {
    const allNodes = await this.storage.graph.getAllNodes();
    const results: any[] = [];

    for (const node of allNodes) {
      try {
        const item: UnifiedMemoryItem = JSON.parse(node.content);
        if (item.createdAt >= start && item.createdAt <= end) {
          results.push({ ...item, graphNodeId: node.id });
        }
      } catch { /* skip */ }
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ============================================================
  // Temporal Locality
  // ============================================================

  getRecentMessages(conversationId: string, count: number = 10): any[] {
    const messages = this.storage.sqlite.getMessages(conversationId);
    return messages.slice(-count);
  }

  // ============================================================
  // User Pinning
  // ============================================================

  pinMemory(memoryId: string): void {
    this.pinnedMemories.add(memoryId);
  }

  unpinMemory(memoryId: string): void {
    this.pinnedMemories.delete(memoryId);
  }

  async getPinnedMemories(): Promise<any[]> {
    const results: any[] = [];
    for (const id of this.pinnedMemories) {
      const node = await this.storage.graph.getNode(id);
      if (node) {
        try {
          const item: UnifiedMemoryItem = JSON.parse(node.content);
          results.push({ ...item, graphNodeId: node.id });
        } catch { /* skip */ }
      }
    }
    return results;
  }

  isPinned(memoryId: string): boolean {
    return this.pinnedMemories.has(memoryId);
  }

  // ============================================================
  // Context Builder
  // ============================================================

  async buildContext(userInput: string, conversationId: string, maxMemories: number = 5): Promise<string> {
    const parts: string[] = [];

    // 1. Current message
    parts.push(`[Current Message]\nUser: ${userInput}`);

    // 2. Recent messages from conversation
    const recentMessages = this.getRecentMessages(conversationId, 10);
    if (recentMessages.length > 0) {
      parts.push('\n[Recent Conversation]');
      for (const msg of recentMessages) {
        parts.push(`${msg.role}: ${msg.content}`);
      }
    }

    // 3. Pinned memories (always included)
    const pinned = await this.getPinnedMemories();
    if (pinned.length > 0) {
      parts.push('\n[Pinned Memories]');
      for (const mem of pinned) {
        parts.push(`- ${mem.summary || mem.rawContent?.substring(0, 200)}`);
      }
    }

    // 4. Top K relevant memories
    const retrieved = await this.retrieve(userInput, maxMemories);
    if (retrieved.length > 0) {
      parts.push('\n[Relevant Memories]');
      for (const mem of retrieved) {
        const isPinned = this.isPinned(mem.graphNodeId || mem.id);
        if (!isPinned) {
          parts.push(`- ${mem.summary || mem.rawContent?.substring(0, 200)}`);
        }
      }
    }

    // 5. Working memory
    const working = this.getWorking(conversationId);
    if (working.length > 0) {
      parts.push('\n[Working Context]');
      for (const item of working.slice(0, 5)) {
        parts.push(`- [${item.type}] ${item.content}`);
      }
    }

    return parts.join('\n');
  }

  // ============================================================
  // Consolidation
  // ============================================================

  async consolidateWorking(conversationId: string): Promise<void> {
    const items = this.workingMemory.get(conversationId);
    if (!items || items.length === 0) return;

    // Group items by type
    const byType: Map<string, WorkingMemoryItem[]> = new Map();
    for (const item of items) {
      if (!byType.has(item.type)) byType.set(item.type, []);
      byType.get(item.type)!.push(item);
    }

    // Store each group as a consolidated memory
    for (const [type, groupItems] of byType.entries()) {
      const consolidatedContent = groupItems
        .sort((a, b) => b.relevance - a.relevance)
        .map(i => `[${i.type}] ${i.content}`)
        .join('\n');

      const tags = this.extractTags(consolidatedContent);

      if (type === 'user_message' || type === 'assistant_message') {
        await this.storeEpisodic(consolidatedContent, type === 'user_message' ? 'user' : 'assistant', tags);
      } else if (type === 'knowledge' || type === 'fact') {
        await this.storeSemantic(consolidatedContent, 'system', tags);
      } else if (type === 'action' || type === 'procedure') {
        await this.storeProcedural(consolidatedContent, 'system');
      }
    }

    // Clear working memory after consolidation
    this.clearWorking(conversationId);
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private computeTextSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 1));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 1));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private computeTagSimilarity(query: string, tags: TagSet): number {
    if (!tags) return 0;
    const queryTags = this.extractTags(query);
    const allQueryTags = new Set([
      ...queryTags.domain, ...queryTags.industry,
      ...queryTags.concept, ...queryTags.action,
    ]);
    const allMemTags = new Set([
      ...(tags.domain || []), ...(tags.industry || []),
      ...(tags.concept || []), ...(tags.action || []),
    ]);

    if (allQueryTags.size === 0 || allMemTags.size === 0) return 0;

    let intersection = 0;
    for (const t of allQueryTags) {
      if (allMemTags.has(t)) intersection++;
    }

    const union = allQueryTags.size + allMemTags.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private textToVector(text: string): number[] {
    // Simple TF-like vector based on character n-grams
    const vector: number[] = new Array(128).fill(0);
    const lower = text.toLowerCase();

    // Character bigrams
    for (let i = 0; i < lower.length - 1; i++) {
      const bigram = lower.substring(i, i + 2);
      const hash = simpleHash(bigram);
      const idx = parseInt(hash, 36) % 128;
      vector[idx] += 1;
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }
}