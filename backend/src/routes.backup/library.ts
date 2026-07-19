import { Router, Request, Response } from 'express';
import { StorageService } from '../core/storage';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../infrastructure/logger';
import fs from 'fs';
import path from 'path';

export function createLibraryRoutes(storage: StorageService): Router {
  const router = Router();

  /**
   * GET /api/library/paths - List all library paths
   */
  router.get('/paths', (_req: Request, res: Response) => {
    try {
      const db = (storage as any).sqlite?.db;
      if (!db) {
        res.json({ paths: [], count: 0 });
        return;
      }

      const rows = db.prepare(
        `SELECT * FROM library_paths WHERE active = 1 ORDER BY updated_at DESC`
      ).all() as any[];

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

  /**
   * POST /api/library/paths - Add a new library path
   */
  router.post('/paths', (req: Request, res: Response) => {
    try {
      const { name, path: libPath, category, description, metadata } = req.body;

      if (!name || !libPath || !category) {
        res.status(400).json({ error: 'name, path, and category are required', code: 'VALIDATION_ERROR' });
        return;
      }

      const db = (storage as any).sqlite?.db;
      if (!db) {
        res.status(500).json({ error: 'Database not available', code: 'DB_ERROR' });
        return;
      }

      const id = uuidv4();
      const now = Date.now();

      db.prepare(
        `INSERT INTO library_paths (id, name, path, category, description, metadata, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(id, name, libPath, category, description || '', JSON.stringify(metadata || {}), now, now);

      logger.info('Library', `Library path added: ${name} (${id})`);
      res.status(201).json({
        id,
        name,
        path: libPath,
        category,
        description: description || '',
        metadata: metadata || {},
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'LIBRARY_CREATE_ERROR' });
    }
  });

  /**
   * DELETE /api/library/paths/:id - Delete a library path
   */
  router.delete('/paths/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const db = (storage as any).sqlite?.db;
      if (!db) {
        res.status(500).json({ error: 'Database not available', code: 'DB_ERROR' });
        return;
      }

      db.prepare(
        `UPDATE library_paths SET active = 0, updated_at = ? WHERE id = ?`
      ).run(Date.now(), id);

      logger.info('Library', `Library path deleted: ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'LIBRARY_DELETE_ERROR' });
    }
  });

  /**
   * POST /api/library/check-path - Check if a path exists and is accessible
   */
  router.post('/check-path', (req: Request, res: Response) => {
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
        } catch {
          // Access check failed
        }
      }

      res.json({
        path: resolved,
        exists,
        isDirectory,
        isReadable,
        isWritable,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'CHECK_PATH_ERROR' });
    }
  });

  return router;
}