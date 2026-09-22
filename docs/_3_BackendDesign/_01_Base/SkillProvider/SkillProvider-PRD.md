# Skill Provider

Skill 由以下部分构成：

| 组成部分 | 是否必需 | 核心作用 |
|---------|---------|---------|
| SKILL.md 文件 | ✅ 必需 | 技能的"大脑"，包含智能体判断**何时使用**、以及**如何执行**任务的完整信息 |
| scripts/ 目录 | ❌ 可选 | 存放可执行脚本（如 Python、Bash），用于执行确定性、安全性要求高的操作（如数学计算、API 调用），避免大模型产生"幻觉" |
| references/ 目录 | ❌ 可选 | 存放详细的参考文档，供智能体在需要时查阅，而不会一开始就占用上下文 |
| assets/ 目录 | ❌ 可选 | 存放模板、图片等静态资源，供技能执行时使用或作为输出参考 |

除上述构成部分外，Skill 还需要一个**简短名称 (name)** 和一个**简述 (skill_brief)**。

> **重要**：SKILL.md 的内容 (skill_md) 是模型筛选 Skill **能否完成指定工作的核心线索**。
> LLM 匹配时，系统将 skill_brief 和 skill_md 一起发给模型进行相关性排名。

## 1. 设计目标

1. 解耦 Skill 和系统，通过 Repository 设计模式为上层提供统一的 Skill 操作接口；
2. 所有对 Skill 的操作都不能直接进行，都必须要通过 SkillProvider；
3. 负责 Skill 的 CRUD 操作；
4. 接收 Skill 执行请求，在沙箱中完成执行并将结果返回；
5. 提供可视化数据接口，支持 Skill 服务健康状态监控；
6. Skill 组件默认集成双沙箱执行环境（isolated-vm + local）；
7. SkillProvider 用到的所有配置项统一存储在关系数据库配置表中；

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`。
> Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不再重复定义。

### 2.1. Skill 上下文（SkillContext）

继承 Context 基类，Skill 相关操作的执行上下文。

### 2.2. FileEntry

scripts / references / assets 目录中的单个文件项。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| name | STRING | Y | 文件名（含相对路径，如 "fetch_data.py"、"subdir/parse.sh"） |
| content | STRING | Y | 文件内容（文本） |

### 2.3. Skill 数据对象（SkillData）

用于新增 Skill；更新 Skill 时使用 `Partial<SkillData>` 仅传入待更新字段。
id / created / updated 为系统字段，由 Provider 维护，不通过 Data 对象传入。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| name | STRING | Y | Skill 简短名称（≤10 字符，前端展示用标题） |
| skill_brief | STRING | Y | Skill 简述（简短描述，与 skill_md 一起用于 LLM 快速匹配筛选） |
| skill_md | STRING | Y | SKILL.md 内容的全文。技能的"大脑"，包含判断何时调用、如何执行的完整信息。LLM 筛选 Skill 的核心线索 |
| scripts | FileEntry[] | N | scripts/ 目录中的文件列表 |
| references | FileEntry[] | N | references/ 目录中的文件列表 |
| assets | FileEntry[] | N | assets/ 目录中的文件列表 |
| enable | BOOLEAN | N | 是否启用，默认 true（资源级启用/禁用通过 updateSkill 修改） |

## 3. 功能设计

### 3.1. Skill 管理

#### 3.1.1. 新增 Skill（addSkill）

**功能**：新增一个 Skill

**方法签名**：`Boolean addSkill(AddSkillInput input, SkillContext context, AddSkillOutput output)`

**入参（AddSkillInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | SkillData | Y | Skill 数据 |

**校验规则**：
- name 为必填
- skill_brief 为必填
- skill_md 为必填

**处理流程**：

1. 接收 Skill 数据，通过 RelationDBProvider 写入 `skill` 表；
2. 生成 Skill 唯一 id；
3. 初始化系统字段 `created`、`updated` 为当前时间戳；
4. scripts/references/assets 以 JSON 序列化存入 TEXT 列；
5. Skill id 通过 output 参数返回；

**返回**：Boolean，表示新增是否完成；Skill ID 通过 output 参数返回

#### 3.1.2. 获取 Skill（getSkill）

**功能**：获取指定的 Skill，支持按 ID 或按条件获取第一条

**方法签名**：`Boolean getSkill(GetSkillInput input, SkillContext context, GetSkillOutput output)`

**入参（GetSkillInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 获取 |
| conditions | Condition[] | N | 按条件获取第一条 |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 查询 `skill` 表；
2. 将数据库行转换为 SkillRecord（含 FileEntry 反序列化）；
3. 返回第一条匹配记录，若无匹配返回空；

**返回**：Boolean，表示查询是否完成；Skill 信息通过 output 参数返回

#### 3.1.3. 更新 Skill（updateSkill）

**功能**：更新指定的 Skill，支持按 ID 或按条件更新

**方法签名**：`Boolean updateSkill(UpdateSkillInput input, SkillContext context, UpdateSkillOutput output)`

**入参（UpdateSkillInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 更新 |
| conditions | Condition[] | N | 按条件更新 |
| data | Partial\<SkillData\> | Y | 待更新的字段 |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 更新 `skill` 表；
2. 仅更新传入的非空字段（Partial<SkillData>）；
3. FileEntry[] 字段通过 JSON 序列化后存入；
4. 更新 `updated` 为当前时间戳；

> 注：资源级启用/禁用通过本方法修改 `enable` 字段实现。

**返回**：Boolean，表示更新是否完成；影响行数通过 output 参数返回

#### 3.1.4. 删除 Skill（delSkill）

**功能**：删除指定的 Skill，支持按 ID 批量删除或按条件删除

**方法签名**：`Boolean delSkill(DelSkillInput input, SkillContext context, DelSkillOutput output)`

**入参（DelSkillInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| ids | STRING[] | N | 按 ID 删除（支持批量） |
| conditions | Condition[] | N | 按条件删除 |

> ids 与 conditions 至少传一个

**处理流程**：

1. 根据 ids 或 conditions，通过 RelationDBProvider 从 `skill` 表中删除记录；
2. 清理 `skill_usage` 表中引用该 Skill 的记录（`skill_id` 命中）；
3. 影响行数通过 output 参数返回；

**返回**：Boolean，表示删除是否完成；影响行数通过 output 参数返回

#### 3.1.5. 搜索 Skill（soSkill）

**功能**：搜索 Skill，支持关键词、条件过滤、排序、分页

**方法签名**：`Boolean soSkill(SoSkillInput input, SkillContext context, SoSkillOutput output)`

**入参（SoSkillInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| keyword | STRING | N | 关键词搜索（匹配 skill_brief） |
| conditions | Condition[] | N | 条件过滤 |
| order_by | OrderBy[] | N | 排序规则（支持按时间、按使用频率排序，使用频率需联表查询 `skill_usage`） |
| page | Page | N | 分页参数 |

> Condition、OrderBy、Page 为公共查询对象，定义于 `RelationDBProvider-PRD.md`。

**处理流程**：

1. 根据 keyword、conditions 构造查询，通过 RelationDBProvider 查询 `skill` 表；
2. 若按使用频率排序，联表查询 `skill_usage` 统计表；
3. 按 order_by 排序，按 page 分页返回结果；

**返回**：Boolean，表示查询是否完成；Skill 列表及总数通过 output 参数返回

### 3.2. Skill 执行

#### 3.2.1. 执行 Skill（execSkill）

**功能**：在沙箱中执行指定 Skill 的 scripts/ 脚本文件。

**方法签名**：`Boolean execSkill(ExecSkillInput input, SkillContext context, ExecSkillOutput output)`

**入参（ExecSkillInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | Skill ID |
| params | JSON | Y | Skill 执行所需的参数 |

**处理流程**：

1. 根据 ID 获取 Skill 信息，校验存在性与启用状态；
2. 校验 scripts/ 非空；
3. 按顺序遍历 scripts/ 中的文件，根据文件扩展名分派到对应沙箱执行：
   - `.js` / `.mjs` → IsolatedVMSandbox（独立 V8 Isolate，128MB 内存限制，5s 超时，无 IO）
   - `.py` / `.py3` → LocalSandbox（独立临时目录子进程，15s 超时，1MB stdout）
   - `.sh` / `.bash` → LocalSandbox（同上）
4. 返回最后一个脚本的执行结果；
5. 执行成功后更新 `skill_usage` 表当天的 usage_count + 1；

**参数传递**：
- JS 沙箱：`params` 作为全局变量注入（`params.xxx`）
- Python/Bash 沙箱：通过环境变量 `SKILL_PARAM_{KEY}` 注入

**注意**：SKILL.md (skill_md) 是给 LLM 阅读的指令文档，**不参与执行**。

**返回**：Boolean，表示执行是否完成；执行结果通过 output 参数返回

### 3.3. 可视化与运维

#### 3.3.1. 启用/禁用（enableSkill）

**功能**：启用或禁用 Skill 组件，用于运行时控制 Skill 组件的可用状态

**方法签名**：`Boolean enableSkill(EnableSkillInput input, SkillContext context, EnableSkillOutput output)`

**入参（EnableSkillInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| enable | BOOLEAN | Y | 是否启用 |

**处理流程**：

1. 根据 `enable` 参数启用或禁用 Skill 组件，并将 `enabled` 状态持久化到关系数据库配置表 skill_config（库名 `skill`）；
2. 禁用时关闭沙箱执行环境，释放资源，将 skill_config 中 `enabled` 置为 false；禁用期间所有 Skill 操作将返回失败（Skill 组件未启用）；
3. 启用时恢复可用状态，将 skill_config 中 `enabled` 置为 true；

**返回**：Boolean，表示操作是否完成

> 注：组件初始化时从 skill_config 读取 `enabled` 状态以恢复上次的可用状态。

## 4. 表设计

> Skill 数据表存储在关系数据库（SQLite）中，逻辑库名为 `skill`；
> SkillProvider 用到的所有配置项存储在关系数据库配置表 skill_config 中（库名 `skill`）。
>
> 所有表均包含 id、created、updated 三个标准系统字段，由 Provider 维护。

### 4.1. skill 表（关系数据库）

- `表名`： skill
- `库名`： skill
- `存储`： 关系数据库（由 RelationDBProvider 管理）

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| name | Skill 简短名称 | TEXT | N | | ≤10 字符，前端展示用 |
| skill_brief | Skill 简述 | TEXT | N | 普通索引 | LLM 匹配筛选用 |
| skill_md | SKILL.md 全文 | TEXT | N | | Markdown 格式，LLM 匹配核心线索 |
| scripts | 脚本目录文件 | TEXT | Y | | JSON 格式 FileEntry[] |
| references | 参考文档目录文件 | TEXT | Y | | JSON 格式 FileEntry[] |
| assets | 静态资源目录文件 | TEXT | Y | | JSON 格式 FileEntry[] |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |

### 4.2. skill_usage 表（关系数据库）

- `表名`： skill_usage
- `库名`： skill
- `存储`： 关系数据库（由 RelationDBProvider 管理）

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| skill_id | Skill ID | STRING | N | 普通索引 | 关联 skill.id |
| usage_date | 使用日期 | STRING | N | 普通索引 | 格式：YYYY-MM-DD |
| usage_count | 当日使用次数 | INT | N | | 默认 0 |

> 重要：仅当 `execSkill` 成功调用时，当天的 usage_count 才会加 1。

### 4.3. SkillProvider 配置表（关系数据库）

- `表名`： skill_config
- `库名`： skill
- `存储`： 关系数据库（由 RelationDBProvider 管理）

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| config_key | 配置键 | STRING | N | 主键 | 唯一 |
| config_value | 配置值 | STRING | N | | 按 value_type 解析 |
| value_type | 值类型 | STRING | N | | INT / DOUBLE / BOOLEAN / STRING |
| description | 说明 | STRING | Y | | |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |

默认配置项：

| config_key | config_value | value_type | description |
| ------ | ----- | ----- | ----- |
| enabled | true | BOOLEAN | Skill 组件是否启用（enableSkill 读写） |

## 5. 沙箱

提供双沙箱执行环境，覆盖 PRD 中的 multi-sandbox 需求：

| 沙箱 | 适用脚本 | 实现技术 | 隔离特性 |
|------|---------|---------|---------|
| IsolatedVMSandbox | .js / .mjs | isolated-vm (C++ 原生扩展) | 独立 V8 Isolate，128MB 内存限制，5s 超时，无文件系统/网络/模块访问，console 抑制 |
| LocalSandbox | .py / .sh | Node.js child_process | 独立临时工作目录（执行后销毁），15s 超时，1MB stdout 限制，params 通过环境变量 SKILL_PARAM_* 传入 |

### IsolatedVMSandbox

- 基于 isolated-vm，提供真正的 V8 进程级隔离；
- 每次执行创建新 Context，执行完毕后释放；
- memoryLimit 默认 128MB；
- JavaScript 代码中的 `result` 变量回传执行结果；
- 注入 `var console={log:function(){}}` 避免沙箱输出污染主进程；
- **全平台可用（2026-09-07 起）**：原生模块加载顺序为 `BRIAN_NATIVE_DIR`（SEA 打包）→ `prebuilt/{platform}-{arch}/node{abi}/` → `prebuilt/{platform}-{arch}/` → `out/`；当以上路径均无与当前平台（OS + arch + ABI）匹配的二进制时，自动从源码编译兜底——node-gyp 三级解析（仓库 node_modules → 全局 PATH → `npx --yes node-gyp` 在线获取，便携包自带 Node 运行时必有 npx），Win / macOS / Linux 三平台均可获得可用的沙箱服务，**不再存在"缺失降级"路径**（编译需 C/C++ 工具链与 Python 3，首次编译需联网下载 Node 头文件，编译产物缓存后离线可用；加载失败直接抛错 fail-fast）。
  - 平台事实说明：上游 isolated-vm 全部 Release（v4.6.0 → v6.0.2）从未发布过 darwin-x64 的 Node 22 (ABI 127) 预编译包；v4.x 的 darwin-x64（ABI 93/108/115）与本仓库 Node 22 物理不兼容（V8 直接绑定、非 N-API），**不可降级使用旧版预编译**；v5.0.4 源码官方支持 darwin-x64（binding.gyp `MACOSX_DEPLOYMENT_TARGET=10.12`），源码编译即上游官方路径。`brian-backend/scripts/build-isolated-vm.js` 可在对应平台一键产出预编译并提交入库。

### LocalSandbox

- **沙箱运行时契约（2026-09-22 起生效，decisions.md 同日登记）**：python/bash 解释器是**硬性部署前置条件**，由 `SandboxRuntime.resolveSandboxRuntime` 在 SkillService 构造期按平台规范定位并做 `--version` 校验，结果注入 LocalSandbox——执行路径零平台分支、零运行时试错、零降级：
  - Python：POSIX → `python3`；win32 → `py -3` → `python`（同一解释器的平台规范名/安装别名，属**定位**而非兜底）；版本校验必须为 Python 3.x；
  - Bash：POSIX → `bash`；win32 → Git Bash 标准安装点（Program Files / LOCALAPPDATA）→ PATH，**显式拒绝 WSL shim**（`System32\bash.exe` 的 cwd/env 翻译语义与沙箱契约不兼容）；**Windows 部署前置 = Git for Windows**；
  - 部署旋钮：`BRIAN_SANDBOX_PYTHON` / `BRIAN_SANDBOX_BASH` 环境变量指定即**唯一候选**（不落回自动定位），指向错误即启动失败；
  - **fail-fast**：任一解释器缺失/版本不符 → `SandboxRuntimeError` → SkillService 构造失败 → 后端拒绝启动，错误信息含该平台的精确修复指引；不存在任何"无沙箱降级执行"路径；
  - LocalSandbox 附带超时判定按 Node 语义（`killed/signal`）识别——修复了原 `ETIMEDOUT` 字符串匹配在 POSIX 上恒不生效、超时文案从未产出的问题。
- 基于 child_process.execSync，在独立临时目录中执行；
- 不依赖 Docker / chroot，适用于开发和轻量部署场景；
- 工作目录：`/tmp/skill-sandbox-{uuid}/`，执行后通过 rmSync 销毁；
- cwd 限定在工作目录内；
- 参数通过环境变量 SKILL_PARAM_* 注入，子进程通过 process.env / os.environ 读取；
- 脚本退出码非 0 时仍返回其 stdout，保留脚本打印的业务错误信息（如「缺少关键词」）；
- 执行超时（killed/signal）或进程被杀且无输出时，返回明确的「执行超时」错误信息，不吞成空串。

> 与 IsolatedVMSandbox 的加载链边界：isolated-vm 的「预编译缺失 → 源码编译」同样不是降级——编译产物提供**同等的 V8 隔离能力**，只是构建方式不同；两者共同满足"危险命令必须在沙箱中完成，无降级"的产品约束。

## 6. 重要内容

1. SkillProvider 是 Skill 的唯一操作入口，上层不可直接操作数据库；
2. SkillProvider 通过 Repository 设计模式封装 Skill 操作，所有对 Skill 的操作都通过 SkillProvider 进行；
3. Skill 由 name（名称）、skill_brief（简述）、skill_md（SKILL.md 全文）、scripts/、references/、assets/ 六部分组成；
4. `skill_md` 是 LLM 筛选 Skill 能否完成指定工作的核心线索，匹配时发给模型；
5. `execSkill` 执行的是 scripts/ 中的脚本文件，SKILL.md 是给 LLM 的指令文档——不参与执行；
6. 所有脚本均在沙箱中执行：.js → IsolatedVMSandbox，.py/.sh → LocalSandbox；
7. 资源级 Skill 启用/禁用通过 `updateSkill` 修改 `enable` 字段实现，不再单独提供资源级 enableSkill 方法；
8. SkillProvider 用到的所有配置项统一存储于 skill_config 表中；
9. enableSkill 的启用/禁用状态在组件初始化时恢复，避免状态丢失；
10. 所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 7. 变更记录

### [2026-08-15] LocalSandbox 错误信息保留 + 前端 Skill 测试功能

**变更原因**：`execSkill` 执行 Python/Bash 脚本时，脚本退出码非 0 或超时会导致 `execSync` 抛错，脚本打印的错误信息丢失（前端只见「Command failed」或空白）；前端 Skill 卡片缺少测试入口。

**修改的方法**：
- `LocalSandbox.execute()` — 原始代码：`execSync` 抛错即向上传播，脚本 stdout 丢失；改为：捕获非 0 退出码的 stdout（保留业务错误信息），超时/无输出时返回「执行超时（15s）」明确错误。
- 前端 Skill 卡片：卡片尺寸与 MCP 实例统一；去掉「编辑」按钮，点击卡片进入编辑弹窗；新增「测试」按钮，打开测试弹窗（输入 JSON 参数 → 执行 → 展示结果）。
- 删除测试「初始化后应写入默认配置 enabled=true」（该行为在移除硬编码种子数据时已删除，测试未同步）。

**影响的端点**：
- `POST /api/skill/{id}/exec` — 错误信息现在能正确返回（脚本错误 / 执行超时）。

**可能存在的问题**：
- 内置「网页搜索」Skill 依赖外网访问 DuckDuckGo，无外网环境下会返回「Network is unreachable」错误（环境限制，非代码问题）。
