# 产品需求文档：自学习管理页面

| 文档版本 | 修改日期 | 修改人 | 修改描述 |
| :--- | :--- | :--- | :--- |
| v1.0 | 2026-08-01 | PM | 初始版本，完成核心功能定义 |

## 1. 文档概述

### 1.1 背景与目标
系统具备自学习能力，能够从对话、文档中提取知识并维护Tag图谱。当前缺乏统一的管理入口，用户无法感知学习状态、干预学习过程或查看学习产出。本页面旨在提供一站式的自学习管理中心，实现学习过程的可控、可观测、可验证与可量化。

### 1.2 目标用户
-   系统管理员 / 知识运营人员
-   高级用户

### 1.3 术语定义
| 术语 | 定义 |
| :--- | :--- |
| 随机因子 | 控制自学习系统在空闲时自动触发学习的概率权重（0-100） |
| Tag图 | 信息标签之间的语义相似性连接网络 |
| 洞察 | 系统通过学习发现的规律、趋势或异常等高阶知识 |
| 内置任务 | 系统预设的、不可删除的周期性自学习任务 |

## 2. 页面整体架构

### 2.1 布局结构
页面采用垂直流式布局，从上到下依次为：
1.  **学习控制区**
2.  **学习统计区**
3.  **学习进度区**
4.  **学习成果区**

### 2.2 全局交互规范
-   **加载态**：所有异步数据请求均需展示Skeleton骨架屏或Loading指示器。
-   **错误态**：接口失败时展示统一错误提示组件，支持“重试”操作。
-   **空态**：各列表区域在无数据时展示插画+引导文案。
-   **响应式**：最小适配宽度1024px；<1024px时控制区换行、统计卡片2×2排列。

## 3. 功能详细设计

### 3.1 学习控制区

#### 3.1.1 开始/暂停学习按钮
| 项目 | 说明 |
| :--- | :--- |
| 样式 | 开始：绿色填充按钮；暂停：橙色填充按钮；带图标 |
| 状态同步 | 页面初始化时调用 `getLearningProgress` 获取真实状态；每30s心跳校验 |
| 交互 | 点击后立即切换为Loading态，接口返回成功后切换按钮样式；失败则回滚状态并Toast提示 |
| 接口 | `LearningApp.startLearning()` / `LearningApp.stopLearning()` |

#### 3.1.2 随机因子配置
| 项目 | 说明 |
| :--- | :--- |
| 控件 | Slider滑块 + 右侧数字输入框（双向联动） |
| 范围 | 0-100，步长1 |
| 提交策略 | 防抖500ms后调用接口，避免拖动时频繁请求 |
| 说明文案 | “数值越大，系统空闲时自动触发学习的频率越高” |
| 接口 | `LearningApp.configDriverWeights({ randomFactor: number })` |

#### 3.1.3 学习模式选择
| 项目 | 说明 |
| :--- | :--- |
| 控件 | Select下拉框 |
| 选项 | 从对话学习 / 从文档学习 / Tag图维护 |
| 冲突处理 | 切换模式时若存在RUNNING任务，弹出二次确认弹窗：“当前有任务执行中，切换将中断当前任务，是否继续？” |
| 接口 | `LearningApp.switchMode({ mode: enum })` |

### 3.2 学习统计区

| 指标卡片 | 数据来源 | 刷新策略 |
| :--- | :--- | :--- |
| 总学习次数 | `LearningApp.getStats().totalLearnCount` | 进入页面加载 + 每60s轮询 |
| 知识点总数 | `LearningApp.getStats().knowledgeCount` | 同上 |
| 洞察总数 | `LearningApp.getStats().insightCount` | 同上 |
| 本周学习次数 | `LearningApp.getStats().weeklyLearnCount` | 同上 |

-   **卡片样式**：左侧指标名称+图标，右侧大号数字。
-   **接口**：`LearningApp.getLearningStats()` 聚合接口。

### 3.3 学习进度区

#### 3.3.1 当前任务卡片
| 字段 | 说明 |
| :--- | :--- |
| 任务名称 | 如“从对话学习”、“Tag图相似性维护” |
| 任务状态 | RUNNING(蓝色脉冲) / FINISH(绿色✓) / FAILURE(红色✗) |
| 进度条 | 仅RUNNING态显示；百分比精确到整数；动画过渡 |
| 开始时间 | 格式：YYYY-MM-DD HH:mm:ss |
| 失败操作 | FAILURE态额外展示“重试”按钮 + “查看日志”链接 |

#### 3.3.2 学习任务队列
-   **数据源**：`LearningApp.soLearningTask({ status: 'PENDING' })`
-   **列表字段**：任务名称、任务摘要（截断2行）、计划执行时间、状态标签
-   **排序**：按计划执行时间升序
-   **空态**：“暂无待执行任务”

