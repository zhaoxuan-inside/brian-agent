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

import { Metrics, Report } from '@brian-agent/base';
import type {
  RelationDBAccess,
  LLMAccess,
  PromptsAccess,
  VectorDBAccess,
  GraphDBAccess,
} from '@brian-agent/base';
import { IdGenerator, Operator, GraphDirection, InfoType, CollectionSource, HandleResultType, DEFAULT_HANDLE_RESULT_TYPE, RecursiveTextSplitter } from '@brian-agent/base';
import type { Condition } from '@brian-agent/base';
import { Jieba } from '@node-rs/jieba';
import { dict } from '@node-rs/jieba/dict';
import { ValidationError, NotFoundError } from '../../shared/errors';
import { InfoCoreContext, SaveInfoInput, SaveInfoOutput, PinInfoInput, PinInfoOutput, ProcessInfoInput, VectorInfoOutput, TagInfoOutput, SummaryInfoOutput, KeywordInfoOutput, BackfillMissingSummariesInput, BackfillMissingSummariesOutput, GraphTagInput, GraphTagOutput, RebuildCooccurGraphInput, RebuildCooccurGraphOutput, LastNInfoInput, LastNInfoOutput, GraphNInfoInput, GraphNInfoOutput, SimilarKInfoInput, SimilarKInfoOutput, KeywordKInfoInput, KeywordKInfoOutput, RelationKInfoInput, RelationKInfoOutput, GraphInfoInput, GraphInfoOutput, SoCitationEdgesInput, SoCitationEdgesOutput, DelInfoGraphInput, DelInfoGraphOutput, ClearGraphInput, ClearGraphOutput, RebuildCitationGraphInput, RebuildCitationGraphOutput, ContextInfoInput, ContextInfoOutput, SoContextByWorkInput, SoContextByWorkOutput, SoInfoTagConfigInput, SoInfoTagConfigOutput, UpdateInfoTagConfigInput, UpdateInfoTagConfigOutput, SoInfoSummaryConfigInput, SoInfoSummaryConfigOutput, UpdateInfoSummaryConfigInput, UpdateInfoSummaryConfigOutput, SoInfoConfigInput, SoInfoConfigOutput, UpdateInfoConfigInput, UpdateInfoConfigOutput, SoInfoVectorConfigInput, SoInfoVectorConfigOutput, UpdateInfoVectorConfigInput, UpdateInfoVectorConfigOutput, SoInfoContextConfigInput, SoInfoContextConfigOutput, UpdateInfoContextConfigInput, UpdateInfoContextConfigOutput, DelInfoInput, DelInfoOutput, UpdateInfoInput, UpdateInfoOutput, DelInfoByWorkInput, DelInfoByWorkOutput, DelInfoBySessionInput, DelInfoBySessionOutput, ExistInfoInput, ExistInfoOutput, INFO_RAW_TABLE, INFO_CONTEXT_SOURCE_TABLE, INFO_VECTOR_TABLE, INFO_TAG_TABLE, INFO_SUMMARY_TABLE, INFO_KEYWORD_TABLE, INFO_TAG_CONFIG_TABLE, INFO_SUMMARY_CONFIG_TABLE, INFO_CONFIG_TABLE, INFO_VECTOR_CONFIG_TABLE, INFO_CONTEXT_CONFIG_TABLE } from '../domain/types';
import type { InfoRawRecord, InfoSummaryRecord, InfoTagConfigRecord, InfoSummaryConfigRecord, InfoConfigRecord, InfoVectorConfigRecord, InfoContextConfigRecord, ContextCollectionSource, ContextInfoItem, ContextSourceIdMap, ContextContentMap, ContextAttributeMap } from '../domain/types';
import { Context, ExecLLMInput, ExecLLMOutput, EmbedLLMInput, EmbedLLMOutput, LLMContext, PromptContext, VectorContext, AddVectorInput, AddVectorOutput, SoVectorInput, SoVectorOutput, GetVectorInput, GetVectorOutput, GraphContext, AddGraphNodeInput, AddGraphNodeOutput, UpdateGraphNodeInput, UpdateGraphNodeOutput, AddGraphEdgeInput, AddGraphEdgeOutput, UpdateGraphEdgeInput, UpdateGraphEdgeOutput, DelGraphNodeInput, DelGraphNodeOutput, GraphTarget, SelectGraphInput, SelectGraphOutput, GetGraphNeighborsInput, GetGraphNeighborsOutput, GetGraphNodeInput, GetGraphNodeOutput } from '@brian-agent/base';
import type {
  VectorObject,
  VectorRecord,
  VectorQueryParam,
  VectorSearchResult,
  GraphNodeData,
  GraphNodeRecord,
  GraphEdgeData,
  GraphEdgeRecord,
} from '@brian-agent/base';
import {
  GetLLMInput,
  GetLLMOutput,
  GetPromptInput,
  GetPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
} from '@brian-agent/base';

const jieba = Jieba.withDict(dict);

// 共现边类型：两个标签出现在同一条 info 记录上即建立一条边，权重为共现次数
const COOCCUR_EDGE_TYPE = 'cooccur';

// 关键词共现边类型：两个关键词出现在同一条 info 记录上即建立一条边
const KEYWORD_COOCCUR_EDGE_TYPE = 'keywordCooccur';

// 引用边类型：info 引用（citing）另一条 info（cited），用于图遍历与可视化
const CITATION_EDGE_TYPE = 'CITATION';

// 摘要 LLM 生成重试参数：本地模型服务间歇性 CONNECT_ERROR（llm_call_log 实测），
// 单次失败即丢摘要；最多尝试 2 次、间隔 2s（短间隔，避免 setImmediate 异步链路被长挂起拖垮）
const SUMMARY_LLM_MAX_ATTEMPTS = 2;
const SUMMARY_LLM_RETRY_DELAY_MS = 2000;

// 旧版 info 引用关系表名（迁移后 DROP）
const LEGACY_INFO_GRAPH_TABLE = 'info_graph';

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

// ---------------------------------------------------------------------------
// Context 构建私有结构（application 内部步骤方法的 input/output 形状，不进 domain 契约）
// ---------------------------------------------------------------------------

/** 上下文构建计划：total 总预算、时间线限额、跨会话开关、复选消息 ID 列表 */
interface ContextBuildPlan {
  maxTotal: number;
  timelineLimit: number;
  enableCrossSession: boolean;
  selectedIds: string[];
}

/** 弱相关维度（TAG_RELATIVE/SIMILARITY/KEYWORD/RANDOM）限额与关键词分数阈值 */
interface ContextWeakDimensionLimits {
  tagLimit: number;
  simLimit: number;
  kwLimit: number;
  randLimit: number;
  kwScoreThreshold: number;
}

/** 弱相关维度并行采集结果（TAG_RELATIVE / SIMILARITY / KEYWORD 三维候选） */
interface ContextWeakDimensionCandidates {
  tag: InfoRawRecord[];
  sim: InfoRawRecord[];
  kw: InfoRawRecord[];
}

/** 上下文候选采集分桶：按来源维度归集的原始候选（尚未去重/转 ContextInfoItem） */
interface ContextCandidateBuckets {
  pinned: InfoRawRecord[];
  citing: InfoRawRecord[];
  timeline: InfoRawRecord[];
  tag: InfoRawRecord[];
  sim: InfoRawRecord[];
  kw: InfoRawRecord[];
  rand: InfoRawRecord[];
}

