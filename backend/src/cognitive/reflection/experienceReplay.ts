/**
 * ExperienceReplay - Stores, retrieves, and replays past experiences
 * for learning and improvement. Supports classification and scheduled replay.
 */
import { v4 as uuidv4 } from 'uuid';

interface Experience {
  id: string;
  context: string;
  actions: { action: string; result: string }[];
  outcome: string;
  emotions: string[];
  classification: string;
  timestamp: number;
  replayCount: number;
  lastReplayedAt?: number;
}

export class ExperienceReplay {
  private experiences: Map<string, Experience> = new Map();
  private replayTimer: ReturnType<typeof setInterval> | null = null;

  storeExperience(experience: {
    context: string;
    actions: { action: string; result: string }[];
    outcome: string;
    emotions: string[];
  }): string {
    const id = uuidv4();
    const exp: Experience = {
      id,
      context: experience.context,
      actions: experience.actions,
      outcome: experience.outcome,
      emotions: experience.emotions,
      classification: this.classify(experience),
      timestamp: Date.now(),
      replayCount: 0,
    };

    this.experiences.set(id, exp);

    // Keep experiences bounded
    if (this.experiences.size > 10000) {
      const oldest = Array.from(this.experiences.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 1000);
      for (const [key] of oldest) {
        this.experiences.delete(key);
      }
    }

    return id;
  }

