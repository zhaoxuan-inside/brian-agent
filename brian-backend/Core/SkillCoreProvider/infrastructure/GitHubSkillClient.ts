/**
 * @fileoverview GitHub Skill 检索客户端（基础设施层）。
 *
 * 职责：在本地库无合格 Skill 时，按任务关键词在 GitHub 检索外部 Skill（SKILL.md）
 * 并拉取内容供导入。搜索通道：
 * - Code Search（`filename:SKILL.md`，需要 token，匿名 401）；
 * - 匿名降级：Repository Search（top 仓库探测根目录 SKILL.md）。
 * 匿名配额极低（搜索 10 次/分钟），建议在配置中心配置 github_token。
 *
 * HTTP 统一走 Base 的 HttpAccess（代理/超时/签名一致），不重复造轮子。
 */

import { HttpAccess } from '@brian-agent/base';
import { ExecRequestInput, ExecRequestOutput, HttpContext } from '@brian-agent/base';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const HTTP_TIMEOUT_MS = 15000;
/** code search / repo search 各自最多处理的候选数（防匿名配额被打爆） */
const MAX_SEARCH_RESULTS = 5;

/** GitHub 检索命中的 Skill */
export interface GitHubSkillHit {
  /** 仓库全名（owner/repo） */
  repo: string;
  /** SKILL.md 在仓库内的路径 */
  path: string;
  /** 默认分支 */
  branch: string;
}

/** 解析后的 Skill 内容 */
export interface ParsedSkillMd {
  name: string;
  skill_brief: string;
  skill_md: string;
}

export class GitHubSkillClient {
  private readonly http: HttpAccess;

  constructor(http?: HttpAccess) {
    this.http = http ?? new HttpAccess();
  }

  /**
   * 按关键词检索 GitHub Skill（逻辑控制）：code search 优先（需 token），
   * 匿名或失败降级 repo search。无命中或全部失败返回空数组。
   */
  async searchSkills(keywords: string[], token: string): Promise<GitHubSkillHit[]> {
    const query = keywords.map((k) => encodeURIComponent(k)).join('+');
    if (!query) return [];
    if (token) {
      const hits = await this.searchByCode(query, token);
      if (hits.length > 0) return hits;
    }
    return this.searchByRepo(keywords, token);
  }

  /**
   * 拉取并解析 SKILL.md（逻辑控制）：raw 内容 → frontmatter 提取 name/description。
   * 失败返回 null。
   */
  async fetchSkillMd(hit: GitHubSkillHit, token: string): Promise<ParsedSkillMd | null> {
    const raw = await this.get(`${GITHUB_RAW_BASE}/${hit.repo}/${hit.branch}/${hit.path}`, token);
    if (!raw) return null;
    return parseSkillMd(raw, hit.repo);
  }

  /** Code Search 通道（数据处理）：`{query} filename:SKILL.md`；匿名 401 返回空 */
  private async searchByCode(query: string, token: string): Promise<GitHubSkillHit[]> {
    const body = await this.getJson(
      `${GITHUB_API_BASE}/search/code?q=${query}+filename%3ASKILL.md&per_page=${MAX_SEARCH_RESULTS}`,
      token,
    );
    const items = Array.isArray(body?.items) ? body.items : [];
    const hits: GitHubSkillHit[] = [];
    for (const item of items) {
      const repo = String(item?.repository?.full_name ?? '');
      const path = String(item?.path ?? '');
      if (!repo || !path) continue;
      hits.push({ repo, path, branch: await this.resolveDefaultBranch(repo, token) });
    }
    return hits;
  }

  /** Repository Search 降级通道（数据处理）：top 仓库根目录探测 SKILL.md */
  private async searchByRepo(keywords: string[], token: string): Promise<GitHubSkillHit[]> {
    const query = `${keywords.map((k) => encodeURIComponent(k)).join('+')}+skill`;
    const body = await this.getJson(
      `${GITHUB_API_BASE}/search/repositories?q=${query}&sort=stars&per_page=${MAX_SEARCH_RESULTS}`,
      token,
    );
    const items = Array.isArray(body?.items) ? body.items : [];
    const hits: GitHubSkillHit[] = [];
    for (const item of items) {
      const repo = String(item?.full_name ?? '');
      if (!repo) continue;
      const branch = String(item?.default_branch ?? 'main');
      if (await this.rawExists(repo, branch, 'SKILL.md', token)) {
        hits.push({ repo, path: 'SKILL.md', branch });
      }
    }
    return hits;
  }

  /** 仓库默认分支解析（数据处理；失败回退 main） */
  private async resolveDefaultBranch(repo: string, token: string): Promise<string> {
    const body = await this.getJson(`${GITHUB_API_BASE}/repos/${repo}`, token);
    return String(body?.default_branch ?? 'main');
  }

  /** raw 文件存在性探测（数据处理） */
  private async rawExists(repo: string, branch: string, path: string, token: string): Promise<boolean> {
    return (await this.get(`${GITHUB_RAW_BASE}/${repo}/${branch}/${path}`, token)) != null;
  }

  /** GET JSON（数据处理；失败返回 null） */
  private async getJson(url: string, token: string): Promise<Record<string, unknown> | null> {
    const text = await this.get(url, token);
    if (!text) return null;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** GET 文本（数据处理；统一经 HttpAccess；非 2xx 返回 null） */
  private async get(url: string, token: string): Promise<string | null> {
    const input = Object.assign(new ExecRequestInput(), {
      url,
      method: 'GET',
      timeout_ms: HTTP_TIMEOUT_MS,
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'brian-agent',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const output = new ExecRequestOutput();
    try {
      await this.http.execRequest(input, output, new HttpContext());
    } catch {
      return null;
    }
    return output.response?.ok ? output.response.bodyText : null;
  }
}

/**
 * SKILL.md 内容解析（数据处理）：YAML frontmatter 提取 name/description，全文作为 skill_md。
 * 无 frontmatter 时 name 取仓库全名，brief 取正文首段截断。
 */
export function parseSkillMd(raw: string, fallbackName: string): ParsedSkillMd {
  const text = (raw ?? '').trim();
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fm) {
    return { name: fallbackName, skill_brief: firstParagraph(text), skill_md: text };
  }
  const meta = fm[1];
  const body = (fm[2] ?? '').trim();
  const name = meta.match(/^name:\s*(.+)$/m)?.[1]?.trim() || fallbackName;
  const brief = meta.match(/^description:\s*(.+)$/m)?.[1]?.trim() || firstParagraph(body);
  return { name, skill_brief: brief, skill_md: body || text };
}

/** 首段摘要（数据处理；截断 200 字符） */
function firstParagraph(text: string): string {
  const para = (text ?? '').split(/\r?\n\r?\n/).find((p) => p.trim() && !p.trim().startsWith('#')) ?? '';
  return para.trim().slice(0, 200);
}
