# Gateway Application

## 1. 设计目标

1. 支持 IM（即时通讯）接入的网关，允许用户通过 IM 工具与系统交互；
2. 对接不同 IM 平台（微信、钉钉、Telegram 等），屏蔽平台差异，对外提供统一的消息处理接口；
3. 实现消息协议转换，将 IM 平台的消息格式转换为系统内部统一格式；
4. 提供 Webhook 接入能力，支持 IM 平台的消息推送回调；
5. 支持消息去重，避免重复处理；

## 2. 功能设计

### 2.1. 接收网关消息（receiveGatewayMessage）

**功能**：接收来自 IM 平台的消息推送（Webhook 回调），转换为系统内部格式后转发给 Chat 应用

**入参**：
- platform：IM 平台标识（wechat / dingtalk / telegram 等）
- raw_message：IM 平台的原始消息内容（JSON 格式）
- signature：平台签名（用于验证消息来源）
- context：网关上下文

**处理流程**：

1. 根据 `platform` 选择对应的消息适配器；
2. 验证 `signature` 的合法性，确保消息来源可信；
3. 将 `raw_message` 转换为系统内部统一的消息格式（提取 content, sender, timestamp 等）；
4. 消息去重：根据平台消息 ID 检查是否已处理过，若已处理则跳过；
5. 调用 Chat 应用的 submitWork 接口，将转换后的消息提交给系统处理；
6. 将系统处理结果通过平台适配器转换为 IM 平台的回复格式，返回给 IM 平台；

**返回**：Boolean，表示消息处理是否完成

### 2.2. 注册平台（registerPlatform）

**功能**：注册 IM 平台适配器配置

**入参**：
- platform：IM 平台标识
- platform_config：平台配置（app_id, app_secret, webhook_url, token 等）
- context：配置上下文

**处理流程**：

1. 通过 RelationDBProvider 向 `gateway_platform_config` 表插入平台配置记录；
2. 初始化对应平台的适配器实例；

**返回**：Boolean，表示注册是否完成

### 2.3. 注销平台（unregisterPlatform）

**功能**：注销 IM 平台适配器配置

**入参**：
- platform：IM 平台标识
- context：配置上下文

**处理流程**：

1. 通过 RelationDBProvider 删除 `gateway_platform_config` 表中指定平台的记录；
2. 销毁对应平台的适配器实例；

**返回**：Boolean，表示注销是否完成

### 2.4. 搜索平台配置（searchPlatform）

**功能**：搜索已注册的 IM 平台配置

**入参**：
- keyword：搜索关键词
- context：查询上下文

**处理流程**：

1. 通过 RelationDBProvider 关键词搜索 `gateway_platform_config` 表；

**返回**：Boolean，表示搜索是否完成；平台配置列表通过 output 参数返回

### 2.5. 网关健康检查（checkGatewayHealth）

**功能**：检查网关及已注册平台的健康状态

**入参**：
- context：检查上下文

**处理流程**：

1. 检查所有已注册平台的适配器状态；
2. 检查 Webhook 端点是否可访问；
3. 返回各平台的健康状态；

**返回**：Boolean，表示检查是否完成；健康状态信息通过 output 参数返回

## 3. 表设计

### 3.1. 网关平台配置表

- 表名：`gateway_platform_config`
- 库名：`gateway`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| platform | IM平台标识 | VARCHAR | N | 唯一索引 | wechat / dingtalk / telegram |
| platform_title | 平台名称 | VARCHAR | N | | |
| platform_config | 平台配置 | JSON | N | | app_id, app_secret, webhook_url, token 等 |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |

### 3.2. 网关消息记录表

- 表名：`gateway_message_log`
- 库名：`gateway`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| platform | IM平台标识 | VARCHAR | N | 普通索引 | |
| platform_msg_id | 平台消息ID | VARCHAR | N | 唯一索引 | 用于消息去重 |
| session_id | 会话ID | UUID | Y | 普通索引 | 关联 session 表 |
| msg_id | 系统消息ID | UUID | Y | 普通索引 | 关联系统消息表 |
| msg_content | 消息内容 | TEXT | N | | |
| msg_direction | 消息方向 | VARCHAR | N | | INBOUND / OUTBOUND |
| process_status | 处理状态 | VARCHAR | N | | PENDING / SUCCESS / FAILED |

## 4. 平台适配器设计

### 4.1. 统一适配器接口

每个 IM 平台适配器需实现以下统一接口：

- **parseMessage**：将平台原始消息解析为系统内部格式
- **formatReply**：将系统回复格式化为平台所需格式
- **verifySignature**：验证平台消息签名
- **sendMessage**：主动向平台发送消息（非 Webhook 回复场景）

### 4.2. 支持的平台

| 平台 | 标识 | 接入方式 | 备注 |
|------|------|---------|------|
| 微信 | wechat | 公众号 Webhook | 支持文本、图文消息 |
| 钉钉 | dingtalk | 机器人 Webhook | 支持文本、Markdown 消息 |
| Telegram | telegram | Bot API | 支持文本、富文本消息 |

## 5. 重要内容

1. 网关层仅负责消息接收、格式转换和转发，不涉及业务逻辑处理；
2. 消息去重通过 `gateway_message_log` 表的 `platform_msg_id` 唯一索引实现；
3. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
4. 平台适配器采用策略模式，新增平台只需实现统一适配器接口；
