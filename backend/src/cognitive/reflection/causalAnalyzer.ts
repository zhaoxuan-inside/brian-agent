/**
 * CausalAnalyzer - Analyzes experiences to identify contributing factors,
 * root causes, and generate alternative actions and learning points.
 */
export class CausalAnalyzer {
  analyze(experience: any): {
    outcome: string;
    contributingFactors: { factor: string; weight: number }[];
    rootCause: string;
    alternativeActions: string[];
    learningPoints: string[];
  } {
    const outcome = experience.outcome || '';
    const factors = this.identifyFactors(experience);
    const rootCause = this.findRootCause(factors);
    const analysis = { outcome, factors, rootCause };
    const alternativeActions = this.generateAlternatives(analysis);
    const learningPoints = this.generateLearningPoints(analysis);

    return {
      outcome,
      contributingFactors: factors,
      rootCause,
      alternativeActions,
      learningPoints,
    };
  }

  identifyFactors(experience: any): { factor: string; weight: number }[] {
    const factors: { factor: string; weight: number }[] = [];
    const context = (experience.context || '').toLowerCase();
    const outcome = (experience.outcome || '').toLowerCase();
    const actions = experience.actions || [];

    // Factor 1: Context complexity
    const complexityIndicators = [
      'complex', 'difficult', 'challenging', 'advanced', 'hard',
      'multiple', 'several', 'many', 'various', 'intricate', 'sophisticated',
    ];
    const complexityScore = complexityIndicators.filter(w => context.includes(w)).length;
    if (complexityScore > 0) {
      factors.push({
        factor: 'context_complexity',
        weight: Math.min(complexityScore * 0.25, 1.0),
      });
    }

    // Factor 2: Context clarity
    const clarityIndicators = [
      'clear', 'specific', 'precise', 'explicit', 'detailed',
      'well-defined', 'structured', 'organized',
    ];
    const clarityScore = clarityIndicators.filter(w => context.includes(w)).length;
    const ambiguityIndicators = [
      'unclear', 'vague', 'ambiguous', 'confusing', 'uncertain',
      'maybe', 'perhaps', 'possibly', 'not sure',
    ];
    const ambiguityScore = ambiguityIndicators.filter(w => context.includes(w)).length;

    if (clarityScore > 0) {
      factors.push({ factor: 'context_clarity', weight: clarityScore * 0.2 });
    }
    if (ambiguityScore > 0) {
      factors.push({ factor: 'context_ambiguity', weight: -ambiguityScore * 0.25 });
    }

    // Factor 3: Action count
    const actionCount = actions.length;
    if (actionCount > 0) {
      factors.push({
        factor: 'action_count',
        weight: Math.min(actionCount / 10, 0.5),
      });
    }

    // Factor 4: Action effectiveness
    if (actions.length > 0) {
      const successfulActions = actions.filter((a: any) =>
        /success|complete|correct|good|positive|done|working/i.test(a.result || '')
      ).length;
      const effectiveness = successfulActions / actions.length;
      factors.push({
        factor: 'action_effectiveness',
        weight: effectiveness,
      });
    }

    // Factor 5: Emotional state
    const positiveEmotions = (experience.emotions || []).filter((e: string) =>
      /happy|confident|curious|excited|satisfied|calm|motivated/i.test(e)
    ).length;
    const negativeEmotions = (experience.emotions || []).filter((e: string) =>
      /frustrated|anxious|confused|angry|sad|tired|stressed/i.test(e)
    ).length;

    if (positiveEmotions > 0) {
      factors.push({ factor: 'positive_emotional_state', weight: positiveEmotions * 0.15 });
    }
    if (negativeEmotions > 0) {
      factors.push({ factor: 'negative_emotional_state', weight: -negativeEmotions * 0.2 });
    }

    // Factor 6: Is this a repeated context?
    if (/again|still|continue|repeat|same|similar|previous|last time/i.test(context)) {
      factors.push({ factor: 'repeated_context', weight: 0.3 });
    }

    // Factor 7: External dependencies
    if (/external|api|service|network|connect|database|server|remote|third.?party/i.test(context)) {
      factors.push({ factor: 'external_dependencies', weight: 0.2 });
    }

    // Factor 8: Time pressure
    if (/urgent|quick|fast|rapid|deadline|asap|immediately|hurry|time.?sensitive/i.test(context)) {
      factors.push({ factor: 'time_pressure', weight: -0.3 });
    }

    return factors;
  }

