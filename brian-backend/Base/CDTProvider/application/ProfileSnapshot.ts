import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import type { Metrics } from '../../shared/base/Metrics';

const COOKIE_REL_PATHS = ['Network/Cookies', 'Cookies'];

const SQLITE_SIDECAR_SUFFIXES = ['-journal', '-wal', '-shm'];

const LOCAL_STORAGE_REL_DIR = join('Local Storage', 'leveldb');

const TARGET_PROFILE_SUBDIR = 'Default';

const SEED_MARKER_FILE = '.cdt-profile-seeded';

export function resolveSnapshotSourceDir(raw: string | undefined): string | null {
  if (!raw) return null;
  const expanded = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw;
  try {
    return statSync(expanded).isDirectory() ? expanded : null;
  } catch {
    return null;
  }
}

export function readSeedMarker(profileDir: string): string | null {
  try {
    return readFileSync(join(profileDir, SEED_MARKER_FILE), 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

export function writeSeedMarker(profileDir: string, sourceDir: string): void {
  writeFileSync(join(profileDir, SEED_MARKER_FILE), sourceDir, 'utf-8');
}

function copyFile(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

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