#### 3.3.3 内置学习任务
-   **标识**：每个任务卡片左上角展示“系统内置”Badge
-   **字段**：任务名称、任务摘要、Cron表达式（人类可读格式）、上次执行时间、下次执行时间
-   **操作**：仅展示“手动触发”按钮，无删除/编辑入口
-   **固定任务清单**：
    1.  信息标签图相似性维护
    2.  信息标签图相似性连接建立
    3.  信息标签图不常用连接老化
    4.  随机获取用户消息建立用户画像

### 3.4 学习成果区

#### 3.4.1 Tab切换
-   Tab1：**知识列表**（默认选中）
-   Tab2：**洞察列表**

#### 3.4.2 知识列表
| 字段 | 说明 |
| :--- | :--- |
| 知识内容 | 摘要文本，最多3行，超出展开/收起 |
| 来源 | Badge标签：对话 / 文档 |
| 学习时间 | YYYY-MM-DD HH:mm |
| 关联Tag | Tag胶囊组，最多展示3个，超出显示“+N” |

-   **筛选栏**：关键词搜索框 + 来源下拉筛选 + 时间范围选择器
-   **分页**：每页20条，滚动加载或传统分页器
-   **接口**：`LearningApp.searchKnowledge({ keyword, source, timeRange, page, pageSize })`

#### 3.4.3 洞察列表
| 字段 | 说明 |
| :--- | :--- |
| 洞察内容 | 摘要文本，最多3行 |
| 洞察类型 | Badge：模式识别 / 趋势分析 / 异常检测 / 关联发现 |
| 生成时间 | YYYY-MM-DD HH:mm |

-   **筛选栏**：类型下拉筛选 + 时间范围选择器
-   **分页**：同知识列表
-   **接口**：`LearningApp.searchInsights({ type, timeRange, page, pageSize })`

## 4. 接口清单汇总

| 接口名称 | 所属应用 | 方法 | 用途 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| startLearning | Learning App | POST | 启动学习 | |
| stopLearning | Learning App | POST | 暂停学习 | |
| configDriverWeights | Learning App | PUT | 更新随机因子 | 防抖调用 |
| switchMode | Learning App | PUT | 切换学习模式 | 新增 |
| getLearningProgress | Learning App | GET | 获取当前任务进度 | 30s轮询 |
| soLearningTask | Learning App | GET | 获取任务队列 | |
| getLearningStats | Learning App | GET | 获取统计数据 | 新增聚合接口 |
| searchKnowledge | Learning App | GET | 搜索知识列表 | 支持筛选分页 |
| searchInsights | Learning App | GET | 搜索洞察列表 | 支持筛选分页 |
| searchLibrary | SelfLearning App | GET | 获取资料库列表 | 文档模式依赖 |
| getKnowledgeDetail | Info App | GET | 获取知识详情 | 点击卡片时调用 |

## 5. 非功能性需求

| 类别 | 要求 |
| :--- | :--- |
| 性能 | 首屏渲染 < 1.5s；列表翻页响应 < 500ms；进度轮询不阻塞主线程 |
| 兼容性 | Chrome 90+、Edge 90+、Safari 15+；最低分辨率 1024×768 |
| 安全 | 所有写操作需权限校验；敏感日志脱敏；接口鉴权Token自动刷新 |
| 可访问性 | 按钮/滑块支持键盘操作；颜色不作为唯一状态标识（配合图标/文字） |
| 监控 | 关键操作（启停、模式切换、配置修改）上报埋点；接口异常率告警 |

## 6. 数据埋点设计

| 事件名 | 触发时机 | 参数 |
| :--- | :--- | :--- |
| learning_start_click | 点击开始学习按钮 | `{ mode, randomFactor }` |
| learning_stop_click | 点击暂停学习按钮 | `{ runningDuration }` |
| mode_switch | 切换学习模式成功 | `{ fromMode, toMode }` |
| random_factor_change | 随机因子变更成功 | `{ oldValue, newValue }` |
| knowledge_card_click | 点击知识卡片 | `{ knowledgeId, source }` |
| insight_card_click | 点击洞察卡片 | `{ insightId, type }` |
| task_retry_click | 点击失败任务重试 | `{ taskId, taskName }` |

## 7. 验收标准

-   [ ] 开始/暂停按钮状态与后端实时一致，延迟感知 < 1s
-   [ ] 随机因子拖动流畅，松手后500ms内完成接口调用
-   [ ] 切换学习模式时，RUNNING任务正确触发二次确认
-   [ ] 当前任务FAILURE态可重试，重试后状态正确刷新
-   [ ] 知识/洞察列表筛选、分页功能正常，空态展示正确
-   [ ] 统计卡片数据准确，60s自动刷新
-   [ ] 内置任务列表完整展示4项，无删除入口
-   [ ] 页面在1024px宽度下布局不错乱
-   [ ] 所有埋点事件正确上报