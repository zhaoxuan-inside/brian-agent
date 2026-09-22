<div align="center">

# Brian-Agent

**不是做一个"工具"，而是做一个"人"**

一个具备**记忆、人格、反思与自我进化**能力的个人智能 Agent

ChatMap 上下文自主控制 · 七源混合记忆召回 · 多 Agent 协作 · 自我进化闭环 · 浏览器自动化

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vue.js&logoColor=white)
![Tests](https://img.shields.io/badge/tests-1800%2B-brightgreen)

</div>

---

## 🌟 亮点速览

| | 亮点 | 一句话说明 |
|---|------|-----------|
| 🗺️ | **ChatMap 对话图谱** | 对话即图谱：只引用你勾选的消息构建上下文，上下文由你掌控 |
| 📌 | **Memory Pin** | 钉住重要消息，永不被滑动窗口冲刷 |
| 🧠 | **七源混合记忆召回** | 钉选/引用/时间线/标签图/向量/全文/随机，像人脑一样取材 |
| 🕸️ | **涌现图 & 关键词图** | 共现图谱自动挖掘记忆中的隐藏关联，重现"灵光一闪" |
| 🤖 | **多 Agent 协作** | 意图理解 → 动态组队 → 规划 → 执行 → 写作 → 评估进化 |
| 🧬 | **自我进化闭环** | 从文档/对话/图谱三种模式学习，Evolutor Agent 定期评估并生成进化报告 |
| 👤 | **Soul 人格 & 用户画像** | 按任务匹配人格灵魂，对话中持续沉淀你的画像 |
| 🌐 | **CDT 浏览器自动化** | Chrome 指纹反检测 + 继承本机登录态，开箱即可操作你已登录的站点 |
| 📖 | **资料库阅读器** | 划词即问"读伴"，问答以纸质书边注形态对齐正文 |
| 🔒 | **技能沙箱** | isolated-vm 硬隔离执行技能代码，fail-fast 不降级 |
| 🔍 | **思考全透明** | 上下文构成、ReAct 思考流、任务/Agent DAG 全程可视可回溯 |
| 📦 | **自包含发行包** | 内置 Node 运行时 + 原生模块 + Chrome，目标机零依赖解压即用 |

---

## ✨ 亮点功能

### 1. ChatMap 对话图谱 —— 上下文由你掌控

只问答你关心的信息，摒弃无用信息进入上下文：上下文的构建**只采用被引用（勾选）的消息**，
不会加载无关消息，实现对话上下文的自主控制。无限画布支持缩放、平移、节点拖拽对齐。

<div align="center">
  <img src="README/image.png" width="800" alt="ChatMap 可视化控制" />
</div>

### 2. Memory Pin 机制 —— 强制模型注意力

对话轮数过多、上下文过长时，重要信息可能被忽略或丢失。只需 **Pin 住消息**，
它就会永远留在上下文的关键位置，不被滑动窗口冲刷。

<div align="center">
  <img src="README/image-1.png" width="640" alt="Memory Pin 机制" />
</div>

### 3. 七源混合记忆召回 —— 像人脑一样取材

构建上下文时，系统按优先级从七个互补的来源采集素材，单一来源失败自动降级、不阻断整体：

| 来源 | 机制 | 解决什么问题 |
|------|------|-------------|
| `PINNED` | 用户钉选的消息 | 重要信息强制在场 |
| `CITING` | ChatMap 勾选引用 | 用户显式控制上下文 |
| `TIMELINE` | 最近 N 条时间线 | 顺承当前话题 |
| `TAG_RELATIVE` | 标签共现图谱搜索 | 时间距离过远的关联信息 |
| `SIMILARITY` | LanceDB 向量语义检索 | 语义相近但措辞不同的历史 |
| `KEYWORD` | SQLite FTS5 + BM25 全文匹配 | 被某个词"激活"的记忆 |
| `RANDOM` | 会话/全局随机采样 | 模拟人脑偶然回忆，防止上下文过于狭窄 |

> 向量 + 全文 + 图谱三路混合检索，不只依赖向量相似度，检索质量显著优于单路召回。

### 4. 涌现图与关键词图 —— 提升 Memory 质量

**信息页面**（`/info`）提供两个基于**共现关系**的知识图谱，帮助用户发现记忆中的隐藏关联：

**涌现图（Tag Graph）** —— 系统理解请求内容后，通过标签图谱搜索，选中与当前请求最相关的信息，
找回时间距离过远而容易丢失的记忆。

<div align="center">
  <img src="README/image-2.png" width="800" alt="涌现图（Tag Graph）" />
</div>

**关键词图（Keyword Graph）** —— 大脑中有些灵光一闪，是被某一个词激活的。
通过关键词图的关联性搜索，重现这种"灵光一闪"。

<div align="center">
  <img src="README/image-3.png" width="800" alt="关键词图（Keyword Graph）" />
</div>

> 两个图谱的价值在于：**自动发现记忆中的涌现模式**——用户可能从未意识到的标签/关键词之间的关联
> 被自动挖掘并可视化，帮助用户理解和审视自己的知识结构；同时反向服务于上下文构建
> （`TAG_RELATIVE` 与 `KEYWORD` 维度），让检索利用结构化的共现关系而非仅靠向量相似度。

### 5. 多 Agent 协作 —— 各司其职的"团队"

一次问答背后是一支分工明确的 Agent 团队，而非单个大模型裸奔：

```
IntentAgent 理解意图 → AgentBuilder 动态组建系统 Agent（AgentLibrary 统一管理）
     ↓
PlannerAgent 任务拆解（任务 DAG + 复杂度/优先级 + 支持重规划 replan）
     ↓
工作 Agent 执行（工具调用 / MCP / 技能 / 浏览器）
     ↓
WriterAgent 汇总作答（绑定专属 Soul 人格与人类友好阐述协议）
     ↓
EvolutorAgent 评估打分 → 反馈闭环 → 进化报告
```

前端全程可视化：**任务 DAG 流水图**、**Agent DAG 执行状态图**（灰=待执行/黄=进行中/绿=成功/红=失败）、
**Canvas 绘制的 ReAct 思考流**，每一步的输入输出都可点开回溯。

### 6. 自我进化闭环 —— 学习 → 评估 → 进化

- **三种自学习模式**（学习页可独立开关 + 随机因子滑杆模拟偶然性）：
  从文档学习（抽取知识点与洞察）、从对话学习（提取偏好与知识模式）、Tag 图维护（连接标签/激活图边/老化孤立标签）；
- **Evolutor Agent** 定期评估工作 Agent 与 Writer 的表现，产出评估分数与进化报告；
- **反馈闭环**：用户反馈与 Agent 自评统一进入监控页，差评可追溯至具体执行过程。

### 7. Soul 人格 & 用户画像

- **Soul**：每个 Agent 绑定人格灵魂（身份定位、信条、纪律），Planner/Writer 各有专属人格，
  新建 Agent 时按任务语义自动生成匹配的 Soul；
- **用户画像**：对话中持续沉淀你的偏好与知识背景（含历史版本管理），并反哺 Writer 的表达风格。

### 8. CDT 浏览器自动化 —— 反检测 + 登录态继承

基于 Chrome DevTools Protocol 的浏览器自动化，两处差异化能力：

- **指纹反检测**：`navigator.webdriver` 在原型级重定义、UA/平台/语言伪装，
  bot.sannysoft.com 14+ 检测项实测全部通过；
- **登录态种子**：配置本机 Chrome profile 后，Cookies + Local Storage 自动播种进产品浏览器——
  自动化直接继承你已登录的站点，无需在产品内重新登录。

### 9. 资料库阅读器 —— 纸质书边注式问答

学习资料库内置三栏阅读器（目录 + 正文 + 读伴）：**划词右键即可向"读伴"提问**，
问答以编号下划线标注在原文位置，宽屏下以**纸质书边注（marginalia）形态**对齐显示在正文空白处；
文档编辑后标注自动模糊重对齐，实在对不上才标记"原文已变更"。

### 10. 技能沙箱 —— 硬隔离执行

技能代码在 **isolated-vm（V8 隔离实例）** 中执行（各平台 prebuilt 二进制随包分发），
辅以本地解释器沙箱；沙箱是硬性部署契约——初始化失败直接拒绝启动，绝不静默降级执行。

### 11. 思考全透明 —— 可解释、可回溯、可干预

- **ThinkingContext**：完整展示本次问答的上下文构成（各来源引用了哪些消息、画像、最近工作）；
- **人机协作卡片**：Agent 主动反问（AskUser）、工具执行授权（Permission，支持"记住选择"）、意图确认；
- **监控页**：系统健康/资源/Token 消耗趋势/模型分布、日志多维过滤（级别/来源/trace_id）、反馈处理记录；
- **配置中心**：13 家模型供应商与 MCP 市场开箱即用，所有配置变更均有历史记录与 Diff 对比。

---

## 🚀 快速开始（开发模式）

```bash
git clone https://github.com/zhaoxuan-inside/brian-agent.git brian-agent && cd brian-agent

npm install          # 安装依赖（postinstall 自动就位原生模块）

./brian start        # 启动后端(:8000) + 前端(:5173)
./brian open         # 浏览器打开前端

# 常用
./brian start backend        # 仅启动后端
./brian serve                # 前台 headless 模式
./brian doctor               # 环境与依赖自检
./brian stop                 # 停止全部
```

后端默认监听 `http://127.0.0.1:8000`，前端 Vite(:5173) 代理 `/api` 与 `/ws`。
环境变量：`BRIAN_PORT`、`BRIAN_HOST`。日常管理详见 [docs/使用手册.md](docs/使用手册.md)。

> 首次启动后需在 `/config` 页面配置模型供应商与 API Key，即可开始对话
> （内置 13 家主流提供商目录：OpenAI / Anthropic / DeepSeek / 智谱 / 通义 / 火山引擎…）。

## 📦 打包分发与安装

把系统打成**自包含发行包**：内置 Node.js 运行时、全部原生依赖、前端页面与
Chrome for Testing（浏览器自动化用），目标机器**无需安装任何依赖**，解压即用。

### 一键打包（构建机执行）

```bash
# 全部 4 个目标 + .deb + SHA256SUMS（要求构建机为 Node 22）
python3 packaging/pack.py

# 常用变体
python3 packaging/pack.py --targets linux-x64,win32-x64   # 指定目标
python3 packaging/pack.py --skip-chromium                 # 不内置 Chrome（体积 -150MB/目标）
```

产物在 `dist-pack/`：Linux/macOS 为 `.tar.gz`，Windows 为 `.zip`，Linux 另有 `.deb`。

### 全局安装（推荐，Hermes 式体验）

任选其一，安装后即可在**任意目录**使用 `brian` 命令：

```bash
# 方式 A：npm 全局包（已有 Node 18+ 的机器；postinstall 自动下载对应平台运行时）
npm i -g brian-agent

# 方式 B：一键脚本（Linux/macOS，无需 Node；从 GitHub Releases 下载）
curl -fsSL https://raw.githubusercontent.com/zhaoxuan-inside/brian-agent/main/packaging/install.sh | bash
# Windows（PowerShell）:
iwr https://raw.githubusercontent.com/zhaoxuan-inside/brian-agent/main/packaging/install.ps1 -OutFile install.ps1; .\install.ps1

# 方式 C：离线安装（本地已有的发行包，Linux/macOS）
./packaging/install.sh --from dist-pack/brian-agent-linux-x64.tar.gz
```

### 安装（免安装便携模式）

不安装直接使用也可以——解压即用，数据落在包内 `data/`：

```bash
tar -xzf brian-agent-linux-x64.tar.gz && cd brian-agent-linux-x64
./brian.sh start                     # Windows: brian.cmd start
```

| 平台 | 产物 | 便携模式启动 |
|------|------|-------------|
| Linux | `brian-agent-linux-x64.tar.gz` 或 `.deb` | 解压后 `./brian.sh start`；`.deb` 安装后直接用 `brian` 命令（/usr/bin/brian） |
| macOS（Intel/Apple Silicon） | `brian-agent-darwin-*.tar.gz` | 解压 → `xattr -dr com.apple.quarantine brian-agent-*` → `./brian.sh start` |
| Windows | `brian-agent-win32-x64.zip` | 解压 → `brian.cmd start`（前台：`brian.cmd serve`） |

启动后浏览器打开 **http://127.0.0.1:8000**。停止：`brian stop`（便携模式 `./brian.sh stop`）。对外监听：`BRIAN_HOST=0.0.0.0`。

Linux 可选 systemd 常驻：安装包内含 `systemd/brian-agent.service`（.deb 已装好，可用 `sudo systemctl enable --now brian-agent`）；一键脚本加 `--systemd` 参数自动安装。

### 首次运行须知

- 包内**不含数据库**：`data/` 在首次运行时自动创建（表结构与默认配置种子自动初始化）；
- **通用目录数据已随包预置**：模型提供商列表（OpenAI/Anthropic/DeepSeek/智谱/通义等 13 家）与 MCP 提供商列表（阿里云百炼/ModelScope/GitHub/Smithery 等）在首次运行时自动导入；
- **个人数据不打包**（API Key、对话、记忆等）：提供商目录不含 API Key，需在 `/config` 页选择提供商并填入自己的 Key 才能开始对话；
- 数据目录默认 `~/.brian-agent`（Windows `%APPDATA%\brian-agent`，`BRIAN_DATA_DIR` 可改，便携模式设为包内 `data/`）；端口 `BRIAN_PORT`（默认 8000）、监听地址 `BRIAN_HOST`（默认 127.0.0.1）；
- **升级/重装不影响数据**（程序与数据分离）；
- Windows 首次运行若被 SmartScreen 拦截，选择「仍要运行」。

详见 [packaging/README.md](packaging/README.md) 与 [docs/打包部署.md](docs/打包部署.md)。

## 🏗️ 架构一览

npm workspaces 单仓库，后端按 DDD 分为 5 个严格分层的包，依赖单向：
`base ← core ← runtime ← agent ← application`；前端经 Vite 代理访问后端。

| 包 | 层级 | 职责 |
|----|------|------|
| `@brian-agent/base` | 基础构件层 | RelationDB(SQLite) / GraphDB / VectorDB(LanceDB) / LLM / MCP / MQ / CDT 浏览器 / Prompts / Skill 沙箱 / Soul / Cron / Stream / 反馈 |
| `@brian-agent/core` | 基础层 | InfoCore(记忆核心) / LLMCore / MCPCore / SkillCore / SoulCore / MQCore / CDTCore |
| `@brian-agent/runtime` | 编排内核 | Runtime v2「代码即编排」：Session / Runs / 两级 Agent Loop（迭代预算 + 真取消）/ Tools / 事件总线 |
| `@brian-agent/agent` | Agent 层 | AgentLibrary / AgentBuilder / AgentContext / AgentExecution + Planner / Writer / Evolutor / Intent / Summary |
| `@brian-agent/application` | 应用层 | Chat / Config / SelfLearning / UserProfile / Visualization |
| `@brian-agent/frontend` | 前端 | Vue 3 + Pinia + Vite + Tailwind CSS（Apple 风格主题，明暗双主题 + 中英双语），Notion 式块渲染 |
| `@brian-agent/shared` | 共享 | Zod schema + TypeScript 类型 |

**技术栈**：TypeScript · 纯 `node:http` + `ws`（无 Web 框架）· better-sqlite3 / isolated-vm / LanceDB（离线预编译原生件）· SSE 流式 · Node 22。

**工程质量**：全仓库统一五参方法签名（`Promise<boolean> method(input, context, output, …)`）+
AOP 织入，506 个公开方法由脚本自动生成索引；后端五层 vitest **1800+ 用例**。

## 🧪 质量与测试

```bash
npm run test          # 后端 5 层 vitest（1800+ 用例，逐工作区聚合执行）
npm run typecheck     # 后端 5 层 tsc --noEmit
npm run lint          # 前端 ESLint
npm run lint:backend  # 后端 ESLint
npm run build         # 按依赖顺序构建全部（前端含 vue-tsc 类型检查）
npm run docs:index    # 重新生成方法自动索引
```

## 📚 文档

| 文档 | 内容 |
|------|------|
| [docs/AgentThink.md](docs/_0_DesignPrinciples/AgentThink.md) | 设计哲学与 Agent 思考模型 |
| [docs/index.md](docs/index.md) | 文档总索引（需求关键词 → 文档 → 代码 三跳可达） |
| [docs/使用手册.md](docs/使用手册.md) | 日常启动/关闭与管理操作 |
| [docs/打包部署.md](docs/打包部署.md) | 打包原理与部署细节 |
| [docs/_01_TerminologyStandardization.md](docs/_01_TerminologyStandardization.md) | 术语标准化（msg_id / interact_id / work_id / session_id） |
| [docs/_1_DevStandards/DevStandards.md](docs/_1_DevStandards/DevStandards.md) | 开发强制规范（方法签名 / AOP / 分层） |
| [docs/TODO-List.md](docs/TODO-List.md) | 待开发功能清单 |

## 💬 交流

| QQ 群 | 微信群 |
|-------|--------|
| <img src="README/QQ群聊：Brian%20Agent.jpg" width="200" alt="QQ 群" /> | <img src="README/WeChat群聊：Brian%20Agent.jpg" width="200" alt="微信群" /> |
