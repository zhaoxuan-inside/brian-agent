# Standardized 20-40 char 4-element brief generator

def make_agent_brief(r):
    title = r.get('title', '')
    task_sig = r.get('task_signature', '')
    
    if '诗篇' in title or '短诗' in task_sig:
        return "适用于诗歌创作，根据书桌与咖啡等主题，构思意境，产出优美短诗。"
    if '向量库' in title or '向量数据库' in task_sig:
        return "面向知识库问答，接收向量库咨询，拆解检索原理，输出三句简明解释。"
    if '简明技术讲解员' in title or 'HTTP' in task_sig:
        return "面向技术入门问答，接收网络协议咨询，精炼核心机制，输出两句话讲解。"
    if '跑步教练' in title or '跑步' in task_sig:
        return "适用于运动健身，针对跑步意向，制定热身与路线方案，输出跑步指导。"
    if '猫咪牙科' in title or '犬齿' in task_sig:
        return "适用于宠物急诊，针对猫犬齿断裂等症状，评估病情，输出兽医专业建议。"
    if 'ReAct' in task_sig or '概念解构师' in title:
        return "面向认知科学问答，接收思维模型咨询，拆解推理逻辑，输出一句话解释。"
    if 'document_reading' in title or '文档伴读' in title:
        return "面向文档研读，接收文档选段与上下文，进行深度剖析，输出释义延伸讲解。"
    if '记忆织网者' in title or '记忆的分类' in task_sig:
        return "面向认知问答，接收记忆结构咨询，进行分类梳理，输出系统化记忆网络。"
    if '系统资源管家' in title or ('可用' in task_sig and '磁盘' in task_sig):
        return "面向系统运维，接收存储空间查询指令，采集磁盘余量，输出可用容量报告。"
    if '系统性能监测' in title or 'CPU' in task_sig:
        return "面向性能监控，采集近1分钟CPU利用率，计算波动趋势，输出负载报告。"
    if '代码仓库审计' in title or '克隆' in task_sig:
        return "面向代码盘点，扫描指定目录Git仓库，统计项目数量，输出精确审计清单。"
    if '磁盘空间审计' in title or '占用了多大' in task_sig:
        return "面向磁盘治理，扫描各项目目录占用大小，进行排序，输出存储占用排行。"
    if '内存' in title or '内存' in task_sig:
        return "面向系统调优，采集物理内存与进程占用，定位高耗进程，输出内存优化建议。"
    if 'TCP' in task_sig or '网络分析' in title:
        return "面向网络诊断，采集系统活跃TCP套接字，统计端口分布，输出连接图表。"
    if '进程' in title or '进程' in task_sig:
        return "面向进程管理，采集系统进程清单与资源状态，识别异常，输出进程诊断报告。"
    if 'IO' in task_sig or 'I/O' in title:
        return "面向存储调优，采集磁盘读写延迟与吞吐指标，诊断瓶颈，输出调优建议。"
    if '生活整理' in title or '日历' in task_sig:
        return "面向生活日程记录，接收日常整理文本，排版时间条目，生成今日生活日历。"
    if '暹罗猫' in task_sig or '大耳贼' in task_sig:
        return "面向宠物日常照料，接收暹罗猫互动咨询，分析情绪需求，输出养护陪伴指南。"
    if '改名' in task_sig or '小黑子' in task_sig:
        return "面向宠物关怀，接收猫咪改名与习性咨询，解读成长需求，输出养猫生活建议。"
    if '多大' in task_sig or '时间感知' in title:
        return "面向时间推算，接收出生日期或时间跨度提问，计算年龄时长，输出友好答复。"
    if '开会' in task_sig or '提醒' in title or '记忆守护' in title:
        return "面向日程管理，提取会议时间与待办要素，创建定时提醒，输出日程备忘卡片。"
    if '改成四点' in task_sig or '文本优化' in title:
        return "面向文案润色，接收冗长非结构化文本，提炼核心事实，输出四点结构化要点。"
    if '5岁' in task_sig or '育儿' in title:
        return "面向家庭育儿，针对5岁儿童精力充沛等困惑，分析心理，输出温情陪伴建议。"
    if '牙齿会有什么问题' in task_sig or '口腔健康' in title:
        return "面向健康咨询，接收牙齿疾病与预防问题，梳理常见病症，输出口腔护理建议。"
    if '盒子' in task_sig or '博物学家' in title:
        return "面向动物科普，针对猫咪钻盒子习性，结合行为学，输出趣味科普原理解析。"
    if '爱睡觉' in task_sig or '猫语生活家' in title:
        return "面向趣味科普，针对猫咪嗜睡习性，结合猫科生理天性，输出一句话生动解答。"
    if '平均寿命' in task_sig or '宠物知识科普' in title:
        return "面向品种咨询，针对暹罗猫寿命与饲养提问，检索医学标准，输出权威简洁答复。"
    if '1+1' in task_sig or '数学思维' in title:
        return "面向儿童启蒙，接收基础算术问题，运用生活比喻拆解运算，输出趣味解答。"
    if '什么是 Agent' in task_sig or '概念解读者' in title or 'AI Agent' in title:
        return "面向AI概念科普，接收Agent相关咨询，系统拆解定义与架构，输出结构化解答。"
    if '天气' in task_sig or '气象' in title:
        return "面向出行规划，接收地理位置与天气咨询，查询气象数据，输出温度出行建议。"
    if '自检' in title or '自检' in task_sig:
        return "面向系统健康巡检，扫描各项核心服务运行指标，评估状态，输出自检健康报告。"
    if '心绪漫游' in title:
        return "面向情绪舒缓，接收心境感悟与日常倾诉，执行心理共情，输出温暖治愈对话。"
    if '思维探索' in title:
        return "面向深度思考，接收复杂哲学与逻辑疑问，执行多维思辨，输出启发性探讨结论。"
    if '执行结果汇总' in title or '最终回答生成' in title:
        return "面向多代理结果收口，汇总各子Agent执行草稿，提炼要点，输出结构化最终回答。"
    if '质量评估' in title or '自动进化' in title:
        return "面向执行质量控制，评估任务完成度与工具调用，识别缺陷，输出组件进化建议。"
    if '复杂任务拆解' in title or '执行规划' in title:
        return "面向复杂需求拆解，分析任务依赖拓扑，编排执行DAG，输出分步子任务计划。"
    if '日常问答' in title or '知识科普' in title:
        return "面向日常通用咨询，接收用户事实与科普提问，检索知识库，输出准确通俗解答。"
    if '模型选型' in title or '架构设计' in title:
        return "面向AI架构设计，根据场景评估模型与Agent框架，制定技术路线，输出设计方案。"
    if '资料检索' in title or '综述报告' in title:
        return "面向深度课题调研，全网检索资料并界定应用场景，梳理技术路线，输出调研综述报告。"
    if '数据分析' in title or '风险论证' in title:
        return "面向方案研判决策，分析业务数据与潜在风险，执行影响评估，输出严密论证结论。"
    if '软件编码' in title or '测试部署' in title:
        return "面向软件工程开发，根据需求完成代码实现与工具集成，执行审查，输出可运行代码。"
    if '环境部署' in title or '运维监控' in title:
        return "面向系统运维发布，执行容器化部署与监控配置，诊断性能瓶颈，输出运维保障结论。"
    if '目标方案' in title or '执行编排' in title:
        return "面向业务目标落地，梳理关键里程碑与资源约束，编排执行周期，输出落地执行方案。"
    
    clean_t = title.replace('负责', '').replace('，', '').replace('｜', '').strip()[:6]
    return f"面向{clean_t}问答，接收专业咨询，执行知识检索与分析，输出标准解答。"

