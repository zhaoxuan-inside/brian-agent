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

function cleanAgentName(text: string): string {
  if (!text) return '';
  return text
    .replace(/[a-zA-Z0-9_-]/g, '')
    .replace(/智能助手$/g, '')
    .replace(/助手$/g, '')
    .replace(/Agent$/gi, '')
    .trim();
}

export function generateAgentName(
  soul: Record<string, unknown> | null,
  skills: Array<{ skill_id: string; skill_brief: string; relevance: number }>,
  domain: string,
): string {
  let name = cleanAgentName(String((soul as Record<string, string> | null)?.title ?? (soul as Record<string, string> | null)?.soul_brief ?? ''));
  if (!name && skills.length > 0 && skills[0].skill_brief) {
    name = cleanAgentName(skills[0].skill_brief);
  }
  if (!name) {
    name = DOMAIN_LABEL_MAP[domain.toLowerCase().trim()] || cleanAgentName(domain) || '专业任务处理';
  }
  if (name.length < 5) {
    name = `${name}执行专家`;
  }
  if (name.length > 10) {
    name = name.slice(0, 10);
  }
  return name;
}
