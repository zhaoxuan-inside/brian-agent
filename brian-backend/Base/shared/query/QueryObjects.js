"use strict";
/**
 * @fileoverview 项目公共查询对象定义。
 *
 * 根据 `RelationDBProvider-PRD.md` 第 2 节定义，这些查询对象为项目公共定义，
 * 被 LLMProvider、MCPProvider、SkillProvider、SoulProvider、PromptsProvider 等
 * 所有 Provider 直接引用。
 *
 * 包含：Condition（条件）、OrderBy（排序）、Page（分页）、DataObject（数据对象）、
 * QueryParam（查询参数）、Operation（事务操作）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualScope = exports.OperationType = exports.Direction = exports.Logic = exports.Operator = void 0;
/**
 * 条件操作符枚举。
 *
 * 定义 Condition.operator 的合法取值，覆盖常见 SQL WHERE 条件。
 */
var Operator;
(function (Operator) {
    /** 等于（=） */
    Operator["EQ"] = "EQ";
    /** 不等于（!=） */
    Operator["NE"] = "NE";
    /** 大于（>） */
    Operator["GT"] = "GT";
    /** 小于（<） */
    Operator["LT"] = "LT";
    /** 大于等于（>=） */
    Operator["GE"] = "GE";
    /** 小于等于（<=） */
    Operator["LE"] = "LE";
    /** 模糊匹配 LIKE */
    Operator["LIKE"] = "LIKE";
    /** 包含于列表 IN */
    Operator["IN"] = "IN";
    /** 不包含于列表 NOT IN */
    Operator["NOT_IN"] = "NOT_IN";
    /** 为空 IS NULL */
    Operator["IS_NULL"] = "IS_NULL";
    /** 不为空 IS NOT NULL */
    Operator["IS_NOT_NULL"] = "IS_NOT_NULL";
    /** 在区间内 BETWEEN */
    Operator["BETWEEN"] = "BETWEEN";
})(Operator || (exports.Operator = Operator = {}));
/**
 * 条件间的逻辑关系枚举。
 */
var Logic;
(function (Logic) {
    /** 与前一条件做 AND 组合（默认） */
    Logic["AND"] = "AND";
    /** 与前一条件做 OR 组合 */
    Logic["OR"] = "OR";
})(Logic || (exports.Logic = Logic = {}));
/**
 * 排序方向枚举。
 */
var Direction;
(function (Direction) {
    /** 升序（默认） */
    Direction["ASC"] = "ASC";
    /** 降序 */
    Direction["DESC"] = "DESC";
})(Direction || (exports.Direction = Direction = {}));
/**
 * 事务操作类型枚举。
 */
var OperationType;
(function (OperationType) {
    /** 新增 */
    OperationType["INSERT"] = "INSERT";
    /** 删除 */
    OperationType["DELETE"] = "DELETE";
    /** 更新 */
    OperationType["UPDATE"] = "UPDATE";
})(OperationType || (exports.OperationType = OperationType = {}));
/**
 * 可视化范围枚举。
 *
 * 各 Provider 的 visualized* 方法通用入参。
 */
var VisualScope;
(function (VisualScope) {
    /** 健康状态（连接状态、响应时间） */
    VisualScope["HEALTH"] = "health";
    /** 数据量统计 */
    VisualScope["VOLUME"] = "volume";
    /** 磁盘占用 */
    VisualScope["DISK_USAGE"] = "diskUsage";
})(VisualScope || (exports.VisualScope = VisualScope = {}));
//# sourceMappingURL=QueryObjects.js.map