import { describe, it, expect } from 'vitest';
import { LanguageNormalizer } from '../../src/cognitive/language/normalize';

describe('LanguageNormalizer', () => {
  const normalizer = new LanguageNormalizer();

  describe('normalize()', () => {
    it('handles English text', async () => {
      const result = await normalizer.normalize('Hello world! This is a test.');
      expect(result.originalText).toBe('Hello world! This is a test.');
      expect(result.normalizedText).toBeDefined();
      expect(result.language).toBe('en');
      expect(result.semanticRepresentation).toBeDefined();
      expect(result.sentiment).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.temporalFeatures).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('handles Chinese text', async () => {
      const result = await normalizer.normalize('你好世界！这是一个测试。');
      expect(result.language).toBe('zh');
      expect(result.normalizedText).toBeDefined();
    });

    it('handles mixed language', async () => {
      const result = await normalizer.normalize('Hello 你好 world 世界');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('returns empty language for empty text', async () => {
      const result = await normalizer.normalize('');
      expect(result.language).toBe('unknown');
    });
  });

  describe('detectLanguage()', () => {
    it('detects zh for Chinese', async () => {
      const result = await normalizer.normalize('这是一个中文句子');
      expect(result.language).toBe('zh');
    });

    it('detects en for English', async () => {
      const result = await normalizer.normalize('This is an English sentence');
      expect(result.language).toBe('en');
    });
  });

  describe('standardize()', () => {
    it('converts full-width to half-width', async () => {
      const result = await normalizer.normalize('Ｈｅｌｌｏ');
      // Full-width ASCII should be converted
      expect(result.normalizedText).toContain('hello');
    });

    it('lowercases text', async () => {
      const result = await normalizer.normalize('HELLO WORLD');
      expect(result.normalizedText).toContain('hello');
      expect(result.normalizedText).toContain('world');
    });

    it('removes extra whitespace', async () => {
      const result = await normalizer.normalize('Hello    world');
      expect(result.normalizedText).toBe('hello world');
    });
  });

  describe('removeRedundancy()', () => {
    it('removes repeated words', async () => {
      const result = await normalizer.normalize('the the cat sat on the mat');
      // Repeated "the the" should be collapsed
      expect(result.normalizedText).not.toContain('the the');
    });

    it('removes degree modifiers', async () => {
      const result = await normalizer.normalize('This is very very good');
      expect(result.normalizedText).not.toContain('very very');
    });
  });

  describe('extractSemantics()', () => {
    it('extracts subject, predicate, object', async () => {
      const result = await normalizer.normalize('I create a program');
      expect(result.semanticRepresentation.subject).toBeDefined();
      expect(result.semanticRepresentation.predicate).toBeDefined();
      expect(result.semanticRepresentation.object).toBeDefined();
    });

    it('handles simple sentences', async () => {
      const result = await normalizer.normalize('The cat is black');
      expect(result.semanticRepresentation).toBeDefined();
    });

    it('handles complex sentences', async () => {
      const result = await normalizer.normalize('The developer creates a complex application that uses many libraries');
      expect(result.semanticRepresentation.subject).toBeDefined();
    });
  });

  describe('annotateSentiment()', () => {
    it('detects positive sentiment', async () => {
      const result = await normalizer.normalize('This is great and amazing!');
      expect(result.sentiment.polarity).toBe('positive');
    });

    it('detects negative sentiment', async () => {
      const result = await normalizer.normalize('This is terrible and broken');
      expect(result.sentiment.polarity).toBe('negative');
    });

    it('detects neutral sentiment', async () => {
      const result = await normalizer.normalize('The sky is blue');
      expect(result.sentiment.polarity).toBe('neutral');
    });

    it('detects negation', async () => {
      const result = await normalizer.normalize('This is not good');
      expect(result.sentiment.negation).toBe(true);
    });
  });

  describe('extractEntities()', () => {
    it('identifies named entities', async () => {
      const result = await normalizer.normalize('Visit https://example.com and contact admin@test.com');
      expect(result.entities.length).toBeGreaterThan(0);
      const types = result.entities.map(e => e.type);
      expect(types).toContain('url');
      expect(types).toContain('email');
    });
  });

  describe('extractTemporalFeatures()', () => {
    it('detects past tense', async () => {
      const result = await normalizer.normalize('I created a program yesterday');
      expect(result.temporalFeatures.tense).toBe('past');
    });

    it('detects present tense', async () => {
      const result = await normalizer.normalize('I am creating a program now');
      expect(result.temporalFeatures.tense).toBe('present');
    });

    it('detects future tense', async () => {
      const result = await normalizer.normalize('I will create a program tomorrow');
      expect(result.temporalFeatures.tense).toBe('future');
    });

    it('detects temporal markers', async () => {
      const result = await normalizer.normalize('I will do it tomorrow');
      expect(result.temporalFeatures.temporalMarker).toBeDefined();
    });
  });
});