  retrieveExperience(query: {
    type?: string;
    outcome?: string;
    emotion?: string;
  }): any[] {
    const results: Experience[] = [];

    for (const exp of this.experiences.values()) {
      let matches = true;

      if (query.type && exp.classification !== query.type) {
        matches = false;
      }
      if (query.outcome) {
        const outcomeLower = query.outcome.toLowerCase();
        if (!exp.outcome.toLowerCase().includes(outcomeLower)) {
          matches = false;
        }
      }
      if (query.emotion) {
        const emotionLower = query.emotion.toLowerCase();
        if (!exp.emotions.some(e => e.toLowerCase().includes(emotionLower))) {
          matches = false;
        }
      }

      if (matches) {
        results.push(exp);
      }
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  replay(experienceIds: string[]): {
    insights: string[];
    recommendations: string[];
  } {
    const insights: string[] = [];
    const recommendations: string[] = [];
    const replayed: Experience[] = [];

    for (const id of experienceIds) {
      const exp = this.experiences.get(id);
      if (exp) {
        replayed.push(exp);
        exp.replayCount++;
        exp.lastReplayedAt = Date.now();
      }
    }

    if (replayed.length === 0) {
      return { insights: [], recommendations: [] };
    }

    // Analyze outcomes
    const successCount = replayed.filter(e =>
      /success|complete|correct|good|positive/i.test(e.outcome)
    ).length;

    const failureCount = replayed.filter(e =>
      /fail|error|wrong|bad|negative|incorrect/i.test(e.outcome)
    ).length;

    const successRate = replayed.length > 0
      ? successCount / replayed.length
      : 0;

    // Generate insights
    if (successRate > 0.7) {
      insights.push('High success rate in replayed experiences.');
      // Find common successful actions
      const allActions = replayed.flatMap(e => e.actions.filter(a =>
        /success|complete|correct|good/i.test(a.result)
      ));
      const actionCounts = new Map<string, number>();
      for (const action of allActions) {
        actionCounts.set(action.action, (actionCounts.get(action.action) || 0) + 1);
      }
      const topActions = Array.from(actionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (topActions.length > 0) {
        insights.push(`Most effective actions: ${topActions.map(a => a[0]).join(', ')}`);
      }
    }

    if (failureCount > 0) {
      insights.push(`Found ${failureCount} failed experiences to learn from.`);
      recommendations.push('Review failed experiences to identify patterns and improve future performance.');
    }

    // Class-based insights
    const classifications = new Map<string, number>();
    for (const exp of replayed) {
      classifications.set(exp.classification, (classifications.get(exp.classification) || 0) + 1);
    }
    const topClass = Array.from(classifications.entries())
      .sort((a, b) => b[1] - a[1])[0];

    if (topClass) {
      insights.push(`Most common experience type: ${topClass[0]} (${topClass[1]} experiences)`);
    }

    // Emotional patterns
    const allEmotions = replayed.flatMap(e => e.emotions);
    const emotionCounts = new Map<string, number>();
    for (const emotion of allEmotions) {
      emotionCounts.set(emotion, (emotionCounts.get(emotion) || 0) + 1);
    }
    const topEmotions = Array.from(emotionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topEmotions.length > 0) {
      insights.push(`Emotional patterns: ${topEmotions.map(e => e[0]).join(', ')}`);
    }

    // Recommendations
    if (successRate < 0.5 && replayed.length > 5) {
      recommendations.push('Consider adjusting strategy - low success rate across replayed experiences.');
    }

    if (replayed.some(e => e.replayCount > 3)) {
      recommendations.push('Some experiences have been replayed multiple times. Consider consolidating learnings.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue current approach - replay analysis shows positive patterns.');
    }

    return { insights, recommendations };
  }

  classify(experience: any): string {
    const context = (experience.context || '').toLowerCase();
    const outcome = (experience.outcome || '').toLowerCase();

    // Classification by context keywords
    if (/code|program|develop|build|implement|function|api|endpoint/i.test(context)) {
      return 'code_generation';
    }
    if (/fix|debug|error|bug|issue|solve|resolve|troubleshoot/i.test(context)) {
      return 'debugging';
    }
    if (/explain|describe|what is|how does|why/i.test(context)) {
      return 'explanation';
    }
    if (/analyze|review|audit|check|inspect|examine/i.test(context)) {
      return 'analysis';
    }
    if (/search|find|look|locate|retrieve/i.test(context)) {
      return 'search';
    }
    if (/learn|study|research|understand|comprehend/i.test(context)) {
      return 'learning';
    }
    if (/write|create|generate|design|compose/i.test(context)) {
      return 'creation';
    }
    if (/test|validate|verify|check/i.test(context)) {
      return 'testing';
    }
    if (/deploy|release|publish|launch/i.test(context)) {
      return 'deployment';
    }
    if (/plan|organize|schedule|arrange|strategy/i.test(context)) {
      return 'planning';
    }
    if (/communicate|discuss|explain|present|report/i.test(context)) {
      return 'communication';
    }

    // Classification by outcome
    if (/success|complete|correct|good/i.test(outcome)) {
      return 'successful_interaction';
    }
    if (/fail|error|wrong|bad|incorrect|partial/i.test(outcome)) {
      return 'failed_interaction';
    }

    return 'general';
  }

  scheduleReplay(intervalMs: number = 300000): void {
    if (this.replayTimer) {
      clearInterval(this.replayTimer);
    }

    this.replayTimer = setInterval(() => {
      // Select experiences for replay:
      // 1. Ones that haven't been replayed
      // 2. High-value experiences (successful or failed)
      // 3. Recent experiences

      const candidates = Array.from(this.experiences.values())
        .filter(e => {
          // Replay if never replayed, or if it's been a while
          if (e.replayCount === 0) return true;
          if (e.lastReplayedAt && Date.now() - e.lastReplayedAt > 24 * 60 * 60 * 1000) return true;
          return false;
        })
        .sort((a, b) => {
          // Prioritize: failed > successful > others
          const aIsFailed = /fail|error/i.test(a.outcome);
          const bIsFailed = /fail|error/i.test(b.outcome);
          if (aIsFailed && !bIsFailed) return -1;
          if (!aIsFailed && bIsFailed) return 1;
          return b.timestamp - a.timestamp;
        })
        .slice(0, 10);

      if (candidates.length > 0) {
        this.replay(candidates.map(e => e.id));
      }
    }, intervalMs);
  }
}