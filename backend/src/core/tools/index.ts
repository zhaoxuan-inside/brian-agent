import { Tool, McpPackage, McpTool } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import axios from 'axios';
import { getDatabase } from '../../infrastructure/database';
import { MCPStrategyFactory } from '../../base';
import { logger } from '../../infrastructure/logger';

// ============================================================
// Static MCP Market (popular packages)
// ============================================================

const MCP_MARKET_PACKAGES: McpPackage[] = [
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    displayName: 'Filesystem Server',
    description: 'Secure file operations with configurable access controls. Read, write, edit, and manage files and directories.',
    author: 'Anthropic',
    version: '0.6.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-filesystem',
    category: 'system',
    tags: ['filesystem', 'file', 'directory', 'io'],
    tools: [
      { name: 'read_file', description: 'Read the contents of a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'write_file', description: 'Create or overwrite a file', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
      { name: 'list_directory', description: 'List directory contents', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'move_file', description: 'Move or rename a file', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source', 'destination'] } },
      { name: 'get_file_info', description: 'Get file metadata', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    ],
    installed: false,
    active: false,
  },
  {
    id: 'mcp-github',
    name: 'GitHub',
    displayName: 'GitHub Server',
    description: 'Repository management, file operations, pull requests, issues, and more for GitHub.',
    author: 'Anthropic',
    version: '0.6.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-github',
    category: 'development',
    tags: ['github', 'git', 'repository', 'pr', 'issues'],
    tools: [
      { name: 'create_or_update_file', description: 'Create or update a file in a GitHub repository', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' }, branch: { type: 'string' } }, required: ['owner', 'repo', 'path', 'content', 'message', 'branch'] } },
      { name: 'search_repositories', description: 'Search GitHub repositories', inputSchema: { type: 'object', properties: { query: { type: 'string' }, page: { type: 'number' }, perPage: { type: 'number' } }, required: ['query'] } },
      { name: 'create_issue', description: 'Create a new issue', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['owner', 'repo', 'title'] } },
      { name: 'create_pull_request', description: 'Create a pull request', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' }, body: { type: 'string' } }, required: ['owner', 'repo', 'title', 'head', 'base'] } },
      { name: 'get_file_contents', description: 'Get file contents from a repository', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' }, ref: { type: 'string' } }, required: ['owner', 'repo', 'path'] } },
    ],
    installed: false,
    active: false,
  },
  {
    id: 'mcp-postgres',
    name: 'PostgreSQL',
    displayName: 'PostgreSQL Server',
    description: 'Read-only database access with schema inspection and query capabilities.',
    author: 'Anthropic',
    version: '0.1.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-postgres',
    category: 'database',
    tags: ['postgresql', 'database', 'sql', 'query'],
    tools: [
      { name: 'query', description: 'Run a read-only SQL query', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
    ],
    installed: false,
    active: false,
  },
  {
    id: 'mcp-brave-search',
    name: 'Brave Search',
    displayName: 'Brave Search Server',
    description: 'Web and local search using Brave Search API.',
    author: 'Anthropic',
    version: '0.1.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-brave-search',
    category: 'search',
    tags: ['search', 'web', 'brave'],
    tools: [
      { name: 'brave_web_search', description: 'Perform a web search using Brave Search', inputSchema: { type: 'object', properties: { query: { type: 'string' }, count: { type: 'number' } }, required: ['query'] } },
      { name: 'brave_local_search', description: 'Search for local businesses and places', inputSchema: { type: 'object', properties: { query: { type: 'string' }, count: { type: 'number' } }, required: ['query'] } },
    ],
    installed: false,
    active: false,
  },
  {
    id: 'mcp-memory',
    name: 'Memory',
    displayName: 'Memory Server',
    description: 'Knowledge graph-based persistent memory system for maintaining context across conversations.',
    author: 'Anthropic',
    version: '0.1.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-memory',
    category: 'ai',
    tags: ['memory', 'knowledge-graph', 'context'],
    tools: [
      { name: 'create_entities', description: 'Create multiple new entities in the knowledge graph', inputSchema: { type: 'object', properties: { entities: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, entityType: { type: 'string' }, observations: { type: 'array', items: { type: 'string' } } }, required: ['name', 'entityType', 'observations'] } } }, required: ['entities'] } },
      { name: 'create_relations', description: 'Create relations between entities', inputSchema: { type: 'object', properties: { relations: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, relationType: { type: 'string' } }, required: ['from', 'to', 'relationType'] } } }, required: ['relations'] } },
      { name: 'search_nodes', description: 'Search for nodes in the knowledge graph', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'open_nodes', description: 'Open specific nodes by name', inputSchema: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, required: ['names'] } },
    ],
    installed: false,
    active: false,
  },
  {
    id: 'mcp-puppeteer',
    name: 'Puppeteer',
    displayName: 'Puppeteer Server',
    description: 'Browser automation for web scraping, screenshots, and JavaScript execution.',
    author: 'Anthropic',
    version: '0.1.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-puppeteer',
    category: 'automation',
    tags: ['browser', 'puppeteer', 'scraping', 'screenshot'],
    tools: [
      { name: 'puppeteer_navigate', description: 'Navigate to a URL', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
      { name: 'puppeteer_screenshot', description: 'Take a screenshot of the current page', inputSchema: { type: 'object', properties: { name: { type: 'string' }, selector: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' } }, required: ['name'] } },
      { name: 'puppeteer_click', description: 'Click an element on the page', inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } },
      { name: 'puppeteer_fill', description: 'Fill out an input field', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] } },
      { name: 'puppeteer_evaluate', description: 'Execute JavaScript in the browser console', inputSchema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] } },
    ],
    installed: false,
    active: false,
  },
  {
    id: 'mcp-slack',
    name: 'Slack',
    displayName: 'Slack Server',
    description: 'Send and manage Slack messages, channels, and user interactions.',
    author: 'Anthropic',
    version: '0.1.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-slack',
    category: 'communication',
    tags: ['slack', 'messaging', 'chat', 'communication'],
    tools: [
      { name: 'slack_post_message', description: 'Post a message to a Slack channel', inputSchema: { type: 'object', properties: { channel: { type: 'string' }, text: { type: 'string' } }, required: ['channel', 'text'] } },
      { name: 'slack_list_channels', description: 'List public channels in the workspace', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
      { name: 'slack_reply_to_thread', description: 'Reply to a message thread', inputSchema: { type: 'object', properties: { channel: { type: 'string' }, thread_ts: { type: 'string' }, text: { type: 'string' } }, required: ['channel', 'thread_ts', 'text'] } },
    ],
    installed: false,
    active: false,
  },
  {
    id: 'mcp-google-drive',
    name: 'Google Drive',
    displayName: 'Google Drive Server',
    description: 'File access and search capabilities for Google Drive.',
    author: 'Anthropic',
    version: '0.1.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-google-drive',
    category: 'cloud',
    tags: ['google-drive', 'cloud', 'files', 'gdrive'],
    tools: [
      { name: 'search', description: 'Search for files in Google Drive', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'read', description: 'Read the content of a file', inputSchema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] } },
    ],
    installed: false,
    active: false,
  },
  {
    id: 'mcp-everart',
    name: 'EverArt',
    displayName: 'EverArt Server',
    description: 'AI image generation using various models including Flux, with fine-tuning capabilities.',
    author: 'EverArt',
    version: '0.1.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-everart',
    category: 'ai',
    tags: ['image', 'generation', 'ai', 'art'],
    tools: [
      { name: 'generate_image', description: 'Generate an image from a text prompt', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string' }, style: { type: 'string' } }, required: ['prompt'] } },
    ],
    installed: false,
    active: false,
  },
  {
    id: 'mcp-sequential-thinking',
    name: 'Sequential Thinking',
    displayName: 'Sequential Thinking Server',
    description: 'Dynamic and reflective problem-solving through thought sequences.',
    author: 'Anthropic',
    version: '0.1.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-sequential-thinking',
    category: 'ai',
    tags: ['thinking', 'reasoning', 'problem-solving'],
    tools: [
      { name: 'sequentialthinking', description: 'A detailed tool for dynamic and reflective problem-solving through thoughts', inputSchema: { type: 'object', properties: { thought: { type: 'string' }, nextThoughtNeeded: { type: 'boolean' }, thoughtNumber: { type: 'number' }, totalThoughts: { type: 'number' }, isRevision: { type: 'boolean' }, revisesThought: { type: 'number' }, branchFromThought: { type: 'number' }, branchId: { type: 'string' }, needsMoreThoughts: { type: 'boolean' } }, required: ['thought', 'nextThoughtNeeded', 'thoughtNumber', 'totalThoughts'] } },
    ],
    installed: false,
    active: false,
  },
  {
    id: 'mcp-fetch',
    name: 'Fetch',
    displayName: 'Fetch Server',
    description: 'Web content fetching and conversion for efficient LLM usage.',
    author: 'Anthropic',
    version: '0.1.0',
    repository: 'https://github.com/modelcontextprotocol/servers',
    packageName: '@modelcontextprotocol/server-fetch',
    category: 'web',
    tags: ['fetch', 'web', 'http', 'content'],
    tools: [
      { name: 'fetch', description: 'Fetches a URL and processes into markdown', inputSchema: { type: 'object', properties: { url: { type: 'string' }, maxLength: { type: 'number' }, startIndex: { type: 'number' }, raw: { type: 'boolean' } }, required: ['url'] } },
    ],
    installed: false,
    active: false,
  },
];

