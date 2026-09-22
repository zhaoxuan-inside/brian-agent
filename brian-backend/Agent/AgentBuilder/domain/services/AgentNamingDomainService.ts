/**
 * Agent 命名领域服务（纯函数，零 I/O）：为新构建的 Worker Agent 生成中文功能名。
 * 命名优先级：Soul 简述 → 首个技能简述 → 领域映射 → 通用问答兜底。
 */

/** 领域 → 中文功能名映射（无 Soul/Skill 可用时的兜底命名表，数据驱动） */
const DOMAIN_LABEL_MAP: Record<string, string> = {
  general: '通用问答',
  weather: '气象天气',
  travel: '旅游规划',
  math: '数学计算',
  coding: '编码开发',
  research: '调研研究',
  analysis: '分析研判',
  design: '设计创作',
  writing: '写作总结',
  planning: '任务规划',
  devops: '运维部署',
  testing: '测试评测',
  marketing: '市场营销',
};

/** 清理名称中的非中文字符与"助手/Agent"类后缀（纯函数） */
function cleanAgentName(text: string): string {
  if (!text) return '';
  return text
    .replace(/[a-zA-Z0-9_-]/g, '')
    .replace(/智能助手$/g, '')
    .replace(/助手$/g, '')
    .replace(/Agent$/gi, '')
    .trim();
}

/**
 * 生成 Agent 名称（纯函数）：优先 Soul 简述，回退首个技能简述，再回退领域映射表。
 */
export function generateAgentName(
  soul: Record<string, unknown> | null,
  skills: Array<{ skill_id: string; skill_brief: string; relevance: number }>,
  domain: string,
): string {
  const soulBrief = cleanAgentName(String((soul as Record<string, string> | null)?.soul_brief ?? ''));
  if (soulBrief) return soulBrief;

  if (skills.length > 0 && skills[0].skill_brief) {
    const skillName = cleanAgentName(skills[0].skill_brief);
    if (skillName) return skillName;
  }

  return DOMAIN_LABEL_MAP[domain.toLowerCase().trim()] || cleanAgentName(domain) || '通用问答';
}
