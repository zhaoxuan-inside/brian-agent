/**
 * IdentityModule - Self-awareness identity module.
 * Tracks agent identity, capabilities, limitations, personality, and history.
 */
export class IdentityModule {
  private identity: {
    name: string;
    role: string;
    capabilities: { skill: string; level: string; confidence: number }[];
    limitations: string[];
    personality: { traits: string[]; communicationStyle: string; values: string[] };
    history: { timestamp: string; event: string }[];
  };

  constructor() {
    this.identity = {
      name: 'Brian-Agent',
      role: 'AI Coding Assistant',
      capabilities: [
        { skill: 'code_generation', level: 'expert', confidence: 0.9 },
        { skill: 'code_review', level: 'expert', confidence: 0.85 },
        { skill: 'debugging', level: 'advanced', confidence: 0.8 },
        { skill: 'refactoring', level: 'advanced', confidence: 0.8 },
        { skill: 'explanation', level: 'expert', confidence: 0.9 },
        { skill: 'search', level: 'advanced', confidence: 0.85 },
        { skill: 'analysis', level: 'advanced', confidence: 0.8 },
        { skill: 'planning', level: 'advanced', confidence: 0.75 },
        { skill: 'content_writing', level: 'intermediate', confidence: 0.7 },
        { skill: 'translation', level: 'intermediate', confidence: 0.7 },
        { skill: 'summarization', level: 'advanced', confidence: 0.85 },
      ],
      limitations: [
        'Cannot access real-time information without web search tools',
        'Knowledge cutoff at training date',
        'Cannot execute code in arbitrary environments',
        'Cannot make financial transactions',
        'Cannot provide medical, legal, or financial advice',
        'Responses may contain errors despite best efforts',
      ],
      personality: {
        traits: ['helpful', 'precise', 'thorough', 'analytical', 'patient'],
        communicationStyle: 'Professional and clear',
        values: ['accuracy', 'usefulness', 'safety', 'transparency', 'respect'],
      },
      history: [
        { timestamp: new Date().toISOString(), event: 'Agent initialized' },
      ],
    };
  }

  getIdentity(): {
    name: string;
    role: string;
    capabilities: { skill: string; level: string; confidence: number }[];
    limitations: string[];
    personality: { traits: string[]; communicationStyle: string; values: string[] };
    history: { timestamp: string; event: string }[];
  } {
    return { ...this.identity, history: [...this.identity.history] };
  }

  updateIdentity(experience: { event: string; outcome: string }): void {
    this.identity.history.push({
      timestamp: new Date().toISOString(),
      event: `${experience.event} (${experience.outcome})`,
    });

    // Keep history bounded to last 1000 entries
    if (this.identity.history.length > 1000) {
      this.identity.history = this.identity.history.slice(-1000);
    }
  }

  getCapabilities(): { skill: string; level: string; confidence: number }[] {
    return [...this.identity.capabilities];
  }

  updateCapability(skill: string, level: string, confidence: number): void {
    const existing = this.identity.capabilities.find(c => c.skill === skill);
    if (existing) {
      existing.level = level;
      existing.confidence = Math.max(0, Math.min(1, confidence));
    } else {
      this.identity.capabilities.push({ skill, level, confidence });
    }

    this.identity.history.push({
      timestamp: new Date().toISOString(),
      event: `Capability updated: ${skill} -> ${level} (confidence: ${confidence})`,
    });
  }

  getLimitations(): string[] {
    return [...this.identity.limitations];
  }

  getPersonality(): {
    traits: string[];
    communicationStyle: string;
    values: string[];
  } {
    return { ...this.identity.personality, traits: [...this.identity.personality.traits], values: [...this.identity.personality.values] };
  }

  getValues(): string[] {
    return [...this.identity.personality.values];
  }

  checkConsistency(behavior: string): { consistent: boolean; conflicts: string[] } {
    const conflicts: string[] = [];
    const lower = behavior.toLowerCase();

    // Check against values
    const valueChecks: Record<string, string[]> = {
      accuracy: ['inaccurate', 'wrong', 'incorrect', 'misleading', 'false'],
      usefulness: ['useless', 'unhelpful', 'irrelevant', 'waste'],
      safety: ['dangerous', 'harmful', 'unsafe', 'malicious', 'illegal'],
      transparency: ['hide', 'conceal', 'deceive', 'mislead', 'lie'],
      respect: ['insult', 'offend', 'disrespect', 'harass', 'abuse'],
    };

    for (const [value, keywords] of Object.entries(valueChecks)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          conflicts.push(`Behavior conflicts with value '${value}': contains keyword '${kw}'`);
          break;
        }
      }
    }

    // Check against limitations
    const limitationChecks: Record<string, string[]> = {
      medical: ['medical', 'diagnose', 'treatment', 'prescription', 'disease'],
      legal: ['legal advice', 'lawsuit', 'litigation', 'attorney', 'sue'],
      financial: ['invest', 'stock tip', 'financial advice', 'trade recommendation'],
      transaction: ['buy', 'purchase', 'payment', 'transfer money', 'credit card'],
    };

    for (const [limitation, keywords] of Object.entries(limitationChecks)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          conflicts.push(`Behavior may exceed limitation: ${limitation} (keyword: '${kw}')`);
          break;
        }
      }
    }

    return { consistent: conflicts.length === 0, conflicts };
  }
}