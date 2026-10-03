# Brian-Agent 打包与分发

产出自包含、零依赖的发行包：内置 Node.js 运行时、平台原生模块、前端静态
资源、Chrome for Testing（浏览器自动化用）与技能沙箱运行时（bash + Python），
解压即可运行，无需在目标机器安装任何依赖。

## 两种打包形态

| 形态 | 脚本 | 产物 | 适用 |
|------|------|------|------|
| **便携目录包（推荐）** | `packaging/pack.py`（底层 `pack.mjs`） | `dist-pack/brian-agent-<plat>-<arch>.tar.gz / .zip / .deb` + `SHA256SUMS` | 交叉打包：在一台机器上产出全部 4 个目标 |
| SEA 单文件可执行 | `packaging/build.mjs` | `dist-sea/brian-<plat>-<arch>` | 单文件极简分发；需在目标平台构建，macOS 需重签名 |

## 便携包（pack.py / pack.mjs）

`pack.py` 是自动化入口：环境自检（Node 22 / ABI 127 / tar / dpkg-deb）→ 依赖
缺失时自动 `npm ci` → 前端构建 → 调用 `pack.mjs` 组装 → 产物结构校验 →
生成 `SHA256SUMS`。`pack.mjs` 是实际装配器，可单独使用。

### 构建环境要求

- **Node 22（ABI 127）**：仓库内置的预编译原生模块为 `node127`，其他版本会拒绝构建
- Python 3.8+（仅 pack.py 需要）
- 网络可访问 `nodejs.org`、`registry.npmjs.org`、`storage.googleapis.com`
  （Chromium；`--skip-chromium` 可跳过）、`github.com`
  （MinGit 与 python-build-standalone 沙箱运行时；`--skip-runtime` 可跳过）
- Linux 构建机需要 `tar`（macOS 同样有）；`.deb` 需要本机有 `dpkg-deb`

### 用法

```bash
# 推荐：一键自动化（全部 4 目标 + .deb + SHA256SUMS）
python3 packaging/pack.py

# 常用变体
python3 packaging/pack.py --targets linux-x64,win32-x64   # 指定目标
python3 packaging/pack.py --skip-chromium                 # 不内置 Chromium（每个目标 -150MB）
python3 packaging/pack.py --skip-frontend-build           # 复用已有 brian-frontend/dist
python3 packaging/pack.py --skip-deb                      # 不产 .deb
python3 packaging/pack.py --no-install                    # 依赖缺失时报错而非自动 npm ci

# 底层装配器（pack.py 内部调用）
node packaging/pack.mjs --only darwin-arm64,win32-x64 --skip-chromium --skip-frontend-build
```

### 目标与产物

| 目标 | 归档 | 说明 |
|------|------|------|
| `linux-x64` | `.tar.gz` + `.deb` | glibc ≥ 2.28（Ubuntu 20.04+ / Debian 11+） |
| `darwin-x64` | `.tar.gz` | Intel Mac |
| `darwin-arm64` | `.tar.gz` | Apple Silicon |
| `win32-x64` | `.zip` | Windows x64 |

包内布局（各平台一致）：

```
brian-agent-<plat>-<arch>/
├── brian.sh / brian.cmd        # 启动管理脚本（start/stop/restart/status/logs/open/serve）
├── README.txt                  # 平台相关注意事项
├── bin/node(.exe)              # 内置 Node v22 运行时
├── server/
│   ├── brian-server.cjs        # 后端 bundle（esbuild 打包全部 5 层 + dev-server）
│   ├── package.json            # 存根：better-sqlite3 的 bindings() 定位模块根用
│   ├── portable.marker         # 便携模式标记
│   ├── seed/system-seed.json   # 系统数据种子（通用目录数据，首跑自动导入）
│   └── （启动器为包内 brian.sh/brian.cmd；数据默认在 ~/.brian-agent）
│   ├── build/Release/          # better_sqlite3.node（bindings() 默认查找路径）
│   └── native/<plat>-<arch>/   # better_sqlite3 / isolated_vm / jieba / lancedb
├── web/                        # 前端 dist（由后端同端口服务，SPA fallback）
├── chrome/chrome.zip           # Chrome for Testing（首次运行解压到系统临时目录）
├── runtime/                    # 技能沙箱运行时（entry.ts 注入 BRIAN_SANDBOX_*）
│   ├── bash/                   # PortableGit 的 usr/ + etc/（仅 win32 包；bash + coreutils）
│   └── python/                 # python-build-standalone install 目录（全平台）
├── systemd/brian-agent.service # systemd 单元（可选安装）
└── data/                       # 运行数据（首跑生成；删除即重置）
```

