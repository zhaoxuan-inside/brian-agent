import { InformationService } from '../information';
import { LLMService } from '../llm';
import { StorageService } from '../storage';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../infrastructure/logger';
import type { LearningQueueItem, LearningBatch, LearningPlan, TagSet } from '../../shared/types';
import { DriverConfiguration, DriverConfig } from './driverConfig';

interface KnowledgeItem {
  content: string;
  source: string;
  confidence: number;
}

interface Preference {
  category: string;
  key: string;
  value: string;
  confidence: number;
}

interface KnowledgeGap {
  topic: string;
  gap: string;
}

interface Insight {
  content: string;
  insight: string;
  timestamp: number;
}

export class LearningService {
  private information: InformationService;
  private _llm: LLMService;
  private storage: StorageService;
  private queue: LearningQueueItem[] = [];
  private plans: LearningPlan[] = [];
  private insights: Insight[] = [];
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private isIdleState: boolean = true;
  private batches: LearningBatch[] = [];
  private driverConfig: DriverConfiguration;
  private currentWeights: Record<string, number> = {};
  private learningCycleCount: number = 0;

  constructor(information: InformationService, llm: LLMService, storage: StorageService) {
    this.information = information;
    this._llm = llm;
    this.storage = storage;
    this.driverConfig = new DriverConfiguration();
    this.currentWeights = this.driverConfig.getCurrentWeights();
  }

  // ============================================================
  // Passive Learning
  // ============================================================

  onMessage(message: { role: string; content: string }): void {
    // Extract knowledge from the message
    const knowledgeItems = this.extractKnowledge(message.content);
    logger.info('Learning', `onMessage called with ${knowledgeItems.length} knowledge items`, {
      role: message.role,
      contentLength: message.content.length,
    });
    if (knowledgeItems.length > 0) {
      logger.info('Learning', `Enqueuing ${knowledgeItems.length} knowledge items`, {
        items: knowledgeItems.map(k => k.content),
      });
      this.enqueueLearning(knowledgeItems);
    }

    // Extract user preferences
    const preference = this.extractPreference(message.content);
    if (preference) {
      this.updateUserProfile('', preference);
    }

    // Detect knowledge gaps
    const gap = this.detectKnowledgeGap(message.content);
    if (gap) {
      // Store the gap for future active learning
      this.information.addToWorking('learning_gaps', {
        content: JSON.stringify(gap),
        type: 'knowledge_gap',
        relevance: 0.8,
      });
    }
  }

