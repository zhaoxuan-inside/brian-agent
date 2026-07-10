import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from '../services/logger';

interface CommunityMCP {
  id: string;
  name: string;
  package: string;
  description: string;
  command: string;
  args: string[];
}

const communityMCPs: CommunityMCP[] = [
  { id: 'filesystem', name: 'Filesystem', package: '@modelcontextprotocol/server-filesystem', description: 'File system access', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/files'] },
  { id: 'github', name: 'GitHub', package: '@modelcontextprotocol/server-github', description: 'GitHub API', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
  { id: 'postgres', name: 'PostgreSQL', package: '@modelcontextprotocol/server-postgres', description: 'Database queries', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'] },
  { id: 'brave-search', name: 'Brave Search', package: '@modelcontextprotocol/server-brave-search', description: 'Web search', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
  { id: 'puppeteer', name: 'Puppeteer', package: '@modelcontextprotocol/server-puppeteer', description: 'Browser automation', command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'] },
  { id: 'memory', name: 'Memory', package: '@modelcontextprotocol/server-memory', description: 'Knowledge graph', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
  { id: 'sequential-thinking', name: 'Sequential Thinking', package: '@modelcontextprotocol/server-sequential-thinking', description: 'Complex reasoning', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
  { id: 'fetch', name: 'Fetch', package: '@modelcontextprotocol/server-fetch', description: 'Web content fetching', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] },
  { id: 'google-maps', name: 'Google Maps', package: '@modelcontextprotocol/server-google-maps', description: 'Google Maps API', command: 'npx', args: ['-y', '@modelcontextprotocol/server-google-maps'] },
  { id: 'slack', name: 'Slack', package: '@modelcontextprotocol/server-slack', description: 'Slack messaging', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'] },
  { id: 'sentry', name: 'Sentry', package: '@modelcontextprotocol/server-sentry', description: 'Error tracking', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sentry'] },
  { id: 'raygun', name: 'Raygun', package: '@modelcontextprotocol/server-raygun', description: 'Crash reporting', command: 'npx', args: ['-y', '@modelcontextprotocol/server-raygun'] },
  { id: 'everart', name: 'EverArt', package: '@modelcontextprotocol/server-everart', description: 'AI image generation', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everart'] },
  { id: 'confluence', name: 'Confluence', package: '@modelcontextprotocol/server-confluence', description: 'Atlassian Confluence', command: 'npx', args: ['-y', '@modelcontextprotocol/server-confluence'] },
  { id: 'sqlite', name: 'SQLite', package: '@modelcontextprotocol/server-sqlite', description: 'SQLite database', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite'] },
  { id: 'redis', name: 'Redis', package: '@modelcontextprotocol/server-redis', description: 'Redis cache', command: 'npx', args: ['-y', '@modelcontextprotocol/server-redis'] },
  { id: 'time', name: 'Time', package: '@modelcontextprotocol/server-time', description: 'Time utilities', command: 'npx', args: ['-y', '@modelcontextprotocol/server-time'] },
];

// Track installed packages
const installedPackages = new Map<string, { package: string; installedAt: number }>();

function runInstall(packageName: string, command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const fullArgs = args.join(' ');
    const cmd = `${command} ${fullArgs}`;
    logger.request('MCP', 'INSTALL', cmd);
    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        // npm/npx may exit non-zero but still install. Check node_modules.
        reject(new Error(error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function isPackageInstalled(packageName: string): boolean {
  // Check common node_modules locations
  const cwd = process.cwd();
  const paths = [
    path.join(cwd, 'node_modules', ...packageName.split('/')),
    path.join(cwd, '..', 'node_modules', ...packageName.split('/')),
  ];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return true;
    } catch { /* ignore */ }
  }
  return installedPackages.has(packageName);
}

export function createMCPRoutes(): Router {
  const router = Router();

  // GET /api/mcp/community - return community MCP list
  router.get('/community', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      data: communityMCPs,
      installed: Array.from(installedPackages.keys()),
    });
  });

  // POST /api/mcp/install - install an MCP package
  router.post('/install', async (req: Request, res: Response) => {
    try {
      const { package: pkg, command, args } = req.body;
      if (!pkg || !command) {
        return res.status(400).json({ ok: false, error: 'package and command are required' });
      }

      // Sanitize: prevent arbitrary command injection
      const safePackage = String(pkg).trim();
      if (!/^[@a-zA-Z0-9\-_\/.]+$/.test(safePackage)) {
        return res.status(400).json({ ok: false, error: 'Invalid package name' });
      }
      const safeCommand = String(command).trim();
      const safeArgs = Array.isArray(args) ? args.map(String) : [];

      try {
        const result = await runInstall(safePackage, safeCommand, safeArgs);
        installedPackages.set(safePackage, { package: safePackage, installedAt: Date.now() });
        logger.request('MCP', 'INSTALL OK', safePackage);
        res.json({ ok: true, message: '安装成功', output: result.stdout.slice(-500) });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // npm may still have installed despite error code
        if (isPackageInstalled(safePackage)) {
          installedPackages.set(safePackage, { package: safePackage, installedAt: Date.now() });
          res.json({ ok: true, message: '安装完成（有警告）', warning: msg });
        } else {
          logger.error('MCP', 'INSTALL FAIL', { package: safePackage, error: msg });
          res.status(500).json({ ok: false, error: `安装失败: ${msg}` });
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // GET /api/mcp/installed - return list of installed MCPs
  router.get('/installed', (_req: Request, res: Response) => {
    const list = Array.from(installedPackages.values());
    const packagesWithStatus = list.map(p => ({
      ...p,
      installed: isPackageInstalled(p.package),
    }));
    res.json({ ok: true, data: packagesWithStatus });
  });

  return router;
}
