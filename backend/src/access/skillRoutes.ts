import express from 'express';
import { SkillManager } from '../core/skill/SkillManager';
import { logger } from '../infrastructure/logger';
import { createToggleHandler } from './toggleHandler';

export function createSkillRoutes(skillManager: SkillManager): express.Router {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const { search } = req.query;
      const skills = await skillManager.listSkills(search as string | undefined);
      res.json({ skills, count: skills.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_LIST_ERROR' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const skill = await skillManager.getSkill(id);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found', code: 'NOT_FOUND' });
        return;
      }
      res.json(skill);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_GET_ERROR' });
    }
  });

  router.post('/create', async (req, res) => {
    try {
      const skill = await skillManager.createSkill(req.body);
      logger.info('Skill', `Skill created: ${skill.id}`);
      res.status(201).json(skill);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_CREATE_ERROR' });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const skill = await skillManager.updateSkill(id, req.body);
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

  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await skillManager.deleteSkill(id);
      logger.info('Skill', `Skill deleted: ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_DELETE_ERROR' });
    }
  });

  router.post('/:id/toggle', createToggleHandler(
    (id) => skillManager.getSkill(id),
    (id, data) => skillManager.updateSkill(id, data),
    'Skill',
    'SKILL_TOGGLE_ERROR',
  ));

  router.post('/:id/install', async (req, res) => {
    try {
      const { id } = req.params;
      const skill = await skillManager.installSkill(id);
      res.json(skill);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_INSTALL_ERROR' });
    }
  });

  router.post('/:id/uninstall', async (req, res) => {
    try {
      const { id } = req.params;
      const skill = await skillManager.uninstallSkill(id);
      res.json(skill);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SKILL_UNINSTALL_ERROR' });
    }
  });

  return router;
}