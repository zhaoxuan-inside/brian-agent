import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Isolate each test with a fresh module cache
// Config module uses a singleton, so we need to clear the module cache

const originalEnv = { ...process.env };

describe('Config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-config-'));
    // Reset env vars to known state
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('BRIAN_')) {
        delete process.env[key];
      }
    }
    // Clear the module cache so config is reloaded fresh
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
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

  async function loadConfig() {
    const { getConfig } = await import('../../src/infrastructure/config');
    return getConfig();
  }

  it('should return default port', async () => {
    const config = await loadConfig();
    expect(config.port).toBe(8000);
  });

  it('should return default host', async () => {
    const config = await loadConfig();
    expect(config.host).toBe('127.0.0.1');
  });

  it('should return default dataDir', async () => {
    const config = await loadConfig();
    expect(config.dataDir).toBe('./data');
  });

  it('should return default logLevel', async () => {
    const config = await loadConfig();
    expect(config.logLevel).toBe('info');
  });

  it('should return default corsOrigin', async () => {
    const config = await loadConfig();
    expect(config.corsOrigin).toBe('http://localhost:5173');
  });

  it('should return default cacheMaxSize', async () => {
    const config = await loadConfig();
    expect(config.cacheMaxSize).toBe(1000);
  });

  it('should return default cacheTTL', async () => {
    const config = await loadConfig();
    expect(config.cacheTTL).toBe(60000);
  });

  it('should override port via BRIAN_PORT env var', async () => {
    process.env.BRIAN_PORT = '3000';
    const config = await loadConfig();
    expect(config.port).toBe(3000);
  });

  it('should override host via BRIAN_HOST env var', async () => {
    process.env.BRIAN_HOST = '0.0.0.0';
    const config = await loadConfig();
    expect(config.host).toBe('0.0.0.0');
  });

  it('should override logLevel via BRIAN_LOG_LEVEL', async () => {
    process.env.BRIAN_LOG_LEVEL = 'debug';
    const config = await loadConfig();
    expect(config.logLevel).toBe('debug');
  });

  it('should override logLevel via BRIAN_LOG_LEVEL for warn', async () => {
    process.env.BRIAN_LOG_LEVEL = 'warn';
    const config = await loadConfig();
    expect(config.logLevel).toBe('warn');
  });

  it('should override logLevel via BRIAN_LOG_LEVEL for error', async () => {
    process.env.BRIAN_LOG_LEVEL = 'error';
    const config = await loadConfig();
    expect(config.logLevel).toBe('error');
  });

  it('should override corsOrigin via BRIAN_CORS_ORIGIN', async () => {
    process.env.BRIAN_CORS_ORIGIN = 'http://localhost:3000';
    const config = await loadConfig();
    expect(config.corsOrigin).toBe('http://localhost:3000');
  });

  it('should override dataDir via BRIAN_DATA_DIR', async () => {
    process.env.BRIAN_DATA_DIR = tempDir;
    const config = await loadConfig();
    expect(config.dataDir).toBe(tempDir);
  });

  it('should override authEnabled via BRIAN_AUTH_ENABLED', async () => {
    process.env.BRIAN_AUTH_ENABLED = 'true';
    const config = await loadConfig();
    expect(config.authEnabled).toBe(true);
  });

  it('should override cacheMaxSize via BRIAN_CACHE_MAX_SIZE', async () => {
    process.env.BRIAN_CACHE_MAX_SIZE = '500';
    const config = await loadConfig();
    expect(config.cacheMaxSize).toBe(500);
  });

  it('should override cacheTTL via BRIAN_CACHE_TTL', async () => {
    process.env.BRIAN_CACHE_TTL = '30000';
    const config = await loadConfig();
    expect(config.cacheTTL).toBe(30000);
  });

  it('should have default llm config', async () => {
    const config = await loadConfig();
    expect(config.llm.defaultProvider).toBe('openai');
    expect(config.llm.defaultModel).toBe('gpt-4o');
    expect(config.llm.temperature).toBe(0.7);
    expect(config.llm.maxTokens).toBe(4096);
    expect(config.llm.timeout).toBe(60000);
  });

  it('should have default memory config', async () => {
    const config = await loadConfig();
    expect(config.memory.maxNodes).toBe(10000);
    expect(config.memory.maxEdges).toBe(50000);
    expect(config.memory.decayIntervalMs).toBe(3600000);
    expect(config.memory.consolidationThreshold).toBe(100);
    expect(config.memory.workingMemorySize).toBe(50);
  });

  it('should have default agent config', async () => {
    const config = await loadConfig();
    expect(config.agent.maxIterations).toBe(10);
    expect(config.agent.maxSubAgents).toBe(5);
    expect(config.agent.defaultStrategy).toBe('react');
    expect(config.agent.qualityThreshold).toBe(0.7);
    expect(config.agent.timeout).toBe(300000);
  });

  it('should have default rateLimits config', async () => {
    const config = await loadConfig();
    expect(config.rateLimits.daily).toBe(100000);
    expect(config.rateLimits.weekly).toBe(500000);
    expect(config.rateLimits.monthly).toBe(2000000);
  });

  it('should load config from file', async () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      port: 9090,
      host: '0.0.0.0',
      logLevel: 'debug',
    }));
    process.env.BRIAN_CONFIG_FILE_PATH = configPath;
    const config = await loadConfig();
    expect(config.port).toBe(9090);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('debug');
  });

  it('should reloadConfig and update values', async () => {
    const { getConfig, reloadConfig } = await import('../../src/infrastructure/config');
    const config1 = getConfig();
    const oldPort = config1.port;

    process.env.BRIAN_PORT = String(oldPort === 3000 ? 3001 : 3000);
    const config2 = reloadConfig();
    expect(config2.port).not.toBe(oldPort);
    expect(config2.port).toBe(Number(process.env.BRIAN_PORT));
  });

  it('should watchConfig call callback on reload', async () => {
    const { reloadConfig, watchConfig } = await import('../../src/infrastructure/config');
    const calls: any[] = [];
    const unwatch = watchConfig((c) => calls.push(c.port));
    expect(calls.length).toBe(0);

    process.env.BRIAN_PORT = '5555';
    reloadConfig();
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe(5555);

    unwatch();
    process.env.BRIAN_PORT = '6666';
    reloadConfig();
    expect(calls.length).toBe(1); // No more calls after unwatch
  });

  it('should accept valid port number', async () => {
    process.env.BRIAN_PORT = '1234';
    const config = await loadConfig();
    expect(config.port).toBe(1234);
    expect(typeof config.port).toBe('number');
  });

  it('should accept negative port number (zod coerce)', async () => {
    process.env.BRIAN_PORT = '-1';
    const config = await loadConfig();
    expect(config.port).toBe(-1);
  });

  it('should fallback to default on invalid logLevel', async () => {
    process.env.BRIAN_LOG_LEVEL = 'invalid_level';
    const config = await loadConfig();
    // Zod schema validation should fail and fallback to defaults
    expect(config.logLevel).toBe('info');
  });
});