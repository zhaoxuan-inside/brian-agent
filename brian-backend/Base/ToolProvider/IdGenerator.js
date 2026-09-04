"use strict";
/**
 * @fileoverview ID 生成器。
 *
 * 使用 uuid v4 生成全局唯一标识符，作为各表的主键 id。
 * 遵循 `_00_DevStandardization.md` 第 5.3 条：id 为表的主键。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdGenerator = void 0;
const uuid_1 = require("uuid");
/**
 * ID 生成器。
 *
 * 提供统一的唯一 ID 生成能力，所有 Provider 生成记录 id 时都应使用此工具。
 */
class IdGenerator {
    /**
     * 生成一个 UUID v4 字符串。
     *
     * @returns 36 字符的 UUID 字符串，如 "550e8400-e29b-41d4-a716-446655440000"
     */
    static generate() {
        return (0, uuid_1.v4)();
    }
    /**
     * 获取当前时间戳（毫秒）。
     *
     * 用于填充 created / updated 等系统字段。
     *
     * @returns 毫秒级 Unix 时间戳
     */
    static now() {
        return Date.now();
    }
    /**
     * 获取当天日期字符串（YYYY-MM-DD）。
     *
     * 用于按天统计表（如 xxx_usage、graph_edge_daily_activation）的 stat_date / usage_date 字段。
     *
     * @returns 当天日期字符串，如 "2026-07-25"
     */
    static today() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    /**
     * 将毫秒时间戳格式化为本地日期字符串（YYYY-MM-DD）。
     *
     * 与 today() 使用相同的本地时区口径，保证按日统计表的 usage_date
     * 在"实时写入（today）"与"历史回填（dateOf）"两条路径上口径一致。
     *
     * @param ts 毫秒级 Unix 时间戳
     * @returns 日期字符串，如 "2026-07-25"
     */
    static dateOf(ts) {
        const d = new Date(ts);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    /**
     * 获取当前操作系统类型。
     *
     * @returns 'linux' | 'macos' | 'windows'
     */
    static platform() {
        const p = process.platform;
        if (p === 'darwin')
            return 'macos';
        if (p === 'win32')
            return 'windows';
        return 'linux';
    }
}
exports.IdGenerator = IdGenerator;
//# sourceMappingURL=IdGenerator.js.map