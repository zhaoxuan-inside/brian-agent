import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const ConfigSchema = z.object({
  port: z.coerce.number().default(8000),
  host: z.string().default('127.0.0.1'),
  dataDir: z.string().default('./data'),
  dbPath: z.string().default('./data/brian.db'),
  graphDbPath: z.string().default('./data/graph'),
  vectorDbPath: z.string().default('./data/vectors'),
  configFilePath: z.string().default('./data/model-config.json'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logDir: z.string().default('./data/logs'),
  corsOrigin: z.string().default('http://localhost:5173'),
  sessionSecret: z.string().default('brian-agent-session-secret-change-me'),
  authEnabled: z.coerce.boolean().default(false),
  cacheMaxSize: z.coerce.number().default(1000),
  cacheTTL: z.coerce.number().default(60000),
  llm: z.object({
    defaultProvider: z.string().default('openai'),
    defaultModel: z.string().default('gpt-4o'),
    temperature: z.coerce.number().default(0.7),
    maxTokens: z.coerce.number().default(4096),
    timeout: z.coerce.number().default(60000),
  }).default({}),
  memory: z.object({
    maxNodes: z.coerce.number().default(10000),
    maxEdges: z.coerce.number().default(50000),
    decayIntervalMs: z.coerce.number().default(3600000),
    consolidationThreshold: z.coerce.number().default(100),
    workingMemorySize: z.coerce.number().default(50),
  }).default({}),
  agent: z.object({
    maxIterations: z.coerce.number().default(10),
    maxSubAgents: z.coerce.number().default(5),
    defaultStrategy: z.enum(['react', 'plan-execute', 'cot', 'conditional-graph', 'hybrid']).default('react'),
    qualityThreshold: z.coerce.number().default(0.7),
    timeout: z.coerce.number().default(300000),
  }).default({}),
  rateLimits: z.object({
    daily: z.coerce.number().default(100000),
    weekly: z.coerce.number().default(500000),
    monthly: z.coerce.number().default(2000000),
    dailyCalls: z.coerce.number().default(1000),
    weeklyCalls: z.coerce.number().default(5000),
    monthlyCalls: z.coerce.number().default(20000),
  }).default({}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

function loadConfigFile(filePath: string): Partial<Record<string, unknown>> {
  const resolved = path.resolve(filePath);
  if (fs.existsSync(resolved)) {
    try {
      const raw = fs.readFileSync(resolved, 'utf-8');
      return JSON.parse(raw);
    } catch {
      console.warn(`Failed to parse config file at ${resolved}, using defaults`);
    }
  }
  return {};
}

function envOverrides(): Partial<Record<string, unknown>> {
  const overrides: Record<string, unknown> = {};
  const envMap: Record<string, string> = {
    BRIAN_PORT: 'port',
    BRIAN_HOST: 'host',
    BRIAN_DATA_DIR: 'dataDir',
    BRIAN_DB_PATH: 'dbPath',
    BRIAN_GRAPH_DB_PATH: 'graphDbPath',
    BRIAN_VECTOR_DB_PATH: 'vectorDbPath',
    BRIAN_CONFIG_FILE_PATH: 'configFilePath',
    BRIAN_LOG_LEVEL: 'logLevel',
    BRIAN_LOG_DIR: 'logDir',
    BRIAN_CORS_ORIGIN: 'corsOrigin',
    BRIAN_SESSION_SECRET: 'sessionSecret',
    BRIAN_AUTH_ENABLED: 'authEnabled',
    BRIAN_CACHE_MAX_SIZE: 'cacheMaxSize',
    BRIAN_CACHE_TTL: 'cacheTTL',
    BRIAN_LLM_DEFAULT_PROVIDER: 'llm.defaultProvider',
    BRIAN_LLM_DEFAULT_MODEL: 'llm.defaultModel',
    BRIAN_LLM_TEMPERATURE: 'llm.temperature',
    BRIAN_LLM_MAX_TOKENS: 'llm.maxTokens',
    BRIAN_LLM_TIMEOUT: 'llm.timeout',
    BRIAN_MEMORY_MAX_NODES: 'memory.maxNodes',
    BRIAN_MEMORY_MAX_EDGES: 'memory.maxEdges',
    BRIAN_MEMORY_DECAY_INTERVAL: 'memory.decayIntervalMs',
    BRIAN_MEMORY_CONSOLIDATION_THRESHOLD: 'memory.consolidationThreshold',
    BRIAN_MEMORY_WORKING_SIZE: 'memory.workingMemorySize',
    BRIAN_AGENT_MAX_ITERATIONS: 'agent.maxIterations',
    BRIAN_AGENT_MAX_SUB_AGENTS: 'agent.maxSubAgents',
    BRIAN_AGENT_DEFAULT_STRATEGY: 'agent.defaultStrategy',
    BRIAN_AGENT_QUALITY_THRESHOLD: 'agent.qualityThreshold',
    BRIAN_AGENT_TIMEOUT: 'agent.timeout',
    BRIAN_RATE_LIMIT_DAILY: 'rateLimits.daily',
    BRIAN_RATE_LIMIT_WEEKLY: 'rateLimits.weekly',
    BRIAN_RATE_LIMIT_MONTHLY: 'rateLimits.monthly',
  };

  const booleanKeys = new Set(['authEnabled']);

  for (const [envKey, configKey] of Object.entries(envMap)) {
    const val = process.env[envKey];
    if (val !== undefined) {
      let finalVal: unknown = val;
      const keys = configKey.split('.');
      const lastKey = keys[keys.length - 1];
      if (booleanKeys.has(lastKey)) {
        finalVal = val.toLowerCase() === 'true';
      }

      if (keys.length === 1) {
        overrides[keys[0]] = finalVal;
      } else {
        if (!overrides[keys[0]]) overrides[keys[0]] = {};
        (overrides[keys[0]] as Record<string, unknown>)[keys[1]] = finalVal;
      }
    }
  }
  return overrides;
}

function loadConfig(): AppConfig {
  const configFile = process.env.BRIAN_CONFIG_FILE_PATH || './data/config.json';
  const fileConfig = loadConfigFile(configFile);
  const envConfig = envOverrides();

  const rawConfig = {
    ...envConfig,
    ...fileConfig,
    llm: {
      ...(envConfig.llm as Record<string, unknown> || {}),
      ...(fileConfig.llm as Record<string, unknown> || {}),
    },
    memory: {
      ...(envConfig.memory as Record<string, unknown> || {}),
      ...(fileConfig.memory as Record<string, unknown> || {}),
    },
    agent: {
      ...(envConfig.agent as Record<string, unknown> || {}),
      ...(fileConfig.agent as Record<string, unknown> || {}),
    },
    rateLimits: {
      ...(envConfig.rateLimits as Record<string, unknown> || {}),
      ...(fileConfig.rateLimits as Record<string, unknown> || {}),
    },
  };

  const result = ConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    console.error('Config validation failed:', result.error.format());
    console.warn('Falling back to default config');
    return ConfigSchema.parse({});
  }
  return result.data;
}

let config: AppConfig = loadConfig();
let watchers: ((newConfig: AppConfig) => void)[] = [];

export function getConfig(): AppConfig {
  return loadConfig();
}

export function reloadConfig(): AppConfig {
  config = loadConfig();
  for (const watcher of watchers) {
    try {
      watcher(config);
    } catch (e) {
      console.error('Config watcher error:', e);
    }
  }
  return config;
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const merged = { ...current, ...partial };

  // Deep merge nested objects
  if (partial.llm) merged.llm = { ...current.llm, ...partial.llm };
  if (partial.memory) merged.memory = { ...current.memory, ...partial.memory };
  if (partial.agent) merged.agent = { ...current.agent, ...partial.agent };
  if (partial.rateLimits) merged.rateLimits = { ...current.rateLimits, ...partial.rateLimits };

  const configFile = process.env.BRIAN_CONFIG_FILE_PATH || './data/config.json';
  const resolved = path.resolve(configFile);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolved, JSON.stringify(merged, null, 2), 'utf-8');

  config = merged;
  for (const watcher of watchers) {
    try {
      watcher(config);
    } catch (e) {
      console.error('Config watcher error:', e);
    }
  }
  return config;
}

export function watchConfig(callback: (newConfig: AppConfig) => void): () => void {
  watchers.push(callback);
  return () => {
    watchers = watchers.filter(w => w !== callback);
  };
}

export function watchConfigFile(): void {
  const configFile = process.env.BRIAN_CONFIG_FILE_PATH || './data/config.json';
  const resolved = path.resolve(configFile);
  const dir = path.dirname(resolved);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const watcher = fs.watch(resolved, { persistent: false }, (eventType) => {
      if (eventType === 'change') {
        setTimeout(() => {
          reloadConfig();
        }, 100);
      }
    });
    watcher.unref();
  } catch {
    // File doesn't exist yet, watch the directory
    try {
      const dirWatcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
        if (filename === path.basename(resolved) && eventType === 'change') {
          setTimeout(() => {
            reloadConfig();
          }, 100);
        }
      });
      dirWatcher.unref();
    } catch {
      // Silently ignore watch failures
    }
  }
}