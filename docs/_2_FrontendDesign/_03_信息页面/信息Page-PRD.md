# 信息展示页面产品需求文档 (PRD)

## 1. 文档概述
### 1.1 产品背景
构建一个系统级的信息可视化与知识管理面板，将离散的系统数据（问答记忆、本地资料、标签关联、关键词）通过结构化布局和可视化图表进行集中展示，帮助用户高效回顾历史工作、管理知识库并洞察知识间的深层联系。

### 1.2 核心目标
-   **记忆回溯**：基于三层ID模型，提供精准、可追溯的问答历史查看体验。
-   **知识管理**：安全、便捷地管理本地Markdown资料库。
-   **知识洞察**：通过图谱可视化揭示Tag与关键词的关联网络及权重分布。

## 2. 全局交互规范
-   **布局方式**：采用全屏Tab切换布局，包含“问答记忆”、“资料库”、“Tag关系图”、“关键词图”四个独立Tab页签。
-   **状态保持**：支持Tab切换时的状态缓存（如滚动位置、图谱缩放比例、展开/折叠状态）。
-   **空状态**：所有模块在无数据时展示引导性空状态插画及操作指引，禁止显示空白区域。
-   **响应式**：适配桌面端主流分辨率，Canvas图表支持鼠标滚轮缩放与拖拽平移。

## 3. 功能详细说明

### 3.1 Tab 1：用户问答信息（记忆）
以时间为维度倒序展示用户的所有问答内容，支持三级数据结构嵌套渲染。

#### 3.1.1 数据模型定义
| ID类型 | 业务含义 | UI映射 |
| :--- | :--- | :--- |
| `work_id` | 一次完整的工作/学习会话集合 | 时间轴节点 / 列表分组标题 |
| `interact_id` | 一轮完整的输入输出交互 | 列表中的对话卡片 |
| `msg_id` | 单条独立消息（用户/Agent/工具） | 卡片内的具体消息条目 |

#### 3.1.2 时间轴组件（左侧）
-   **节点粒度**：以 `work_id` 为最小节点单位。
-   **节点标签**：优先显示AI生成的Work摘要；若无摘要，取该Work下首条用户消息前20字；若仍无，显示创建时间。
-   **密集聚合**：同一天存在≥3个Work时，自动聚合为“N个工作”节点，点击展开子节点列表。
-   **交互**：支持鼠标拖动、点击定位；拖动时右侧列表实时联动更新，定位延迟≤300ms。

#### 3.1.3 列表展示区（右侧）
-   **三级嵌套结构**：
    -   **Level 1 (Work Group)**：显示Work摘要、起止时间、关联Tag；默认仅最新Work展开，历史Work折叠。
    -   **Level 2 (Interact Card)**：按 `interact_id` 分组，视觉上用卡片容器包裹一组Q&A。
    -   **Level 3 (Message Item)**：按 `msg_id` 逐条渲染，根据角色（User/Agent/Tool/System）区分样式。
-   **消息渲染规则**：
    -   Agent回复：完整渲染Markdown，支持代码高亮、公式、表格。
    -   工具调用结果：默认折叠，显示工具名称及执行状态图标，点击展开JSON详情。
    -   流式中断：标记“生成中断”状态，保留已生成内容。
-   **搜索与定位**：
    -   支持全文搜索，命中 `msg_id` 时自动展开其所属Interact和Work上下文。
    -   支持URL深链接定位：`?work_id=xxx&interact_id=yyy&msg_id=zzz`。

### 3.2 Tab 2：用户的资料库
以卡片网格形式管理本地Markdown知识库，支持路径配置、权限校验及内容预览。

#### 3.2.1 资料库卡片列表
-   **排序**：第一个固定为“添加资料库”卡片（虚线边框+加号图标），其余按添加时间倒序排列。
-   **卡片内容**：资料库名称、本地路径（脱敏显示）、文件数量、最后更新时间。
-   **删除操作**：右上角删除按钮，点击弹出二次确认弹窗，明确提示“仅移除引用，不删除本地文件”。

#### 3.2.2 添加/编辑资料库
-   **路径输入**：支持手动输入或系统文件夹选择器。
-   **异步校验**：输入路径后实时校验（防抖500ms），反馈状态：
    -   ✅ 路径有效且可读
    -   ❌ 路径不存在
    -   ❌ 无读取权限
    -   ⏳ 校验中
-   **确认提交**：仅在校验通过状态下允许点击确认按钮。

#### 3.2.3 资料库详情页
-   **入口**：点击资料库卡片进入。
-   **文件列表**：以卡片/列表视图展示该目录下所有 `.md` 文件，支持按名称/修改时间排序。
-   **Markdown预览**：
    -   点击文件打开右侧抽屉或新Tab渲染内容。
    -   渲染引擎支持GFM标准、代码高亮、KaTeX数学公式、Mermaid图表。
    -   防范XSS攻击，禁用内联脚本执行。
    -   支持从MD内容中点击 `work_id` 引用链接跳转至问答记忆Tab对应位置。

