import express from 'express';
import { AgentBuilder } from '../agent/agentBuilder';
import { MetaAgent } from '../agent/metaAgent';
import { logger } from '../infrastructure/logger';


export function createAgentRoutes(agentBuilder: AgentBuilder, _metaAgent: MetaAgent): express.Router {
  const router = express.Router();

  async function guardSystemAgent(id: string): Promise<boolean> {
    const agent = await agentBuilder.get(id);
    return !!(agent?.isSystem);
  }

  router.get('/', async (req, res) => {
    try {
      const { search } = req.query;
      const agents = await agentBuilder.list(search as string | undefined);
      res.json({ agents, count: agents.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_LIST_ERROR' });
    }
  });

  router.get('/models', (_req, res) => {
    try {
      const models = agentBuilder.getAvailableModels();
      res.json(models);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MODELS_ERROR' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const agent = await agentBuilder.get(id);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found', code: 'NOT_FOUND' });
        return;
      }
      res.json(agent);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_GET_ERROR' });
    }
  });

  router.post('/create', async (req, res) => {
    try {
      const { name, role, description, strategy, llm, prompt, skillIds, mcpIds, soulId, workIds, sources } = req.body;
      if (!name || !role || !description) {
        res.status(400).json({ error: 'name, role, and description are required', code: 'VALIDATION_ERROR' });
        return;
      }
      const validation = agentBuilder.validateAgent(req.body);
      if (!validation.valid) {
        res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: validation.errors });
        return;
      }
      const agent = await agentBuilder.create({
        name, role, description,
        strategy: strategy || { type: 'react', maxIterations: 10, stopConditions: [] },
        llm: llm || {},
        prompt: prompt || { system: '', instruction: '', variables: [] },
        skillIds: skillIds || [],
        mcpIds: mcpIds || [],
        soulId: soulId || '',
        workIds: workIds || [],
        sources: sources || { knowledgeBase: [], webSearch: false },
      });
      logger.info('Agent', `Agent created: ${name} (${agent.id})`);
      res.status(201).json(agent);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_CREATE_ERROR' });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (await guardSystemAgent(id)) {
        res.status(403).json({ error: '系统 Agent 不可修改', code: 'SYSTEM_AGENT_PROTECTED' });
        return;
      }
      const agent = await agentBuilder.update(id, req.body);
      logger.info('Agent', `Agent updated: ${id}`);
      res.json(agent);
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
      } else {
        res.status(500).json({ error: err.message, code: 'AGENT_UPDATE_ERROR' });
      }
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (await guardSystemAgent(id)) {
        res.status(403).json({ error: '系统 Agent 不可删除', code: 'SYSTEM_AGENT_PROTECTED' });
        return;
      }
      await agentBuilder.delete(id);
      logger.info('Agent', `Agent deleted: ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_DELETE_ERROR' });
    }
  });

  router.post('/:id/toggle', async (req, res) => {
    try {
      const { id } = req.params;
      if (await guardSystemAgent(id)) {
        res.status(403).json({ error: '系统 Agent 不可切换状态', code: 'SYSTEM_AGENT_PROTECTED' });
        return;
      }
      const agent = await agentBuilder.toggle(id);
      res.json(agent);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_TOGGLE_ERROR' });
    }
  });

  router.get('/:id/mcps', async (req, res) => {
    try {
      const { id } = req.params;
      const mcps = agentBuilder.getMcpsForAgent(id);
      res.json({ mcps, count: mcps.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_MCPS_ERROR' });
    }
  });

  router.get('/:id/skills', async (req, res) => {
    try {
      const { id } = req.params;
      const skills = await agentBuilder.getSkillsForAgent(id);
      res.json({ skills, count: skills.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_SKILLS_ERROR' });
    }
  });

  router.get('/:id/soul', async (req, res) => {
    try {
      const { id } = req.params;
      const soul = await agentBuilder.getSoulForAgent(id);
      res.json({ soul });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_SOUL_ERROR' });
    }
  });

  router.get('/:id/works', async (req, res) => {
    try {
      const { id } = req.params;
      const works = await agentBuilder.getWorksForAgent(id);
      res.json({ works, count: works.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_WORKS_ERROR' });
    }
  });

  router.post('/:id/clone', async (req, res) => {
    try {
      const { id } = req.params;
      const cloned = await agentBuilder.clone(id);
      logger.info('Agent', `Agent cloned: ${id} -> ${cloned.id}`);
      res.status(201).json(cloned);
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
      } else {
        res.status(500).json({ error: err.message, code: 'AGENT_CLONE_ERROR' });
      }
    }
  });

  router.post('/generate-prompt', async (req, res) => {
    try {
      const { purpose, constraints } = req.body;
      if (!purpose) {
        res.status(400).json({ error: 'purpose is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const prompt = await agentBuilder.generatePrompt(purpose, constraints);
      res.json(prompt);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'PROMPT_GENERATE_ERROR' });
    }
  });

  router.post('/generate-soul', async (req, res) => {
    try {
      const { purpose, preference } = req.body;
      if (!purpose) {
        res.status(400).json({ error: 'purpose is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const soul = await agentBuilder.generateSoul(purpose, preference);
      res.json(soul);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SOUL_GENERATE_ERROR' });
    }
  });

  router.post('/suggest-skills', async (req, res) => {
    try {
      const { purpose, description } = req.body;
      if (!purpose) {
        res.status(400).json({ error: 'purpose is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const skills = await agentBuilder.suggestSkills(purpose, description);
      res.json({ skills, count: skills.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SUGGEST_SKILLS_ERROR' });
    }
  });

  router.post('/suggest-mcps', async (req, res) => {
    try {
      const { purpose, description } = req.body;
      if (!purpose) {
        res.status(400).json({ error: 'purpose is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const mcps = await agentBuilder.suggestMcps(purpose, description);
      res.json({ mcps, count: mcps.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SUGGEST_MCPS_ERROR' });
    }
  });

  router.post('/suggest-souls', async (req, res) => {
    try {
      const { purpose, description } = req.body;
      if (!purpose) {
        res.status(400).json({ error: 'purpose is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const souls = await agentBuilder.suggestSouls(purpose, description);
      res.json({ souls, count: souls.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SUGGEST_SOULS_ERROR' });
    }
  });

  router.post('/suggest-works', async (req, res) => {
    try {
      const { purpose, description } = req.body;
      if (!purpose) {
        res.status(400).json({ error: 'purpose is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const works = await agentBuilder.suggestWorks(purpose, description);
      res.json({ works, count: works.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SUGGEST_WORKS_ERROR' });
    }
  });

  return router;
}