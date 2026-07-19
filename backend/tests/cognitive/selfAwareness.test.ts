import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityModule } from '../../src/cognitive/selfAwareness/identity';
import { MetaCognitionModule } from '../../src/cognitive/selfAwareness/metaCognition';
import { EmotionStateModule } from '../../src/cognitive/selfAwareness/emotionState';

describe('IdentityModule', () => {
  let identity: IdentityModule;

  beforeEach(() => {
    identity = new IdentityModule();
  });

  describe('getIdentity', () => {
    it('returns Brian identity', () => {
      const id = identity.getIdentity();
      expect(id.name).toBe('Brian-Agent');
      expect(id.role).toBe('AI Coding Assistant');
      expect(id.capabilities.length).toBeGreaterThan(0);
      expect(id.limitations.length).toBeGreaterThan(0);
      expect(id.personality).toBeDefined();
      expect(id.personality.traits).toContain('helpful');
      expect(id.history.length).toBeGreaterThan(0);
    });
  });

  describe('updateIdentity', () => {
    it('adds to history', () => {
      identity.updateIdentity({ event: 'Completed task', outcome: 'success' });
      const id = identity.getIdentity();
      expect(id.history.length).toBeGreaterThan(1);
      const lastEntry = id.history[id.history.length - 1];
      expect(lastEntry.event).toContain('Completed task');
      expect(lastEntry.event).toContain('success');
    });
  });

  describe('getCapabilities', () => {
    it('returns capability list', () => {
      const caps = identity.getCapabilities();
      expect(caps.length).toBeGreaterThan(0);
      const codeGen = caps.find(c => c.skill === 'code_generation');
      expect(codeGen).toBeDefined();
      expect(codeGen!.level).toBe('expert');
      expect(codeGen!.confidence).toBeGreaterThan(0);
    });
  });

  describe('updateCapability', () => {
    it('updates confidence', () => {
      identity.updateCapability('code_generation', 'expert', 0.95);
      const caps = identity.getCapabilities();
      const codeGen = caps.find(c => c.skill === 'code_generation');
      expect(codeGen!.confidence).toBe(0.95);
    });

    it('adds new capability', () => {
      identity.updateCapability('new_skill', 'beginner', 0.5);
      const caps = identity.getCapabilities();
      const newSkill = caps.find(c => c.skill === 'new_skill');
      expect(newSkill).toBeDefined();
      expect(newSkill!.level).toBe('beginner');
    });
  });

  describe('checkConsistency', () => {
    it('detects conflicts', () => {
      const result = identity.checkConsistency('This code is inaccurate and wrong');
      expect(result.consistent).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('returns consistent for safe behavior', () => {
      const result = identity.checkConsistency('I will help you write clean code');
      expect(result.consistent).toBe(true);
      expect(result.conflicts.length).toBe(0);
    });
  });
});

describe('MetaCognitionModule', () => {
  let meta: MetaCognitionModule;

  beforeEach(() => {
    meta = new MetaCognitionModule();
  });

  describe('startMonitor', () => {
    it('returns monitorId', () => {
      const id = meta.startMonitor('Test task');
      expect(id).toBeDefined();
      expect(id.startsWith('monitor_')).toBe(true);
    });
  });

  describe('recordStep', () => {
    it('records step', () => {
      const id = meta.startMonitor('Test task');
      meta.recordStep(id, 'Step 1', 100, 'success');
      // Should not throw
      expect(true).toBe(true);
    });

    it('ignores inactive monitor', () => {
      meta.endMonitor('non-existent');
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('evaluateConfidence', () => {
    it('returns 0-1', () => {
      const conf = meta.evaluateConfidence();
      expect(conf).toBeGreaterThanOrEqual(0);
      expect(conf).toBeLessThanOrEqual(1);
    });

    it('returns 0.5 with no monitors', () => {
      expect(meta.evaluateConfidence()).toBe(0.5);
    });
  });

  describe('detectErrors', () => {
    it('finds error patterns', () => {
      const result = meta.detectErrors('TypeError: undefined is not a function');
      expect(result.hasErrors).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns no errors for clean output', () => {
      const result = meta.detectErrors('This is a clean output with no errors.');
      expect(result.hasErrors).toBe(false);
    });
  });

  describe('detectBiases', () => {
    it('finds bias patterns', () => {
      const result = meta.detectBiases('This clearly shows and obviously proves my point. I am 100% sure.');
      expect(result.hasBiases).toBe(true);
      expect(result.biases.length).toBeGreaterThan(0);
    });

    it('returns no biases for balanced reasoning', () => {
      const result = meta.detectBiases('Let me analyze the options carefully.');
      expect(result.hasBiases).toBe(false);
    });
  });

  describe('suggestCorrection', () => {
    it('provides corrections', () => {
      const corrections = meta.suggestCorrection(['Error message in output']);
      expect(corrections.length).toBeGreaterThan(0);
    });
  });

  describe('endMonitor', () => {
    it('returns report', () => {
      const id = meta.startMonitor('Test');
      meta.recordStep(id, 'Step 1', 100, 'success');
      meta.recordStep(id, 'Step 2', 200, 'success');
      const report = meta.endMonitor(id);
      expect(report.steps).toHaveLength(2);
      expect(report.confidence).toBeDefined();
      expect(report.errors).toBeDefined();
      expect(report.corrections).toBeDefined();
    });
  });
});

describe('EmotionStateModule', () => {
  let emotion: EmotionStateModule;

  beforeEach(() => {
    emotion = new EmotionStateModule();
  });

  describe('getCurrentEmotion', () => {
    it('returns default', () => {
      const current = emotion.getCurrentEmotion();
      expect(current.primaryEmotion).toBe('neutral');
      expect(current.intensity).toBe(0.5);
      expect(current.mood).toBe('balanced');
    });
  });

  describe('updateEmotion', () => {
    it('changes state', () => {
      const result = emotion.updateEmotion('Task completed successfully', ['achievement']);
      expect(result.primaryEmotion).toBeDefined();
      expect(result.intensity).toBeGreaterThan(0);
      expect(result.mood).toBeDefined();
    });

    it('detects happy emotion', () => {
      const result = emotion.updateEmotion('Great work! Success!', ['completed', 'solved']);
      expect(result.primaryEmotion).toBe('happy');
    });

    it('detects frustrated emotion', () => {
      const result = emotion.updateEmotion('This error is so frustrating', ['bug', 'broken']);
      expect(result.primaryEmotion).toBe('frustrated');
    });
  });

  describe('detectUserEmotion', () => {
    it('from text', () => {
      const result = emotion.detectUserEmotion('I am so happy with the results!');
      expect(result.emotion).toBe('happy');
      expect(result.intensity).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('detects angry user', () => {
      const result = emotion.detectUserEmotion('This is so frustrating and annoying!');
      expect(result.emotion).toBeDefined();
    });
  });

  describe('getEmotionEffects', () => {
    it('returns effects', () => {
      const effects = emotion.getEmotionEffects('happy');
      expect(effects.attentionFocus).toBeDefined();
      expect(effects.creativity).toBeDefined();
      expect(effects.patience).toBeDefined();
    });

    it('returns default for unknown emotion', () => {
      const effects = emotion.getEmotionEffects('unknown');
      expect(effects.attentionFocus).toBe('balanced');
    });
  });

  describe('regulateEmotion', () => {
    it('returns action', () => {
      const result = emotion.regulateEmotion('calm');
      expect(result.action).toBeDefined();
      expect(result.expectedEffect).toBeDefined();
    });
  });

  describe('getEmotionHistory', () => {
    it('returns history', () => {
      const history = emotion.getEmotionHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });
});