  extractKnowledge(content: string): KnowledgeItem[] {
    const items: KnowledgeItem[] = [];

    // Pattern-based knowledge extraction
    const patterns = [
      // "X is Y" - definitional
      { regex: /(\w+(?:\s+\w+){0,5})\s+is\s+(?:a\s+)?(\w+(?:\s+\w+){0,10})/gi, confidence: 0.6, source: 'definition' },
      // "X means Y"
      { regex: /(\w+(?:\s+\w+){0,3})\s+means\s+(\w+(?:\s+\w+){0,10})/gi, confidence: 0.7, source: 'definition' },
      // "to X, you need to Y" - procedural
      { regex: /to\s+(\w+(?:\s+\w+){0,5}),?\s+you\s+(?:need\s+to|should|must|can)\s+(\w+(?:\s+\w+){0,10})/gi, confidence: 0.5, source: 'procedure' },
      // "X can be used to Y" - capability
      { regex: /(\w+(?:\s+\w+){0,5})\s+can\s+(?:be\s+used\s+to|help|also)\s+(\w+(?:\s+\w+){0,10})/gi, confidence: 0.5, source: 'capability' },
    ];

    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const knowledge = `${match[1]} -> ${match[2]}`;
        items.push({
          content: knowledge,
          source: pattern.source,
          confidence: pattern.confidence,
        });
      }
    }

    // Extract key-value pairs from structured content
    const kvPattern = /(\w+(?:\s+\w+){0,3})\s*[:=]\s*(\w+(?:\s+\w+){0,10})/g;
    let kvMatch;
    while ((kvMatch = kvPattern.exec(content)) !== null) {
      // Avoid matching common patterns like URLs
      if (!kvMatch[0].includes('http') && kvMatch[1].length < 30) {
        items.push({
          content: `${kvMatch[1].trim()} = ${kvMatch[2].trim()}`,
          source: 'key_value',
          confidence: 0.4,
        });
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return items.filter(item => {
      const key = item.content.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  extractPreference(content: string): Preference | null {
    // Preference indicators
    const indicators = [
      { pattern: /i\s+(?:prefer|like|love|enjoy|want)\s+(\w+(?:\s+\w+){0,10})/i, category: 'general' },
      { pattern: /i\s+(?:don't\s+like|dislike|hate|avoid)\s+(\w+(?:\s+\w+){0,10})/i, category: 'general', negative: true },
      { pattern: /use\s+(\w+(?:\s+\w+){0,5})\s+(?:instead|rather|preferably)/i, category: 'tool_preference' },
      { pattern: /i\s+(?:always|usually|generally)\s+(\w+(?:\s+\w+){0,10})/i, category: 'habit' },
      { pattern: /my\s+(?:favorite|preferred|go-to)\s+(\w+(?:\s+\w+){0,5})\s+is\s+(\w+(?:\s+\w+){0,5})/i, category: 'preference' },
    ];

    for (const indicator of indicators) {
      const match = indicator.pattern.exec(content);
      if (match) {
        const value = indicator.negative ? `dislike:${match[1].trim()}` : match[1].trim();
        const key = match[2] ? match[1].trim() : 'preference';
        return {
          category: indicator.category,
          key: key,
          value: value,
          confidence: 0.6,
        };
      }
    }

    return null;
  }

  updateUserProfile(userId: string, preference: Preference): void {
    this.storage.sqlite.setPreference(
      userId,
      preference.category,
      preference.key,
      preference.value,
      preference.confidence,
      'learning_service'
    );
  }

  detectKnowledgeGap(content: string): KnowledgeGap | null {
    // Gap indicators
    const gapPatterns = [
      { pattern: /i\s+(?:don't\s+know|not\s+sure|wonder)\s+(?:about\s+)?(\w+(?:\s+\w+){0,10})/i, topic: 'general' },
      { pattern: /(?:how|what|why|when|where)\s+(?:do|does|is|are|can|should)\s+(?:i|you|we)\s+(\w+(?:\s+\w+){0,10})/i, topic: 'question' },
      { pattern: /i\s+need\s+to\s+(?:learn|understand|figure\s+out)\s+(\w+(?:\s+\w+){0,10})/i, topic: 'learning' },
      { pattern: /can\s+(?:you|someone)\s+(?:explain|clarify|elaborate)\s+(\w+(?:\s+\w+){0,10})/i, topic: 'clarification' },
    ];

    for (const gp of gapPatterns) {
      const match = gp.pattern.exec(content);
      if (match) {
        return {
          topic: gp.topic,
          gap: match[1].trim(),
        };
      }
    }

    return null;
  }

  enqueueLearning(knowledgeItems: KnowledgeItem[]): void {
    for (const item of knowledgeItems) {
      const id = uuidv4();
      const queueItem: LearningQueueItem = {
        id,
        knowledgeItem: {
          content: item.content,
          source: item.source,
          confidence: item.confidence,
        },
        priority: Math.round(item.confidence * 10),
        status: 'pending',
        createdAt: Date.now(),
      };
      this.queue.push(queueItem);
    }

    // Keep queue bounded
    if (this.queue.length > 1000) {
      this.queue.sort((a, b) => b.priority - a.priority);
      this.queue.length = 1000;
    }
  }

  // ============================================================
  // Learning Queue
  // ============================================================

  getQueue(): LearningQueueItem[] {
    return [...this.queue].sort((a, b) => b.priority - a.priority);
  }

  prioritize(itemId: string, priority: number): void {
    const item = this.queue.find(q => q.id === itemId);
    if (item) {
      item.priority = priority;
    }
  }

  skip(itemId: string): void {
    const item = this.queue.find(q => q.id === itemId);
    if (item) {
      item.status = 'skipped';
    }
  }

  batchApprove(itemIds: string[]): void {
    for (const id of itemIds) {
      const item = this.queue.find(q => q.id === id);
      if (item) {
        item.status = 'approved';
      }
    }
  }

  getQueueStats(): { total: number; pending: number; approved: number; skipped: number; learning: number; completed: number } {
    const stats = { total: this.queue.length, pending: 0, approved: 0, skipped: 0, learning: 0, completed: 0 };
    for (const item of this.queue) {
      switch (item.status) {
        case 'pending': stats.pending++; break;
        case 'approved': stats.approved++; break;
        case 'skipped': stats.skipped++; break;
        case 'learning': stats.learning++; break;
        case 'completed': stats.completed++; break;
      }
    }
    return stats;
  }

  // ============================================================
  // Learning Batcher
  // ============================================================

  batch(): LearningBatch[] {
    const approved = this.queue.filter(q => q.status === 'approved');
    if (approved.length === 0) {
      this.batches = [];
      return [];
    }

    // Group by tags from InformationService
    const tagGroups: Map<string, LearningQueueItem[]> = new Map();

    for (const item of approved) {
      const tags = this.extractTagsFromLearning(item.knowledgeItem);
      const allTags = [...tags.domain, ...tags.industry, ...tags.concept, ...tags.action];

      if (allTags.length === 0) {
        if (!tagGroups.has('general')) tagGroups.set('general', []);
        tagGroups.get('general')!.push(item);
        continue;
      }

      for (const tag of allTags) {
        if (tagGroups.has(tag)) {
          tagGroups.get(tag)!.push(item);
          break;
        }
      }

      const firstTag = allTags[0];
      if (!tagGroups.has(firstTag)) {
        tagGroups.set(firstTag, []);
        tagGroups.get(firstTag)!.push(item);
      } else {
        tagGroups.get(firstTag)!.push(item);
      }
    }

    this.batches = [];
    for (const [topic, items] of tagGroups.entries()) {
      const avgConfidence = items.reduce((sum, i) => sum + i.knowledgeItem.confidence, 0) / items.length;
      const avgPriority = items.reduce((sum, i) => sum + i.priority, 0) / items.length;
      const relevanceScore = (avgConfidence + avgPriority / 10) / 2;

      this.batches.push({
        id: uuidv4(),
        topic,
        items: [...items],
        relevanceScore: Math.round(relevanceScore * 100) / 100,
        createdAt: Date.now(),
      });
    }

    return this.batches.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  // ============================================================
  // Learning Planner
  // ============================================================

  createPlan(batchId: string): LearningPlan {
    const batch = this.batches.find(b => b.id === batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const itemIds = batch.items.map(i => i.id);
    const itemsPerPhase = Math.ceil(itemIds.length / 4);

    const plan: LearningPlan = {
      id: uuidv4(),
      batchId,
      phases: [
        {
          phase: 1,
          name: 'Exploration',
          status: 'pending',
          items: itemIds.slice(0, itemsPerPhase),
        },
        {
          phase: 2,
          name: 'Comprehension',
          status: 'pending',
          items: itemIds.slice(itemsPerPhase, itemsPerPhase * 2),
        },
        {
          phase: 3,
          name: 'Application',
          status: 'pending',
          items: itemIds.slice(itemsPerPhase * 2, itemsPerPhase * 3),
        },
        {
          phase: 4,
          name: 'Mastery',
          status: 'pending',
          items: itemIds.slice(itemsPerPhase * 3),
        },
      ],
      createdAt: Date.now(),
    };

    this.plans.push(plan);

    // Mark items as learning
    for (const id of itemIds) {
      const item = this.queue.find(q => q.id === id);
      if (item) {
        item.status = 'learning';
      }
    }

    return plan;
  }

  getNextPhase(planId: string): LearningPlan['phases'][0] | null {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) return null;

    return plan.phases.find(p => p.status === 'pending') || null;
  }

  completePhase(planId: string, phaseId: number): void {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) return;

    const phase = plan.phases.find(p => p.phase === phaseId);
    if (!phase) return;

    phase.status = 'completed';
    phase.completedAt = Date.now();

    // Mark items as completed
    for (const itemId of phase.items) {
      const item = this.queue.find(q => q.id === itemId);
      if (item) {
        item.status = 'completed';
      }
    }

    // Set next phase to in_progress if exists
    const nextPhase = plan.phases.find(p => p.phase === phaseId + 1 && p.status === 'pending');
    if (nextPhase) {
      nextPhase.status = 'in_progress';
      nextPhase.startedAt = Date.now();
    }
  }

  isStarvation(): boolean {
    const pending = this.queue.filter(q => q.status === 'pending');
    if (pending.length === 0) return false;

    const oldest = pending.reduce((min, q) => Math.min(min, q.createdAt), Infinity);
    const ageMs = Date.now() - oldest;
    const starvationThreshold = 24 * 60 * 60 * 1000; // 24 hours

    return ageMs > starvationThreshold;
  }

  rebalance(): void {
    // Boost priority of long-pending items
    const now = Date.now();
    for (const item of this.queue) {
      if (item.status === 'pending') {
        const ageMs = now - item.createdAt;
        const ageBoost = Math.min(ageMs / (24 * 60 * 60 * 1000), 5); // Max 5x boost over 5 days
        item.priority = Math.min(Math.round(item.priority * (1 + ageBoost)), 100);
      }
    }
  }

  // ============================================================
  // Driver Weights Management
  // ============================================================

  getDriverWeights(): Record<string, number> {
    return { ...this.currentWeights };
  }

  setDriverWeights(weights: Partial<Record<string, number>>): Record<string, number> {
    this.currentWeights = this.driverConfig.setWeights(weights);
    logger.info('Learning', 'Driver weights updated', { weights: this.currentWeights });
    return this.currentWeights;
  }

  resetDriverWeights(): Record<string, number> {
    this.currentWeights = this.driverConfig.resetWeights();
    logger.info('Learning', 'Driver weights reset to defaults', { weights: this.currentWeights });
    return this.currentWeights;
  }

  recordHit(driver: string): void {
    this.driverConfig.recordHit(driver);
    this.adjustWeightsBasedOnHitRates();
  }

  recordMiss(driver: string): void {
    this.driverConfig.recordMiss(driver);
    this.adjustWeightsBasedOnHitRates();
  }

  getDriverHitRates(): Record<string, { hits: number; total: number }> {
    return this.driverConfig.getHitRates();
  }

  resetHitRates(): void {
    this.driverConfig.resetHitRates();
    logger.info('Learning', 'Hit rates reset');
  }

  getDriverStats(): Record<string, {
    name: string;
    weight: number;
    defaultWeight: number;
    minWeight: number;
    maxWeight: number;
    hitRate: string;
    hits: number;
    total: number;
    adjustmentRange: number;
  }> {
    return this.driverConfig.getDriverStats();
  }

  getDrivers(): DriverConfig[] {
    return this.driverConfig.getDrivers();
  }

  addDriver(config: DriverConfig): void {
    this.driverConfig.addDriver(config);
    this.currentWeights = this.driverConfig.getCurrentWeights();
    this.normalizeWeightsAfterAdd();
    logger.info('Learning', 'New driver added', { driver: config.key, weights: this.currentWeights });
  }

  private normalizeWeightsAfterAdd(): void {
    const total = Object.values(this.currentWeights).reduce((a, b) => a + b, 0);
    if (total !== 100) {
      const scale = 100 / total;
      for (const key of Object.keys(this.currentWeights)) {
        this.currentWeights[key] = Math.round(this.currentWeights[key] * scale);
      }
      logger.info('Learning', 'Weights normalized after adding driver', { weights: this.currentWeights });
    }
  }

  removeDriver(key: string): void {
    this.driverConfig.removeDriver(key);
    this.currentWeights = this.driverConfig.getCurrentWeights();
    logger.info('Learning', 'Driver removed', { driver: key });
  }

  private adjustWeightsBasedOnHitRates(): void {
    const baseWeights = this.driverConfig.getCurrentWeights();
    const adjustedWeights = this.driverConfig.calculateAdjustedWeights();
    
    this.currentWeights = adjustedWeights;
    
    logger.info('Learning', 'Driver weights adjusted based on hit rates', {
      previousWeights: baseWeights,
      currentWeights: this.currentWeights,
      isUserConfigured: this.driverConfig.isUserConfigured(),
      driverStats: this.driverConfig.getDriverStats(),
    });
  }

  private calculateWeightedPriority(rawPriority: number, currentWeight: number, defaultWeight: number): number {
    return Math.round(rawPriority * currentWeight / defaultWeight);
  }

  private async generateDriverLearning(driverKey: string): Promise<{ content: string; priority: number; source: string }[]> {
    switch (driverKey) {
      case 'graphConnectivity':
        return this.generateGraphConnectivityLearning();
      case 'activationDriven':
        return this.generateActivationDrivenLearning();
      case 'recentInput':
        return this.generateRecentInputLearning();
      case 'hotTopic':
        return this.generateHotTopicLearning();
      default:
        logger.debug('ActiveLearning', `No built-in generator for driver: ${driverKey}`);
        return [];
    }
  }

  // ============================================================
  // Active Learning
  // ============================================================

  schedule(intervalMs: number = 300000): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
    }

    this.idleTimer = setInterval(async () => {
      if (this.isIdleState) {
        await this.performActiveLearning();
      }
    }, intervalMs);
  }

  isIdle(): boolean {
    return this.isIdleState;
  }

  private async performActiveLearning(): Promise<void> {
    this.learningCycleCount++;
    const learningItems: { content: string; priority: number; source: string; rawPriority: number }[] = [];

    logger.info('ActiveLearning', `Starting active learning cycle #${this.learningCycleCount}`, {
      driverWeights: this.currentWeights,
      isUserConfigured: this.driverConfig.isUserConfigured(),
    });

    const drivers = this.driverConfig.getDrivers();
    const weights = this.currentWeights;
    const defaultWeights = this.driverConfig.getDefaultWeights();

    const driverItemsMap = new Map<string, { content: string; priority: number; source: string }[]>();
    const weightCalculations: Record<string, string> = {};

    for (const driver of drivers) {
      logger.info('ActiveLearning', `Generating ${driver.key} learning items`);
      
      let items: { content: string; priority: number; source: string }[] = [];
      
      if (driver.generator) {
        items = await driver.generator();
      } else {
        items = await this.generateDriverLearning(driver.key);
      }

      driverItemsMap.set(driver.key, items);
      
      weightCalculations[driver.key] = `rawPriority * ${weights[driver.key]} / ${defaultWeights[driver.key]}`;
    }

    logger.info('ActiveLearning', 'Calculating weighted priorities', {
      weightCalculation: weightCalculations,
    });

    const weightedItems: { content: string; priority: number; source: string; rawPriority: number }[] = [];

    for (const driver of drivers) {
      const items = driverItemsMap.get(driver.key) || [];
      weightedItems.push(...items.map(item => ({
        ...item,
        rawPriority: item.priority,
        priority: this.calculateWeightedPriority(item.priority, weights[driver.key], defaultWeights[driver.key]),
      })));
    }

    learningItems.push(...weightedItems);

    const breakdown: Record<string, { count: number; minPriority: number; maxPriority: number }> = {};
    for (const driver of drivers) {
      const items = driverItemsMap.get(driver.key) || [];
      breakdown[driver.key] = {
        count: items.length,
        minPriority: items.length > 0 ? Math.min(...items.map(i => i.priority)) : 0,
        maxPriority: items.length > 0 ? Math.max(...items.map(i => i.priority)) : 0,
      };
    }

    logger.info('ActiveLearning', `Generated ${learningItems.length} learning items`, {
      breakdown,
      weights: this.currentWeights,
    });

    learningItems.sort((a, b) => b.priority - a.priority);

    logger.info('ActiveLearning', 'Final sorted learning items:', {
      items: learningItems.map((item, index) => ({
        rank: index + 1,
        source: item.source,
        priority: item.priority,
        rawPriority: item.rawPriority,
        weightMultiplier: (item.priority / item.rawPriority).toFixed(2),
        content: item.content.substring(0, 80),
      })),
    });

    const selectedItems = learningItems.slice(0, 5);
    logger.info('ActiveLearning', `Enqueuing top ${selectedItems.length} items`, {
      items: selectedItems.map(item => ({
        priority: item.priority,
        rawPriority: item.rawPriority,
        source: item.source,
        content: item.content.substring(0, 60),
      })),
    });

    for (const item of selectedItems) {
      this.enqueueLearning([{
        content: item.content,
        source: item.source,
        confidence: item.priority / 100,
      }]);
    }

    const newInsights = await this.reviewHistory();
    if (newInsights.length > 0) {
      this.insights.push(...newInsights);
      await this.consolidateKnowledge(newInsights);
    }

    const gaps = this.information.getWorking('learning_gaps');
    for (const gap of gaps.slice(0, 3)) {
      try {
        const parsedGap: KnowledgeGap = JSON.parse(gap.content);
        const questions = this.generateQuestions(parsedGap);
        for (const q of questions) {
          this.information.addToWorking('learning_questions', {
            content: q,
            type: 'generated_question',
            relevance: 0.7,
          });
        }
      } catch { /* skip */ }
    }

    if (this.isStarvation()) {
      this.rebalance();
    }
  }

  private async generateGraphConnectivityLearning(): Promise<{ content: string; priority: number; source: string }[]> {
    logger.info('ActiveLearning', 'Generating graph connectivity learning items');
    const tagGraph = await this.information.buildTagGraph();
    const learningItems: { content: string; priority: number; source: string }[] = [];

    const tagNodes = tagGraph.nodes;
    const tagEdges = tagGraph.edges;

    logger.info('ActiveLearning', `Tag graph: ${tagNodes.length} nodes, ${tagEdges.length} edges`, {
      topNodes: tagNodes.sort((a, b) => b.degree - a.degree).slice(0, 5).map(n => ({ name: n.name, degree: n.degree })),
    });

    const allTagPairs = new Set<string>();
    for (const edge of tagEdges) {
      const pair = [edge.source, edge.target].sort().join('-');
      allTagPairs.add(pair);
    }

    const highDegreeTags = tagNodes
      .filter(n => n.degree >= 2)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 10);

    logger.info('ActiveLearning', `Found ${highDegreeTags.length} high-degree tags (degree >= 2)`, {
      tags: highDegreeTags.map(n => ({ name: n.name, degree: n.degree })),
    });

    for (let i = 0; i < highDegreeTags.length; i++) {
      for (let j = i + 1; j < highDegreeTags.length; j++) {
        const tagA = highDegreeTags[i];
        const tagB = highDegreeTags[j];
        const pair = [tagA.name, tagB.name].sort().join('-');

        if (!allTagPairs.has(pair)) {
          const connectivityScore = (tagA.degree + tagB.degree) / 2;
          const priority = Math.round(40 + connectivityScore * 2);
          const finalPriority = Math.min(priority, 95);

          logger.debug('ActiveLearning', 'Graph connectivity: found potential connection', {
            tagA: tagA.name,
            tagADegree: tagA.degree,
            tagB: tagB.name,
            tagBDegree: tagB.degree,
            connectivityScore: connectivityScore.toFixed(2),
            priorityCalculation: `40 + ${connectivityScore.toFixed(2)} * 2 = ${priority}`,
            finalPriority,
          });

          learningItems.push({
            content: `${tagA.name} -> ${tagB.name}: potential connection`,
            priority: finalPriority,
            source: 'graph_connectivity',
          });
        }
      }
    }

    const isolatedTags = tagNodes.filter(n => n.degree === 0).slice(0, 5);
    logger.info('ActiveLearning', `Found ${isolatedTags.length} isolated tags (degree = 0)`, {
      tags: isolatedTags.map(n => n.name),
    });

    for (const isolated of isolatedTags) {
      logger.debug('ActiveLearning', 'Graph connectivity: isolated tag needs connection', {
        tag: isolated.name,
        priority: 35,
      });

      learningItems.push({
        content: `${isolated.name}: needs connections to other concepts`,
        priority: 35,
        source: 'graph_connectivity',
      });
    }

    const sortedItems = learningItems.sort((a, b) => b.priority - a.priority);
    logger.info('ActiveLearning', `Generated ${sortedItems.length} graph connectivity learning items`, {
      items: sortedItems.slice(0, 5).map(item => ({ priority: item.priority, content: item.content.substring(0, 60) })),
    });

    return sortedItems;
  }

  private async generateActivationDrivenLearning(): Promise<{ content: string; priority: number; source: string }[]> {
    logger.info('ActiveLearning', 'Generating activation-driven learning items');
    const allNodes = await this.storage.graph.getNodesByType('memory');
    const learningItems: { content: string; priority: number; source: string }[] = [];

    logger.info('ActiveLearning', `Total memory nodes: ${allNodes.length}`);

    const activatedNodes = allNodes
      .map(node => {
        try {
          const item = JSON.parse(node.content);
          return {
            node,
            retrievalCount: node.retrievalCount || 0,
            accessHistory: item.accessHistory || [],
            tags: item.tags || {},
            rawContent: item.rawContent || '',
            createdAt: item.createdAt || Date.now(),
          };
        } catch {
          return null;
        }
      })
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .filter(n => n.retrievalCount > 0 || n.accessHistory.length > 0)
      .sort((a, b) => {
        const scoreA = a.retrievalCount + a.accessHistory.length;
        const scoreB = b.retrievalCount + b.accessHistory.length;
        return scoreB - scoreA;
      })
      .slice(0, 10);

    logger.info('ActiveLearning', `Found ${activatedNodes.length} activated nodes`, {
      nodes: activatedNodes.map(n => ({
        retrievalCount: n.retrievalCount,
        accessHistoryLength: n.accessHistory.length,
        totalScore: n.retrievalCount + n.accessHistory.length,
        tags: [...(n.tags.domain || []), ...(n.tags.concept || [])].slice(0, 3),
      })),
    });

    for (const activated of activatedNodes) {
      const activationScore = activated.retrievalCount + activated.accessHistory.length;
      const priority = Math.round(40 + activationScore * 3);
      const finalPriority = Math.min(priority, 95);

      const allTags = [
        ...(activated.tags.domain || []),
        ...(activated.tags.concept || []),
      ].slice(0, 3);

      logger.debug('ActiveLearning', 'Activation-driven: generating learning item', {
        retrievalCount: activated.retrievalCount,
        accessHistoryLength: activated.accessHistory.length,
        activationScore,
        priorityCalculation: `40 + ${activationScore} * 3 = ${priority}`,
        finalPriority,
        tags: allTags,
      });

      if (allTags.length > 0) {
        learningItems.push({
          content: `${allTags.join(', ')}: deepen knowledge (activated ${activationScore} times)`,
          priority: finalPriority,
          source: 'activation_driven',
        });
      } else {
        learningItems.push({
          content: `${activated.rawContent.substring(0, 50)}...: strengthen frequently accessed knowledge`,
          priority: finalPriority,
          source: 'activation_driven',
        });
      }
    }

    const sortedItems = learningItems.sort((a, b) => b.priority - a.priority);
    logger.info('ActiveLearning', `Generated ${sortedItems.length} activation-driven learning items`, {
      items: sortedItems.slice(0, 5).map(item => ({ priority: item.priority, content: item.content.substring(0, 60) })),
    });

    return sortedItems;
  }

  private async generateRecentInputLearning(): Promise<{ content: string; priority: number; source: string }[]> {
    logger.info('ActiveLearning', 'Generating recent input learning items');
    const allNodes = await this.storage.graph.getNodesByType('memory');
    const learningItems: { content: string; priority: number; source: string }[] = [];

    logger.info('ActiveLearning', `Total memory nodes: ${allNodes.length}`);

    const recentMemories = allNodes
      .map(node => {
        try {
          const item = JSON.parse(node.content);
          return {
            item,
            createdAt: item.createdAt || Date.now(),
            role: item.role || '',
            tags: item.tags || {},
            rawContent: item.rawContent || '',
          };
        } catch {
          return null;
        }
      })
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .filter(n => n.role === 'user')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);

    logger.info('ActiveLearning', `Found ${recentMemories.length} recent user memories`, {
      memories: recentMemories.map((m, index) => ({
        rank: index + 1,
        timestamp: new Date(m.createdAt).toLocaleString(),
        content: m.rawContent.substring(0, 40),
        tags: [...(m.tags.domain || []), ...(m.tags.concept || [])].slice(0, 3),
      })),
    });

    const recentTags = new Set<string>();
    for (const memory of recentMemories) {
      const allTags = [
        ...(memory.tags.domain || []),
        ...(memory.tags.concept || []),
        ...(memory.tags.industry || []),
      ];
      allTags.forEach(t => recentTags.add(t));
    }

    logger.info('ActiveLearning', `Extracted ${recentTags.size} unique tags from recent memories`, {
      tags: Array.from(recentTags).slice(0, 8),
    });

    let priorityBase = 20;
    for (const tag of Array.from(recentTags).slice(0, 8)) {
      const priority = Math.min(priorityBase, 35);

      logger.debug('ActiveLearning', 'Recent input: generating learning item', {
        tag,
        priorityCalculation: `base ${priorityBase} (capped at 35)`,
        finalPriority: priority,
      });

      learningItems.push({
        content: `${tag}: explore user's recent interest`,
        priority: priority,
        source: 'recent_input',
      });
      priorityBase += 2;
    }

    if (recentMemories.length > 0) {
      const mostRecent = recentMemories[0];

      logger.debug('ActiveLearning', 'Recent input: generating follow-up learning item', {
        content: mostRecent.rawContent.substring(0, 40),
        priority: 25,
      });

      learningItems.push({
        content: `Follow up on: ${mostRecent.rawContent.substring(0, 60)}...`,
        priority: 25,
        source: 'recent_input',
      });
    }

    const sortedItems = learningItems.sort((a, b) => b.priority - a.priority);
    logger.info('ActiveLearning', `Generated ${sortedItems.length} recent input learning items`, {
      items: sortedItems.slice(0, 5).map(item => ({ priority: item.priority, content: item.content.substring(0, 60) })),
    });

    return sortedItems;
  }

  private async generateHotTopicLearning(): Promise<{ content: string; priority: number; source: string }[]> {
    logger.info('ActiveLearning', 'Generating hot topic learning items');
    const learningItems: { content: string; priority: number; source: string }[] = [];

    const hotTopics = await this.fetchHotTopics();
    logger.info('ActiveLearning', `Found ${hotTopics.length} hot topics`, {
      topics: hotTopics.slice(0, 5).map(t => ({ name: t.name, trendScore: t.trendScore })),
    });

    for (let i = 0; i < hotTopics.length && i < 5; i++) {
      const topic = hotTopics[i];
      const priority = Math.round(15 + topic.trendScore * 3);
      const finalPriority = Math.min(priority, 30);

      logger.debug('ActiveLearning', 'Hot topic: generating learning item', {
        topic: topic.name,
        trendScore: topic.trendScore,
        priorityCalculation: `15 + ${topic.trendScore} * 3 = ${priority}`,
        finalPriority,
      });

      learningItems.push({
        content: `${topic.name}: explore trending topic`,
        priority: finalPriority,
        source: 'hot_topic',
      });
    }

    const userTags = await this.getUserInterestTags();
    for (const tag of userTags.slice(0, 3)) {
      const relevantHotTopics = hotTopics.filter(t => 
        t.name.toLowerCase().includes(tag.toLowerCase()) || 
        tag.toLowerCase().includes(t.name.toLowerCase())
      );

      for (const topic of relevantHotTopics.slice(0, 2)) {
        const priority = Math.round(20 + topic.trendScore * 2);
        const finalPriority = Math.min(priority, 35);

        logger.debug('ActiveLearning', 'Hot topic: generating user-relevant learning item', {
          topic: topic.name,
          userTag: tag,
          trendScore: topic.trendScore,
          priorityCalculation: `20 + ${topic.trendScore} * 2 = ${priority}`,
          finalPriority,
        });

        learningItems.push({
          content: `${topic.name}: related to user's interest in ${tag}`,
          priority: finalPriority,
          source: 'hot_topic',
        });
      }
    }

    const sortedItems = learningItems.sort((a, b) => b.priority - a.priority);
    logger.info('ActiveLearning', `Generated ${sortedItems.length} hot topic learning items`, {
      items: sortedItems.slice(0, 5).map(item => ({ priority: item.priority, content: item.content.substring(0, 60) })),
    });

    return sortedItems;
  }

  private async fetchHotTopics(): Promise<{ name: string; trendScore: number; category: string }[]> {
    try {
      const response = await fetch('https://api.github.com/search/trending', {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json() as { items?: { name?: string; title?: string }[] };
        const topics = (data.items || []).slice(0, 5).map(item => ({
          name: item.name || item.title || '',
          trendScore: Math.min(9, Math.random() * 5 + 5),
          category: 'technology',
        }));
        return topics;
      }
    } catch {
      logger.debug('ActiveLearning', 'Hot topic API request failed');
    }

    return [];
  }

  private async getUserInterestTags(): Promise<string[]> {
    const allNodes = await this.storage.graph.getNodesByType('memory');
    const tagCount = new Map<string, number>();

    for (const node of allNodes) {
      try {
        const item = JSON.parse(node.content);
        const tags = item.tags || {};
        const allTags = [
          ...(tags.domain || []),
          ...(tags.concept || []),
          ...(tags.industry || []),
        ];
        for (const tag of allTags) {
          tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
        }
      } catch { /* skip */ }
    }

    return Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
  }

  async reviewHistory(): Promise<Insight[]> {
    const allNodes = await this.storage.graph.getNodesByType('memory');
    const recentNodes = allNodes
      .filter(n => {
        try {
          const item = JSON.parse(n.content);
          return item.createdAt > Date.now() - 24 * 60 * 60 * 1000;
        } catch { return false; }
      })
      .slice(0, 20);

    const insights: Insight[] = [];
    const contentSet = new Set<string>();

    for (const node of recentNodes) {
      try {
        const item = JSON.parse(node.content);
        const rawContent = item.rawContent || '';
        const tags = item.tags || {};
        const tagSummary = [...(tags.domain || []), ...(tags.concept || [])].slice(0, 3).join(', ');

        if (tagSummary && !contentSet.has(tagSummary)) {
          contentSet.add(tagSummary);
          insights.push({
            content: rawContent.substring(0, 200),
            insight: `User showed interest in: ${tagSummary}`,
            timestamp: Date.now(),
          });
        }
      } catch { /* skip */ }
    }

    return insights;
  }

  async consolidateKnowledge(insights: Insight[]): Promise<void> {
    for (const insight of insights) {
      await this.information.storeSemantic(
        `Insight: ${insight.insight}\nContext: ${insight.content}`,
        'system'
      );
    }
  }

  generateQuestions(knowledgeGap: KnowledgeGap): string[] {
    const questions: string[] = [
      `What is ${knowledgeGap.gap} and how does it work?`,
      `What are the best practices for ${knowledgeGap.gap}?`,
      `What are common mistakes when working with ${knowledgeGap.gap}?`,
      `How does ${knowledgeGap.gap} compare to alternatives?`,
      `What are the prerequisites for learning ${knowledgeGap.gap}?`,
    ];

    return questions;
  }

  // ============================================================
  // Learning Visualization
  // ============================================================

  getLearnedKnowledge(filters?: { source?: string }): any[] {
    let items = this.queue.filter(q => q.status === 'completed');

    if (filters?.source) {
      items = items.filter(q => q.knowledgeItem.source === filters.source);
    }

    return items.map(q => ({
      id: q.id,
      content: q.knowledgeItem.content,
      source: q.knowledgeItem.source,
      confidence: q.knowledgeItem.confidence,
      priority: q.priority,
      createdAt: q.createdAt,
    }));
  }

  getLearningProgress(): { total: number; completed: number; inProgress: number; phases: any[] } {
    const stats = this.getQueueStats();
    const allPhases = this.plans.flatMap(p =>
      p.phases.map(ph => ({
        planId: p.id,
        batchId: p.batchId,
        phase: ph.phase,
        name: ph.name,
        status: ph.status,
        itemCount: ph.items.length,
        startedAt: ph.startedAt,
        completedAt: ph.completedAt,
      }))
    );

    return {
      total: stats.total,
      completed: stats.completed,
      inProgress: stats.learning,
      phases: allPhases,
    };
  }

  getKnowledgeGraph(): { nodes: any[]; edges: any[] } {
    const completed = this.queue.filter(q => q.status === 'completed');
    const nodes: any[] = [];
    const edges: any[] = [];
    const tagMap = new Map<string, string[]>();

    for (const item of completed) {
      const nodeId = item.id;
      nodes.push({
        id: nodeId,
        label: item.knowledgeItem.content.substring(0, 50),
        source: item.knowledgeItem.source,
        confidence: item.knowledgeItem.confidence,
      });

      const tags = this.extractTagsFromLearning(item.knowledgeItem);
      const allTags = [...tags.domain, ...tags.industry, ...tags.concept, ...tags.action];

      for (const tag of allTags) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, []);
          nodes.push({ id: `tag:${tag}`, label: tag, type: 'tag' });
        }
        tagMap.get(tag)!.push(nodeId);
        edges.push({
          source: nodeId,
          target: `tag:${tag}`,
          relation: 'belongs_to',
        });
      }

      // Connect items with same source
      const sameSource = completed.filter(
        q => q.knowledgeItem.source === item.knowledgeItem.source && q.id !== item.id
      );
      for (const related of sameSource) {
        if (item.id < related.id) {
          edges.push({
            source: item.id,
            target: related.id,
            relation: 'same_source',
          });
        }
      }
    }

    return { nodes, edges };
  }

  getRecentInsights(limit: number = 10): Insight[] {
    return this.insights
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // ============================================================
  // Tag Integration
  // ============================================================

  extractTagsFromLearning(knowledgeItem: KnowledgeItem): TagSet {
    return this.information.extractTags(knowledgeItem.content);
  }

  async integrateToTagGraph(tags: TagSet): Promise<void> {
    // Store the tags relationship as a memory node
    const tagContent = JSON.stringify(tags);
    await this.information.storeSemantic(
      `Learning tags: ${tagContent}`,
      'system',
      tags
    );
  }
}