// ============================================================
// ToolService
// ============================================================

export class ToolService {
  private registry: Map<string, Tool>;
  private mcpProcesses: Map<string, any>;
  private db = getDatabase();

  constructor() {
    this.registry = new Map();
    this.mcpProcesses = new Map();
    this.registerBuiltinTools();
    this.seedDefaultMarkets();
  }

  // ============================================================
  // Tool Registry
  // ============================================================

  register(tool: Tool): string {
    const id = uuidv4();
    this.registry.set(tool.name, tool);
    return id;
  }

  unregister(toolId: string): void {
    for (const [name, tool] of this.registry.entries()) {
      if (tool.name === toolId) {
        this.registry.delete(name);
        return;
      }
    }
  }

  list(): Tool[] {
    return Array.from(this.registry.values());
  }

  get(toolId: string): Tool | undefined {
    return this.registry.get(toolId);
  }

  async execute(toolName: string, params: Record<string, unknown>): Promise<string> {
    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found in registry`);
    }
    return tool.execute(params);
  }

  getToolsForLLM(): { type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }[] {
    return Array.from(this.registry.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  // ============================================================
  // Built-in Tools
  // ============================================================

  private registerBuiltinTools(): void {
    this.registry.set('file_read', {
      name: 'file_read',
      description: 'Read the contents of a file at the specified path',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'The absolute path to the file to read' },
          offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
          limit: { type: 'number', description: 'Maximum number of lines to read' },
        },
        required: ['file_path'],
      },
      execute: async (params: Record<string, unknown>): Promise<string> => {
        const filePath = params.file_path as string;
        const offset = (params.offset as number) || 0;
        const limit = params.limit as number | undefined;

        try {
          const resolved = path.resolve(filePath);
          const content = fs.readFileSync(resolved, 'utf-8');
          const lines = content.split('\n');

          const startIdx = Math.max(0, offset);
          const endIdx = limit ? Math.min(startIdx + limit, lines.length) : lines.length;

          return lines.slice(startIdx, endIdx)
            .map((line, i) => `${startIdx + i + 1}: ${line}`)
            .join('\n');
        } catch (err: any) {
          return `Error reading file: ${err.message}`;
        }
      },
    });

    this.registry.set('file_write', {
      name: 'file_write',
      description: 'Write content to a file, creating it if it does not exist',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'The absolute path to the file to write' },
          content: { type: 'string', description: 'The content to write to the file' },
        },
        required: ['file_path', 'content'],
      },
      execute: async (params: Record<string, unknown>): Promise<string> => {
        const filePath = params.file_path as string;
        const content = params.content as string;

        try {
          const resolved = path.resolve(filePath);
          const dir = path.dirname(resolved);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(resolved, content, 'utf-8');
          const stats = fs.statSync(resolved);
          return `File written successfully: ${resolved} (${stats.size} bytes)`;
        } catch (err: any) {
          return `Error writing file: ${err.message}`;
        }
      },
    });

    this.registry.set('file_list', {
      name: 'file_list',
      description: 'List files and directories at the specified path',
      inputSchema: {
        type: 'object',
        properties: {
          directory_path: { type: 'string', description: 'The absolute path to the directory to list' },
          recursive: { type: 'boolean', description: 'Whether to list recursively' },
        },
        required: ['directory_path'],
      },
      execute: async (params: Record<string, unknown>): Promise<string> => {
        const dirPath = params.directory_path as string;
        const recursive = params.recursive as boolean || false;

        try {
          const resolved = path.resolve(dirPath);
          if (!fs.existsSync(resolved)) {
            return `Directory not found: ${resolved}`;
          }

          const entries: string[] = [];
          const listDir = (dir: string, prefix: string = '') => {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
              const fullPath = path.join(dir, item.name);
              const displayPath = prefix ? `${prefix}/${item.name}` : item.name;
              if (item.isDirectory()) {
                entries.push(`${displayPath}/`);
                if (recursive) {
                  listDir(fullPath, displayPath);
                }
              } else {
                const stats = fs.statSync(fullPath);
                entries.push(`${displayPath} (${stats.size} bytes)`);
              }
            }
          };

          listDir(resolved);
          return entries.join('\n') || '(empty directory)';
        } catch (err: any) {
          return `Error listing directory: ${err.message}`;
        }
      },
    });

    this.registry.set('shell_exec', {
      name: 'shell_exec',
      description: 'Execute a shell command and return the output',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          cwd: { type: 'string', description: 'Working directory for the command' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
        },
        required: ['command'],
      },
      execute: (params: Record<string, unknown>): Promise<string> => {
        const command = params.command as string;
        const cwd = params.cwd as string | undefined;
        const timeout = (params.timeout as number) || 30000;

        return new Promise((resolve) => {
          const _child = exec(command, {
            cwd: cwd ? path.resolve(cwd) : process.cwd(),
            timeout,
            maxBuffer: 10 * 1024 * 1024, // 10MB
          }, (error, stdout, stderr) => {
            if (error) {
              resolve(`Exit code: ${error.code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
            } else {
              resolve(stdout || '(no output)');
            }
          });
        });
      },
    });

    this.registry.set('web_fetch', {
      name: 'web_fetch',
      description: 'Fetch content from a URL and return as text',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
          headers: { type: 'object', description: 'Optional HTTP headers' },
          max_length: { type: 'number', description: 'Maximum response length in characters' },
        },
        required: ['url'],
      },
      execute: async (params: Record<string, unknown>): Promise<string> => {
        const url = params.url as string;
        const headers = params.headers as Record<string, string> | undefined;
        const maxLength = (params.max_length as number) || 50000;

        try {
          const response = await fetch(url, {
            headers: headers || {},
            signal: AbortSignal.timeout(30000),
          });

          if (!response.ok) {
            return `HTTP ${response.status} ${response.statusText}`;
          }

          const contentType = response.headers.get('content-type') || '';
          let text: string;

          if (contentType.includes('application/json')) {
            const json = await response.json();
            text = JSON.stringify(json, null, 2);
          } else {
            text = await response.text();
          }

          if (text.length > maxLength) {
            text = text.substring(0, maxLength) + `\n... (truncated, ${text.length - maxLength} more characters)`;
          }

          return text;
        } catch (err: any) {
          return `Error fetching URL: ${err.message}`;
        }
      },
    });

    this.registry.set('calculator', {
      name: 'calculator',
      description: 'Evaluate a mathematical expression safely',
      inputSchema: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'The mathematical expression to evaluate' },
        },
        required: ['expression'],
      },
      execute: async (params: Record<string, unknown>): Promise<string> => {
        const expression = params.expression as string;

        // Safety check: only allow safe characters
        const safePattern = /^[\d\s+\-*/().%^eE,]+$/;
        if (!safePattern.test(expression)) {
          return `Error: Expression contains unsafe characters. Only digits, operators (+, -, *, /, %, ^), parentheses, decimals, and commas are allowed.`;
        }

        try {
          // Replace ^ with ** for exponentiation
          const sanitized = expression.replace(/\^/g, '**');
          const result = eval(sanitized);
          return `Result: ${result}`;
        } catch (err: any) {
          return `Error evaluating expression: ${err.message}`;
        }
      },
    });
  }

  // ============================================================
  // MCP Client
  // ============================================================

  async installMcp(packageName: string, displayName?: string, sourceMarket?: string, repository?: string): Promise<{ id: string; success: boolean; error?: string }> {
    const id = uuidv4();
    const marketPkg = MCP_MARKET_PACKAGES.find(p => p.packageName === packageName);
    const now = Date.now();

    logger.info('MCP', `Starting MCP installation: ${packageName}, displayName: ${displayName}, sourceMarket: ${sourceMarket}, repository: ${repository}`);
    
    try {
      const repoUrl = repository || marketPkg?.repository || '';
      const hasRepository = repoUrl.startsWith('https://github.com/') || repoUrl.startsWith('git@');
      
      let installerType: string;
      let installPackageName: string;
      
      if (hasRepository) {
        installerType = 'git';
        installPackageName = repoUrl;
        logger.info('MCP', `Selected installer: ${installerType} using repository URL: ${repoUrl}`);
      } else {
        installerType = 'npm';
        installPackageName = packageName;
        logger.info('MCP', `Selected installer: ${installerType} for package: ${packageName}`);
      }
      
      const installer = MCPStrategyFactory.getInstaller(installerType as 'npm' | 'git' | 'docker');
      const installResult = await installer.install(installPackageName, displayName || marketPkg?.displayName || packageName);

      if (!installResult.success) {
        logger.error('MCP', `Installation failed: ${packageName}, error: ${installResult.error}`);
        return { id, success: false, error: installResult.error };
      }

      logger.info('MCP', `Installation successful: ${packageName}, version: ${installResult.version}, installPath: ${installResult.installPath}`);

      this.db.prepare(
        `INSERT INTO mcp_installed (id, package_name, display_name, version, tools, active, server_status, installed_at, install_path, source_market, start_command, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 'stopped', ?, ?, ?, ?, ?)`
      ).run(
        id,
        packageName,
        installResult.displayName,
        installResult.version || marketPkg?.version || '0.0.0',
        JSON.stringify(installResult.tools || marketPkg?.tools || []),
        now,
        installResult.installPath,
        sourceMarket || '',
        installResult.startCommand,
        now
      );

      logger.info('MCP', `Database record created: ${id}`);
      return { id, success: true };
    } catch (err: any) {
      logger.error('MCP', `Installation exception: ${packageName}, error: ${err.message}, stack: ${err.stack}`);
      return { id, success: false, error: err.message };
    }
  }

  async uninstallMcp(packageId: string): Promise<void> {
    await this.stopMcpServer(packageId);
    this.db.prepare(`DELETE FROM mcp_installed WHERE id = ?`).run(packageId);
  }

  listMcpInstalled(page?: number, pageSize?: number): { installed: any[]; total: number; page: number; pageSize: number } {
    const p = page && page > 0 ? page : 1;
    const ps = pageSize && pageSize > 0 ? pageSize : 20;

    const total = (this.db.prepare(`SELECT COUNT(*) as cnt FROM mcp_installed`).get() as { cnt: number }).cnt;
    const rows = this.db.prepare(
      `SELECT * FROM mcp_installed ORDER BY installed_at DESC LIMIT ? OFFSET ?`
    ).all(ps, (p - 1) * ps) as Record<string, unknown>[];

    const installed = rows.map((row) => ({
      id: row.id,
      packageName: row.package_name,
      displayName: row.display_name,
      version: row.version,
      tools: JSON.parse(row.tools as string),
      active: row.active,
      serverStatus: row.server_status,
      installedAt: row.installed_at,
      installPath: row.install_path,
      sourceMarket: row.source_market,
      startCommand: row.start_command,
      updatedAt: row.updated_at,
    }));

    return { installed, total, page: p, pageSize: ps };
  }

  async getMcpMarket(search?: string, category?: string): Promise<McpPackage[]> {
    let results = MCP_MARKET_PACKAGES;

    if (search) {
      const lower = search.toLowerCase();
      results = results.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.displayName.toLowerCase().includes(lower) ||
        p.description.toLowerCase().includes(lower) ||
        p.tags.some(t => t.toLowerCase().includes(lower))
      );
    }

    if (category) {
      results = results.filter(p => p.category === category);
    }

    // Mark installed status
    const { installed } = this.listMcpInstalled();
    const installedNames = new Set(installed.map(i => i.packageName));

    return results.map(p => ({
      ...p,
      installed: installedNames.has(p.packageName),
      installedVersion: installed.find(i => i.packageName === p.packageName)?.version,
    }));
  }

  async getMcpDetail(packageId: string): Promise<McpPackage | undefined> {
    return MCP_MARKET_PACKAGES.find(p => p.id === packageId);
  }

  async syncMcpMarket(): Promise<void> {
    // In a real implementation, this would fetch from a remote registry
    // For now, the market is statically defined
  }

  // ============================================================
  // MCP Market management (DB-backed)
  // ============================================================

  /**
   * Seed built-in MCP marketplaces into the DB on first run.
   * Only inserts if no builtin-* market exists yet.
   */
  private seedDefaultMarkets(): void {
    const existing = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM mcp_markets WHERE id LIKE 'builtin-%'`
    ).get() as { cnt: number } | undefined;
    if (existing && existing.cnt > 0) return;

    const defaults = [
      { id: 'builtin-mcp-official', name: 'MCP官方市场', url: 'https://registry.modelcontextprotocol.io', description: 'Model Context Protocol 官方市场，提供 Anthropic 官方维护的 MCP 服务器' },
      { id: 'builtin-smithery', name: 'Smithery', url: 'https://smithery.ai', description: '最大的 MCP 社区市场，收录数千个 MCP 服务器，支持搜索和分类浏览' },
      { id: 'builtin-mcp-so', name: 'MCP.so', url: 'https://mcp.so', description: 'MCP 发现平台，提供热门 MCP 服务器排行和分类检索' },
      { id: 'builtin-pulsemcp', name: 'PulseMCP', url: 'https://pulsemcp.com', description: 'MCP 服务器目录，聚焦开发者工具和 AI 集成场景' },
      { id: 'builtin-glama', name: 'Glama', url: 'https://glama.ai/mcp', description: 'MCP 网关与目录，提供 MCP 服务器的统一接入和管理' },
    ];

    const now = Date.now();
    const insert = this.db.prepare(
      `INSERT INTO mcp_markets (id, name, url, description, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`
    );
    for (const m of defaults) {
      insert.run(m.id, m.name, m.url, m.description, now, now);
    }
  }

  addMarket(name: string, url: string, description: string): { id: string; name: string; url: string; description: string; enabled: boolean; createdAt: number; updatedAt: number } {
    // Check duplicate URL
    const existing = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM mcp_markets WHERE url = ?`
    ).get(url) as { cnt: number } | undefined;
    if (existing && existing.cnt > 0) {
      throw new Error(`市场 URL "${url}" 已存在`);
    }

    const id = uuidv4();
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO mcp_markets (id, name, url, description, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`
    ).run(id, name, url, description, now, now);
    return { id, name, url, description, enabled: true, createdAt: now, updatedAt: now };
  }

  listMarkets(): Array<{ id: string; name: string; url: string; description: string; enabled: boolean; createdAt: number; updatedAt: number }> {
    const rows = this.db.prepare(
      `SELECT * FROM mcp_markets ORDER BY created_at DESC`
    ).all() as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.id),
      name: String(r.name),
      url: String(r.url),
      description: String(r.description || ''),
      enabled: Boolean(r.enabled),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    }));
  }

  deleteMarket(id: string): void {
    if (id.startsWith('builtin-')) {
      throw new Error('内置市场不可删除');
    }
    this.db.prepare(`DELETE FROM mcp_markets WHERE id = ?`).run(id);
    this.db.prepare(`DELETE FROM mcp_hot WHERE market_id = ?`).run(id);
  }

  // ============================================================
  // Hot MCP
  // ============================================================

  async fetchHotMcps(): Promise<Array<{ id: string; marketId: string; packageName: string; displayName: string; description: string; author: string; version: string; repository: string; category: string; tags: string[]; tools: McpTool[] }>> {
    const today = new Date().toISOString().slice(0, 10);
    const existing = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM mcp_hot WHERE fetch_date = ?`
    ).get(today) as { cnt: number } | undefined;

    if (existing && existing.cnt > 0) {
      const rows = this.db.prepare(
        `SELECT * FROM mcp_hot WHERE fetch_date = ? ORDER BY created_at DESC LIMIT 10`
      ).all(today) as Record<string, unknown>[];
      return rows.map(r => this.mapHotRow(r));
    }

    // Clear old hot MCPs
    this.db.prepare(`DELETE FROM mcp_hot`).run();

    // Collect top 10 MCPs from all markets (static for now, but in real impl would call each market URL)
    // For now return top 10 from the static market
    const topPackages = MCP_MARKET_PACKAGES.slice(0, 10);
    const now = Date.now();

    const results: Array<ReturnType<typeof this.mapHotRow>> = [];
    for (const pkg of topPackages) {
      const id = uuidv4();
      this.db.prepare(
        `INSERT INTO mcp_hot (id, market_id, package_name, display_name, description, author, version, repository, category, tags, tools, fetch_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, 'builtin', pkg.packageName, pkg.displayName, pkg.description, pkg.author,
        pkg.version, pkg.repository, pkg.category, JSON.stringify(pkg.tags),
        JSON.stringify(pkg.tools), today, now
      );
      results.push({
        id, marketId: 'builtin', packageName: pkg.packageName,
        displayName: pkg.displayName, description: pkg.description,
        author: pkg.author, version: pkg.version, repository: pkg.repository,
        category: pkg.category, tags: pkg.tags, tools: pkg.tools,
      });
    }
    return results;
  }

  private mapHotRow(r: Record<string, unknown>) {
    return {
      id: String(r.id),
      marketId: String(r.market_id),
      packageName: String(r.package_name),
      displayName: String(r.display_name),
      description: String(r.description || ''),
      author: String(r.author || ''),
      version: String(r.version || ''),
      repository: String(r.repository || ''),
      category: String(r.category || ''),
      tags: JSON.parse(String(r.tags || '[]')),
      tools: JSON.parse(String(r.tools || '[]')),
    };
  }

  getHotMcps(): Array<ReturnType<typeof this.mapHotRow>> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = this.db.prepare(
      `SELECT * FROM mcp_hot WHERE fetch_date = ? ORDER BY created_at DESC LIMIT 10`
    ).all(today) as Record<string, unknown>[];
    return rows.map(r => this.mapHotRow(r));
  }

  // ============================================================
  // Market MCP list (paginated)
  // ============================================================

  private marketCaches: Record<string, { servers: McpPackage[]; nextCursor: string | null; total: number | null; fetched: boolean; lastFetchTime: number }> = {};

  private getMarketCache(marketId: string): { servers: McpPackage[]; nextCursor: string | null; total: number | null; fetched: boolean; lastFetchTime: number } {
    if (!this.marketCaches[marketId]) {
      this.marketCaches[marketId] = { servers: [], nextCursor: null, total: null, fetched: false, lastFetchTime: 0 };
    }
    return this.marketCaches[marketId];
  }

  private isCacheExpired(marketId: string): boolean {
    const HOURS_24 = 24 * 60 * 60 * 1000;
    const cache = this.getMarketCache(marketId);
    return Date.now() - cache.lastFetchTime > HOURS_24;
  }

  async getMarketMcps(marketId: string, page: number, pageSize: number, search?: string): Promise<{ mcps: McpPackage[]; total: number; page: number; pageSize: number }> {
    let allMcps: McpPackage[] = [];

    if (marketId === 'builtin-mcp-official' || marketId === 'builtin') {
      const requiredCount = page * pageSize;
      const prefetchCount = requiredCount + pageSize * 2;
      const cache = this.getMarketCache(marketId);

      if (this.isCacheExpired(marketId)) {
        cache.servers = [];
        cache.nextCursor = null;
        cache.total = null;
        cache.fetched = false;
      }

      if (cache.servers.length < requiredCount || !cache.fetched) {
        await this.fetchFromOfficialRegistry(prefetchCount, marketId);
      }
      allMcps = cache.servers;
    } else if (marketId === 'builtin-smithery') {
      const requiredCount = page * pageSize;
      const prefetchCount = requiredCount + pageSize * 2;
      const cache = this.getMarketCache(marketId);

      if (this.isCacheExpired(marketId)) {
        cache.servers = [];
        cache.nextCursor = null;
        cache.total = null;
        cache.fetched = false;
      }

      if (cache.servers.length < requiredCount || !cache.fetched) {
        await this.fetchFromSmithery(prefetchCount, marketId);
      }
      allMcps = cache.servers;
    } else if (marketId === 'builtin-mcp-so') {
      const requiredCount = page * pageSize;
      const prefetchCount = requiredCount + pageSize * 2;
      const cache = this.getMarketCache(marketId);

      if (this.isCacheExpired(marketId)) {
        cache.servers = [];
        cache.nextCursor = null;
        cache.total = null;
        cache.fetched = false;
      }

      if (cache.servers.length < requiredCount || !cache.fetched) {
        await this.fetchFromMcpSo(prefetchCount, marketId);
      }
      allMcps = cache.servers;
    } else if (marketId === 'builtin-glama') {
      const requiredCount = page * pageSize;
      const prefetchCount = requiredCount + pageSize * 2;
      const cache = this.getMarketCache(marketId);

      if (this.isCacheExpired(marketId)) {
        cache.servers = [];
        cache.nextCursor = null;
        cache.total = null;
        cache.fetched = false;
      }

      if (cache.servers.length < requiredCount || !cache.fetched) {
        await this.fetchFromGlama(prefetchCount, marketId);
      }
      allMcps = cache.servers;
    } else {
      allMcps = MCP_MARKET_PACKAGES;
    }

    const { installed } = this.listMcpInstalled();
    const installedNames = new Set(installed.map(i => i.packageName));

    if (search) {
      const q = search.toLowerCase();
      allMcps = allMcps.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.packageName.toLowerCase().includes(q)
      );
    }

    const total = allMcps.length;
    const start = (page - 1) * pageSize;
    const mcps = allMcps.slice(start, start + pageSize).map(p => ({
      ...p,
      installed: installedNames.has(p.packageName),
      installedVersion: installed.find(i => i.packageName === p.packageName)?.version,
    }));

    return { mcps, total, page, pageSize };
  }

  private async fetchFromOfficialRegistry(requiredCount: number = 20, marketId: string = 'builtin-mcp-official'): Promise<void> {
    const registryUrl = 'https://registry.modelcontextprotocol.io/v0.1/servers';
    let cursor: string | null = this.getMarketCache(marketId).nextCursor;
    const allServers: Record<string, McpPackage> = {};
    const cache = this.getMarketCache(marketId);

    if (cache.servers.length > 0) {
      for (const s of cache.servers) {
        allServers[s.name] = s;
      }
    }

    try {
      while (cursor !== null || (cache.servers.length === 0)) {
        if (Object.keys(allServers).length >= requiredCount && cursor) {
          break;
        }

        const url = cursor ? `${registryUrl}?limit=30&cursor=${encodeURIComponent(cursor)}` : `${registryUrl}?limit=30`;

        const response = await axios.get(url, { timeout: 30000 });
        const data = response.data as { servers: Array<{ server: any; _meta: any }>; metadata: { nextCursor: string | null } };

        for (const item of data.servers) {
          const server = item.server;
          const meta = item._meta?.['io.modelcontextprotocol.registry/official'];

          if (meta?.isLatest) {
            const pkg: McpPackage = {
              id: server.name,
              name: server.name,
              displayName: server.title || server.name.split('/').pop() || server.name,
              description: server.description || '',
              author: server.author || server.publisher || '',
              version: server.version || '',
              repository: server.repository?.url || '',
              packageName: server.name,
              category: server.category || 'other',
              tags: server.tags || [],
              tools: server.tools?.map((t: any) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema || t.input || {},
              })) || [],
              installed: false,
              active: false,
            };
            allServers[server.name] = pkg;
          }
        }

        cursor = data.metadata?.nextCursor || null;
        if (!cursor) break;
      }

      cache.servers = Object.values(allServers);
      cache.nextCursor = cursor;
      cache.total = cache.servers.length;
      cache.fetched = !cursor;
      cache.lastFetchTime = Date.now();
    } catch {
      cache.servers = MCP_MARKET_PACKAGES;
      cache.nextCursor = null;
      cache.total = MCP_MARKET_PACKAGES.length;
      cache.fetched = true;
      cache.lastFetchTime = Date.now();
    }
  }

  private async fetchFromSmithery(requiredCount: number = 20, marketId: string = 'builtin-smithery'): Promise<void> {
    const startTime = Date.now();
    const baseUrl = 'https://smithery.ai/servers';
    const cache = this.getMarketCache(marketId);
    const allServers: Record<string, McpPackage> = {};

    logger.info('ToolService', '[fetchFromSmithery] ====== START ======');
    logger.info('ToolService', `[fetchFromSmithery] requiredCount: ${requiredCount} marketId: ${marketId}`);
    logger.info('ToolService', `[fetchFromSmithery] Existing cache servers: ${cache.servers.length}`);

    if (cache.servers.length > 0) {
      for (const s of cache.servers) {
        allServers[s.name] = s;
      }
    }

    let currentPage = cache.nextCursor ? parseInt(cache.nextCursor) : 1;
    const prefetchPages = 10;

    try {
      while (true) {
        const url = `${baseUrl}?page=${currentPage}`;
        logger.info('ToolService', `[fetchFromSmithery] Fetching page: ${currentPage} URL: ${url}`);

        const fetchStart = Date.now();
        const response = await axios.get(url, { timeout: 30000 });
        const fetchDuration = Date.now() - fetchStart;
        logger.info('ToolService', `[fetchFromSmithery] Page ${currentPage} response: ${response.status} duration: ${fetchDuration}ms`);

        const content = response.data as string;
        logger.info('ToolService', `[fetchFromSmithery] Page ${currentPage} content length: ${content.length} bytes`);

        const lines = content.split('\n');
        let i = 0;
        let foundServers = false;
        let parsedCount = 0;
        while (i < lines.length) {
          if (lines[i].startsWith('### ')) {
            foundServers = true;
            const displayName = lines[i].substring(4).split('[')[0].trim();
            const tags = lines[i].includes('[') ? lines[i].split('[')[1].split(']')[0] : '';
            i++;

            if (i < lines.length && lines[i].includes('`')) {
              const packageName = lines[i].split('`')[1];
              i++;

              let description = '';
              while (i < lines.length && lines[i] && !lines[i].startsWith('### ') && !lines[i].startsWith('```')) {
                description += lines[i] + ' ';
                i++;
              }

              const pkg: McpPackage = {
                id: packageName,
                name: packageName,
                displayName,
                description: description.trim(),
                author: tags.includes('verified') ? 'verified' : '',
                version: '',
                repository: '',
                packageName,
                category: tags.includes('remote') ? 'remote' : 'local',
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                tools: [],
                installed: false,
                active: false,
              };
              allServers[packageName] = pkg;
              parsedCount++;
            }
          }
          i++;
        }

        logger.info('ToolService', `[fetchFromSmithery] Page ${currentPage} parsed: ${parsedCount} servers, foundServers: ${foundServers}`);

        if (!foundServers) {
          break;
        }

        currentPage++;
        if (currentPage > prefetchPages && Object.keys(allServers).length >= requiredCount) {
          break;
        }
      }

      cache.servers = Object.values(allServers);
      cache.nextCursor = currentPage.toString();
      cache.total = cache.servers.length;
      cache.fetched = true;
      cache.lastFetchTime = Date.now();

      const duration = Date.now() - startTime;
      logger.info('ToolService', '[fetchFromSmithery] ====== SUCCESS ======');
      logger.info('ToolService', `[fetchFromSmithery] Total servers fetched: ${cache.servers.length}`);
      logger.info('ToolService', `[fetchFromSmithery] Pages fetched: ${currentPage - 1}`);
      logger.info('ToolService', `[fetchFromSmithery] Total duration: ${duration}ms`);
      logger.info('ToolService', '[fetchFromSmithery] ====== END ======');
    } catch (e: any) {
      const duration = Date.now() - startTime;
      logger.error('ToolService', '[fetchFromSmithery] ====== ERROR ======');
      logger.error('ToolService', `[fetchFromSmithery] Error name: ${e.name}`);
      logger.error('ToolService', `[fetchFromSmithery] Error message: ${e.message}`);
      logger.error('ToolService', `[fetchFromSmithery] Error stack: ${e.stack}`);
      logger.error('ToolService', `[fetchFromSmithery] Duration before error: ${duration}ms`);
      logger.error('ToolService', '[fetchFromSmithery] Falling back to static list');
      logger.error('ToolService', '[fetchFromSmithery] ====== END ======');

      cache.servers = MCP_MARKET_PACKAGES;
      cache.nextCursor = null;
      cache.total = MCP_MARKET_PACKAGES.length;
      cache.fetched = true;
      cache.lastFetchTime = Date.now();
    }
  }

  private async fetchFromMcpSo(requiredCount: number = 20, marketId: string = 'builtin-mcp-so'): Promise<void> {
    const startTime = Date.now();
    const baseUrl = 'https://mcp.so/sitemap.xml';
    const cache = this.getMarketCache(marketId);
    const allServers: Record<string, McpPackage> = {};

    logger.info('ToolService', '[fetchFromMcpSo] ====== START ======');
    logger.info('ToolService', `[fetchFromMcpSo] requiredCount: ${requiredCount} marketId: ${marketId}`);
    logger.info('ToolService', `[fetchFromMcpSo] Existing cache servers: ${cache.servers.length}`);

    if (cache.servers.length > 0) {
      for (const s of cache.servers) {
        allServers[s.name] = s;
      }
    }

    let currentPage = cache.nextCursor ? parseInt(cache.nextCursor) : 1;
    const prefetchPages = 3;

    try {
      while (true) {
        if (Object.keys(allServers).length >= requiredCount && currentPage > prefetchPages) {
          break;
        }

        const url = `${baseUrl}?section=servers&page=${currentPage}`;
        logger.info('ToolService', `[fetchFromMcpSo] Fetching page: ${currentPage} URL: ${url}`);

        const fetchStart = Date.now();
        const response = await axios.get(url, { timeout: 30000 });
        const fetchDuration = Date.now() - fetchStart;
        logger.info('ToolService', `[fetchFromMcpSo] Page ${currentPage} response: ${response.status} duration: ${fetchDuration}ms`);

        const content = response.data as string;
        logger.info('ToolService', `[fetchFromMcpSo] Page ${currentPage} content length: ${content.length} bytes`);

        const locPattern = /<loc>https:\/\/mcp\.so\/servers\/([^<]+)<\/loc>/g;
        let match;
        let foundServers = false;
        let parsedCount = 0;

        while ((match = locPattern.exec(content)) !== null) {
          foundServers = true;
          const packageName = match[1];
          const displayName = packageName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || packageName;

          const pkg: McpPackage = {
            id: packageName,
            name: packageName,
            displayName,
            description: '',
            author: '',
            version: '',
            repository: '',
            packageName,
            category: 'other',
            tags: [],
            tools: [],
            installed: false,
            active: false,
          };
          allServers[packageName] = pkg;
          parsedCount++;
        }

        logger.info('ToolService', `[fetchFromMcpSo] Page ${currentPage} parsed: ${parsedCount} servers, foundServers: ${foundServers}`);

        if (!foundServers) {
          break;
        }

        currentPage++;
        if (currentPage > prefetchPages + 5 && Object.keys(allServers).length >= requiredCount) {
          break;
        }
      }

      cache.servers = Object.values(allServers);
      cache.nextCursor = currentPage.toString();
      cache.total = cache.servers.length;
      cache.fetched = true;
      cache.lastFetchTime = Date.now();

      const duration = Date.now() - startTime;
      logger.info('ToolService', '[fetchFromMcpSo] ====== SUCCESS ======');
      logger.info('ToolService', `[fetchFromMcpSo] Total servers fetched: ${cache.servers.length}`);
      logger.info('ToolService', `[fetchFromMcpSo] Pages fetched: ${currentPage - 1}`);
      logger.info('ToolService', `[fetchFromMcpSo] Total duration: ${duration}ms`);
      logger.info('ToolService', '[fetchFromMcpSo] ====== END ======');
    } catch (e: any) {
      const duration = Date.now() - startTime;
      logger.error('ToolService', '[fetchFromMcpSo] ====== ERROR ======');
      logger.error('ToolService', `[fetchFromMcpSo] Error name: ${e.name}`);
      logger.error('ToolService', `[fetchFromMcpSo] Error message: ${e.message}`);
      logger.error('ToolService', `[fetchFromMcpSo] Error stack: ${e.stack}`);
      logger.error('ToolService', `[fetchFromMcpSo] Duration before error: ${duration}ms`);
      logger.error('ToolService', '[fetchFromMcpSo] Falling back to static list');
      logger.error('ToolService', '[fetchFromMcpSo] ====== END ======');

      cache.servers = MCP_MARKET_PACKAGES;
      cache.nextCursor = null;
      cache.total = MCP_MARKET_PACKAGES.length;
      cache.fetched = true;
      cache.lastFetchTime = Date.now();
    }
  }

  private async fetchFromGlama(requiredCount: number = 20, marketId: string = 'builtin-glama'): Promise<void> {
    const startTime = Date.now();
    const url = 'https://glama.ai/sitemaps/mcp-remote-servers.xml';
    const cache = this.getMarketCache(marketId);
    const allServers: Record<string, McpPackage> = {};

    logger.info('ToolService', '[fetchFromGlama] ====== START ======');
    logger.info('ToolService', `[fetchFromGlama] requiredCount: ${requiredCount} marketId: ${marketId}`);
    logger.info('ToolService', `[fetchFromGlama] Existing cache servers: ${cache.servers.length}`);
    logger.info('ToolService', `[fetchFromGlama] Fetch URL: ${url}`);

    if (cache.servers.length > 0) {
      for (const s of cache.servers) {
        allServers[s.name] = s;
      }
    }

    try {
      const fetchStart = Date.now();
      const response = await axios.get(url, { timeout: 30000 });
      const fetchDuration = Date.now() - fetchStart;
      logger.info('ToolService', `[fetchFromGlama] Response: ${response.status} duration: ${fetchDuration}ms`);

      const content = response.data as string;
      logger.info('ToolService', `[fetchFromGlama] Content length: ${content.length} bytes`);

      const locPattern = /<loc>https:\/\/glama\.ai\/mcp\/connectors\/([^<]+)<\/loc>/g;
      let match;
      let parsedCount = 0;

      while ((match = locPattern.exec(content)) !== null) {
        const packagePath = match[1];
        const parts = packagePath.split('/');
        const packageName = parts.length > 1 ? `${parts[0]}/${parts[1]}` : packagePath;
        const displayName = parts.length > 1 ? parts[1] : packagePath;

        const pkg: McpPackage = {
          id: packageName,
          name: packageName,
          displayName: displayName.charAt(0).toUpperCase() + displayName.slice(1),
          description: '',
          author: '',
          version: '',
          repository: '',
          packageName,
          category: 'other',
          tags: [],
          tools: [],
          installed: false,
          active: false,
        };
        allServers[packageName] = pkg;
        parsedCount++;
      }

      logger.info('ToolService', `[fetchFromGlama] Total parsed: ${parsedCount} servers`);

      cache.servers = Object.values(allServers);
      cache.nextCursor = null;
      cache.total = cache.servers.length;
      cache.fetched = true;
      cache.lastFetchTime = Date.now();

      const duration = Date.now() - startTime;
      logger.info('ToolService', '[fetchFromGlama] ====== SUCCESS ======');
      logger.info('ToolService', `[fetchFromGlama] Total servers fetched: ${cache.servers.length}`);
      logger.info('ToolService', `[fetchFromGlama] Total duration: ${duration}ms`);
      logger.info('ToolService', '[fetchFromGlama] ====== END ======');
    } catch (e: any) {
      const duration = Date.now() - startTime;
      logger.error('ToolService', '[fetchFromGlama] ====== ERROR ======');
      logger.error('ToolService', `[fetchFromGlama] Error name: ${e.name}`);
      logger.error('ToolService', `[fetchFromGlama] Error message: ${e.message}`);
      logger.error('ToolService', `[fetchFromGlama] Error stack: ${e.stack}`);
      logger.error('ToolService', `[fetchFromGlama] Duration before error: ${duration}ms`);
      logger.error('ToolService', '[fetchFromGlama] Falling back to static list');
      logger.error('ToolService', '[fetchFromGlama] ====== END ======');

      cache.servers = MCP_MARKET_PACKAGES;
      cache.nextCursor = null;
      cache.total = MCP_MARKET_PACKAGES.length;
      cache.fetched = true;
      cache.lastFetchTime = Date.now();
    }
  }

  // ============================================================
  // Install MCP from market
  // ============================================================

  async installMcpFromMarket(marketId: string, packageName: string, displayName?: string, repository?: string): Promise<{ code: number; msg: string; content?: string; id?: string }> {
    // Check if already installed
    const { installed } = this.listMcpInstalled();
    if (installed.find(i => i.packageName === packageName)) {
      return { code: 409, msg: '已安装', content: '该 MCP 已安装' };
    }

    try {
      const result = await this.installMcp(packageName, displayName, marketId, repository);
      if (result.success) {
        return { code: 200, msg: '安装成功', id: result.id };
      } else {
        return { code: 500, msg: '安装失败', content: result.error };
      }
    } catch (err: any) {
      return { code: 500, msg: '安装失败', content: err.message };
    }
  }

  async startMcpServer(mcpId: string): Promise<void> {
    const installed = this.db.prepare(
      `SELECT * FROM mcp_installed WHERE id = ?`
    ).get(mcpId) as Record<string, unknown> | undefined;

    if (!installed) {
      throw new Error(`MCP package ${mcpId} not found`);
    }

    const installPath = installed.install_path as string;
    const startCommand = installed.start_command as string;
    const tools = JSON.parse(installed.tools as string) as McpTool[];

    if (startCommand && installPath) {
      const installer = MCPStrategyFactory.getInstaller('npm');
      const startResult = await installer.start(installPath, startCommand);

      if (startResult.success) {
        this.mcpProcesses.set(mcpId, {
          processId: startResult.processId,
          port: startResult.port,
        });

        this.db.prepare(
          `UPDATE mcp_installed SET server_status = 'running', updated_at = ? WHERE id = ?`
        ).run(new Date().getTime(), mcpId);
      }
    } else {
      this.db.prepare(
        `UPDATE mcp_installed SET server_status = 'running', updated_at = ? WHERE id = ?`
      ).run(new Date().toISOString(), mcpId);
    }

    // Register tools from this MCP into the registry
    for (const tool of tools) {
      this.registry.set(tool.name, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: async (params: Record<string, unknown>): Promise<string> => {
          const mcpProcess = this.mcpProcesses.get(mcpId);
          if (mcpProcess?.port) {
            try {
              const response = await fetch(`http://localhost:${mcpProcess.port}/tools/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: tool.name, arguments: params }),
              });
              const result = await response.json();
              return JSON.stringify(result);
            } catch {
              return `MCP tool "${tool.name}" executed with params: ${JSON.stringify(params)}`;
            }
          }
          return `MCP tool "${tool.name}" executed with params: ${JSON.stringify(params)}`;
        },
      });
    }
  }

  async stopMcpServer(mcpId: string): Promise<void> {
    const installed = this.db.prepare(
      `SELECT * FROM mcp_installed WHERE id = ?`
    ).get(mcpId) as Record<string, unknown> | undefined;

    if (!installed) return;

    const mcpProcess = this.mcpProcesses.get(mcpId);
    if (mcpProcess?.processId) {
      try {
        process.kill(mcpProcess.processId, 'SIGTERM');
      } catch {
      }
      this.mcpProcesses.delete(mcpId);
    }

    this.db.prepare(
      `UPDATE mcp_installed SET server_status = 'stopped', updated_at = ? WHERE id = ?`
    ).run(new Date().toISOString(), mcpId);

    // Unregister MCP tools
    const tools = JSON.parse(installed.tools as string) as McpTool[];
    for (const tool of tools) {
      this.registry.delete(tool.name);
    }
  }

  getMcpServerStatus(mcpId: string): string {
    const installed = this.db.prepare(
      `SELECT server_status FROM mcp_installed WHERE id = ?`
    ).get(mcpId) as { server_status: string } | undefined;

    return installed?.server_status || 'not_installed';
  }
}