  findRootCause(factors: { factor: string; weight: number }[]): string {
    if (factors.length === 0) {
      return 'No clear contributing factors identified';
    }

    // Sort by absolute weight to find the most impactful factor
    const sorted = [...factors].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

    const topFactor = sorted[0];
    const isNegative = topFactor.weight < 0;

    const rootCauseMap: Record<string, string> = {
      context_complexity: 'The task was inherently complex, requiring more careful analysis and planning.',
      context_clarity: 'The task was clearly defined, leading to more effective execution.',
      context_ambiguity: 'Ambiguous or unclear requirements caused uncertainty in execution.',
      action_count: 'The number of actions taken was a key factor in the outcome.',
      action_effectiveness: isNegative
        ? 'Ineffective actions were the primary cause of the outcome.'
        : 'Effective actions were the primary driver of the positive outcome.',
      positive_emotional_state: 'A positive emotional state contributed to better performance.',
      negative_emotional_state: 'A negative emotional state hindered performance.',
      repeated_context: 'Previous experience with similar contexts influenced the outcome.',
      external_dependencies: 'External dependencies affected the ability to complete the task.',
      time_pressure: 'Time pressure led to rushed decision-making.',
    };

    return rootCauseMap[topFactor.factor] || `The primary factor was '${topFactor.factor}' (weight: ${topFactor.weight})`;
  }

  generateAlternatives(analysis: any): string[] {
    const alternatives: string[] = [];
    const factors = analysis.factors || [];
    const rootCause = analysis.rootCause || '';

    // Generate alternatives based on negative factors
    for (const factor of factors) {
      if (factor.weight < 0) {
        switch (factor.factor) {
          case 'context_ambiguity':
            alternatives.push('Seek clarification on requirements before proceeding');
            alternatives.push('Break down ambiguous tasks into smaller, well-defined sub-tasks');
            break;
          case 'context_complexity':
            alternatives.push('Use a structured decomposition approach (divide and conquer)');
            alternatives.push('Create a detailed plan before execution');
            break;
          case 'negative_emotional_state':
            alternatives.push('Take a brief pause to reset emotional state');
            alternatives.push('Reframe the challenge as a learning opportunity');
            break;
          case 'time_pressure':
            alternatives.push('Prioritize the most critical aspects and defer non-essential work');
            alternatives.push('Communicate timeline constraints early to manage expectations');
            break;
          case 'action_effectiveness':
            alternatives.push('Evaluate each action before execution');
            alternatives.push('Consider multiple approaches before committing to one');
            break;
        }
      }
    }

    // General alternatives
    if (alternatives.length === 0) {
      alternatives.push('Consider a different strategy or approach');
      alternatives.push('Seek additional information or resources');
      alternatives.push('Consult previous successful experiences for guidance');
    }

    return alternatives;
  }

  private generateLearningPoints(analysis: any): string[] {
    const learningPoints: string[] = [];
    const factors = analysis.factors || [];
    const rootCause = analysis.rootCause || '';

    // Learn from positive factors
    const positiveFactors = factors.filter((f: any) => f.weight > 0.3);
    if (positiveFactors.length > 0) {
      learningPoints.push(
        `Leverage ${positiveFactors.map((f: any) => f.factor).join(' and ')} in future tasks`
      );
    }

    // Learn from negative factors
    const negativeFactors = factors.filter((f: any) => f.weight < -0.2);
    if (negativeFactors.length > 0) {
      learningPoints.push(
        `Mitigate ${negativeFactors.map((f: any) => f.factor).join(' and ')} in future tasks`
      );
    }

    // Root cause learning
    if (rootCause.includes('complex')) {
      learningPoints.push('Complex tasks benefit from upfront planning and decomposition');
    }
    if (rootCause.includes('ambiguous')) {
      learningPoints.push('Always validate understanding before proceeding with ambiguous tasks');
    }
    if (rootCause.includes('emotional')) {
      learningPoints.push('Emotional state awareness is important for optimal performance');
    }
    if (rootCause.includes('external')) {
      learningPoints.push('Identify and plan for external dependencies early');
    }
    if (rootCause.includes('time')) {
      learningPoints.push('Time management and prioritization are critical under pressure');
    }
    if (rootCause.includes('effective')) {
      learningPoints.push('Document effective approaches for future reuse');
    }

    if (learningPoints.length === 0) {
      learningPoints.push('Every experience provides an opportunity for growth and improvement');
    }

    return learningPoints;
  }
}