#### 3.2.4 文档阅读器（阅读扩展）
文档打开后进入三栏阅读器，面向「阅读 + 学习 + 提问」场景：
-   **目录栏（左）**：由正文标题（`#`~`####`）自动生成层级目录，点击平滑滚动定位；无章节时展示占位。
-   **正文阅读栏（中）**：卡片式阅读区，正文限宽（约 46rem）并采用舒适行高；顶部展示文档名、学习状态、章节数 / 字数 / 体积与操作入口；正文区域内滚动，顶部固定「编辑 / 删除」操作。
-   **读伴提问栏（右）**：常驻展示该文档的全部咨询卡片；卡片含编号、选中原文引用、问题与回答（Markdown 渲染）。
-   **边注模式（宽屏 ≥1360px）**：模拟「读纸质书在空白处写批注」的体验——问答卡片脱离独立右栏，绝对定位到正文右侧空白（约 18rem 宽），垂直对齐其正文标注位置；卡片经编号徽章与左侧引线和正文标注建立视觉联系。相邻卡片重叠时向下顺延，边注总高度超过正文时自动撑开内容区保证可滚动查看。正文改为限宽靠左 + 版心居中的书页布局；窄屏（<1360px）回退为独立右栏列表。点击正文标注与点击卡片双向联动激活（标注高亮 + 卡片高亮，视口外的一侧自动滚入）；正文高度变化（图片加载 / 编辑写回 / 窗口缩放）时自动重排对齐。
-   **划线提问**：正文选中文本后右键弹出「询问读伴」，弹出提问框；提问默认文案为「请解释这段内容」。
-   **标注与定位**：提问成功后，正文对应文本被标注为带编号的下划线；点击卡片高亮并平滑滚动到对应标注，点击正文标注联动高亮对应卡片，再次点击取消高亮。
-   **失效降级（重锚定）**：文档被编辑或外部修改后，标注按两级策略在渲染后正文中重新对齐：① 全文拼接文本节点**精确匹配**（支持同一块级元素内跨行内节点，如选区内含加粗/链接）；② 失败时**模糊重锚定**——归一化（忽略空白、标点、大小写）后以选中片段头/中/尾探针收集候选窗口，字符重合度 ≥0.6 视为命中（改错别字、增删词语、调整标点后仍能对齐）。仍无法对齐的标注才标记「原文已变更」（不再绘制下划线，卡片仍保留展示，边注模式下顺延排布在前一卡片之后）；跨块级元素的选区不绘制下划线（避免非法 DOM 嵌套）。
-   **编辑文档**：点击「编辑」进入 Markdown 源码编辑模式，保存后写回本地文件，并重新进入学习队列（状态置 `PENDING`）；保存后自动重算目录与字数、重新匹配标注。
-   **删除文档**：点击「删除」弹出二次确认（明确提示删除本地文件、同步清理该文档咨询记录且不可恢复）；确认后删除本地文件、级联清理索引与咨询记录，并返回目录列表。
-   **空/异常态**：无提问时展示引导文案；文档已被删除/不可读时正文降级展示友好提示。

#### 3.2.5 读伴问答（专用 Agent / Prompt / Soul）
文档问答由「文档伴读」专用 Agent 承载：系统段使用专用身份 Prompt（`builtin.document_reading_identity`）叠加专用 Soul（文档伴读导师），问答 Prompt 使用 `builtin.document_query`（含文档标题、前文、选中内容、后文与问题）。
-   **Agent 声明**：Runtime 声明式 Agent，`status=Disabled`（不参与主对话匹配，仅由资料库问答显式调用），模型留空由配置或自动匹配决定。
-   **配置覆盖**：「配置中心 > 应用配置 > 自学习 > 文档阅读 Prompt / 文档阅读 LLM」优先于 Agent 默认。
-   **能力增强**：回答要求先给结论、结合上下文解释含义与关系、必要时用类比/最小示例、指出易混点与前置知识，并严格基于文档上下文，不编造。
-   **等待与失败反馈**：读伴问答为同步 LLM 推理（实测约 10~30 秒），前端请求带 60 秒超时（`AbortSignal.timeout`）；等待期间弹窗内展示「读伴正在思考」提示；失败/超时不再静默——弹窗内展示可读错误（超时/网络/服务异常分类文案），保留已输入内容便于重试。

### 3.3 Tab 3：Tag关系图
通过Canvas力导向图展示系统中所有Tag及其关联关系，支持交互式探索。

#### 3.3.1 图谱渲染规则
-   **节点大小**：由Tag激活次数决定，采用对数缩放算法：$Radius = R_{min} + (R_{max} - R_{min}) \times \frac{\log(count)}{\log(max\_count)}$，确保大小和谐，最大最小半径比不超过5:1。
-   **边线**：连线粗细/透明度映射关联权重；鼠标悬停边线时显示Tooltip，内容为“关联权重: X.XX”。
-   **性能保障**：
    -   节点数＞300时启用LOD（多细节层次），隐藏低权重节点及文字标签。
    -   静态时停止物理模拟计算，FPS≥30。
    -   支持鼠标滚轮缩放、拖拽画布平移。

#### 3.3.2 交互行为
-   **Hover节点**：高亮该节点及其直接相连的边与邻居节点，其余元素降低透明度。
-   **点击节点**：
    -   图谱平滑居中动画（≤500ms）。
    -   右侧弹出抽屉，列出该Tag关联的 `work_id` 列表（非零散msg），点击可跳转至问答记忆Tab。
-   **双击节点**：锁定/解锁该节点位置，便于手动调整布局。

### 3.4 Tab 4：关键词图
通过Canvas圆形打包图（Circle Packing）展示关键词频次分布，支持钻取查看关联信息。

#### 3.4.1 图谱渲染规则
-   **布局算法**：采用Circle Packing算法，圆形之间无严重重叠，整体呈紧凑圆形分布。
-   **圆形大小**：由关键词激活次数决定，同样采用对数缩放。
-   **颜色编码**：可按关键词类型（实体词/动作词/主题词）或聚类结果分配色系，增强语义区分度。
-   **自适应**：窗口Resize时图谱自动重排，保持居中与完整可见。

#### 3.4.2 交互行为
-   **Hover**：显示关键词全称及激活次数Tooltip。
-   **点击**：
    -   高亮选中关键词。
    -   右侧弹出抽屉，展示关联信息列表；每条信息以完整的 `interact_id` 卡片形式呈现，避免断章取义。
    -   点击卡片可跳转至问答记忆Tab对应位置。

## 4. 跨模块联动机制
| 源模块 | 触发操作 | 目标模块 | 联动行为 |
| :--- | :--- | :--- | :--- |
| Tag关系图 | 点击Tag | 问答记忆 | 自动筛选并展示关联Work列表 |
| 关键词图 | 点击关键词 | 问答记忆 | 定位并高亮匹配的Interact卡片 |
| 资料库 | 点击MD中的work_id链接 | 问答记忆 | 跳转至指定Work并展开 |
| 问答记忆 | 点击消息中的Tag/关键词 | Tag图/关键词图 | 切换Tab并高亮对应节点 |

## 5. 非功能性需求
-   **性能**：问答列表虚拟滚动，万级消息渲染流畅；Canvas图谱300节点+1000边下拖拽FPS≥30。
-   **安全**：本地路径前端脱敏展示；Markdown渲染严格过滤XSS；资料库删除仅移除引用。
-   **容错**：所有API请求失败时展示友好错误提示及重试按钮；Canvas渲染异常时降级为列表视图。
-   **无障碍**：Tab页签支持键盘导航；图谱支持键盘焦点遍历；颜色对比度符合WCAG AA标准。

