/**
 * @fileoverview 匹配模块常量与枚举（Core 排序/缓存/解散共用）。
 *
 * 全部有限值域字段以 enum 承载；正文阈值均为百分制 score (0-100)，
 * 向量相似度为 0.0-1.0 小数。
 */

/** 组件排序采纳阈值（百分制；低于阈值的候选被丢弃） */
export enum ScoreThreshold {
  /** 默认采纳阈值 */
  Default = 90,
  /** 满分 */
  Max = 100,
  /** 下限 */
  Min = 0,
}

/** agent 打分采纳阈值（agentMatch；百分制） */
export enum AgentScoreThreshold {
  Default = 70,
}

/** 匹配缓存 */
export enum MatchCache {
  /** 结果条目容量（FIFO 淘汰） */
  Capacity = 500,
  /** 条目 TTL（毫秒） */
  TtlMs = 10 * 60_000,
  /** 任务内容参与 key 的长度上限 */
  KeyTaskChars = 128,
  /** 任务内容参与向量化的长度上限 */
  EmbedTaskChars = 256,
}

/** 向量相似度命中阈值（0.0-1.0；2026-09-11 定稿 0.80） */
export enum VectorSimilarity {
  Default = 0.8,
}

/** Agent 绑定归属（区分用户创建与系统构建，解散动作只作用于系统侧） */
export enum CreatedBy {
  User = 'user',
  System = 'system',
}

/** 评估低分解散阈值（百分制；低于该分按"组件完全无效"处理） */
export enum DisbandThreshold {
  Critical = 30,
}

/** sort 顺序方向（降序取最优） */
export enum SortDirection {
  Desc = 'desc',
}
