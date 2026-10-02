/**
 * NLP 任务复杂度分析器（Base 层 NLP 模块）
 * 借鉴 VSR 与语义结构分析，依据输入长度、多句结构、标点/分号、关键词语义、代码结构与工具依赖
 * 评估任务复杂度（0~100），并决策是否启用 Thinking（深度思考推演）。
 */

export interface TaskComplexityInput {
  text: string;
  skillCount?: number;
  mcpCount?: number;
}

export interface TaskComplexityResult {
  complexity: number;
  isComplex: boolean;
  level: 'simple' | 'moderate' | 'complex';
  enableThinking: boolean;
  factors: {
    baseScore: number;
    lengthScore: number;
    structureScore: number;
    keywordScore: number;
    contextScore: number;
  };
  reason: string;
}

const HIGH_COMPLEXITY_PATTERNS = [
  /为什么|原因|深度分析|详细分析|对比|优缺点|区别|trade-?off/i,
  /推导|证明|计算|算法|复杂度|时空复杂度|数学推导/i,
  /重构|排查|排错|debug|故障|死锁|并发|竞争|内存泄露|OOM/i,
  /架构|架构设计|高可用|容灾|分布式|微服务|系统设计/i,
  /代码编写|实现|编写代码|编写程序|写一个|写一段|开发|review/i,
  /优化|性能优化|SQL优化|索引优化|调优/i,
  /方案|步骤|规划|设计模式|工作流|最佳实践/i,
  /统计|监控|指标|CPU|内存|磁盘|网络|日志|宿主机|系统状态|命令/i,
  /流程图|时序图|架构图|状态图|甘特图|UML|图表|可视化|画图|画一个/i,
];

const LOW_COMPLEXITY_PATTERNS = [
  /^(你好|您好|hi|hello|在吗|在么|谢谢|多谢|再见|拜拜|早安|晚安|你是谁|介绍一下你自己)[!！。~ ]*$/i,
  /^(好的|收到|行|可以|对|嗯|知道了|没问题)[!！。~ ]*$/i,
  /^(请问|帮我)?(翻译|英译中|中译英|转换为|格式化为|转为JSON|转为Markdown)/i,
  /^(请问|帮我)?(提取|提取手机号|提取邮箱|提取关键词|提取摘要)/i,
  /^(什么是|简述|一句话介绍|查一下|天气|今天天气)/i,
];

export function computeLengthScore(text: string): number {
  const len = text.trim().length;
  if (len <= 20) return 0;
  if (len <= 60) return 10;
  if (len <= 150) return 20;
  if (len <= 300) return 30;
  return 40;
}

export function computeStructureScore(text: string): number {
  let score = 0;
  if (/```[\s\S]*?```/.test(text)) score += 30;
  if (/\d+\.\s/m.test(text)) score += 20;
  if (/^[-*]\s/m.test(text)) score += 15;
  const semicolons = (text.match(/;|；/g) || []).length;
  if (semicolons >= 2) score += 20;
  if (/如果|若|假如|并且|同时满足|另外|此外|否则/.test(text)) score += 15;
  const lineBreaks = (text.match(/\n/g) || []).length;
  if (lineBreaks >= 2) score += 15;
  return Math.min(45, Math.max(0, score));
}

export function computeKeywordScore(text: string): number {
  const trimmed = text.trim();
  for (const pattern of LOW_COMPLEXITY_PATTERNS) {
    if (pattern.test(trimmed)) return -40;
  }
  let highHits = 0;
  for (const pattern of HIGH_COMPLEXITY_PATTERNS) {
    if (pattern.test(trimmed)) highHits++;
  }
  if (highHits === 0) return 0;
  return Math.min(50, highHits * 20);
}

export function computeContextScore(skillCount = 0, mcpCount = 0): number {
  let score = 0;
  if (skillCount > 0) score += Math.min(15, skillCount * 10);
  if (mcpCount > 0) score += Math.min(15, mcpCount * 10);
  return Math.min(20, score);
}

export function analyzeTaskComplexity(input: TaskComplexityInput): TaskComplexityResult {
  const text = (input.text || '').trim();
  const baseScore = 20;
  const lengthScore = computeLengthScore(text);
  const structureScore = computeStructureScore(text);
  const keywordScore = computeKeywordScore(text);
  const contextScore = computeContextScore(input.skillCount, input.mcpCount);

  const rawComplexity = baseScore + lengthScore + structureScore + keywordScore + contextScore;
  const complexity = Math.min(100, Math.max(0, rawComplexity));

  const isComplex = complexity >= 50;
  const level = complexity < 35 ? 'simple' : complexity < 65 ? 'moderate' : 'complex';
  const enableThinking = isComplex;

  const reason = buildComplexityReason(level, complexity, { baseScore, lengthScore, structureScore, keywordScore, contextScore });

  return {
    complexity,
    isComplex,
    level,
    enableThinking,
    factors: { baseScore, lengthScore, structureScore, keywordScore, contextScore },
    reason,
  };
}

function buildComplexityReason(
  level: string,
  complexity: number,
  factors: { baseScore: number; lengthScore: number; structureScore: number; keywordScore: number; contextScore: number },
): string {
  if (level === 'simple') {
    return factors.keywordScore < 0
      ? `日常问候/直接单步指令（复杂度=${complexity}），无深度推演需求，秒级直出正文`
      : `短文本单步意图（复杂度=${complexity}），直接回复`;
  }
  if (level === 'moderate') {
    return `中等复杂度任务（复杂度=${complexity}），${factors.keywordScore > 0 ? '含特定推理词' : '结构清晰'}`;
  }
  return `复杂多步/结构化任务（复杂度=${complexity}），启用 Thinking 深度思考推导以确保严谨`;
}