## 6. 验收标准
1.  问答记忆Tab：时间轴拖动定位≤300ms；三级嵌套渲染正确；搜索结果自动展开上下文；URL深链接可直达指定消息。
2.  资料库Tab：路径校验反馈实时准确；删除操作有二次确认且不删本地文件；MD渲染支持GFM/公式/图表且无XSS风险。
3.  Tag关系图：节点大小对数缩放合理；悬停边显示权重；点击节点居中≤500ms并弹出关联Work列表；300节点下FPS≥30。
4.  关键词图：圆形无严重重叠；点击关键词弹出关联Interact卡片；窗口Resize自适应重排。
5.  跨模块联动：所有跳转、高亮、筛选操作准确无误，状态同步延迟≤200ms。

---

## 7. 历史会话 Tab（前端实现，对应 `/info` 的「历史」页签）

信息页面实际包含「历史 / 记忆 / 资料库 / Tag图 / 关键词图 / 画像 / 消息图」七个页签。其中「历史」页签管理会话列表，行为如下：

### 7.1 展示

- 数据来源：`GET /api/chat/list?userId=...&keyword=...&start_time=...&end_time=...`（后端 `ChatService.searchSession`），按 `lastTime`（最后一条消息时间戳）倒序渲染。
- 每条会话以**卡片**形式展示：会话名称（`sessionTitle`）、会话日期（`lastTime`）、输入/输出 Token 消耗（`inputTokens` / `outputTokens`）、问答次数（`qaCount`）、问题/回答字符数（`questionChars` / `answerChars`）、「查看标签」按钮（点击弹窗展示该会话全部标签）。卡片内不再直接展示标签。
- 后端返回字段为 camelCase（`sessionId / sessionTitle / lastTime / messageCount / qaCount / questionChars / answerChars / inputTokens / outputTokens / tags`），由 `/api/chat/list` 路由统一转换（后端 `searchSession` 内部仍为 snake_case）。
- 「历史」页签以**会话（session）**为单位展示，会话内容来自 `info_raw` 表中的消息记录（`info_type` 含 REQUEST / RESPONSE / THINK / SKILL / MCP / ACT / REFLECT，其中用户问答即 REQUEST + RESPONSE）；「记忆」页签则以**单条 info** 为单位展示。
- **布局**：与「记忆」页签一致 —— 左侧日期导航栏 + 右侧内容区（顶部 sticky 搜索工具栏 + 按日期分组的卡片网格）+ 左下角日期热力图。卡片按日期组织，同一天会话排列在同一网格内，不同日期卡片分布在不同分组；所有卡片等宽等高（固定高度）。
- **跳转**：点击卡片跳转至「对话」页并打开对应会话（URL 携带 `?session=<sessionId>`）。

### 7.1.1 会话名称（自动生成 + 手动修改）

- **自动生成**：用户在某会话发送第一条消息时，若该会话名称为默认占位名（空或「新会话」），后端自动将第一条消息截断前 50 个字符作为会话名称。
- **锁名规则**：会话已存在特定名称（自动生成或用户手动设置）时，后续消息不会自动覆盖或重新生成名称。
- **手动修改**：会话名称的手动修改入口位于「对话」页的会话管理侧边栏（编辑按钮 Edit3 图标），点击进入内联编辑输入框，回车或点击确认（Check）调用 `PUT /api/chat/session/:sessionId/title` 保存；提供取消（X）退出编辑。历史 Tab 卡片已移除编辑入口。
- **展示优先级**：名称优先显示 `sessionTitle`，为空时回退显示「新会话」。

### 7.1.2 标签查看

- 历史 Tab 每条会话卡片提供「查看标签」按钮（Tag 图标 + 文案），点击弹出弹窗（标题「会话标签」+ 会话名称 + 标签 chips）展示该会话的全部标签（`tags`）。
- 标签为空时弹窗展示「无标签」。
- 卡片内不再直接展示标签（原 `#tag` chips 内联展示已移除）。

### 7.2 搜索

- **后端全文搜索**：输入防抖 300ms 后携带 `keyword` 重新请求 `GET /api/chat/list`。
- 命中规则：`session_title` 或该会话任意 `info_raw.info`（消息内容）包含关键字即命中；无命中返回空列表。
- 后端 `searchSession` 通过 `UNION` 合并标题命中与会话内容命中的 `session_id`，再以 `IN` 条件过滤。
- **按时间搜索**：支持「开始时间 / 结束时间」两个 `datetime-local` 输入，前端转为毫秒时间戳后经 `start_time` / `end_time` 参数回传。
- 时间命中规则：按**消息时间**（`info_raw.created`）过滤，命中在该时间段内存在消息（REQUEST / RESPONSE 等）的会话；关键字与时间范围为 **AND**（交集）关系，任一条件无命中即返回空列表。

### 7.3 删除

- **二次确认**：单个删除与批量删除均弹出确认弹窗，提示将同步清理关联数据且不可恢复。
- **级联删除**（后端 `ChatService.deleteSession`）：删除 `chat_session`、`info_raw`，并按会话下 `info_id` 级联清理 `info_tag`、`info_summary`、`info_keyword`、`info_vector`，同时删除 GraphDB 中该会话的 info 节点与引用边。
- **不删除** `info_tag_vector`（全局标签向量，跨会话共享，由 `orphan_tag_check` 定时任务负责清理孤立标签）。
- **批量删除健壮性**：单条/批量删除均先二次确认；批量删除一次调用 `DELETE /api/chat/session`（请求体 `session_ids[]`），由后端统一级联清理，失败时保留列表与选中项便于重试。
- **孤儿会话记忆清理**（后端 `ChatService.purgeOrphanSessions`）：服务启动时与每日午夜清理 `info_raw` 中 `session_id` 已不存在于 `chat_session` 的残留记忆（含派生表与 GraphDB 引用边），避免历史版本权限审计/反馈以非会话键落库产生的孤儿行在「记忆」页签持续展示已删除会话的对话内容。

---

