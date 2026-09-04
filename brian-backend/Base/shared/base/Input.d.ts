/**
 * @fileoverview Input 基类定义。所有 Provider 的 Input 对象都必须继承此基类。
 *
 * 遵循 `_00_DevStandardization.md` 规范：所有 Input 都继承 Input 基类。
 * Input 对象用于封装方法的输入参数，与 Context（执行环境）和 Output（返回内容）分离。
 */
/**
 * Input 基类。
 *
 * 所有 Provider 方法的入参对象都继承此基类。子类可在继承基础上扩展自身特有的字段。
 *
 * 用法示例：
 * ```typescript
 * class AddSkillInput extends Input {
 *   data!: SkillData;
 * }
 * ```
 */
export declare class Input {
    /** 请求追踪 ID，用于链路追踪；不指定时由调用方或 AOP 层自动生成 */
    trace_id?: string;
    /** 附加元数据，供切面或调试使用 */
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=Input.d.ts.map