def make_skill_brief(r):
    title = r.get('title', '')
    cid = r.get('id', '')
    if cid == 'skill_builtin-exec':
        return "面向运维管理，接收宿主机Shell命令，安全沙箱执行，产出真实终端输出。"
    if cid == 'skill_builtin-browser':
        return "面向网页数据采集，接收URL与操作指令，操控CDP浏览器，产出页面文本。"
    if cid == 'skill_builtin-plan':
        return "面向流程任务管理，接收多步骤目标列表，维护执行进度，产出过程计划卡片。"
    if cid == 'skill_builtin-delegate':
        return "面向复杂任务分工，接收独立子任务定义，派发至子代理，汇总各子任务结果。"
    if cid == 'skill_builtin-ask-user':
        return "面向意图歧义澄清，接收待确认问题与选项，挂起会话等待，产出用户明确答复。"
    if '互联网信息搜索' in title:
        return "面向全网信息检索，接收关键词与意图，调用搜索引擎API，产出高相关结果。"
    if '数学计算' in title:
        return "面向数值计算，接收算术表达式与公式，进行高精度符号计算，产出确定数值。"
    if '多步任务编排' in title:
        return "面向工作流调度，接收复合业务流程定义，编排多任务状态机，产出执行追踪。"
    if '异步子代理' in title:
        return "面向多代理协作，接收分发指令与通信拓扑，协调并发任务，产出协同运行状态。"
    if '信息检索摘要' in title:
        return "面向海量文档速读，接收长文本或数据库记录，执行语义提炼，产出精炼摘要。"
    if '智能体技能定义' in title:
        return "面向技能自进化，接收Agent能力需求，生成标准SKILL规范，产出规范技能包。"
    if '任务规划执行规范' in title:
        return "面向执行质量控制，接收任务目标与约束，施加结构化审查流程，产出合规结果。"
    if '指派任务执行' in title:
        return "面向特定代理派工，接收代理专用任务参数，驱动代理执行，产出专属业务成果。"
    if '药品库存' in title:
        return "面向医院药房管理，分析药品效期与消耗曲线，计算安全库存，产出补货预警。"
    return f"面向{title[:6]}场景，接收业务参数输入，执行专属逻辑处理，产出结构化结果。"