## 8. 变更记录

### [2026-08-23] 历史会话 Tab：移除卡片编辑按钮、改为「查看标签」弹窗

**变更原因**：历史 Tab 会话卡片的信息框内不需要编辑按钮（会话重命名入口统一收敛到「对话」页侧边栏）；标签此前直接以 chips 内联展示在卡片内，改为通过「查看标签」按钮点击弹窗集中展示，避免卡片内容拥挤。

**修改的方法**：
- 前端 `InfoView.vue` — 历史 Tab 会话卡片移除会话标题的内联编辑按钮（Edit3 图标）及 `editingSessionId` / `editingTitle` / `startEditTitle` / `saveSessionTitle` 相关逻辑（原逻辑注释保留参考）；标题改为纯文本展示。
- 前端 `InfoView.vue` — 卡片移除标签内联展示（原 `#tag` chips 区域），改为「查看标签」按钮（Tag 图标），点击打开弹窗展示该会话全部标签（`tags`），无标签时显示「无标签」。
- 前端 `InfoView.vue` — 引入 `Tag` 图标，移除不再使用的 `Edit3` / `Check` 图标导入。

**影响的端点**：
- 无（纯前端改动，后端 `/api/chat/list` 返回的 `tags` 字段不变）。

**可能存在的问题**：
- 「查看标签」弹窗直接使用 `/api/chat/list` 已返回的 `tags` 字段，不额外请求；若后续标签数量增多需分页，可改为单独接口。

### [2026-08-23] 历史会话 Tab：卡片化展示、统计聚合与布局对齐记忆页

**变更原因**：历史 Tab 原为列表式展示且仅含名称/时间/消息预览，缺少会话级统计（Token 消耗、问答次数、字符数、标签）；布局与「记忆」页签不一致（缺日期导航、日期热力图、常驻删除按钮）；点击会话无法正确跳转打开对应会话。

**修改的方法**：
- `ChatService.searchSession` — 新增批量聚合（避免逐会话 N+1）：从 `info_raw` 聚合问答次数（REQUEST 计数）与问题/回答字符数（`info_length`），从 `info_tag` 聚合会话标签，经 `orchestration_work` → `orchestration_agent_execution` → `agent_execution_trace` 关联链解析 `iterations_json` 得到输入/输出 Token。原 Token 统计误用 `info_raw.trace_id`（work 级）直连 `agent_execution_trace.trace_id`（agent 级），已修正为上述三表关联。
- `SearchSessionOutput`（`Chat/domain/types.ts`）— sessions 项新增 `qa_count / question_chars / answer_chars / input_tokens / output_tokens / tags` 字段。
- `dev-server.ts` `GET /api/chat/list` — 透传新增统计字段（`qaCount / questionChars / answerChars / inputTokens / outputTokens / tags`）。
- 前端 `api/types.ts` — `ChatSession` 新增上述可选字段。
- 前端 `InfoView.vue` — 历史 Tab 由列表改为卡片：移除 `lastMessage` 展示，卡片按日期分组（左侧日期导航 + 右侧 sticky 搜索工具栏 + 分组卡片网格 + 左下角日期热力图），删除按钮常驻（未选中时禁用）；卡片等宽等高（固定高度），列数由 3 列增至 4 列以收窄卡片宽度。
- 前端 `ChatView.vue` — `onMounted` 优先读取 `route.query.session` 加载对应会话，支持从历史卡片跳转打开指定会话。

**影响的端点**：
- `GET /api/chat/list` — 返回新增统计字段。
- `/?session=<sessionId>` — 对话页支持按 URL 参数打开指定会话。

**可能存在的问题**：
- Token 统计依赖 `agent_execution_trace.iterations_json` 中 think/reflect/answer 的 `input_tokens / output_tokens`；老数据（无 trace 记录）Token 显示为 0。Intent Agent 的 Token（存于 `orchestration_work.metadata`）未纳入统计。
- 会话列表受 `searchSession` 默认 `page_size=20` 限制，历史页当前最多展示 20 个会话，日期热力图仅覆盖已加载会话。

### [2026-08-19] 历史会话 Tab：会话名称自动生成（50 字截断）与手动修改

**变更原因**：使每个会话能以第一条消息前 50 个字符作为初始名称，支持用户手动修改会话名称，且已有名称时系统不再自动覆盖生成。

**修改的方法**：
- `ChatService.submitWork` / `ChatService.openChatStream` — 用户提交首条消息后触发 `autoGenerateSessionTitleIfEmpty`：仅当 `session_title` 为空或「新会话」时，取 `msgContent.trim().slice(0, 50)` 更新；已有名称不覆盖。
- `dev-server.ts` — `GET /api/chat/list` 透传 `sessionTitle`（及 `session_title`）字段；新增 `PUT/POST /api/chat/session/:sessionId/title` 路由，调用 `chatAccess.updateSessionTitle`。
- 前端 `InfoView.vue` — 历史 Tab 会话卡片展示会话名称（`sessionTitle` 优先，回退 `lastMessage`/「新会话」），新增内联编辑（Edit3 图标）与保存（Check）/取消（X）。
- 前端 `ChatView.vue` — 会话管理侧边栏支持同一套名称展示与内联重命名。
- 前端 `api/types.ts` — `ChatSession` 增加 `sessionTitle?` 字段；`api/index.ts` 增加 `chatApi.updateTitle`。

**影响的端点**：
- `GET /api/chat/list` — 返回新增 `sessionTitle` 字段。
- `POST /api/chat/send` / `POST /api/chat/stream` — 首条消息时自动设置会话名称。
- `PUT /api/chat/session/:sessionId/title` — 新增修改会话名称接口。

**可能存在的问题**：
- 自动命名以用户消息原文截断，不含 AI 提炼摘要，长句截断处可能不完整。

### [2026-08-17] 历史会话 Tab：搜索与删除增强

**变更原因**：历史 Tab 原为前端本地过滤（仅匹配最后一条消息）且删除未清理派生表，存在功能局限与孤儿数据问题。

