/**
 * ValueEvaluator - Evaluates tasks based on instrumental value,
 * emotional value, growth value, and alignment with goals.
 * Used for task prioritization and decision making.
 */
export class ValueEvaluator {
  evaluate(task: { description: string; type: string }): {
    instrumentalValue: number;
    emotionalValue: number;
    growthValue: number;
    alignmentWithGoals: number;
    overallValue: number;
    priority: string;
  } {
    const instrumentalValue = this.evaluateInstrumental(task);
    const emotionalValue = this.evaluateEmotional(task);
    const growthValue = this.evaluateGrowth(task);

    // Overall value: weighted average
    const overallValue = Math.round(
      (instrumentalValue * 0.4 + emotionalValue * 0.2 + growthValue * 0.4) * 100
    ) / 100;

    let priority = 'low';
    if (overallValue >= 0.7) {
      priority = 'high';
    } else if (overallValue >= 0.4) {
      priority = 'medium';
    }

    return {
      instrumentalValue: Math.round(instrumentalValue * 100) / 100,
      emotionalValue: Math.round(emotionalValue * 100) / 100,
      growthValue: Math.round(growthValue * 100) / 100,
      alignmentWithGoals: overallValue * 0.8, // Approximate alignment
      overallValue,
      priority,
    };
  }

  evaluateInstrumental(task: { description: string }): number {
    const lower = task.description.toLowerCase();
    let score = 0.3; // Base score

    // Urgency indicators
    if (/urgent|critical|emergency|asap|immediately|right now/i.test(lower)) {
      score += 0.3;
    }

    // Impact indicators
    if (/important|essential|crucial|vital|key|fundamental|core/i.test(lower)) {
      score += 0.2;
    }

    // Dependency indicators
    if (/prerequisite|blocker|dependency|required|necessary|needed|must/i.test(lower)) {
      score += 0.15;
    }

    // Efficiency indicators
    if (/optimize|improve|enhance|boost|increase|reduce|save/i.test(lower)) {
      score += 0.1;
    }

    // Cost/saving indicators
    if (/cost|money|budget|resource|save|cheap|expensive/i.test(lower)) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }

  evaluateEmotional(task: { description: string }): number {
    const lower = task.description.toLowerCase();
    let score = 0.3; // Base score

    // Enjoyment indicators
    if (/fun|enjoy|like|love|favorite|interesting|exciting|creative/i.test(lower)) {
      score += 0.3;
    }

    // Meaning/purpose indicators
    if (/meaningful|purpose|mission|impact|difference|help|contribute/i.test(lower)) {
      score += 0.25;
    }

    // Social/connection indicators
    if (/team|collaborate|together|share|community|people|user|client/i.test(lower)) {
      score += 0.15;
    }

    // Avoidance indicators (negative)
    if (/boring|tedious|annoying|frustrating|dread|hate|dislike|painful/i.test(lower)) {
      score -= 0.2;
    }

    return Math.max(0, Math.min(score, 1.0));
  }

  evaluateGrowth(task: { description: string }): number {
    const lower = task.description.toLowerCase();
    let score = 0.3; // Base score

    // Learning indicators
    if (/learn|study|research|understand|explore|discover|master|skill|knowledge/i.test(lower)) {
      score += 0.3;
    }

    // Challenge indicators
    if (/challenge|difficult|complex|advanced|hard|new|novel|unfamiliar/i.test(lower)) {
      score += 0.15;
    }

    // Skill development
    if (/develop|improve|grow|advance|progress|level up|become|achieve/i.test(lower)) {
      score += 0.2;
    }

    // Career/identity growth
    if (/career|professional|expertise|specialization|domain|portfolio|experience/i.test(lower)) {
      score += 0.15;
    }

    // Novelty and expansion
    if (/first|never|unprecedented|pioneer|innovate|breakthrough|cutting.edge/i.test(lower)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  alignWithGoals(task: { description: string }, goals: any[]): number {
    if (!goals || goals.length === 0) return 0.3;

    const lower = task.description.toLowerCase();
    let maxAlignment = 0;

    for (const goal of goals) {
      const goalText = (goal.description || '').toLowerCase();
      if (!goalText) continue;

      // Word overlap
      const taskWords = new Set(lower.split(/\s+/).filter((w: string) => w.length > 2));
      const goalWords = new Set(goalText.split(/\s+/).filter((w: string) => w.length > 2));

      if (taskWords.size === 0 || goalWords.size === 0) continue;

      let overlap = 0;
      for (const w of taskWords) {
        if (goalWords.has(w)) overlap++;
      }

      const similarity = (2 * overlap) / (taskWords.size + goalWords.size);
      maxAlignment = Math.max(maxAlignment, similarity);
    }

    return Math.round(maxAlignment * 100) / 100;
  }

  prioritize(tasks: { description: string; type: string }[]): {
    task: string;
    priority: string;
    score: number;
  }[] {
    return tasks
      .map(task => {
        const evaluation = this.evaluate(task);
        return {
          task: task.description,
          priority: evaluation.priority,
          score: evaluation.overallValue,
        };
      })
      .sort((a, b) => b.score - a.score);
  }
}