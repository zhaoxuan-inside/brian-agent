# Skill Core

## 1. 设计目标

1. 根据工作为Agent匹配最佳的Skill；
2. 推动Skill的自动优化；

## 2. 功能设计

### 2.1. 匹配Skill（matchSkill）

**功能**：生成处理工作所需要的Skill
**入参**：agent_id,context_id,interact_id
**处理流程**：

1. 通过agent_id调用RelationProvider查询agent_skill表中Agent绑定的SkillId列表；
2. 如果绑定了Skill，则以skill_core_config表中的regen_rate的概率直接返回绑定的SkillId列表；否则执行下面流程
3. 根据context_id和agent_id调用AgentCore获取到当前要处理的工作内容，调用SkillProvider的matchSkill接口，根据工作匹配一个最佳的Skill的ID进行返回；

### 2.2. 自动优化任务（optSkill）

**功能**：优化Skill
**入参**：agent_id,context_id,interact_id,skill_id

1. 通过agent_id调用RelationProvider查询agent_skill表中Agent绑定的SkillId列表；
2. 判断入参中的skill_id是否存在于SkillId列表中，若存在直接返回；否则继续执行下面的流程；
3. 调用RelationDBProvider将新增一条skill_id和agent_id关联数据；

### 2.3. 配置（configSkillCore）

支持配置多大的概率重新选择Skill，支持配置模板prompt

## 3. 表设计

### 3.1. SkillCore配置表

- 表名：skill_core_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| regen_rate | 重新生成Skill的概率 | INTEGER | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |

### 3.2. AgentSkill关联表

- 表名：agent_skill
- 库名：skill

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | AgentId | UUID | N | 普通索引 | |
| skill_id | 绑定的skillId | UUID | N | | |

重要：agent_id + skill_id 构成联合唯一索引