**修改的方法**：
- `ChatService.searchSession` — 由「仅 `session_title` 模糊匹配」改为「标题 + 消息内容全文搜索」，命中会话以 `IN` 条件过滤。
- `ChatService.deleteSession` — 由「仅删 `chat_session`/`info_raw`/`info_graph`」改为「级联清理 `info_tag`/`info_summary`/`info_keyword`/`info_vector`」。
- 前端 `InfoView.vue` — 搜索改为后端搜索 + 300ms 防抖；删除增加二次确认弹窗；批量删除改用 `Promise.allSettled`。
- 前端 `api/index.ts` — `chatApi.list` 增加 `keyword` 参数。

**影响的端点**：
- `GET /api/chat/list` — 支持 `keyword` 全文搜索，返回 camelCase 字段。
- `DELETE /api/chat/session/:id` — 删除会话时级联清理派生表。

**可能存在的问题**：
- `info_keyword` 为 FTS5 虚拟表，级联删除依赖其普通列条件删除能力（已用 better-sqlite3 验证可行）。
- 全文搜索在会话数量极大时 `IN` 条件可能超长，但单机场景会话量有限。

### [2026-08-17] 历史会话 Tab：按时间搜索

**变更原因**：历史 Tab 仅支持关键字搜索，缺少按时间范围回溯对话的能力。

**修改的方法**：
- `ChatService.searchSession` — 时间过滤由「会话创建时间 `chat_session.created`」改为「消息时间 `info_raw.created`」，命中该时间段内存在消息的会话。
- `dev-server.ts` `/api/chat/list` — 增加 `start_time` / `end_time` 查询参数解析。
- 前端 `InfoView.vue` — 增加「开始时间 / 结束时间」`datetime-local` 输入，随关键字一起防抖 300ms 触发搜索。
- 前端 `api/index.ts` — `chatApi.list` 增加 `startTime` / `endTime` 参数。

**影响的端点**：
- `GET /api/chat/list` — 新增 `start_time` / `end_time` 查询参数，与 `keyword` 为 AND 关系。

**可能存在的问题**：
- `datetime-local` 按浏览器本地时区解析，前后端同机部署时区一致，跨时区部署需注意换算。

### [2026-08-17] 记忆 Tab：按时间 / 按标签搜索

**变更原因**：记忆 Tab 原为前端本地过滤，且不支持按时间与按标签搜索。

**修改的方法**：
- `dev-server.ts` `/api/memory/search` — 新增 `tag`（精确标签）、`start_time` / `end_time`（消息时间）过滤条件，`limit` 上限由 200 提升至 500。
- 前端 `api/index.ts` — `memoryApi.search` 改为对象参数（`keyword` / `type` / `tag` / `startTime` / `endTime` / `limit`）。
- 前端 `InfoView.vue` — 记忆 Tab 增加「按标签」「开始时间 / 结束时间」输入，搜索改为后端搜索 + 300ms 防抖。

**影响的端点**：
- `GET /api/memory/search` — 新增 `tag` / `start_time` / `end_time` 查询参数，与 `keyword` / `type` 为 AND 关系。

**可能存在的问题**：
- 标签为精确匹配（`=`），如需模糊匹配可扩展为 `LIKE`。

### [2026-08-17] 记忆 Tab：滚动加载（游标分页）+ 日期导航优化

**变更原因**：记忆 Tab 原为一次性加载最多 500 条，超量记忆无法查看；日期导航列在日期过多时被视口截断，丢失导航入口。

**修改的方法**：
- `dev-server.ts` `/api/memory/list`、`/api/memory/search` — 改为**游标分页**：`cursor`（格式 `created:id`，`id` 为 `info_raw.id` 作 tiebreaker）+ `limit`；排序 `ORDER BY created DESC, id DESC`；返回 `{ memories, has_more, next_cursor }`。
- 前端 `api/index.ts` — `memoryApi.list` / `memoryApi.search` 返回 `MemoryPage`（`memories / has_more / next_cursor`），支持 `cursor` 参数。
- 前端 `InfoView.vue` — 记忆列表改为 `IntersectionObserver` + sentinel 无限滚动，滚动到底部用 `next_cursor` 追加加载；日期导航容器加 `max-h + overflow-y-auto` 内部滚动，并随加载动态增长；scroll-spy 自动高亮当前日期。

**影响的端点**：
- `GET /api/memory/list`、`GET /api/memory/search` — 新增 `cursor` 查询参数，返回结构含 `has_more` / `next_cursor`。

**可能存在的问题**：
- 游标以 `created` 时间戳为序，同一毫秒内多条记录靠 `id`（uuid 字典序）区分，逻辑自洽但需保证 `ORDER BY` 与游标比较规则一致（均为 `created DESC, id DESC`）。
- 追加加载期间若新增消息，可能出现边界重复/遗漏（时间序分页的固有问题），单机单用户场景影响可忽略。

### [2026-08-17] 资料库入口统一

**变更原因**：「资料库」Tab（信息页）与「配置中心 > 应用配置 > 文档目录」功能重复，均为同一后端 `/library/*`（SelfLearning 资料库管理）的前端入口。

**修改的方法**：
- 前端 `ConfigView.vue` — 移除「应用配置 > 文档目录」菜单项、其管理逻辑与实体管理视图模板，仅保留「资料库」Tab 作为唯一入口。

**影响的端点**：
- 无（后端 `/library/*` 接口保留，资料库 Tab 继续使用）。

**可能存在的问题**：
- 无。资料库路径处理（`path.resolve` / `path.join` / `fs.*`）为 Node.js 跨平台 API，支持 Windows / Linux / macOS；HTTP 路由的 `split('/')` 为 URL 解析，与操作系统无关。

### [2026-08-17] 资料库 Tab：启用开关 + 文件树浏览 + 游标分页

**变更原因**：资料库 Tab 原先仅有添加/删除，卡片无启用状态，详情页为占位；不支持浏览目录文件、层级结构与文件内容。

**修改的方法**：
- 后端 `SelfLearningSchemaInitializer` — `self_learning_file` 表新增 `relative_path` / `parent_path` / `is_directory` 字段。
- 后端 `SelfLearningService`：
  - `addLibrary` 改为递归扫描，记录目录（`is_directory=1`）与所有文件（含层级 `relative_path` / `parent_path`），`id` / `file_id` 均由 `IdGenerator.generate()`（Base/ToolProvider，UUID v4）生成。
  - 新增 `setLibraryEnabled`：切换 `enable_self_learning`，启用时重新扫描目录刷新文件数据。
  - `getLibraryFiles` 支持 `directory`（目录过滤）、`keyword`（文件名搜索）、游标分页（`cursor=created:file_id` + `limit`）。
  - 新增 `getLibraryTree`：按 `parent_path` 构建目录树。
