import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { SkillManager } from '../../src/agent/skillManager';
import { LLMService } from '../../src/core/llm';
import { StorageService } from '../../src/core/storage';
import { ModelConfigService } from '../../src/core/llm/modelConfig';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';

const TEST_DATA_DIR = path.join(os.tmpdir(), `brian-test-skill-${Date.now()}`);

describe('SkillManager', () => {
  let skillManager: SkillManager;
  let llm: LLMService;
  let storage: StorageService;

  async function createTestSkill(name: string, _active: boolean = true) {
    return await skillManager.create({
      mode: 'user',
      name,
      description: `Description for ${name}`,
      userInput: 'input: string',
      userOutput: 'output: string',
      userProcess: 'step 1: do something',
    });
  }

  beforeEach(async () => {
    process.env.BRIAN_DATA_DIR = TEST_DATA_DIR;
    process.env.BRIAN_DB_PATH = path.join(TEST_DATA_DIR, 'brian.db');
    process.env.BRIAN_GRAPH_DB_PATH = path.join(TEST_DATA_DIR, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(TEST_DATA_DIR, 'vectors');
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    const configPath = path.join(TEST_DATA_DIR, 'model-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      providers: [{ id: 'openai', type: 'openai', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' }],
      selectedProviderId: 'openai',
      selectedModelId: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4096,
      rateLimits: { daily: 100000, weekly: 500000, monthly: 2000000 },
    }));
    process.env.BRIAN_CONFIG_FILE_PATH = configPath;

    initDatabase();
    storage = new StorageService();
    const modelConfig = new ModelConfigService();
    llm = new LLMService(modelConfig);
    skillManager = new SkillManager(storage, llm);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    closeDatabase();
    if (storage) {
      await storage.close();
    }
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('list()', () => {
    it('returns all skills', async () => {
      await createTestSkill('skill-a');
      await createTestSkill('skill-b');
      const skills = await skillManager.list();
      expect(skills.length).toBe(2);
    });

    it('with search filter', async () => {
      await createTestSkill('code-generation');
      await createTestSkill('data-analysis');
      const skills = await skillManager.list('code');
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe('code-generation');
    });

    it('with status filter', async () => {
      await createTestSkill('active-skill', true);
      await createTestSkill('inactive-skill', true);
      const all = await skillManager.list();
      const inactiveOne = all.find(s => s.name === 'inactive-skill')!;
      await skillManager.toggle(inactiveOne.id);

      const active = await skillManager.list(undefined, 'active');
      expect(active.length).toBe(1);
      expect(active[0].name).toBe('active-skill');

      const inactive = await skillManager.list(undefined, 'inactive');
      expect(inactive.length).toBe(1);
      expect(inactive[0].name).toBe('inactive-skill');
    });
  });

  describe('get()', () => {
    it('returns skill by id', async () => {
      const created = await createTestSkill('test-skill');
      const skill = await skillManager.get(created.id);
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('test-skill');
    });

    it('returns null for non-existent', async () => {
      const skill = await skillManager.get('non-existent');
      expect(skill).toBeUndefined();
    });
  });

  describe('create()', () => {
    it('with user mode', async () => {
      const skill = await createTestSkill('user-skill');
      expect(skill.id).toBeDefined();
      expect(skill.mode).toBe('user');
      expect(skill.active).toBe(true);
      expect(skill.normalizedSpec).toBeDefined();
      expect(skill.normalizedSpec!.input).toBeDefined();
      expect(skill.normalizedSpec!.output).toBeDefined();
      expect(skill.normalizedSpec!.process).toBeDefined();
    });

    it('with manual mode', async () => {
      const skill = await skillManager.create({
        mode: 'manual',
        name: 'manual-skill',
        description: 'A manual skill',
        manualContent: '# Manual Skill\n\nStep 1: Do this\nStep 2: Do that',
      });
      expect(skill.id).toBeDefined();
      expect(skill.mode).toBe('manual');
      expect(skill.manualContent).toBe('# Manual Skill\n\nStep 1: Do this\nStep 2: Do that');
      expect(skill.active).toBe(true);
    });
  });

  describe('update()', () => {
    it('modifies skill', async () => {
      const created = await createTestSkill('original');
      const updated = await skillManager.update(created.id, { name: 'updated-name' });
      expect(updated.name).toBe('updated-name');
    });

    it('throws for non-existent', async () => {
      await expect(skillManager.update('non-existent', { name: 'x' })).rejects.toThrow('not found');
    });
  });

  describe('delete()', () => {
    it('removes skill', async () => {
      const created = await createTestSkill('to-delete');
      expect(await skillManager.get(created.id)).toBeDefined();
      await skillManager.delete(created.id);
      expect(await skillManager.get(created.id)).toBeUndefined();
    });
  });

  describe('toggle()', () => {
    it('toggles active status', async () => {
      const created = await createTestSkill('toggle-test');
      expect(created.active).toBe(true);

      const toggled = await skillManager.toggle(created.id);
      expect(toggled.active).toBe(false);

      const toggledAgain = await skillManager.toggle(created.id);
      expect(toggledAgain.active).toBe(true);
    });

    it('throws for non-existent', async () => {
      await expect(skillManager.toggle('non-existent')).rejects.toThrow('not found');
    });
  });

  describe('normalize()', () => {
    it('generates JSON Schema from user input', () => {
      const result = skillManager.normalize(
        'name: string, age: number',
        'result: string, success: boolean',
        'Step 1: validate input\nStep 2: process data\nYou must validate all inputs'
      );

      expect(result.input).toBeDefined();
      expect(result.input.type).toBe('object');
      expect(result.input.properties).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.output.type).toBe('object');
      expect(result.process).toBe('Step 1: validate input\nStep 2: process data\nYou must validate all inputs');
      expect(result.constraints.length).toBeGreaterThan(0);
    });
  });

  describe('preview()', () => {
    it('returns normalized preview', () => {
      const result = skillManager.preview({
        userInput: 'name: string',
        userOutput: 'result: string',
        userProcess: 'Step 1: do something',
      });
      expect(result.normalizedSpec).toBeDefined();
      expect(result.normalizedSpec.input).toBeDefined();
      expect(result.normalizedSpec.output).toBeDefined();
    });
  });

  describe('review()', () => {
    it('returns score breakdown', async () => {
      const result = await skillManager.review(
        'Step 1: Analyze the problem\nStep 2: Research solutions\nStep 3: Implement fix\nStep 4: Test solution\n\nSafety: Ensure all changes are tested before deployment.'
      );
      expect(result.score).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.completeness).toBeDefined();
      expect(result.breakdown.clarity).toBeDefined();
      expect(result.breakdown.executability).toBeDefined();
      expect(result.breakdown.safety).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });

  describe('validateName()', () => {
    it('returns true for unique name', async () => {
      expect(await skillManager.validateName('unique-skill-name')).toBe(true);
    });

    it('returns false for duplicate', async () => {
      await createTestSkill('existing-skill');
      expect(await skillManager.validateName('existing-skill')).toBe(false);
    });

    it('returns false for empty name', async () => {
      expect(await skillManager.validateName('')).toBe(false);
      expect(await skillManager.validateName(' ')).toBe(false);
    });

    it('returns false for too short name', async () => {
      expect(await skillManager.validateName('a')).toBe(false);
    });
  });
});