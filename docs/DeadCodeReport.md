# 死代码审计与清理报告

> 全量静态分析（TS AST + Vue SFC 解析）自动检测 + 人工逐项核实 + 已全部清理。检测维度：空方法、桩代码、无调用方方法（统计范围含动态调用、字符串映射调用，如 HTTP 路由名、事件名）。

## 清理结果

| 指标 | 清理前 | 清理后 |
|------|--------|--------|
| 方法总数 | 3025 | 2942 |
| 空方法 | 1 | 0 |
| 桩代码 | 1 | 0 |
| 疑似死代码 | 55 | 0 |
| 存疑方法合计 | 57 | **0** |

清理后复检（含删除后暴露的各层孤儿方法，迭代至收敛）：**2942 个方法全部为 normal，死代码归零**。

## 已清理清单

### 空方法

| 方法 | 位置 | 处置 |
|------|------|------|
| `ChatService.legacyOpenChatStreamRemoved` | ChatService.ts | 删除（方法体为空，旧流式协议残留占位） |

### 桩代码

| 方法 | 位置 | 处置 |
|------|------|------|
| `GraphDBComponent.getConnection` | GraphDBComponent.ts | 删除（返回 null 的桩实现，无调用方） |

### 无调用方方法（dead code）

| 文件 | 删除内容 | 说明 |
|------|----------|------|
| `GraphDBComponent.ts` | queryWithParams、nodeExists、countNodes | 未使用的封装，实际查询走直连路径 |
| `McpTransport.ts` | StdioMcpClient.listTools | 无调用方 |
| `Metrics.ts` | sumSpanSelfMs、summarizeLLMUsage | 统计辅助，无调用方 |
| `InfoCoreService.ts` | getInfoById、ensureKeywordNode、randomSampleInfos | 辅助查询，无调用方 |
| `SingleRowConfigStore.ts` | invalidate | 配置中心辅助，无调用方（非业务路径） |
| `AgentDefService.ts` | soSignatureMatch、defBrief | Agent 定义辅助，无调用方 |
| `updatePlanSkill.ts` | clearPlan | Plan 缓存清理入口，无调用方 |
| `ChatService.ts` | chunkResponseForTranscript | 旧流式协议辅助，无调用方 |
| `ConfigService.ts` | ensureModulePrivilege | 配置中心权限辅助，无调用方（非业务路径） |
| `SelfLearningService.ts` | splitByHeaders、splitBySize | 切分算法已被其他实现取代 |
| `VisualizationService.ts` | enrichAgentDAG、enrichComponentRefs、enrichIdArrayField、enrichBuildPhase、enrichExecutingPhase、enrichWritingPhase、enrichEvaluatingPhase、enrichAgentDAGNode、resolveSingleRef、deepClone、resolveLLM、resolveSoul、resolveSkill、resolveMcp、resolvePrompt | 可视化富化体系整体无调用方（含删除后暴露的 2 层孤儿） |
| `ConfigAccess.ts` | getSoulRule、getSkillRule | 无路由暴露、无调用方 |
| `test-helpers.ts` | initConfigSchema、initUserProfileSchema、setupTestMocks、createMock* 共 24 个 | PlannerAgent 与 Orchestration 体系下线后的残留 Mock 工厂 |
| `SimilarityHelper.ts` | simpleSimilarity（连带 Core/shared/index 导出） | 唯一消费者为已删除的 soSignatureMatch |
| `configDisplay.ts` | layerIcon、moduleIcon、categoryName、formatValueSummary、buildConfigFields、buildEntityFields、LAYER_ICONS、MODULE_ICONS、CATEGORY_NAMES、ENTITY_FIELD_DEFS、text/num/bool/json/enumF、FieldDef、未使用图标 import | 唯一消费者为已删除的 useConfigView |
| `heatmap.ts` | localTzOffsetMinutes | 工具函数，无调用方 |
| `useConfigView.ts` | 整文件 | 无组件引用 |
| `useMonitor.ts` | 整文件 | 无组件引用 |
| `tokenCalendar.ts` | 整文件 | 功能已在 MonitorPanel 内部实现，文件无引用 |
| `GraphShot.vue` | GraphEdgeRef 接口 | 未使用的类型定义 |

## 检测口径

- 引用统计范围：`brian-backend`、`brian-frontend/src`、`shared/src`、`scripts` 全部源码，含模板字符串与字符串字面量（覆盖 HTTP 路由名映射、事件总线事件名、动态属性调用）。引用数 = 方法名全库出现次数（含定义处 1 次），≤1 即除定义外无任何引用。
- 已排除的误报：Vue 指令生命周期钩子（`vReveal.mounted/unmounted`，由 Vue 运行时按约定调用）；第三方 vendor 库（isolated-vm）不纳入分析。
- 清理采用迭代方式：每删除一批方法后重新全量检测，直至孤儿方法链收敛归零（共迭代 3 轮）。