- 后端 `dev-server.ts` — 新增 `PUT /api/library/paths/:id/enabled`、`GET /api/library/paths/:id/files`、`GET /api/library/paths/:id/tree`、`GET /api/library/files/:fileId/content` 路由。
- 前端 `api/index.ts` / `types.ts` — `libraryApi` 新增 `setEnabled` / `files` / `tree` / `fileContent`。
- 前端 `InfoView.vue` + 新增 `components/LibraryTreeItem.vue` — 资料库卡片增加启用/禁用开关；详情页支持面包屑路径、目录树跳转、文件名搜索、文件列表无限滚动（IntersectionObserver + sentinel）、文件内容查看。

**影响的端点**：
- `GET/POST/DELETE /api/library/paths`（既有）+ 新增 `PUT .../enabled`、`GET .../files`、`GET .../tree`、`GET /api/library/files/:fileId/content`。

**可能存在的问题**：
- 递归扫描对超大型目录逐条 `insert`，性能一般，可后续优化为批量插入。
- `self_learning_library` 的 `total_files` 统计含目录记录，语义上应区分文件与目录计数。

### [2026-08-17] 资料库 Tab：文档弹窗 + 选中解释 + 文档阅读配置

**变更原因**：文档内容原先内嵌展示；不支持选中内容调用 LLM 解释，也缺少文档阅读所用的 Prompt/LLM 配置。

**修改的方法**：
- 后端 `SelfLearningSchemaInitializer` — `self_learning_config` 表新增 `document_query_prompt_template_id` / `document_query_llm_id` 字段。
- 后端 `SelfLearningService` — 新增 `queryDocument`：读取配置的 Prompt 模板（`promptsAccess.execPrompt`）与 LLM（配置或 `llmCore.matchLLM` 自动匹配），调用 `llmAccess.execLLM` 对选中内容解释；构造函数新增 `llmAccess` / `promptsAccess` 依赖。
- 后端 `Config` — `configRegistrations.ts` 新增「文档阅读 Prompt / 文档阅读 LLM」配置项；`ConfigService` 的 `self_learning` 读写映射补全这两个字段。
- 后端 `dev-server.ts` — `SelfLearningAccess` 装配传入 `llmAccess` / `promptsAccess`；新增 `POST /api/library/query` 路由。
- 前端 `InfoView.vue` — 文件内容改为弹窗展示（内容两侧 `px-8` 留白）；文档内容支持选中，右键弹出「解释选中内容」菜单，调用 `POST /api/library/query` 并在弹窗内展示解释结果。

**影响的端点**：
- 新增 `POST /api/library/query`（body: `{ content }` → `{ result, llm_id }`）。

**可能存在的问题**：
- `queryDocument` 的 LLM 自动匹配依赖 `llm_core` 匹配规则，未配置模型时返回提示而非报错。

### [2026-08-17] 资料库 Tab：文档页面展示区 + 咨询卡片持久化

**变更原因**：文档内容由弹窗改为页面展示区；咨询卡片与选中内容的关联关系需要持久化，重新打开文件时能恢复。

**修改的方法**：
- 后端 `SelfLearningSchemaInitializer` — 新增 `document_annotation` 表（`file_id` / `selection_text` / `selection_start` / `selection_end` / `question` / `result` / `llm_id`），保存咨询卡片与原始内容的关联。
- 后端 `SelfLearningService` — 新增 `saveAnnotation`（保存咨询卡片）、`getFileAnnotations`（按 `file_id` 查询）。
- 后端 `dev-server.ts` — 新增 `POST /api/library/annotations`、`GET /api/library/files/:fileId/annotations`。
- 前端 `InfoView.vue` — 文档展示区改为三栏（左章节 / 内容 markdown / 右咨询卡片）；`submitAsk` 咨询后调用 `saveAnnotation` 持久化；`openFile` 加载该文件历史注释并恢复卡片与下划线；连线改为横平竖直正交线，连接卡片左边缘中间点；点击卡片高亮其连线。

**影响的端点**：
- 新增 `POST /api/library/annotations`、`GET /api/library/files/:fileId/annotations`。

**可能存在的问题**：
- 恢复下划线依赖 `selection_text` 在渲染后 DOM 的文本节点中匹配，跨节点选中无法恢复下划线（卡片仍正常恢复）。

### [2026-08-23] 记忆 Tab：搜索栏固定 + 勾选批量删除 + 类型中文映射 + 真实置信度

**变更原因**：记忆 Tab 的搜索栏随内容滚动易丢失操作入口；缺少单条/批量删除能力；记忆类型标签显示英文（working/semantic 等）不易理解；「置信度」此前为后端硬编码的占位值（恒 100%）。

**修改的方法**：
- 前端 `InfoView.vue` — 记忆 Tab 搜索栏（关键词 / 标签 / 日期范围）改为 `sticky top-[160px]` 固定，不随内容滚动，并同步调整时间分组锚点 `scroll-mt` 与 scroll-spy `topOffset`；消息框新增复选框、右上角单条删除按钮与「删除所选(N)」批量删除按钮，删除前二次确认，删除后从列表移除并清空勾选。
- 前端 `InfoView.vue` — 新增 `typeLabels` 中文映射（`semantic` 语义记忆 / `episodic` 情景记忆 / `procedural` 程序性记忆 / `working` 工作记忆），消息框类型标签按中文展示。
- 后端 `dev-server.ts` — 新增 `DELETE /api/memory` 路由，按 `info_ids` 批量删除并级联清理派生表；`mapInfoToMemory` 恢复 `confidence` 字段，新增 `computeMemoryConfidence` 按「来源可信度 + 语义加工增益」计算真实置信度（见 INFOCore-PRD）。
- 前端 `api/index.ts` / `types.ts` — `memoryApi.delete(infoIds)` 新增；`MemoryItem.confidence` 类型恢复。

