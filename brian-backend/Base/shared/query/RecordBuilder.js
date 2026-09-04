"use strict";
/**
 * @fileoverview 记录组装公共件：消除各模块手写 id/created/updated 数据组装样板。
 *
 * 典型重复（改造前 148+ 处）：
 * ```ts
 * const now = IdGenerator.now();
 * await db.insert(TABLE, [
 *   { field: 'id', value: IdGenerator.generate() },
 *   { field: 'created', value: now },
 *   { field: 'updated', value: now },
 *   { field: 'name', value: name },
 * ]);
 * ```
 * 改造后：
 * ```ts
 * await db.insert(TABLE, newRecord({ name, parent_id }));
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDataObject = toDataObject;
exports.newRecord = newRecord;
exports.newPatch = newPatch;
const IdGenerator_1 = require("../../ToolProvider/IdGenerator");
/**
 * 将扁平对象转为 `{ field, value }[]` 数据数组（不追加系统字段）。
 *
 * @param partial 字段名 → 值；undefined / null 项被过滤
 */
function toDataObject(partial) {
    return Object.entries(partial)
        .filter(([, v]) => v !== undefined)
        .map(([field, value]) => ({ field, value }));
}
/**
 * 构造插入记录：自动补 id / created / updated（当前时刻）。
 *
 * @param partial 业务字段（undefined / null 被过滤）；如需自定义 id，传入 `id` 字段
 */
function newRecord(partial) {
    const now = IdGenerator_1.IdGenerator.now();
    return [
        { field: 'id', value: partial.id || IdGenerator_1.IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        ...toDataObject(partial),
    ];
}
/**
 * 构造更新补丁：自动补 updated（当前时刻）。
 *
 * @param partial 业务字段（undefined / null 被过滤）
 */
function newPatch(partial) {
    return [{ field: 'updated', value: IdGenerator_1.IdGenerator.now() }, ...toDataObject(partial)];
}
//# sourceMappingURL=RecordBuilder.js.map