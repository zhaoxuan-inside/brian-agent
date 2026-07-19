import { StorageService } from '../core/storage';
import { v4 as uuidv4 } from 'uuid';
import type { WorkAgent, FeedbackRating } from '../shared/types';

const INITIAL_STRENGTH = 1.0;
const DECAY_RATE = 0.05; // Per day
const POSITIVE_REINFORCEMENT = 0.1;
const NEGATIVE_REINFORCEMENT = -0.15;
const DORMANT_THRESHOLD = 0.2;
const SIMILARITY_THRESHOLD = 0.3;
const MAX_STRENGTH = 1.0;
const MIN_STRENGTH = 0.0;

export class AgentLibrary {
  private storage: StorageService;

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  // ============================================================
  // CRUD
  // ============================================================

  async store(agent: Omit<WorkAgent, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = Date.now();

    const workAgentBase: Omit<WorkAgent, 'id'> = {
      ...agent,
      strength: agent.strength ?? INITIAL_STRENGTH,
      useCount: agent.useCount ?? 0,
      lastUsedAt: agent.lastUsedAt ?? now,
      feedbackHistory: agent.feedbackHistory ?? [],
      reliability: agent.reliability ?? 0.5,
      createdAt: now,
      updatedAt: now,
    };

    const node = await this.storage.graph.createNode({
      type: 'concept',
      content: JSON.stringify({ ...workAgentBase, id: 'TEMP_ID' }),
      metadata: {
        agentType: 'work',
        agentName: workAgentBase.name,
        strategy: workAgentBase.strategy,
      },
      salienceScore: workAgentBase.strength,
      retrievalCount: 0,
      strength: workAgentBase.strength,
      decayRate: DECAY_RATE,
    });

    const workAgent: WorkAgent = { ...workAgentBase, id: node.id };
    await this.storage.graph.updateNode(node.id, {
      content: JSON.stringify(workAgent),
    });

    return node.id;
  }

  async get(agentId: string): Promise<WorkAgent | undefined> {
    const node = await this.storage.graph.getNode(agentId);
    if (!node) return undefined;

    try {
      return JSON.parse(node.content) as WorkAgent;
    } catch {
      return undefined;
    }
  }

  async getAll(): Promise<WorkAgent[]> {
    const nodes = await this.storage.graph.getAllNodes();
    const agents: WorkAgent[] = [];

    for (const node of nodes) {
      try {
        const agent = JSON.parse(node.content) as WorkAgent;
        if (agent.id && agent.name) {
          agents.push(agent);
        }
      } catch {
        // Skip malformed nodes
      }
    }

    return agents;
  }

  async update(agentId: string, updates: Partial<WorkAgent>): Promise<void> {
    const existing = await this.get(agentId);
    if (!existing) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const updated: WorkAgent = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.storage.graph.updateNode(agentId, {
      content: JSON.stringify(updated),
      strength: updated.strength,
      metadata: {
        agentType: 'work',
        agentName: updated.name,
        strategy: updated.strategy,
      },
    });
  }

  async delete(agentId: string): Promise<void> {
    await this.storage.graph.deleteNode(agentId);
  }

  async getStats(): Promise<{
    total: number;
    active: number;
    dormant: number;
    reliable: number;
    needsReview: number;
  }> {
    const all = await this.getAll();
    const now = Date.now();

    let active = 0;
    let dormant = 0;
    let reliable = 0;
    let needsReview = 0;

    for (const agent of all) {
      // Calculate current strength
      const daysSinceLastUse = (now - agent.lastUsedAt) / (1000 * 60 * 60 * 24);
      const currentStrength = INITIAL_STRENGTH * Math.exp(-DECAY_RATE * daysSinceLastUse);

      if (currentStrength >= 0.5) {
        active++;
      } else if (currentStrength < DORMANT_THRESHOLD) {
        dormant++;
      }

      if (agent.reliability >= 0.7) {
        reliable++;
      }

      if (agent.reliability < 0.4) {
        needsReview++;
      }
    }

    return {
      total: all.length,
      active,
      dormant,
      reliable,
      needsReview,
    };
  }

  // ============================================================
  // Similarity Search
  // ============================================================

