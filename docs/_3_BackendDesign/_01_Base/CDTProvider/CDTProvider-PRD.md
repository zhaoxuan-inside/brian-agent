# CDTProvider PRD

> 初始版本（2026-09-22）。本文档为活文档：反映系统当前状态，随代码同步更新。

## 1. 组件简介

### 1.1 目标

管理 Chrome 进程的启动/停止，通过 CDP（Chrome DevTools Protocol）WebSocket 与浏览器通信，为上层提供远程浏览器能力：页面导航、JS 执行、输入转发、实时画面流、反检测伪装。

### 1.2 定位

Base 层 Provider，分层结构 `domain / application / infrastructure / access`：

- `domain/types.ts`：Input/Output/Context 类型、配置表名、Chrome 路径表
- `application/CDTService.ts`：Chrome 进程生命周期 + CDP 通信（核心编排）
- `application/ProfileSnapshot.ts`：登录态种子纯函数（数据操作）
- `infrastructure/CDTSchemaInitializer.ts`：`cdt_config` 表结构
- `access/CDTAccess.ts`：统一入口（AOP 代理包裹）

### 1.3 集成依赖

- RelationDBProvider：配置表 `cdt_config`
- 上游调用方：Core 层 CDTCoreService（Agent 工具链路）、dev-server（HTTP 端点 `/cdt/*`）

## 2. 配置项（cdt_config 表）

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| enabled | BOOLEAN | true | 组件启用开关 |
| port | INT | 9222 | CDP 调试端口 |
| chrome_path | STRING | 自动检测 | Chrome 可执行路径（内置 Chromium 走 `BRIAN_CHROME_PATH`） |
| headless | BOOLEAN | false | 无头模式（无 DISPLAY 环境强制 true） |
| profile_dir | STRING | cdt-profile | 产品 profile 目录名（相对 data 目录，持久化） |
| window_width / window_height | INT | 1920/1080 | 窗口尺寸 |
| profile_snapshot_source | STRING | '' | **登录态种子源**：本机 Chrome profile 目录路径（支持 `~`）。留空不启用 |

配置注册：`cdt_provider.profile_snapshot_source`（Application/Config configRegistrations），配置中心「CDT / 浏览器 → 浏览器参数」可编辑。

## 3. 登录态种子（seed_profile）

使产品远程浏览器直接继承用户本机 Chrome 的已登录站点，绕过产品内登录流程。

### 3.1 行为

1. startCDT 解析出产品 user-data-dir 后调用 `seedProfileFromSnapshot`（编排）
2. 源目录有效且未播种（或源路径变更）时，复制登录态文件到产品 profile（**目标为 user-data-dir 下的 `Default/` 子目录**——产品未传 `--profile-directory`，Chrome 固定使用该子目录；源侧配的是用户 profile 目录，如 `~/.config/google-chrome/Default`）：
   - `Network/Cookies`（Chrome 96+）/ `Cookies`（旧版兜底），SQLite 伴生文件（-journal/-wal/-shm）一并复制
   - `Local Storage/leveldb/`（递归；先清空目标旧库再复制，避免 leveldb CURRENT/MANIFEST 混存损坏）
3. 写标记文件 `.cdt-profile-seeded`（内容为已播源的绝对路径，落 user-data-dir 根）
4. 同源二次启动不重复播种，**不覆盖产品侧登录态**；源变更时重新播种（覆盖）

### 3.2 约束与边界

- 播种失败仅告警（metrics.warn），不阻塞 Chrome 启动主链路
- 播种发生在 startCDT 的进程存活早退之后：不存在与运行中 Chrome 的 profile 锁竞争
- 复制范围与 Playwright storage_state 对齐（cookies + localStorage）；不复制 Preferences / Login Data / IndexedDB
- 决策依据见 docs/decisions.md [2026-09-22] 条目

### 3.3 反检测实测基线（2026-09-22 真机）

bot.sannysoft.com 14+ 检测项全部通过。两个已修复的坑（详见 CHANGELOG 2026-09-22l）：
- `Page.addScriptToEvaluateOnNewDocument` 前必须 `Page.enable`，否则应答成功但注入永不生效
- webdriver 必须在 `Navigator.prototype` 原型级重定义；实例级 defineProperty 制造自有属性，会被 `_.has(navigator,'webdriver')` 类探测识破

已知边界：VMware 无 GPU 环境 WebGL context 不可用，对 WebGL 指纹检测站点是信号（与本机硬件一致）。

## 4. 方法清单（CDTAccess 公开方法）

| 方法 | 职责(一句话) | 调用方 | 端点 |
|------|-------------|--------|------|
| startCDT | 启动 Chrome（含登录态种子、反检测注入、保活连接） | dev-server, CDTCoreService | POST /cdt/start |
| stopCDT | 停止 Chrome 并清理 WebSocket/心跳 | dev-server | POST /cdt/stop |
| isCDTRunning | 进程/CDP 端点双重探活（re-exec 容忍） | dev-server | GET /cdt/status |
| soCDTEndpoint | 查询当前 CDP WebSocket 端点 | CDTCoreService | GET /cdt/status |
| execCDP | 执行任意 CDP 命令（30s 命令级超时） | CDTCoreService, dev-server | POST /cdt/navigate, /cdt/evaluate |
| startScreencast | 开启实时帧流（jpeg） | dev-server | GET /cdt/screencast/start |
| getLatestFrame / getLatestFrameDimensions | 读取最新帧 | dev-server | GET /cdt/frame |
| sendMouseEvent / sendKeyEvent / sendKeyBatch | 输入转发（Remote Browser 交互） | dev-server | POST /cdt/mouse, /cdt/key 等 |
| insertText | 光标处插入文本（支持 password 字段） | dev-server | POST /cdt/insert-text |
| injectAntiDetection | UA/平台/语言伪装 + JS 指纹覆盖脚本 | dev-server, CDTCoreService | POST /cdt/spoof-env |

## 5. 测试

- 单元：`Base/test/CDTProfileSnapshot.test.ts`（源解析 / 复制 / 标记，9 例）
- 端到端：`brian-backend/scripts/e2e-cdt-profile-snapshot.mjs`（真实 Chrome 启动链路 + 二次启动不覆盖断言）
