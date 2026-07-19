import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolService } from '../../src/core/tools';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ToolService', () => {
  let tools: ToolService;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-tools-'));
    originalEnv = { ...process.env };
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    vi.resetModules();
    initDatabase();
    tools = new ToolService();
  });

  afterEach(() => {
    closeDatabase();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('BRIAN_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // --- Tool Registry ---
  it('should list all builtin tools', () => {
    const allTools = tools.list();
    expect(allTools.length).toBeGreaterThanOrEqual(6);
    const names = allTools.map(t => t.name);
    expect(names).toContain('file_read');
    expect(names).toContain('file_write');
    expect(names).toContain('file_list');
    expect(names).toContain('shell_exec');
    expect(names).toContain('web_fetch');
    expect(names).toContain('calculator');
  });

  it('should register custom tool', () => {
    const id = tools.register({
      name: 'custom_tool',
      description: 'A custom tool',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => 'custom result',
    });
    expect(id).toBeTruthy();

    const t = tools.get('custom_tool');
    expect(t).toBeDefined();
    expect(t!.name).toBe('custom_tool');
  });

  it('should unregister tool', () => {
    tools.register({
      name: 'temp_tool',
      description: 'Temporary',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => 'temp',
    });
    expect(tools.get('temp_tool')).toBeDefined();
    tools.unregister('temp_tool');
    expect(tools.get('temp_tool')).toBeUndefined();
  });

  it('should get tool by name', () => {
    const tool = tools.get('file_read');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('file_read');
    expect(tool!.description).toBeTruthy();
  });

  // --- File Read ---
  it('should execute file_read with real file', async () => {
    const testFile = path.join(tempDir, 'test.txt');
    fs.writeFileSync(testFile, 'line1\nline2\nline3');

    const result = await tools.execute('file_read', { file_path: testFile });
    expect(result).toContain('line1');
    expect(result).toContain('line2');
    expect(result).toContain('line3');
  });

  it('should execute file_read with offset and limit', async () => {
    const testFile = path.join(tempDir, 'test.txt');
    fs.writeFileSync(testFile, 'line1\nline2\nline3\nline4\nline5');

    const result = await tools.execute('file_read', { file_path: testFile, offset: 2, limit: 2 });
    expect(result).toContain('3: line3');
    expect(result).toContain('4: line4');
    expect(result).not.toContain('line1');
  });

  it('should execute file_read handle missing file', async () => {
    const result = await tools.execute('file_read', { file_path: '/nonexistent/file.txt' });
    expect(result).toContain('Error reading file');
  });

  // --- File Write ---
  it('should execute file_write and verify content', async () => {
    const testFile = path.join(tempDir, 'write-test.txt');
    const result = await tools.execute('file_write', { file_path: testFile, content: 'hello world' });

    expect(result).toContain('File written successfully');
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.readFileSync(testFile, 'utf-8')).toBe('hello world');
  });

  it('should execute file_write create directory if needed', async () => {
    const testFile = path.join(tempDir, 'subdir', 'nested', 'file.txt');
    const result = await tools.execute('file_write', { file_path: testFile, content: 'nested content' });

    expect(result).toContain('File written successfully');
    expect(fs.existsSync(testFile)).toBe(true);
  });

  // --- File List ---
  it('should execute file_list', async () => {
    fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
    fs.mkdirSync(path.join(tempDir, 'subdir'));

    const result = await tools.execute('file_list', { directory_path: tempDir });
    expect(result).toContain('a.txt');
    expect(result).toContain('b.txt');
    expect(result).toContain('subdir/');
  });

  it('should execute file_list recursive', async () => {
    const subDir = path.join(tempDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'nested.txt'), 'nested');

    const result = await tools.execute('file_list', { directory_path: tempDir, recursive: true });
    expect(result).toContain('nested.txt');
  });

  it('should execute file_list for missing directory', async () => {
    const result = await tools.execute('file_list', { directory_path: '/nonexistent' });
    expect(result).toContain('Directory not found');
  });

  // --- Calculator ---
  it('should execute calculator with valid expression', async () => {
    const result = await tools.execute('calculator', { expression: '2 + 3 * 4' });
    expect(result).toContain('Result: 14');
  });

  it('should execute calculator with complex expression', async () => {
    const result = await tools.execute('calculator', { expression: '(10 + 5) * 2' });
    expect(result).toContain('Result: 30');
  });

  it('should execute calculator with exponentiation', async () => {
    const result = await tools.execute('calculator', { expression: '2^10' });
    expect(result).toContain('Result: 1024');
  });

  it('should execute calculator reject unsafe expression', async () => {
    const result = await tools.execute('calculator', { expression: 'process.exit()' });
    expect(result).toContain('Error: Expression contains unsafe characters');
  });

  it('should execute calculator reject script injection', async () => {
    const result = await tools.execute('calculator', { expression: 'require("fs")' });
    expect(result).toContain('Error: Expression contains unsafe characters');
  });

  it('should execute calculator handle division by zero', async () => {
    const result = await tools.execute('calculator', { expression: '1/0' });
    expect(result).toContain('Result:');
  });

  // --- MCP Market ---
  it('should listMcpInstalled return empty initially', () => {
    const installed = tools.listMcpInstalled();
    expect(installed.installed).toEqual([]);
    expect(installed.total).toBe(0);
  });

  it('should getMcpMarket return all packages', async () => {
    const market = await tools.getMcpMarket();
    expect(market.length).toBeGreaterThanOrEqual(10);
  });

  it('should getMcpMarket filter by search', async () => {
    const market = await tools.getMcpMarket('github');
    expect(market.length).toBeGreaterThanOrEqual(1);
    expect(market.some(p => p.id === 'mcp-github')).toBe(true);
  });

  it('should getMcpMarket filter by category', async () => {
    const market = await tools.getMcpMarket(undefined, 'database');
    expect(market.length).toBeGreaterThanOrEqual(1);
    expect(market.some(p => p.id === 'mcp-postgres')).toBe(true);
  });

  it('should getMcpDetail return package', async () => {
    const pkg = await tools.getMcpDetail('mcp-filesystem');
    expect(pkg).toBeDefined();
    expect(pkg!.name).toBe('Filesystem');
    expect(pkg!.tools.length).toBeGreaterThan(0);
  });

  it('should getMcpDetail return undefined for unknown', async () => {
    const pkg = await tools.getMcpDetail('unknown-package');
    expect(pkg).toBeUndefined();
  });

  it('should install and list MCP', async () => {
    const result = await tools.installMcp('@modelcontextprotocol/server-filesystem', 'Filesystem');
    expect(result.id).toBeTruthy();

    const installed = tools.listMcpInstalled();
    expect(installed.installed.length).toBe(1);
    expect(installed.installed[0].packageName).toBe('@modelcontextprotocol/server-filesystem');

    await tools.uninstallMcp(result.id);
    expect(tools.listMcpInstalled().installed.length).toBe(0);
  });

  it('should getToolsForLLM return correct format', () => {
    const llmTools = tools.getToolsForLLM();
    expect(llmTools.length).toBeGreaterThan(0);
    expect(llmTools[0]).toHaveProperty('type');
    expect(llmTools[0]).toHaveProperty('function');
    expect(llmTools[0].function).toHaveProperty('name');
    expect(llmTools[0].function).toHaveProperty('description');
    expect(llmTools[0].function).toHaveProperty('parameters');
    expect(llmTools[0].type).toBe('function');
  });

  it('should execute throw for unknown tool', async () => {
    await expect(tools.execute('unknown_tool', {})).rejects.toThrow('not found in registry');
  });
});