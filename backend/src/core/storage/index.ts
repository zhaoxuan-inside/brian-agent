import { SQLiteStorage } from './sqlite';
import { VectorStorage } from './vector';
import { TinyGraphDbStorage } from './tinyGraphDb';
import { MemoryGraphStorage } from './memoryGraph';
import { GraphStorage } from './graph';
import { TimeSeriesStorage } from './timeseries';
import type { IGraphStorage } from './graphInterface';
import { logger } from '../../infrastructure/logger';

export class StorageService {
  sqlite: SQLiteStorage;
  vector: VectorStorage;
  graph: IGraphStorage;
  timeSeries: TimeSeriesStorage;

  constructor() {
    this.sqlite = new SQLiteStorage();
    this.vector = new VectorStorage();
    this.graph = this.initializeGraphStorage();
    this.timeSeries = new TimeSeriesStorage();
  }

  private initializeGraphStorage(): IGraphStorage {
    if (process.env.BRIAN_USE_SQLITE_GRAPH === 'true') {
      logger.info('StorageService', 'Using SQLite for graph storage');
      return new GraphStorage();
    }

    if (process.env.BRIAN_USE_MEMORY_GRAPH === 'true') {
      logger.info('StorageService', 'Using MemoryGraph for graph storage');
      return new MemoryGraphStorage();
    }

    logger.info('StorageService', 'Using TinyGraphDB as graph storage');
    return new TinyGraphDbStorage(process.env.BRIAN_GRAPH_DB_PATH || './data/graph');
  }

  async close(): Promise<void> {
    await this.graph.close();
  }
}