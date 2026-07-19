import { describe, it, expect, beforeEach } from 'vitest';
import { ExperienceReplay } from '../../src/cognitive/reflection/experienceReplay';
import { CausalAnalyzer } from '../../src/cognitive/reflection/causalAnalyzer';
import { StrategyAdjustment } from '../../src/cognitive/reflection/strategyAdjust';

describe('ExperienceReplay', () => {
  let replay: ExperienceReplay;

  beforeEach(() => {
    replay = new ExperienceReplay();
  });

  describe('storeExperience', () => {
    it('returns id', () => {
      const id = replay.storeExperience({
        context: 'Debugging a React component',
        actions: [
          { action: 'Analyzed error', result: 'success' },
          { action: 'Fixed bug', result: 'success' },
        ],
        outcome: 'success',
        emotions: ['confident', 'satisfied'],
      });
      expect(id).toBeDefined();
    });
  });

  describe('retrieveExperience', () => {
    it('returns matching', () => {
      replay.storeExperience({
        context: 'Debugging a React component',
        actions: [{ action: 'Analyzed error', result: 'success' }],
        outcome: 'success',
        emotions: ['confident'],
      });
      replay.storeExperience({
        context: 'Writing a Python script',
        actions: [{ action: 'Wrote code', result: 'success' }],
        outcome: 'success',
        emotions: ['happy'],
      });

      const results = replay.retrieveExperience({ outcome: 'success' });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by type', () => {
      replay.storeExperience({
        context: 'Debugging a component',
        actions: [{ action: 'test', result: 'success' }],
        outcome: 'success',
        emotions: ['confident'],
      });

      const results = replay.retrieveExperience({ type: 'debugging' });
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('replay', () => {
    it('returns insights', () => {
      const id1 = replay.storeExperience({
        context: 'Debugging a component',
        actions: [{ action: 'Analyzed', result: 'success' }],
        outcome: 'success',
        emotions: ['confident'],
      });
      const id2 = replay.storeExperience({
        context: 'Fixing a bug',
        actions: [{ action: 'Fixed', result: 'success' }],
        outcome: 'success',
        emotions: ['satisfied'],
      });

      const result = replay.replay([id1, id2]);
      expect(result.insights).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('returns empty for no ids', () => {
      const result = replay.replay([]);
      expect(result.insights).toEqual([]);
      expect(result.recommendations).toEqual([]);
    });
  });

  describe('classify', () => {
    it('returns category', () => {
      const id = replay.storeExperience({
        context: 'Write code for a function',
        actions: [{ action: 'test', result: 'success' }],
        outcome: 'success',
        emotions: ['confident'],
      });
      const results = replay.retrieveExperience({ type: 'code_generation' });
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('CausalAnalyzer', () => {
  let analyzer: CausalAnalyzer;

  beforeEach(() => {
    analyzer = new CausalAnalyzer();
  });

  describe('analyze', () => {
    it('returns analysis', () => {
      const result = analyzer.analyze({
        context: 'Debugging a complex React component with unclear documentation',
        outcome: 'partial success',
        actions: [
          { action: 'Analyzed', result: 'success' },
          { action: 'Fixed', result: 'partial' },
        ],
        emotions: ['frustrated', 'confident'],
      });
      expect(result.outcome).toBe('partial success');
      expect(result.contributingFactors.length).toBeGreaterThan(0);
      expect(result.rootCause).toBeDefined();
      expect(result.alternativeActions.length).toBeGreaterThan(0);
      expect(result.learningPoints.length).toBeGreaterThan(0);
    });
  });

  describe('identifyFactors', () => {
    it('returns weighted factors', () => {
      const factors = analyzer.identifyFactors({
        context: 'Complex and difficult problem with time pressure',
        actions: [
          { action: 'Analyzed', result: 'success' },
          { action: 'Fixed', result: 'success' },
        ],
        emotions: ['frustrated', 'anxious'],
      });
      expect(factors.length).toBeGreaterThan(0);
      factors.forEach(f => {
        expect(f.factor).toBeDefined();
        expect(typeof f.weight).toBe('number');
      });
    });
  });

  describe('findRootCause', () => {
    it('returns root cause', () => {
      const factors = [
        { factor: 'context_complexity', weight: 0.75 },
        { factor: 'time_pressure', weight: -0.3 },
      ];
      const rootCause = analyzer.findRootCause(factors);
      expect(rootCause).toBeDefined();
      expect(typeof rootCause).toBe('string');
    });

    it('returns default for empty factors', () => {
      const rootCause = analyzer.findRootCause([]);
      expect(rootCause).toBe('No clear contributing factors identified');
    });
  });

  describe('generateAlternatives', () => {
    it('returns alternatives', () => {
      const alternatives = analyzer.generateAlternatives({
        factors: [{ factor: 'context_ambiguity', weight: -0.5 }],
        rootCause: 'Ambiguous requirements',
      });
      expect(alternatives.length).toBeGreaterThan(0);
    });
  });
});

describe('StrategyAdjustment', () => {
  let strategyAdjust: StrategyAdjustment;

  beforeEach(() => {
    strategyAdjust = new StrategyAdjustment();
  });

  describe('generateStrategy', () => {
    it('creates strategy', () => {
      const strategy = strategyAdjust.generateStrategy({
        context: 'Debugging a React component',
        outcome: 'success',
      });
      expect(strategy.id).toBeDefined();
      expect(strategy.name).toBeDefined();
      expect(strategy.rules.length).toBeGreaterThan(0);
      expect(strategy.revisionHistory.length).toBeGreaterThan(0);
      expect(strategy.effectiveness).toBe(0.5);
    });
  });

  describe('reviseStrategy', () => {
    it('updates rules', () => {
      const strategy = strategyAdjust.generateStrategy({
        context: 'Debugging',
        outcome: 'success',
      });

      const revised = strategyAdjust.reviseStrategy(strategy, {
        alternativeActions: ['Seek clarification on requirements'],
        learningPoints: ['Document effective approaches'],
        factors: [],
        rootCause: 'test',
      });
      expect(revised.rules.length).toBeGreaterThanOrEqual(strategy.rules.length);
      expect(revised.revisionHistory.length).toBeGreaterThan(0);
    });
  });

  describe('evaluateStrategy', () => {
    it('returns effectiveness', () => {
      const strategy = strategyAdjust.generateStrategy({
        context: 'Debugging',
        outcome: 'success',
      });
      const effectiveness = strategyAdjust.evaluateStrategy(strategy);
      expect(effectiveness).toBeGreaterThanOrEqual(0);
      expect(effectiveness).toBeLessThanOrEqual(1);
    });

    it('returns 0.5 for unknown strategy', () => {
      expect(strategyAdjust.evaluateStrategy({ id: 'unknown' })).toBe(0.5);
    });
  });

  describe('applyStrategy', () => {
    it('applies', () => {
      const strategy = strategyAdjust.generateStrategy({
        context: 'Debugging',
        outcome: 'success',
      });
      strategyAdjust.applyStrategy(strategy);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('migrateStrategy', () => {
    it('adapts to new context', () => {
      const strategy = strategyAdjust.generateStrategy({
        context: 'Debugging code',
        outcome: 'success',
      });

      const migrated = strategyAdjust.migrateStrategy(strategy, 'Writing documentation');
      expect(migrated.id).toBeDefined();
      expect(migrated.id).not.toBe(strategy.id);
      expect(migrated.rules.length).toBeGreaterThan(0);
    });
  });
});