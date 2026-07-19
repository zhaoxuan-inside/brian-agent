import express from 'express';
import { UserProfileService } from '../application/UserProfileService';

export function createProfileRoutes(userProfileService: UserProfileService): express.Router {
  const router = express.Router();

  router.get('/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const profile = await userProfileService.getProfile(userId);
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const updates = req.body;
      const profile = await userProfileService.updateProfile(userId, updates);
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/:userId/interests', async (req, res) => {
    try {
      const { userId } = req.params;
      const interests = await userProfileService.getInterests(userId);
      res.json(interests);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/:userId/tags', async (req, res) => {
    try {
      const { userId } = req.params;
      const { tag } = req.body;
      const profile = await userProfileService.addTag(userId, tag);
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.delete('/:userId/tags/:tag', async (req, res) => {
    try {
      const { userId, tag } = req.params;
      const profile = await userProfileService.removeTag(userId, tag);
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}