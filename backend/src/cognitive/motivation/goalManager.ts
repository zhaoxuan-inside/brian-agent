/**
 * GoalManager - Manages agent goals with decomposition, prioritization,
 * progress tracking, conflict resolution, and autonomous goal generation.
 */
import { v4 as uuidv4 } from 'uuid';

interface Goal {
  id: string;
  description: string;
  deadline?: string;
  priority: string;
  status: 'active' | 'completed' | 'deferred' | 'cancelled';
  subGoals: string[];
  parentGoalId?: string;
  progress: number;
  createdAt: number;
  completedAt?: number;
}

export class GoalManager {
  private goals: Map<string, Goal> = new Map();

  createGoal(goal: { description: string; deadline?: string; priority?: string }): string {
    const id = uuidv4();
    const g: Goal = {
      id,
      description: goal.description,
      deadline: goal.deadline,
      priority: goal.priority || 'medium',
      status: 'active',
      subGoals: [],
      progress: 0,
      createdAt: Date.now(),
    };
    this.goals.set(id, g);
    return id;
  }

  decomposeGoal(goalId: string): string[] {
    const goal = this.goals.get(goalId);
    if (!goal) return [];

    const description = goal.description.toLowerCase();
    const subGoalDescriptions: string[] = [];

    // Decompose based on action verbs and structure
    if (/\b(?:and|then|after|before|first|next|finally|also|additionally)\b/i.test(goal.description)) {
      // Split on conjunctions and sequence markers
      const parts = goal.description.split(/\b(?:and|then|after|before|first|next|finally|also|additionally)\b/i)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      if (parts.length > 1) {
        for (const part of parts) {
          subGoalDescriptions.push(part);
        }
      }
    }

    // If no decomposition via conjunctions, decompose by action type
    if (subGoalDescriptions.length === 0) {
      const actionPatterns: Record<string, string[]> = {
        code: ['analyze requirements', 'design architecture', 'implement solution', 'test and validate', 'document and review'],
        write: ['outline structure', 'draft content', 'review and edit', 'finalize and format'],
        build: ['plan components', 'set up foundation', 'build core features', 'integrate and test', 'deploy and verify'],
        learn: ['research topic', 'gather resources', 'study fundamentals', 'practice application', 'review and consolidate'],
        fix: ['identify issue', 'analyze root cause', 'implement fix', 'verify solution', 'prevent recurrence'],
        search: ['define search scope', 'gather information', 'analyze results', 'synthesize findings'],
        design: ['research requirements', 'create wireframes', 'design components', 'review and iterate'],
        deploy: ['prepare environment', 'run tests', 'deploy application', 'verify deployment', 'monitor performance'],
      };

      for (const [action, steps] of Object.entries(actionPatterns)) {
        if (description.includes(action)) {
          for (const step of steps) {
            subGoalDescriptions.push(`${step} for: ${goal.description}`);
          }
          break;
        }
      }
    }

    // Fallback: generic decomposition
    if (subGoalDescriptions.length === 0) {
      subGoalDescriptions.push(
        `Research and understand: ${goal.description}`,
        `Plan approach for: ${goal.description}`,
        `Execute: ${goal.description}`,
        `Verify and review: ${goal.description}`
      );
    }

    const subGoalIds: string[] = [];
    for (const desc of subGoalDescriptions) {
      const subId = this.createGoal({
        description: desc,
        priority: goal.priority,
        deadline: goal.deadline,
      });
      const subGoal = this.goals.get(subId)!;
      subGoal.parentGoalId = goalId;
      subGoalIds.push(subId);
    }

    goal.subGoals = subGoalIds;
    return subGoalIds;
  }

