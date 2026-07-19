import { Router, Request, Response } from 'express';
import { SkillManager } from '../agent/skillManager';
import { logger } from '../infrastructure/logger';

export function createSkillRoutes(skillManager: SkillManager): Router {
  const router = Router();

  /**
   * GET /api/skill - List all skills
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { search, status } = req.query;
      const skills = await skillManager.list(
        search as string | undefined,
        status as string | undefined
      );
      res.json({ skills, count: skills.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_LIST_ERROR' });
    }
  });

  /**
   * GET /api/skill/:id - Get a skill by ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const skill = await skillManager.get(id);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found', code: 'NOT_FOUND' });
        return;
      }
      res.json(skill);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_GET_ERROR' });
    }
  });

  /**
   * POST /api/skill/create - Create a new skill
   */
  router.post('/create', async (req: Request, res: Response) => {
    try {
      const { mode, name, description, userInput, userOutput, userProcess, manualContent } = req.body;

      if (!name || !description || !mode) {
        res.status(400).json({ error: 'name, description, and mode are required', code: 'VALIDATION_ERROR' });
        return;
      }

      if (mode === 'user' && (!userInput || !userOutput || !userProcess)) {
        res.status(400).json({ error: 'userInput, userOutput, and userProcess are required for user mode', code: 'VALIDATION_ERROR' });
        return;
      }

      if (mode === 'manual' && !manualContent) {
        res.status(400).json({ error: 'manualContent is required for manual mode', code: 'VALIDATION_ERROR' });
        return;
      }

      const skill = await skillManager.create({
        mode,
        name,
        description,
        userInput,
        userOutput,
        userProcess,
        manualContent,
      });

      logger.info('Skill', `Skill created: ${name} (${skill.id})`);
      res.status(201).json(skill);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_CREATE_ERROR' });
    }
  });

  /**
   * PUT /api/skill/:id - Update a skill
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const skill = await skillManager.update(id, updates);
      logger.info('Skill', `Skill updated: ${id}`);
      res.json(skill);
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
      } else {
        res.status(500).json({ error: err.message, code: 'SKILL_UPDATE_ERROR' });
      }
    }
  });

  /**
   * DELETE /api/skill/:id - Delete a skill
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await skillManager.delete(id);
      logger.info('Skill', `Skill deleted: ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_DELETE_ERROR' });
    }
  });

  /**
   * POST /api/skill/:id/toggle - Toggle a skill's active status
   */
  router.post('/:id/toggle', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const skill = await skillManager.toggle(id);
      logger.info('Skill', `Skill toggled: ${id} -> ${skill.active ? 'active' : 'inactive'}`);
      res.json(skill);
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
      } else {
        res.status(500).json({ error: err.message, code: 'SKILL_TOGGLE_ERROR' });
      }
    }
  });

  /**
   * POST /api/skill/:id/preview - Preview a skill's normalized spec
   */
  router.post('/:id/preview', async (req: Request, res: Response) => {
    try {
      const { userInput, userOutput, userProcess } = req.body;

      if (!userInput || !userOutput || !userProcess) {
        res.status(400).json({ error: 'userInput, userOutput, and userProcess are required', code: 'VALIDATION_ERROR' });
        return;
      }

      const preview = skillManager.preview({ userInput, userOutput, userProcess });
      res.json(preview);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_PREVIEW_ERROR' });
    }
  });

  /**
   * POST /api/skill/:id/review - Review a skill's manual content
   */
  router.post('/:id/review', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { manualContent } = req.body;

      if (!manualContent) {
        res.status(400).json({ error: 'manualContent is required', code: 'VALIDATION_ERROR' });
        return;
      }

      const review = await skillManager.review(manualContent);

      // Update the skill with review results
      try {
        await skillManager.update(id, {
          review: {
            score: review.score,
            breakdown: review.breakdown,
            summary: review.summary,
            suggestions: review.suggestions,
            reviewedAt: new Date().toISOString(),
          },
        });
      } catch {
        // Skill may not exist yet (preview mode)
      }

      res.json(review);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_REVIEW_ERROR' });
    }
  });

  return router;
}