### 使用

```bash
./brian.sh start      # 后台启动 → http://127.0.0.1:8000
./brian.sh logs       # 跟踪日志
./brian.sh stop       # 停止
BRIAN_HOST=0.0.0.0 ./brian.sh start   # 对外监听
```

Windows：`brian.cmd start|stop|status|serve|open`。

### 运行时机制（packaging/entry.ts）

1. **便携模式探测**：`BRIAN_PORTABLE=1`（启动脚本设置）且存在
   `server/portable.marker` → 配置 `BRIAN_DATA_DIR`（包内 `data/`）、
   `BRIAN_NATIVE_DIR`（`server/native/`），并把 `web/` 构建为与 SEA asset
   同构的 base64 映射注入 `__BRIAN_FRONTEND__`（dev-server 的静态服务零改动复用）。
2. **原生模块拦截**（`setup-native.ts`）：覆盖 `Module._resolveFilename`，
   将 jieba/lancedb 平台子包与 `.node` basename 请求重定向到
   `BRIAN_NATIVE_DIR/<plat>-<arch>/`；vendored isolated-vm.js 自身优先从
   `BRIAN_NATIVE_DIR` 查找。
3. **Chromium**（`setup-chromium.ts`）：便携包从 `<包根>/chrome/chrome.zip`
   解压到系统临时目录（带缓存）并设置 `BRIAN_CHROME_PATH`；未内置时 CDT
   回退系统 Chrome。
4. **技能沙箱运行时**（`entry.ts injectSandboxRuntimeEnv`）：`runtime/`
   内存在捆绑 bash/Python 时注入 `BRIAN_SANDBOX_BASH` / `BRIAN_SANDBOX_PYTHON`
   （用户已显式设置时不覆盖）。优先级：用户 env > 捆绑运行时 > 宿主机发现。
   `--skip-runtime` 构建的包不含 `runtime/`，自动回退宿主机解释器。

### 沙箱运行时版本与许可

| 运行时 | 来源 | 钉定版本（pack.mjs 常量/环境变量） | 许可 |
|--------|------|----------------------------------|------|
| PortableGit（Windows bash + coreutils） | `github.com/git-for-windows/git/releases`，资产 `PortableGit-<ver>-64-bit.7z.exe`（自解压 7z；POSIX 构建机需 7z） | `MINGIT_VERSION=2.47.1`、`MINGIT_BUILD=1` | GPL-2.0（未修改官方制品再分发，源码同上游公开） |
| Python 3（全平台） | `github.com/astral-sh/python-build-standalone/releases`，资产 `cpython-<ver>+<tag>-<triple>-install_only.tar.gz` | `PYTHON_STANDALONE_CPYTHON=3.12.7`、`PYTHON_STANDALONE_TAG=20241016` | PSF / MIT（python-build-standalone 打包） |

## 全局安装器与 npm 分发

三种"装一次、任意目录 `brian` 命令"的安装路径：

| 方式 | 目标用户 | 机制 |
|------|---------|------|
| `packaging/install.sh`（curl\|sh / `--from` 离线） | Linux/macOS，无需 Node | 检测平台 → Release 下载（或本地包）→ 装 `/opt/brian-agent`（root）或 `~/.local/share/brian-agent` → 全局命令 `brian`（/usr/local/bin 或 ~/.local/bin）→ `--systemd` 可选常驻 |
| `packaging/install.ps1` | Windows | 下载 zip → `%LOCALAPPDATA%\brian-agent` → 写入用户 PATH（`brian.cmd`） |
| npm 包 `dist-pack/npm/` | 已有 Node 18+ | `npm i -g brian-agent`：`bin.brian` 垫片 + postinstall 按 Release 下载平台包，并**自动安装用户级 systemd 服务**（`brian start/status/stop` 路由到 systemctl，被杀 2 秒自动拉起，`brian logs` 看 journal） |

