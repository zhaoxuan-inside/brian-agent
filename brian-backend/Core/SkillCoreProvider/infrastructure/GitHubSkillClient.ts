import { HttpAccess } from '@brian-agent/base';
import { ExecRequestInput, ExecRequestOutput, HttpContext } from '@brian-agent/base';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const HTTP_TIMEOUT_MS = 15000;

const MAX_SEARCH_RESULTS = 5;

export interface GitHubSkillHit {
  
  repo: string;
  
  path: string;
  
  branch: string;
}

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

  

  async searchSkills(keywords: string[], token: string): Promise<GitHubSkillHit[]> {
    const query = keywords.map((k) => encodeURIComponent(k)).join('+');
    if (!query) return [];
    if (token) {
      const hits = await this.searchByCode(query, token);
      if (hits.length > 0) return hits;
    }
    return this.searchByRepo(keywords, token);
  }

  

  async fetchSkillMd(hit: GitHubSkillHit, token: string): Promise<ParsedSkillMd | null> {
    const raw = await this.get(`${GITHUB_RAW_BASE}/${hit.repo}/${hit.branch}/${hit.path}`, token);
    if (!raw) return null;
    return parseSkillMd(raw, hit.repo);
  }

  
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

  
  private async resolveDefaultBranch(repo: string, token: string): Promise<string> {
    const body = await this.getJson(`${GITHUB_API_BASE}/repos/${repo}`, token);
    return String(body?.default_branch ?? 'main');
  }

  
  private async rawExists(repo: string, branch: string, path: string, token: string): Promise<boolean> {
    return (await this.get(`${GITHUB_RAW_BASE}/${repo}/${branch}/${path}`, token)) != null;
  }

  
  private async getJson(url: string, token: string): Promise<Record<string, unknown> | null> {
    const text = await this.get(url, token);
    if (!text) return null;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  
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

function firstParagraph(text: string): string {
  const para = (text ?? '').split(/\r?\n\r?\n/).find((p) => p.trim() && !p.trim().startsWith('#')) ?? '';
  return para.trim().slice(0, 200);
}
