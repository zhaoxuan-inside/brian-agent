# 名词标准化

`msg_id`：消息ID，用户输入，或者Agent输出等都认为是一条独立的消息；
`interact_id`：交互ID，表示一次输入和输出消息，包含一个或多个msg_id；
`work_id`：工作ID，表示一次完整的工作ID，用户或者学习等一次输入经过整个Agent系统所有的消息的集合，包含一个或多个interact_id；
`session_id`：用户的一个会话中的内容，包含一个或多个work_id;
`soul`：来自hermes的概念，作为prompt的开头部分，用来作为处理一类工具应该具有的品格；

`provider`：Provider，通过 Repository 设计模式封装底层资源操作的统一入口，解耦具体资源与系统；Base 层包含 RelationDBProvider、GraphDBProvider、VectorDBProvider、LLMProvider、MCPProvider、MQProvider、PromptsProvider、SkillProvider、SoulProvider 共 9 个 Provider；
`repository`：仓储，DDD 中的概念，封装数据访问的接口层，由 infrastructure 层提供具体实现；
`context`：上下文，方法执行的环境信息，继承 Context 基类；与 input（输入参数）、output（返回内容）共同构成方法签名 `Boolean method(Input input, Context context, Output output)`；
`input`：输入参数对象，继承 Input 基类，封装方法调用的输入参数；
`output`：输出参数对象，继承 Output 基类，通过引用传递回传方法的执行结果；
`aop`：面向切面编程（Aspect-Oriented Programming），通过代理模式为方法注入日志记录、耗时统计等横切关注点；
`condition`：查询条件对象，用于 WHERE 条件构造，包含 field、operator、value、logic 字段；operator 支持 EQ/NE/GT/LT/GE/LE/LIKE/IN/NOT_IN/IS_NULL/IS_NOT_NULL/BETWEEN；
`dataobject`：数据对象，以键值对形式描述字段名与字段值，用于新增和更新操作；
`llm`：大语言模型（Large Language Model），LLMProvider 管理提供商与模型的 CRUD 及推理调用；
`mcp`：Model Context Protocol，MCPProvider 管理提供商与 MCP 的安装、启停、卸载及调用；
`mq`：消息队列（Message Queue），MQProvider 基于关系数据库实现，负责消息的发送、消费、确认、否认；
`prompt_template`：Prompt 模板，PromptsProvider 管理 Markdown 格式模板的 CRUD 与变量替换渲染；
`skill`：技能，由 brief（元数据）、work（操作指南）、scripts、references、assets 五部分组成，SkillProvider 管理其 CRUD 与沙箱执行；
`graph_node`：图节点，GraphDBProvider 中的节点数据，包含 node_type 和 content；
`graph_edge`：图边，GraphDBProvider 中的关系数据，包含 edge_type、weight、from_node_id、to_node_id，具有激活与老化生命周期；
`vector`：向量，VectorDBProvider 中的向量记录，包含 content、embedding、user_id、metadata，支持余弦相似性搜索；
`embedding`：嵌入向量，由文本经 Embedding 模型转换得到的浮点数组，用于向量相似性检索；
`activation`：激活，GraphDBProvider 中边的生命周期概念，记录激活事件并按天累计激活次数，用于维护边的权重与活跃度；
`aging`：老化，GraphDBProvider 中基于保留窗口内激活数量判定边是否需要标记为非激活状态的机制；
`sandbox`：沙箱，隔离的代码执行环境，SkillProvider 使用 Node.js vm 模块实现沙箱执行；
`upsert`：存在则更新、不存在则新增的写入语义，各 Provider 的按天使用统计表（如 xxx_usage）均采用此语义维护当日计数；