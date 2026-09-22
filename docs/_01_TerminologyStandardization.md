# 名词标准化

`msg_id`：消息ID，用户输入，或者Agent输出等都认为是一条独立的消息；统一标识为 `msg_id`（2026-09-22 裁决：SSE 协议字段、领域引用字段（selected_msg_ids/citing_msg_ids）、runtime_message_part 外键列全部统一；聊天消息概念禁用同义词 `message_id`）；
`message_id`：队列消息ID，MQ 消息队列中信封实体的标识（MQService/MQCoreService 域专有）；与聊天消息 `msg_id` 是不同概念，禁止混用；
`run`：运行，一次完整问答/任务在 Runtime 的执行实例（runtime_run 表，run_id 为主键）；run_id 是问答业务维度标识，与 trace_id（可观测维度）相互独立、各自成体系（口径见 RunGatewayService）；
`assistant`：LLM 协议角色，runtime_message.role 的枚举取值之一（user/assistant/system/tool），仅限 wire 协议映射上下文使用；领域层消息产生的角色用 `info_creator_role`（USER/AGENT/SKILL/MCP/LEARNING）表达，禁止把 assistant 当领域概念扩散；
`interact_id`：交互ID，表示一次输入和输出消息，包含一个或多个msg_id；
`work_id`：工作ID，表示一次完整的工作ID，用户或者学习等一次输入经过整个Agent系统所有的消息的集合，包含一个或多个interact_id；
`session_id`：用户的一个会话中的内容，包含一个或多个work_id;
`soul`：来自hermes的概念，作为prompt的开头部分，用来作为处理一类工具应该具有的品格；

`provider`：Provider，通过 Repository 设计模式封装底层资源操作的统一入口，解耦具体资源与系统；Base 层包含 RelationDBProvider、GraphDBProvider、VectorDBProvider、LLMProvider、MCPProvider、MQProvider、PromptsProvider、SkillProvider、SoulProvider 共 9 个 Provider；
`repository`：仓储，DDD 中的概念，封装数据访问的接口层，由 infrastructure 层提供具体实现；
`context`：上下文，方法执行的环境信息，继承 Context 基类；与 input（输入参数）、output（返回内容）、metrics（衡量对象）、report（上报对象）共同构成方法签名 `Boolean method(Input input, Output output, Context context, Metrics metrics, Report report)`（五参规范见 DevStandards.md §3）；
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
`opt`：optimize 的缩写，Core 层用于优化组件绑定接口的动词前缀，表示对该组件的最优匹配与绑定调整，如 optSkill、optMCP、optSoul；
`exec`：execute 的缩写，用于执行类接口的动词前缀，表示触发实际的运行或调用，如 execAgent、execLLM、execPrompt、execSkill、execMcp；
`agent`：智能体，系统中自主执行任务的实体，由 strategy、llm、skill、mcp、soul 等组件组成；分为 Worker Agent（执行任务）和 System Agent（PlannerAgent、WriterAgent、EvolutorAgent）；
`strategy`：策略，定义 Agent 执行循环的推理模式，如 CoT（链式思考）、ReAct（推理-行动）、Plan-and-Solve（先规划再求解）；由 AgentStrategy 模块管理；
`eval`：evaluation 的缩写，表示对 Agent 执行结果的评估评分过程，由 EvolutorAgent 执行，输出 correctness、completeness、efficiency、relevance 等多维度评分；
`aging`：老化，AgentLibrary 中自动禁用低活跃度和低评分的 Agent 的机制，基于 agent_opt_rule 规则定时执行；
`signature`：签名（task_signature），Agent 的任务特征摘要字符串，格式为 `[domain] 任务前256字`，用于 Agent 匹配时的相似度计算；
`trace`：轨迹，Agent 执行过程中记录的完整操作历史，包含 Think/Act/Reflect/Answer 各步骤的输入输出和耗时，用于评估和回溯；
`seed_profile`：登录态种子，CDT 启动时把用户本机 Chrome profile 的登录态文件（Cookies + Local Storage）复制到产品 profile 目录的动作；配置键 `profile_snapshot_source`（cdt_config 表，值为源 profile 目录路径）；每个源只播种一次（`.cdt-profile-seeded` 标记记录源路径，源变更时重新播种并覆盖产品侧登录态）；禁用同义词 snapshot_sync、profile_copy；
`plan`：规划，PlannerAgent 将任务分解为 DAG 子任务图的结果，包含节点（task_id、task_content、dependencies）和边（from_task_id → to_task_id）；
`config`：configure 的缩写，用于配置类接口的动词前缀，表示对模块级配置的查询与更新，如 configAgentLibrary、configAgentExecution；
`build`：构建，用于构建、创建类接口的动词前缀，表示构造并返回复杂对象或上下文数据，如 buildAgentContext、buildWriterAgent；由 AgentBuilder、AgentContext 等模块使用；
`context_id`：上下文快照 ID，AgentContext 模块在每次调用 buildAgentContext 时生成的 UUID，用于唯一标识一次上下文构建的元数据快照，支持后续追溯和可视化；
`snapshot`：上下文快照，AgentContext 模块持久化的某次执行上下文元数据记录，包含 context_id、session_id、agent_id、work_id、trace_id、context_total_count、context_sources_summary，不存储 info 内容本身；
`source`：上下文来源分类，标识 info 记录在上下文中的来源渠道；有效值包括 pinned（钉住消息）、timeline（时间线关联）、tag_relative（标签相关性）、similarity（语义相似度）、keyword（关键词匹配）、random（随机采样）；
`info_type`：信息类型，标识一条 info 记录"是什么"，用于区分请求、回复与 Agent 执行过程中的中间产物；有效值包括 REQUEST（用户请求/编排输入）、RESPONSE（模型/编排的最终回复）、THINK（Agent 思考）、SKILL（技能调用结果）、MCP（MCP 调用结果）、ACT（Agent 行动/执行）、REFLECT（Agent 反思）；
`info_creator_role`：信息产生方角色，标识一条 info 记录"是谁产生的"；有效值包括 USER（用户）、LEARNING（自学习）、AGENT（Agent）、SKILL（技能）、MCP（MCP 工具）；
`info_creator_id`：信息产生方实例 ID，标识具体哪个实例产生了该 info；UUID 类型，可为空；USER 与 LEARNING 没有具体实例，其值为空字符串；AGENT、SKILL、MCP 对应各自的实例 ID（如 agent_id、skill_id、mcp_id）；
`conversation`：对话学习，SelfLearning 域的学习输入通道概念（learning source 枚举值 conversation/document 之一，指以 chat_session 历史为输入的学习模式）；conversation ≠ session（会话容器实体），禁止用 conversation 指代 session 本身（登记日期 2026-09-22）；