npm 包由 `pack.mjs` 自动生成（`dist-pack/npm/`，已注入版本号与仓库地址，
`--no-npm` 跳过、`--repo owner/repo` 覆盖）；发布流程见 `packaging/npm/README.md`
（需先创建 GitHub Release `v<版本>` 并上传 4 个平台压缩包）。

## 数据目录（个人数据 / 程序分离）

| 环境 | 默认数据目录 |
|------|-------------|
| Linux/macOS | `~/.brian-agent` |
| Windows | `%APPDATA%\brian-agent` |
| systemd（.deb / `--systemd`） | `/var/lib/brian-agent` |
| 便携模式（可选） | `BRIAN_DATA_DIR=$PWD/data`（数据跟包走，U 盘场景） |

程序与数据分离：升级/重装覆盖安装目录，数据不受影响。

## 开发模式后端守护（systemd user service）

dev 后端若以 `./brian start backend`（后台 detached 进程，PID 与日志落系统临时目录）方式启动，会随终端/IDE 环境变化、
被 oomd 或其他进程误伤后**静默消失且无法自愈**。改为 systemd user service 托管：

```bash
mkdir -p ~/.config/systemd/user
cp packaging/brian-backend-dev.service ~/.config/systemd/user/
# 确认 unit 内 PATH= 指向你本机的 node bin 目录（nvm 用户：dirname $(which node)）
systemctl --user daemon-reload
./brian stop backend          # 停掉后台旧实例（detached）
systemctl --user enable --now brian-backend-dev
loginctl enable-linger        # 可选：服务不随登录会话结束
```

效果：进程被杀 2 秒内自动拉起（Restart=always）；`systemctl --user status
brian-backend-dev` 看状态；死亡原因进 `journalctl --user -u brian-backend-dev`。
改 `.ts` 源码自动热更新（tsx watch 语义不变）。停用托管改回 `./brian start backend`：
`systemctl --user disable --now brian-backend-dev`。

## 系统数据种子（个人数据 / 系统数据分离）

打包时执行 `packaging/export-system-data.mjs`，从构建机库（`brian-backend/data/brian.db`）
导出**通用数据**为 `system-seed.json`，包内首跑自动导入（`BRIAN_SEED_FILE`，
仅空表导入、绝不覆盖运行数据，天然幂等）：

| 分类 | 内容 | 处理 |
|------|------|------|
| 系统数据（随包） | `llm_provider` 模型提供商目录（13 行：OpenAI/Anthropic/DeepSeek/智谱/通义等） | 剔除指向本机(127.0.0.1/localhost)的行；`api_key` 一律置空 |
| 系统数据（随包） | `mcp_provider` MCP 提供商目录（4 行：阿里云百炼/ModelScope/GitHub/Smithery） | 全量 |
| 个人数据（不打包） | `api_key`、`llm_available`（个人选配模型）、`mcp_install`（个人安装实例）、会话/记忆/向量库/图谱/画像/Agent/Skill 实体、usage/trace/日志 | 一概不导出 |

规则维护在 `export-system-data.mjs` 的 `SYSTEM_TABLES / SANITIZE_FIELDS / ROW_FILTERS`。
`--no-system-data` 可跳过种子打包。

### 已知限制

- **darwin-x64（Intel Mac）**：仓库未内置 isolated-vm 预编译二进制，
  `.js` Skill 沙箱降级禁用（`SkillAccess` 捕获加载失败并替换为
  `UnavailableJsSandbox`，服务其余功能完整；启动时打印警告）。
- **macOS 公证**：未做 Apple 公证。用户首次运行前若被 Gatekeeper 拦截：
  `xattr -dr com.apple.quarantine brian-agent-darwin-*`（README 已注明）。
- **SEA 形态与 better-sqlite3**：`build.mjs` 的单文件产物同样受 bindings()
  模块根定位影响，如使用 SEA 请确认已在目标环境验证；便携包无此问题
  （已通过 `server/package.json` 存根 + `build/Release/` 布局解决）。

## 构建产物校验（linux-x64 冒烟）

```bash
tar -xzf dist-pack/brian-agent-linux-x64.tar.gz -C /tmp/smoke
cd /tmp/smoke/brian-agent-linux-x64 && ./brian.sh start
curl --noproxy '*' http://127.0.0.1:8000/            # 200（SPA）
curl --noproxy '*' http://127.0.0.1:8000/api/config  # 200（后端 API）
./brian.sh stop
```
