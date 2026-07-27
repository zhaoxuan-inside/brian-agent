1. 整个项目内相同的定义使用同一个英文单词；
2. 接口名的设计采用动词+名词；例如：addSkill；
3. 接口的设计 Boolean值的返回表示是否完成执行，方法名，参数有三个：input 表示输入；context 表示执行的环境；output 表示返回的内容；例如 Boolean addSkill(SkillInput input, SkillContext context, SkillOutput output);
    SkillInput 继承 Input 这个基类；所有的 Input 都继承 Input 基类；
    SkillContext 继承 Context 这个基类；所有的 Context 都继承 Context 基类；
    SkillOutput 继承 Output 这个基类；所有的 Output 都继承 Output 基类；
4. 所有的方法都需要通过代理模式（AopProxy）增加切面注入能力。AopProxy 基于 JavaScript Proxy 拦截目标对象的方法调用，提供四个切入点（2前+2后）：
    - 切入点1 beforeExecute（方法执行前#1）：方法调用最开始的钩子，适合记录调用日志
    - 切入点2 preExecute（方法执行前#2）：方法实际执行前的钩子，适合参数校验、权限校验、缓存检查
    - 切入点3 postExecute（方法执行后#1）：方法成功返回后的钩子，适合结果转换、结果缓存
    - 切入点4 afterExecute（方法执行后#2）：方法执行完成后的钩子（无论成功或失败），适合耗时统计、资源清理
    每个 Access 层通过 `AopProxy.wrap(rawService, { logger })` 生成代理对象，拦截器异常不影响业务方法执行。默认内置日志拦截器（记录调用开始+完成耗时），支持通过 `interceptors` 选项注入多个自定义拦截器实现无代码侵入的横切关注点扩展。Output 参数中自动注入 `elapsed_ms` 字段记录本次调用耗时。
5. 表设计规范
    1. 表名唯一；
    2. 必须包含id，created，updated三个字段；
     3. id 为表的主键，表A要建立和任意表B的关联在表A中引用表B的id，字段格式为表B_id；
6. 外键ID默认值约定
     1. 所有引用外部资源的ID字段（如 `llm_id`、`prompt_template_id`、`soul_id` 等），当无法确定具体值时保持为空字符串，由下层的 Provider 在运行时解析默认值；
     2. 严禁在配置表或业务代码中硬编码 `"default"` 等占位字符串作为有效的资源ID；任何无法解析的ID应在 Provider 层抛出明确的错误，而非静默失败；
7. 日志记录规范
     1. 日志记录都需要通过 `logProvider` 进行记录，不能直接使用 `console.log` 等函数；
     2. 日志记录的级别（debug/info/warn/error）需要根据日志内容进行选择，不能直接使用 `console.log` 等函数；