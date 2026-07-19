/**
 * RewardSystem - Generates and applies rewards based on agent actions and outcomes.
 * Rewards affect motivation, confidence, and memory strengthening.
 */
export class RewardSystem {
  private rewardHistory: {
    type: string;
    magnitude: number;
    source: string;
    timestamp: number;
  }[] = [];

  private readonly REWARD_TYPES = {
    success: { baseMagnitude: 0.8, label: 'Task Success' },
    completion: { baseMagnitude: 0.7, label: 'Task Completion' },
    learning: { baseMagnitude: 0.6, label: 'Learning Achievement' },
    helpful: { baseMagnitude: 0.5, label: 'Helpful Contribution' },
    improvement: { baseMagnitude: 0.6, label: 'Improvement' },
    discovery: { baseMagnitude: 0.4, label: 'Discovery' },
    positive_feedback: { baseMagnitude: 0.7, label: 'Positive Feedback' },
    problem_solved: { baseMagnitude: 0.9, label: 'Problem Solved' },
    efficiency: { baseMagnitude: 0.3, label: 'Efficiency Gain' },
    collaboration: { baseMagnitude: 0.4, label: 'Collaboration' },
  };

  generateReward(event: { type: string; outcome: string }): {
    type: string;
    magnitude: number;
    source: string;
  } {
    const magnitude = this.calculateRewardMagnitude(event);
    const rewardType = this.REWARD_TYPES[event.type as keyof typeof this.REWARD_TYPES];
    const source = rewardType ? rewardType.label : 'Unknown';

    const reward = {
      type: event.type,
      magnitude: Math.round(magnitude * 100) / 100,
      source,
    };

    this.rewardHistory.push({
      ...reward,
      timestamp: Date.now(),
    });

    // Keep history bounded
    if (this.rewardHistory.length > 500) {
      this.rewardHistory = this.rewardHistory.slice(-500);
    }

    return reward;
  }

  calculateRewardMagnitude(event: { type: string; outcome: string }): number {
    const rewardType = this.REWARD_TYPES[event.type as keyof typeof this.REWARD_TYPES];
    let magnitude = rewardType ? rewardType.baseMagnitude : 0.2;

    // Adjust based on outcome
    const outcomeLower = event.outcome.toLowerCase();

    // Positive outcome modifiers
    if (/success|complete|great|excellent|amazing|perfect|correct|good|well|positive/i.test(outcomeLower)) {
      magnitude *= 1.2;
    }
    // Negative outcome modifiers
    else if (/fail|error|bad|wrong|incorrect|poor|terrible|partial|incomplete/i.test(outcomeLower)) {
      magnitude *= 0.3;
    }

    // Complexity bonus
    if (/complex|difficult|challenging|advanced|hard|intricate/i.test(outcomeLower)) {
      magnitude *= 1.3;
    }

    // Speed bonus
    if (/fast|quick|rapid|efficient|optimized/i.test(outcomeLower)) {
      magnitude *= 1.1;
    }

    // Learning bonus
    if (/learn|discover|understand|insight|new|novel|innovative/i.test(outcomeLower)) {
      magnitude *= 1.15;
    }

    return Math.min(magnitude, 1.0);
  }

  applyReward(reward: { type: string; magnitude: number }): {
    motivationBoost: number;
    confidenceIncrease: number;
    memoryStrengthening: boolean;
  } {
    // Motivation boost: proportional to reward magnitude
    const motivationBoost = reward.magnitude * 0.3;

    // Confidence increase: moderate boost from success
    const confidenceIncrease = reward.magnitude * 0.15;

    // Memory strengthening: significant rewards strengthen memory
    const memoryStrengthening = reward.magnitude > 0.5;

    return {
      motivationBoost: Math.round(motivationBoost * 100) / 100,
      confidenceIncrease: Math.round(confidenceIncrease * 100) / 100,
      memoryStrengthening,
    };
  }

  getRewardHistory(): {
    type: string;
    magnitude: number;
    source: string;
    timestamp: number;
  }[] {
    return [...this.rewardHistory].sort((a, b) => b.timestamp - a.timestamp);
  }
}