**影响的端点**：
- 新增 `DELETE /api/memory`（body: `{ info_ids: string[] }` → `{ deleted_count }`）。
- `GET /api/memory/list`、`GET /api/memory/search`、`GET /api/memory/tag/:userId/:tag` — 返回的 `MemoryItem` 恢复 `confidence` 字段（0.05~0.95 真实值）。

**可能存在的问题**：
- 批量删除为逐表 `DELETE ... IN` 级联，未清理全局标签向量 `info_tag_vector`（由 `orphan_tag_check` 定时任务处理）；删除后左侧日期导航与热力图需下次加载才会刷新。
### [2026-08-25] Tag关系图 / 关键词图：节点限流 + 一键清理 + 搜索定位居中

**变更原因**：关键词图节点过多（数百节点、数千边）导致力导向图重叠不可观测；两图缺少一键清理与按节点搜索定位能力。

**修改的方法**：
- 前端 `InfoView.vue` — Tag关系图 / 关键词图 Tab 顶部新增工具栏：搜索框 +「定位」按钮（按节点名匹配，命中后平移缩放到展示区中心并选中、加载关联记忆）、「重置视图」按钮、红色「一键清理」按钮（二次操作后清空图并重置视图），并显示当前节点数；
- 前端 `api/index.ts` — `tagGraph(limit)` / `keywordGraph(limit)` 支持节点限流参数；新增 `clearTagGraph()` / `clearKeywordGraph()`；
- 后端 `dev-server.ts` — `GET /api/memory/tag-graph` / `GET /api/memory/keyword-graph` 支持 `limit`（默认 100，按频次降序取前 N 节点及这些节点间的边）；新增 `DELETE /api/memory/tag-graph` / `DELETE /api/memory/keyword-graph` 一键清理；
- 后端 `InfoCoreService.clearGraph`（新增）— 按 node_type 删除该类型全部节点（级联删边）。

**影响的端点**：
- `GET /api/memory/tag-graph?limit=`、`GET /api/memory/keyword-graph?limit=`、`DELETE /api/memory/tag-graph`、`DELETE /api/memory/keyword-graph`。

**可能存在的问题**：
- 一键清理仅删 GraphDB 节点/边，不删 `info_tag` / `info_keyword` 表；重启后 `rebuildCooccurGraph` 会从表回填重建。

### [2026-08-26] 关键词图 / Tag关系图：力导向布局参数优化，修复节点聚集问题

**变更原因**：力导向布局中 `centerStrength = 0.02` 过强——边缘节点受到的向心力（如距离中心 350px 时受力 7）远超节点间排斥力（100px 距离时仅 0.9），导致所有节点被强行拉向中心，关键词图完全不可阅读。

**修改的方法**：
- 前端 `InfoView.vue` — `forceDirectedLayout()` 参数调整：
  - `repulsion`: 9000 → 20000（排斥力增强 2.2x，节点更分散）
  - `springLength`: 140 → 180（理想边长度增加，连接节点间距更大）
  - `centerStrength`: 0.02 → 0.002（向心力降为 1/10，节点不再过度聚集中心）
  - `damping`: 0.85 → 0.9（速度衰减减缓，节点有更多时间扩散至平衡位置）

**影响的端点**：
- 无后端变更，仅前端渲染参数调整，对 Tag关系图 和 关键词图 均生效。

**可能存在的问题**：
- 参数调整后若节点数极多（>200），仍可能出现局部重叠，需配合 `limit` 参数控制节点数量。

### [2026-09-21] 记忆页：删除会话后对话内容残留治理（孤儿会话记忆清理）

**变更原因**：在「对话」页删除会话后，「信息 > 记忆」页仍展示该会话的对话内容（实测残留 23 条来自 2026-08-10 ~ 08-14 已删除会话的 `info_raw` 记录）。根因：历史版本权限审计桥把 `info_raw.session_id` 写成 Runtime 内部 session id（而非对话会话键），以及在会话级联删除逻辑收敛（2026-09-15）之前删除的会话，均会在 `info_raw` 留下 `session_id` 无法匹配任何 `chat_session` 的孤儿行；这类行不会被按指定 `session_id` 的 `deleteSession` 命中，因而长期残留并被「记忆」页签读取展示。

**修改的方法**：
- 后端 `ChatService.purgeOrphanSessions`（新增）— 以 `chat_session.session_id` 为存活集合，取 `info_raw` 中 `session_id` 的差集为孤儿，复用 `deleteSession` 的级联清理（`info_*` / GraphDB / `runtime_*` / `stream_event` / `writer_agent_user_profile`）；支持 `dry_run` 仅统计不删除。
- 后端 `Chat-PRD` 领域类型（`PurgeOrphanSessionsInput` / `PurgeOrphanSessionsOutput`，新增）与 `ChatAccess.purgeOrphanSessions`（新增）。
- 后端 `dev-server.ts` — 服务启动时执行一次孤儿会话记忆清理，并注册每日午夜复查（与 Info 老化清理同一模式）。

**影响的端点**：
- 无新增前端端点；维护任务在服务启动与每日午夜触发，不对外暴露 HTTP 接口。

**可能存在的问题**：
- 判定口径为「`session_id` 不在 `chat_session` 即孤儿」，若未来出现非对话会话（不落 `chat_session`）的记忆写入方，需同步纳入存活集合；
- 会话删除与进行中的 run 并发时，run 迟到的记忆写入可能在下次清理前短暂残留，需后续评估「删除时中止进行中 run」；
- 存量已清空内容（老化）但索引仍在的 `info_raw` 行若其会话已删除，会随本次清理一并删除（符合彻底删除语义）。

### [2026-09-21] 「涌现」（Tag 关系图）：不采集系统报错信息派生的节点

**变更原因**：「涌现」图中出现由系统报错信息派生的节点（如「工具缺失」「工具不可用」等）。Tag 图节点由 `info_tag` 聚合而来，而 `info_tag` 的错误信息隔离此前仅作用于 `tagInfo` 的实时抽取；存量错误标签与已删除信息遗留的孤儿标签仍保留在 `info_tag`，服务启动 `rebuildCooccurGraph` 重建时未回溯 `handle_result_type`，导致错误信息仍在图中体现。