  async findSimilar(taskFeatures: Record<string, unknown>): Promise<WorkAgent[]> {
    const all = await this.getAll();
    const scored = all.map(agent => ({
      agent,
      similarity: this.calculateSimilarity(taskFeatures, agent.taskFeatures),
    }));

    return scored
      .filter(s => s.similarity >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .map(s => s.agent);
  }

  private calculateSimilarity(
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): number {
    if (!a || !b) return 0;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length === 0 && keysB.length === 0) return 1.0;
    if (keysA.length === 0 || keysB.length === 0) return 0;

    // Key overlap score
    const commonKeys = keysA.filter(k => keysB.includes(k));
    const keyOverlap = (2 * commonKeys.length) / (keysA.length + keysB.length);

    // Value similarity score for common keys
    let valueSimilarity = 0;
    for (const key of commonKeys) {
      const valA = String(a[key]).toLowerCase();
      const valB = String(b[key]).toLowerCase();

      if (valA === valB) {
        valueSimilarity += 1.0;
      } else {
        // Partial string match
        const lenA = valA.length;
        const lenB = valB.length;
        if (lenA > 0 && lenB > 0) {
          // Jaccard-like word similarity
          const wordsA = new Set(valA.split(/[\s,_-]+/).filter(w => w.length > 0));
          const wordsB = new Set(valB.split(/[\s,_-]+/).filter(w => w.length > 0));
          const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
          const union = new Set([...wordsA, ...wordsB]);
          valueSimilarity += intersection.size / union.size;
        }
      }
    }

    const avgValueSimilarity = commonKeys.length > 0
      ? valueSimilarity / commonKeys.length
      : 0;

    // Combined score: 0.4 * key overlap + 0.6 * value similarity
    return 0.4 * keyOverlap + 0.6 * avgValueSimilarity;
  }

  // ============================================================
  // Forgetting Curve
  // ============================================================

  calculateStrength(agent: WorkAgent): number {
    const now = Date.now();
    const daysSinceLastUse = (now - agent.lastUsedAt) / (1000 * 60 * 60 * 24);
    const rawStrength = INITIAL_STRENGTH * Math.exp(-DECAY_RATE * Math.max(0, daysSinceLastUse));

    // Apply feedback reinforcement
    let feedbackModifier = 0;
    for (const fb of agent.feedbackHistory) {
      feedbackModifier += fb.score;
    }

    const strength = Math.max(MIN_STRENGTH, Math.min(MAX_STRENGTH, rawStrength + feedbackModifier));
    return Math.round(strength * 1000) / 1000;
  }

  async applyDecay(): Promise<{ decayed: number; archived: number }> {
    const all = await this.getAll();
    let decayed = 0;
    let archived = 0;

    for (const agent of all) {
      const newStrength = this.calculateStrength(agent);

      if (newStrength !== agent.strength) {
        await this.update(agent.id, { strength: newStrength });
        decayed++;
      }

      if (newStrength < DORMANT_THRESHOLD) {
        // Mark as archived by setting strength to minimum
        await this.update(agent.id, { strength: MIN_STRENGTH });
        archived++;
      }
    }

    return { decayed, archived };
  }

  async archiveDormant(threshold: number = DORMANT_THRESHOLD): Promise<number> {
    const all = await this.getAll();
    let archived = 0;

    for (const agent of all) {
      const strength = this.calculateStrength(agent);
      if (strength < threshold) {
        await this.update(agent.id, { strength: MIN_STRENGTH });
        archived++;
      }
    }

    return archived;
  }

  async getDecayCurve(agentId: string): Promise<{ days: number[]; strengths: number[] }> {
    const agent = await this.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const days: number[] = [];
    const strengths: number[] = [];

    for (let d = 0; d <= 30; d++) {
      days.push(d);
      const s = INITIAL_STRENGTH * Math.exp(-DECAY_RATE * d);
      strengths.push(Math.round(s * 1000) / 1000);
    }

    return { days, strengths };
  }

  // ============================================================
  // Feedback-Driven Reinforcement
  // ============================================================

  async applyFeedback(
    agentId: string,
    feedback: { rating: string; score: number }
  ): Promise<void> {
    const agent = await this.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const rating = feedback.rating as FeedbackRating;
    const entry = {
      rating,
      score: feedback.score,
      timestamp: Date.now(),
    };

    agent.feedbackHistory.push(entry);

    // Apply reinforcement
    let strengthDelta = 0;
    if (rating === 'good') {
      strengthDelta = POSITIVE_REINFORCEMENT;
    } else if (rating === 'bad') {
      strengthDelta = NEGATIVE_REINFORCEMENT;
    }
    // 'neutral' feedback doesn't change strength

    const newStrength = Math.max(MIN_STRENGTH, Math.min(MAX_STRENGTH, agent.strength + strengthDelta));

    // Update reliability based on feedback history
    const newReliability = await this.evaluateReliability(agentId);

    agent.strength = newStrength;
    agent.reliability = newReliability;
    agent.useCount += 1;
    agent.lastUsedAt = Date.now();

    await this.update(agentId, agent);
  }

  async strengthen(agentId: string): Promise<void> {
    const agent = await this.get(agentId);
    if (!agent) return;

    const newStrength = Math.min(MAX_STRENGTH, agent.strength + POSITIVE_REINFORCEMENT);
    await this.update(agentId, { strength: newStrength });
  }

