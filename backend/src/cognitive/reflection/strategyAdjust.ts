/**
 * StrategyAdjustment - Generates, revises, evaluates, and migrates
 * strategies based on experience analysis.
 */
import { v4 as uuidv4 } from 'uuid';

export class StrategyAdjustment {
  private strategies: Map<string, {
    id: string;
    name: string;
    rules: string[];
    revisionHistory: { date: string; change: string; reason: string }[];
    effectiveness: number;
    context: string;
    createdAt: string;
  }> = new Map();

  generateStrategy(experience: any): {
    id: string;
    name: string;
    rules: string[];
    revisionHistory: { date: string; change: string; reason: string }[];
    effectiveness: number;
  } {
    const id = uuidv4();
    const context = (experience.context || '').toLowerCase();
    const outcome = (experience.outcome || '').toLowerCase();

    const rules: string[] = [];
    const now = new Date().toISOString();

    // Generate rules based on experience type
    if (/code|program|develop|build|implement/i.test(context)) {
      rules.push('Analyze requirements before writing code');
      rules.push('Break down into small, testable components');
      rules.push('Write tests before or alongside implementation');
      rules.push('Review code for correctness and edge cases');
      rules.push('Document key decisions and assumptions');
    } else if (/debug|fix|error|bug|troubleshoot/i.test(context)) {
      rules.push('Reproduce the issue first');
      rules.push('Isolate the root cause systematically');
      rules.push('Test the fix in isolation');
      rules.push('Verify the fix doesn\'t introduce regressions');
      rules.push('Document the root cause and solution');
    } else if (/explain|describe|teach/i.test(context)) {
      rules.push('Start with a high-level overview');
      rules.push('Break down into digestible parts');
      rules.push('Use concrete examples and analogies');
      rules.push('Check for understanding');
      rules.push('Summarize key points');
    } else if (/search|find|research/i.test(context)) {
      rules.push('Define the search scope clearly');
      rules.push('Use multiple sources and approaches');
      rules.push('Evaluate source credibility');
      rules.push('Synthesize findings into actionable insights');
      rules.push('Cite sources appropriately');
    } else if (/plan|organize|strategy/i.test(context)) {
      rules.push('Define clear objectives and success criteria');
      rules.push('Identify dependencies and constraints');
      rules.push('Create a phased approach with milestones');
      rules.push('Build in checkpoints and feedback loops');
      rules.push('Prepare contingency plans');
    }

    // Outcome-based rules
    if (/fail|error|wrong|bad|incorrect/i.test(outcome)) {
      rules.push('Double-check assumptions before proceeding');
      rules.push('Seek clarification when uncertain');
      rules.push('Validate intermediate results');
    } else if (/success|complete|correct|good/i.test(outcome)) {
      rules.push('Document successful patterns for reuse');
      rules.push('Share effective approaches with the team');
    }

    if (rules.length === 0) {
      rules.push('Understand the full context before acting');
      rules.push('Break complex problems into manageable steps');
      rules.push('Validate outcomes against expectations');
      rules.push('Learn from both successes and failures');
    }

    const strategy = {
      id,
      name: `Strategy for: ${(experience.context || 'general').substring(0, 50)}`,
      rules,
      revisionHistory: [
        {
          date: now,
          change: 'Initial strategy creation',
          reason: `Generated from experience: ${(experience.context || '').substring(0, 100)}`,
        },
      ],
      effectiveness: 0.5,
      context: experience.context || '',
      createdAt: now,
    };

    this.strategies.set(id, strategy);
    return strategy;
  }

  reviseStrategy(strategy: any, analysis: any): {
    id: string;
    rules: string[];
    revisionHistory: any[];
  } {
    const existing = this.strategies.get(strategy.id);
    if (!existing) {
      return { id: strategy.id, rules: strategy.rules || [], revisionHistory: strategy.revisionHistory || [] };
    }

    const rules = [...existing.rules];
    const now = new Date().toISOString();

    // Add new rules based on analysis
    if (analysis.alternativeActions) {
      for (const alt of analysis.alternativeActions) {
        const rule = this.convertToRule(alt);
        if (rule && !rules.includes(rule)) {
          rules.push(rule);
          existing.revisionHistory.push({
            date: now,
            change: `Added rule: ${rule}`,
            reason: `Based on analysis: ${analysis.rootCause || ''}`,
          });
        }
      }
    }

    // Add learning points as rules
    if (analysis.learningPoints) {
      for (const lp of analysis.learningPoints) {
        const rule = this.convertToRule(lp);
        if (rule && !rules.includes(rule)) {
          rules.push(rule);
          existing.revisionHistory.push({
            date: now,
            change: `Added rule: ${rule}`,
            reason: `Learning point: ${lp}`,
          });
        }
      }
    }

    // Remove ineffective rules
    const negativeFactors = (analysis.factors || []).filter((f: any) => f.weight < -0.3);
    if (negativeFactors.length > 0) {
      for (const factor of negativeFactors) {
        const relatedRules = rules.filter(r =>
          r.toLowerCase().includes(factor.factor.replace(/_/g, ' '))
        );
        for (const rule of relatedRules) {
          if (Math.random() < 0.3) {
            const idx = rules.indexOf(rule);
            if (idx >= 0) {
              rules.splice(idx, 1);
              existing.revisionHistory.push({
                date: now,
                change: `Removed rule: ${rule}`,
                reason: `Ineffective due to factor: ${factor.factor}`,
              });
            }
          }
        }
      }
    }

    existing.rules = rules;
    return { id: existing.id, rules: [...existing.rules], revisionHistory: [...existing.revisionHistory] };
  }

