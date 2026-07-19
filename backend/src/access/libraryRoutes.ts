import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { logger } from '../infrastructure/logger';
import type { DBWrapper } from '../base/DBWrapper';

export function createLibraryRoutes(db: DBWrapper): express.Router {
  const router = express.Router();

  router.get('/paths', async (_req, res) => {
    try {
      const rows = await db.query<any>(
        `SELECT * FROM library_paths WHERE active = 1 ORDER BY updated_at DESC`
      );
      const paths = rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        path: row.path,
        category: row.category,
        description: row.description,
        metadata: JSON.parse(row.metadata || '{}'),
        active: row.active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      res.json({ paths, count: paths.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'LIBRARY_LIST_ERROR' });
    }
  });

  router.post('/paths', async (req, res) => {
    try {
      const { name, path: libPath, category, description, metadata } = req.body;
      if (!name || !libPath || !category) {
        res.status(400).json({ error: 'name, path, and category are required', code: 'VALIDATION_ERROR' });
        return;
      }
      const id = uuidv4();
      const now = Date.now();
      await db.run(
        `INSERT INTO library_paths (id, name, path, category, description, metadata, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, name, libPath, category, description || '', JSON.stringify(metadata || {}), now, now]
      );
      logger.info('Library', `Library path added: ${name} (${id})`);
      res.status(201).json({
        id, name, path: libPath, category, description: description || '',
        metadata: metadata || {}, active: true, createdAt: now, updatedAt: now,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'LIBRARY_CREATE_ERROR' });
    }
  });

  router.delete('/paths/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await db.run(
        `UPDATE library_paths SET active = 0, updated_at = ? WHERE id = ?`,
        [Date.now(), id]
      );
      logger.info('Library', `Library path deleted: ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'LIBRARY_DELETE_ERROR' });
    }
  });

  router.post('/check-path', (req, res) => {
    try {
      const { path: checkPath } = req.body;
      if (!checkPath) {
        res.status(400).json({ error: 'path is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const resolved = path.resolve(checkPath);
      const exists = fs.existsSync(resolved);
      let isDirectory = false;
      let isReadable = false;
      let isWritable = false;
      if (exists) {
        try {
          const stats = fs.statSync(resolved);
          isDirectory = stats.isDirectory();
          fs.accessSync(resolved, fs.constants.R_OK);
          isReadable = true;
          fs.accessSync(resolved, fs.constants.W_OK);
          isWritable = true;
        } catch { /* access check failed */ }
      }
      res.json({ path: resolved, exists, isDirectory, isReadable, isWritable });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'CHECK_PATH_ERROR' });
    }
  });

  return router;
}