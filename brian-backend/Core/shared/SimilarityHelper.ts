/**
 * @fileoverview 统一的算法匹配辅助函数（向量语义相似度与匹配概率逻辑）。
 */

/**
 * 计算两个向量之间的余弦相似度（归一化为 0-100 百分制得分）
 * @param a 向量 A
 * @param b 向量 B
 * @returns 0-100 整数得分
 */
export function vectorCosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  const raw = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  // 余弦值 [-1, 1] 映射至 [0, 100] 分
  const score = Math.max(0, Math.min(100, Math.round(((raw + 1) / 2) * 100)));
  return score;
}

/**
 * 计算两个文本/特征串的 Jaccard 算法相似度（含 [domain] 跨领域隔离与 2-gram 字符特征）
 * @deprecated 请优先使用语义向量 (vectorCosineSimilarity) 或大模型评判
 * @param a 字符串 A
 * @param b 字符串 B
 * @returns 归一化相似度得分 (0.0 - 1.0)
 */
export function simpleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;

  // 提取 [domain] 领域标识
  const domainA = a.match(/^\[(.*?)\]/)?.[1] || '';
  const domainB = b.match(/^\[(.*?)\]/)?.[1] || '';

  // 跨领域隔离：领域不同时不复用
  if (domainA && domainB && domainA.trim() !== domainB.trim()) {
    return 0;
  }

  // 去除领域括号前缀及标点符号归一化
  const cleanA = a.replace(/^\[.*?\]/, '');
  const cleanB = b.replace(/^\[.*?\]/, '');

  const normA = cleanA.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '');
  const normB = cleanB.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '');

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  // 字符 2-gram 特征提取，兼顾中文与英文词汇
  const getCharNgrams = (text: string, n = 2): Set<string> => {
    if (text.length <= n) return new Set([text]);
    const ngrams = new Set<string>();
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.add(text.slice(i, i + n));
    }
    return ngrams;
  };

  const setA = getCharNgrams(normA, 2);
  const setB = getCharNgrams(normB, 2);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * 依据 regenRate 判定第1层相似度命中后，是否允许复用
 * @param regenRate 重生成概率 (0 - 100)
 * @returns true 表示选择复用（概率为 1 - regenRate/100）；false 表示重新评估/生成
 */
export function shouldReuseByRegenRate(regenRate: number): boolean {
  if (regenRate === 0) return true;
  if (regenRate >= 100) return false;
  const roll = Math.floor(Math.random() * 100);
  return roll >= regenRate;
}
