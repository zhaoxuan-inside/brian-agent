/**
 * @fileoverview ID 生成器。
 *
 * 使用 uuid v4 生成全局唯一标识符，作为各表的主键 id。
 * 遵循 `_00_DevStandardization.md` 第 5.3 条：id 为表的主键。
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * ID 生成器。
 *
 * 提供统一的唯一 ID 生成能力，所有 Provider 生成记录 id 时都应使用此工具。
 */
export class IdGenerator {
  /**
   * 生成一个 UUID v4 字符串。
   *
   * @returns 36 字符的 UUID 字符串，如 "550e8400-e29b-41d4-a716-446655440000"
   */
  static generate(): string {
    return uuidv4();
  }

  /**
   * 获取当前时间戳（毫秒）。
   *
   * 用于填充 created / updated 等系统字段。
   *
   * @returns 毫秒级 Unix 时间戳
   */
  static now(): number {
    return Date.now();
  }

  /**
   * 获取当天日期字符串（YYYY-MM-DD）。
   *
   * 用于按天统计表（如 xxx_usage、graph_edge_daily_activation）的 stat_date / usage_date 字段。
   *
   * @returns 当天日期字符串，如 "2026-07-25"
   */
  static today(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
