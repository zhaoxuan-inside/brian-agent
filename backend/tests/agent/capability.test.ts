import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  injectVariables,
  injectSoul,
  injectTools,
  getSoulTemplate,
  getWorkTemplate,
} from '../../src/agent/capability/promptTemplate';
import {
  defineStyle,
  definePersonality,
  defineContentRules,
  defineConstraints,
  defineTemperatureProfile,
  generateSoulConfig,
} from '../../src/agent/capability/soulConfig';

describe('PromptTemplate', () => {
  const soul = {
    style: 'Professional and formal',
    personality: 'Helpful, precise, and thorough',
    contentRules: ['Use clear, well-structured language', 'Avoid slang and colloquialisms'],
    constraints: ['Do not speculate without evidence', 'Acknowledge limitations of your knowledge'],
  };

  describe('buildSystemPrompt()', () => {
    it('includes all sections', () => {
      const prompt = buildSystemPrompt(soul, 'code_generation', ['file_read', 'file_write']);
      expect(prompt).toContain('Style:');
      expect(prompt).toContain('Personality:');
      expect(prompt).toContain('Your Task');
      expect(prompt).toContain('Content Guidelines');
      expect(prompt).toContain('Constraints');
      expect(prompt).toContain('Available Tools');
    });

    it('includes soul configuration', () => {
      const prompt = buildSystemPrompt(soul, 'code_generation', []);
      expect(prompt).toContain('Professional and formal');
      expect(prompt).toContain('Helpful, precise, and thorough');
    });

    it('includes tool descriptions', () => {
      const prompt = buildSystemPrompt(soul, 'code_generation', ['file_read', 'file_write']);
      expect(prompt).toContain('file_read');
      expect(prompt).toContain('file_write');
    });

    it('handles empty tools', () => {
      const prompt = buildSystemPrompt(soul, 'code_generation', []);
      expect(prompt).not.toContain('Available Tools');
    });

    it('handles empty contentRules', () => {
      const prompt = buildSystemPrompt({ ...soul, contentRules: [] }, 'code_generation', []);
      expect(prompt).not.toContain('Content Guidelines');
    });
  });

  describe('injectVariables()', () => {
    it('replaces all {{variables}}', () => {
      const result = injectVariables(
        'Hello {{name}}, your task is {{task}}',
        { name: 'World', task: 'coding' }
      );
      expect(result).toBe('Hello World, your task is coding');
    });

    it('handles missing variables (keeps placeholder)', () => {
      const result = injectVariables(
        'Hello {{name}}',
        {}
      );
      expect(result).toBe('Hello {{name}}');
    });
  });

  describe('injectSoul()', () => {
    it('injects style and personality', () => {
      const result = injectSoul('Base prompt', { style: 'Friendly', personality: 'Warm' });
      expect(result).toContain('Base prompt');
      expect(result).toContain('## Persona');
      expect(result).toContain('Style: Friendly');
      expect(result).toContain('Personality: Warm');
    });
  });

  describe('injectTools()', () => {
    it('injects tool descriptions', () => {
      const result = injectTools('Base prompt', ['tool_a', 'tool_b']);
      expect(result).toContain('Base prompt');
      expect(result).toContain('## Available Tools');
      expect(result).toContain('tool_a');
      expect(result).toContain('tool_b');
    });

    it('returns prompt unchanged for empty tools', () => {
      const result = injectTools('Base prompt', []);
      expect(result).toBe('Base prompt');
    });
  });

  describe('getSoulTemplate()', () => {
    it('returns template for known style', () => {
      const template = getSoulTemplate('creative');
      expect(template.style).toBe('Creative and imaginative');
      expect(template.personality).toBeDefined();
      expect(template.contentRules.length).toBeGreaterThan(0);
      expect(template.constraints.length).toBeGreaterThan(0);
    });

    it('returns default for unknown style', () => {
      const template = getSoulTemplate('unknown_style');
      expect(template.style).toBe('Professional and formal');
      expect(template.personality).toBeDefined();
    });

    it('returns technical template for technical style', () => {
      const template = getSoulTemplate('technical');
      expect(template.style).toBe('Technical and precise');
    });

    it('returns friendly template for friendly style', () => {
      const template = getSoulTemplate('friendly');
      expect(template.style).toBe('Friendly and approachable');
    });

    it('returns concise template for concise style', () => {
      const template = getSoulTemplate('concise');
      expect(template.style).toBe('Concise and direct');
    });
  });

  describe('getWorkTemplate()', () => {
    it('returns template for known task type', () => {
      const template = getWorkTemplate('code_generation');
      expect(template).toContain('Generate code');
    });

    it('returns debugging template for debugging', () => {
      const template = getWorkTemplate('debugging');
      expect(template).toContain('Analyze the error');
    });

    it('returns question_answering for unknown type', () => {
      const template = getWorkTemplate('completely_unknown_type');
      expect(template).toContain('Answer the question');
    });
  });
});