**修改的方法**：
- 后端 `InfoCoreService.rebuildCooccurGraph` — 重建前调用 `purgeNonCorrectTagRows` 清理存量错误/孤儿标签行（原始实现注释保留）；
- 后端 `InfoCoreService.purgeNonCorrectTagRows`（新增）— 删除 `info_id` 无对应 `info_raw` 或对应信息 `handle_result_type != correct` 的 `info_tag` 行；
- 后端 `InfoCoreService.rebuildCooccurForSource` — 改为 `INNER JOIN info_raw ... WHERE handle_result_type = 'correct'`（原始全量 `relationDb.select` 注释保留）；
- 后端 `RebuildCooccurGraphOutput` — 新增 `purged_rows`。

**影响的端点**：
- `GET /api/memory/tag-graph` — 仅返回正确信息派生的标签节点，系统报错信息不再入图；
- 服务启动时自动执行一次清理 + 重建（`[startup] rebuild cooccur edges`）。

**可能存在的问题**：
- 过滤口径为 `handle_result_type != correct` 或 `info_raw` 无对应行；若未来出现以 `correct` 落库但非用户信息的系统消息，需扩展判定；
- 存量图重建为全量先删后建，超大标签量时启动阶段有短时耗时。

### [2026-09-21] 资料库文档阅读器：展示重构 + 文档编辑/删除 + 读伴专用 Agent/Prompt/Soul

**变更原因**：资料库文档阅读区原为「章节 | 正文 | 咨询卡片 + SVG 虚线连线」的三栏布局，咨询卡片拥挤、连线穿过正文、选中高亮无样式（`.doc-annotation-mark` 此前无 CSS），且文档仅可只读浏览，无法编辑/删除，内容变更后咨询标注无法优雅降级。

**修改的方法**：
- 前端 `components/info/LibraryTab.vue` — 阅读区重构为「目录 / 正文阅读栏 / 读伴提问栏」三栏阅读器：正文限宽居中、行高放宽、内部滚动；目录支持点击定位；提问卡片带编号、原文引用、Markdown 回答；移除穿过正文的 SVG 虚线连线，改为编号下划线 + 点击卡片滚动定位高亮；新增「编辑 / 删除」入口、编辑模式（Markdown 源码 textarea + 保存/取消）、删除二次确认弹窗；提问弹窗文案改为「询问读伴」。
- 前端 `composables/useLibraryTab.ts` — 新增编辑/删除状态与动作（`openEditor` / `saveEditor` / `requestDeleteFile` / `confirmDeleteFile` 等）；`openFile` 改为批量加载注释并统一 `refreshAnnotationMarks` 标注；`restoreMark` 返回是否匹配成功并写入 `data-anno-index`；新增 `refreshAnnotationMarks`（内容变更后重匹配，失败标记 `stale`）与 `setActiveAnnotation`；移除 `annotationLines` / `recomputeLines`（原逻辑注释保留在 PRD 变更说明中）；文档读取失败时展示友好降级文案；`queryDocument` 透传 `document_title`。
- 前端 `styles/globals.css` — 新增 `.doc-reading`（阅读排版）与 `.doc-annotation-mark` / `.is-active`（编号下划线标注，含暗色）。
- 前端 `api/index.ts` / `api/types.ts` — 新增 `libraryApi.updateFileContent` / `deleteFile`；`queryDocument` 增加 `document_title`；新增 `DocumentAnnotation` 类型。
- 后端 `SelfLearningService` — 新增 `updateFileContent`（写回本地文件、重置学习状态为 `PENDING`）、`deleteFile`（删除本地文件、级联清理 `document_annotation` 与 `self_learning_file`）、`soFileRecord`；`queryDocument` 改为经「文档伴读」声明式 Agent（读定义取模型/温度）+ 专用身份模板（`builtin.document_reading_identity` 内存渲染）与专用 Soul 组装 system，配置项仍优先；新增 `ensureBuiltinDocumentAgent` / `ensureDocumentReadingSoul` / `soDocumentReadingAgent` / `buildDocumentReadingSystem` / `soDocumentReadingSoulContent` / `matchDocumentQueryLlm` / `execDocumentQueryLlm`（原始实现注释保留），`renderPrompt` 支持内置模板优先渲染。
- 后端 `SelfLearning/domain/types.ts` — 新增 `UpdateFileContentInput/Output`、`DeleteFileInput/Output`、`QueryDocumentInput.document_title`；新增文档伴读 Agent/Soul 常量。
- 后端 `SelfLearning/access/SelfLearningAccess.ts` — 构造函数接收 `soulAccess` / `agentDefAccess`（可选）；新增 `updateFileContent` / `deleteFile` / `ensureBuiltinDocumentAgent` 包装。
- 后端 `Base/PromptCatalog/catalog.ts` — 增强 `builtin.document_query`（含文档标题、伴读式回答要求）；新增 `builtin.document_reading_identity`（文档伴读身份段）。
- 后端 `dev-server.ts` — 装配 `soulAccess` / `runtimeAgentDefAccess` 到 SelfLearningAccess，启动时幂等装配文档伴读 Agent/Soul；新增 `PUT /api/library/files/:fileId/content` 与 `DELETE /api/library/files/:fileId` 路由；`POST /api/library/query` 透传 `document_title`。

**影响的端点**：
- 新增 `PUT /api/library/files/:fileId/content`（body `{ content }` → `{ fileName, content, size }`）。
- 新增 `DELETE /api/library/files/:fileId`（→ `{ success, deletedAnnotations }`）。
- `POST /api/library/query` — 新增可选 `document_title`；后端改为经专用 Agent 组装 system 与模型。

**可能存在的问题**：
- 删除文档会删除本地磁盘文件（不可恢复），依赖前端二次确认；目录类记录不允许删除/编辑。
- 编辑/外部修改后，标注按 `selection_text` 匹配，跨文本节点或重复文本可能匹配到首次出现位置；无法匹配者标记「原文已变更」。
- 删除文档仅级联清理索引与咨询注释，不回收该文档此前学习产生的知识条目（`info_raw`）。
- 内置 Soul / Agent 为代码内置种子（沿用 Summary/Intent Agent 既有约定），与 DevStandards「禁止硬编码种子」存在口径差异。
