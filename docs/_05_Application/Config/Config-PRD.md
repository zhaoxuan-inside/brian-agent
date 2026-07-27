# Config Application

## 1. 设计目标

1. 管理系统所有配置项的可见性和可修改权限（哪些配置可查看、哪些可修改、哪些不可见不可改）；
2. 提供统一的配置注册机制，各模块通过注册声明自己的配置项及权限；
3. 管理 LLM 提供商和模型的配置（增删改查、连接测试、模型同步）；
4. 管理 MCP、Soul、Work 等组件的配置；
5. 管理系统速率限制配置；

## 2. 功能设计

### 2.1. 配置注册（registerConfig）

**功能**：接收来自各模块的配置注册，声明配置项及其读写权限

**入参**：
- layer_id：分层ID
- layer_title：分层名
- layer_desc：分层描述
- model_id：分层中的模块ID
- model_title：分层中的模块名
- model_desc：分层中的模块描述
- model_config_id：模块的一种配置类型的ID
- model_config_title：模块的一种配置类型名
- model_config_desc：模块的一种配置类型描述
- config_id：具体的一个配置ID
- config_title：具体的一个配置名
- config_desc：具体的一个配置的描述
- readable：是否可读（BOOLEAN）
- writeable：是否可修改（BOOLEAN）
- context：配置上下文

**处理流程**：

1. 通过 RelationDBProvider 向 `config_privilege` 表插入配置注册记录；

**返回**：Boolean，表示注册是否完成

### 2.2. 获取配置权限（getConfigPrivilege）

**功能**：按分层查询配置的权限（整层权限聚合）

**入参**：
- layer_id（可选）
- model_id（可选）
- model_config_id（可选）
- config_id（可选）
- context：查询上下文

**处理流程**：

1. 根据入参中非空的 ID 作为条件通过 RelationDBProvider 获取配置的读写权限；
2. 如果存在可写的配置则整层为可读写层，如果存在可读的配置则整层作为可读层，否则为不可读写；

**返回**：Boolean，表示查询是否完成；权限信息通过 output 参数返回

### 2.3. 获取配置权限详情（getConfigDetail）

**功能**：查询详细的配置权限

**入参**：
- layer_id（可选）
- model_id（可选）
- model_config_id（可选）
- config_id（可选）
- context：查询上下文

**处理流程**：

1. 根据入参中的 ID 作为条件通过 RelationDBProvider 获取 `config_privilege` 表的数据包括所有的业务字段；

**返回**：Boolean，表示查询是否完成；配置详情列表通过 output 参数返回

### 2.4. 更新配置权限（updateConfigPrivilege）

**功能**：更新指定配置的权限

**入参**：
- config_id：配置ID
- readable：是否可读（BOOLEAN）
- writeable：是否可写（BOOLEAN）
- context：配置上下文

**处理流程**：

1. 根据 `config_id` 调用 RelationDBProvider 更新 `config_privilege` 表中指定配置的 `readable` 和 `writeable` 字段；

**返回**：Boolean，表示更新是否完成

### 2.5. 管理LLM提供商配置（manageLLMProvider）

**功能**：管理 LLM 提供商的配置（新增、删除、更新、测试连接、获取可用模型）

**入参**：
- action：操作类型（add / delete / update / test / fetchModels）
- provider_config：提供商配置（url, title, brief, apiKey, enable 等）
- context：配置上下文

**处理流程**：

1. 根据 `action` 执行对应操作：
   - add：通过 RelationDBProvider 向 `llm_provider` 表插入提供商配置；
   - delete：删除指定提供商配置；
   - update：更新提供商配置；
   - test：测试提供商连接是否可用；
   - fetchModels：从提供商获取可用模型列表；

**返回**：Boolean，表示操作是否完成；操作结果通过 output 参数返回

### 2.6. 管理LLM模型配置（manageLLMModel）

**功能**：管理 LLM 模型的配置（启用/禁用、设置默认、批量同步、测试）

**入参**：
- action：操作类型（enable / disable / setDefault / batchSync / test）
- model_config：模型配置
- context：配置上下文

**处理流程**：

1. 根据 `action` 执行对应操作；
2. 操作结果持久化到 `llm_config` 表；

**返回**：Boolean，表示操作是否完成

### 2.7. 管理速率限制（manageRateLimit）

**功能**：管理系统的速率限制配置

**入参**：
- action：操作类型（get / update）
- rate_limit_config：速率限制配置
- context：配置上下文

**处理流程**：

1. 根据 `action` 获取或更新速率限制配置；

**返回**：Boolean，表示操作是否完成

## 3. 表设计

### 3.1. 配置权限表

- 表名：`config_privilege`
- 库名：`config`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| layer_id | 分层ID | UUID | N | 普通索引 | |
| layer_title | 层名 | VARCHAR | N | | |
| layer_desc | 层描述 | TEXT | Y | | |
| model_id | 模块ID | UUID | N | 普通索引 | |
| model_title | 模块名 | VARCHAR | N | | |
| model_desc | 模块描述 | TEXT | Y | | |
| model_config_id | 模块配置类型ID | UUID | N | 普通索引 | |
| model_config_title | 模块配置类型名 | VARCHAR | N | | |
| model_config_desc | 模块配置类型描述 | TEXT | Y | | |
| config_id | 具体配置ID | UUID | N | 普通索引 | |
| config_title | 具体配置名 | VARCHAR | N | | |
| config_desc | 具体配置描述 | TEXT | Y | | |
| readable | 是否可读 | BOOLEAN | N | | 默认 true |
| writeable | 是否可写 | BOOLEAN | N | | 默认 false |

## 4. 重要内容

1. 配置权限管理是 Config 应用的核心功能，通过分层（layer -> model -> model_config -> config）四级结构管理配置的可见性和可修改性；
2. LLM 提供商和模型的配置管理是 Config 应用的扩展功能，为系统提供统一的模型配置入口；
3. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
