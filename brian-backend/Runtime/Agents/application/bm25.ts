/**
 * BM25 候选打分算法模块（纯计算、无 IO、无业务依赖，符合 SOP 算法类方法规范）
 */

/** 文本分词（中英文混合：英文单词+数字，中文单字与双字切片 bi-gram） */
export function tokenizeForSearch(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const words = lower.match(/[a-z0-9_]+/g) || [];
  tokens.push(...words);

  const cjk = lower.match(/[\u4e00-\u9fa5]/g) || [];
  tokens.push(...cjk);
  for (let i = 0; i < cjk.length - 1; i++) {
    tokens.push(cjk[i] + cjk[i + 1]);
  }
  return tokens;
}

export interface BM25CandidateDoc {
  id: string;
  text: string;
}

export interface BM25MatchResult {
  id: string;
  score: number;
  rawScore: number;
}

/**
 * 基于 BM25 计算候选文档集的相关性得分并归一化为百分制 (0~100)
 */
export function rankCandidatesByBM25(
  query: string,
  docs: BM25CandidateDoc[],
  threshold = 50,
): BM25MatchResult[] {
  const queryTokens = tokenizeForSearch(query);
  if (queryTokens.length === 0 || docs.length === 0) return [];

  const docTokenList = docs.map((d) => tokenizeForSearch(d.text));
  const numDocs = docs.length;
  const totalDocLen = docTokenList.reduce((acc, t) => acc + t.length, 0);
  const avgDocLen = totalDocLen / numDocs || 1;

  const dfMap = new Map<string, number>();
  for (const tokens of docTokenList) {
    const uniqueTokens = new Set(tokens);
    for (const t of uniqueTokens) {
      dfMap.set(t, (dfMap.get(t) || 0) + 1);
    }
  }

  const k1 = 1.2;
  const b = 0.75;
  const rawScores: number[] = [];

  for (let i = 0; i < docs.length; i++) {
    const tokens = docTokenList[i];
    const docLen = tokens.length;
    const tfMap = new Map<string, number>();
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1);
    }

    let score = 0;
    for (const q of queryTokens) {
      const tf = tfMap.get(q) || 0;
      if (tf === 0) continue;
      const df = dfMap.get(q) || 1;
      const idf = Math.log(1 + (numDocs - df + 0.5) / (df + 0.5));
      const termScore = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * docLen) / avgDocLen)));
      score += Math.max(0, termScore);
    }
    rawScores.push(score);
  }

  const maxRawScore = Math.max(...rawScores, 0);
  if (maxRawScore <= 0) return [];

  const results: BM25MatchResult[] = [];
  for (let i = 0; i < docs.length; i++) {
    const raw = rawScores[i];
    if (raw <= 0) continue;
    const normalized = Math.min(100, Math.round((raw / maxRawScore) * 100));
    if (normalized >= threshold) {
      results.push({ id: docs[i].id, score: normalized, rawScore: raw });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