  evaluateStrategy(strategy: any): number {
    const existing = this.strategies.get(strategy.id);
    if (!existing) return 0.5;

    let score = 0;

    // Rule count: having rules is good, but too many is unwieldy
    const ruleCount = existing.rules.length;
    if (ruleCount >= 3 && ruleCount <= 10) {
      score += 0.3;
    } else if (ruleCount > 10) {
      score += 0.2;
    } else if (ruleCount > 0) {
      score += 0.1;
    }

    // Revision history: strategies that evolve are more effective
    const revisionCount = existing.revisionHistory.length;
    score += Math.min(revisionCount * 0.05, 0.2);

    // Rule diversity: check for coverage of different aspects
    const aspects = {
      planning: /plan|analyze|define|identify|scope/i,
      execution: /execute|implement|build|create|write|code/i,
      validation: /test|validate|verify|check|review|inspect/i,
      learning: /learn|document|record|share|communicate|reflect/i,
      risk: /risk|error|fail|fallback|contingency|backup/i,
    };

    let coveredAspects = 0;
    for (const [aspect, pattern] of Object.entries(aspects)) {
      if (existing.rules.some(r => pattern.test(r))) {
        coveredAspects++;
      }
    }
    score += coveredAspects * 0.1;

    // Effectiveness history
    score += existing.effectiveness * 0.3;

    const finalScore = Math.min(score, 1.0);
    existing.effectiveness = Math.round((existing.effectiveness + finalScore) / 2 * 100) / 100;

    return existing.effectiveness;
  }

  applyStrategy(strategy: any): void {
    const existing = this.strategies.get(strategy.id);
    if (!existing) return;

    // Mark as recently used and boost effectiveness slightly
    existing.effectiveness = Math.min(existing.effectiveness + 0.01, 1.0);
  }

  migrateStrategy(strategy: any, newContext: string): {
    id: string;
    rules: string[];
  } {
    const existing = this.strategies.get(strategy.id);
    if (!existing) {
      return { id: strategy.id, rules: strategy.rules || [] };
    }

    const newId = uuidv4();
    const newContextLower = newContext.toLowerCase();
    const now = new Date().toISOString();

    // Adapt rules to new context
    const adaptedRules = existing.rules.map(rule => {
      // Replace context-specific terms with more general ones
      let adapted = rule;

      if (/code|program|develop/i.test(existing.context) && !/code|program|develop/i.test(newContextLower)) {
        adapted = adapted.replace(/\bcode\b/gi, 'solution')
          .replace(/\bprogram\b/gi, 'project')
          .replace(/\bdevelop\b/gi, 'build');
      }

      if (/debug|fix|error/i.test(existing.context) && !/debug|fix|error/i.test(newContextLower)) {
        adapted = adapted.replace(/\bdebug\b/gi, 'analyze')
          .replace(/\bfix\b/gi, 'resolve')
          .replace(/\berror\b/gi, 'issue');
      }

      return adapted;
    });

    const migrated = {
      id: newId,
      name: `${existing.name} (migrated to: ${newContext.substring(0, 30)})`,
      rules: adaptedRules,
      revisionHistory: [
        {
          date: now,
          change: 'Strategy migrated to new context',
          reason: `Migrated from "${existing.context}" to "${newContext}"`,
        },
      ],
      effectiveness: existing.effectiveness * 0.7, // Reduce effectiveness when migrating
      context: newContext,
      createdAt: now,
    };

    this.strategies.set(newId, migrated);
    return { id: newId, rules: [...adaptedRules] };
  }

  private convertToRule(text: string): string | null {
    if (!text || text.length < 5) return null;

    // Convert imperative sentences to rules
    const cleaned = text.trim().replace(/^[•\-\*\d]+\.?\s*/, '');

    // Ensure it starts with a verb
    const verbs = [
      'analyze', 'assess', 'break', 'build', 'check', 'clarify', 'communicate',
      'consider', 'create', 'define', 'document', 'ensure', 'evaluate',
      'identify', 'implement', 'maintain', 'mitigate', 'monitor', 'plan',
      'prepare', 'prioritize', 'review', 'seek', 'start', 'test', 'use',
      'validate', 'verify',
    ];

    for (const verb of verbs) {
      if (cleaned.toLowerCase().startsWith(verb)) {
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
    }

    // Default: add "Consider" prefix
    return `Consider: ${cleaned.charAt(0).toLowerCase() + cleaned.slice(1)}`;
  }
}