# Core / InfoCoreProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## InfoCoreAccess

源码：`brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件：写入默认配置。 |
| `saveInfo` | `input: SaveInfoInput, output: SaveInfoOutput, context: InfoCoreContext, metrics?: Metri...` | `Promise<boolean>` | 保存原始信息，异步触发向量化、标签、摘要、关键词处理 |
| `pinInfo` | `input: PinInfoInput, output: PinInfoOutput, context: InfoCoreContext, metrics?: Metrics...` | `Promise<boolean>` | 切换信息 pin 状态 |
| `vectorInfo` | `input: ProcessInfoInput, output: VectorInfoOutput, context: InfoCoreContext, metrics?: ...` | `Promise<boolean>` | 向量化信息 |
| `tagInfo` | `input: ProcessInfoInput, output: TagInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | 使用 LLM 提取标签 |
| `summaryInfo` | `input: ProcessInfoInput, output: SummaryInfoOutput, context: InfoCoreContext, metrics?:...` | `Promise<boolean>` | 生成信息摘要 |
| `keywordInfo` | `input: ProcessInfoInput, output: KeywordInfoOutput, context: InfoCoreContext, metrics?:...` | `Promise<boolean>` | 提取关键词 |
| `graphTag` | `input: GraphTagInput, output: GraphTagOutput, context: InfoCoreContext, metrics?: Metri...` | `Promise<boolean>` | 为标签创建图节点并联接相关 info |
| `rebuildCooccurGraph` | `input: RebuildCooccurGraphInput, output: RebuildCooccurGraphOutput, context: InfoCoreCo...` | `Promise<boolean>` | 从 info_tag 表全量重建共现边（cooccur），用于存量数据回填 |
| `lastNInfo` | `input: LastNInfoInput, output: LastNInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | 时间线搜索：最近 N 条 |
| `graphNInfo` | `input: GraphNInfoInput, output: GraphNInfoOutput, context: InfoCoreContext, metrics?: M...` | `Promise<boolean>` | 图邻居搜索 |
| `similarKInfo` | `input: SimilarKInfoInput, output: SimilarKInfoOutput, context: InfoCoreContext, metrics...` | `Promise<boolean>` | 语义相似度搜索 |
| `keywordKInfo` | `input: KeywordKInfoInput, output: KeywordKInfoOutput, context: InfoCoreContext, metrics...` | `Promise<boolean>` | 关键词搜索 |
| `relationKInfo` | `input: RelationKInfoInput, output: RelationKInfoOutput, context: InfoCoreContext, metri...` | `Promise<boolean>` | 标签关联搜索 |
| `graphInfo` | `input: GraphInfoInput, output: GraphInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | 会话图可视化 |
| `soCitationEdges` | `input: SoCitationEdgesInput, output: SoCitationEdgesOutput, context: InfoCoreContext, m...` | `Promise<boolean>` | 查询 GraphDB 引用边（CITATION），替代旧 info_graph 表 |
| `delInfoGraph` | `input: DelInfoGraphInput, output: DelInfoGraphOutput, context: InfoCoreContext, metrics...` | `Promise<boolean>` | 级联删除 GraphDB info 节点与引用边 |
| `clearGraph` | `input: ClearGraphInput, output: ClearGraphOutput, context: InfoCoreContext, metrics?: M...` | `Promise<boolean>` | 一键清理某类文本图（node_type 节点及其边） |
| `rebuildCitationGraph` | `input: RebuildCitationGraphInput, output: RebuildCitationGraphOutput, context: InfoCore...` | `Promise<boolean>` | 迁移旧 info_graph 表数据到 GraphDB，并删除旧表 |
| `context` | `input: ContextInfoInput, output: ContextInfoOutput, context: InfoCoreContext, metrics?:...` | `Promise<boolean>` | 构建 Agent 上下文（五源融合） |
| `soContextByWork` | `input: SoContextByWorkInput, output: SoContextByWorkOutput, context: InfoCoreContext, m...` | `Promise<boolean>` | 按 work_id 查询该次问答使用到的上下文（三对象结构） |
| `soInfoTagConfig` | `input: SoInfoTagConfigInput, output: SoInfoTagConfigOutput, context: InfoCoreContext, m...` | `Promise<boolean>` | 获取标签配置 |
| `updateInfoTagConfig` | `input: UpdateInfoTagConfigInput, output: UpdateInfoTagConfigOutput, context: InfoCoreCo...` | `Promise<boolean>` | 更新标签配置 |
| `soInfoSummaryConfig` | `input: SoInfoSummaryConfigInput, output: SoInfoSummaryConfigOutput, context: InfoCoreCo...` | `Promise<boolean>` | 获取摘要配置 |
| `updateInfoSummaryConfig` | `input: UpdateInfoSummaryConfigInput, output: UpdateInfoSummaryConfigOutput, context: In...` | `Promise<boolean>` | 更新摘要配置 |
| `soInfoConfig` | `input: SoInfoConfigInput, output: SoInfoConfigOutput, context: InfoCoreContext, metrics...` | `Promise<boolean>` | 获取全局配置 |
| `updateInfoConfig` | `input: UpdateInfoConfigInput, output: UpdateInfoConfigOutput, context: InfoCoreContext,...` | `Promise<boolean>` | 更新全局配置 |
| `soInfoVectorConfig` | `input: SoInfoVectorConfigInput, output: SoInfoVectorConfigOutput, context: InfoCoreCont...` | `Promise<boolean>` | 获取向量配置 |
| `updateInfoVectorConfig` | `input: UpdateInfoVectorConfigInput, output: UpdateInfoVectorConfigOutput, context: Info...` | `Promise<boolean>` | 更新向量配置 |
| `soInfoContextConfig` | `input: SoInfoContextConfigInput, output: SoInfoContextConfigOutput, context: InfoCoreCo...` | `Promise<boolean>` | 获取上下文构建配置 |
| `updateInfoContextConfig` | `input: UpdateInfoContextConfigInput, output: UpdateInfoContextConfigOutput, context: In...` | `Promise<boolean>` | 更新上下文构建配置 |
| `delInfo` | `input: DelInfoInput, output: DelInfoOutput, context: InfoCoreContext, metrics?: Metrics...` | `Promise<boolean>` | 清理过期信息（级联） |
| `backfillMissingSummaries` | `input: BackfillMissingSummariesInput, output: BackfillMissingSummariesOutput, context: ...` | `Promise<boolean>` | 补生成缺失摘要（幂等；LLM 间歇失败导致的摘要丢失补偿） |
| `updateInfo` | `input: UpdateInfoInput, output: UpdateInfoOutput, context: InfoCoreContext, metrics?: M...` | `Promise<boolean>` | 改写指定 work 下某 info_type 的 info 内容（如需求确认 APPROVE 替换 REQUEST）。 |
| `delInfoByWork` | `input: DelInfoByWorkInput, output: DelInfoByWorkOutput, context: InfoCoreContext, metri...` | `Promise<boolean>` | 删除指定 work 落库的全部信息及派生数据（如需求确认 CANCEL 丢弃本次提问）。 |
| `delInfoBySession` | `input: DelInfoBySessionInput, output: DelInfoBySessionOutput, context: InfoCoreContext,...` | `Promise<boolean>` | ===== 新增（2026-09-15 记忆集中）：删除指定 session 的全部记忆信息与派生数据（快照/摘要/标签/关键词/向量），级联 GraphDB ===== |
| `existVectorInfo` | `input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | 检查 info_vector 是否存在 |
| `existTagInfo` | `input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | 检查 info_tag 是否存在 |
| `existSummaryInfo` | `input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | 检查 info_summary 是否存在 |
