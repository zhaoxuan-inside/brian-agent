import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.BRIAN_DATA_DIR || './data';
const LIBRARY_FILE = path.join(DATA_DIR, 'library-paths.json');

function readPaths(): string[] {
  try {
    if (fs.existsSync(LIBRARY_FILE)) {
      const raw = fs.readFileSync(LIBRARY_FILE, 'utf-8');
      return JSON.parse(raw) as string[];
    }
  } catch { /* ignore corrupt file */ }
  return [];
}

function writePaths(paths: string[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(paths, null, 2), 'utf-8');
}

export function createLibraryRoutes(): Router {
  const router = Router();

  // Get all stored library paths
  router.get('/paths', (_req: Request, res: Response) => {
    try {
      const paths = readPaths();
      res.json({ ok: true, data: paths });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Check if a path exists on disk
  router.post('/check-path', (req: Request, res: Response) => {
    const { path: dirPath } = req.body || {};
    if (!dirPath || typeof dirPath !== 'string') {
      return res.status(400).json({ ok: false, error: 'path is required' });
    }
    const exists = fs.existsSync(dirPath);
    res.json({ ok: true, exists });
  });

  // Add a path to library (save + check)
  router.post('/paths', (req: Request, res: Response) => {
    const { path: dirPath } = req.body || {};
    if (!dirPath || typeof dirPath !== 'string') {
      return res.status(400).json({ ok: false, error: 'path is required' });
    }

    const exists = fs.existsSync(dirPath);
    if (!exists) {
      return res.status(400).json({ ok: false, error: '目录不存在' });
    }

    const paths = readPaths();
    if (paths.includes(dirPath)) {
      return res.json({ ok: true, data: paths, message: '路径已存在' });
    }

    paths.push(dirPath);
    writePaths(paths);
    res.json({ ok: true, data: paths });
  });

  // Remove a path from library
  router.delete('/paths', (req: Request, res: Response) => {
    const { path: dirPath } = req.body || {};
    if (!dirPath || typeof dirPath !== 'string') {
      return res.status(400).json({ ok: false, error: 'path is required' });
    }

    let paths = readPaths();
    paths = paths.filter(p => p !== dirPath);
    writePaths(paths);
    res.json({ ok: true, data: paths });
  });

  return router;
}
