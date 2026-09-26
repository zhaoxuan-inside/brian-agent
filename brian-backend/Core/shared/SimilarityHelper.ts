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
  
  const score = Math.max(0, Math.min(100, Math.round(((raw + 1) / 2) * 100)));
  return score;
}

export function shouldReuseByRegenRate(regenRate: number): boolean {
  if (regenRate === 0) return true;
  if (regenRate >= 100) return false;
  const roll = Math.floor(Math.random() * 100);
  return roll >= regenRate;
}
