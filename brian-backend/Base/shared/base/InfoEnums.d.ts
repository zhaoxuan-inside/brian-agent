/**
 * @fileoverview 全局信息与上下文枚举定义。
 */
/**
 * 消息类型枚举
 */
export declare enum InfoType {
    REQUEST = "REQUEST",
    RESPONSE = "RESPONSE",
    THINK = "THINK",
    REFLECT = "REFLECT",
    ACT = "ACT",
    SKILL = "SKILL",
    MCP = "MCP",
    CDT = "CDT",
    SELF_LEARNING = "SELF_LEARNING",
    AGENT = "AGENT"
}
/**
 * 上下文采集方式枚举
 */
export declare enum CollectionSource {
    PINNED = "PINNED",
    TIMELINE = "TIMELINE",
    CITING = "CITING",
    TAG_RELATIVE = "TAG_RELATIVE",
    SIMILARITY = "SIMILARITY",
    KEYWORD = "KEYWORD",
    RANDOM = "RANDOM",
    CUSTOM = "CUSTOM",
    CURRENT = "CURRENT"
}
/**
 * 别名（统一收敛）
 */
export declare const ContextSource: typeof CollectionSource;
export type ContextSource = CollectionSource;
/**
 * 信息处理结果类型枚举。
 *
 * 标识一条 info 记录是「正常正确结果」还是「异常产生的错误信息」，用于在
 * 自学习、上下文构建等环节对错误信息做隔离（错误信息不作为用户信息参与问答）。
 *
 * - `correct`        ：正常正确结果（外部组件调用 / 内部方法调用成功）。
 * - `call_error`     ：外部组件（LLM / MCP / Skill）调用的业务性错误，不含网络等非业务异常。
 * - `internal_error` ：内部模块（组件 / 方法）调用的错误，以及外部调用的网络类非业务异常。
 */
export declare enum HandleResultType {
    CORRECT = "correct",
    CALL_ERROR = "call_error",
    INTERNAL_ERROR = "internal_error"
}
/** 默认处理结果类型（正常结果）。 */
export declare const DEFAULT_HANDLE_RESULT_TYPE = HandleResultType.CORRECT;
/** 错误来源：external（外部组件调用）/ internal（内部模块调用）。 */
export type HandleErrorSource = 'external' | 'internal';
/**
 * 依据错误来源与错误性质，将异常归类为 `call_error` 或 `internal_error`。
 *
 * - `internal` 来源的错误一律归为 `internal_error`。
 * - `external` 来源：网络等非业务异常归为 `internal_error`，其余业务错误归为 `call_error`。
 */
export declare function classifyHandleResult(error: unknown, source: HandleErrorSource): HandleResultType;
//# sourceMappingURL=InfoEnums.d.ts.map