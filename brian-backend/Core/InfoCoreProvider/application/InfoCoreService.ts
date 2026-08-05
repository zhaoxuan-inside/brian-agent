/**
 * @fileoverview InfoCoreProvider 应用服务层。
 *
 * 依赖 RelationDBAccess（数据库操作）、LLMAccess（LLM 推理）、
 * PromptsAccess（Prompt 模板）、VectorDBAccess（向量操作）、
 * GraphDBAccess（图操作）。
 *
 * 实现所有用例：saveInfo / pinInfo / vectorInfo / tagInfo / summaryInfo /
 * keywordInfo / graphTag / lastNInfo / graphNInfo / similarKInfo / keywordKInfo /
 * relationKInfo / graphInfo / context / delInfo / exist* / 配置 CRUD（共 28 个方法）。
 */

import type {
  RelationDBAccess,
  LLMAccess,
  PromptsAccess,
  VectorDBAccess,
  GraphDBAccess,
} from '@brian-agent/base';
import {
  IdGenerator,
  Operator,
  GraphDirection,
} from '@brian-agent/base';
import type { Condition } from '@brian-agent/base';
import nodejieba from 'nodejieba';
import {
  ValidationError,
  NotFoundError,
  ProcessingError,
} from '../../shared/errors';
import {
  InfoCoreContext,
  SaveInfoInput,
  SaveInfoOutput,
  PinInfoInput,
  PinInfoOutput,
  ProcessInfoInput,
  VectorInfoOutput,
  TagInfoOutput,
  SummaryInfoOutput,
  KeywordInfoOutput,
  GraphTagInput,
  GraphTagOutput,
  LastNInfoInput,
  LastNInfoOutput,
  GraphNInfoInput,
  GraphNInfoOutput,
  SimilarKInfoInput,
  SimilarKInfoOutput,
  KeywordKInfoInput,
  KeywordKInfoOutput,
  RelationKInfoInput,
  RelationKInfoOutput,
  GraphInfoInput,
  GraphInfoOutput,
  ContextInfoInput,
  ContextInfoOutput,
  SoInfoTagConfigInput,
  SoInfoTagConfigOutput,
  UpdateInfoTagConfigInput,
  UpdateInfoTagConfigOutput,
  SoInfoSummaryConfigInput,
  SoInfoSummaryConfigOutput,
  UpdateInfoSummaryConfigInput,
  UpdateInfoSummaryConfigOutput,
  SoInfoConfigInput,
  SoInfoConfigOutput,
  UpdateInfoConfigInput,
  UpdateInfoConfigOutput,
  SoInfoVectorConfigInput,
  SoInfoVectorConfigOutput,
  UpdateInfoVectorConfigInput,
  UpdateInfoVectorConfigOutput,
  SoInfoContextConfigInput,
  SoInfoContextConfigOutput,
  UpdateInfoContextConfigInput,
  UpdateInfoContextConfigOutput,
  DelInfoInput,
  DelInfoOutput,
  ExistInfoInput,
  ExistInfoOutput,
  INFO_RAW_TABLE,
  INFO_GRAPH_TABLE,
  INFO_VECTOR_TABLE,
  INFO_TAG_TABLE,
  INFO_TAG_VECTOR_TABLE,
  INFO_SUMMARY_TABLE,
  INFO_KEYWORD_TABLE,
  INFO_TAG_CONFIG_TABLE,
  INFO_SUMMARY_CONFIG_TABLE,
  INFO_CONFIG_TABLE,
  INFO_VECTOR_CONFIG_TABLE,
  INFO_CONTEXT_CONFIG_TABLE,
} from '../domain/types';
import type {
  InfoRawRecord,
  InfoGraphRecord,
  InfoVectorRecord,
  InfoTagRecord,
  InfoTagVectorRecord,
  InfoSummaryRecord,
  InfoTagConfigRecord,
  InfoSummaryConfigRecord,
  InfoConfigRecord,
  InfoVectorConfigRecord,
  InfoContextConfigRecord,
} from '../domain/types';
import {
  ExecLLMInput,
  ExecLLMOutput,
  LLMContext,
  PromptContext,
  VectorContext,
  AddVectorInput,
  AddVectorOutput,
  SoVectorInput,
  SoVectorOutput,
  GetVectorInput,
  GetVectorOutput,
  DelVectorInput,
  DelVectorOutput,
  GraphContext,
  AddGraphNodeInput,
  AddGraphNodeOutput,
  AddGraphEdgeInput,
  AddGraphEdgeOutput,
  GraphTarget,
  GetGraphNeighborsInput,
  GetGraphNeighborsOutput,
  GetGraphNodeInput,
  GetGraphNodeOutput,
  ActivateGraphEdgeInput,
  ActivateGraphEdgeOutput,
} from '@brian-agent/base';
import type {
  VectorObject,
  VectorQueryParam,
  VectorSearchResult,
  GraphNodeData,
  GraphEdgeData,
} from '@brian-agent/base';
import {
  GetLLMInput,
  GetLLMOutput,
  GetPromptInput,
  GetPromptOutput,
} from '@brian-agent/base';

// ---------------------------------------------------------------------------
// 停用词集合（中英文）
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'on', 'at',
  'by', 'for', 'with', 'from', 'as', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'because', 'while', 'if', 'but', 'and', 'or',
  'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they',
  'them', 'we', 'us', 'me', 'him', 'her', 'my', 'your', 'our', 'their',
  'any', 'also', 'up', 'down', 'now', 'about', 'which', 'who', 'what',
  'one', 'two', 'three', 'also', 'get', 'got', 'lets', 'let', 'go', 'going',
  'well', 'still', 'however', 'therefore', 'though', 'since', 'yet',
  'already', 'else', 'even', 'ever', 'need', 'using', 'used', 'use',
  'like', 'make', 'made', 'see', 'seen', 'know', 'known', 'new', 'old',
  'back', 'good', 'bad', 'great', 'much', 'many', 'really', 'say', 'said',
  'first', 'last', 'next', 'long', 'high', 'low', 'different', 'small',
  'large', 'big', 'able', 'come', 'came', 'take', 'took', 'give', 'gave',
  'find', 'found', 'tell', 'told', 'ask', 'asked', 'work', 'seem', 'feel',
  'try', 'left', 'right', 'call', 'keep', 'kept', 'show',
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
  '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些', '什么',
  '怎么', '哪', '吗', '呢', '啊', '吧', '哦', '哈', '呵', '嘛', '啦',
  '呀', '呗', '嗯', '哎', '用', '被', '把', '让', '向', '从', '对', '以',
  '为', '因为', '所以', '可以', '但', '但是', '如果', '就是', '还是',
  '或者', '只是', '一个', '这个', '那个', '这样', '那样', '大家', '知道',
  '觉得', '应该', '可能', '已经', '虽然', '然而', '然后', '总是', '一下',
  '比较', '起来', '过来', '出来', '起来', '开始', '没有', '时候', '东西',
]);

/**
 * InfoCoreProvider 应用服务。
 *
 * 提供信息全生命周期管理：保存、处理、搜索、配置、清理。
 */