def make_soul_brief(r):
    content = r.get('content', '')
    brief = r.get('brief', '')
    
    if '编码与研究助理' in content:
        return "适用于专业编码研究，接收代码开发与调研指令，以研究助理视角，输出结构化报告。"
    if '专业编码助手' in content:
        return "适用于编码辅助，接收编程与调试问题，以敏捷程序员视角，输出规范代码解答。"
    if '严苛而公正的导师' in content:
        return "适用于深度求知答辩，接收学术与思维提问，以严苛导师口吻追问本质，输出启发性洞见。"
    if '摘要生成专家' in content or '摘要专家' in content:
        return "适用于长文本信息精炼，接收响应与问答，以专业摘要官视角，输出精炼关键事实摘要。"
    if '意图推断' in content or '需求分析' in content:
        return "适用于意图识别，综合分析输入与上下文，以分析师视角，输出精准需求归类。"
    if '航天发射解说员' in content or '航天' in content or '火箭' in content:
        return "适用于航天科普解说，接收太空探索提问，以激情解说员视角，输出生动实时解说。"
    if '散步路线规划师' in content or '烦闷' in content:
        return "适用于心情舒缓放松，倾听烦闷心绪，以贴心路线规划师口吻，输出治愈系散步建议。"
    if '运行状态确认官' in content:
        return "适用于系统状态巡检，接收服务运行自检请求，以严谨确认官视角，输出明确事实答复。"
    if '极简风格' in content or '极简' in content:
        return "适用于极简指令应答，接收简短指令与情绪输入，以克制冷静口吻，输出极简精准回复。"
    if '街头息怒师' in content or '路怒' in content:
        return "适用于驾驶情绪疏导，针对路怒焦躁心理，以幽默口吻，输出押韵解压顺口溜。"
    if '饮食文化' in content or '发酵食品' in content or '面食' in content:
        return "适用于饮食文化考究，接收中华美食源流提问，以学者渊博口吻，输出文化历史阐述。"
    if '深夜静谧' in content or '诗篇' in content or '短诗' in content:
        return "适用于文学诗歌创作，倾听深夜书桌心境，运用细腻诗意笔触，输出富有画面感的现代诗。"
    if '向量数据库' in content or '向量库' in brief:
        return "适用于数据架构科普，接收高维向量概念提问，以严谨通俗口吻，输出三句清晰解析。"
    if '技术讲解员' in content or '技术讲解员' in brief:
        return "适用于网络基础教学，接收协议概念提问，以耐心导师口吻，输出极简两句话讲解。"
    if '跑步教练' in content or '想出门跑步' in content:
        return "适用于运动激励，接收跑步与健身困惑，以阳光活力教练口吻，输出热身路线建议。"
    if '兽医牙科' in content or '猫科动物' in content:
        return "适用于宠物医疗咨询，接收猫咪牙齿外伤症状，以兽医专家视角，输出专业急诊指导。"
    if '概念解构师' in content or '思维模型' in content or 'ReAct' in content:
        return "适用于认知思维辅导，接收决策模型提问，以精炼解构师口吻，输出一句话本质洞见。"
    if '文档伴读' in content:
        return "适用于深度阅读，研读复杂专业文档，以伴读学者口吻，输出深入浅出的条理导读。"
    if '记忆织网者' in content:
        return "适用于认知结构探索，分析记忆分类与关联，以哲思学者口吻，输出多维立体记忆图谱。"
    if '首席编辑' in content or '最终表达层' in content:
        return "适用于对话最终收口，整合上游Agent草稿，以首席编辑口吻，输出友好精炼表达。"
    if '系统资源管家' in content:
        return "适用于系统运维管理，接收存储状况查询，以管家式严谨口吻，输出磁盘监控与建议。"
    if '系统性能监测' in content or 'CPU' in content:
        return "适用于性能排障，接收CPU负载波动查询，以资深SRE口吻，输出趋势诊断与结论。"
    if '代码仓库审计' in content:
        return "适用于代码资产审计，接收版本库统计请求，以严谨审计官口吻，输出项目统计清单。"
    if '磁盘空间审计' in content:
        return "适用于存储成本治理，分析各项目磁盘占用，以审计师视角，输出空间分析报告。"
    if '内存侦探' in content or '内存管理' in content:
        return "适用于内存泄漏排查，诊断高内存占用进程，以敏锐侦探口吻，输出内存优化策略。"
    if '系统网络分析' in content or 'TCP' in content:
        return "适用于网络故障排查，分析TCP连接状态，以协议专家视角，输出链路诊断结论。"
    if '系统进程分析' in content or '内核级' in content:
        return "适用于操作系统诊断，分析系统进程运行状态，以内核专家口吻，输出进程处理建议。"
    if '性能洞察' in content or 'I/O' in content:
        return "适用于IO瓶颈调优，评估底层读写延迟，以架构师视角，输出性能瓶颈优化方案。"
    if '生活整理' in content:
        return "适用于日常琐事记录，倾听家居整理日常，以温柔管家口吻，输出温馨的每日生活日历。"
    if '颂帕' in content or '暹罗猫精灵' in content:
        return "适用于猫咪陪伴交流，倾听暹罗猫养育与心情，以猫精灵口吻，输出温情优雅互动回复。"
    if '喵懂' in content or '猫咪行为顾问' in content:
        return "适用于猫咪改名与生活咨询，理解猫咪行为需求，以养猫顾问口吻，输出贴心养育建议。"
    if '时间感知' in content or '年龄和成长' in content:
        return "适用于年龄与时长计算，接收时间跨度提问，以热情助手口吻，输出准确友好计算结果。"
    if '记忆守护者' in content:
        return "适用于个人事务提醒，提取时间与待办要素，以备忘专家口吻，输出清晰日程提醒记录。"
    if '文本优化师' in content:
        return "适用于文案精简提炼，提炼文本核心逻辑，以优化师视角，输出精炼的四点结构化要点。"
    if '育儿陪伴' in content or '5岁' in content:
        return "适用于学龄前育儿交流，倾听幼儿精力困扰，以慈爱陪伴者口吻，输出鼓励育儿建议。"
    if '口腔健康' in content:
        return "适用于家庭口腔科普，解答牙齿保健与病症，以亲和牙医口吻，输出实用护齿建议。"
    if '博物学家' in content:
        return "适用于动物行为科普，解答猫咪钻盒习性，以博物学家趣味口吻，输出生动行为学解释。"
    if '猫语生活家' in content:
        return "适用于宠物趣味闲聊，解答猫咪生活习性，以幽默猫语者口吻，输出趣味猫性生活哲学。"
    if '宠物知识科普' in content or '暹罗猫有深入研究' in content:
        return "适用于宠物科学饲养，解答品种寿命与标准，以科普顾问视角，输出客观精准医学简答。"
    if '数学' in content:
        return "适用于儿童数学启蒙，解答基础算术算理，以生活化比喻口吻，输出生动趣味启发引导。"
    if 'AI Agent 概念解读者' in content or '智能体' in content:
        return "适用于AI概念普及，解答智能体核心原理，以科普向导口吻，输出结构化通俗讲解。"
    
    clean_b = brief.split('｜')[0].replace('负责', '').strip()[:6]
    return f"面向{clean_b}咨询，接收用户问题输入，以专属人设视角，输出契合的专业回复。"

