import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.coerce.number().default(8000),
  host: z.string().default('127.0.0.1'),
  dataDir: z.string().default('./data'),
  dbPath: z.string().default('./data/brian.db'),
  graphDbPath: z.string().default('./data/graph'),
  vectorDbPath: z.string().default('./data/vectors'),
  configFilePath: z.string().default('./data/model-config.json'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  corsOrigin: z.string().default('http://localhost:5173'),
});

export const config = ConfigSchema.parse({
  port: process.env.BRIAN_PORT,
  host: process.env.BRIAN_HOST,
  dataDir: process.env.BRIAN_DATA_DIR,
  dbPath: process.env.BRIAN_DB_PATH,
  graphDbPath: process.env.BRIAN_GRAPH_DB_PATH,
  vectorDbPath: process.env.BRIAN_VECTOR_DB_PATH,
  configFilePath: process.env.BRIAN_CONFIG_FILE_PATH,
  logLevel: process.env.BRIAN_LOG_LEVEL,
  corsOrigin: process.env.BRIAN_CORS_ORIGIN,
});

export type Config = z.infer<typeof ConfigSchema>;