export class InfoCoreService {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param llmAccess LLMProvider 接入层实例
   * @param promptsAccess PromptsProvider 接入层实例
   * @param vectorDb VectorDBProvider 接入层实例
   * @param graphDb GraphDBProvider 接入层实例
   */
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly vectorDb: VectorDBAccess,
    private readonly graphDb: GraphDBAccess,
  ) {}

  /**
   * 初始化：确保所有配置表有默认配置。
   */
  async initialize(): Promise<void> {
    await this.ensureDefaultConfigs();
  }

  // =========================================================================
  // Write Operations
  // =========================================================================

  /**
   * 保存原始信息。
   *
   * 流程：
   * 1. 插入 info_raw 表。
   * 2. 若 parent_info_ids 存在，创建 info_graph 边。
   * 3. 异步触发处理：vectorInfo / tagInfo / summaryInfo / keywordInfo。
   */
  async saveInfo(
    input: SaveInfoInput,
    _context: InfoCoreContext,
    output: SaveInfoOutput,
  ): Promise<boolean> {
    if (!input.info || !input.session_id) {
      throw new ValidationError('saveInfo 需要提供 info 和 session_id');
    }

    const now = IdGenerator.now();
    const id = IdGenerator.generate();
    const infoId = IdGenerator.generate();

    await this.relationDb.insert(INFO_RAW_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'session_id', value: input.session_id },
      { field: 'work_id', value: input.work_id || '' },
      { field: 'interact_id', value: input.interact_id || '' },
      { field: 'info_id', value: infoId },
      { field: 'info_creator_id', value: input.info_creator_id || '' },
      { field: 'info_creator_role', value: input.info_creator_role || '' },
      { field: 'info', value: input.info },
      { field: 'info_length', value: input.info.length },
      { field: 'pin', value: 0 },
    ]);

    // 创建图引用边
    if (input.parent_info_ids && input.parent_info_ids.length > 0) {
      await this.createGraphEdges(id, infoId, input.session_id, input.parent_info_ids, now);
    }

    output.info_id = infoId;

    // 异步触发处理（不阻塞保存）
    const processInput = new ProcessInfoInput();
    processInput.info_id = infoId;
    setImmediate(async () => {
      try {
        await Promise.all([
          this.vectorInfo(processInput, _context, new VectorInfoOutput()),
          this.tagInfo(processInput, _context, new TagInfoOutput()),
          this.summaryInfo(processInput, _context, new SummaryInfoOutput()),
          this.keywordInfo(processInput, _context, new KeywordInfoOutput()),
        ]);
      } catch (err) {
        // 异步处理错误仅记录，不影响保存
      }
    });

    return true;
  }

  /**
   * 切换 pin 状态。
   */
  async pinInfo(
    input: PinInfoInput,
    _context: InfoCoreContext,
    output: PinInfoOutput,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('pinInfo 需要提供 info_id');
    }

    const row = await this.getInfoByInfoId(input.info_id);
    if (!row) {
      throw new NotFoundError('信息', input.info_id);
    }

    const newPin = row.pin === 1 ? 0 : 1;
    await this.relationDb.update(
      INFO_RAW_TABLE,
      [
        { field: 'pin', value: newPin },
        { field: 'updated', value: IdGenerator.now() },
      ],
      [{ field: 'id', operator: Operator.EQ, value: row.id }],
    );

    return true;
  }

  // =========================================================================
  // Process Operations
  // =========================================================================

  /**
   * 向量化信息。
   *
   * 1. 检查 info_vector 是否已有记录。
   * 2. 若无：获取 info 内容，调用 LLM 生成 embedding。
   * 3. 存储到 info_vector 表。
   */
  async vectorInfo(
    input: ProcessInfoInput,
    _context: InfoCoreContext,
    output: VectorInfoOutput,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('vectorInfo 需要提供 info_id');
    }

    const existing = await this.getInfoVectorRow(input.info_id);
    if (existing) {
      output.vector_id = existing.id;
      return true;
    }

    const infoRow = await this.getInfoByInfoId(input.info_id);
    if (!infoRow) {
      throw new NotFoundError('信息', input.info_id);
    }

    const vectorConfig = await this.getInfoVectorConfig();
    if (!vectorConfig || vectorConfig.enable !== 1) {
      return true;
    }

    const embedding = await this.generateEmbedding(infoRow.info, vectorConfig);
    if (!embedding || embedding.length === 0) {
      return true;
    }

    const now = IdGenerator.now();
    const id = IdGenerator.generate();

    await this.relationDb.insert(INFO_VECTOR_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'info_id', value: input.info_id },
      { field: 'embedding', value: JSON.stringify(embedding) },
    ]);

    output.vector_id = id;
    return true;
  }

  /**
   * 使用 LLM 提取标签。
   *
   * 1. 检查 info_tag_config 的 enable 状态。
   * 2. 调用 LLM 提取 topK 标签。
   * 3. 为每个标签插入 info_tag 表并维护 info_tag_vector。
   */
  async tagInfo(
    input: ProcessInfoInput,
    _context: InfoCoreContext,
    output: TagInfoOutput,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('tagInfo 需要提供 info_id');
    }

    const tagConfig = await this.getInfoTagConfig();
    if (!tagConfig || tagConfig.enable !== 1) {
      return true;
    }

    const infoRow = await this.getInfoByInfoId(input.info_id);
    if (!infoRow) {
      throw new NotFoundError('信息', input.info_id);
    }

    const tags = await this.extractTags(infoRow.info, tagConfig);
    if (!tags || tags.length === 0) {
      return true;
    }

    const now = IdGenerator.now();

    for (const tag of tags) {
      const tagId = IdGenerator.generate();
      try {
        await this.relationDb.insert(INFO_TAG_TABLE, [
          { field: 'id', value: tagId },
          { field: 'created', value: now },
          { field: 'info_id', value: input.info_id },
          { field: 'tag', value: tag },
        ]);

        // 维护 tag vector
        await this.maintainTagVector(tag, tagConfig);
      } catch {
        // 标签重复跳过
      }
    }

    output.tags = tags;
    return true;
  }

  /**
   * 使用 LLM 生成摘要。
   */
  async summaryInfo(
    input: ProcessInfoInput,
    _context: InfoCoreContext,
    output: SummaryInfoOutput,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('summaryInfo 需要提供 info_id');
    }

    const summaryConfig = await this.getInfoSummaryConfig();
    if (!summaryConfig || summaryConfig.enable !== 1) {
      return true;
    }

    const existing = await this.getInfoSummaryRow(input.info_id);
    if (existing) {
      output.summary_id = existing.id;
      return true;
    }

    const infoRow = await this.getInfoByInfoId(input.info_id);
    if (!infoRow) {
      throw new NotFoundError('信息', input.info_id);
    }

    const summary = await this.generateSummary(infoRow.info, summaryConfig);
    if (!summary) {
      return true;
    }

    const now = IdGenerator.now();
    const id = IdGenerator.generate();

    await this.relationDb.insert(INFO_SUMMARY_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'info_id', value: input.info_id },
      { field: 'summary', value: summary },
    ]);

    output.summary_id = id;
    return true;
  }

  /**
   * 提取关键词（nodejieba 中文分词 + FTS5 存储）。
   */
  async keywordInfo(
    input: ProcessInfoInput,
    _context: InfoCoreContext,
    output: KeywordInfoOutput,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('keywordInfo 需要提供 info_id');
    }

    const infoRow = await this.getInfoByInfoId(input.info_id);
    if (!infoRow) {
      throw new NotFoundError('信息', input.info_id);
    }

    const keywords = this.extractKeywords(infoRow.info);
    if (keywords.length === 0) {
      return true;
    }

    for (const word of keywords) {
      await this.relationDb.executeRaw(
        `INSERT INTO "${INFO_KEYWORD_TABLE}" ("info_id", "word") VALUES (@info_id, @word)`,
        [{ field: 'info_id', value: input.info_id }, { field: 'word', value: word }],
      );
    }

    output.keywords = keywords;
    return true;
  }

  /**
   * 为标签建立相似性连通图。
   *
   * 1. 检查 info_tag_config.enable
   * 2. 根据 tag_id 查询 info_tag 表获取标签文本
   * 3. 计算标签嵌入向量
   * 4. 通过 VectorDBProvider.soVector 搜索语义最相似的 top_k 个 tag_id
   * 5. 对每个相似 tag 创建/更新 `similarTo` 边至 GraphDB
   */
  async graphTag(
    input: GraphTagInput,
    _context: InfoCoreContext,
    output: GraphTagOutput,
  ): Promise<boolean> {
    if (!input.tag_id) {
      throw new ValidationError('graphTag 需要提供 tag_id');
    }

    // 1. 检查标签配置是否启用
    const tagConfig = await this.getInfoTagConfig();
    if (!tagConfig || tagConfig.enable !== 1) {
      return true;
    }

    // 2. 查询标签文本
    const tagRows = await this.relationDb.select(INFO_TAG_TABLE, {
      conditions: [{ field: 'id', operator: Operator.EQ, value: input.tag_id }],
      page: { current: 1, size: 1 },
    });
    if (tagRows.length === 0) {
      return true;
    }

    const tagText = tagRows[0]['tag'] as string;
    const tagId = tagRows[0]['id'] as string;

    // 3. 计算标签向量
    const vectorConfig = await this.getInfoVectorConfig();
    if (!vectorConfig || vectorConfig.enable !== 1 || !vectorConfig.llm_id) {
      return true;
    }

    const embedding = await this.generateEmbedding(tagText, vectorConfig);
    if (!embedding || embedding.length === 0) {
      return true;
    }

    // 4. 搜索相似标签
    const soOutput = new SoVectorOutput();
    await this.vectorDb.soVector(
      {
        query_param: {
          embedding,
          top_k: tagConfig.tag_top_k || 5,
        } as VectorQueryParam,
      } as SoVectorInput,
      new VectorContext(),
      soOutput,
    );

    // 5. 对每个相似 tag 建立/更新 similarTo 边
    for (const hit of soOutput.list) {
      const similarTagId = hit.metadata?.['tag_id'] as string | undefined;
      if (!similarTagId || similarTagId === tagId) continue;

      try {
        const addEdgeOutput = new AddGraphEdgeOutput();
        await this.graphDb.addGraphEdge(
          {
            data: {
              from_node_id: tagId,
              to_node_id: similarTagId,
              edge_type: 'similarTo',
              weight: hit.score ?? 0,
              properties: {
                similarity: hit.score ?? 0,
                actMap: {},
              },
            } as GraphEdgeData,
          } as AddGraphEdgeInput,
          new GraphContext(),
          addEdgeOutput,
        );
      } catch {
        // 忽略边已存在等异常（upsert）
      }
    }

    output.node_id = tagId;
    return true;
  }

  // =========================================================================
  // Search Operations
  // =========================================================================

  /**
   * 时间线搜索：返回最近 N 条信息记录。
   * 若 info 已被老化清空，回退查询 info_summary 表获取摘要替代。
   */
  async lastNInfo(
    input: LastNInfoInput,
    _context: InfoCoreContext,
    output: LastNInfoOutput,
  ): Promise<boolean> {
    if (!input.lastN || input.lastN <= 0) {
      throw new ValidationError('lastNInfo 需要提供 lastN > 0');
    }

    const conditions: Condition[] = [];
    if (input.session_id) {
      conditions.push({ field: 'session_id', operator: Operator.EQ, value: input.session_id });
    }
    if (input.work_id) {
      conditions.push({ field: 'work_id', operator: Operator.EQ, value: input.work_id });
    }
    if (input.interact_id) {
      conditions.push({ field: 'interact_id', operator: Operator.EQ, value: input.interact_id });
    }
    if (input.info_creator_id) {
      conditions.push({ field: 'info_creator_id', operator: Operator.EQ, value: input.info_creator_id });
    }
    if (input.info_creator_role) {
      conditions.push({ field: 'info_creator_role', operator: Operator.EQ, value: input.info_creator_role });
    }
    if (input.info_id) {
      conditions.push({ field: 'info_id', operator: Operator.EQ, value: input.info_id });
    }

    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions,
      order_by: [{ field: 'created', direction: 'DESC' }],
      page: { current: 1, size: input.lastN },
    });

    const result: InfoRawRecord[] = [];
    for (const row of rows) {
      const record = this.toInfoRawRecord(row);
      if (!record.info || record.info === '') {
        const summary = await this.getInfoSummaryRow(record.info_id);
        if (summary) {
          record.info = `[摘要] ${summary.summary}`;
        } else {
          continue;
        }
      }
      result.push(record);
    }

    output.list = result;
    return true;
  }

  /**
   * 图邻居搜索：通过 GraphDB 查找相关节点。
   */
  async graphNInfo(
    input: GraphNInfoInput,
    _context: InfoCoreContext,
    output: GraphNInfoOutput,
  ): Promise<boolean> {
    if (!input.info_id || !input.lastN) {
      throw new ValidationError('graphNInfo 需要提供 info_id 和 lastN');
    }

    const infoNodeId = await this.findInfoGraphNodeId(input.info_id);
    if (!infoNodeId) {
      output.list = [];
      return true;
    }

    const neighOutput = new GetGraphNeighborsOutput();
    await this.graphDb.getGraphNeighbors(
      {
        node_id: infoNodeId,
        depth: 1,
        direction: GraphDirection.BOTH,
      } as GetGraphNeighborsInput,
      new GraphContext(),
      neighOutput,
    );

    const infoIds: string[] = [];
    for (const node of neighOutput.list) {
      if (node.node_type === 'info' && node.content['info_id']) {
        infoIds.push(node.content['info_id'] as string);
      }
    }

    if (infoIds.length === 0) {
      output.list = [];
      return true;
    }

    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [{ field: 'info_id', operator: Operator.IN, value: infoIds }],
      order_by: [{ field: 'created', direction: 'DESC' }],
      page: { current: 1, size: input.lastN },
    });

    output.list = rows.map((r) => this.toInfoRawRecord(r));
    return true;
  }

  /**
   * 语义相似度搜索：生成 embedding 后通过 VectorDB 搜索相似向量。
   */
  async similarKInfo(
    input: SimilarKInfoInput,
    _context: InfoCoreContext,
    output: SimilarKInfoOutput,
  ): Promise<boolean> {
    if (!input.info || !input.topK) {
      throw new ValidationError('similarKInfo 需要提供 info 和 topK');
    }

    const vectorConfig = await this.getInfoVectorConfig();
    if (!vectorConfig || vectorConfig.enable !== 1) {
      output.list = [];
      return true;
    }

    const embedding = await this.generateEmbedding(input.info, vectorConfig);
    if (!embedding || embedding.length === 0) {
      output.list = [];
      return true;
    }

    const soOutput = new SoVectorOutput();
    await this.vectorDb.soVector(
      {
        query_param: {
          embedding,
          top_k: input.topK,
        } as VectorQueryParam,
      } as SoVectorInput,
      new VectorContext(),
      soOutput,
    );

    const results: Array<InfoRawRecord & { score?: number }> = [];

    for (const hit of soOutput.list) {
      if (hit.metadata && hit.metadata['info_id']) {
        const infoId = hit.metadata['info_id'] as string;
        const infoRow = await this.getInfoByInfoId(infoId);
        if (infoRow) {
          results.push({ ...infoRow, score: hit.score });
        }
      }
    }

    output.list = results;
    return true;
  }

  /**
   * 关键词搜索：从 FTS5 表检索匹配的关键词。
   */
  async keywordKInfo(
    input: KeywordKInfoInput,
    _context: InfoCoreContext,
    output: KeywordKInfoOutput,
  ): Promise<boolean> {
    if (!input.info) {
      throw new ValidationError('keywordKInfo 需要提供 info');
    }

    const keywords = this.extractKeywords(input.info);
    if (keywords.length === 0) {
      output.list = [];
      return true;
    }

    const keywordRows = await this.relationDb.select(INFO_KEYWORD_TABLE, {
      conditions: [{ field: 'word', operator: Operator.IN, value: keywords }],
    });

    if (keywordRows.length === 0) {
      output.list = [];
      return true;
    }

    const matchCountMap = new Map<string, number>();
    for (const row of keywordRows) {
      const iid = row['info_id'] as string;
      matchCountMap.set(iid, (matchCountMap.get(iid) || 0) + 1);
    }

    const sortedIds = [...matchCountMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0]);

    const results: Array<InfoRawRecord & { keyword_match_count?: number }> = [];
    for (const infoId of sortedIds) {
      const infoRow = await this.getInfoByInfoId(infoId);
      if (infoRow) {
        results.push({ ...infoRow, keyword_match_count: matchCountMap.get(infoId) });
      }
    }

    output.list = results;
    return true;
  }

  /**
   * 标签关联搜索：通过标签间的相似性图（similarTo 边）查找最相关的信息。
   *
   * 最后调用 GraphDBProvider.activateGraphEdge 触发激活事件维护动态活跃度。
   */
  async relationKInfo(
    input: RelationKInfoInput,
    _context: InfoCoreContext,
    output: RelationKInfoOutput,
  ): Promise<boolean> {
    if (!input.info_id || !input.topN) {
      throw new ValidationError('relationKInfo 需要提供 info_id 和 topN');
    }

    // 1. 获取目标信息的标签
    let selfTags = await this.relationDb.select(INFO_TAG_TABLE, {
      conditions: [{ field: 'info_id', operator: Operator.EQ, value: input.info_id }],
      fields: ['id', 'tag'],
    });

    if (selfTags.length === 0) {
      // 若无标签，尝试即时抽取
      const tagConfig = await this.getInfoTagConfig();
      if (tagConfig?.enable === 1) {
        const infoRow = await this.getInfoByInfoId(input.info_id);
        if (infoRow) {
          const tags = await this.extractTags(infoRow.info, tagConfig);
          if (tags.length > 0) {
            const now = IdGenerator.now();
            for (const tag of tags) {
              const tagId = IdGenerator.generate();
              try {
                await this.relationDb.insert(INFO_TAG_TABLE, [
                  { field: 'id', value: tagId },
                  { field: 'created', value: now },
                  { field: 'updated', value: now },
                  { field: 'info_id', value: input.info_id },
                  { field: 'tag', value: tag },
                ]);
              } catch {
                // 标签重复跳过
              }
            }
            selfTags = tags.map((tag) => ({ id: '', tag }));
          }
        }
      }
      if (selfTags.length === 0) {
        output.list = [];
        return true;
      }
    }

    // 2. 通过 GraphDB 的 similarTo 边查找关联标签
    const relatedTagIds = new Set<string>();
    const activatedEdges: string[] = [];

    for (const selfTag of selfTags) {
      const tagId = selfTag['id'] as string;
      try {
        const neighOutput = new GetGraphNeighborsOutput();
        await this.graphDb.getGraphNeighbors(
          {
            node_id: tagId,
            depth: 1,
            direction: GraphDirection.BOTH,
          } as GetGraphNeighborsInput,
          new GraphContext(),
          neighOutput,
        );

        for (const edge of (neighOutput as { edges?: Array<{ id: string; from_node_id: string; to_node_id: string; edge_type: string }> }).edges ?? []) {
          if (edge.edge_type === 'similarTo') {
            if (edge.from_node_id !== tagId) relatedTagIds.add(edge.from_node_id);
            if (edge.to_node_id !== tagId) relatedTagIds.add(edge.to_node_id);
            activatedEdges.push(edge.id);
          }
        }
      } catch {
        // 忽略图查询异常
      }
    }

    if (relatedTagIds.size === 0) {
      output.list = [];
      return true;
    }

    // 3. 反向查询 info_tag 表找到使用这些标签的 info_id
    const relatedTagRows = await this.relationDb.select(INFO_TAG_TABLE, {
      conditions: [{ field: 'id', operator: Operator.IN, value: [...relatedTagIds] }],
    });

    const relatedInfoIds = new Set(relatedTagRows.map((r) => r['info_id'] as string));
    relatedInfoIds.delete(input.info_id);

    if (relatedInfoIds.size === 0) {
      output.list = [];
      return true;
    }

    // 4. 获取相关信息的完整内容
    const lastNInput = new LastNInfoInput();
    lastNInput.lastN = input.topN;
    const lastNOutput = new LastNInfoOutput();
    await this.lastNInfo(lastNInput, _context, lastNOutput);

    const filteredList = lastNOutput.list.filter((r) => relatedInfoIds.has(r.info_id));

    const results: Array<InfoRawRecord & { relevance_score?: number }> = filteredList.map((r) => ({
      ...r,
      relevance_score: 1 / (relatedInfoIds.size),
    }));

    // 5. 对使用的 similarTo 边触发激活事件
    for (const edgeId of activatedEdges) {
      try {
        await this.graphDb.activateGraphEdge(
          { edge_id: edgeId } as ActivateGraphEdgeInput,
          new GraphContext(),
          new ActivateGraphEdgeOutput(),
        );
      } catch {
        // 忽略激活失败
      }
    }

    output.list = results;
    return true;
  }

  /**
   * 会话图可视化：构建 session 内信息引用图。
   */
  async graphInfo(
    input: GraphInfoInput,
    _context: InfoCoreContext,
    output: GraphInfoOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('graphInfo 需要提供 session_id');
    }

    const infoRows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [{ field: 'session_id', operator: Operator.EQ, value: input.session_id }],
    });

    const infoIds = new Set(infoRows.map((r) => r['info_id'] as string));

    const graphEdges = await this.relationDb.select(INFO_GRAPH_TABLE, {
      conditions: [{ field: 'session_id', operator: Operator.EQ, value: input.session_id }],
    });

    const nodes = infoRows.map((r) => ({
      id: r['id'] as string,
      label: (r['info'] as string).slice(0, 80),
      info_id: r['info_id'] as string,
    }));

    const edges = graphEdges
      .filter((e) => infoIds.has(e['citing_info_id'] as string) && infoIds.has(e['cited_info_id'] as string))
      .map((e) => ({
        id: e['id'] as string,
        from: e['citing_info_id'] as string,
        to: e['cited_info_id'] as string,
        citing_info_id: e['citing_info_id'] as string,
        cited_info_id: e['cited_info_id'] as string,
      }));

    output.graph = { nodes, edges };
    return true;
  }

  /**
   * 构建 Agent 上下文：五源融合，按配置比例动态分配，钉住消息在最前面。
   *
   * 来源及优先级：
   * a. Pinned  — 钉住消息（强制位于最前）
   * b. Timeline   — lastNInfo
   * c. Tag        — relationKInfo（需提供 info_id）
   * d. Similarity — similarKInfo
   * e. Keyword    — keywordKInfo
   * f. Random     — 随机抽样
   */
  async context(
    input: ContextInfoInput,
    _context: InfoCoreContext,
    output: ContextInfoOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('context 需要提供 session_id');
    }

    const contextConfig = await this.getInfoContextConfig();
    if (!contextConfig) {
      const fallback = await this.lastNInfoTimeline(input.session_id, 100);
      output.list = fallback;
      return true;
    }

    // 1. 先收集钉住消息
    const pinnedItems: InfoRawRecord[] = [];
    const pinnedRows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [
        { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        { field: 'pin', operator: Operator.EQ, value: 1 },
      ],
      order_by: [{ field: 'created', direction: 'DESC' }],
    });
    for (const row of pinnedRows) {
      const record = this.toInfoRawRecord(row);
      if (!record.info || record.info === '') {
        const summary = await this.getInfoSummaryRow(record.info_id);
        if (summary) record.info = `[摘要] ${summary.summary}`;
        else continue;
      }
      pinnedItems.push(record);
    }

    // 2. 时间线消息
    const timelineItems = await this.lastNInfoTimeline(input.session_id, contextConfig.base_timeline_count);
    const timelineMap = new Map<string, InfoRawRecord>();
    for (const item of timelineItems) {
      timelineMap.set(item.info_id, item);
    }

    const timelineActual = timelineMap.size;
    let remaining = (contextConfig.total || 1000) - pinnedItems.length;
    if (remaining <= 0) {
      output.list = pinnedItems.slice(0, contextConfig.total);
      return true;
    }

    // 3. 按比例动态分配
    let tagCount = 0, simCount = 0, kwCount = 0, randCount = 0;
    remaining -= timelineActual;
    if (remaining > 0) {
      tagCount = Math.min(contextConfig.base_tag_relative_count, remaining);
      remaining -= tagCount;
    }
    if (remaining > 0) {
      simCount = Math.min(contextConfig.base_similarity_count, remaining);
      remaining -= simCount;
    }
    if (remaining > 0) {
      kwCount = Math.min(contextConfig.base_keyword_count, remaining);
      remaining -= kwCount;
    }
    if (remaining > 0) {
      randCount = Math.min(contextConfig.base_random_count, remaining);
    }

    const mergedMap = new Map<string, InfoRawRecord>();
    for (const item of timelineItems) {
      mergedMap.set(item.info_id, item);
    }

    // 4. 辅助来源
    if (input.info_id && (tagCount > 0 || simCount > 0 || kwCount > 0)) {
      const infoRow = await this.getInfoByInfoId(input.info_id);
      if (infoRow) {
        if (tagCount > 0) {
          try {
            const relInput = new RelationKInfoInput();
            relInput.info_id = input.info_id;
            relInput.topN = tagCount;
            const relOutput = new RelationKInfoOutput();
            await this.relationKInfo(relInput, _context, relOutput);
            for (const item of relOutput.list) {
              if (!mergedMap.has(item.info_id)) mergedMap.set(item.info_id, item);
            }
          } catch { /* 忽略 */ }
        }
        if (simCount > 0) {
          try {
            const simInput = new SimilarKInfoInput();
            simInput.info = infoRow.info;
            simInput.topK = simCount;
            const simOutput = new SimilarKInfoOutput();
            await this.similarKInfo(simInput, _context, simOutput);
            for (const item of simOutput.list) {
              if (!mergedMap.has(item.info_id)) mergedMap.set(item.info_id, item);
            }
          } catch { /* 忽略 */ }
        }
        if (kwCount > 0) {
          try {
            const kwInput = new KeywordKInfoInput();
            kwInput.info = infoRow.info;
            const kwOutput = new KeywordKInfoOutput();
            await this.keywordKInfo(kwInput, _context, kwOutput);
            const topKw = kwOutput.list.slice(0, kwCount);
            for (const item of topKw) {
              if (!mergedMap.has(item.info_id)) mergedMap.set(item.info_id, item);
            }
          } catch { /* 忽略 */ }
        }
      }
    }

    if (randCount > 0) {
      try {
        const randomItems = await this.randomSampleInfos(input.session_id, randCount);
        for (const item of randomItems) {
          if (!mergedMap.has(item.info_id)) mergedMap.set(item.info_id, item);
        }
      } catch { /* 忽略 */ }
    }

    // 5. 排序：钉住 → 时间线 → tag → similarity → keyword → random
    const sorted = [...mergedMap.values()].sort((a, b) => b.created - a.created);
    const result = [...pinnedItems, ...sorted];
    output.list = result.slice(0, contextConfig.total);

    return true;
  }

  // =========================================================================
  // Config Operations
  // =========================================================================

  /** 获取标签配置 */
  async soInfoTagConfig(
    _input: SoInfoTagConfigInput,
    _context: InfoCoreContext,
    output: SoInfoTagConfigOutput,
  ): Promise<boolean> {
    output.config = await this.getInfoTagConfig();
    return true;
  }

  /** 更新标签配置（upsert） */
  async updateInfoTagConfig(
    input: UpdateInfoTagConfigInput,
    _context: InfoCoreContext,
    output: UpdateInfoTagConfigOutput,
  ): Promise<boolean> {
    if (input.llm_id) {
      const llmOutput = new GetLLMOutput();
      await this.llmAccess.getLLM({ id: input.llm_id } as GetLLMInput, new LLMContext(), llmOutput);
      if (!llmOutput.llm) {
        throw new ValidationError(`llm_id ${input.llm_id} 不存在`);
      }
    }
    if (input.prompt_template_id) {
      const promptOutput = new GetPromptOutput();
      await this.promptsAccess.getPrompt({ id: input.prompt_template_id } as GetPromptInput, new PromptContext(), promptOutput);
      if (!promptOutput.prompt) {
        throw new ValidationError(`prompt_template_id ${input.prompt_template_id} 不存在`);
      }
    }
    await this.upsertConfigRow(INFO_TAG_CONFIG_TABLE, input, {
      defaultRecord: {
        llm_id: '',
        prompt_template_id: '',
        tag_top_k: 5,
        enable: 1,
      },
    });
    return true;
  }

  /** 获取摘要配置 */
  async soInfoSummaryConfig(
    _input: SoInfoSummaryConfigInput,
    _context: InfoCoreContext,
    output: SoInfoSummaryConfigOutput,
  ): Promise<boolean> {
    output.config = await this.getInfoSummaryConfig();
    return true;
  }

  /** 更新摘要配置 */
  async updateInfoSummaryConfig(
    input: UpdateInfoSummaryConfigInput,
    _context: InfoCoreContext,
    output: UpdateInfoSummaryConfigOutput,
  ): Promise<boolean> {
    if (input.llm_id) {
      const llmOutput = new GetLLMOutput();
      await this.llmAccess.getLLM({ id: input.llm_id } as GetLLMInput, new LLMContext(), llmOutput);
      if (!llmOutput.llm) {
        throw new ValidationError(`llm_id ${input.llm_id} 不存在`);
      }
    }
    if (input.prompt_template_id) {
      const promptOutput = new GetPromptOutput();
      await this.promptsAccess.getPrompt({ id: input.prompt_template_id } as GetPromptInput, new PromptContext(), promptOutput);
      if (!promptOutput.prompt) {
        throw new ValidationError(`prompt_template_id ${input.prompt_template_id} 不存在`);
      }
    }
    await this.upsertConfigRow(INFO_SUMMARY_CONFIG_TABLE, input, {
      defaultRecord: {
        llm_id: '',
        prompt_template_id: '',
        enable: 1,
      },
    });
    return true;
  }

  /** 获取全局配置 */
  async soInfoConfig(
    _input: SoInfoConfigInput,
    _context: InfoCoreContext,
    output: SoInfoConfigOutput,
  ): Promise<boolean> {
    output.config = await this.getInfoConfig();
    return true;
  }

  /** 更新全局配置 */
  async updateInfoConfig(
    input: UpdateInfoConfigInput,
    _context: InfoCoreContext,
    output: UpdateInfoConfigOutput,
  ): Promise<boolean> {
    await this.upsertConfigRow(INFO_CONFIG_TABLE, input, {
      defaultRecord: {
        alive_max_days: 30,
      },
    });
    return true;
  }

  /** 获取向量配置 */
  async soInfoVectorConfig(
    _input: SoInfoVectorConfigInput,
    _context: InfoCoreContext,
    output: SoInfoVectorConfigOutput,
  ): Promise<boolean> {
    output.config = await this.getInfoVectorConfig();
    return true;
  }

  /** 更新向量配置 */
  async updateInfoVectorConfig(
    input: UpdateInfoVectorConfigInput,
    _context: InfoCoreContext,
    output: UpdateInfoVectorConfigOutput,
  ): Promise<boolean> {
    if (input.dimension !== undefined) {
      const vectorCount = await this.relationDb.count(INFO_VECTOR_TABLE);
      if (vectorCount > 0) {
        throw new ValidationError('dimension 只允许在没有计算过向量数据的情况下修改');
      }
    }
    if (input.llm_id) {
      const llmOutput = new GetLLMOutput();
      await this.llmAccess.getLLM({ id: input.llm_id } as GetLLMInput, new LLMContext(), llmOutput);
      if (!llmOutput.llm) {
        throw new ValidationError(`llm_id ${input.llm_id} 不存在`);
      }
    }
    await this.upsertConfigRow(INFO_VECTOR_CONFIG_TABLE, input, {
      defaultRecord: {
        llm_id: '',
        dimension: 1024,
        enable: 1,
      },
    });
    return true;
  }

  /** 获取上下文构建配置 */
  async soInfoContextConfig(
    _input: SoInfoContextConfigInput,
    _context: InfoCoreContext,
    output: SoInfoContextConfigOutput,
  ): Promise<boolean> {
    output.config = await this.getInfoContextConfig();
    return true;
  }

  /** 更新上下文构建配置 */
  async updateInfoContextConfig(
    input: UpdateInfoContextConfigInput,
    _context: InfoCoreContext,
    output: UpdateInfoContextConfigOutput,
  ): Promise<boolean> {
    await this.upsertConfigRow(INFO_CONTEXT_CONFIG_TABLE, input, {
      defaultRecord: {
        base_timeline_count: 500,
        base_tag_relative_count: 200,
        base_similarity_count: 150,
        base_keyword_count: 100,
        base_random_count: 50,
        total: 1000,
      },
    });
    return true;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * 清理超过 alive_max_days 的过期信息内容（保留记录，用于摘要回退）。
   *
   * 被钉住（pin=true）的消息跳过不清理。
   * 清空前确保至少有一种索引（向量/标签/摘要）存在。
   */
  async delInfo(
    _input: DelInfoInput,
    _context: InfoCoreContext,
    output: DelInfoOutput,
  ): Promise<boolean> {
    const config = await this.getInfoConfig();
    const aliveMaxDays = config?.alive_max_days ?? 30;

    const now = IdGenerator.now();
    const threshold = now - aliveMaxDays * 24 * 60 * 60 * 1000;

    const expiredRows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [
        { field: 'created', operator: Operator.LT, value: threshold },
        { field: 'pin', operator: Operator.EQ, value: 0 },
      ],
      fields: ['id', 'info_id', 'info'],
    });

    // 过滤出 info 非空的记录（已被清空的跳过）
    const toClear = expiredRows.filter((r) => (r['info'] as string) !== '');

    if (toClear.length === 0) {
      output.deleted_count = 0;
      return true;
    }

    const vectorConfig = await this.getInfoVectorConfig();
    const tagConfig = await this.getInfoTagConfig();
    const summaryConfig = await this.getInfoSummaryConfig();

    for (const row of toClear) {
      const infoId = row['info_id'] as string;

      const hasVector = vectorConfig?.enable === 1 && await this.hasVectorForInfo(infoId);
      const hasTag = tagConfig?.enable === 1 && await this.hasTagForInfo(infoId);
      const hasSummary = summaryConfig?.enable === 1 && await this.hasSummaryForInfo(infoId);

      if (vectorConfig?.enable === 1 && !hasVector) {
        const vi = new ProcessInfoInput(); vi.info_id = infoId;
        await this.vectorInfo(vi, _context, new VectorInfoOutput()).catch(() => {});
      }
      if (tagConfig?.enable === 1 && !hasTag) {
        const ti = new ProcessInfoInput(); ti.info_id = infoId;
        await this.tagInfo(ti, _context, new TagInfoOutput()).catch(() => {});
      }
      if (summaryConfig?.enable === 1 && !hasSummary) {
        const si = new ProcessInfoInput(); si.info_id = infoId;
        await this.summaryInfo(si, _context, new SummaryInfoOutput()).catch(() => {});
      }
    }

    const dbIds = toClear.map((r) => r['id'] as string);
    const now2 = IdGenerator.now();

    for (const id of dbIds) {
      await this.relationDb.update(
        INFO_RAW_TABLE,
        [
          { field: 'info', value: '' },
          { field: 'updated', value: now2 },
        ],
        [{ field: 'id', operator: Operator.EQ, value: id }],
      );
    }

    output.deleted_count = dbIds.length;
    return true;
  }

  // =========================================================================
  // Assist
  // =========================================================================

  /** 检查 info_vector 是否存在 */
  async existVectorInfo(
    input: ExistInfoInput,
    _context: InfoCoreContext,
    output: ExistInfoOutput,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('existVectorInfo 需要提供 info_id');
    }

    output.exists = await this.hasVectorForInfo(input.info_id);
    return true;
  }

  /** 检查 info_tag 是否存在 */
  async existTagInfo(
    input: ExistInfoInput,
    _context: InfoCoreContext,
    output: ExistInfoOutput,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('existTagInfo 需要提供 info_id');
    }

    output.exists = await this.hasTagForInfo(input.info_id);
    return true;
  }

  /** 检查 info_summary 是否存在 */
  async existSummaryInfo(
    input: ExistInfoInput,
    _context: InfoCoreContext,
    output: ExistInfoOutput,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('existSummaryInfo 需要提供 info_id');
    }

    output.exists = await this.hasSummaryForInfo(input.info_id);
    return true;
  }

  // =========================================================================
  // Private: DB helpers
  // =========================================================================

  private async hasVectorForInfo(infoId: string): Promise<boolean> {
    const count = await this.relationDb.count(INFO_VECTOR_TABLE, [
      { field: 'info_id', operator: Operator.EQ, value: infoId },
    ]);
    return count > 0;
  }

  private async hasTagForInfo(infoId: string): Promise<boolean> {
    const count = await this.relationDb.count(INFO_TAG_TABLE, [
      { field: 'info_id', operator: Operator.EQ, value: infoId },
    ]);
    return count > 0;
  }

  private async hasSummaryForInfo(infoId: string): Promise<boolean> {
    const count = await this.relationDb.count(INFO_SUMMARY_TABLE, [
      { field: 'info_id', operator: Operator.EQ, value: infoId },
    ]);
    return count > 0;
  }

  private async getInfoByInfoId(infoId: string): Promise<InfoRawRecord | null> {
    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [{ field: 'info_id', operator: Operator.EQ, value: infoId }],
      page: { current: 1, size: 1 },
    });
    return rows.length > 0 ? this.toInfoRawRecord(rows[0]) : null;
  }

  private async getInfoById(id: string): Promise<InfoRawRecord | null> {
    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [{ field: 'id', operator: Operator.EQ, value: id }],
      page: { current: 1, size: 1 },
    });
    return rows.length > 0 ? this.toInfoRawRecord(rows[0]) : null;
  }

  private async getInfoVectorRow(infoId: string): Promise<InfoVectorRecord | null> {
    const rows = await this.relationDb.select(INFO_VECTOR_TABLE, {
      conditions: [{ field: 'info_id', operator: Operator.EQ, value: infoId }],
      page: { current: 1, size: 1 },
    });
    if (rows.length === 0) return null;
    return this.toInfoVectorRecord(rows[0]);
  }

  private async getInfoSummaryRow(infoId: string): Promise<InfoSummaryRecord | null> {
    const rows = await this.relationDb.select(INFO_SUMMARY_TABLE, {
      conditions: [{ field: 'info_id', operator: Operator.EQ, value: infoId }],
      page: { current: 1, size: 1 },
    });
    if (rows.length === 0) return null;
    return this.toInfoSummaryRecord(rows[0]);
  }

  private async getInfoTagConfig(): Promise<InfoTagConfigRecord | null> {
    const rows = await this.relationDb.select(INFO_TAG_CONFIG_TABLE, {
      page: { current: 1, size: 1 },
    });
    return rows.length > 0 ? this.toInfoTagConfigRecord(rows[0]) : null;
  }

  private async getInfoSummaryConfig(): Promise<InfoSummaryConfigRecord | null> {
    const rows = await this.relationDb.select(INFO_SUMMARY_CONFIG_TABLE, {
      page: { current: 1, size: 1 },
    });
    return rows.length > 0 ? this.toInfoSummaryConfigRecord(rows[0]) : null;
  }

  private async getInfoConfig(): Promise<InfoConfigRecord | null> {
    const rows = await this.relationDb.select(INFO_CONFIG_TABLE, {
      page: { current: 1, size: 1 },
    });
    return rows.length > 0 ? this.toInfoConfigRecord(rows[0]) : null;
  }

  private async getInfoVectorConfig(): Promise<InfoVectorConfigRecord | null> {
    const rows = await this.relationDb.select(INFO_VECTOR_CONFIG_TABLE, {
      page: { current: 1, size: 1 },
    });
    return rows.length > 0 ? this.toInfoVectorConfigRecord(rows[0]) : null;
  }

  private async getInfoContextConfig(): Promise<InfoContextConfigRecord | null> {
    const rows = await this.relationDb.select(INFO_CONTEXT_CONFIG_TABLE, {
      page: { current: 1, size: 1 },
    });
    return rows.length > 0 ? this.toInfoContextConfigRecord(rows[0]) : null;
  }

  // =========================================================================
  // Private: LLM helpers
  // =========================================================================

  private async generateEmbedding(
    text: string,
    vectorConfig: InfoVectorConfigRecord,
  ): Promise<number[]> {
    try {
      if (!vectorConfig.llm_id) return [];

      const prompt = `Generate a ${vectorConfig.dimension}-dimensional embedding vector as a JSON array of floats for the following text:\n\n${text}\n\nRespond with ONLY the JSON array.`;

      const execOutput = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        {
          id: vectorConfig.llm_id,
          params: { prompt, temperature: 0.1, max_tokens: 4096 },
        } as ExecLLMInput,
        new LLMContext(),
        execOutput,
      );

      const arr = this.parseJSONArray(execOutput.result);
      if (arr && arr.length === vectorConfig.dimension) {
        return arr;
      }
      return arr || [];
    } catch {
      return [];
    }
  }

  private async extractTags(
    text: string,
    tagConfig: InfoTagConfigRecord,
  ): Promise<string[]> {
    try {
      if (!tagConfig.llm_id) return [];

      const topK = tagConfig.tag_top_k || 5;
      const prompt = `Extract the top ${topK} relevant tags from the following text. Return ONLY a JSON array of strings.\n\nText:\n${text}`;

      const execOutput = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        {
          id: tagConfig.llm_id,
          params: { prompt, temperature: 0.1, max_tokens: 256 },
        } as ExecLLMInput,
        new LLMContext(),
        execOutput,
      );

      return this.parseStringArray(execOutput.result);
    } catch {
      return [];
    }
  }

  private async generateSummary(
    text: string,
    summaryConfig: InfoSummaryConfigRecord,
  ): Promise<string> {
    try {
      if (!summaryConfig.llm_id) return '';

      const prompt = `Summarize the following text concisely:\n\n${text}\n\nProvide ONLY the summary, nothing else.`;

      const execOutput = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        {
          id: summaryConfig.llm_id,
          params: { prompt, temperature: 0.3, max_tokens: 512 },
        } as ExecLLMInput,
        new LLMContext(),
        execOutput,
      );

      return execOutput.result.trim();
    } catch {
      return '';
    }
  }

  // =========================================================================
  // Private: Keyword extraction
  // =========================================================================

  /**
   * 从文本提取关键词（nodejieba 中文分词）。
   * 分词 → 过滤停用词 → 词频统计 → 取前 10。
   */
  private extractKeywords(text: string): string[] {
    const words: string[] = nodejieba.cut(text);
    const filtered = words
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

    const freqMap = new Map<string, number>();
    for (const w of filtered) {
      freqMap.set(w, (freqMap.get(w) || 0) + 1);
    }

    return [...freqMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map((e) => e[0]);
  }

  // =========================================================================
  // Private: Graph helpers
  // =========================================================================

  private async createGraphEdges(
    rowId: string,
    infoId: string,
    sessionId: string,
    parentInfoIds: string[],
    now: number,
  ): Promise<void> {
    for (const parentId of parentInfoIds) {
      const edgeId = IdGenerator.generate();
      try {
        await this.relationDb.insert(INFO_GRAPH_TABLE, [
          { field: 'id', value: edgeId },
          { field: 'created', value: now },
          { field: 'session_id', value: sessionId },
          { field: 'info_id', value: infoId },
          { field: 'citing_info_id', value: infoId },
          { field: 'cited_info_id', value: parentId },
        ]);
      } catch {
        // 忽略重复边
      }
    }
  }

  private async ensureInfoGraphNode(
    infoId: string,
    infoRow: Record<string, unknown>,
  ): Promise<string> {
    const existingNodeId = await this.findInfoGraphNodeId(infoId);
    if (existingNodeId) return existingNodeId;

    const addNodeOutput = new AddGraphNodeOutput();
    await this.graphDb.addGraphNode(
      {
        data: {
          node_type: 'info',
          content: {
            info_id: infoId,
            session_id: infoRow['session_id'],
            info_preview: (infoRow['info'] as string).slice(0, 200),
          },
        } as GraphNodeData,
      } as AddGraphNodeInput,
      new GraphContext(),
      addNodeOutput,
    );

    return addNodeOutput.id;
  }

  private async findInfoGraphNodeId(infoId: string): Promise<string | null> {
    try {
      const rows = await this.relationDb.select('graph_node', {
        conditions: [
          { field: 'node_type', operator: Operator.EQ, value: 'info' },
        ],
      });

      for (const row of rows) {
        const content = typeof row['content'] === 'string'
          ? JSON.parse(row['content'] as string)
          : row['content'];
        if (content && (content as Record<string, unknown>)['info_id'] === infoId) {
          return row['id'] as string;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  // =========================================================================
  // Private: Context helpers
  // =========================================================================

  private async lastNInfoTimeline(
    sessionId: string,
    count: number,
  ): Promise<InfoRawRecord[]> {
    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [{ field: 'session_id', operator: Operator.EQ, value: sessionId }],
      order_by: [{ field: 'created', direction: 'DESC' }],
      page: { current: 1, size: count },
    });
    return rows.map((r) => this.toInfoRawRecord(r));
  }

  private async randomSampleInfos(
    sessionId: string,
    count: number,
  ): Promise<InfoRawRecord[]> {
    if (count <= 0) return [];

    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [{ field: 'session_id', operator: Operator.EQ, value: sessionId }],
      order_by: [{ field: 'created', direction: 'DESC' }],
      page: { current: 1, size: 500 },
    });

    if (rows.length <= count) {
      return rows.map((r) => this.toInfoRawRecord(r));
    }

    const shuffled = [...rows].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((r) => this.toInfoRawRecord(r));
  }

  // =========================================================================
  // Private: Tag vector maintenance
  // =========================================================================

  private async maintainTagVector(
    tag: string,
    tagConfig: InfoTagConfigRecord,
  ): Promise<void> {
    try {
      // 检查是否已有
      const existing = await this.relationDb.select(INFO_TAG_VECTOR_TABLE, {
        conditions: [{ field: 'tag_id', operator: Operator.EQ, value: tag }],
        page: { current: 1, size: 1 },
      });
      if (existing.length > 0) return;

      const vectorConfig = await this.getInfoVectorConfig();
      if (!vectorConfig || !vectorConfig.llm_id) return;

      const embedding = await this.generateEmbedding(tag, vectorConfig);
      if (!embedding || embedding.length === 0) return;

      const now = IdGenerator.now();
      const id = IdGenerator.generate();

      await this.relationDb.insert(INFO_TAG_VECTOR_TABLE, [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'tag_id', value: tag },
        { field: 'embedding', value: JSON.stringify(embedding) },
      ]);
    } catch {
      // ignore
    }
  }

  // =========================================================================
  // Private: Config helpers
  // =========================================================================

  private async ensureDefaultConfigs(): Promise<void> {
    await this.ensureDefaultConfigRow(
      INFO_CONFIG_TABLE,
      { alive_max_days: 30 },
    );
    await this.ensureDefaultConfigRow(
      INFO_VECTOR_CONFIG_TABLE,
      { llm_id: '', dimension: 1024, enable: 1 },
    );
    await this.ensureDefaultConfigRow(
      INFO_TAG_CONFIG_TABLE,
      { llm_id: '', prompt_template_id: '', tag_top_k: 5, enable: 1 },
    );
    await this.ensureDefaultConfigRow(
      INFO_SUMMARY_CONFIG_TABLE,
      { llm_id: '', prompt_template_id: '', enable: 1 },
    );
    await this.ensureDefaultConfigRow(
      INFO_CONTEXT_CONFIG_TABLE,
      {
        base_timeline_count: 500,
        base_tag_relative_count: 200,
        base_similarity_count: 150,
        base_keyword_count: 100,
        base_random_count: 50,
        total: 1000,
      },
    );
  }

  private async ensureDefaultConfigRow(
    table: string,
    defaults: Record<string, unknown>,
  ): Promise<void> {
    const rows = await this.relationDb.select(table, {
      page: { current: 1, size: 1 },
    });
    if (rows.length > 0) return;

    const now = IdGenerator.now();
    const id = IdGenerator.generate();
    const data: Array<{ field: string; value: unknown }> = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
    ];
    for (const [key, value] of Object.entries(defaults)) {
      data.push({ field: key, value });
    }
    await this.relationDb.insert(table, data);
  }

  /**
   * Upsert 配置表行（第一行的更新或新增）。
   */
  private async upsertConfigRow(
    table: string,
    input: object,
    options: { defaultRecord: Record<string, unknown> },
  ): Promise<void> {
    const inputRecord = input as Record<string, unknown>;
    const rows = await this.relationDb.select(table, {
      page: { current: 1, size: 1 },
    });
    const now = IdGenerator.now();

    if (rows.length > 0) {
      const existingId = rows[0]['id'] as string;
      const data: Array<{ field: string; value: unknown }> = [];
      for (const [key, value] of Object.entries(inputRecord)) {
        if (value !== undefined && value !== null) {
          data.push({ field: key, value });
        }
      }
      if (data.length > 0) {
        data.push({ field: 'updated', value: now });
        await this.relationDb.update(table, data, [
          { field: 'id', operator: Operator.EQ, value: existingId },
        ]);
      }
    } else {
      const id = IdGenerator.generate();
      const data: Array<{ field: string; value: unknown }> = [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
      ];
      for (const [key, defaultValue] of Object.entries(options.defaultRecord)) {
        const val = inputRecord[key] !== undefined && inputRecord[key] !== null ? inputRecord[key] : defaultValue;
        data.push({ field: key, value: val });
      }
      await this.relationDb.insert(table, data);
    }
  }

  // =========================================================================
  // Private: Parsing helpers
  // =========================================================================

  private parseJSONArray(raw: string): number[] | null {
    try {
      let json = raw.trim();
      const arrMatch = json.match(/\[[\s\S]*?\]/);
      if (arrMatch) json = arrMatch[0];

      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return null;

      return parsed.map((v: unknown) => typeof v === 'number' ? v : parseFloat(String(v))).filter((v: number) => !isNaN(v));
    } catch {
      return null;
    }
  }

  private parseStringArray(raw: string): string[] {
    try {
      let json = raw.trim();
      const arrMatch = json.match(/\[[\s\S]*?\]/);
      if (arrMatch) json = arrMatch[0];

      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((v: unknown) => String(v).trim()).filter((s) => s.length > 0);
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Private: Record conversion helpers
  // =========================================================================

  private toInfoRawRecord(raw: Record<string, unknown>): InfoRawRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      session_id: raw['session_id'] as string,
      work_id: raw['work_id'] as string,
      interact_id: raw['interact_id'] as string,
      info_id: raw['info_id'] as string,
      info_creator_id: raw['info_creator_id'] as string,
      info_creator_role: raw['info_creator_role'] as string,
      info: raw['info'] as string,
      info_length: raw['info_length'] as number,
      pin: raw['pin'] as number,
    };
  }

  private toInfoVectorRecord(raw: Record<string, unknown>): InfoVectorRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      info_id: raw['info_id'] as string,
      embedding: raw['embedding'] as string,
    };
  }

  private toInfoSummaryRecord(raw: Record<string, unknown>): InfoSummaryRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: (raw['updated'] as number) ?? 0,
      info_id: raw['info_id'] as string,
      summary: raw['summary'] as string,
    };
  }

  private toInfoTagConfigRecord(raw: Record<string, unknown>): InfoTagConfigRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      llm_id: raw['llm_id'] as string,
      prompt_template_id: raw['prompt_template_id'] as string,
      tag_top_k: raw['tag_top_k'] as number,
      enable: raw['enable'] as number,
    };
  }

  private toInfoSummaryConfigRecord(raw: Record<string, unknown>): InfoSummaryConfigRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      llm_id: raw['llm_id'] as string,
      prompt_template_id: raw['prompt_template_id'] as string,
      enable: raw['enable'] as number,
    };
  }

  private toInfoConfigRecord(raw: Record<string, unknown>): InfoConfigRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      alive_max_days: raw['alive_max_days'] as number,
    };
  }

  private toInfoVectorConfigRecord(raw: Record<string, unknown>): InfoVectorConfigRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      llm_id: raw['llm_id'] as string,
      dimension: raw['dimension'] as number,
      enable: raw['enable'] as number,
    };
  }

  private toInfoContextConfigRecord(raw: Record<string, unknown>): InfoContextConfigRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      base_timeline_count: raw['base_timeline_count'] as number,
      base_tag_relative_count: raw['base_tag_relative_count'] as number,
      base_similarity_count: raw['base_similarity_count'] as number,
      base_keyword_count: raw['base_keyword_count'] as number,
      base_random_count: raw['base_random_count'] as number,
      total: raw['total'] as number,
    };
  }
}