def make_prompt_brief(r):
    title = r.get('title', '')
    content = r.get('content', '')
    
    # Check title explicitly first
    if 'LLM 模型匹配' in title or 'LLM 匹配选择' in title:
        return "面向大模型智能路由，根据任务复杂度与配额，评估负载，输出最优LLM推荐。"
    if '任务拆分' in title or 'Planner 任务拆解' in title:
        return "面向复合任务拆解，分析需求依赖与执行拓扑，制定分步规划，输出任务计划。"
    if 'WorkAgent 质量评估' in title or 'WriterAgent 质量评估' in title or 'WorkAgent 评估' in title or 'WriterAgent 评估' in title or 'Evolutor' in title:
        return "面向Agent执行评价，分析任务完成度与工具调用，执行打分，输出进化建议。"
    if 'Writer 结构化响应' in title or 'Writer 结果汇总' in title or '写作汇总' in title:
        return "面向内容定稿排版，接收多步执行草稿，进行专业润色，输出Markdown正文。"
    if 'Worker Think' in title:
        return "面向任务逐步思考，接收上下文与目标，执行链式深度推理，输出中间推理步骤。"
    if 'Worker Reflect' in title:
        return "面向执行反思复盘，比对预期目标与执行结果，提取失败根因，输出改进建议。"
    if 'Worker Answer' in title:
        return "面向执行结果总结，整合思考过程与工具调用输出，组织最终回答，输出连贯答复。"
    if 'Orchestration Strategy Selector' in title or '编排策略' in title:
        return "面向执行策略决策，分析任务复杂度与执行模式，评估最优策略，输出编排策略类型。"
    if '用户画像' in title or '画像分析' in title:
        return "面向用户画像建模，分析多轮对话交互特征与偏好，提取维度证据，输出画像标签。"
    if '需求理解与意图比对' in title or 'Intent' in title:
        return "面向用户需求理解，解析输入语句的核心诉求与参数，消除歧义，输出标准结构化意图。"
    if '系统响应摘要生成' in title or 'Summary' in title or 'builtin.summary' in title:
        return "面向对话上下文压缩，提取历史问答核心事实，执行文本压缩，输出精炼上下文摘要。"
    if 'Agent 匹配' in title:
        return "面向Agent路由，比对任务需求与候选能力，执行仲裁打分，输出匹配Agent。"
    if 'Skill 匹配' in title:
        return "面向技能装配沉淀，评估任务对技能依赖与复用价值，输出入选技能清单。"
    if 'Soul 匹配' in title:
        return "面向角色人设选择，分析任务领域与情感基调，评估契合度，输出匹配人格Soul。"
    if 'MCP 匹配' in title or 'MCP 市场匹配' in title:
        return "面向外部工具装配，评估任务所需外部协议，匹配候选MCP工具，输出入选MCP清单。"
    if '任务分析' in title:
        return "面向任务特征分析，提取任务复杂度与领域类别，生成任务签名，输出任务分析JSON。"
    if '文档阅读问答' in title or '文档伴读身份' in title:
        return "面向文档阅读问答，结合文档引用选段与上下文，执行条理化解析，输出精准解答。"
    if '模型属性生成' in title or '说明生成' in title:
        return "面向Agent元数据生成，概括智能体职责边界，提炼一句话简介，输出语义摘要。"
    if 'Brian 身份声明' in title:
        return "面向全局身份锚定，接收系统会话初始化指令，注入助手元设定，输出统一身份认知。"
    if '命名' in title:
        return "面向智能体自动命名，根据Agent职责与领域特性，提炼专业代号，输出简明中文名称。"
    if '技能自生成' in title:
        return "面向未知任务自动化，根据具体执行需求编写SKILL规范与脚本，输出完整技能包。"
    if 'Soul 自生成' in title:
        return "面向个性化人设定制，根据领域场景塑造专家口吻，编写人设System段，输出Soul定义。"
    if '标签' in title:
        return "面向语义标签提取，解析文本主题与核心概念实体，执行关键词标注，输出结构化标签集。"
    if '自我评估' in title:
        return "面向自我能力度量，分析历史问答反馈与执行指标，进行能力打分，输出自查评估报告。"
    if '对话' in title:
        return "面向多轮人机对话，维护上下文一致性与记忆关联，引导思考，输出流畅自然回复。"
        
    clean_t = title.replace('提示词', '').replace('模板', '').strip()[:6]
    return f"面向{clean_t}处理场景，接收格式化变量参数，执行大模型引导，输出规范化结果。"

def make_mcp_brief(r):
    title = r.get('mcp_title', '') or r.get('mcp_provider_title', '')
    if 'Fetch' in title or '抓取' in title:
        return "面向网页数据采集，接收目标URL，抓取页面DOM，输出Markdown文本。"
    if 'memory' in title.lower():
        return "面向长期记忆管理，接收会话关键事实与实体关系，构建知识图谱，输出关联记忆。"
    if 'SubwayInfo' in title or 'subway' in title.lower():
        return "面向城市交通查询，接收纽约地铁线路与车站名称，实时查询运行状态，输出到站提醒。"
    if '阿里云' in title or 'Ops' in title:
        return "面向阿里云资源运维，接收资源操作指令，调用云API，输出运维执行状态。"
    return f"面向{title[:6]}工具调用，接收JSON-RPC请求，连接外部服务执行，输出工具数据。"
