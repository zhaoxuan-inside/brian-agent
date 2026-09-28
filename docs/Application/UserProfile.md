# Application / UserProfile

- 层：**Application**　模块：**UserProfile**
- 方法数：**56**（逻辑控制 20 · 数据处理 29 · 通用算法 7）

## 文件 `brian-backend/Application/UserProfile/access/UserProfileAccess.ts`

### UserProfileAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:43
- **引用次数**：272

#### `startAutoGeneration`

- **类型**：逻辑控制
- **说明**：启动：auto / generation（异步编排，接入层转发至 Service）
- **签名**：`startAutoGeneration(): Promise<void>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:46
- **引用次数**：5

#### `stopAutoGeneration`

- **类型**：逻辑控制
- **说明**：删除/清理：auto / generation（异步编排，接入层转发至 Service）
- **签名**：`stopAutoGeneration(): Promise<void>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:52
- **引用次数**：5

#### `configProfileDirection`

- **类型**：逻辑控制
- **说明**：处理 配置 / 画像 / direction（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configProfileDirection(i: ConfigProfileDirectionInput, o: ConfigProfileDirectionOutput, c: UserProfileContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:57
- **引用次数**：19

#### `deleteProfileDirection`

- **类型**：逻辑控制
- **说明**：删除/清理：画像 / direction（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`deleteProfileDirection(i: DeleteProfileDirectionInput, o: DeleteProfileDirectionOutput, c: UserProfileContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:63
- **引用次数**：4

#### `soProfileDirection`

- **类型**：逻辑控制
- **说明**：查询：画像 / direction（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soProfileDirection(i: GetProfileDirectionInput, o: GetProfileDirectionOutput, c: UserProfileContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:69
- **引用次数**：9

#### `soUserProfile`

- **类型**：逻辑控制
- **说明**：查询：用户 / 画像（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soUserProfile(i: GetUserProfileInput, o: GetUserProfileOutput, c: UserProfileContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:75
- **引用次数**：30

#### `generateProfile`

- **类型**：逻辑控制
- **说明**：构建/初始化：画像（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`generateProfile(i: GenerateProfileInput, o: GenerateProfileOutput, c: UserProfileContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:81
- **引用次数**：40

#### `saveUserPreference`

- **类型**：逻辑控制
- **说明**：写入/新增：用户 / preference（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`saveUserPreference(i: SaveUserPreferenceInput, o: SaveUserPreferenceOutput, c: UserProfileContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:87
- **引用次数**：16

#### `soProfileHistory`

- **类型**：逻辑控制
- **说明**：查询：画像 / 历史（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soProfileHistory(i: GetProfileHistoryInput, o: GetProfileHistoryOutput, c: UserProfileContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:93
- **引用次数**：12

#### `soProfileByVersion`

- **类型**：逻辑控制
- **说明**：查询：画像 / version（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soProfileByVersion(i: GetProfileByVersionInput, o: GetProfileByVersionOutput, c: UserProfileContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:99
- **引用次数**：9

#### `resetUserProfile`

- **类型**：逻辑控制
- **说明**：删除/清理：用户 / 画像（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`resetUserProfile(i: ResetUserProfileInput, o: ResetUserProfileOutput, c: UserProfileContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:105
- **引用次数**：10

#### `configUserProfile`

- **类型**：逻辑控制
- **说明**：处理 配置 / 用户 / 画像（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configUserProfile(i: ConfigUserProfileInput, o: ConfigUserProfileOutput, c: UserProfileContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/access/UserProfileAccess.ts:111
- **引用次数**：18

## 文件 `brian-backend/Application/UserProfile/application/UserProfileService.ts`

### UserProfileService

#### `configProfileDirection`

- **类型**：数据处理
- **说明**：处理 配置 / 画像 / direction（操作关系数据库）
- **签名**：`configProfileDirection(input: ConfigProfileDirectionInput, _output: ConfigProfileDirectionOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:52
- **引用次数**：19

#### `deleteProfileDirection`

- **类型**：数据处理
- **说明**：删除/清理：画像 / direction（操作关系数据库）
- **签名**：`deleteProfileDirection(input: DeleteProfileDirectionInput, _output: DeleteProfileDirectionOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:94
- **引用次数**：4

#### `soProfileDirection`

- **类型**：数据处理
- **说明**：查询：画像 / direction
- **签名**：`soProfileDirection(_input: GetProfileDirectionInput, output: GetProfileDirectionOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:102
- **引用次数**：9

#### `soUserProfile`

- **类型**：数据处理
- **说明**：查询：用户 / 画像（操作关系数据库）
- **签名**：`soUserProfile(input: GetUserProfileInput, output: GetUserProfileOutput, _ctx: UserProfileContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:111
- **引用次数**：30

#### `generateProfile`

- **类型**：数据处理
- **说明**：构建/初始化：画像
- **签名**：`generateProfile(input: GenerateProfileInput, output: GenerateProfileOutput, _ctx: UserProfileContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:220
- **引用次数**：40

### UserProfileService（私有）

#### `soNextProfileVersion`

- **类型**：数据处理
- **说明**：查询：画像 / version（操作关系数据库）
- **签名**：`soNextProfileVersion(): Promise<number>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:247
- **引用次数**：2

#### `soConversationText`

- **类型**：通用算法
- **说明**：查询：conversation / 文本（纯计算，无外部 IO）
- **签名**：`soConversationText(sessionId: string \| undefined, config: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:256
- **引用次数**：2

#### `analyzeDimensions`

- **类型**：数据处理
- **说明**：处理 analyze / dimensions（序列化输出）
- **签名**：`analyzeDimensions(filteredDirs: Array<Record<string, unknown>>, conversationText: string, config: Record<string, unknown>, metrics?: Metrics): Promise<Array<{ direction_key: string; value: string; evidence: string; confidence: number }>>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:274
- **引用次数**：2

#### `saveProfileRecord`

- **类型**：数据处理
- **说明**：写入/新增：画像 / record（操作关系数据库）
- **签名**：`saveProfileRecord(sessionId: string \| undefined, newVersion: number, summary: string, recordId: string, now: number): Promise<void>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:304
- **引用次数**：2

#### `saveDimensionData`

- **类型**：数据处理
- **说明**：写入/新增：dimension（操作关系数据库）
- **签名**：`saveDimensionData(recordId: string, dimensionData: Array<{ direction_key: string; value: string; evidence: string; confidence: number }>, now: number): Promise<void>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:323
- **引用次数**：2

#### `saveWriterProfile`

- **类型**：数据处理
- **说明**：写入/新增：写作 / 画像
- **签名**：`saveWriterProfile(sessionId: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:342
- **引用次数**：2

#### `toProfileOutput`

- **类型**：数据处理
- **说明**：格式化/序列化：画像 / 输出（反序列化）
- **签名**：`toProfileOutput(newVersion: number, now: number, sessionId: string \| undefined, dimensionData: Array<{ direction_key: string; value: string; evidence: string; confidence: number }>, summary: string): Record<string, unknown>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:359
- **引用次数**：2

### UserProfileService

#### `saveUserPreference`

- **类型**：数据处理
- **说明**：写入/新增：用户 / preference
- **签名**：`saveUserPreference(input: SaveUserPreferenceInput, _output: SaveUserPreferenceOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:381
- **引用次数**：16

#### `soProfileHistory`

- **类型**：数据处理
- **说明**：查询：画像 / 历史
- **签名**：`soProfileHistory(input: GetProfileHistoryInput, output: GetProfileHistoryOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:425
- **引用次数**：12

#### `soProfileByVersion`

- **类型**：数据处理
- **说明**：查询：画像 / version（操作关系数据库，反序列化）
- **签名**：`soProfileByVersion(input: GetProfileByVersionInput, output: GetProfileByVersionOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:448
- **引用次数**：9

#### `resetUserProfile`

- **类型**：数据处理
- **说明**：删除/清理：用户 / 画像（操作关系数据库）
- **签名**：`resetUserProfile(input: ResetUserProfileInput, output: ResetUserProfileOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:503
- **引用次数**：10

#### `configUserProfile`

- **类型**：数据处理
- **说明**：处理 配置 / 用户 / 画像（操作关系数据库）
- **签名**：`configUserProfile(input: ConfigUserProfileInput, output: ConfigUserProfileOutput, _ctx: UserProfileContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:526
- **引用次数**：18

#### `startAutoGeneration`

- **类型**：逻辑控制
- **说明**：启动：auto / generation
- **签名**：`startAutoGeneration(): void`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:581
- **引用次数**：5

#### `stopAutoGeneration`

- **类型**：逻辑控制
- **说明**：删除/清理：auto / generation
- **签名**：`stopAutoGeneration(): void`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:585
- **引用次数**：5

### UserProfileService（私有）

#### `scheduleAutoGeneration`

- **类型**：逻辑控制
- **说明**：处理 schedule / auto / generation（含异常兜底，异步编排）
- **签名**：`scheduleAutoGeneration(metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:592
- **引用次数**：4

#### `runAutoGeneration`

- **类型**：逻辑控制
- **说明**：处理执行：auto / generation（异步编排）
- **签名**：`runAutoGeneration(): Promise<void>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:614
- **引用次数**：2

#### `queryTable`

- **类型**：数据处理
- **说明**：查询：数据表（操作关系数据库）
- **签名**：`queryTable(table: string, conditions: Array<{ field: string; operator: string; value?: unknown }>, orderBy?: Array<{ field: string; direction: string }>, limitRow?: number, offset?: number): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:628
- **引用次数**：14

#### `sqlOp`

- **类型**：逻辑控制
- **说明**：处理 sql / op
- **签名**：`sqlOp(op: string): string`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:693
- **引用次数**：2

#### `loadStoredDimensions`

- **类型**：数据处理
- **说明**：获取：stored / dimensions（反序列化）
- **签名**：`loadStoredDimensions(profileRecordId: string): Promise<Record<string, { value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }>>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:701
- **引用次数**：2

#### `loadPrevVersionDimensions`

- **类型**：数据处理
- **说明**：获取：version / dimensions
- **签名**：`loadPrevVersionDimensions(sessionId: string \| undefined, latestRecord: Record<string, unknown> \| null): Promise<Record<string, string> \| null>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:721
- **引用次数**：2

#### `determineStability`

- **类型**：数据处理
- **说明**：处理 determine / stability（序列化输出，反序列化）
- **签名**：`determineStability(key: string, currentValue: unknown, prevVersionDimensions: Record<string, string> \| null): 'stable' \| 'drifting' \| 'emerging'`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:752
- **引用次数**：2

#### `aggregateDimension`

- **类型**：逻辑控制
- **说明**：计算统计：dimension
- **签名**：`aggregateDimension(key: string, sessionId: string \| undefined, writerPreferences: { language: string; style: string; depth: string; format: string; additional_preferences: string; } \| null, latestRecord: Record<string, unknown> \| null, metrics?: Metrics): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:767
- **引用次数**：2

#### `aggregateCustomDimension`

- **类型**：数据处理
- **说明**：计算统计：custom / dimension（反序列化）
- **签名**：`aggregateCustomDimension(key: string, latestRecord: Record<string, unknown> \| null): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:792
- **引用次数**：2

#### `aggregateLanguagePreference`

- **类型**：通用算法
- **说明**：计算统计：language / preference（纯计算，无外部 IO）
- **签名**：`aggregateLanguagePreference(sessionId: string \| undefined, writerPreferences: { language: string; style: string; depth: string; format: string; additional_preferences: string; } \| null, metrics?: Metrics): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:829
- **引用次数**：3

#### `aggregateReplyStyle`

- **类型**：逻辑控制
- **说明**：计算统计：reply / style
- **签名**：`aggregateReplyStyle(writerPreferences: { language: string; style: string; depth: string; format: string; additional_preferences: string; } \| null): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:868
- **引用次数**：2

#### `aggregateKnowledgeInterest`

- **类型**：数据处理
- **说明**：计算统计：知识 / interest（操作关系数据库）
- **签名**：`aggregateKnowledgeInterest(sessionId: string \| undefined, metrics?: Metrics): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:888
- **引用次数**：3

#### `aggregateInteractionHabit`

- **类型**：数据处理
- **说明**：计算统计：interaction / habit（操作关系数据库）
- **签名**：`aggregateInteractionHabit(sessionId: string \| undefined, metrics?: Metrics): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:943
- **引用次数**：3

#### `aggregateFeedbackSensitivity`

- **类型**：数据处理
- **说明**：计算统计：反馈 / sensitivity（反序列化）
- **签名**：`aggregateFeedbackSensitivity(): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:985
- **引用次数**：2

#### `getConfig`

- **类型**：通用算法
- **说明**：获取：配置（纯计算，无外部 IO）
- **签名**：`getConfig(): Promise<Record<string, unknown>>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:1013
- **引用次数**：69

#### `getConfigRecord`

- **类型**：数据处理
- **说明**：获取：配置 / record（操作关系数据库）
- **签名**：`getConfigRecord(): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:1033
- **引用次数**：4

#### `buildFallbackSummary`

- **类型**：数据处理
- **说明**：构建/初始化：fallback / 摘要（序列化输出）
- **签名**：`buildFallbackSummary(dimensions: Record<string, unknown>, writerPreferences: { language: string; style: string; depth: string; format: string; additional_preferences: string; } \| null): string`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:1037
- **引用次数**：2

#### `analyzeDimensionWithLLM`

- **类型**：通用算法
- **说明**：处理 analyze / dimension / 大模型（纯计算，无外部 IO）
- **签名**：`analyzeDimensionWithLLM(directionKey: string, directionName: string, conversationText: string, dirConfig: Record<string, unknown>, config: Record<string, unknown>, metrics?: Metrics): Promise<{ value: unknown; confidence: number; evidence: unknown[] }>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:1056
- **引用次数**：3

#### `renderPrompt`

- **类型**：通用算法
- **说明**：格式化/序列化：提示词（纯计算，无外部 IO）
- **签名**：`renderPrompt(templateId: string \| undefined, fallbackTitle: string, variables: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:1142
- **引用次数**：11

#### `parseLLMAnalysis`

- **类型**：通用算法
- **说明**：解析：大模型 / analysis（纯计算，无外部 IO）
- **签名**：`parseLLMAnalysis(response: string): { value: unknown; confidence: number; evidence: unknown[] }`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:1171
- **引用次数**：2

#### `statisticalFallback`

- **类型**：通用算法
- **说明**：处理 statistical / fallback（纯计算，无外部 IO）
- **签名**：`statisticalFallback(directionKey: string, conversationText: string): unknown`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:1184
- **引用次数**：3

#### `buildSummaryFromDimensions`

- **类型**：数据处理
- **说明**：构建/初始化：摘要 / dimensions（序列化输出，反序列化）
- **签名**：`buildSummaryFromDimensions(dimData: Array<{ direction_key: string; value: string; confidence: number }>, enabledDirs: Array<Record<string, unknown>>): string`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:1205
- **引用次数**：2

#### `cleanupOldVersions`

- **类型**：数据处理
- **说明**：删除/清理：old / versions（操作关系数据库）
- **签名**：`cleanupOldVersions(retentionVersions: number, sessionId?: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Application/UserProfile/application/UserProfileService.ts:1227
- **引用次数**：3

## 文件 `brian-backend/Application/UserProfile/infrastructure/UserProfileSchemaInitializer.ts`

### UserProfileSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): Promise<void>`
- **位置**：brian-backend/Application/UserProfile/infrastructure/UserProfileSchemaInitializer.ts:13
- **引用次数**：99

