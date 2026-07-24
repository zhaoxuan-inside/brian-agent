1. 整个项目内相同的定义使用同一个英文单词；
2. 接口名的设计采用动词+名词；例如：addSkill；
3. 接口的设计 Boolean值的返回表名是否完成执行，方法名，参数有三个input，表示输入；context 表示执行的环境；output表示返回的内容；例如 Boolean addSkill(SkillInput input, SkillContext context, SkillOutput output);
    SkillInput 是 继承 Input 这个基类；所有的Input都是继承Input这个基类；
    SkillContext 是 继承 Context 这个基类；所有的Context都是继承Context这个基类；
    SkillOutput 是 继承 Output 这个基类；所有的Output都是继承Output这个基类；
4. 所有的方法都需要通过代理模式增加切面注入能力，默认需要有日志记录，耗时等日志；
5. 表设计规范
    1. 表名唯一；
    2. 必须包含id，created，updated三个字段；
    3. id 为表的主键，表A要建立和任意表B的区别在表A中引用表B的id，字段格式为表B_id；