import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { VectorDBComponent } from '../../components/VectorDB/VectorDBComponent';
import { ConfigService, ValueType } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  DatabaseError,
} from '../../shared/errors';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator } from '../../shared/query';
import {
  VECTORDB_CONFIG_TABLE,
} from '../domain/types';
import type {
  VectorContext,
  VectorObject,
  VectorRecord,
  VectorFilter,
  VectorSearchResult,
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

export class VectorDBService {

  private enabled = true;

  private closed = false;

  private readonly config: ConfigService;

  constructor(
    private readonly vectorDb: VectorDBComponent,
    private readonly relationDb: RelationDBAccess,
  ) {
    this.config = new ConfigService(relationDb, VECTORDB_CONFIG_TABLE);
  }

  async initializeConfig(): Promise<void> {
    await this.config.initDefaults([
      {
        config_key: 'enabled',
        config_value: 'true',
        value_type: ValueType.BOOLEAN,
        description: '向量数据库是否启用（enableVectorDB 读写）',
      },
      {
        config_key: 'default_top_k',
        config_value: '10',
        value_type: ValueType.INT,
        description: '相似度搜索默认返回条数（top_k 未显式指定时使用）',
      },
      {
        config_key: 'default_similarity_threshold',
        config_value: '0',
        value_type: ValueType.DOUBLE,
        description: '相似度搜索默认阈值（0-100 归一化分数）',
      },
      {
        config_key: 'default_distance_metric',
        config_value: 'COSINE',
        value_type: ValueType.STRING,
        description: '默认距离度量方式（COSINE / L2 / IP）',
      },
    ]);

    this.enabled = await this.config.getBoolean('enabled', true);
  }

  async initialize(): Promise<void> {
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  getStoredMetric(): string | null {
    try {
      const val = this.relationDb.queryRaw<{ config_value: string }>(
        `SELECT "config_value" FROM "${VECTORDB_CONFIG_TABLE}" WHERE "config_key" = 'default_distance_metric'`,
        [],
      );
      if (val.length > 0 && val[0].config_value) {
        const raw = val[0].config_value.toUpperCase();
        const map: Record<string, string> = { COSINE: 'cosine', L2: 'euclidean', IP: 'dot' };
        return map[raw] || raw.toLowerCase();
      }
    } catch {  }
    return null;
  }

  private ensureEnabled(): void {
    if (this.closed) {
      throw new DatabaseError(
        '向量数据库已关闭（closeVectorDB 为终态操作），需重新初始化组件',
      );
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('VectorDB');
    }
  }

  private validateVector(vec: VectorObject): void {
    if (!vec.content) {
      throw new ValidationError('content 不能为空');
    }
    if (
      !vec.embedding ||
      !Array.isArray(vec.embedding) ||
      vec.embedding.length === 0
    ) {
      throw new ValidationError('embedding 不能为空');
    }
  }

  async addVector(input: AddVectorInput, output: AddVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.vectors || input.vectors.length === 0) {
      throw new ValidationError('vectors 不能为空');
    }

    const ids: string[] = [];
    const now = IdGenerator.now();

    for (const vec of input.vectors) {
      this.validateVector(vec);

      const id = vec.id || IdGenerator.generate();
      ids.push(id);

      await this.vectorDb.upsert({
        id,
        content: vec.content,
        embedding: vec.embedding,
        user_id: vec.user_id ?? null,
        metadata: vec.metadata ?? null,
        created: now,
        updated: now,
      });
    }

    output.ids = ids;
    return true;
  }

  async delVector(input: DelVectorInput, output: DelVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids || input.ids.length === 0) {
      throw new ValidationError('ids 不能为空');
    }

    const affected = await this.vectorDb.deleteMany(input.ids);
    output.affected_rows = affected;
    return true;
  }

  async delVectorByFilter(input: DelVectorByFilterInput, output: DelVectorByFilterOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.filters || input.filters.length === 0) {
      throw new ValidationError('filters 不能为空');
    }

    const affected = await this.vectorDb.deleteByFilter(input.filters);
    output.affected_rows = affected;
    return true;
  }

  async soVector(input: SoVectorInput, output: SoVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const param = input.query_param;
    if (
      !param.embedding ||
      !Array.isArray(param.embedding) ||
      param.embedding.length === 0
    ) {
      throw new ValidationError('query_param.embedding 不能为空');
    }

    const topK =
      param.top_k ?? (await this.config.getInt('default_top_k', 10));
    const normalizedThreshold =
      param.similarity_threshold ??
      (await this.config.getDouble('default_similarity_threshold', 0));

    const rawThreshold = VectorDBComponent.normalizedThresholdToRaw(
      normalizedThreshold,
      this.vectorDb.getMetric(),
      this.vectorDb.getDimension(),
    );

    const filters: VectorFilter[] = [];
    if (param.filters) {
      filters.push(...param.filters);
    }
    if (param.user_id) {
      filters.push({
        field: 'user_id',
        operator: Operator.EQ,
        value: param.user_id,
      });
    }

    const hits = await this.vectorDb.search(
      param.embedding,
      topK,
      rawThreshold,
      filters.length > 0 ? filters : undefined,
    );

    const results: VectorSearchResult[] = hits.map((h) => ({
      id: h.id,
      content: h.content,
      score: h.similarity,
      user_id: h.user_id,
      metadata: h.metadata,
    }));

    output.list = results;
    return true;
  }

  async soVectorById(input: GetVectorInput, output: GetVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const record = await this.vectorDb.get(input.id);
    output.vector = record as VectorRecord | null;
    return true;
  }

  async countVector(input: CountVectorInput, output: CountVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    const count = await this.vectorDb.count(
      input.filters && input.filters.length > 0 ? input.filters : undefined,
    );
    output.count = count;
    return true;
  }

  async visualizedVector(input: VisualizedVectorInput, output: VisualizedVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const scope = String(input.scope);

    if (scope === 'health') {
      const start = Date.now();

      await this.vectorDb.count();
      output.data = {
        connected: true,
        response_time_ms: Date.now() - start,
        enabled: this.enabled,
      };
    } else if (scope === 'volume') {
      const total = await this.vectorDb.count();
      output.data = {
        total_vectors: total,
        collection: this.vectorDb.getTableName(),
        dimension: this.vectorDb.getDimension(),
      };
    } else if (scope === 'diskUsage') {

      const pageSizes = this.relationDb.queryRaw<{ page_size: number }>(
        'PRAGMA page_size',
      );
      const pageCounts = this.relationDb.queryRaw<{ page_count: number }>(
        'PRAGMA page_count',
      );
      const pageSize =
        pageSizes.length > 0 ? Number(pageSizes[0].page_size) : 0;
      const pageCount =
        pageCounts.length > 0 ? Number(pageCounts[0].page_count) : 0;
      output.data = {
        disk_usage_bytes: pageSize * pageCount,
        page_size: pageSize,
        page_count: pageCount,
        vector_db_usage_bytes: this.vectorDb.getDiskUsage(),
      };
    } else {
      output.error = `未知的可视化范围: ${scope}`;
      output.error_code = 'INVALID_SCOPE';
      return false;
    }
    return true;
  }

  async enableVectorDB(input: EnableVectorDBInput, _output: EnableVectorDBOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (this.closed) {
      throw new DatabaseError(
        '向量数据库已关闭（closeVectorDB 为终态操作），需重新初始化组件',
      );
    }
    this.enabled = input.enable;
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      '向量数据库是否启用（enableVectorDB 读写）',
    );
    return true;
  }

  async closeVectorDB(_input: CloseVectorDBInput, _output: CloseVectorDBOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    this.vectorDb.close();
    return true;
  }
}