describe('SoulConfig', () => {
  describe('defineStyle', () => {
    it('returns trimmed description', () => {
      expect(defineStyle('  Custom Style  ')).toBe('Custom Style');
    });

    it('returns default for empty', () => {
      expect(defineStyle('')).toBe('Professional and formal');
    });
  });

  describe('definePersonality', () => {
    it('returns trimmed traits', () => {
      expect(definePersonality('  Analytical  ')).toBe('Analytical');
    });

    it('returns default for empty', () => {
      expect(definePersonality('')).toBe('Helpful, precise, and thorough');
    });
  });

  describe('defineContentRules', () => {
    it('returns filtered rules', () => {
      const rules = defineContentRules(['Be clear', '', '  ', 'Be concise']);
      expect(rules).toEqual(['Be clear', 'Be concise']);
    });

    it('returns default for empty', () => {
      expect(defineContentRules([])).toEqual(['Use clear, well-structured language']);
    });
  });

  describe('defineConstraints', () => {
    it('returns filtered constraints', () => {
      const constraints = defineConstraints(['Do not lie', '', '  ']);
      expect(constraints).toEqual(['Do not lie']);
    });

    it('returns default for empty', () => {
      expect(defineConstraints([])).toEqual(['Do not provide harmful or misleading information']);
    });
  });

  describe('defineTemperatureProfile()', () => {
    it('returns correct profile', () => {
      const profile = defineTemperatureProfile(0.5, 0.7, 0.3);
      expect(profile.creative).toBe(0.5);
      expect(profile.analytical).toBe(0.7);
      expect(profile.factual).toBe(0.3);
    });

    it('clamps values to 0-2 range', () => {
      const profile = defineTemperatureProfile(-1, 3, 0.5);
      expect(profile.creative).toBe(0);
      expect(profile.analytical).toBe(2);
      expect(profile.factual).toBe(0.5);
    });
  });

  describe('generateSoulConfig()', () => {
    it('returns complete config', () => {
      const config = generateSoulConfig('code', 'technical');
      expect(config.style).toBeDefined();
      expect(config.personality).toBeDefined();
      expect(config.contentRules).toBeDefined();
      expect(config.contentRules.length).toBeGreaterThan(0);
      expect(config.constraints).toBeDefined();
      expect(config.constraints.length).toBeGreaterThan(0);
      expect(config.temperatureProfile).toBeDefined();
      expect(config.temperatureProfile.creative).toBeDefined();
      expect(config.temperatureProfile.analytical).toBeDefined();
      expect(config.temperatureProfile.factual).toBeDefined();
    });

    it('returns technical config for code purpose', () => {
      const config = generateSoulConfig('Debug code for a React component');
      expect(config.style).toBe('Technical and precise');
    });

    it('returns creative config for creative purpose', () => {
      const config = generateSoulConfig('Design a creative story');
      expect(config.style).toBe('Creative and imaginative');
    });

    it('returns friendly config for chat purpose', () => {
      const config = generateSoulConfig('Chat with user');
      expect(config.style).toBe('Friendly and approachable');
    });

    it('returns concise config for quick task', () => {
      const config = generateSoulConfig('Quick summary');
      expect(config.style).toBe('Concise and direct');
    });
  });
});