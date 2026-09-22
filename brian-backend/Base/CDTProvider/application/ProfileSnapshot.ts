/**
 * @fileoverview Chrome profile 登录态种子（Profile Snapshot Seed）。
 *
 * 把用户本机 Chrome profile 的登录态文件（Cookies + Local Storage）复制到
 * 产品 profile 目录，使 CDT 浏览器直接继承用户已登录的站点，绕过产品内登录流程。
 *
 * 播种语义：每个源目录只播种一次（标记文件记录已播种的源路径）；
 * 源路径变更时自动重新播种（覆盖产品侧 Cookies / Local Storage）。
 * 范围与 Playwright storage_state 对齐（cookies + localStorage），
 * 不复制 Preferences / Login Data / IndexedDB，避免跨版本噪音。
 */

import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import type { Metrics } from '../../shared/base/Metrics';

/** Cookie 数据库在 Chrome profile 内的候选相对路径（Chrome 96+ 迁移至 Network/ 下，旧版在根下） */
const COOKIE_REL_PATHS = ['Network/Cookies', 'Cookies'];

/** Cookie SQLite 的伴生文件后缀（journal/wal/shm，存在则一并复制保证一致性） */
const SQLITE_SIDECAR_SUFFIXES = ['-journal', '-wal', '-shm'];

/** Local Storage leveldb 目录相对路径 */
const LOCAL_STORAGE_REL_DIR = join('Local Storage', 'leveldb');

/**
 * 产品 Chrome user-data-dir 内的默认 profile 子目录。
 * 产品未传 --profile-directory，Chrome 固定使用 Default；源侧配的是用户 profile 目录
 * （如 ~/.config/google-chrome/Default），复制时必须落到目标的 Default/ 下。
 */
const TARGET_PROFILE_SUBDIR = 'Default';

/** 播种标记文件名（内容为已播种的源 profile 绝对路径） */
const SEED_MARKER_FILE = '.cdt-profile-seeded';

/** 展开 '~' 前缀并校验目录存在；无效返回 null */
export function resolveSnapshotSourceDir(raw: string | undefined): string | null {
  if (!raw) return null;
  const expanded = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw;
  try {
    return statSync(expanded).isDirectory() ? expanded : null;
  } catch {
    return null;
  }
}

/** 读取播种标记；未播种返回 null */
export function readSeedMarker(profileDir: string): string | null {
  try {
    return readFileSync(join(profileDir, SEED_MARKER_FILE), 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

/** 写入播种标记（记录源路径，供源变更检测） */
export function writeSeedMarker(profileDir: string, sourceDir: string): void {
  writeFileSync(join(profileDir, SEED_MARKER_FILE), sourceDir, 'utf-8');
}

/** 复制单个文件（自动创建父目录） */
function copyFile(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

/**
 * 把源 profile 的登录态文件复制到目标 user-data-dir 的 Default profile（数据处理）。
 *
 * @param sourceDir 用户本机 Chrome profile 目录（如 ~/.config/google-chrome/Default）
 * @param targetDataDir 产品 Chrome 的 user-data-dir（登录态写入其 Default/ 子目录）
 * @returns 是否复制到了有效登录态（源目录无 Cookies 且无 Local Storage 时返回 false）
 */
export function copySnapshotAuthFiles(sourceDir: string, targetDataDir: string, metrics?: Metrics): boolean {
  const targetProfile = join(targetDataDir, TARGET_PROFILE_SUBDIR);
  let copied = 0;
  for (const rel of COOKIE_REL_PATHS) {
    const src = join(sourceDir, rel);
    if (!existsSync(src)) continue;
    copyFile(src, join(targetProfile, rel));
    for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
      const sidecar = `${src}${suffix}`;
      if (existsSync(sidecar)) copyFile(sidecar, `${join(targetProfile, rel)}${suffix}`);
    }
    copied++;
  }
  const lsSrc = join(sourceDir, LOCAL_STORAGE_REL_DIR);
  if (existsSync(lsSrc)) {
    // leveldb 不能与旧库混存（CURRENT/MANIFEST 冲突），先清空目标目录再整体复制
    rmSync(join(targetProfile, LOCAL_STORAGE_REL_DIR), { recursive: true, force: true });
    cpSync(lsSrc, join(targetProfile, LOCAL_STORAGE_REL_DIR), { recursive: true });
    copied++;
  }
  if (copied === 0) {
    metrics?.warn?.('ProfileSnapshot 源 profile 未发现登录态文件（Cookies / Local Storage），跳过播种', {
      source: sourceDir,
    });
    return false;
  }
  return true;
}
