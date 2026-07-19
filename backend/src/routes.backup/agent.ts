import { Router, Request, Response } from 'express';
import { AgentBuilder } from '../agent/agentBuilder';
import { MetaAgent } from '../agent/metaAgent';
import { logger } from '../infrastructure/logger';

export function createAgentRoutes(agentBuilder: AgentBuilder, _metaAgent: MetaAgent): Router {
  const router = Router();

  /**
   * GET /api/agent - List all agents
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { search } = req.query;
      const agents = await agentBuilder.list(search as string | undefined);
      res.json({ agents, count: agents.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_LIST_ERROR' });
    }
  });

  /**
   * GET /api/agent/models - Get available models for agents
   */
  router.get('/models', (_req: Request, res: Response) => {
    try {
      const models = agentBuilder.getAvailableModels();
      res.json(models);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MODELS_ERROR' });
    }
  });

  /**
   * GET /api/agent/:id - Get agent by ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
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

  /**
   * POST /api/agent/create - Create a new agent
   */
  router.post('/create', async (req: Request, res: Response) => {
    try {
      const { name, role, description, strategy, llm, prompt, skillIds, mcpIds, soulId, workIds, sources } = req.body;

      if (!name || !role || !description) {
        res.status(400).json({ error: 'name, role, and description are required', code: 'VALIDATION_ERROR' });
        return;
      }

      // Validate agent config
      const validation = agentBuilder.validateAgent(req.body);
      if (!validation.valid) {
        res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: validation.errors });
        return;
      }

      const agent = await agentBuilder.create({
        name,
        role,
        description,
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

  /**
   * PUT /api/agent/:id - Update an agent
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const agent = await agentBuilder.update(id, updates);
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

  /**
   * DELETE /api/agent/:id - Delete an agent
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await agentBuilder.delete(id);
      logger.info('Agent', `Agent deleted: ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'AGENT_DELETE_ERROR' });
    }
  });

  /**
   * POST /api/agent/:id/toggle - Toggle agent active status
   */
  router.post('/:id/toggle', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const agent = await agentBuilder.toggle(id);
      logger.info('Agent', `Agent toggled: ${id} -> ${agent.active ? 'active' : 'inactive'}`);
      res.json(agent);
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
      } else {
        res.status(500).json({ error: err.message, code: 'AGENT_TOGGLE_ERROR' });
      }
    }
  });

  /**
   * POST /api/agent/:id/clone - Clone an agent
   */
  router.post('/:id/clone', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const cloned = await agentBuilder.clone(id);
      logger.info('Agent', `Agent cloned: ${id} -> ${cloned.id} (${cloned.name})`);
      res.status(201).json(cloned);
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
      } else {
        res.status(500).json({ error: err.message, code: 'AGENT_CLONE_ERROR' });
      }
    }
  });

  /**
   * POST /api/agent/generate-prompt - Generate a system prompt
   */
  router.post('/generate-prompt', async (req: Request, res: Response) => {
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

  /**
   * POST /api/agent/generate-soul - Generate a soul configuration
   */
  router.post('/generate-soul', async (req: Request, res: Response) => {
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

  /**
   * POST /api/agent/suggest-skills - Suggest skills for an agent purpose
   */
  router.post('/suggest-skills', async (req: Request, res: Response) => {
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

  /**
   * POST /api/agent/suggest-mcps - Suggest MCP packages for an agent purpose
   */
  router.post('/suggest-mcps', async (req: Request, res: Response) => {
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

  return router;
}