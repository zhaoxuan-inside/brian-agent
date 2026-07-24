# Soul Core

## 1. 设计目标

1. 根据工作为Agent匹配最佳的Soul；
2. 推动Soul的自动优化；

## 2. 功能设计

### 2.1. 匹配Soul（matchSoul）

**功能**：生成处理工作所需要的Soul
**入参**：agent_id,context_id,interact_id
**处理流程**：

1. 通过agent_id调用RelationProvider查询agent_soul表中Agent绑定的soul_id；
2. 如果绑定了Soul，则以soul_core_config表中的regen_rate的概率直接返回绑定的soul_id；否则执行下面流程
3. 根据context_id和agent_id调用AgentCore获取到当前要处理的工作内容，调用SoulProvider的matchSoul接口，根据工作匹配一个最佳的Soul的ID进行返回；

### 2.2. 自动优化任务（optSoul）

**功能**：优化Soul
**入参**：agent_id,context_id,interact_id,soul_id

1. 通过agent_id调用RelationProvider查询agent_soul表中Agent绑定的SoulId；
2. 判断入参中的soul_id是否是Agent绑定的SoulId，是：直接返回；否则继续执行下面的流程；
3. 根据interact_id调用AgentCore获取当前工作的内容；
4. 根据入参的soul_id和与Agent绑定的soul_id,调用SoulProvider分别获取到Soul_A,Soul_B;
5. 调用RelationProvider获取soul_core_config中配置的 prompt_template_id；
6. 根据工作内容，Soul_A和Soul_B调用 PromptsProvider 构建 prompt；
7. 调用 LLMProvider 判断Soul_A还是Soul_B更优，根据模型返回的A或者B更新soul_id到agent_id对应的soul_id中；

### 2.3. 配置（configSoulCore）

支持配置多大的概率重新选择Soul，支持配置模板prompt

## 3. 表设计

### 3.1. SoulCore配置表

- 表名：soul_core_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| regen_rate | 重新生成Soul的概率 | INTEGER | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |

### 3.2. AgentSoul关联表

- 表名：agent_soul
- 库名：soul

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | AgentId | UUID | N | 唯一索引 | |
| soul_id | 绑定的SoulId | UUID | N | | |
