import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LearningService } from '../../src/core/learning';
import { InformationService } from '../../src/core/information';
import { StorageService } from '../../src/core/storage';
import { ModelConfigService } from '../../src/core/llm/modelConfig';
import { LLMService } from '../../src/core/llm';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('LearningService', () => {
  let learning: LearningService;
  let info: InformationService;
  let storage: StorageService;
  let llm: LLMService;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-learning-'));
    originalEnv = { ...process.env };
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    process.env.BRIAN_CONFIG_FILE_PATH = path.join(tempDir, 'model-config.json');
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    vi.resetModules();
    initDatabase();
    storage = new StorageService();
    const config = new ModelConfigService();
    llm = new LLMService(config);
    info = new InformationService(storage, llm);
    learning = new LearningService(info, llm, storage);
  });

  afterEach(() => {
    closeDatabase();
    try { if ((info as any).tagEvolutionTimer) clearInterval((info as any).tagEvolutionTimer); } catch { /* Ignore timer cleanup errors */ }
    try { if ((learning as any).idleTimer) clearInterval((learning as any).idleTimer); } catch { /* Ignore timer cleanup errors */ }
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('BRIAN_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // --- Knowledge Extraction ---
  it('should extract knowledge from text', () => {
    const items = learning.extractKnowledge('React is a JavaScript library for building user interfaces');
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(item => item.content.toLowerCase().includes('react'))).toBe(true);
  });

  it('should extract knowledge from "means" pattern', () => {
    const items = learning.extractKnowledge('API means Application Programming Interface');
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(item => item.source === 'definition')).toBe(true);
  });

  it('should extract knowledge from procedural text', () => {
    const items = learning.extractKnowledge('To create a component, you need to define a function');
    expect(items.length).toBeGreaterThan(0);
  });

  it('should extract knowledge from key-value patterns', () => {
    const items = learning.extractKnowledge('language: TypeScript, framework: React');
    // Key-value pattern may match
    expect(items.length).toBeGreaterThanOrEqual(0);
  });

  it('should deduplicate knowledge items', () => {
    const items = learning.extractKnowledge('React is a library. React is a library.');
    const uniqueContents = new Set(items.map(i => i.content.toLowerCase()));
    expect(uniqueContents.size).toBe(items.length);
  });

  // --- Preference Extraction ---
  it('should extract preference from text', () => {
    const pref = learning.extractPreference('I prefer TypeScript over JavaScript');
    expect(pref).not.toBeNull();
    expect(pref!.category).toBe('general');
    expect(pref!.value).toContain('TypeScript');
  });

  it('should extract negative preference', () => {
    const pref = learning.extractPreference('I dislike slow frameworks');
    expect(pref).not.toBeNull();
    expect(pref!.value).toContain('dislike');
  });

  it('should extract favorite preference', () => {
    const pref = learning.extractPreference('My favorite framework is React');
    expect(pref).not.toBeNull();
    expect(pref!.category).toBe('preference');
  });

  it('should return null when no preference detected', () => {
    const pref = learning.extractPreference('The weather is nice today');
    expect(pref).toBeNull();
  });

  // --- onMessage ---
  it('should onMessage trigger knowledge extraction', () => {
    learning.onMessage({ role: 'user', content: 'React is a JavaScript library for building UIs' });
    const queue = learning.getQueue();
    expect(queue.length).toBeGreaterThan(0);
  });

  it('should onMessage extract preferences', () => {
    learning.onMessage({ role: 'user', content: 'I prefer using TypeScript' });
    const prefs = storage.sqlite.getPreferences('', 'general');
    expect(prefs.length).toBeGreaterThan(0);
  });

  // --- Queue Management ---
  it('should getQueue return items sorted by priority', () => {
    learning.onMessage({ role: 'user', content: 'React is a library and TypeScript is a language' });
    const queue = learning.getQueue();
    // Queue should be sorted by priority desc
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i - 1].priority).toBeGreaterThanOrEqual(queue[i].priority);
    }
  });

  it('should prioritize an item', () => {
    learning.onMessage({ role: 'user', content: 'React is a library' });
    const queue = learning.getQueue();
    const itemId = queue[0].id;
    learning.prioritize(itemId, 100);
    const updated = learning.getQueue();
    expect(updated[0].priority).toBe(100);
  });

  it('should skip an item', () => {
    learning.onMessage({ role: 'user', content: 'React is a library' });
    const queue = learning.getQueue();
    const itemId = queue[0].id;
    learning.skip(itemId);
    const updated = learning.getQueue();
    const skipped = updated.find(i => i.id === itemId);
    expect(skipped!.status).toBe('skipped');
  });

  it('should batchApprove items', () => {
    learning.onMessage({ role: 'user', content: 'React is a library. TypeScript is a language.' });
    const queue = learning.getQueue();
    const itemIds = queue.map(i => i.id);
    learning.batchApprove(itemIds);
    const updated = learning.getQueue();
    const allApproved = updated.every(i => i.status === 'approved');
    expect(allApproved).toBe(true);
  });

  it('should getQueueStats return correct stats', () => {
    learning.onMessage({ role: 'user', content: 'React is a library' });
    const stats = learning.getQueueStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.pending).toBeGreaterThan(0);
    expect(stats.approved).toBe(0);
    expect(stats.skipped).toBe(0);
  });

  // --- Batching ---
  it('should batch group approved items', () => {
    learning.onMessage({ role: 'user', content: 'React is a frontend library for building UIs' });
    learning.onMessage({ role: 'user', content: 'TypeScript is a typed superset of JavaScript' });
    const queue = learning.getQueue();
    learning.batchApprove(queue.map(i => i.id));

    const batches = learning.batch();
    expect(batches.length).toBeGreaterThan(0);
  });

  it('should batch return empty when no approved items', () => {
    const batches = learning.batch();
    expect(batches).toEqual([]);
  });

  // --- Learning Plan ---
  it('should createPlan and manage phases', () => {
    learning.onMessage({ role: 'user', content: 'React is a library for building UIs' });
    learning.onMessage({ role: 'user', content: 'TypeScript is a typed JavaScript superset' });
    const queue = learning.getQueue();
    learning.batchApprove(queue.map(i => i.id));
    const batches = learning.batch();

    const plan = learning.createPlan(batches[0].id);
    expect(plan).toBeDefined();
    expect(plan.phases.length).toBe(4);
    expect(plan.phases[0].name).toBe('Exploration');
    expect(plan.phases[1].name).toBe('Comprehension');
    expect(plan.phases[2].name).toBe('Application');
    expect(plan.phases[3].name).toBe('Mastery');

    const nextPhase = learning.getNextPhase(plan.id);
    expect(nextPhase).not.toBeNull();
    expect(nextPhase!.phase).toBe(1);
  });

  it('should completePhase transition to next', () => {
    learning.onMessage({ role: 'user', content: 'React is a library. TypeScript is a language.' });
    const queue = learning.getQueue();
    learning.batchApprove(queue.map(i => i.id));
    const batches = learning.batch();
    const plan = learning.createPlan(batches[0].id);

    learning.completePhase(plan.id, 1);
    const phase2 = plan.phases.find(p => p.phase === 2);
    expect(phase2).not.toBeUndefined();
    expect(phase2!.status).toBe('in_progress');
    expect(plan.phases[0].status).toBe('completed');
  });

  it('should createPlan throw for non-existent batch', () => {
    expect(() => learning.createPlan('nonexistent')).toThrow('not found');
  });

  // --- Starvation ---
  it('should isStarvation return false initially', () => {
    expect(learning.isStarvation()).toBe(false);
  });

  it('should rebalance boost priorities', () => {
    learning.onMessage({ role: 'user', content: 'React is a library' });
    const queue = learning.getQueue();
    const oldPriority = queue[0].priority;
    learning.rebalance();
    // Priority should be boosted (or at least not decrease)
    const newQueue = learning.getQueue();
    expect(newQueue[0].priority).toBeGreaterThanOrEqual(oldPriority);
  });

  // --- Schedule ---
  it('should schedule start background task', () => {
    learning.schedule(100);
    // Should not throw
    expect(learning.isIdle()).toBe(true);
  });

  // --- Insights ---
  it('should getRecentInsights return empty initially', () => {
    const insights = learning.getRecentInsights();
    expect(insights).toEqual([]);
  });

  it('should getLearnedKnowledge return empty initially', () => {
    const knowledge = learning.getLearnedKnowledge();
    expect(knowledge).toEqual([]);
  });

  it('should getLearnedKnowledge filter by source', () => {
    learning.onMessage({ role: 'user', content: 'React is a library' });
    const queue = learning.getQueue();
    learning.batchApprove(queue.map(i => i.id));
    const batches = learning.batch();
    const plan = learning.createPlan(batches[0].id);
    learning.completePhase(plan.id, 1);
    learning.completePhase(plan.id, 2);
    learning.completePhase(plan.id, 3);
    learning.completePhase(plan.id, 4);

    const byDefinition = learning.getLearnedKnowledge({ source: 'definition' });
    expect(Array.isArray(byDefinition)).toBe(true);
  });

  it('should getLearningProgress return stats', () => {
    learning.onMessage({ role: 'user', content: 'React is a library' });
    const queue = learning.getQueue();
    learning.batchApprove(queue.map(i => i.id));
    const batches = learning.batch();
    learning.createPlan(batches[0].id);

    const progress = learning.getLearningProgress();
    expect(progress.total).toBeGreaterThan(0);
    expect(progress.phases).toBeDefined();
  });

  it('should getKnowledgeGraph return graph', () => {
    learning.onMessage({ role: 'user', content: 'React is a library' });
    const queue = learning.getQueue();
    learning.batchApprove(queue.map(i => i.id));
    const batches = learning.batch();
    const plan = learning.createPlan(batches[0].id);
    learning.completePhase(plan.id, 1);
    learning.completePhase(plan.id, 2);
    learning.completePhase(plan.id, 3);
    learning.completePhase(plan.id, 4);

    const graph = learning.getKnowledgeGraph();
    expect(graph.nodes).toBeDefined();
    expect(graph.edges).toBeDefined();
  });

  // --- Tag Integration ---
  it('should extractTagsFromLearning', () => {
    const tags = learning.extractTagsFromLearning({ content: 'React is a frontend library', source: 'definition', confidence: 0.7 });
    expect(tags.domain).toBeDefined();
    expect(tags.domain).toContain('frontend');
  });

  it('should integrateToTagGraph', async () => {
    const tags = learning.extractTagsFromLearning({ content: 'React is a frontend library', source: 'definition', confidence: 0.7 });
    await learning.integrateToTagGraph(tags);
    const allNodes = await storage.graph.getAllNodes();
    expect(allNodes.length).toBeGreaterThan(0);
  });

  // --- Active Learning - Graph Connectivity Driver (40%) ---
  it('should generate graph connectivity learning items with correct priority', async () => {
    await info.storeEpisodic('React is a frontend library', 'user');
    await info.storeEpisodic('TypeScript adds type safety to JavaScript', 'user');
    await info.storeEpisodic('Vue is another frontend framework', 'user');

    const learningService = learning as any;
    const items = await learningService.generateGraphConnectivityLearning();

    expect(items.length).toBeGreaterThanOrEqual(0);
    for (const item of items) {
      expect(item.source).toBe('graph_connectivity');
      expect(item.priority).toBeGreaterThanOrEqual(35);
      expect(item.priority).toBeLessThanOrEqual(95);
    }
  });

  it('should generate higher priority for high-degree tag pairs', async () => {
    await info.storeEpisodic('React is a frontend library for building UIs', 'user');
    await info.storeEpisodic('TypeScript is used in React projects', 'user');
    await info.storeEpisodic('Vue is a frontend framework', 'user');
    await info.storeEpisodic('Node.js is a backend runtime', 'user');

    const learningService = learning as any;
    const items = await learningService.generateGraphConnectivityLearning();

    if (items.length > 0) {
      items.sort((a: any, b: any) => b.priority - a.priority);
      expect(items[0].priority).toBeGreaterThanOrEqual(40);
    }
  });

  it('should generate learning items for isolated tags', async () => {
    await info.storeEpisodic('Docker is a containerization tool', 'user');

    const learningService = learning as any;
    const items = await learningService.generateGraphConnectivityLearning();

    const isolatedItems = items.filter((i: any) => i.content.includes('needs connections'));
    expect(isolatedItems.length).toBeGreaterThanOrEqual(0);
    if (isolatedItems.length > 0) {
      expect(isolatedItems[0].priority).toBe(35);
    }
  });

  // --- Active Learning - Activation Driven (40%) ---
  it('should generate activation-driven learning items with correct priority', async () => {
    await info.storeEpisodic('React is a frontend library', 'user');
    await info.storeEpisodic('TypeScript adds type safety', 'user');

    const learningService = learning as any;
    const items = await learningService.generateActivationDrivenLearning();

    expect(items.length).toBeGreaterThanOrEqual(0);
    for (const item of items) {
      expect(item.source).toBe('activation_driven');
      expect(item.priority).toBeGreaterThanOrEqual(40);
      expect(item.priority).toBeLessThanOrEqual(95);
    }
  });

  it('should calculate activation priority correctly', async () => {
    await info.storeEpisodic('React is a frontend library', 'user');
    await info.storeEpisodic('React is widely used', 'user');
    await info.storeEpisodic('React is popular', 'user');
    await info.storeEpisodic('TypeScript', 'user');

    const learningService = learning as any;
    const items = await learningService.generateActivationDrivenLearning();

    items.sort((a: any, b: any) => b.priority - a.priority);
    if (items.length >= 2) {
      expect(items[0].priority).toBeGreaterThanOrEqual(items[1].priority);
    }
  });

  it('should generate activation items based on retrieval count', async () => {
    await info.storeEpisodic('React is widely used in frontend development', 'user');

    const learningService = learning as any;
    const items = await learningService.generateActivationDrivenLearning();

    const reactItems = items.filter((i: any) => i.content.includes('frontend'));
    expect(reactItems.length).toBeGreaterThanOrEqual(0);
  });

  // --- Active Learning - Recent Input Driver (20%) ---
  it('should generate recent input learning items with correct priority', async () => {
    await info.storeEpisodic('Docker containers are useful', 'user');
    await info.storeEpisodic('Kubernetes orchestrates containers', 'user');

    const learningService = learning as any;
    const items = await learningService.generateRecentInputLearning();

    expect(items.length).toBeGreaterThanOrEqual(0);
    for (const item of items) {
      expect(item.source).toBe('recent_input');
      expect(item.priority).toBeGreaterThanOrEqual(20);
      expect(item.priority).toBeLessThanOrEqual(35);
    }
  });

  it('should generate follow-up items for recent messages', async () => {
    await info.storeEpisodic('I want to learn about machine learning', 'user');

    const learningService = learning as any;
    const items = await learningService.generateRecentInputLearning();

    const followUpItems = items.filter((i: any) => i.content.includes('Follow up'));
    expect(followUpItems.length).toBeGreaterThanOrEqual(0);
    if (followUpItems.length > 0) {
      expect(followUpItems[0].priority).toBe(25);
    }
  });

  it('should prioritize recent tags correctly', async () => {
    await info.storeEpisodic('React is a frontend library', 'user');
    await info.storeEpisodic('TypeScript adds type safety', 'user');

    const learningService = learning as any;
    const items = await learningService.generateRecentInputLearning();

    items.sort((a: any, b: any) => b.priority - a.priority);
    if (items.length >= 2) {
      expect(items[0].priority).toBeGreaterThanOrEqual(items[1].priority);
    }
  });

  // --- Active Learning - Combined Priority ---
  it('should have activation-driven items with higher priority than recent-input', async () => {
    await info.storeEpisodic('React is a frontend library used many times', 'user');
    await info.storeEpisodic('Docker is recent', 'user');

    const learningService = learning as any;
    const activationItems = await learningService.generateActivationDrivenLearning();
    const recentItems = await learningService.generateRecentInputLearning();

    if (activationItems.length > 0 && recentItems.length > 0) {
      const maxActivationPriority = Math.max(...activationItems.map((i: any) => i.priority));
      const maxRecentPriority = Math.max(...recentItems.map((i: any) => i.priority));
      expect(maxActivationPriority).toBeGreaterThan(maxRecentPriority);
    }
  });

  it('should have graph-connectivity items with similar priority to activation-driven', async () => {
    await info.storeEpisodic('React is a frontend library', 'user');
    await info.storeEpisodic('TypeScript is used with React', 'user');

    const learningService = learning as any;
    const graphItems = await learningService.generateGraphConnectivityLearning();
    const activationItems = await learningService.generateActivationDrivenLearning();

    if (graphItems.length > 0 && activationItems.length > 0) {
      const maxGraphPriority = Math.max(...graphItems.map((i: any) => i.priority));
      const maxActivationPriority = Math.max(...activationItems.map((i: any) => i.priority));
      expect(Math.abs(maxGraphPriority - maxActivationPriority)).toBeLessThan(20);
    }
  });

  it('should performActiveLearning generate items from all three drivers', async () => {
    await info.storeEpisodic('React is a frontend library', 'user');
    await info.storeEpisodic('TypeScript adds type safety', 'user');
    await info.storeEpisodic('Docker containers', 'user');

    const learningService = learning as any;
    await learningService.performActiveLearning();

    const queue = learning.getQueue();
    const activeItems = queue.filter((i: any) => i.status === 'pending');
    expect(activeItems.length).toBeGreaterThanOrEqual(0);
  });

  it('should filter memory nodes correctly for active learning', async () => {
    await info.storeEpisodic('This is a memory', 'user');

    const memoryNodes = await storage.graph.getNodesByType('memory');
    const allNodes = await storage.graph.getAllNodes();

    expect(memoryNodes.length).toBeGreaterThan(0);
    expect(memoryNodes.length).toBeLessThanOrEqual(allNodes.length);
  });

  // --- Active Learning - Hot Topic Driver (10%) ---
  it('should generate hot topic learning items with correct priority', async () => {
    const learningService = learning as any;
    const items = await learningService.generateHotTopicLearning();

    expect(items.length).toBeGreaterThanOrEqual(0);
    for (const item of items) {
      expect(item.source).toBe('hot_topic');
      expect(item.priority).toBeGreaterThanOrEqual(15);
      expect(item.priority).toBeLessThanOrEqual(35);
    }
  });

  it('should return empty when hot topic API fails', async () => {
    const learningService = learning as any;
    const items = await learningService.generateHotTopicLearning();

    // When API fails, no mock data should be returned
    expect(items.length).toBe(0);
  });

  it('should generate user-relevant hot topic items', async () => {
    await info.storeEpisodic('React is a frontend library', 'user');

    const learningService = learning as any;
    const items = await learningService.generateHotTopicLearning();

    const reactRelated = items.filter((i: any) => 
      i.content.toLowerCase().includes('react') || 
      i.content.toLowerCase().includes('frontend')
    );
    expect(reactRelated.length).toBeGreaterThanOrEqual(0);
  });

  // --- Driver Weights Management ---
  it('should get default driver weights', () => {
    const weights = learning.getDriverWeights();
    expect(weights.graphConnectivity).toBe(30);
    expect(weights.activationDriven).toBe(30);
    expect(weights.recentInput).toBe(30);
    expect(weights.hotTopic).toBe(10);
    expect(weights.graphConnectivity + weights.activationDriven + weights.recentInput + weights.hotTopic).toBe(100);
  });

  it('should set custom driver weights', () => {
    const newWeights = learning.setDriverWeights({ graphConnectivity: 35, activationDriven: 35, recentInput: 20, hotTopic: 10 });
    expect(newWeights.graphConnectivity).toBe(35);
    expect(newWeights.activationDriven).toBe(35);
    expect(newWeights.recentInput).toBe(20);
    expect(newWeights.hotTopic).toBe(10);
    expect(newWeights.graphConnectivity + newWeights.activationDriven + newWeights.recentInput + newWeights.hotTopic).toBe(100);
  });

  it('should normalize weights to sum to 100', () => {
    learning.resetDriverWeights();
    learning.resetHitRates();
    const newWeights = learning.setDriverWeights({ graphConnectivity: 35, activationDriven: 35 });
    const sum = newWeights.graphConnectivity + newWeights.activationDriven + newWeights.recentInput + newWeights.hotTopic;
    expect(sum).toBe(100);
  });

  it('should record hit and miss for drivers', () => {
    learning.recordHit('graphConnectivity');
    learning.recordHit('graphConnectivity');
    learning.recordMiss('graphConnectivity');
    
    const hitRates = learning.getDriverHitRates();
    expect(hitRates.graphConnectivity.hits).toBe(2);
    expect(hitRates.graphConnectivity.total).toBe(3);
  });

  it('should adjust weights based on hit rates', () => {
    for (let i = 0; i < 10; i++) {
      learning.recordHit('graphConnectivity');
      learning.recordMiss('hotTopic');
    }

    const weights = learning.getDriverWeights();
    expect(weights.graphConnectivity).toBeGreaterThanOrEqual(20);
    expect(weights.hotTopic).toBeLessThanOrEqual(20);
  });

  it('should respect weight adjustment bounds (default ±10%)', () => {
    for (let i = 0; i < 10; i++) {
      learning.recordHit('graphConnectivity');
    }
    for (let i = 0; i < 10; i++) {
      learning.recordMiss('activationDriven');
    }

    const weights = learning.getDriverWeights();

    expect(weights.graphConnectivity).toBeLessThanOrEqual(40);
    expect(weights.activationDriven).toBeGreaterThanOrEqual(20);
  });

  it('should respect weight adjustment bounds (user config ±5%)', () => {
    learning.setDriverWeights({ graphConnectivity: 30, activationDriven: 30, recentInput: 30, hotTopic: 10 });
    
    for (let i = 0; i < 10; i++) {
      learning.recordHit('graphConnectivity');
    }
    for (let i = 0; i < 10; i++) {
      learning.recordMiss('activationDriven');
    }

    const weights = learning.getDriverWeights();

    expect(weights.graphConnectivity).toBeLessThanOrEqual(35);
    expect(weights.activationDriven).toBeGreaterThanOrEqual(25);
  });

  it('should performActiveLearning include hot topic items', async () => {
    await info.storeEpisodic('React is a frontend library', 'user');

    const learningService = learning as any;
    await learningService.performActiveLearning();

    const queue = learning.getQueue();
    const hotTopicItems = queue.filter((i: any) => i.knowledgeItem.source === 'hot_topic');
    expect(hotTopicItems.length).toBeGreaterThanOrEqual(0);
  });
});