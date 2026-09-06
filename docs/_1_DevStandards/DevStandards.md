1. 整个项目内相同的定义使用同一个英文单词；
2. 接口名的设计采用动词+名词；例如：addSkill；查询/搜索类方法统一使用 `so` 前缀（so 为"搜"的音译），例如 soInfo、soConfigDetail；
3. 接口的设计 Boolean值的返回表示是否完成执行，方法签名统一为五参：`Boolean methodName(XxxInput input, XxxOutput output, XxxContext context, XxxMetrics metrics, XxxReport report)`，例如 `Boolean addSkill(SkillInput input, SkillOutput output, SkillContext context, SkillMetrics metrics, SkillReport report)`；
    SkillInput 继承 Input 这个基类；所有的 Input 都继承 Input 基类；
    SkillOutput 继承 Output 这个基类；所有的 Output 都继承 Output 基类；
    SkillContext 继承 Context 这个基类；所有的 Context 都继承 Context 基类（方法使用的背景参数）；
    SkillMetrics 继承 Metrics 这个基类；衡量对象，负责耗时统计与日志记录（封装 LogProvider 调用，提供 debug/info/warn/error 与计时能力），由 AopProxy 自动回填 elapsed_ms；
    SkillReport 继承 Report 这个基类；上报对象，负责将方法执行过程中的信息上报给客户端（底层对接 StreamProvider 的 BrianSSEMessage 协议），无流会话时静默降级为 no-op；
    调用方未传 metrics/report 时由 AopProxy 自动创建默认实例；
4. 所有的方法都需要通过代理模式（AopProxy）增加切面注入能力。AopProxy 基于 JavaScript Proxy 拦截目标对象的方法调用，提供四个切入点（2前+2后）：
    - 切入点1 beforeExecute（方法执行前#1）：方法调用最开始的钩子，适合记录调用日志
    - 切入点2 preExecute（方法执行前#2）：方法实际执行前的钩子，适合参数校验、权限校验、缓存检查
    - 切入点3 postExecute（方法执行后#1）：方法成功返回后的钩子，适合结果转换、结果缓存
    - 切入点4 afterExecute（方法执行后#2）：方法执行完成后的钩子（无论成功或失败），适合耗时统计、资源清理
    每个 Access 层通过 `AopProxy.wrap(rawService, { logger })` 生成代理对象，拦截器异常不影响业务方法执行。默认内置日志拦截器（记录调用开始+完成耗时），支持通过 `interceptors` 选项注入多个自定义拦截器实现无代码侵入的横切关注点扩展。AopProxy 按参数位置自动识别新式 5 参（Input, Output, Context, Metrics, Report）与旧式 3 参（Input, Context, Output）两种调用形态，并自动回填 `elapsed_ms`（新式写入 Metrics，同时兼容写入 Output）与 trace_id。
5. 表设计规范
    1. 表名唯一；
    2. 必须包含id，created，updated三个字段；
     3. id 为表的主键，表A要建立和任意表B的关联在表A中引用表B的id，字段格式为表B_id；
6. 外键ID默认值约定
     1. 所有引用外部资源的ID字段（如 `llm_id`、`prompt_template_id`、`soul_id` 等），当无法确定具体值时保持为空字符串，由下层的 Provider 在运行时解析默认值；
     2. 严禁在配置表或业务代码中硬编码 `"default"` 等占位字符串作为有效的资源ID；任何无法解析的ID应在 Provider 层抛出明确的错误，而非静默失败；
7. 日志记录规范（2026-09-05 修订：Metrics 日志网关）
      1. **Metrics 是日志的唯一保存网关**：Metrics 封装 LogProvider 调用接口，方法内日志与 AOP 切面日志都通过 Metrics 对象保存，不能直接使用 `console.log` 等函数；
      2. **方法内日志**：5 参方法体内记录日志使用第 4 参 metrics（`metrics.debug/info/warn/error`，自动携带 category/trace_id/elapsed_ms）；调用方未传时由 AopProxy 自动创建默认实例（注入 wrap 时配置的 LogProvider logger）；
      3. **AOP 切面日志**：由内置日志切面在方法**返回或抛异常**时（切入点 4）经 `Metrics.saveInvocation` 保存，级别为 **DEBUG**（调用 LogProvider 时通过 **级别参数** 显式携带：`logger.log(level, message, meta)`；logger 未实现 `log` 时按级别回退到 debug/info/warn/error）——采集方法调用的全部参数（Input/Output/Context/Metrics/Report）及参数内容，以 **JSON 格式**写入 LogProvider（log_record.metadata.invocation_json；参数内容序列化为函数/循环引用安全，超长截断）；默认 `min_level=INFO` 时 DEBUG 记录自动过滤，排查问题将 log 配置 `min_level` 调整为 `DEBUG` 即可开启全量调用记录；
      4. 日志记录的级别（debug/info/warn/error）需要根据日志内容进行选择；每次方法调用会产生 1 条 AOP 调用记录，体量由 log_rule 白名单、min_level 过滤与日志老化共同约束；
8. 外部资源接入点唯一性原则
      1. 系统中调用外部资源（如 LLM、Skill、MCP、Prompts 等）必须通过对应的 Provider/Access 接入层进行调用，不允许各层绕过 Provider 直接访问底层资源；
      2. 各业务模块向内聚合至核心模块，由核心模块统一接管对外部资源的管理和调度，避免出现多个模块各自维护独立的外部资源连接；
      3. 例如：Agent 层调用 LLM 推理必须经由 `LLMAccess.execLLM` → `LLMProvider` 这一条链路，不允许 Agent 层自行建立 HTTP 连接或 SDK 调用；同理 Skill 执行必须经由 `SkillAccess.execSkill`，MCP 调用必须经由 `MCPAccess.execMcp`，Prompt 渲染必须经由 `PromptsAccess.execPrompt`；
9. 种子数据约定（2026-08-15 起）
      1. 系统的内置/默认数据（如内置 MCP 市场、Agent 策略等）应直接保存到 SQLite 中，通过接口进行增删改；禁止在代码中硬编码种子常量（如 `*_DEFAULT_PROVIDERS`、`*_DEFAULT_STRATEGIES`）并在启动时自动写入；
      2. 配置默认值不应通过 `initDefaults` 从硬编码常量在启动时写入；读取配置时应使用带默认回退值的 `getString/getInt/getBoolean`（如 `config.getInt('port', 9222)`）。