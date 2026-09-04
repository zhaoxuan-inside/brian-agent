# Base / LLMProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## LLMAccess

源码：`brian-backend/Base/LLMProvider/access/LLMAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件：写入默认配置并恢复 enabled 状态。 |
| `addLLMProvider` | `input: AddLLMProviderInput, output: AddLLMProviderOutput, context: LLMContext, metrics?...` | `Promise<boolean>` | 新增 LLM 提供商 |
| `updateLLMProvider` | `input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, context: LLMContext, me...` | `Promise<boolean>` | 更新 LLM 提供商 |
| `delLLMProvider` | `input: DelLLMProviderInput, output: DelLLMProviderOutput, context: LLMContext, metrics?...` | `Promise<boolean>` | 删除 LLM 提供商（级联删除 llm_cache + llm_available + llm_usage） |
| `soLLMProvider` | `input: SoLLMProviderInput, output: SoLLMProviderOutput, context: LLMContext, metrics?: ...` | `Promise<boolean>` | 搜索 LLM 提供商 |
| `testLLMProvider` | `input: TestLLMProviderInput, output: TestLLMProviderOutput, context: LLMContext, metric...` | `Promise<boolean>` | 测试 LLM 提供商连接 |
| `listLLM` | `input: ListLLMInput, output: ListLLMOutput, context: LLMContext, metrics?: Metrics, rep...` | `Promise<boolean>` | 获取 LLM 模型列表（从提供商 API 拉取并保存到 llm_model） |
| `addLLM` | `input: AddLLMInput, output: AddLLMOutput, context: LLMContext, metrics?: Metrics, repor...` | `Promise<boolean>` | 新增 LLM（添加到启用列表 llm_enable） |
| `delLLM` | `input: DelLLMInput, output: DelLLMOutput, context: LLMContext, metrics?: Metrics, repor...` | `Promise<boolean>` | 删除 LLM |
| `updateLLM` | `input: UpdateLLMInput, output: UpdateLLMOutput, context: LLMContext, metrics?: Metrics,...` | `Promise<boolean>` | 更新 LLM |
| `soLLM` | `input: SoLLMInput, output: SoLLMOutput, context: LLMContext, metrics?: Metrics, report?...` | `Promise<boolean>` | 搜索可用模型（支持关键词搜索名称） |
| `soLLMById` | `input: GetLLMInput, output: GetLLMOutput, context: LLMContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `execLLM` | `input: ExecLLMInput, output: ExecLLMOutput, context: LLMContext, metrics?: Metrics, rep...` | `Promise<boolean>` | 调用 LLM 执行推理 |
| `execLLMEvents` | `input: ExecLLMEventsInput, output: ExecLLMEventsOutput, context: LLMContext, metrics?: ...` | `Promise<boolean>` | 调用 LLM 原生消息 + 原生工具调用流（Runtime v2 · Loop-PRD §4） |
| `embedLLM` | `input: EmbedLLMInput, output: EmbedLLMOutput, context: LLMContext, metrics?: Metrics, r...` | `Promise<boolean>` | 调用 LLM 生成向量 |
| `genLLMAttr` | `input: GenLLMAttrInput, output: GenLLMAttrOutput, context: LLMContext, metrics?: Metric...` | `Promise<boolean>` | 一键补全模型属性（生成简介与模型用途） |
| `visualizedLLM` | `input: VisualizedLLMInput, output: VisualizedLLMOutput, context: LLMContext, metrics?: ...` | `Promise<boolean>` | 可视化数据 |
| `enableLLM` | `input: EnableLLMInput, output: EnableLLMOutput, context: LLMContext, metrics?: Metrics,...` | `Promise<boolean>` | 启用/禁用 LLM 组件 |
