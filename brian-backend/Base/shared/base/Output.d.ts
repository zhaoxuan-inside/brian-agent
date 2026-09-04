/**
 * @fileoverview Output 基类定义。所有 Provider 的 Output 对象都必须继承此基类。
 *
 * 遵循 `_00_DevStandardization.md` 规范：
 * - 方法签名 `Boolean method(XxxInput input, XxxContext context, XxxOutput output)`；
 * - Boolean 返回值表示方法是否执行完成；
 * - 实际返回的数据通过 output 参数（引用传递）回传。
 *
 * 在 Node.js 中对象按引用传递，对 output 的修改对调用方可见。
 */
export declare class Output {
    /** 执行失败时的错误信息（执行成功时为 undefined） */
    error?: string;
    /** 错误码，便于程序化处理（执行成功时为 undefined） */
    error_code?: string;
    /** 本次执行的耗时（毫秒），由 AOP 层自动填充 */
    elapsed_ms?: number;
}
//# sourceMappingURL=Output.d.ts.map