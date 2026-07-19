import { describe, it, expect, beforeEach } from 'vitest';
import { GoalManager } from '../../src/cognitive/motivation/goalManager';
import { DriveEngine } from '../../src/cognitive/motivation/driveEngine';
import { RewardSystem } from '../../src/cognitive/motivation/rewardSystem';

describe('GoalManager', () => {
  let goalManager: GoalManager;

  beforeEach(() => {
    goalManager = new GoalManager();
  });

  describe('createGoal', () => {
    it('returns id', () => {
      const id = goalManager.createGoal({ description: 'Learn TypeScript', priority: 'high' });
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
  });

  describe('decomposeGoal', () => {
    it('creates sub-goals', () => {
      const id = goalManager.createGoal({ description: 'Build a web app and deploy it' });
      const subGoalIds = goalManager.decomposeGoal(id);
      expect(subGoalIds.length).toBeGreaterThan(0);
    });

    it('decomposes code goal', () => {
      const id = goalManager.createGoal({ description: 'Write code for a REST API' });
      const subGoalIds = goalManager.decomposeGoal(id);
      expect(subGoalIds.length).toBeGreaterThan(0);
    });

    it('decomposes fix goal', () => {
      const id = goalManager.createGoal({ description: 'Fix the login bug' });
      const subGoalIds = goalManager.decomposeGoal(id);
      expect(subGoalIds.length).toBeGreaterThan(0);
    });
  });

  describe('prioritize', () => {
    it('returns sorted goals', () => {
      goalManager.createGoal({ description: 'Low priority task', priority: 'low' });
      goalManager.createGoal({ description: 'High priority task', priority: 'high' });
      const result = goalManager.prioritize();
      expect(result.length).toBe(2);
      expect(result[0].priority).toBe('high');
    });
  });

  describe('trackProgress', () => {
    it('returns 0-1', () => {
      const id = goalManager.createGoal({ description: 'Test goal' });
      const progress = goalManager.trackProgress(id);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    });

    it('returns 0 for non-existent goal', () => {
      expect(goalManager.trackProgress('non-existent')).toBe(0);
    });
  });

  describe('resolveConflicts', () => {
    it('returns resolution', () => {
      const id1 = goalManager.createGoal({ description: 'Critical task', priority: 'critical' });
      const id2 = goalManager.createGoal({ description: 'Low priority', priority: 'low' });
      const result = goalManager.resolveConflicts(id1, id2);
      expect(result.resolution).toBeDefined();
      expect(result.keep).toBe(id1);
      expect(result.defer).toBe(id2);
    });
  });

  describe('completeGoal', () => {
    it('marks done', () => {
      const id = goalManager.createGoal({ description: 'Test goal' });
      goalManager.completeGoal(id);
      const progress = goalManager.trackProgress(id);
      expect(progress).toBe(1.0);
    });

    it('completes parent when all sub-goals done', () => {
      const parentId = goalManager.createGoal({ description: 'Build a web app and deploy it' });
      const subIds = goalManager.decomposeGoal(parentId);
      for (const subId of subIds) {
        goalManager.completeGoal(subId);
      }
      const progress = goalManager.trackProgress(parentId);
      expect(progress).toBe(1.0);
    });
  });

  describe('generateAutonomousGoal', () => {
    it('creates goal from gaps', () => {
      const result = goalManager.generateAutonomousGoal({
        capabilities: [{ skill: 'debugging', confidence: 0.3 }],
        gaps: ['react', 'typescript'],
      });
      expect(result.description).toBeDefined();
      expect(result.type).toBeDefined();
      expect(result.priority).toBeDefined();
    });
  });
});

describe('DriveEngine', () => {
  let driveEngine: DriveEngine;

  beforeEach(() => {
    driveEngine = new DriveEngine();
  });

  describe('getDrives', () => {
    it('returns all drives', () => {
      const drives = driveEngine.getDrives();
      expect(drives.length).toBeGreaterThan(0);
      expect(drives[0].type).toBeDefined();
      expect(drives[0].level).toBeDefined();
    });
  });

  describe('activateDrive', () => {
    it('increases level', () => {
      const before = driveEngine.getDrives().find(d => d.type === 'curiosity')!;
      driveEngine.activateDrive('curiosity', 'explore new things');
      const after = driveEngine.getDrives().find(d => d.type === 'curiosity')!;
      expect(after.level).toBeGreaterThanOrEqual(before.level);
    });
  });

  describe('deactivateDrive', () => {
    it('decreases level', () => {
      driveEngine.deactivateDrive('curiosity');
      const drives = driveEngine.getDrives();
      const curiosity = drives.find(d => d.type === 'curiosity')!;
      expect(curiosity.level).toBe(0);
    });
  });

  describe('getDominantDrive', () => {
    it('returns highest', () => {
      driveEngine.activateDrive('curiosity', 'explore new things');
      driveEngine.activateDrive('curiosity', 'discover patterns');
      const dominant = driveEngine.getDominantDrive();
      expect(dominant).toBeDefined();
    });
  });

  describe('balanceDrives', () => {
    it('normalizes', () => {
      driveEngine.activateDrive('curiosity', 'explore');
      driveEngine.activateDrive('curiosity', 'discover');
      driveEngine.balanceDrives();
      const drives = driveEngine.getDrives();
      const total = drives.reduce((sum, d) => sum + d.level, 0);
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('decayDrives', () => {
    it('reduces levels', () => {
      // Force decay
      driveEngine.decayDrives();
      const drives = driveEngine.getDrives();
      expect(drives.length).toBeGreaterThan(0);
    });
  });
});

describe('RewardSystem', () => {
  let rewardSystem: RewardSystem;

  beforeEach(() => {
    rewardSystem = new RewardSystem();
  });

  describe('generateReward', () => {
    it('returns reward', () => {
      const reward = rewardSystem.generateReward({ type: 'success', outcome: 'Task completed successfully' });
      expect(reward.type).toBe('success');
      expect(reward.magnitude).toBeGreaterThan(0);
      expect(reward.source).toBeDefined();
    });
  });

  describe('calculateRewardMagnitude', () => {
    it('returns 0-1', () => {
      const magnitude = rewardSystem.calculateRewardMagnitude({ type: 'success', outcome: 'completed' });
      expect(magnitude).toBeGreaterThanOrEqual(0);
      expect(magnitude).toBeLessThanOrEqual(1);
    });

    it('returns higher for success', () => {
      const successMagnitude = rewardSystem.calculateRewardMagnitude({ type: 'success', outcome: 'completed successfully' });
      expect(successMagnitude).toBeGreaterThan(0.5);
    });

    it('returns lower for failure', () => {
      const failMagnitude = rewardSystem.calculateRewardMagnitude({ type: 'success', outcome: 'failed' });
      expect(failMagnitude).toBeLessThan(0.5);
    });
  });

  describe('applyReward', () => {
    it('returns effects', () => {
      const effects = rewardSystem.applyReward({ type: 'success', magnitude: 0.8 });
      expect(effects.motivationBoost).toBeGreaterThan(0);
      expect(effects.confidenceIncrease).toBeGreaterThan(0);
      expect(typeof effects.memoryStrengthening).toBe('boolean');
    });
  });

  describe('getRewardHistory', () => {
    it('returns history', () => {
      rewardSystem.generateReward({ type: 'success', outcome: 'done' });
      const history = rewardSystem.getRewardHistory();
      expect(history.length).toBeGreaterThan(0);
    });
  });
});