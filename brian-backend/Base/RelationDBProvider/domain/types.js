"use strict";
/**
 * @fileoverview RelationDBProvider 领域层类型定义。
 *
 * 依据 `RelationDBProvider-PRD.md` 定义 DBContext 及各功能的 Input / Output 类型。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 *
 * 公共查询对象（Condition / OrderBy / Page / DataObject / QueryParam / Operation）
 * 定义于 shared/query，此处不重复定义。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RELATIONDB_CONFIG_TABLE = exports.CloseDBOutput = exports.CloseDBInput = exports.EnableDBOutput = exports.EnableDBInput = exports.VisualizedDBOutput = exports.VisualizedDBInput = exports.TransactionDBOutput = exports.TransactionDBInput = exports.CountDBOutput = exports.CountDBInput = exports.SelectOneDBOutput = exports.SelectOneDBInput = exports.SelectDBOutput = exports.SelectDBInput = exports.UpdateDBOutput = exports.UpdateDBInput = exports.DeleteDBOutput = exports.DeleteDBInput = exports.InsertDBOutput = exports.InsertDBInput = exports.DBContext = void 0;
const base_1 = require("../../shared/base");
/**
 * 数据库上下文（DBContext）。
 *
 * 继承 Context 基类，关系数据库相关操作的执行上下文。
 */
class DBContext extends base_1.Context {
}
exports.DBContext = DBContext;
// ---------------------------------------------------------------------------
// insertDB
// ---------------------------------------------------------------------------
/**
 * insertDB 入参。
 */
class InsertDBInput extends base_1.Input {
    /** 表名 */
    table;
    /** 数据对象列表（每项为字段名与字段值的键值对） */
    data;
}
exports.InsertDBInput = InsertDBInput;
/**
 * insertDB 出参。
 */
class InsertDBOutput extends base_1.Output {
    /** 影响行数 */
    affected_rows = 0;
}
exports.InsertDBOutput = InsertDBOutput;
// ---------------------------------------------------------------------------
// deleteDB
// ---------------------------------------------------------------------------
/**
 * deleteDB 入参。
 */
class DeleteDBInput extends base_1.Input {
    /** 表名 */
    table;
    /** 条件对象列表，不指定则删除全表记录 */
    conditions;
}
exports.DeleteDBInput = DeleteDBInput;
/**
 * deleteDB 出参。
 */
class DeleteDBOutput extends base_1.Output {
    /** 影响行数 */
    affected_rows = 0;
}
exports.DeleteDBOutput = DeleteDBOutput;
// ---------------------------------------------------------------------------
// updateDB
// ---------------------------------------------------------------------------
/**
 * updateDB 入参。
 */
class UpdateDBInput extends base_1.Input {
    /** 表名 */
    table;
    /** 待更新的字段名与字段值 */
    data;
    /** 条件对象列表，不指定则更新全表记录 */
    conditions;
}
exports.UpdateDBInput = UpdateDBInput;
/**
 * updateDB 出参。
 */
class UpdateDBOutput extends base_1.Output {
    /** 影响行数 */
    affected_rows = 0;
}
exports.UpdateDBOutput = UpdateDBOutput;
// ---------------------------------------------------------------------------
// selectDB
// ---------------------------------------------------------------------------
/**
 * selectDB 入参。
 */
class SelectDBInput extends base_1.Input {
    /** 查询参数对象 */
    query_param;
}
exports.SelectDBInput = SelectDBInput;
/**
 * selectDB 出参。
 */
class SelectDBOutput extends base_1.Output {
    /** 查询结果列表 */
    rows = [];
    /** 总记录数（分页场景下为符合条件的不分页总数） */
    total = 0;
}
exports.SelectDBOutput = SelectDBOutput;
// ---------------------------------------------------------------------------
// selectOneDB
// ---------------------------------------------------------------------------
/**
 * selectOneDB 入参。
 */
class SelectOneDBInput extends base_1.Input {
    /** 查询参数对象 */
    query_param;
}
exports.SelectOneDBInput = SelectOneDBInput;
/**
 * selectOneDB 出参。
 */
class SelectOneDBOutput extends base_1.Output {
    /** 第一条匹配记录，无匹配为 null */
    row = null;
}
exports.SelectOneDBOutput = SelectOneDBOutput;
// ---------------------------------------------------------------------------
// countDB
// ---------------------------------------------------------------------------
/**
 * countDB 入参。
 */
class CountDBInput extends base_1.Input {
    /** 表名 */
    table;
    /** 条件对象列表，不指定则统计全表记录数 */
    conditions;
}
exports.CountDBInput = CountDBInput;
/**
 * countDB 出参。
 */
class CountDBOutput extends base_1.Output {
    /** 记录总数 */
    count = 0;
}
exports.CountDBOutput = CountDBOutput;
// ---------------------------------------------------------------------------
// transactionDB
// ---------------------------------------------------------------------------
/**
 * transactionDB 入参。
 */
class TransactionDBInput extends base_1.Input {
    /** 事务操作对象列表 */
    operations;
}
exports.TransactionDBInput = TransactionDBInput;
/**
 * transactionDB 出参。
 */
class TransactionDBOutput extends base_1.Output {
}
exports.TransactionDBOutput = TransactionDBOutput;
// ---------------------------------------------------------------------------
// visualizedDB
// ---------------------------------------------------------------------------
/**
 * visualizedDB 入参。
 */
class VisualizedDBInput extends base_1.Input {
    /** 可视化范围：health / volume / diskUsage */
    scope;
}
exports.VisualizedDBInput = VisualizedDBInput;
/**
 * visualizedDB 出参。
 */
class VisualizedDBOutput extends base_1.Output {
    /** 可视化数据 */
    data = {};
}
exports.VisualizedDBOutput = VisualizedDBOutput;
// ---------------------------------------------------------------------------
// enableDB / closeDB
// ---------------------------------------------------------------------------
/**
 * enableDB 入参。
 */
class EnableDBInput extends base_1.Input {
    /** 是否启用 */
    enable;
}
exports.EnableDBInput = EnableDBInput;
/**
 * enableDB 出参。
 */
class EnableDBOutput extends base_1.Output {
}
exports.EnableDBOutput = EnableDBOutput;
/**
 * closeDB 入参。
 */
class CloseDBInput extends base_1.Input {
}
exports.CloseDBInput = CloseDBInput;
/**
 * closeDB 出参。
 */
class CloseDBOutput extends base_1.Output {
}
exports.CloseDBOutput = CloseDBOutput;
/**
 * RelationDBProvider 配置表名。
 */
exports.RELATIONDB_CONFIG_TABLE = 'relationdb_config';
//# sourceMappingURL=types.js.map