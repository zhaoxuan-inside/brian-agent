import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { VectorDBComponent } from '../../components/VectorDB/VectorDBComponent';
import { VectorDBSchemaInitializer } from '../infrastructure/VectorDBSchemaInitializer';
import { VectorDBService } from '../application/VectorDBService';
import { VECTORDB_CONFIG_TABLE } from '../domain/types';
import {
  VectorContext,
  AddVectorInput,
  AddVectorOutput,
  DelVectorInput,
  DelVectorOutput,
  DelVectorByFilterInput,
  DelVectorByFilterOutput,
  SoVectorInput,
  SoVectorOutput,
  GetVectorInput,
  GetVectorOutput,
  CountVectorInput,
  CountVectorOutput,
  VisualizedVectorInput,
  VisualizedVectorOutput,
  EnableVectorDBInput,
  EnableVectorDBOutput,
  CloseVectorDBInput,
  CloseVectorDBOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

const DEFAULT_DIMENSION = 1536;

const DEFAULT_METRIC = 'cosine';

export interface VectorDBAccessOptions {
  
  lancePath: string;
  
  dimension?: number;
  
  metric?: string;
  
  logger?: Logger;
}

export class VectorDBAccess {
  private readonly service: VectorDBService;

  private readonly vectorDb: VectorDBComponent;

  private readonly schemaInitializer: VectorDBSchemaInitializer;

  private readonly relationDb: RelationDBAccess;

  private dimension: number;

  private metric: string;

  

  constructor(
    relationDb: RelationDBAccess,
    options: VectorDBAccessOptions,
  ) {
    this.relationDb = relationDb;
    this.dimension = options.dimension ?? DEFAULT_DIMENSION;
    this.metric = options.metric ?? DEFAULT_METRIC;

    this.vectorDb = new VectorDBComponent(options.lancePath);

    this.schemaInitializer = new VectorDBSchemaInitializer(relationDb, this.vectorDb);

    const rawService = new VectorDBService(this.vectorDb, relationDb);
    this.service = AopProxy.wrap(rawService, { logger: options.logger });
  }

  

  async initialize(dimension?: number): Promise<void> {
    
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${VECTORDB_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);

    
    await this.service.initializeConfig();

    
    const storedMetric = this.service.getStoredMetric();
    if (storedMetric) {
      this.metric = storedMetric;
    }

    
    if (dimension !== undefined && dimension > 0) {
      this.dimension = dimension;
    }

    
    await this.vectorDb.init(this.dimension, this.metric);
  }

  
  async soVectorCount(): Promise<number> {
    return this.vectorDb.count();
  }

  
  getMetric(): string {
    return this.vectorDb.getMetric();
  }

  
  getDimension(): number {
    return this.vectorDb.getDimension();
  }

  

  async applyDimension(dimension: number): Promise<void> {
    if (!Number.isInteger(dimension) || dimension <= 0) {
      throw new Error('向量维度必须是正整数');
    }
    const count = await this.vectorDb.count();
    if (count > 0) {
      throw new Error(`已存在 ${count} 条向量数据，写入数据后不支持更改向量维度。如需更改请先删除所有向量数据。`);
    }
    this.dimension = dimension;
    await this.vectorDb.recreate(dimension, this.metric);
  }

  

  async applyMetric(metric: string): Promise<void> {
    const map: Record<string, string> = { COSINE: 'cosine', L2: 'euclidean', IP: 'dot' };
    const normalized = map[String(metric).toUpperCase()] || String(metric).toLowerCase();
    const count = await this.vectorDb.count();
    if (count > 0) {
      throw new Error(`已存在 ${count} 条向量数据，写入数据后不支持更改距离度量方式。如需更改请先删除所有向量数据。`);
    }
    this.metric = normalized;
    this.vectorDb.setMetric(normalized);
  }

  
  async addVector(input: AddVectorInput, output: AddVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addVector(input, output, context, metrics, report);
  }

  
  async delVector(input: DelVectorInput, output: DelVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delVector(input, output, context, metrics, report);
  }

  
  async delVectorByFilter(input: DelVectorByFilterInput, output: DelVectorByFilterOutput, context: VectorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delVectorByFilter(input, output, context, metrics, report);
  }

  
  async soVector(input: SoVectorInput, output: SoVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soVector(input, output, context, metrics, report);
  }

  
  async soVectorById(input: GetVectorInput, output: GetVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soVectorById(input, output, context, metrics, report);
  }

  
  async countVector(input: CountVectorInput, output: CountVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.countVector(input, output, context, metrics, report);
  }

  
  async visualizedVector(input: VisualizedVectorInput, output: VisualizedVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.visualizedVector(input, output, context, metrics, report);
  }

  
  async enableVectorDB(input: EnableVectorDBInput, output: EnableVectorDBOutput, context: VectorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableVectorDB(input, output, context, metrics, report);
  }

  
  async closeVectorDB(input: CloseVectorDBInput, output: CloseVectorDBOutput, context: VectorContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.closeVectorDB(input, output, context, metrics, report);
  }
}