// 上下文采集来源全集：既作 priority_order 缺省时的默认优先级，也作合法性校验集合
const CONTEXT_COLLECTION_SOURCES: ContextCollectionSource[] = [
  CollectionSource.PINNED,
  CollectionSource.CITING,
  CollectionSource.TIMELINE,
  CollectionSource.TAG_RELATIVE,
  CollectionSource.SIMILARITY,
  CollectionSource.KEYWORD,
  CollectionSource.RANDOM,
];

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

  /** 摘要回填防重入标志（backfillMissingSummaries 专用） */
  private backfillRunning = false;

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
   * 2. 若 parent_info_ids 存在，创建 GraphDB info 节点与 CITATION 边。
   * 3. 摘要落库：错误信息（非 correct）直接用原文作为摘要；正常信息经 input.summary 传入后落库。
   * 4. 异步触发处理（仅正常信息）：vectorInfo / tagInfo / keywordInfo（摘要生成不在本方法内触发）。
   */
  async saveInfo(input: SaveInfoInput, output: SaveInfoOutput, _context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    if (!input.info || !input.session_id) {
      throw new ValidationError('saveInfo 需要提供 info 和 session_id');
    }
    if (!input.work_id) {
      throw new ValidationError('saveInfo 需要提供 work_id');
    }

    const handleResultType = input.handle_result_type || DEFAULT_HANDLE_RESULT_TYPE;
    const isCorrect = handleResultType === HandleResultType.CORRECT;

    const now = IdGenerator.now();
    // ===== 修改后（2026-09-09）：优先使用调用方传入的真实创建时间（input.created，
    //      如 runtime_message.created），避免 run 结束后统一同步导致 user/assistant
    //      落库同一时间戳、对话区消息顺序颠倒（并使按 created 去重的条件真正成立）=====
    const createdAt = input.created && input.created > 0 ? input.created : now;
    const id = IdGenerator.generate();
    const infoId = IdGenerator.generate();

    await this.relationDb.insert(INFO_RAW_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: createdAt },
      { field: 'updated', value: createdAt },
      { field: 'session_id', value: input.session_id },
      { field: 'work_id', value: input.work_id },
      { field: 'run_id', value: input.run_id || '' },
      { field: 'info_id', value: infoId },
      { field: 'info_type', value: input.info_type || '' },
      { field: 'info_creator_role', value: input.info_creator_role || '' },
      { field: 'info_creator_id', value: input.info_creator_id || '' },
      { field: 'info', value: input.info },
      { field: 'info_length', value: input.info.length },
      { field: 'pin', value: 0 },
      // ===== 修改后（2026-09-14 trace 源头治理）：trace_id 显式传入（含 ''，表示该行
      // 无已知源头 trace）优先落库；未传入才回落调用方链路（Metrics）trace —— 防止
      // 历史补齐行无 trace 时被错误盖上调用方当轮 trace =====
      { field: 'trace_id', value: input.trace_id !== undefined ? input.trace_id : (metrics?.trace_id || '') },
      { field: 'handle_result_type', value: handleResultType },
    ]);

    // 创建图引用边（GraphDB：info 节点 + CITATION 边）
    if (input.parent_info_ids && input.parent_info_ids.length > 0) {
      await this.connectCitationEdges(infoId, input.session_id, input.info, input.parent_info_ids, metrics);
    }

    output.info_id = infoId;

    // 摘要生成规则由上层编排控制：saveInfo 仅负责保存。
    // 错误信息（非 correct）无意义调用 LLM 生成摘要，直接用原文作为摘要；
    // 正常信息经 input.summary 传入后落库。
    const summaryText = isCorrect ? (input.summary ?? '') : input.info;
    if (summaryText) {
      const summaryId = IdGenerator.generate();
      await this.relationDb.insert(INFO_SUMMARY_TABLE, [
        { field: 'id', value: summaryId },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'info_id', value: infoId },
        { field: 'summary', value: summaryText },
      ]);
    }

    // 异步触发处理（不阻塞保存）：仅正常信息参与自学习（关键词/标签/向量）
    if (isCorrect) {
      const processInput = new ProcessInfoInput();
      processInput.info_id = infoId;
      setImmediate(async () => {
        try {
          await Promise.all([
            this.vectorInfo(processInput, new VectorInfoOutput(), _context, metrics, report),
            this.tagInfo(processInput, new TagInfoOutput(), _context, metrics, report),
            // ===== 修改后（2026-09-15 记忆集中）：摘要生成恢复为 InfoCore 内建路径 ——
            // 原实现（长文本 return true）与上层 SummaryAgent 均不触发摘要，info_summary 长期空置；
            // 现 saveInfo 后统一入本方法：短文本原文即摘要，长文本经 config.llm_id 调 LLM 生成 =====
            this.summaryInfo(processInput, new SummaryInfoOutput(), _context, metrics, report),
            this.keywordInfo(processInput, new KeywordInfoOutput(), _context, metrics, report),
          ]);
        } catch (err) {
          // ===== 修改后（2026-09-15）："仅记录"原来是无输出静默吞掉，
          //      异步自学习（关键词/标签/向量）失败完全不可见，输出可见诊断 =====
          metrics?.warn(`[InfoCoreProvider] saveInfo 异步自学习处理失败（info_id=${processInput.info_id}）`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }

    return true;
  }

  /**
   * 切换 pin 状态。
   */
  async pinInfo(input: PinInfoInput, _output: PinInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
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
   * 向量化信息：按 chunk_size 分块（考虑分隔符与重叠覆盖率）后逐块生成 embedding，
   * 写入 LanceDB（向量唯一存储，不再落 SQLite）。
   */
  async vectorInfo(input: ProcessInfoInput, output: VectorInfoOutput, context: InfoCoreContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('vectorInfo 需要提供 info_id');
    }
    if (await this.hasVectorForInfo(input.info_id)) {
      output.vector_id = input.info_id;
      return true;
    }

    const infoRow = await this.getInfoByInfoId(input.info_id);
    if (!infoRow) throw new NotFoundError('信息', input.info_id);
    if (infoRow.handle_result_type !== HandleResultType.CORRECT) return true;
    const vectorConfig = await this.getInfoVectorConfig();
    if (!vectorConfig || vectorConfig.enable !== 1) return true;

    // 分块：短文本保持单向量，长文本按分隔符 + 重叠拆分
    const chunks = this.splitInfoChunks(infoRow.info, vectorConfig);

    // 逐块生成 embedding；任一块失败则整体放弃（保持幂等，后续可重试）
    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk, vectorConfig, context, metrics);
      if (!embedding || embedding.length === 0) return true;
      embeddings.push(embedding);
    }

    await this.upsertInfoChunks(input.info_id, chunks, embeddings);
    output.vector_id = input.info_id;
    return true;
  }

  /**
   * 使用 LLM 提取标签。
   *
   * 1. 检查 info_tag_config 的 enable 状态。
   * 2. 调用 LLM 提取 topK 标签。
   * 3. 为每个标签插入 info_tag 表并维护 info_tag_vector。
   */
  async tagInfo(input: ProcessInfoInput, output: TagInfoOutput, _context: InfoCoreContext, metrics?: Metrics, _report?: Report,
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
    // 错误信息不参与自学习标签提取
    if (infoRow.handle_result_type !== HandleResultType.CORRECT) {
      return true;
    }

    const tags = await this.extractTags(infoRow.info, tagConfig);
    if (!tags || tags.length === 0) {
      return true;
    }

    const now = IdGenerator.now();

    for (const tag of tags) {
      const tagId = IdGenerator.generate();
      try {
        await this.insertTag(tagId, input.info_id, tag, now);
        await this.ensureTextNode('Tag', 'tag', tag, true);
        await this.maintainTagVector(tag, tagConfig, metrics);
        await this.graphTag(Object.assign(new GraphTagInput(), { tag_id: tagId }), new GraphTagOutput(), new InfoCoreContext(), metrics);
      } catch (err) {
        // 标签重复跳过：insertTag 唯一键冲突（同一 info 已存在同名标签）属预期幂等场景；
        // 连带容忍 ensureTextNode / maintainTagVector / graphTag 图向量维护失败（best-effort，不影响保存主流程）
      }
    }

    // 共现边：同一 info 上的标签两两建立 cooccur 边（不依赖向量化）
    await this.buildCooccurEdges(tags);

    output.tags = tags;
    return true;
  }

  /** 插入一条 info_tag 记录。 */
  private async insertTag(tagId: string, infoId: string, tag: string, now: number): Promise<void> {
    await this.relationDb.insert(INFO_TAG_TABLE, [
      { field: 'id', value: tagId },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'info_id', value: infoId },
      { field: 'tag', value: tag },
    ]);
  }

  /**
   * 使用 LLM 生成摘要。
   * ===== 修改后（2026-09-15 采纳"记忆集中"要求）：摘要生成能力收敛至 InfoProvider ——
   * 短文本（≤ threshold）仍直接以原文为摘要；长文本改为本方法内经 config.llm_id +
   * config.prompt_template_id 调用 LLM 生成（原实现返回空、依赖上层 SummaryAgent 补齐，
   * 而 SummaryAgent 实际无调用方，导致 info_summary 长期空置）。原始逻辑注释保留 =====
   */
  // ===== 修改后（2026-09-15 记忆集中）：签名保留 metrics/report（与 InfoCore 其余用例一致），
  //      2026-09-22 起 metrics 透传至摘要 LLM 链路（日志唯一网关约定） =====
  async summaryInfo(input: ProcessInfoInput, output: SummaryInfoOutput, _context: InfoCoreContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('summaryInfo 需要提供 info_id');
    }

    const summaryConfig = await this.getInfoSummaryConfig();
    if (!summaryConfig || summaryConfig.enable !== 1) {
      return true;
    }

    const existingRow = await this.getInfoSummaryRow(input.info_id);
    if (existingRow) {
      output.summary_id = existingRow.id;
      return true;
    }

    const infoRow = await this.getInfoByInfoId(input.info_id);
    if (!infoRow) {
      throw new NotFoundError('信息', input.info_id);
    }

    // 类型过滤：仅作用于 LLM 生成阶段（info_types，默认 RESPONSE；短文本原文即摘要不受限，保持既有行为）
    const now = IdGenerator.now();
    let summary: string;

    // ===== 修改后：长文本由 InfoCore 自身承担 LLM 摘要生成（集中路径：config.llm_id =
    // 摘要模型、prompt_template_id=摘要模板，均可经配置更新接口调整）=====
    if (infoRow.info.length <= (summaryConfig.threshold ?? 100)) {
      summary = infoRow.info;
    } else if (this.isSummaryEligibleType(String(infoRow.info_type ?? ''), summaryConfig)) {
      summary = await this.generateSummaryText(infoRow.info, summaryConfig, metrics);
      if (!summary) return true; // LLM 不可用/未配置时无摘要落库，不阻塞保存链路
    } else {
      return true;
    }
    if (!summary) {
      return true;
    }

    const id = IdGenerator.generate();

    await this.relationDb.insert(INFO_SUMMARY_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'info_id', value: input.info_id },
      { field: 'summary', value: summary },
    ]);

    output.summary_id = id;
    return true;
  }

  /** 摘要生成类型过滤（数据处理）：info_types 为空视为全部类型 */
  private isSummaryEligibleType(infoType: string, summaryConfig: InfoSummaryConfigRecord): boolean {
    const types = String(summaryConfig.info_types ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (types.length === 0) return true;
    return types.includes(infoType);
  }

  /** 经 LLM 生成摘要（数据处理；config.llm_id / prompt_template_id 可选，缺失或失败返回空串） */
  private async generateSummaryText(
    info: string,
    summaryConfig: InfoSummaryConfigRecord,
    metrics?: Metrics,
  ): Promise<string> {
    if (!summaryConfig.llm_id) {
      metrics?.warn('[InfoCoreProvider] summaryInfo 未配置 llm_id，长文本摘要跳过（请在配置中设置摘要模型）');
      return '';
    }
    // 重试来源：llm_call_log 实测本地模型服务间歇性 CONNECT_ERROR（如 2026-09-22 上午 45 次），
    // 单次失败即丢摘要且无补偿；此处对同一内容最多尝试 SUMMARY_LLM_MAX_ATTEMPTS 次
    for (let attempt = 1; attempt <= SUMMARY_LLM_MAX_ATTEMPTS; attempt++) {
      const summary = await this.execSummaryLLM(info, summaryConfig.llm_id, metrics);
      if (summary) return summary;
      if (attempt < SUMMARY_LLM_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, SUMMARY_LLM_RETRY_DELAY_MS));
      }
    }
    return '';
  }

  /** 单次经 LLM 生成摘要（数据处理；失败返回空串并输出可见诊断） */
  private async execSummaryLLM(info: string, llmId: string, metrics?: Metrics): Promise<string> {
    try {
      const execInput = new ExecLLMInput();
      execInput.id = llmId;
      execInput.prompt = `请将以下内容浓缩为一条简洁、准确、保留关键信息与结论的摘要（不超过 15% 原文长度，不要添加任何评论或前缀）：\n\n${info}`;
      const execOutput = new ExecLLMOutput();
      await this.llmAccess.execLLM(execInput, execOutput, new LLMContext());
      return String(execOutput.result ?? '').trim();
    } catch (err) {
      metrics?.warn(`[InfoCoreProvider] 摘要生成失败（llm_id=${llmId}）`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }

  /**
   * 提取关键词（nodejieba 中文分词 + FTS5 存储）。
   */
  async keywordInfo(input: ProcessInfoInput, output: KeywordInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('keywordInfo 需要提供 info_id');
    }

    const infoRow = await this.getInfoByInfoId(input.info_id);
    if (!infoRow) {
      throw new NotFoundError('信息', input.info_id);
    }
    // 错误信息不参与自学习关键词提取
    if (infoRow.handle_result_type !== HandleResultType.CORRECT) {
      return true;
    }

    const keywords = this.extractKeywords(infoRow.info);
    if (keywords.length === 0) {
      return true;
    }

    for (const word of keywords) {
      await this.relationDb.executeRaw(
        `INSERT INTO "${INFO_KEYWORD_TABLE}" ("info_id", "word") VALUES (?, ?)`,
        [input.info_id, word],
      );
      await this.ensureTextNode('keyword', 'keyword', word, true);
    }

    // 共现边：同一 info 上的关键词两两建立 keywordCooccur 边（不依赖向量化）
    await this.buildKeywordCooccurEdges(keywords);

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
  async graphTag(input: GraphTagInput, output: GraphTagOutput, _context: InfoCoreContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.tag_id) {
      throw new ValidationError('graphTag 需要提供 tag_id');
    }
    const tagConfig = await this.getInfoTagConfig();
    if (!tagConfig || tagConfig.enable !== 1) {
      return true;
    }

    const tagText = await this.resolveTagText(input.tag_id);
    if (!tagText) {
      return true;
    }

    const nodeId = await this.ensureTagNode(tagText);
    const embedding = await this.getTagEmbedding(tagText, tagConfig, metrics);
    if (!embedding || embedding.length === 0) {
      output.node_id = nodeId;
      return true;
    }

    const similarTags = await this.searchSimilarTags(embedding, tagText, tagConfig.tag_top_k || 5);
    for (const similar of similarTags) {
      const similarNodeId = await this.ensureTagNode(similar.tag);
      await this.connectSimilarTags(nodeId, similarNodeId, similar.score, metrics);
    }

    output.node_id = nodeId;
    return true;
  }

  /**
   * 从 info_tag 表全量重建共现边（cooccur）。
   *
   * 用于存量数据回填：删除所有 cooccur 边后，按 info_id 分组重新统计标签共现对并落库。
   * 该过程幂等，可与增量 buildCooccurEdges 配合使用（tagInfo 在保存时实时建边，
   * 本方法负责历史标签的一次性回填）。
   */
  // ===== 修改后的方法（2026-09-21 涌现图错误信息隔离）=====
  // 「涌现」图节点来自 info_tag，原实现全量重建时未回溯 info_raw.handle_result_type，
  // 使系统报错信息（call_error / internal_error）派生的标签、以及已删除信息遗留的
  // 孤儿标签被重新建入 GraphDB。现重建前先清理非 correct 信息派生的标签行，重建时
  // 再按 handle_result_type=correct 过滤（见 rebuildCooccurForSource）。
  async rebuildCooccurGraph(_input: RebuildCooccurGraphInput, output: RebuildCooccurGraphOutput, _context: InfoCoreContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    // 0. 清理非正确信息 / 已删除信息派生的标签行（存量治理，防止错误标签再次入图）
    output.purged_rows = this.purgeNonCorrectTagRows(metrics);
    // 标签共现边
    const tagResult = await this.rebuildCooccurForSource(INFO_TAG_TABLE, 'tag', 'Tag', 'tag', COOCCUR_EDGE_TYPE, metrics);
    // 关键词共现边
    const kwResult = await this.rebuildCooccurForSource(INFO_KEYWORD_TABLE, 'word', 'keyword', 'keyword', KEYWORD_COOCCUR_EDGE_TYPE, metrics);
    output.deleted_edges = tagResult.deleted + kwResult.deleted;
    output.rebuilt_edges = tagResult.rebuilt + kwResult.rebuilt;
    return true;
  }

  /**
   * 清理「非正确信息」派生的标签行（数据处理）。
   *
   * 判定口径：info_tag.info_id 无法回溯到 info_raw 记录（信息已被删除的孤儿标签），
   * 或对应信息 handle_result_type 非 correct（系统报错信息）时，该标签行不属于用户信息，
   * 从 info_tag 中删除，避免被 rebuildCooccurGraph 重新建入「涌现」图。
   *
   * 幂等：仅删除匹配行，重复执行不影响正常标签；表不存在时静默跳过。
   */
  private purgeNonCorrectTagRows(metrics?: Metrics): number {
    try {
      return this.relationDb.executeRaw(
        `DELETE FROM "${INFO_TAG_TABLE}" WHERE "info_id" NOT IN (
           SELECT "info_id" FROM "${INFO_RAW_TABLE}"
           WHERE COALESCE("handle_result_type", 'correct') = 'correct'
         )`,
      );
    } catch (err) {
      metrics?.warn('[InfoCoreProvider] purgeNonCorrectTagRows 失败（已跳过）', {
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }

  /** 从指定表全量重建某类文本的节点（含频次属性）与共现边（幂等：先删后建）。 */
  private async rebuildCooccurForSource(
    table: string,
    field: string,
    nodeType: string,
    textField: string,
    edgeType: string,
    metrics?: Metrics,
  ): Promise<{ deleted: number; rebuilt: number }> {
    // 1. 删除该 node_type 的所有节点（级联删除关联边与激活数据），保证幂等重建
    const nodeSel = new SelectGraphOutput();
    await this.graphDb.selectGraph(
      { target: GraphTarget.NODE, node_type: nodeType } as SelectGraphInput,
      nodeSel, new GraphContext(),
    );
    const nodeIds = (nodeSel.list as GraphNodeRecord[]).map((n) => n.id);
    if (nodeIds.length > 0) {
      await this.graphDb.delGraphNode(
        { ids: nodeIds } as DelGraphNodeInput,
        new DelGraphNodeOutput(), new GraphContext(),
      );
    }

    // 2. 读表：统计频次 + 按 info_id 分组
    // ===== 修改后（2026-09-21 涌现图错误信息隔离）：INNER JOIN info_raw 且仅保留
    // handle_result_type=correct 的信息派生的标签/关键词，系统报错信息（call_error /
    // internal_error）与已删除信息（无 info_raw）产生的文本不再被建入图谱 =====
    const rows = this.relationDb.queryRaw<Record<string, unknown>>(
      `SELECT t."info_id" AS "info_id", t."${field}" AS "${field}"
         FROM "${table}" t
         INNER JOIN "${INFO_RAW_TABLE}" r ON r."info_id" = t."info_id"
        WHERE COALESCE(r."handle_result_type", 'correct') = 'correct'
        ORDER BY t."info_id" ASC`,
    );
    const freqMap = new Map<string, number>();
    const byInfo = new Map<string, string[]>();
    for (const row of rows) {
      const infoId = String(row['info_id'] ?? '');
      const text = String(row[field] ?? '').trim();
      if (!infoId || !text) continue;
      freqMap.set(text, (freqMap.get(text) || 0) + 1);
      const list = byInfo.get(infoId);
      if (list) list.push(text);
      else byInfo.set(infoId, [text]);
    }

    // 3. 建节点（content 含频次属性 freq，节点属性完全存于 GraphDB）
    const textToId = new Map<string, string>();
    for (const [text, freq] of freqMap) {
      const out = new AddGraphNodeOutput();
      await this.graphDb.addGraphNode(
        {
          data: { node_type: nodeType, content: { [textField]: text, freq } } as GraphNodeData,
        } as AddGraphNodeInput,
        out, new GraphContext(),
      );
      textToId.set(text, out.id);
    }

    // 4. 统计共现对（去重、累加共现次数），一次性建共现边
    const edgeMap = new Map<string, { fromId: string; toId: string; weight: number }>();
    for (const items of byInfo.values()) {
      const unique = Array.from(new Set(items));
      if (unique.length < 2) continue;
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const a = unique[i] < unique[j] ? unique[i] : unique[j];
          const b = unique[i] < unique[j] ? unique[j] : unique[i];
          const fromId = textToId.get(a);
          const toId = textToId.get(b);
          if (!fromId || !toId) continue;
          const key = `${fromId}\u0001${toId}`;
          const existing = edgeMap.get(key);
          if (existing) existing.weight += 1;
          else edgeMap.set(key, { fromId, toId, weight: 1 });
        }
      }
    }
    let rebuilt = 0;
    for (const e of edgeMap.values()) {
      await this.addCooccurEdge(e.fromId, e.toId, edgeType, e.weight, metrics);
      rebuilt++;
    }
    return { deleted: nodeIds.length, rebuilt };
  }

  // =========================================================================
  // Search Operations
  // =========================================================================

  /**
   * 时间线搜索：返回最近 N 条信息记录。
   * 若 info 已被老化清空，回退查询 info_summary 表获取摘要替代。
   */
  async lastNInfo(input: LastNInfoInput, output: LastNInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
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
    if (input.run_id) {
      conditions.push({ field: 'run_id', operator: Operator.EQ, value: input.run_id });
    }
    if (input.info_creator_id) {
      conditions.push({ field: 'info_creator_id', operator: Operator.EQ, value: input.info_creator_id });
    }
    if (input.info_creator_role) {
      conditions.push({ field: 'info_creator_role', operator: Operator.EQ, value: input.info_creator_role });
    }
    if (input.info_type) {
      conditions.push({ field: 'info_type', operator: Operator.EQ, value: input.info_type });
    }
    if (input.info_id) {
      conditions.push({ field: 'info_id', operator: Operator.EQ, value: input.info_id });
    }
    if (input.handle_result_type) {
      conditions.push({ field: 'handle_result_type', operator: Operator.EQ, value: input.handle_result_type });
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
  async graphNInfo(input: GraphNInfoInput, output: GraphNInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
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
    await this.graphDb.soGraphNeighbors(
      {
        node_id: infoNodeId,
        depth: 1,
        direction: GraphDirection.BOTH,
      } as GetGraphNeighborsInput,
      neighOutput, new GraphContext(),
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

    const graphConditions: Condition[] = [{ field: 'info_id', operator: Operator.IN, value: infoIds }];
    if (input.handle_result_type) {
      graphConditions.push({ field: 'handle_result_type', operator: Operator.EQ, value: input.handle_result_type });
    }
    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: graphConditions,
      order_by: [{ field: 'created', direction: 'DESC' }],
      page: { current: 1, size: input.lastN },
    });

    output.list = rows.map((r) => this.toInfoRawRecord(r));
    return true;
  }

  /**
   * 语义相似度搜索：生成 embedding 后，由 LanceDB 执行向量相似度检索。
   *
   * 返回语义最相似的 topK 条信息记录（含归一化相似度分数 score）。
   * 阈值 similarity_threshold 为归一化值 0-100。
   */
  async similarKInfo(input: SimilarKInfoInput, output: SimilarKInfoOutput, context: InfoCoreContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.info || !input.topK) {
      throw new ValidationError('similarKInfo 需要提供 info 和 topK');
    }

    const vectorConfig = await this.getInfoVectorConfig();
    if (!vectorConfig || vectorConfig.enable !== 1 || !vectorConfig.llm_id) {
      output.list = [];
      return true;
    }

    const embedding = await this.generateEmbedding(input.info, vectorConfig, context, metrics);
    if (!embedding || embedding.length === 0) {
      output.list = [];
      return true;
    }

    // 检索时放大 topK（一个 info 可能拆成多个 chunk），
    // 聚合去重后再截取回 topK 个 info，保证返回足够多不同信息。
    const topK = Math.max(1, Math.floor(input.topK));
    const hits = await this.searchInfoVectors(embedding, topK * 3, input.similarity_threshold ?? 0);
    const scored = await this.toScoredInfoList(hits);
    output.list = scored.slice(0, topK);
    return true;
  }

  /**
   * 关键词搜索：从 FTS5 表检索匹配的关键词。
   *
   * PRD 2.5.4：nodejieba 分词得到关键词列表后，使用 SQLite FTS5 MATCH 语法在
   * info_keyword 虚拟表中执行全文搜索，按 bm25 相关性评分降序返回匹配信息。
   */
  async keywordKInfo(input: KeywordKInfoInput, output: KeywordKInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.info) {
      throw new ValidationError('keywordKInfo 需要提供 info');
    }

    const keywords = this.extractKeywords(input.info);
    if (keywords.length === 0) {
      output.list = [];
      return true;
    }

    // FTS5 MATCH：关键词列表以 OR 组合做全文搜索（每个关键词按词条整体匹配，
    // 避免拆分为子 token），仅检索 word 列，避免命中 info_id 列产生误召回。
    const matchExpr = keywords
      .map((k) => `word:"${k.replace(/"/g, '""')}"`)
      .join(' OR ');

    let keywordRows: Array<{ info_id: string; rank: number }>;
    try {
      keywordRows = this.relationDb.queryRaw<{ info_id: string; rank: number }>(
        `SELECT "info_id", bm25("${INFO_KEYWORD_TABLE}") AS "rank" FROM "${INFO_KEYWORD_TABLE}" WHERE "${INFO_KEYWORD_TABLE}" MATCH ? ORDER BY "rank" ASC`,
        [matchExpr],
      );
    } catch {
      // FTS5 MATCH 语法异常（极端关键词含特殊字符）时降级为空结果，不影响上层上下文构建
      keywordRows = [];
    }

    if (keywordRows.length === 0) {
      output.list = [];
      return true;
    }

    // bm25 越小相关性越高；每条 info 的每个关键词占一行，故按 info_id 聚合：
    // 取最小（最优）bm25 作为该 info 的相关度，命中关键词次数作为次要信息。
    const bestRankMap = new Map<string, number>();
    const matchCountMap = new Map<string, number>();
    for (const row of keywordRows) {
      const iid = row.info_id;
      const rank = Number(row.rank);
      const prev = bestRankMap.get(iid);
      if (prev === undefined || rank < prev) bestRankMap.set(iid, rank);
      matchCountMap.set(iid, (matchCountMap.get(iid) || 0) + 1);
    }

    // bm25 归一化到 0-100（min-max 全量归一化）：将本次命中集合的 bm25 值域
    // [minRank, maxRank] 线性映射到 [100, 0]（最优命中 = 100，最差命中 = 0）。
    // 供上层（如 context）按 keyword_score 阈值截断低相关命中。
    const ranks = [...bestRankMap.values()];
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    const span = maxRank - minRank;
    const normalizeScore = (rank: number): number => {
      if (span <= 0) return 100; // 仅单一命中或 bm25 完全一致时等权视为满分
      const s = (100 * (maxRank - rank)) / span;
      return Math.max(0, Math.min(100, Math.round(s)));
    };

    const sortedIds = [...bestRankMap.entries()]
      .sort((a, b) => a[1] - b[1])
      .map((e) => e[0]);

    const infoMap = await this.getInfoBatchByInfoIds(sortedIds);
    const results: Array<InfoRawRecord & { keyword_match_count?: number; keyword_score?: number }> = [];
    for (const infoId of sortedIds) {
      const infoRow = infoMap.get(infoId);
      if (infoRow) {
        results.push({
          ...infoRow,
          keyword_match_count: matchCountMap.get(infoId),
          keyword_score: normalizeScore(bestRankMap.get(infoId) ?? 0),
        });
      }
    }

    output.list = results;
    return true;
  }

  /**
   * 标签关联搜索：通过标签间的相似性图（similarTo 边）查找最相关的信息。
   *
   * 权重口径：以 similarTo 边的 weight（向量相似度）作为标签相关度，沿标签图扩散到目标信息，
   * 按累计相关度降序返回 topN 条，使标签图召回真正按相关性排序（而非时间倒序）。
   */
  async relationKInfo(input: RelationKInfoInput, output: RelationKInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.info_id || !input.topN) {
      throw new ValidationError('relationKInfo 需要提供 info_id 和 topN');
    }

    const selfTags = await this.ensureSelfTagNames(input.info_id);
    const relatedTags = await this.collectRelatedTags(selfTags);
    const infoWeights = await this.findInfoWeightsByTags(relatedTags);
    infoWeights.delete(input.info_id);

    output.list = await this.loadRelatedInfo(infoWeights, input.topN);
    return true;
  }

  /** 获取目标信息的标签名；无标签时即时抽取兜底。 */
  private async ensureSelfTagNames(infoId: string): Promise<string[]> {
    const rows = await this.relationDb.select(INFO_TAG_TABLE, {
      conditions: [{ field: 'info_id', operator: Operator.EQ, value: infoId }],
      fields: ['tag'],
    });
    if (rows.length > 0) return rows.map((r) => r['tag'] as string);
    const tagConfig = await this.getInfoTagConfig();
    if (tagConfig?.enable !== 1) return [];
    const infoRow = await this.getInfoByInfoId(infoId);
    if (!infoRow) return [];
    return this.extractTags(infoRow.info, tagConfig);
  }

  /** 汇总各标签经 similarTo 边关联的其它标签及其相关度权重（多标签命中同一目标取最大相似度）。 */
  private async collectRelatedTags(
    selfTagNames: string[],
  ): Promise<Array<{ tag: string; weight: number }>> {
    const weightMap = new Map<string, number>();
    for (const tagName of selfTagNames) {
      for (const similar of await this.findSimilarTagEdges(tagName)) {
        const prev = weightMap.get(similar.tag) ?? 0;
        weightMap.set(similar.tag, Math.max(prev, similar.weight));
      }
    }
    return [...weightMap.entries()]
      .map(([tag, weight]) => ({ tag, weight }))
      .sort((a, b) => b.weight - a.weight);
  }

  /** 查找与标签节点相连的 similarTo 边对应的其它标签文本与相关度权重（边 weight / properties.similarity）。 */
  private async findSimilarTagEdges(tagName: string): Promise<Array<{ tag: string; weight: number }>> {
    const nodeId = await this.findGraphNodeId('Tag', 'tag', tagName);
    if (!nodeId) return [];
    const out = new SelectGraphOutput();
    await this.graphDb.selectGraph(
      {
        target: GraphTarget.EDGE,
        edge_type: 'similarTo',
        conditions: [
          { field: 'from_node_id', operator: Operator.EQ, value: nodeId },
          { field: 'to_node_id', operator: Operator.EQ, value: nodeId, logic: 'OR' },
        ],
      } as SelectGraphInput,
      out, new GraphContext(),
    );
    const result: Array<{ tag: string; weight: number }> = [];
    for (const edge of out.list as GraphEdgeRecord[]) {
      const other = edge.from_node_id === nodeId ? edge.to_node_id : edge.from_node_id;
      const tagNodeOut = new GetGraphNodeOutput();
      await this.graphDb.soGraphNode({ id: other } as GetGraphNodeInput, tagNodeOut, new GraphContext());
      const tag = String(tagNodeOut.node?.content['tag'] ?? '');
      if (!tag) continue;
      const weight = Number(edge.weight ?? 0)
        || Number((edge.properties as Record<string, unknown> | null)?.['similarity'] ?? 0)
        || 0;
      result.push({ tag, weight });
    }
    result.sort((a, b) => b.weight - a.weight);
    return result;
  }


  /** 按关联标签反向查询 info_id 及其累计相关度权重（多标签命中同一 info 取最大权重）。 */
  private async findInfoWeightsByTags(
    relatedTags: Array<{ tag: string; weight: number }>,
  ): Promise<Map<string, number>> {
    const weightMap = new Map<string, number>();
    for (const { tag, weight } of relatedTags) {
      const rows = await this.relationDb.select(INFO_TAG_TABLE, {
        conditions: [{ field: 'tag', operator: Operator.EQ, value: tag }],
        fields: ['info_id'],
      });
      for (const r of rows) {
        const infoId = r['info_id'] as string;
        const prev = weightMap.get(infoId) ?? 0;
        weightMap.set(infoId, Math.max(prev, weight));
      }
    }
    return weightMap;
  }

  /** 按累计相关度权重降序加载关联信息记录（含 relevance_score）。 */
  private async loadRelatedInfo(
    weightedIds: Map<string, number>,
    topN: number,
  ): Promise<Array<InfoRawRecord & { relevance_score?: number }>> {
    const entries = [...weightedIds.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);
    const infoIds = entries.map((e) => e[0]);
    const infoMap = await this.getInfoBatchByInfoIds(infoIds);
    const results: Array<InfoRawRecord & { relevance_score?: number }> = [];
    for (const [infoId, weight] of entries) {
      const row = infoMap.get(infoId);
      if (row) {
        results.push({ ...row, relevance_score: weight });
      }
    }
    return results;
  }

  /**
   * 会话图可视化：构建 session 内信息引用图。
   */
  async graphInfo(input: GraphInfoInput, output: GraphInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('graphInfo 需要提供 session_id');
    }

    const graphInfoConditions: Condition[] = [{ field: 'session_id', operator: Operator.EQ, value: input.session_id }];
    if (input.handle_result_type) {
      graphInfoConditions.push({ field: 'handle_result_type', operator: Operator.EQ, value: input.handle_result_type });
    }
    const infoRows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: graphInfoConditions,
    });

    const infoIds = new Set(infoRows.map((r) => r['info_id'] as string));

    const citeEdgesOut = new SoCitationEdgesOutput();
    await this.soCitationEdges(Object.assign(new SoCitationEdgesInput(), { session_id: input.session_id }), citeEdgesOut, _context);

    // 节点统一以 info_id 作为 id（与边的 from/to 同命名空间）
    const nodes = infoRows.map((r) => ({
      id: r['info_id'] as string,
      label: (r['info'] as string).slice(0, 80),
      info_id: r['info_id'] as string,
      info_type: r['info_type'] as string,
      info_creator_role: r['info_creator_role'] as string,
      handle_result_type: (r['handle_result_type'] as string) || DEFAULT_HANDLE_RESULT_TYPE,
    }));

    // 引用边（GraphDB CITATION 边：用户引用其他消息）
    const citationEdges = citeEdgesOut.edges
      .filter((e) => infoIds.has(e.citing_info_id) && infoIds.has(e.cited_info_id))
      .map((e) => ({
        id: e.id,
        from: e.citing_info_id,
        to: e.cited_info_id,
        citing_info_id: e.citing_info_id,
        cited_info_id: e.cited_info_id,
        edge_type: 'CITATION',
      }));

    // 问答边（同 run_id 的 REQUEST → RESPONSE）
    const byInteract = new Map<string, { request?: string; response?: string }>();
    for (const r of infoRows) {
      const runId = r['run_id'] as string;
      const infoId = r['info_id'] as string;
      const infoType = (r['info_type'] as string) || '';
      if (!runId) continue;
      if (!byInteract.has(runId)) byInteract.set(runId, {});
      const g = byInteract.get(runId)!;
      if (infoType === 'REQUEST') g.request = infoId;
      else if (infoType === 'RESPONSE') g.response = infoId;
    }
    const replyEdges: Array<{ id: string; from: string; to: string; citing_info_id: string; cited_info_id: string; edge_type: string }> = [];
    for (const [runId, g] of byInteract) {
      if (g.request && g.response) {
        replyEdges.push({
          id: `reply-${runId}`,
          from: g.request,
          to: g.response,
          citing_info_id: g.request,
          cited_info_id: g.response,
          edge_type: 'REPLY',
        });
      }
    }

    output.graph = { nodes, edges: [...replyEdges, ...citationEdges] };
    return true;
  }

  /**
   * 查询 GraphDB 引用边（CITATION），替代旧 info_graph 表的读取。
   *
   * 返回 info_id 维度的引用关系（citing → cited）。可选按 session_id / citing_info_id /
   * cited_info_id 过滤；session_id 取自边 properties 中记录的引用方（citing）所属会话。
   */
  async soCitationEdges(input: SoCitationEdgesInput, output: SoCitationEdgesOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const selOut = new SelectGraphOutput();
    await this.graphDb.selectGraph(
      { target: GraphTarget.EDGE, edge_type: CITATION_EDGE_TYPE } as SelectGraphInput,
      selOut, new GraphContext(),
    );
    const edges = (selOut.list as GraphEdgeRecord[]).map((e) => ({
      id: e.id,
      citing_info_id: String(e.properties?.['citing_info_id'] ?? ''),
      cited_info_id: String(e.properties?.['cited_info_id'] ?? ''),
      session_id: String(e.properties?.['session_id'] ?? ''),
    }));
    let result = edges;
    if (input.session_id) result = result.filter((e) => e.session_id === input.session_id);
    if (input.citing_info_id) result = result.filter((e) => e.citing_info_id === input.citing_info_id);
    if (input.cited_info_id) result = result.filter((e) => e.cited_info_id === input.cited_info_id);
    output.edges = result;
    return true;
  }

  /**
   * 级联删除 GraphDB 中的 info 节点及关联的引用边（CITATION）。
   *
   * 供删除记忆 / 删除会话时调用，替代旧 info_graph 表的级联清理。
   */
  async delInfoGraph(input: DelInfoGraphInput, output: DelInfoGraphOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const infoIds = (input.info_ids ?? []).map((x) => String(x)).filter(Boolean);
    if (infoIds.length === 0) {
      output.deleted_nodes = 0;
      return true;
    }
    const nodeIds: string[] = [];
    for (const infoId of infoIds) {
      const nodeId = await this.findInfoGraphNodeId(infoId);
      if (nodeId) nodeIds.push(nodeId);
    }
    if (nodeIds.length === 0) {
      output.deleted_nodes = 0;
      return true;
    }
    const delOut = new DelGraphNodeOutput();
    await this.graphDb.delGraphNode({ ids: nodeIds } as DelGraphNodeInput, delOut, new GraphContext());
    output.deleted_nodes = delOut.affected_rows;
    return true;
  }

  /**
   * 一键清理某类文本图（如标签图 / 关键词图）：删除该 node_type 的所有节点，
   * 级联删除关联的边与激活数据。
   */
  async clearGraph(input: ClearGraphInput, output: ClearGraphOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const nodeType = String(input.node_type ?? '').trim();
    if (!nodeType) {
      throw new ValidationError('clearGraph 需要提供 node_type');
    }
    const selOut = new SelectGraphOutput();
    await this.graphDb.selectGraph(
      { target: GraphTarget.NODE, node_type: nodeType } as SelectGraphInput,
      selOut, new GraphContext(),
    );
    const nodeIds = (selOut.list as GraphNodeRecord[]).map((n) => n.id);
    if (nodeIds.length > 0) {
      await this.graphDb.delGraphNode(
        { ids: nodeIds } as DelGraphNodeInput,
        new DelGraphNodeOutput(), new GraphContext(),
      );
    }
    output.deleted_nodes = nodeIds.length;
    return true;
  }

  /**
   * 迁移旧 info_graph 表数据到 GraphDB（一次性），迁移完成后删除旧表。
   *
   * 旧实现把 info 引用边存在 RelationDB 的 info_graph 表；本方法将存量引用边迁移为
   * GraphDB 的 CITATION 边（info 节点 + 边），随后 DROP 旧表，实现图结构收敛到 GraphDB。
   */
  async rebuildCitationGraph(_input: RebuildCitationGraphInput, output: RebuildCitationGraphOutput, _context: InfoCoreContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    // 旧表在迁移收敛后已 DROP：先查 sqlite_master 判断存在性，
    // 避免对已迁移库每次查询都触发 RelationDB 的 ERROR 级 "no such table" 日志
    const legacyExists = (this.relationDb.queryRaw<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [LEGACY_INFO_GRAPH_TABLE],
    )?.[0]?.c ?? 0) > 0;
    let legacyRows: Array<Record<string, unknown>> = [];
    if (legacyExists) {
      try {
        legacyRows = await this.relationDb.select(LEGACY_INFO_GRAPH_TABLE, {});
      } catch {
        legacyRows = [];
      }
    }

    let migrated = 0;
    for (const row of legacyRows) {
      const citing = String(row['citing_info_id'] ?? '');
      const cited = String(row['cited_info_id'] ?? '');
      const session = String(row['session_id'] ?? '');
      if (!citing || !cited) continue;
      const citingInfo = await this.getInfoByInfoId(citing);
      const citedInfo = await this.getInfoByInfoId(cited);
      const fromNodeId = await this.ensureInfoGraphNode(citing, { session_id: session, info: citingInfo?.info ?? '' });
      const toNodeId = await this.ensureInfoGraphNode(cited, { session_id: citedInfo?.session_id ?? session, info: citedInfo?.info ?? '' });
      await this.connectCitationEdge(fromNodeId, toNodeId, citing, cited, session, metrics);
      migrated++;
    }
    output.migrated_edges = migrated;

    try {
      await this.relationDb.executeRaw(`DROP TABLE IF EXISTS "${LEGACY_INFO_GRAPH_TABLE}"`);
      output.dropped_table = true;
    } catch {
      output.dropped_table = false;
    }
    return true;
  }

  /**
   * 构建 Agent 上下文：多源融合（复选消息、钉住消息、时间线消息、标签关联、向量相似度、关键词、随机抽样）。
   *
   * 来源及优先级：
   * a. Selected — 复选消息（若提供 selected_msg_ids，本次问答仅根据复选消息与钉住消息构建）
   * b. Pinned   — 钉住消息（强制位于最前）
   * c. Timeline — lastNInfo（时间顺序lastN消息）
   * d. Tag      — relationKInfo（标签相关消息，需提供 info_id）
   * e. Similarity — similarKInfo（相似度相关消息）
   * f. Keyword  — keywordKInfo（关键词相关消息）
   * g. Random   — 随机抽样
   */
  async context(input: ContextInfoInput, output: ContextInfoOutput, _context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    this.validateContextInput(input);
    const contextConfig = await this.getInfoContextConfig();
    const plan = this.prepareContextBuildPlan(input, contextConfig);
    // 基础上下文候选：钉住消息（PINNED）+ 复选消息（CITING）替换时间线（无复选退化为纯时间线）+ 当前消息
    const pinnedCandidates = await this.collectPinnedCandidates(input.session_id);
    const base = await this.collectSelectedOrTimelineCandidates(input, plan.selectedIds, plan.timelineLimit);
    const currentCandidate = await this.extractCurrentCandidate(input.session_id, plan.selectedIds, base.timelineCandidates);
    const baseContextCount = pinnedCandidates.length + base.citingCandidates.length + base.timelineCandidates.length;
    const limits = this.resolveWeakDimensionLimits(contextConfig, baseContextCount);
    const { refText, refInfoRow } = await this.resolveReferenceText(input, base.citingCandidates, base.timelineCandidates);
    const weak = await this.collectWeakDimensionCandidates(input.session_id, refText, refInfoRow, limits, plan.enableCrossSession, _context, metrics, report);
    const randCandidates = await this.collectRandomCandidates(input.session_id, limits.randLimit, plan.enableCrossSession, pinnedCandidates, base.citingCandidates, currentCandidate, metrics);
    this.excludeCurrentFromWeakDimensions(currentCandidate, [weak.tag, weak.sim, weak.kw, randCandidates]);
    // 装配回写：剔除执行轨迹 → 批量预取摘要 → 按优先级去重收集 → 分类统计 → 三对象落盘
    const candidatesMap = this.buildContextCandidatesMap({
      pinned: pinnedCandidates, citing: base.citingCandidates, timeline: base.timelineCandidates,
      tag: weak.tag, sim: weak.sim, kw: weak.kw, rand: randCandidates,
    });
    const priorityList = this.parseContextPriorityList(contextConfig?.priority_order);
    const summaryMap = await this.prefetchContextSummaries(priorityList, candidatesMap, currentCandidate);
    const collectedItems = this.collectDedupedContextItems(priorityList, candidatesMap, summaryMap, currentCandidate);
    output.list = collectedItems.slice(0, plan.maxTotal);
    output.categories = this.buildContextCategories(output.list);
    output.category_ids = this.buildContextCategoryIds(output.categories!);
    output.sources_summary = this.buildContextSourcesSummary(output.categories!);
    await this.fillContextTriplesAndPersist(output, output.list, input.work_id, input.persist_snapshot !== false, metrics);
    return true;
  }

  // =========================================================================
  // Search Operations (context 查询)
  // =========================================================================

  /**
   * 按 work_id 查询该次问答使用到的上下文（三对象结构）。
   *
   * 流程：
   * 1. 从 info_context_source 表读取 work_id 下各来源的 info_id 列表。
   * 2. 回查 info_raw 补内容与属性（info 已老化清空时回退摘要）。
   */
  async soContextByWork(input: SoContextByWorkInput, output: SoContextByWorkOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.work_id) {
      throw new ValidationError('soContextByWork 需要提供 work_id');
    }

    const rows = await this.relationDb.select(INFO_CONTEXT_SOURCE_TABLE, {
      conditions: [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }],
      order_by: [{ field: 'created', direction: 'ASC' }],
    });

    const sourceIdsMap: ContextSourceIdMap = {};
    for (const row of rows) {
      const source = String(row['source'] ?? '') as CollectionSource;
      const infoId = String(row['info_id'] ?? '');
      if (!source || !infoId) continue;
      if (!sourceIdsMap[source]) sourceIdsMap[source] = [];
      sourceIdsMap[source]!.push(infoId);
    }

    const contentMap: ContextContentMap = {};
    const attributeMap: ContextAttributeMap = {};

    for (const infoIds of Object.values(sourceIdsMap)) {
      for (const infoId of infoIds ?? []) {
        if (!infoId || contentMap[infoId] !== undefined) continue;
        const record = await this.getInfoByInfoId(infoId);
        if (!record) continue;

        let content = record.info || '';
        if (!content) {
          const summary = await this.getInfoSummaryRow(infoId);
          if (summary?.summary) content = `[摘要] ${summary.summary}`;
        }
        contentMap[infoId] = content;
        attributeMap[infoId] = {
          info_id: record.info_id,
          session_id: record.session_id,
          work_id: record.work_id || '',
          run_id: record.run_id || '',
          info_type: record.info_type || '',
          info_creator_role: record.info_creator_role || '',
          info_creator_id: record.info_creator_id || '',
          pin: record.pin ?? 0,
          created: record.created,
          updated: record.updated,
          handle_result_type: record.handle_result_type || DEFAULT_HANDLE_RESULT_TYPE,
        };
      }
    }

    output.source_ids_map = sourceIdsMap;
    output.content_map = contentMap;
    output.attribute_map = attributeMap;
    return true;
  }

  // =========================================================================
  // Config Operations
  // =========================================================================

  /** 获取标签配置 */
  async soInfoTagConfig(_input: SoInfoTagConfigInput, output: SoInfoTagConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.config = await this.getInfoTagConfig();
    return true;
  }

  /** 更新标签配置（upsert） */
  async updateInfoTagConfig(input: UpdateInfoTagConfigInput, _output: UpdateInfoTagConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.llm_id) {
      const llmOutput = new GetLLMOutput();
      await this.llmAccess.soLLMById({ id: input.llm_id } as GetLLMInput, llmOutput, new LLMContext());
      if (!llmOutput.llm) {
        throw new ValidationError(`llm_id ${input.llm_id} 不存在`);
      }
      if (llmOutput.llm.llm_type !== 'text') {
        throw new ValidationError(`llm_id ${input.llm_id} 不是文本模型（llm_type=${llmOutput.llm.llm_type}），标签生成仅支持 text 类型模型`);
      }
    }
    if (input.prompt_template_id) {
      const promptOutput = new GetPromptOutput();
      await this.promptsAccess.soPromptById({ id: input.prompt_template_id } as GetPromptInput, promptOutput, new PromptContext());
      if (!promptOutput.prompt) {
        throw new ValidationError(`prompt_template_id ${input.prompt_template_id} 不存在`);
      }
    }
    if (input.tag_top_k !== undefined) {
      if (!Number.isInteger(input.tag_top_k) || input.tag_top_k < 1) {
        throw new ValidationError('tag_top_k 必须为 >= 1 的整数');
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
  async soInfoSummaryConfig(_input: SoInfoSummaryConfigInput, output: SoInfoSummaryConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.config = await this.getInfoSummaryConfig();
    return true;
  }

  /** 更新摘要配置 */
  async updateInfoSummaryConfig(input: UpdateInfoSummaryConfigInput, _output: UpdateInfoSummaryConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.llm_id) {
      const llmOutput = new GetLLMOutput();
      await this.llmAccess.soLLMById({ id: input.llm_id } as GetLLMInput, llmOutput, new LLMContext());
      if (!llmOutput.llm) {
        throw new ValidationError(`llm_id ${input.llm_id} 不存在`);
      }
      if (llmOutput.llm.llm_type !== 'text') {
        throw new ValidationError(`llm_id ${input.llm_id} 不是文本模型（llm_type=${llmOutput.llm.llm_type}），摘要生成仅支持 text 类型模型`);
      }
    }
    if (input.prompt_template_id) {
      const promptOutput = new GetPromptOutput();
      await this.promptsAccess.soPromptById({ id: input.prompt_template_id } as GetPromptInput, promptOutput, new PromptContext());
      if (!promptOutput.prompt) {
        throw new ValidationError(`prompt_template_id ${input.prompt_template_id} 不存在`);
      }
    }
    await this.upsertConfigRow(INFO_SUMMARY_CONFIG_TABLE, input, {
      defaultRecord: {
        llm_id: '',
        prompt_template_id: '',
        enable: 1,
        threshold: 100,
        info_types: 'RESPONSE',
      },
    });
    return true;
  }

  /** 获取全局配置 */
  async soInfoConfig(_input: SoInfoConfigInput, output: SoInfoConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.config = await this.getInfoConfig();
    return true;
  }

  /** 更新全局配置 */
  async updateInfoConfig(input: UpdateInfoConfigInput, _output: UpdateInfoConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.alive_max_days !== undefined) {
      if (!Number.isInteger(input.alive_max_days) || input.alive_max_days < 1) {
        throw new ValidationError('alive_max_days 必须为 >= 1 的整数');
      }
    }
    await this.upsertConfigRow(INFO_CONFIG_TABLE, input, {
      defaultRecord: {
        alive_max_days: 30,
      },
    });
    return true;
  }

  /** 获取向量配置 */
  async soInfoVectorConfig(_input: SoInfoVectorConfigInput, output: SoInfoVectorConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.config = await this.getInfoVectorConfig();
    return true;
  }

  /** 更新向量配置 */
  async updateInfoVectorConfig(input: UpdateInfoVectorConfigInput, _output: UpdateInfoVectorConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.dimension !== undefined) {
      const vectorCount = await this.vectorDb.soVectorCount();
      if (vectorCount > 0) {
        throw new ValidationError('dimension 只允许在没有计算过向量数据的情况下修改');
      }
    }
    if (input.llm_id) {
      const llmOutput = new GetLLMOutput();
      await this.llmAccess.soLLMById({ id: input.llm_id } as GetLLMInput, llmOutput, new LLMContext());
      if (!llmOutput.llm) {
        throw new ValidationError(`llm_id ${input.llm_id} 不存在`);
      }
      if (llmOutput.llm.llm_type !== 'embedding') {
        throw new ValidationError(`llm_id ${input.llm_id} 不是向量模型（llm_type=${llmOutput.llm.llm_type}），向量化仅支持 embedding 类型模型`);
      }
    }
    if (input.chunk_size !== undefined && (!Number.isInteger(input.chunk_size) || input.chunk_size <= 0)) {
      throw new ValidationError('chunk_size 必须为正整数');
    }
    if (input.chunk_overlap !== undefined && (!Number.isInteger(input.chunk_overlap) || input.chunk_overlap < 0)) {
      throw new ValidationError('chunk_overlap 必须为 >= 0 的整数');
    }
    // 维度变更需同步重建向量表（applyDimension 内部校验 LanceDB 无数据时重建）
    if (input.dimension !== undefined) {
      await this.vectorDb.applyDimension(input.dimension);
    }
    await this.upsertConfigRow(INFO_VECTOR_CONFIG_TABLE, input, {
      defaultRecord: {
        llm_id: '',
        dimension: 1536,
        enable: 1,
        chunk_size: 512,
        chunk_overlap: 64,
      },
    });
    return true;
  }

  /** 获取上下文构建配置 */
  async soInfoContextConfig(_input: SoInfoContextConfigInput, output: SoInfoContextConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.config = await this.getInfoContextConfig();
    return true;
  }

  /** 更新上下文构建配置 */
  async updateInfoContextConfig(input: UpdateInfoContextConfigInput, _output: UpdateInfoContextConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const assertNonNegativeInt = (val: number | undefined, label: string) => {
      if (val !== undefined && (!Number.isInteger(val) || val < 0)) {
        throw new ValidationError(`${label} 必须为 >= 0 的整数`);
      }
    };
    assertNonNegativeInt(input.base_timeline_count, 'base_timeline_count');
    assertNonNegativeInt(input.base_tag_relative_count, 'base_tag_relative_count');
    assertNonNegativeInt(input.base_similarity_count, 'base_similarity_count');
    assertNonNegativeInt(input.base_keyword_count, 'base_keyword_count');
    assertNonNegativeInt(input.base_random_count, 'base_random_count');
    assertNonNegativeInt(input.random_max_percent, 'random_max_percent');
    assertNonNegativeInt(input.tag_relative_max_percent, 'tag_relative_max_percent');
    assertNonNegativeInt(input.similarity_max_percent, 'similarity_max_percent');
    assertNonNegativeInt(input.keyword_max_percent, 'keyword_max_percent');
    assertNonNegativeInt(input.keyword_score_threshold, 'keyword_score_threshold');
    if (input.total !== undefined && (!Number.isInteger(input.total) || input.total < 1)) {
      throw new ValidationError('total 必须为 >= 1 的整数');
    }
    const dataInput: Record<string, unknown> = { ...input };
    if (input.enable_snapshot_persistence !== undefined) {
      dataInput.enable_snapshot_persistence = input.enable_snapshot_persistence ? 1 : 0;
    }
    if (input.priority_order !== undefined) {
      dataInput.priority_order = String(input.priority_order);
    }
    await this.upsertConfigRow(INFO_CONTEXT_CONFIG_TABLE, dataInput, {
      defaultRecord: {
        base_timeline_count: 500,
        base_tag_relative_count: 200,
        base_similarity_count: 150,
        base_keyword_count: 100,
        base_random_count: 50,
        random_max_percent: 5,
        tag_relative_max_percent: 20,
        similarity_max_percent: 15,
        keyword_max_percent: 10,
        keyword_score_threshold: 95,
        total: 1000,
        enable_snapshot_persistence: 1,
        priority_order: 'PINNED,CITING,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM',
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
  async delInfo(_input: DelInfoInput, output: DelInfoOutput, _context: InfoCoreContext, metrics?: Metrics, report?: Report,
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
        await this.vectorInfo(vi, new VectorInfoOutput(), _context, metrics, report).catch(() => {});
      }
      if (tagConfig?.enable === 1 && !hasTag) {
        const ti = new ProcessInfoInput(); ti.info_id = infoId;
        await this.tagInfo(ti, new TagInfoOutput(), _context, metrics, report).catch(() => {});
      }
      if (summaryConfig?.enable === 1 && !hasSummary) {
        const si = new ProcessInfoInput(); si.info_id = infoId;
        await this.summaryInfo(si, new SummaryInfoOutput(), _context, metrics, report).catch(() => {});
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

  /**
   * 补生成缺失摘要（幂等）：长文本（超过 threshold）且无 info_summary 行的正常信息，
   * 逐条复用 summaryInfo 补生成。用于 LLM 间歇性 CONNECT_ERROR 导致的摘要丢失补偿，
   * 供服务启动时调用（与 delInfo 老化清理同模式）。
   *
   * 幂等：summaryInfo 内部已有 existingRow 检查，重复执行不产生副作用。
   * 防重入：backfillRunning 标志避免启动/定时并发触发时的重复扫描与 LLM 调用。
   */
  async backfillMissingSummaries(_input: BackfillMissingSummariesInput, output: BackfillMissingSummariesOutput, _context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    if (this.backfillRunning) {
      output.backfilled_count = 0;
      return true;
    }
    this.backfillRunning = true;
    try {
      const summaryConfig = await this.getInfoSummaryConfig();
      if (!summaryConfig || summaryConfig.enable !== 1) {
        output.backfilled_count = 0;
        return true;
      }
      const threshold = summaryConfig.threshold ?? 100;
      const candidates = this.relationDb.queryRaw<{ info_id: string }>(
        `SELECT r."info_id" FROM "${INFO_RAW_TABLE}" r
          LEFT JOIN "${INFO_SUMMARY_TABLE}" s ON s."info_id" = r."info_id"
         WHERE s."info_id" IS NULL
           AND length(r."info") > ?
           AND COALESCE(r."handle_result_type", 'correct') = 'correct'`,
        [threshold],
      );
      let backfilled = 0;
      for (const row of candidates ?? []) {
        const input = new ProcessInfoInput();
        input.info_id = String(row.info_id ?? '');
        const out = new SummaryInfoOutput();
        await this.summaryInfo(input, out, new InfoCoreContext(), metrics, report);
        if (out.summary_id) backfilled++;
      }
      output.backfilled_count = backfilled;
      return true;
    } finally {
      this.backfillRunning = false;
    }
  }

  /**
   * 改写指定 work 下某 info_type 的 info 内容（如需求确认 APPROVE 时用理解后的需求替换原始 REQUEST）。
   */
  async updateInfo(input: UpdateInfoInput, output: UpdateInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.work_id || !input.info) {
      throw new ValidationError('updateInfo 需要提供 work_id 和 info');
    }
    const affected = await this.relationDb.update(
      INFO_RAW_TABLE,
      [
        { field: 'info', value: input.info },
        { field: 'info_length', value: input.info.length },
        { field: 'updated', value: IdGenerator.now() },
      ],
      [
        { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        { field: 'info_type', operator: Operator.EQ, value: input.info_type },
      ],
    );
    output.updated_count = affected;
    return true;
  }

  /**
   * 删除指定 work 落库的全部信息及派生数据（如需求确认 CANCEL 时丢弃本次提问）。
   *
   * 级联清理 info_raw 主表与 info_tag / info_summary / info_keyword / info_vector
   * 派生表，并删除 GraphDB 中该信息的引用节点与边（共享的标签/关键词文本节点不在此清理）。
   */
  async delInfoByWork(input: DelInfoByWorkInput, output: DelInfoByWorkOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.work_id) {
      throw new ValidationError('delInfoByWork 需要提供 work_id');
    }

    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }],
      fields: ['info_id'],
    });
    const infoIds = rows.map((r) => String(r['info_id'] ?? '')).filter(Boolean);

    if (infoIds.length > 0) {
      await this.relationDb.delete(INFO_TAG_TABLE, [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
      await this.relationDb.delete(INFO_SUMMARY_TABLE, [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
      await this.relationDb.delete(INFO_KEYWORD_TABLE, [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
      await this.relationDb.delete(INFO_VECTOR_TABLE, [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
      await this.delInfoGraph(Object.assign(new DelInfoGraphInput(), { info_ids: infoIds }), new DelInfoGraphOutput(), _context);
    }

    const affected = await this.relationDb.delete(INFO_RAW_TABLE, [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }]);
    await this.relationDb.delete(INFO_CONTEXT_SOURCE_TABLE, [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }]);

    output.deleted_count = affected;
    return true;
  }

  /** 删除指定 session 落库的全部信息及派生数据（数据/摘要/标签/关键词/向量/上下文快照），并级联 GraphDB 引用。
   * ===== 新增（2026-09-15 记忆集中）：ChatService.deleteSession 原先内联直写 info_* 派生表，
   * 属会话级记忆管理的第二条写入路径，收敛至 InfoProvider；chat_session / runtime_ / stream_event
   * 等非记忆表仍由上层负责 ===== */
  async delInfoBySession(input: DelInfoBySessionInput, output: DelInfoBySessionOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('delInfoBySession 需要提供 session_id');
    }

    const rawRows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [{ field: 'session_id', operator: Operator.EQ, value: input.session_id }],
      fields: ['info_id', 'work_id'],
    });
    const infoIds = rawRows.map((r) => String(r['info_id'] ?? '')).filter(Boolean);
    const workIds = Array.from(new Set(rawRows.map((r) => String(r['work_id'] ?? '')).filter(Boolean)));

    if (infoIds.length > 0) {
      await this.relationDb.delete(INFO_TAG_TABLE, [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
      await this.relationDb.delete(INFO_SUMMARY_TABLE, [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
      await this.relationDb.delete(INFO_KEYWORD_TABLE, [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
      await this.relationDb.delete(INFO_VECTOR_TABLE, [{ field: 'info_id', operator: Operator.IN, value: infoIds }]);
      await this.delInfoGraph(Object.assign(new DelInfoGraphInput(), { info_ids: infoIds }), new DelInfoGraphOutput(), _context);
    }
    if (workIds.length > 0) {
      await this.relationDb.delete(INFO_CONTEXT_SOURCE_TABLE, [{ field: 'work_id', operator: Operator.IN, value: workIds }]);
    }

    const affected = await this.relationDb.delete(INFO_RAW_TABLE, [
      { field: 'session_id', operator: Operator.EQ, value: input.session_id },
    ]);

    output.deleted_count = affected;
    output.deleted_work_ids = workIds;
    return true;
  }

  // =========================================================================
  // Assist
  // =========================================================================

  /** 检查 info_vector 是否存在 */
  async existVectorInfo(input: ExistInfoInput, output: ExistInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('existVectorInfo 需要提供 info_id');
    }

    output.exists = await this.hasVectorForInfo(input.info_id);
    return true;
  }

  /** 检查 info_tag 是否存在 */
  async existTagInfo(input: ExistInfoInput, output: ExistInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('existTagInfo 需要提供 info_id');
    }

    output.exists = await this.hasTagForInfo(input.info_id);
    return true;
  }

  /** 检查 info_summary 是否存在 */
  async existSummaryInfo(input: ExistInfoInput, output: ExistInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report,
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
    try {
      return (await this.getVectorRecord(infoId)) !== null;
    } catch {
      return false;
    }
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

  /** 批量查询 info_raw 记录，使用 IN 操作符避免 N+1 查询 */
  private async getInfoBatchByInfoIds(infoIds: string[]): Promise<Map<string, InfoRawRecord>> {
    const result = new Map<string, InfoRawRecord>();
    if (infoIds.length === 0) return result;
    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [{ field: 'info_id', operator: Operator.IN, value: infoIds }],
    });
    for (const row of rows) {
      const record = this.toInfoRawRecord(row);
      result.set(record.info_id, record);
    }
    return result;
  }

  private async getInfoById(id: string): Promise<InfoRawRecord | null> {
    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [{ field: 'id', operator: Operator.EQ, value: id }],
      page: { current: 1, size: 1 },
    });
    return rows.length > 0 ? this.toInfoRawRecord(rows[0]) : null;
  }

  private async getInfoSummaryRow(infoId: string): Promise<InfoSummaryRecord | null> {
    const rows = await this.relationDb.select(INFO_SUMMARY_TABLE, {
      conditions: [{ field: 'info_id', operator: Operator.EQ, value: infoId }],
      page: { current: 1, size: 1 },
    });
    if (rows.length === 0) return null;
    return this.toInfoSummaryRecord(rows[0]);
  }

  /** 批量查询 info_summary 记录，使用 IN 操作符避免 N+1 查询 */
  private async getInfoSummaryBatchByInfoIds(infoIds: string[]): Promise<Map<string, InfoSummaryRecord>> {
    const result = new Map<string, InfoSummaryRecord>();
    if (infoIds.length === 0) return result;
    const rows = await this.relationDb.select(INFO_SUMMARY_TABLE, {
      conditions: [{ field: 'info_id', operator: Operator.IN, value: infoIds }],
    });
    for (const row of rows) {
      const record = this.toInfoSummaryRecord(row);
      result.set(record.info_id, record);
    }
    return result;
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

  /** 业务维度（session/interact/work）随 Context 透传至 LLMProvider 明细账（2026-09-14） */
  private async generateEmbedding(
    text: string,
    vectorConfig: InfoVectorConfigRecord,
    bizCtx?: Context,
    metrics?: Metrics,
  ): Promise<number[]> {
    try {
      const embedOutput = new EmbedLLMOutput();
      await this.llmAccess.embedLLM(
        Object.assign(new EmbedLLMInput(), { id: vectorConfig.llm_id, input: text }),
        embedOutput, bizCtx ?? new LLMContext(),
      );
      if (!embedOutput.embedding || embedOutput.embedding.length === 0) {
        // ===== 修改后（2026-09-15）：空 embedding 不再静默返回，输出可见诊断。
        //      实测 embedding 服务（如本地 LLamaCPP）不可用时 SIMILARITY 维度整条失效，
        //      且零日志，只能靠翻 llm_available/手动 curl 排查 =====
        metrics?.warn('[InfoCoreProvider] generateEmbedding 返回空向量，SIMILARITY 召回将退化为空；请检查 embedding 服务可用性', {
          llm_id: vectorConfig.llm_id,
        });
        return [];
      }
      return embedOutput.embedding;
    } catch (err) {
      // ===== 修改后（2026-09-15）：向量化失败可见化，避免静默丢数据 =====
      metrics?.warn('[InfoCoreProvider] generateEmbedding 调用失败', {
        llm_id: vectorConfig.llm_id,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // =========================================================================
  // Private: Vector helpers（LanceDB 为向量唯一存储与相似度计算）
  // =========================================================================

  /** 标签向量 ID（按标签文本确定性生成，幂等）。 */
  private tagVectorId(tag: string): string {
    return `tag:${tag}`;
  }

  private async getVectorRecord(id: string): Promise<VectorRecord | null> {
    const out = new GetVectorOutput();
    await this.vectorDb.soVectorById({ id } as GetVectorInput, out, new VectorContext());
    return out.vector;
  }

  /**
   * 将 info 文本按向量配置分块（LangChain 风格递归分隔符 + 重叠）。
   *
   * 长度不超过 chunk_size 时不拆分，返回单元素数组（内容为原文），
   * 保证短文本仍走单向量路径（向量 id = info_id，与历史数据兼容）。
   */
  private splitInfoChunks(info: string, vectorConfig: InfoVectorConfigRecord): string[] {
    const chunkSize = this.normalizeChunkSize(vectorConfig.chunk_size);
    if (chunkSize <= 0) return [info];
    const length = RecursiveTextSplitter.charLength(info);
    if (length <= chunkSize) return [info];

    const overlap = this.normalizeChunkOverlap(vectorConfig.chunk_overlap, chunkSize);
    return RecursiveTextSplitter.splitText(info, {
      chunkSize,
      chunkOverlap: overlap,
    });
  }

  /** 写入信息向量：单 chunk 时向量 id = info_id；多 chunk 时依次为 info_id、info_id#1… */
  private async upsertInfoChunks(
    infoId: string,
    chunks: string[],
    embeddings: number[][],
  ): Promise<void> {
    const multi = chunks.length > 1;
    const vectors: VectorObject[] = chunks.map((chunk, i) => ({
      id: i === 0 ? infoId : `${infoId}#${i}`,
      content: chunk,
      embedding: embeddings[i],
      metadata: multi
        ? { kind: 'info', info_id: infoId, chunk_index: i, chunk_total: chunks.length }
        : { kind: 'info', info_id: infoId },
    }));

    const out = new AddVectorOutput();
    await this.vectorDb.addVector(
      { vectors } as AddVectorInput,
      out, new VectorContext(),
    );
  }

  private normalizeChunkSize(raw: unknown): number {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 512;
  }

  private normalizeChunkOverlap(raw: unknown, chunkSize: number): number {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return 64;
    return Math.min(n, chunkSize - 1);
  }

  private async upsertTagVector(tag: string, embedding: number[]): Promise<void> {
    await this.upsertVector(this.tagVectorId(tag), tag, embedding, { kind: 'tag', tag });
  }

  private async upsertVector(
    id: string,
    content: string,
    embedding: number[],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const out = new AddVectorOutput();
    await this.vectorDb.addVector(
      { vectors: [{ id, content, embedding, metadata }] as VectorObject[] } as AddVectorInput,
      out, new VectorContext(),
    );
  }

  /** 获取标签向量：优先复用 LanceDB 中已有向量，否则即时生成。 */
  private async getTagEmbedding(tag: string, _tagConfig: InfoTagConfigRecord, metrics?: Metrics): Promise<number[]> {
    const existing = await this.getVectorRecord(this.tagVectorId(tag));
    if (existing && existing.embedding.length > 0) return existing.embedding;
    const vectorConfig = await this.getInfoVectorConfig();
    if (!vectorConfig || vectorConfig.enable !== 1) return [];
    return this.generateEmbedding(tag, vectorConfig, undefined, metrics);
  }

  private async searchInfoVectors(
    embedding: number[],
    topK: number,
    threshold: number,
  ): Promise<VectorSearchResult[]> {
    const out = new SoVectorOutput();
    await this.vectorDb.soVector(
      { query_param: this.infoVectorQuery(embedding, topK, threshold) } as SoVectorInput,
      out, new VectorContext(),
    );
    return out.list;
  }

  private infoVectorQuery(embedding: number[], topK: number, threshold: number): VectorQueryParam {
    return {
      embedding,
      top_k: Math.max(1, Math.floor(topK)),
      similarity_threshold: threshold,
      filters: [{ field: 'kind', operator: Operator.EQ, value: 'info' }],
    };
  }

  private async toScoredInfoList(
    hits: VectorSearchResult[],
  ): Promise<Array<InfoRawRecord & { score?: number; matched_chunks?: string[] }>> {
    // 多个 chunk 命中同一 info 时，按 info_id 去重聚合，取最高分，
    // 并把命中的 chunk 片段收集到 matched_chunks（便于展示命中原文）。
    const byInfo = new Map<string, { score: number; chunks: string[] }>();
    for (const hit of hits) {
      const infoId = String(hit.metadata?.['info_id'] ?? hit.id);
      const content = hit.content ?? '';
      const cur = byInfo.get(infoId);
      if (!cur) {
        byInfo.set(infoId, { score: hit.score, chunks: content ? [content] : [] });
      } else {
        if (hit.score > cur.score) cur.score = hit.score;
        if (content) cur.chunks.push(content);
      }
    }

    const results: Array<InfoRawRecord & { score?: number; matched_chunks?: string[] }> = [];
    for (const [infoId, agg] of byInfo) {
      const infoRow = await this.getInfoByInfoId(infoId);
      if (infoRow) {
        results.push({ ...infoRow, score: agg.score, matched_chunks: agg.chunks });
      }
    }
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return results;
  }

  /** 搜索语义相似的标签（排除自身），返回标签文本与相似度分数。 */
  private async searchSimilarTags(
    embedding: number[],
    excludeTag: string,
    topK: number,
  ): Promise<Array<{ tag: string; score: number }>> {
    const out = new SoVectorOutput();
    await this.vectorDb.soVector(
      { query_param: this.tagVectorQuery(embedding, topK) } as SoVectorInput,
      out, new VectorContext(),
    );
    const result: Array<{ tag: string; score: number }> = [];
    for (const hit of out.list) {
      const tag = String(hit.metadata?.['tag'] ?? '');
      if (!tag || tag === excludeTag) continue;
      result.push({ tag, score: hit.score });
    }
    return result;
  }

  private tagVectorQuery(embedding: number[], topK: number): VectorQueryParam {
    return {
      embedding,
      top_k: Math.max(1, Math.floor(topK)),
      similarity_threshold: 0,
      filters: [{ field: 'kind', operator: Operator.EQ, value: 'tag' }],
    };
  }

  // =========================================================================
  // Private: Graph helpers
  // =========================================================================

  /** 解析 tag 文本：tag_id 可能是 info_tag.id，也可能是 GraphDB 节点 ID。 */
  private async resolveTagText(tagId: string): Promise<string> {
    const tagRows = await this.relationDb.select(INFO_TAG_TABLE, {
      conditions: [{ field: 'id', operator: Operator.EQ, value: tagId }],
      page: { current: 1, size: 1 },
    });
    if (tagRows.length > 0) return tagRows[0]['tag'] as string;
    const nodeOut = new GetGraphNodeOutput();
    await this.graphDb.soGraphNode({ id: tagId } as GetGraphNodeInput, nodeOut, new GraphContext());
    return String(nodeOut.node?.content['tag'] ?? '');
  }

  /**
   * 确保文本节点存在（按 node_type + content[textField] 去重），返回节点 ID。
   *
   * 节点属性（含频次 freq）完全存于 GraphDB 节点 content；incrementFreq 为 true 时
   * 将 freq +1（用于标签/关键词每次出现时累加频次）。
   */
  private async ensureTextNode(
    nodeType: string,
    textField: string,
    text: string,
    incrementFreq = false,
  ): Promise<string> {
    const existing = await this.findGraphNode(nodeType, textField, text);
    if (existing) {
      if (incrementFreq) {
        const freq = Number(existing.content?.['freq'] ?? 0) + 1;
        await this.graphDb.updateGraphNode(
          { id: existing.id, data: { content: { ...(existing.content ?? {}), [textField]: text, freq } } } as UpdateGraphNodeInput,
          new UpdateGraphNodeOutput(), new GraphContext(),
        );
      }
      return existing.id;
    }
    const out = new AddGraphNodeOutput();
    await this.graphDb.addGraphNode(
      {
        data: {
          node_type: nodeType,
          content: { [textField]: text, freq: incrementFreq ? 1 : 0 },
        } as GraphNodeData,
      } as AddGraphNodeInput,
      out, new GraphContext(),
    );
    return out.id;
  }

  /** 确保标签节点存在（按文本去重），返回节点 ID。 */
  private async ensureTagNode(tag: string): Promise<string> {
    return this.ensureTextNode('Tag', 'tag', tag);
  }

  /** 确保关键词节点存在（按文本去重），返回节点 ID。 */
  private async ensureKeywordNode(keyword: string): Promise<string> {
    return this.ensureTextNode('keyword', 'keyword', keyword);
  }

  /** 建立/更新 similarTo 边（异常静默忽略，避免重复边阻断）。 */
  private async connectSimilarTags(fromId: string, toId: string, score: number, metrics?: Metrics): Promise<void> {
    try {
      await this.graphDb.addGraphEdge(
        {
          data: {
            from_node_id: fromId,
            to_node_id: toId,
            edge_type: 'similarTo',
            weight: score,
            properties: { similarity: score, actMap: {} },
          } as GraphEdgeData,
        } as AddGraphEdgeInput,
        new AddGraphEdgeOutput(), new GraphContext(),
      );
    } catch (err) {
      // 忽略边已存在等异常
      metrics?.warn('InfoCoreService.connectSimilarTags similarTo 建边失败已容忍（含边已存在）', {
        error: err instanceof Error ? err.message : String(err),
        from_id: fromId,
        to_id: toId,
      });
    }
  }

  /**
   * 为同一 info 上共现的标签建立 cooccur 边（共现策略，不依赖向量化）。
   *
   * 与「涌现」标签图 / 「关键词图」的共现口径一致：两个标签出现在同一条 info
   * 记录上即建立一条边，边权重为共现次数。将共现关系持久化到 GraphDB，使图数据库
   * 的边数与标签图展示一致（此前仅依赖 similarTo 语义边，embedding 链路不可用时会退化为零边）。
   */
  private async buildCooccurEdges(tags: string[]): Promise<void> {
    await this.buildCooccurEdgesForType(tags, 'Tag', 'tag', COOCCUR_EDGE_TYPE);
  }

  /** 为同一 info 上共现的关键词建立 cooccur 边（共现策略，不依赖向量化）。 */
  private async buildKeywordCooccurEdges(keywords: string[]): Promise<void> {
    await this.buildCooccurEdgesForType(keywords, 'keyword', 'keyword', KEYWORD_COOCCUR_EDGE_TYPE);
  }

  /** 泛化：为同一 info 上共现的文本项两两建立 cooccur 边。 */
  private async buildCooccurEdgesForType(
    items: string[],
    nodeType: string,
    textField: string,
    edgeType: string,
  ): Promise<void> {
    const unique = Array.from(new Set(items.map((t) => t.trim()).filter(Boolean)));
    if (unique.length === 0) return;
    // 确保所有文本节点存在（含孤立项，保证图节点完整）
    for (const t of unique) {
      await this.ensureTextNode(nodeType, textField, t);
    }
    if (unique.length < 2) return;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i] < unique[j] ? unique[i] : unique[j];
        const b = unique[i] < unique[j] ? unique[j] : unique[i];
        await this.upsertCooccurEdgeForType(a, b, nodeType, textField, edgeType);
      }
    }
  }

  /** 建立/累加一对文本项的 cooccur 边（按文本规范化方向，幂等）。 */
  private async upsertCooccurEdgeForType(
    textA: string,
    textB: string,
    nodeType: string,
    textField: string,
    edgeType: string,
  ): Promise<void> {
    try {
      const fromId = await this.ensureTextNode(nodeType, textField, textA);
      const toId = await this.ensureTextNode(nodeType, textField, textB);
      const selOut = new SelectGraphOutput();
      await this.graphDb.selectGraph(
        {
          target: GraphTarget.EDGE,
          edge_type: edgeType,
          conditions: [
            { field: 'from_node_id', operator: Operator.EQ, value: fromId },
            { field: 'to_node_id', operator: Operator.EQ, value: toId },
          ],
        } as SelectGraphInput,
        selOut, new GraphContext(),
      );
      const existing = selOut.list?.[0] as GraphEdgeRecord | undefined;
      if (existing) {
        await this.graphDb.updateGraphEdge(
          {
            id: existing.id,
            data: { weight: (Number(existing.weight) || 0) + 1 },
          } as UpdateGraphEdgeInput,
          new UpdateGraphEdgeOutput(), new GraphContext(),
        );
      } else {
        await this.addCooccurEdge(fromId, toId, edgeType);
      }
    } catch (err) {
      // 共现边建立失败不影响文本保存（best-effort）：图库写失败仅损失共现统计展示，
      // 主流程文本保存与标签/关键词落库均已成功，容忍跳过
      void err;
    }
  }

  /** 直接建立一条 cooccur 边（节点已存在、边未建立时调用）。 */
  private async addCooccurEdge(fromId: string, toId: string, edgeType: string, weight = 1, metrics?: Metrics): Promise<void> {
    try {
      await this.graphDb.addGraphEdge(
        {
          data: {
            from_node_id: fromId,
            to_node_id: toId,
            edge_type: edgeType,
            weight,
            properties: { cooccurrence: weight },
          } as GraphEdgeData,
        } as AddGraphEdgeInput,
        new AddGraphEdgeOutput(), new GraphContext(),
      );
    } catch (err) {
      // 忽略边已存在等异常
      metrics?.warn('InfoCoreService.addCooccurEdge 共现边建立失败已容忍（含边已存在）', {
        error: err instanceof Error ? err.message : String(err),
        from_id: fromId,
        to_id: toId,
        edge_type: edgeType,
      });
    }
  }

  private async extractTags(
    text: string,
    tagConfig: InfoTagConfigRecord,
  ): Promise<string[]> {
    try {
      if (!tagConfig.llm_id || !tagConfig.prompt_template_id) return [];

      const topK = tagConfig.tag_top_k || 5;
      const promptOut = new ExecPromptOutput();
      const ok = await this.promptsAccess.execPrompt(
        Object.assign(new ExecPromptInput(), {
          id: tagConfig.prompt_template_id,
          variables: { text, top_k: topK },
        }),
        promptOut, new PromptContext(),
      );
      if (!ok || !promptOut.prompt) return [];

      const execOutput = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: tagConfig.llm_id,
          prompt: promptOut.prompt,
          temperature: 0.1,
          max_tokens: 256,
          caller: 'InfoCoreService.extractTags',
        }),
        execOutput, new LLMContext(),
      );

      return this.parseStringArray(execOutput.result);
    } catch {
      return [];
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
    const words: string[] = jieba.cut(text);
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

  /**
   * 建立 GraphDB 引用边：确保当前 info 与各 parent 的 info 节点存在，并创建 CITATION 边。
   */
  private async connectCitationEdges(
    infoId: string,
    sessionId: string,
    infoText: string,
    parentInfoIds: string[],
    metrics?: Metrics,
  ): Promise<void> {
    const fromNodeId = await this.ensureInfoGraphNode(infoId, { session_id: sessionId, info: infoText });
    for (const parentId of parentInfoIds) {
      if (!parentId) continue;
      const parentRow = await this.getInfoByInfoId(parentId);
      if (!parentRow) continue;
      const toNodeId = await this.ensureInfoGraphNode(parentId, { session_id: parentRow.session_id, info: parentRow.info });
      await this.connectCitationEdge(fromNodeId, toNodeId, infoId, parentId, sessionId, metrics);
    }
  }

  /** 建立单条 CITATION 边（异常静默忽略，避免重复边阻断）。 */
  private async connectCitationEdge(
    fromNodeId: string,
    toNodeId: string,
    citingInfoId: string,
    citedInfoId: string,
    sessionId: string,
    metrics?: Metrics,
  ): Promise<void> {
    try {
      await this.graphDb.addGraphEdge(
        {
          data: {
            from_node_id: fromNodeId,
            to_node_id: toNodeId,
            edge_type: CITATION_EDGE_TYPE,
            weight: 1,
            properties: { citing_info_id: citingInfoId, cited_info_id: citedInfoId, session_id: sessionId },
          } as GraphEdgeData,
        } as AddGraphEdgeInput,
        new AddGraphEdgeOutput(), new GraphContext(),
      );
    } catch (err) {
      // 忽略边已存在等异常
      metrics?.warn('InfoCoreService.connectCitationEdge CITATION 引用边建立失败已容忍（含边已存在）', {
        error: err instanceof Error ? err.message : String(err),
        citing_info_id: citingInfoId,
        cited_info_id: citedInfoId,
        session_id: sessionId,
      });
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
      addNodeOutput, new GraphContext(),
    );

    return addNodeOutput.id;
  }

  private async findInfoGraphNodeId(infoId: string): Promise<string | null> {
    return this.findGraphNodeId('info', 'info_id', infoId);
  }

  /** 在 GraphDB 中按 node_type + content 字段值查找节点完整记录。 */
  private async findGraphNode(
    nodeType: string,
    field: string,
    value: unknown,
  ): Promise<GraphNodeRecord | null> {
    const out = new SelectGraphOutput();
    await this.graphDb.selectGraph(
      { target: GraphTarget.NODE, node_type: nodeType } as SelectGraphInput,
      out, new GraphContext(),
    );
    for (const node of out.list) {
      const content = (node as GraphNodeRecord).content ?? {};
      if (content[field] === value) return node as GraphNodeRecord;
    }
    return null;
  }

  /** 在 GraphDB 中按 node_type + content 字段值查找节点 ID。 */
  private async findGraphNodeId(
    nodeType: string,
    field: string,
    value: unknown,
  ): Promise<string | null> {
    const node = await this.findGraphNode(nodeType, field, value);
    return node ? node.id : null;
  }

  // =========================================================================
  // Private: Context helpers
  // =========================================================================

  /** 校验 context 输入必填项：session_id 与 work_id。 */
  private validateContextInput(input: ContextInfoInput): void {
    if (!input.session_id) {
      throw new ValidationError('context 需要提供 session_id');
    }
    if (!input.work_id) {
      throw new ValidationError('context 需要提供 work_id');
    }
  }

  /** 准备上下文构建计划：总预算/时间线限额/跨会话开关（Work Agent 执行子任务时应关闭避免无关历史污染）/复选消息列表。 */
  private prepareContextBuildPlan(input: ContextInfoInput, contextConfig: InfoContextConfigRecord | null): ContextBuildPlan {
    return {
      maxTotal: contextConfig?.total || 1000,
      timelineLimit: contextConfig?.base_timeline_count ?? 500,
      enableCrossSession: input.enable_cross_session !== false,
      selectedIds: (input.selected_msg_ids || input.custom_info_ids || []).filter((id) => Boolean(id)),
    };
  }

  /** 采集钉住消息候选（PINNED，会话内，按 created DESC）。 */
  private async collectPinnedCandidates(sessionId: string): Promise<InfoRawRecord[]> {
    const pinnedRows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions: [
        { field: 'session_id', operator: Operator.EQ, value: sessionId },
        { field: 'pin', operator: Operator.EQ, value: 1 },
      ],
      order_by: [{ field: 'created', direction: 'DESC' }],
    });
    return pinnedRows.map((r) => this.toInfoRawRecord(r));
  }

  /** 采集基础上下文候选：复选消息（CITING）替换时间线（不再并行采集时间线），无复选退化为纯时间线。 */
  private async collectSelectedOrTimelineCandidates(
    input: ContextInfoInput,
    selectedIds: string[],
    timelineLimit: number,
  ): Promise<{ citingCandidates: InfoRawRecord[]; timelineCandidates: InfoRawRecord[] }> {
    const citingCandidates: InfoRawRecord[] = [];
    const timelineCandidates: InfoRawRecord[] = [];
    if (selectedIds.length > 0) {
      for (const msgId of selectedIds) {
        const r = await this.getInfoByInfoId(msgId);
        if (r && r.session_id === input.session_id) {
          citingCandidates.push(r);
        }
      }
    } else {
      const tl = await this.lastNInfoTimeline(input.session_id, timelineLimit);
      for (const item of tl) {
        timelineCandidates.push(item);
      }
    }
    return { citingCandidates, timelineCandidates };
  }

  /**
   * 拆出当前消息（CURRENT）：时间线按 created DESC 排序，最新一条即本次输入，从时间线中单独拆出，
   * 避免与 task_content 重复出现在上下文中；复选模式下当前输入不在复选列表内，单独取最新一条。
   */
  private async extractCurrentCandidate(
    sessionId: string,
    selectedIds: string[],
    timelineCandidates: InfoRawRecord[],
  ): Promise<InfoRawRecord | null> {
    if (timelineCandidates.length > 0) {
      return timelineCandidates.shift() ?? null;
    }
    if (selectedIds.length > 0) {
      const latest = await this.lastNInfoTimeline(sessionId, 1);
      return latest[0] ?? null;
    }
    return null;
  }

  /**
   * 解析弱相关维度限额（2026-09-15 第三版口径，按用户裁定）：
   * 实际上限 = min(该维度基础上限 base_xxx_count, 「基础上下文消息数量」× xxx_max_percent%)——
   * 占比基准是基础上下文数量（= pinned + citing + timeline），不占 total、无 shrinkFactor 二次收缩。
   */
  private resolveWeakDimensionLimits(
    contextConfig: InfoContextConfigRecord | null,
    baseContextCount: number,
  ): ContextWeakDimensionLimits {
    const capByBase = (base: number, percent: number): number => {
      const byBase = Math.floor((baseContextCount * percent) / 100);
      return Math.min(base, byBase);
    };
    return {
      tagLimit: capByBase(contextConfig?.base_tag_relative_count ?? 200, contextConfig?.tag_relative_max_percent ?? 20),
      simLimit: capByBase(contextConfig?.base_similarity_count ?? 150, contextConfig?.similarity_max_percent ?? 15),
      kwLimit: capByBase(contextConfig?.base_keyword_count ?? 100, contextConfig?.keyword_max_percent ?? 10),
      randLimit: capByBase(contextConfig?.base_random_count ?? 50, contextConfig?.random_max_percent ?? 5),
      kwScoreThreshold: contextConfig?.keyword_score_threshold ?? 95,
    };
  }

  /** 解析参考文本：优先 input.info（当前提问），其次 input.info_id 记录，最后从 CITING/TIMELINE 候选中取 REQUEST。 */
  private async resolveReferenceText(
    input: ContextInfoInput,
    citingCandidates: InfoRawRecord[],
    timelineCandidates: InfoRawRecord[],
  ): Promise<{ refText: string; refInfoRow: InfoRawRecord | null }> {
    let refText = input.info || '';
    let refInfoRow: InfoRawRecord | null = null;
    if (input.info_id) {
      refInfoRow = await this.getInfoByInfoId(input.info_id);
      if (refInfoRow?.info && !refText) {
        refText = refInfoRow.info;
      }
    }
    if (!refInfoRow && (citingCandidates.length > 0 || timelineCandidates.length > 0)) {
      const candidates = citingCandidates.length > 0 ? citingCandidates : timelineCandidates;
      refInfoRow = candidates.find((t) => t.info_type === InfoType.REQUEST) || candidates[0] || null;
      if (refInfoRow?.info && !refText) {
        refText = refInfoRow.info;
      }
    }
    return { refText, refInfoRow };
  }

  /** 并行采集 TAG_RELATIVE / SIMILARITY / KEYWORD 三维弱相关候选（三维无依赖）。 */
  private async collectWeakDimensionCandidates(
    sessionId: string,
    refText: string,
    refInfoRow: InfoRawRecord | null,
    limits: ContextWeakDimensionLimits,
    enableCrossSession: boolean,
    _context: InfoCoreContext,
    metrics?: Metrics,
    report?: Report,
  ): Promise<ContextWeakDimensionCandidates> {
    const [tag, sim, kw] = await Promise.all([
      this.collectTagRelativeCandidates(sessionId, refInfoRow, limits.tagLimit, enableCrossSession, _context, metrics, report),
      this.collectSimilarityCandidates(sessionId, refText, limits.simLimit, enableCrossSession, _context, metrics, report),
      this.collectKeywordCandidates(sessionId, refText, limits.kwLimit, limits.kwScoreThreshold, enableCrossSession, _context, metrics, report),
    ]);
    return { tag, sim, kw };
  }

  /** 采集 TAG_RELATIVE 候选（全系统标签相关性消息）；失败降级为空列表，不阻断上下文构建。 */
  private async collectTagRelativeCandidates(
    sessionId: string,
    refInfoRow: InfoRawRecord | null,
    tagLimit: number,
    enableCrossSession: boolean,
    _context: InfoCoreContext,
    metrics?: Metrics,
    report?: Report,
  ): Promise<InfoRawRecord[]> {
    if (!refInfoRow || tagLimit <= 0 || !enableCrossSession) return [];
    try {
      const relInput = new RelationKInfoInput();
      relInput.info_id = refInfoRow.info_id;
      relInput.topN = tagLimit;
      const relOutput = new RelationKInfoOutput();
      await this.relationKInfo(relInput, relOutput, _context, metrics, report);
      return relOutput.list;
    } catch (err) {
      metrics?.warn('InfoCoreService.context TAG_RELATIVE 候选采集失败，降级为空列表', {
        error: err instanceof Error ? err.message : String(err),
        info_id: refInfoRow.info_id,
        session_id: sessionId,
      });
      return [];
    }
  }

  /** 采集 SIMILARITY 候选（全系统向量语义相似消息）；失败降级为空列表，不阻断上下文构建。 */
  private async collectSimilarityCandidates(
    sessionId: string,
    refText: string,
    simLimit: number,
    enableCrossSession: boolean,
    _context: InfoCoreContext,
    metrics?: Metrics,
    report?: Report,
  ): Promise<InfoRawRecord[]> {
    if (!refText || simLimit <= 0 || !enableCrossSession) return [];
    try {
      const simInput = new SimilarKInfoInput();
      simInput.info = refText;
      simInput.topK = simLimit;
      const simOutput = new SimilarKInfoOutput();
      await this.similarKInfo(simInput, simOutput, _context, metrics, report);
      return simOutput.list.filter((item) => this.isCorrectInfo(item));
    } catch (err) {
      metrics?.warn('InfoCoreService.context SIMILARITY 候选采集失败，降级为空列表', {
        error: err instanceof Error ? err.message : String(err),
        session_id: sessionId,
      });
      return [];
    }
  }

  /** 采集 KEYWORD 候选（全系统关键词匹配消息）；失败降级为空列表，不阻断上下文构建。 */
  private async collectKeywordCandidates(
    sessionId: string,
    refText: string,
    kwLimit: number,
    kwScoreThreshold: number,
    enableCrossSession: boolean,
    _context: InfoCoreContext,
    metrics?: Metrics,
    report?: Report,
  ): Promise<InfoRawRecord[]> {
    if (!refText || kwLimit <= 0 || !enableCrossSession) return [];
    try {
      const kwInput = new KeywordKInfoInput();
      kwInput.info = refText;
      const kwOutput = new KeywordKInfoOutput();
      await this.keywordKInfo(kwInput, kwOutput, _context, metrics, report);
      return this.pickKeywordCandidates(kwOutput.list, kwScoreThreshold, kwLimit);
    } catch (err) {
      metrics?.warn('InfoCoreService.context KEYWORD 候选采集失败，降级为空列表', {
        error: err instanceof Error ? err.message : String(err),
        session_id: sessionId,
      });
      return [];
    }
  }

  /** 关键词候选过滤：剔除错误信息与低于 keyword_score_threshold 的项，满额即停。 */
  private pickKeywordCandidates(
    list: Array<InfoRawRecord & { keyword_score?: number }>,
    kwScoreThreshold: number,
    kwLimit: number,
  ): InfoRawRecord[] {
    const result: InfoRawRecord[] = [];
    for (const item of list) {
      if (!this.isCorrectInfo(item)) continue;
      if ((item.keyword_score ?? 0) < kwScoreThreshold) continue;
      result.push(item);
      if (result.length >= kwLimit) break;
    }
    return result;
  }

  /** 采集 RANDOM 随机候选：失败保留已采部分，不阻断上下文构建（限额已按基础上下文动态收缩）。 */
  private async collectRandomCandidates(
    sessionId: string,
    randLimit: number,
    enableCrossSession: boolean,
    pinnedCandidates: InfoRawRecord[],
    citingCandidates: InfoRawRecord[],
    currentCandidate: InfoRawRecord | null,
    metrics?: Metrics,
  ): Promise<InfoRawRecord[]> {
    let randCandidates: InfoRawRecord[] = [];
    if (randLimit > 0) {
      try {
        randCandidates = await this.sampleRandomCandidates(sessionId, randLimit, enableCrossSession, pinnedCandidates, citingCandidates, currentCandidate);
      } catch (err) {
        metrics?.warn('InfoCoreService.context RANDOM 随机候选采集失败，保留已采部分', {
          error: err instanceof Error ? err.message : String(err),
          session_id: sessionId,
        });
      }
    }
    return randCandidates;
  }

  /**
   * 随机采样（PRD 步骤 524，2026-09-15 第二版对齐）：会话内随机抽样是本维度基础动作，不受
   * enable_cross_session 约束（该开关只控制跨会话全局兜底，原实现整体包进判断导致 Work Agent
   * 子任务场景会话内随机被跳过）；「未选中」= 未被复选/钉住等显式维度采集，时间线候选不计入
   * 排除集（重复剔除由按优先级全局去重统一裁决）；CURRENT 在采样阶段即排除（PRD 步骤 4），
   * 避免当前消息先占名额再被剔除导致实收少 1（trace 162c58fc 实测 49/50）。
   */
  private async sampleRandomCandidates(
    sessionId: string,
    randLimit: number,
    enableCrossSession: boolean,
    pinnedCandidates: InfoRawRecord[],
    citingCandidates: InfoRawRecord[],
    currentCandidate: InfoRawRecord | null,
  ): Promise<InfoRawRecord[]> {
    const existingIds = new Set<string>([
      ...pinnedCandidates.map((c) => c.info_id),
      ...citingCandidates.map((c) => c.info_id),
    ]);
    const curExcludeId = currentCandidate?.info_id ?? '';
    let randCandidates = await this.sampleSessionRandomCandidates(sessionId, randLimit, existingIds, curExcludeId);
    if (randCandidates.length < randLimit && enableCrossSession) {
      const remaining = randLimit - randCandidates.length;
      const filledIds = new Set([
        ...existingIds,
        curExcludeId,
        ...randCandidates.map((c) => c.info_id),
      ]);
      const globalCandidates = this.sampleGlobalRandomCandidates(remaining, filledIds);
      randCandidates = [...randCandidates, ...globalCandidates].slice(0, randLimit);
    }
    return randCandidates;
  }

  /** 会话内随机抽样：ORDER BY RANDOM() LIMIT 避免全表扫描，采样上限放宽为 min((randLimit+1)*3, count) 防腾挪误差。 */
  private async sampleSessionRandomCandidates(
    sessionId: string,
    randLimit: number,
    existingIds: Set<string>,
    curExcludeId: string,
  ): Promise<InfoRawRecord[]> {
    const count = await this.relationDb.count(INFO_RAW_TABLE, [
      { field: 'session_id', operator: Operator.EQ, value: sessionId },
    ]);
    if (count <= 0) return [];
    const randomRows = this.relationDb.queryRaw<Record<string, unknown>>(
      `SELECT * FROM "${INFO_RAW_TABLE}" WHERE "session_id" = ? ORDER BY RANDOM() LIMIT ?`,
      [sessionId, Math.min((randLimit + 1) * 3, count)],
    );
    return randomRows
      .map((r) => this.toInfoRawRecord(r))
      .filter((c) => !existingIds.has(c.info_id) && c.info_id !== curExcludeId)
      .filter((c) => this.isCorrectInfo(c))
      .slice(0, randLimit);
  }

  /** 跨会话全局随机补充剩余名额（仅 enable_cross_session=true 时调用），采样上限 min(remaining*3, 100)。 */
  private sampleGlobalRandomCandidates(remaining: number, filledIds: Set<string>): InfoRawRecord[] {
    const globalRows = this.relationDb.queryRaw<Record<string, unknown>>(
      `SELECT * FROM "${INFO_RAW_TABLE}" ORDER BY RANDOM() LIMIT ?`,
      [Math.min(remaining * 3, 100)],
    );
    return globalRows
      .map((r) => this.toInfoRawRecord(r))
      .filter((c) => !filledIds.has(c.info_id))
      .filter((c) => this.isCorrectInfo(c));
  }

  /** 当前消息仅应以 CURRENT（或经显式钉住/引用）出现：从弱相关维度候选中剔除，避免当前输入被重复采集。 */
  private excludeCurrentFromWeakDimensions(currentCandidate: InfoRawRecord | null, weakLists: InfoRawRecord[][]): void {
    if (currentCandidate) {
      const curId = currentCandidate.info_id;
      for (const list of weakLists) {
        const idx = list.findIndex((c) => c.info_id === curId);
        if (idx >= 0) list.splice(idx, 1);
      }
    }
  }

  /** 组装候选映射表（来源 → 候选）；内部执行轨迹（ACT trace JSON 动辄数十万字符）统一剔除，避免 LLM 输入超限。 */
  private buildContextCandidatesMap(buckets: ContextCandidateBuckets): Map<ContextCollectionSource, InfoRawRecord[]> {
    const withoutTraces = (list: InfoRawRecord[]): InfoRawRecord[] =>
      list.filter((c) => !this.isTraceInfo(c));
    return new Map<ContextCollectionSource, InfoRawRecord[]>([
      [CollectionSource.PINNED, withoutTraces(buckets.pinned)],
      [CollectionSource.CITING, withoutTraces(buckets.citing)],
      [CollectionSource.TIMELINE, withoutTraces(buckets.timeline)],
      [CollectionSource.TAG_RELATIVE, withoutTraces(buckets.tag)],
      [CollectionSource.SIMILARITY, withoutTraces(buckets.sim)],
      [CollectionSource.KEYWORD, withoutTraces(buckets.kw)],
      [CollectionSource.RANDOM, withoutTraces(buckets.rand)],
    ]);
  }

  /** 解析 priority_order 配置为去重后的合法采集优先级列表（未配置时用默认优先级，非法/重复来源剔除）。 */
  private parseContextPriorityList(priorityOrderStr?: string): ContextCollectionSource[] {
    const rawPriority = priorityOrderStr
      ? priorityOrderStr.split(',').map((s) => s.trim().toUpperCase() as ContextCollectionSource)
      : CONTEXT_COLLECTION_SOURCES;
    const priorityList: ContextCollectionSource[] = [];
    for (const src of rawPriority) {
      if (CONTEXT_COLLECTION_SOURCES.includes(src) && !priorityList.includes(src)) {
        priorityList.push(src);
      }
    }
    return priorityList;
  }

  /** 批量预取全部候选（含当前消息）的摘要（避免逐条查询 N+1），返回 info_id → 摘要记录映射。 */
  private async prefetchContextSummaries(
    priorityList: ContextCollectionSource[],
    candidatesMap: Map<ContextCollectionSource, InfoRawRecord[]>,
    currentCandidate: InfoRawRecord | null,
  ): Promise<Map<string, InfoSummaryRecord>> {
    const allCandidateIds = new Set<string>();
    for (const sourceKey of priorityList) {
      const candidates = candidatesMap.get(sourceKey) || [];
      for (const cand of candidates) {
        if (cand?.info_id) allCandidateIds.add(cand.info_id);
      }
    }
    if (currentCandidate?.info_id) allCandidateIds.add(currentCandidate.info_id);
    return this.getInfoSummaryBatchByInfoIds([...allCandidateIds]);
  }

  /** 按优先级去重收集并转为 ContextInfoItem；当前消息未被其它维度采集时以 CURRENT 类型置于最前（不参与时间线拼接）。 */
  private collectDedupedContextItems(
    priorityList: ContextCollectionSource[],
    candidatesMap: Map<ContextCollectionSource, InfoRawRecord[]>,
    summaryMap: Map<string, InfoSummaryRecord>,
    currentCandidate: InfoRawRecord | null,
  ): ContextInfoItem[] {
    const seenIds = new Set<string>();
    const collectedItems: ContextInfoItem[] = [];
    for (const sourceKey of priorityList) {
      const candidates = candidatesMap.get(sourceKey) || [];
      for (const cand of candidates) {
        if (!cand || !cand.info_id || seenIds.has(cand.info_id)) {
          continue;
        }
        seenIds.add(cand.info_id);
        const summary = summaryMap.get(cand.info_id)?.summary;
        collectedItems.push(this.toContextItem(cand, sourceKey, summary));
      }
    }
    if (currentCandidate && !seenIds.has(currentCandidate.info_id)) {
      const summary = summaryMap.get(currentCandidate.info_id)?.summary;
      collectedItems.unshift(this.toContextItem(currentCandidate, CollectionSource.CURRENT, summary));
    }
    return collectedItems;
  }

  /** 将 raw record 转为标准 ContextInfoItem（info 为空时回退摘要占位文本；接受预取的摘要避免 N+1）。 */
  private toContextItem(raw: InfoRawRecord, collectionSource: ContextCollectionSource, summaryText?: string): ContextInfoItem {
    let contentText = raw.info || '';
    if (!contentText && summaryText) {
      contentText = `[摘要] ${summaryText}`;
    }
    return {
      id: raw.id || raw.info_id,
      info_id: raw.info_id,
      session_id: raw.session_id,
      work_id: raw.work_id || '',
      run_id: raw.run_id || '',
      info_type: raw.info_type || InfoType.REQUEST,
      info_creator_role: raw.info_creator_role,
      info_creator_id: raw.info_creator_id,
      info: contentText,
      content: contentText,
      summary: summaryText || '',
      summary_length: summaryText ? summaryText.length : 0,
      info_length: contentText.length,
      content_length: contentText.length,
      collection_source: collectionSource,
      source: collectionSource,
      pin: raw.pin ? 1 : 0,
      created: raw.created,
      updated: raw.updated,
      handle_result_type: raw.handle_result_type || DEFAULT_HANDLE_RESULT_TYPE,
    };
  }

  /** 按来源分类装配 categories（selected/pinned/timeline/citing/tag_relative/similarity/keyword/random/current）。 */
  private buildContextCategories(resultList: ContextInfoItem[]): NonNullable<ContextInfoOutput['categories']> {
    return {
      selected: resultList.filter((i) => i.collection_source === CollectionSource.CUSTOM),
      pinned: resultList.filter((i) => i.collection_source === CollectionSource.PINNED),
      timeline: resultList.filter((i) => i.collection_source === CollectionSource.TIMELINE),
      citing: resultList.filter((i) => i.collection_source === CollectionSource.CITING),
      tag_relative: resultList.filter((i) => i.collection_source === CollectionSource.TAG_RELATIVE),
      similarity: resultList.filter((i) => i.collection_source === CollectionSource.SIMILARITY),
      keyword: resultList.filter((i) => i.collection_source === CollectionSource.KEYWORD),
      random: resultList.filter((i) => i.collection_source === CollectionSource.RANDOM),
      current: resultList.filter((i) => i.collection_source === CollectionSource.CURRENT),
    };
  }

  /** 从 categories 提取各来源的 info_id 列表（category_ids）。 */
  private buildContextCategoryIds(
    categories: NonNullable<ContextInfoOutput['categories']>,
  ): NonNullable<ContextInfoOutput['category_ids']> {
    return {
      selected: categories.selected.map((i) => i.info_id),
      pinned: categories.pinned.map((i) => i.info_id),
      timeline: categories.timeline.map((i) => i.info_id),
      citing: categories.citing.map((i) => i.info_id),
      tag_relative: categories.tag_relative.map((i) => i.info_id),
      similarity: categories.similarity.map((i) => i.info_id),
      keyword: categories.keyword.map((i) => i.info_id),
      random: categories.random.map((i) => i.info_id),
      current: categories.current.map((i) => i.info_id),
    };
  }

  /** 从 categories 统计各来源条数（sources_summary）。 */
  private buildContextSourcesSummary(categories: NonNullable<ContextInfoOutput['categories']>): Record<string, number> {
    return {
      selected: categories.selected.length,
      pinned: categories.pinned.length,
      timeline: categories.timeline.length,
      citing: categories.citing.length,
      tag_relative: categories.tag_relative.length,
      similarity: categories.similarity.length,
      keyword: categories.keyword.length,
      random: categories.random.length,
      current: categories.current.length,
    };
  }

  /**
   * 组装三对象（source_ids_map / content_map / attribute_map）到 output，并按 work_id 落盘来源关系。
   * @param persist 是否将来源关系落盘到 info_context_source 表；内部 Agent 复用 context() 时应传 false，
   *                仅问答请求处理时的权威上下文构建（BUILD_WORK_CONTEXT / buildWorkContext）才落盘。
   */
  private async fillContextTriplesAndPersist(
    output: ContextInfoOutput,
    resultList: ContextInfoItem[],
    workId: string,
    persist: boolean = true,
    metrics?: Metrics,
  ): Promise<void> {
    const sourceIdsMap: ContextSourceIdMap = {};
    const contentMap: ContextContentMap = {};
    const attributeMap: ContextAttributeMap = {};

    for (const item of resultList) {
      if (!item.info_id) continue;
      const source = item.collection_source as CollectionSource;
      if (source) {
        if (!sourceIdsMap[source]) sourceIdsMap[source] = [];
        if (!sourceIdsMap[source]!.includes(item.info_id)) {
          sourceIdsMap[source]!.push(item.info_id);
        }
      }
      if (contentMap[item.info_id] === undefined) {
        contentMap[item.info_id] = item.info ?? item.content ?? '';
      }
      if (attributeMap[item.info_id] === undefined) {
        attributeMap[item.info_id] = {
          info_id: item.info_id,
          session_id: item.session_id,
          work_id: item.work_id || workId || '',
          run_id: item.run_id || '',
          info_type: item.info_type || '',
          info_creator_role: item.info_creator_role || '',
          info_creator_id: item.info_creator_id || '',
          pin: item.pin ?? 0,
          created: item.created,
          updated: item.updated,
          handle_result_type: item.handle_result_type || DEFAULT_HANDLE_RESULT_TYPE,
        };
      }
    }

    output.source_ids_map = sourceIdsMap;
    output.content_map = contentMap;
    output.attribute_map = attributeMap;

    if (persist) {
      await this.persistContextSourceMap(workId, sourceIdsMap, metrics);
    }
  }

  /** 将 work_id → 来源 → info_id 关系落盘到 info_context_source 表（幂等：先删后插）。 */
  private async persistContextSourceMap(
    workId: string,
    sourceIdsMap: ContextSourceIdMap,
    metrics?: Metrics,
  ): Promise<void> {
    if (!workId) return;
    try {
      await this.relationDb.delete(INFO_CONTEXT_SOURCE_TABLE, [
        { field: 'work_id', operator: Operator.EQ, value: workId },
      ]);
    } catch { /* ignore */ }

    const now = IdGenerator.now();
    for (const [source, infoIds] of Object.entries(sourceIdsMap)) {
      if (!infoIds || infoIds.length === 0) continue;
      for (const infoId of infoIds) {
        if (!infoId) continue;
        try {
          await this.relationDb.insert(INFO_CONTEXT_SOURCE_TABLE, [
            { field: 'id', value: IdGenerator.generate() },
            { field: 'created', value: now },
            { field: 'updated', value: now },
            { field: 'work_id', value: workId },
            { field: 'source', value: source },
            { field: 'info_id', value: infoId },
          ]);
        } catch (err) {
          // 容忍单条来源关系落盘失败：上下文快照持久化为辅助数据，缺失仅影响可视化溯源
          metrics?.warn('InfoCoreService.persistContextSourceMap 来源关系落盘失败已容忍', {
            error: err instanceof Error ? err.message : String(err),
            work_id: workId,
            source,
            info_id: infoId,
          });
        }
      }
    }
  }

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
    count: number,
    sessionId?: string,
  ): Promise<InfoRawRecord[]> {
    if (count <= 0) return [];

    const conditions = sessionId
      ? [{ field: 'session_id', operator: Operator.EQ, value: sessionId }]
      : [];

    const rows = await this.relationDb.select(INFO_RAW_TABLE, {
      conditions,
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
    metrics?: Metrics,
  ): Promise<void> {
    try {
      if (await this.getVectorRecord(this.tagVectorId(tag))) return;
      const embedding = await this.getTagEmbedding(tag, tagConfig, metrics);
      if (!embedding || embedding.length === 0) return;
      await this.upsertTagVector(tag, embedding);
    } catch (err) {
      // ignore
      // 容忍标签向量维护失败：向量缺失仅影响相似检索召回，不影响标签落库主流程
      metrics?.warn('InfoCoreService.maintainTagVector 标签向量维护失败已容忍', {
        error: err instanceof Error ? err.message : String(err),
        tag,
      });
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
      { llm_id: '', dimension: 1536, enable: 1, chunk_size: 512, chunk_overlap: 64 },
    );
    await this.ensureDefaultConfigRow(
      INFO_TAG_CONFIG_TABLE,
      { llm_id: '', prompt_template_id: '', tag_top_k: 5, enable: 1 },
    );
    await this.ensureDefaultConfigRow(
      INFO_SUMMARY_CONFIG_TABLE,
      { llm_id: '', prompt_template_id: '', enable: 1, threshold: 100, info_types: 'RESPONSE' },
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

  /** 判断信息是否为正常结果（非错误信息）。 */
  private isCorrectInfo(record: { handle_result_type?: string }): boolean {
    return (record.handle_result_type ?? DEFAULT_HANDLE_RESULT_TYPE) === HandleResultType.CORRECT;
  }

  /** 判断是否为内部执行轨迹记录（ACT 类型的 trace JSON，超大中间产物，不应作为上下文）。 */
  private isTraceInfo(record: { info_type?: string; info?: string }): boolean {
    if (record.info_type !== InfoType.ACT) return false;
    const info = String(record.info ?? '').trim();
    return info.startsWith('{"type":"trace"') || info.startsWith('{"type": "trace"');
  }

  private toInfoRawRecord(raw: Record<string, unknown>): InfoRawRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      session_id: raw['session_id'] as string,
      work_id: raw['work_id'] as string,
      run_id: raw['run_id'] as string,
      info_id: raw['info_id'] as string,
      info_type: raw['info_type'] as string,
      info_creator_role: raw['info_creator_role'] as string,
      info_creator_id: raw['info_creator_id'] as string,
      info: raw['info'] as string,
      info_length: raw['info_length'] as number,
      pin: raw['pin'] as number,
      trace_id: raw['trace_id'] as string,
      handle_result_type: (raw['handle_result_type'] as string) || DEFAULT_HANDLE_RESULT_TYPE,
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
      threshold: Number(raw['threshold'] ?? 100),
      info_types: String(raw['info_types'] ?? 'RESPONSE'),
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
      chunk_size: Number(raw['chunk_size'] ?? 512),
      chunk_overlap: Number(raw['chunk_overlap'] ?? 64),
    };
  }

  private toInfoContextConfigRecord(raw: Record<string, unknown>): InfoContextConfigRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      base_timeline_count: Number(raw['base_timeline_count'] ?? 500),
      base_tag_relative_count: Number(raw['base_tag_relative_count'] ?? 200),
      base_similarity_count: Number(raw['base_similarity_count'] ?? 150),
      base_keyword_count: Number(raw['base_keyword_count'] ?? 100),
      base_random_count: Number(raw['base_random_count'] ?? 50),
      random_max_percent: Number(raw['random_max_percent'] ?? 5),
      tag_relative_max_percent: Number(raw['tag_relative_max_percent'] ?? 20),
      similarity_max_percent: Number(raw['similarity_max_percent'] ?? 15),
      keyword_max_percent: Number(raw['keyword_max_percent'] ?? 10),
      keyword_score_threshold: Number(raw['keyword_score_threshold'] ?? 95),
      total: Number(raw['total'] ?? 1000),
      enable_snapshot_persistence: Number(raw['enable_snapshot_persistence'] ?? 1),
      priority_order: String(raw['priority_order'] ?? 'PINNED,CITING,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM'),
    };
  }
}
