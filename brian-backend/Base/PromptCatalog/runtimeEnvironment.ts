/**
 * 本机运行环境：Brian 跑在用户电脑上，路径/命令/下载必须按当前系统给出最终结果。
 */

import os from 'node:os';
import path from 'node:path';

export type RuntimeOsId = 'macos' | 'windows' | 'linux';

export interface RuntimeEnvironment {
  os: RuntimeOsId;
  os_label: string;
  platform: NodeJS.Platform;
  arch: string;
  homedir: string;
  cwd: string;
  downloads_dir: string;
  username: string;
  shell: string;
}

const OS_LABEL: Record<RuntimeOsId, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};

export function detectRuntimeOs(platform: NodeJS.Platform = process.platform): RuntimeOsId {
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  return 'linux';
}

export function collectRuntimeEnvironment(): RuntimeEnvironment {
  const osId = detectRuntimeOs();
  let username = '';
  try {
    username = os.userInfo().username;
  } catch {
    username = os.hostname();
  }
  const homedir = os.homedir();
  return {
    os: osId,
    os_label: OS_LABEL[osId],
    platform: process.platform,
    arch: os.arch(),
    homedir,
    cwd: process.cwd(),
    downloads_dir: path.join(homedir, 'Downloads'),
    username,
    shell: process.env.SHELL || process.env.ComSpec || '',
  };
}

/** 注入 Prompt 的运行环境片段。 */
export function formatRuntimeEnvironment(env: RuntimeEnvironment = collectRuntimeEnvironment()): string {
  const lines = [
    '<运行环境>',
    `- 操作系统: ${env.os_label} (${env.platform}/${env.arch})`,
    `- 用户: ${env.username}`,
    `- 主目录: ${env.homedir}`,
    `- 下载目录: ${env.downloads_dir}`,
    `- 工作目录: ${env.cwd}`,
  ];
  if (env.shell) lines.push(`- Shell: ${env.shell}`);
  lines.push(
    '本助手运行在用户本机。路径、命令、文件与下载必须只针对上述系统给出最终可用结果；不要输出其他操作系统的对照方案（例如在 macOS 上再给 Windows 路径），除非用户明确要求跨平台。',
    '当用户要求「处理 / 给出 / 列出 / 最终结果」（如下载文件路径），直接给出本机结果，不要用教程、方案或双系统表格替代。',
    '</运行环境>',
  );
  return lines.join('\n');
}

export function mergePromptContext(...parts: Array<string | undefined | null>): string {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join('\n\n');
}
