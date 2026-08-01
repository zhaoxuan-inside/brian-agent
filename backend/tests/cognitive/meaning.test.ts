import { describe, it, expect, beforeEach } from 'vitest';
import { EmpathyEngine } from '../../src/cognitive/meaning/empathyEngine';
import { ValueEvaluator } from '../../src/cognitive/meaning/valueEvaluator';
import { MeaningAssigner } from '../../src/cognitive/meaning/meaningAssigner';

describe('EmpathyEngine', () => {
  let empathy: EmpathyEngine;

  beforeEach(() => {
    empathy = new EmpathyEngine();
  });

  describe('detectEmotion', () => {
    it('detects emotion from text', () => {
      const result = empathy.detectEmotion('I am so happy with the results!');
      expect(result.emotion).toBe('happy');
      expect(result.intensity).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('detects frustrated emotion', () => {
      const result = empathy.detectEmotion('This is so frustrating, it keeps breaking');
      expect(result.emotion).toBe('frustrated');
    });

    it('detects confused emotion', () => {
      const result = empathy.detectEmotion('I am confused and don\'t understand this');
      expect(result.emotion).toBe('confused');
    });

    it('detects angry emotion', () => {
      const result = empathy.detectEmotion('This is terrible and unacceptable!');
      expect(result.emotion).toBe('angry');
    });

    it('defaults to neutral', () => {
      const result = empathy.detectEmotion('The sky is blue');
      expect(result.emotion).toBe('neutral');
    });
  });

  describe('inferEmotionCause', () => {
    it('returns cause', () => {
      const cause = empathy.inferEmotionCause('frustrated', 'The error keeps happening and I cannot fix it');
      expect(cause).toBeDefined();
      expect(cause).toContain('frustrated');
    });

    it('infers technical cause', () => {
      const cause = empathy.inferEmotionCause('frustrated', 'The code has a bug that crashes');
      expect(cause).toContain('technical');
    });
  });

  describe('generateEmpatheticResponse', () => {
    it('returns response', () => {
      const response = empathy.generateEmpatheticResponse({ emotion: 'frustrated', intensity: 0.7 });
      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
    });

    it('returns different response for different emotions', () => {
      const happy = empathy.generateEmpatheticResponse({ emotion: 'happy', intensity: 0.7 });
      const sad = empathy.generateEmpatheticResponse({ emotion: 'sad', intensity: 0.7 });
      expect(happy).not.toBe(sad);
    });
  });

  describe('adjustBehavior', () => {
    it('returns tone/pace/verbosity', () => {
      const behavior = empathy.adjustBehavior('frustrated');
      expect(behavior.tone).toBeDefined();
      expect(behavior.pace).toBeDefined();
      expect(behavior.verbosity).toBeDefined();
    });

    it('returns default for unknown emotion', () => {
      const behavior = empathy.adjustBehavior('unknown');
      expect(behavior.tone).toBe('balanced and professional');
    });
  });

  describe('storeEmotionalEvent', () => {
    it('stores', () => {
      empathy.storeEmotionalEvent({
        emotion: 'happy',
        cause: 'Task completed',
        response: 'Great job!',
      });
      const memory = empathy.retrieveEmotionalMemory('happy');
      expect(memory.length).toBeGreaterThan(0);
    });
  });

  describe('retrieveEmotionalMemory', () => {
    it('returns by context', () => {
      empathy.storeEmotionalEvent({
        emotion: 'happy',
        cause: 'Task completed',
        response: 'Great job!',
      });
      const results = empathy.retrieveEmotionalMemory('happy');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].emotion).toBe('happy');
    });

    it('returns empty for no match', () => {
      const results = empathy.retrieveEmotionalMemory('nonexistent');
      expect(results).toEqual([]);
    });
  });
});