  async weaken(agentId: string): Promise<void> {
    const agent = await this.get(agentId);
    if (!agent) return;

    const newStrength = Math.max(MIN_STRENGTH, agent.strength + NEGATIVE_REINFORCEMENT);
    await this.update(agentId, { strength: newStrength });
  }

  async evaluateReliability(agentId: string): Promise<number> {
    const agent = await this.get(agentId);
    if (!agent) return 0.5;

    const history = agent.feedbackHistory;
    if (history.length === 0) return 0.5;

    let totalScore = 0;
    let totalWeight = 0;

    for (const entry of history) {
      // More recent feedback has higher weight
      const age = (Date.now() - entry.timestamp) / (1000 * 60 * 60 * 24); // days
      const weight = Math.exp(-0.1 * age); // Decay over ~10 days

      let score = 0;
      if (entry.rating === 'good') score = 1.0;
      else if (entry.rating === 'bad') score = 0.0;
      else score = 0.5; // neutral

      totalScore += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0.5;
  }

  async getFeedbackHistory(agentId: string): Promise<{
    rating: string;
    score: number;
    timestamp: number;
  }[]> {
    const agent = await this.get(agentId);
    if (!agent) return [];
    return [...agent.feedbackHistory];
  }

  // ============================================================
  // Probabilistic Optimization
  // ============================================================

  async shouldOptimize(agent: WorkAgent): Promise<boolean> {
    const probability = await this.calculateOptimizeProbability(agent);
    return Math.random() < probability;
  }

  async calculateOptimizeProbability(agent: WorkAgent): Promise<number> {
    // Higher probability when:
    // - Low reliability
    // - Many feedback entries with mixed results
    // - Has been used recently
    let prob = 0.1; // Base probability

    // Low reliability increases probability
    if (agent.reliability < 0.5) {
      prob += 0.3;
    }

    // Mixed feedback (both good and bad) increases probability
    const hasGood = agent.feedbackHistory.some(f => f.rating === 'good');
    const hasBad = agent.feedbackHistory.some(f => f.rating === 'bad');
    if (hasGood && hasBad) {
      prob += 0.2;
    }

    // Recently used agents are more likely to be optimized
    const daysSinceLastUse = (Date.now() - agent.lastUsedAt) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUse < 7) {
      prob += 0.1;
    }

    // High use count but low reliability
    if (agent.useCount > 10 && agent.reliability < 0.6) {
      prob += 0.2;
    }

    return Math.min(prob, 1.0);
  }

  async optimize(agentId: string): Promise<WorkAgent> {
    const agent = await this.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Optimization is called by MetaAgent which has access to LLM.
    // Here we store the current state as a "version" and return the agent
    // for the caller to modify via LLM.
    const versionId = uuidv4();
    const versioned = {
      ...agent,
      _version: versionId,
      _previousVersion: agentId,
    };

    // Store the versioned copy
    await this.storage.graph.createNode({
      type: 'concept',
      content: JSON.stringify(versioned),
      metadata: {
        agentType: 'work_version',
        agentName: agent.name,
        originalId: agentId,
        versionId,
      },
      salienceScore: 0.5,
      retrievalCount: 0,
      strength: 0.5,
      decayRate: 0.01,
    });

    return agent;
  }

  async compare(original: WorkAgent, optimized: WorkAgent): Promise<WorkAgent> {
    // Compare and return the better agent
    const originalReliability = original.reliability;
    const optimizedReliability = optimized.reliability;

    if (optimizedReliability >= originalReliability) {
      // Update the original with optimized properties
      const merged: WorkAgent = {
        ...original,
        prompt: optimized.prompt,
        strategy: optimized.strategy,
        llm: optimized.llm,
        skillIds: optimized.skillIds,
        mcpIds: optimized.mcpIds,
        soulId: optimized.soulId,
        reliability: optimizedReliability,
        updatedAt: Date.now(),
      };
      await this.update(original.id, merged);
      return merged;
    }

    return original;
  }

  async rollback(agentId: string, version: string): Promise<void> {
    const agent = await this.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Find the versioned node
    const allNodes = await this.storage.graph.getAllNodes();
    const versionNode = allNodes.find(n => {
      try {
        const data = JSON.parse(n.content);
        return data._version === version && data.id === agentId;
      } catch {
        return false;
      }
    });

    if (!versionNode) {
      throw new Error(`Version ${version} not found for agent ${agentId}`);
    }

    const versioned = JSON.parse(versionNode.content) as WorkAgent;
    const { _version, _previousVersion, ...restored } = versioned as any;

    await this.update(agentId, {
      ...restored,
      updatedAt: Date.now(),
    });
  }
}