  prioritize(): { id: string; description: string; priority: string }[] {
    const active = Array.from(this.goals.values()).filter(g => g.status === 'active');
    const now = Date.now();

    const scored = active.map(goal => {
      let score = 0;

      // Priority base score
      switch (goal.priority) {
        case 'critical': score += 100; break;
        case 'high': score += 75; break;
        case 'medium': score += 50; break;
        case 'low': score += 25; break;
      }

      // Deadline urgency
      if (goal.deadline) {
        const deadline = new Date(goal.deadline).getTime();
        const timeRemaining = deadline - now;
        if (timeRemaining <= 0) {
          score += 50; // Overdue
        } else if (timeRemaining < 3600000) { // < 1 hour
          score += 40;
        } else if (timeRemaining < 86400000) { // < 1 day
          score += 30;
        } else if (timeRemaining < 604800000) { // < 1 week
          score += 15;
        }
      }

      // Progress: incomplete goals are more urgent
      score += (1 - goal.progress) * 20;

      return { goal, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Update priorities based on scoring
    const results: { id: string; description: string; priority: string }[] = [];
    for (let i = 0; i < scored.length; i++) {
      const { goal, score } = scored[i];
      let newPriority = 'low';
      if (score >= 100) newPriority = 'critical';
      else if (score >= 70) newPriority = 'high';
      else if (score >= 40) newPriority = 'medium';

      if (goal.priority !== newPriority) {
        goal.priority = newPriority;
      }

      results.push({ id: goal.id, description: goal.description, priority: goal.priority });
    }

    return results;
  }

  trackProgress(goalId: string): number {
    const goal = this.goals.get(goalId);
    if (!goal) return 0;

    if (goal.status === 'completed') {
      goal.progress = 1.0;
      return 1.0;
    }

    // If goal has sub-goals, progress is average of sub-goals
    if (goal.subGoals.length > 0) {
      const subProgresses = goal.subGoals
        .map(subId => this.trackProgress(subId))
        .filter(p => p >= 0);

      if (subProgresses.length > 0) {
        goal.progress = subProgresses.reduce((a, b) => a + b, 0) / subProgresses.length;
        return goal.progress;
      }
    }

    return goal.progress;
  }

  resolveConflicts(goalId1: string, goalId2: string): {
    resolution: string;
    keep: string;
    defer: string;
  } {
    const goal1 = this.goals.get(goalId1);
    const goal2 = this.goals.get(goalId2);

    if (!goal1 || !goal2) {
      return { resolution: 'Cannot resolve: one or both goals not found', keep: goalId1, defer: goalId2 };
    }

    const score1 = this.calculateGoalScore(goal1);
    const score2 = this.calculateGoalScore(goal2);

    if (score1 >= score2) {
      goal2.status = 'deferred';
      return {
        resolution: `"${goal1.description}" prioritized over "${goal2.description}" based on urgency and importance`,
        keep: goalId1,
        defer: goalId2,
      };
    } else {
      goal1.status = 'deferred';
      return {
        resolution: `"${goal2.description}" prioritized over "${goal1.description}" based on urgency and importance`,
        keep: goalId2,
        defer: goalId1,
      };
    }
  }

  getActiveGoals(): { id: string; description: string; priority: string; progress: number }[] {
    return Array.from(this.goals.values())
      .filter(g => g.status === 'active')
      .map(g => ({
        id: g.id,
        description: g.description,
        priority: g.priority,
        progress: this.trackProgress(g.id),
      }))
      .sort((a, b) => {
        const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  completeGoal(goalId: string): void {
    const goal = this.goals.get(goalId);
    if (!goal) return;

    goal.status = 'completed';
    goal.progress = 1.0;
    goal.completedAt = Date.now();

    // If this is a sub-goal, check if parent is complete
    if (goal.parentGoalId) {
      const parent = this.goals.get(goal.parentGoalId);
      if (parent) {
        const allSubComplete = parent.subGoals.every(
          subId => this.goals.get(subId)?.status === 'completed'
        );
        if (allSubComplete) {
          this.completeGoal(parent.id);
        } else {
          this.trackProgress(parent.id);
        }
      }
    }
  }

  generateAutonomousGoal(selfModel: {
    capabilities: any[];
    gaps: string[];
  }): { description: string; type: string; priority: string } {
    const goals: { description: string; type: string; priority: string }[] = [];

    // Generate goals from gaps
    for (const gap of selfModel.gaps) {
      goals.push({
        description: `Learn and understand: ${gap}`,
        type: 'learning',
        priority: 'high',
      });
    }

    // Generate goals from capability improvement
    if (selfModel.capabilities) {
      for (const cap of selfModel.capabilities) {
        if (cap.confidence < 0.5) {
          goals.push({
            description: `Improve capability: ${cap.skill || cap.name}`,
            type: 'improvement',
            priority: 'medium',
          });
        }
      }
    }

    // Generate maintenance goals
    goals.push({
      description: 'Review and consolidate recent knowledge',
      type: 'maintenance',
      priority: 'low',
    });

    goals.push({
      description: 'Analyze feedback patterns for improvement areas',
      type: 'reflection',
      priority: 'medium',
    });

    // Select the highest priority goal
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    goals.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return goals[0] || {
      description: 'Maintain operational readiness',
      type: 'maintenance',
      priority: 'low',
    };
  }

  private calculateGoalScore(goal: Goal): number {
    let score = 0;

    // Priority score
    switch (goal.priority) {
      case 'critical': score += 50; break;
      case 'high': score += 35; break;
      case 'medium': score += 20; break;
      case 'low': score += 10; break;
    }

    // Deadline pressure
    if (goal.deadline) {
      const deadline = new Date(goal.deadline).getTime();
      const remaining = deadline - Date.now();
      if (remaining <= 0) score += 30;
      else if (remaining < 3600000) score += 25;
      else if (remaining < 86400000) score += 15;
      else if (remaining < 604800000) score += 5;
    }

    // Progress (incomplete goals are more urgent)
    score += (1 - goal.progress) * 15;

    // Sub-goals add complexity/importance
    score += goal.subGoals.length * 2;

    return score;
  }
}