describe('ValueEvaluator', () => {
  let evaluator: ValueEvaluator;

  beforeEach(() => {
    evaluator = new ValueEvaluator();
  });

  describe('evaluate', () => {
    it('returns all values', () => {
      const result = evaluator.evaluate({ description: 'Learn TypeScript', type: 'learning' });
      expect(result.instrumentalValue).toBeDefined();
      expect(result.emotionalValue).toBeDefined();
      expect(result.growthValue).toBeDefined();
      expect(result.alignmentWithGoals).toBeDefined();
      expect(result.overallValue).toBeDefined();
      expect(result.priority).toBeDefined();
    });
  });

  describe('evaluateInstrumental', () => {
    it('returns 0-1', () => {
      const value = evaluator.evaluateInstrumental({ description: 'Fix critical bug' });
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });

    it('returns higher for urgent tasks', () => {
      const urgent = evaluator.evaluateInstrumental({ description: 'Fix urgent critical bug immediately' });
      const normal = evaluator.evaluateInstrumental({ description: 'Update documentation' });
      expect(urgent).toBeGreaterThan(normal);
    });
  });

  describe('evaluateEmotional', () => {
    it('returns 0-1', () => {
      const value = evaluator.evaluateEmotional({ description: 'Have fun learning' });
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  describe('evaluateGrowth', () => {
    it('returns 0-1', () => {
      const value = evaluator.evaluateGrowth({ description: 'Learn advanced Rust programming' });
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  describe('alignWithGoals', () => {
    it('returns alignment', () => {
      const alignment = evaluator.alignWithGoals(
        { description: 'Learn TypeScript' },
        [{ description: 'Learn TypeScript programming' }]
      );
      expect(alignment).toBeGreaterThan(0);
    });

    it('returns 0.3 for empty goals', () => {
      const alignment = evaluator.alignWithGoals({ description: 'Task' }, []);
      expect(alignment).toBe(0.3);
    });
  });

  describe('prioritize', () => {
    it('returns sorted tasks', () => {
      const tasks = [
        { description: 'Fix critical bug', type: 'fix' },
        { description: 'Update documentation', type: 'maintenance' },
        { description: 'Learn new skill', type: 'learning' },
      ];
      const result = evaluator.prioritize(tasks);
      expect(result).toHaveLength(3);
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    });
  });
});

describe('MeaningAssigner', () => {
  let assigner: MeaningAssigner;

  beforeEach(() => {
    assigner = new MeaningAssigner();
  });

  describe('assignMeaning', () => {
    it('returns meaning', () => {
      const result = assigner.assignMeaning({
        description: 'Help a user debug their code',
        outcome: 'success',
      });
      expect(result.literalDescription).toBeDefined();
      expect(result.deeperMeaning).toBeDefined();
      expect(result.personalSignificance).toBeDefined();
      expect(result.emotionalResonance).toBeGreaterThanOrEqual(0);
      expect(result.emotionalResonance).toBeLessThanOrEqual(1);
    });
  });

  describe('mineMeaning', () => {
    it('returns deeper meaning', () => {
      const result = assigner.mineMeaning('Help a user debug their code');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('returns meaning for help actions', () => {
      const result = assigner.mineMeaning('Help the user with their problem');
      expect(result).toContain('contribute');
    });

    it('returns meaning for creative actions', () => {
      const result = assigner.mineMeaning('Create a new React component');
      expect(result).toContain('creative');
    });
  });

  describe('relateToIdentity', () => {
    it('returns significance', () => {
      const result = assigner.relateToIdentity({ description: 'Code a new feature' });
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('storeMeaning', () => {
    it('stores', () => {
      assigner.assignMeaning({
        description: 'Help a user',
        outcome: 'success',
      });
      const results = assigner.retrieveMeaning('help');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('retrieveMeaning', () => {
    it('returns by context', () => {
      assigner.assignMeaning({
        description: 'Help a user debug their code',
        outcome: 'success',
      });
      const results = assigner.retrieveMeaning('debug');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty for no match', () => {
      const results = assigner.retrieveMeaning('nonexistent');
      expect(results).toEqual([]);
    });
  });
});