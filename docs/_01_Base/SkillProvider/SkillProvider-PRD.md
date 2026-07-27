# Skill Provider

Skill 分为如下部分：

```text
custom-skill/
├── brief             # (必需) Skill 的元数据，表明 Skill 的应用场景
├── work              # (必需) Skill 的操作指南，指明这个 Skill 怎么完成指定应用场景的工作
├── scripts/          # (可选) 存放可执行脚本（如 Python、Shell 等）
├── references/       # (可选) 存放深度参考资料（如 Markdown 文档、决策表等）
└── assets/           # (可选) 存放静态资源（如图片、模板文件等）
```

## 1. 设计目标

1. 解耦 Skill 和系统，通过 Repository 设计模式为上层提供统一的 Skill 操作接口；
2. 所有对 Skill 的操作都不能直接进行，都必须要通过 SkillProvider；
3. 负责 Skill 的 CRUD 操作；
4. 接收 Skill 执行请求，在沙箱中完成执行并将结果返回；
5. 提供可视化数据接口，支持 Skill 服务健康状态监控；
6. Skill 组件默认集成沙箱执行环境；
7. SkillProvider 用到的所有配置项统一存储在关系数据库配置表中；

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`。
> Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不再重复定义。

### 2.1. Skill 上下文（SkillContext）

继承 Context 基类，Skill 相关操作的执行上下文。

### 2.2. Skill 数据对象（SkillData）

用于新增 Skill；更新 Skill 时使用 `Partial<SkillData>` 仅传入待更新字段。Skill `id`、`created`、`updated` 为系统字段，由 Provider 维护，不通过 Data 对象传入。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| skill_brief | STRING | Y | Skill 元数据（应用场景） |
| work | STRING | Y | Skill 操作指南 |
| scripts | STRING | N | 脚本存放路径 |
| references | STRING | N | 深度参考资料存放路径 |
| assets | STRING | N | 静态资源存放路径 |
| enable | BOOLEAN | N | 是否启用，默认 true（资源级启用 / 禁用，通过 updateSkill 修改） |

## 3. 功能设计

### 3.1. Skill 管理

#### 3.1.1. 新增 Skill（addSkill）

**功能**：新增一个 Skill

**方法签名**：`Boolean addSkill(AddSkillInput input, SkillContext context, AddSkillOutput output)`

**入参（AddSkillInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | SkillData | Y | Skill 数据 |

**处理流程**：

1. 接收 Skill 数据（skill_brief、work、scripts、references、assets），通过 RelationDBProvider 写入 `skill` 表；
2. 生成 Skill 唯一 id；
3. 初始化系统字段 `created`、`updated` 为当前时间戳；
4. Skill id 通过 output 参数返回；

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
2. 返回第一条匹配记录，若无匹配返回空；

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
2. 更新 `updated` 为当前时间戳；

> 注：资源级启用 / 禁用通过本方法修改 `enable` 字段实现，不再单独提供资源级 enableSkill 方法。

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
2. 若按使用频率排序，联表查询 `skill_usage` 统计表（今日使用次数、最近 7 天使用次数、最近 30 天使用次数）；
3. 按 order_by 排序，按 page 分页返回结果；

**返回**：Boolean，表示查询是否完成；Skill 列表及总数通过 output 参数返回

### 3.2. Skill 执行

#### 3.2.1. 执行 Skill（execSkill）

**功能**：在沙箱中执行指定的 Skill

**方法签名**：`Boolean execSkill(ExecSkillInput input, SkillContext context, ExecSkillOutput output)`

**入参（ExecSkillInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | Skill ID |
| params | JSON | Y | Skill 执行所需的参数 |

**处理流程**：

1. 根据 ID 获取 Skill 信息；
2. 在沙箱中完成 Skill 的执行；
3. 执行成功后，通过 RelationDBProvider 更新 `skill_usage` 表当天的 usage_count + 1；

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
3. 启用时重新初始化沙箱执行环境，恢复可用状态，将 skill_config 中 `enabled` 置为 true；

**返回**：Boolean，表示操作是否完成

> 注：组件初始化时从 skill_config 读取 `enabled` 状态以恢复上次的可用状态（如上次为禁用则保持禁用，避免状态丢失）；运行时内存中维护 `enabled` 状态供各操作快速校验，状态变更同步落库。

## 4. 表设计

> Skill 数据表（4.1 ~ 4.2）存储在关系数据库（SQLite）中，逻辑库名为 `skill`；SkillProvider 用到的所有配置项（含 Skill 组件启用 / 禁用状态）存储在关系数据库配置表 skill_config 中（库名 `skill`，见 4.3）。
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
| skill_brief | Skill 元数据 | TEXT | N | 普通索引 | 表明应用场景 |
| work | Skill 操作指南 | TEXT | N | | |
| scripts | 脚本存放路径 | TEXT | Y | | |
| references | 深度参考资料存放路径 | TEXT | Y | | |
| assets | 静态资源存放路径 | TEXT | Y | | |
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

> 重要：仅当 `execSkill`（执行 Skill）成功调用时，当天的 usage_count 才会加 1。

### 4.3. SkillProvider 配置表（关系数据库）

- `表名`： skill_config
- `库名`： skill
- `存储`： 关系数据库（由 RelationDBProvider 管理）
- `表类型`： 关系表

> SkillProvider 用到的所有配置项集中存储于关系数据库（库名 `skill`），采用键值对结构，运行时按需读取；Skill 组件启用 / 禁用状态由 enableSkill 读取并持久化，避免硬编码与状态丢失。

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

提供多级沙箱工具，可以参考 Hermes 的源码。
目前选型为 local + node:vm 这两个沙箱。

## 6. 重要内容

1. SkillProvider 是 Skill 的唯一操作入口，上层不可直接操作数据库；
2. SkillProvider 通过 Repository 设计模式封装 Skill 操作，所有对 Skill 的操作都通过 SkillProvider 进行；
3. Skill 由 brief（元数据）、work（操作指南）、scripts、references、assets 五部分组成；
4. `execSkill` 在沙箱中执行，确保安全性；
5. 资源级 Skill 启用 / 禁用通过 `updateSkill` 修改 `enable` 字段实现，不再单独提供资源级 enableSkill 方法；
6. SkillProvider 用到的所有配置项（含 Skill 组件启用 / 禁用状态 `enabled`）统一存储于关系数据库配置表 skill_config（库名 `skill`，见 4.3），运行时按需读取；enableSkill 的启用 / 禁用状态同步持久化，组件初始化时恢复，避免状态丢失；
7. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
