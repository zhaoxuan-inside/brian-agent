/**
 * @fileoverview ProfileSnapshot 登录态种子测试。
 *
 * 覆盖：源目录解析（~ 展开 / 无效路径）、登录态文件复制（新旧 Cookies 位置 +
 * Local Storage leveldb）、播种标记读写与源变更检测语义。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  copySnapshotAuthFiles,
  readSeedMarker,
  resolveSnapshotSourceDir,
  writeSeedMarker,
} from '../CDTProvider/application/ProfileSnapshot';

let workRoot = '';

beforeEach(() => {
  workRoot = mkdtempSync(join(tmpdir(), 'brian-profile-snapshot-'));
});

afterEach(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

describe('resolveSnapshotSourceDir', () => {
  it('空值与不存在的路径返回 null', () => {
    expect(resolveSnapshotSourceDir(undefined)).toBeNull();
    expect(resolveSnapshotSourceDir('')).toBeNull();
    expect(resolveSnapshotSourceDir(join(workRoot, 'missing'))).toBeNull();
  });

  it('文件路径（非目录）返回 null', () => {
    const file = join(workRoot, 'a-file');
    writeFileSync(file, 'x');
    expect(resolveSnapshotSourceDir(file)).toBeNull();
  });

  it('有效目录返回原路径', () => {
    expect(resolveSnapshotSourceDir(workRoot)).toBe(workRoot);
  });

  it('支持 ~ 前缀展开为用户主目录', () => {
    expect(resolveSnapshotSourceDir('~')).toBe(homedir());
  });
});

describe('copySnapshotAuthFiles', () => {
  it('复制 Network/Cookies 与 Local Storage/leveldb 到目标 user-data-dir 的 Default profile', () => {
    const source = join(workRoot, 'src-profile');
    const target = join(workRoot, 'target-data-dir');
    mkdirSync(join(source, 'Network'), { recursive: true });
    mkdirSync(join(source, 'Local Storage', 'leveldb'), { recursive: true });
    writeFileSync(join(source, 'Network', 'Cookies'), 'cookie-db');
    writeFileSync(join(source, 'Network', 'Cookies-journal'), 'journal');
    writeFileSync(join(source, 'Local Storage', 'leveldb', '000003.log'), 'ls-data');

    const ok = copySnapshotAuthFiles(source, target);

    expect(ok).toBe(true);
    expect(readFileSync(join(target, 'Default', 'Network', 'Cookies'), 'utf-8')).toBe('cookie-db');
    expect(readFileSync(join(target, 'Default', 'Network', 'Cookies-journal'), 'utf-8')).toBe('journal');
    expect(readFileSync(join(target, 'Default', 'Local Storage', 'leveldb', '000003.log'), 'utf-8')).toBe('ls-data');
  });

  it('旧版 Cookies（根目录）兜底可复制', () => {
    const source = join(workRoot, 'legacy-src');
    const target = join(workRoot, 'legacy-target');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'Cookies'), 'legacy-cookie-db');

    const ok = copySnapshotAuthFiles(source, target);

    expect(ok).toBe(true);
    expect(readFileSync(join(target, 'Default', 'Cookies'), 'utf-8')).toBe('legacy-cookie-db');
  });

  it('目标已存在旧 leveldb 时先清空再复制，不与旧库混存', () => {
    const source = join(workRoot, 'ls-src');
    const target = join(workRoot, 'ls-target');
    mkdirSync(join(source, 'Local Storage', 'leveldb'), { recursive: true });
    writeFileSync(join(source, 'Local Storage', 'leveldb', 'CURRENT'), 'new-current');
    const staleLeveldb = join(target, 'Default', 'Local Storage', 'leveldb');
    mkdirSync(staleLeveldb, { recursive: true });
    writeFileSync(join(staleLeveldb, 'CURRENT'), 'stale-current');
    writeFileSync(join(staleLeveldb, '000005.log'), 'stale-log');

    const ok = copySnapshotAuthFiles(source, target);

    expect(ok).toBe(true);
    expect(readFileSync(join(staleLeveldb, 'CURRENT'), 'utf-8')).toBe('new-current');
    expect(existsSync(join(staleLeveldb, '000005.log'))).toBe(false);
  });

  it('源目录无任何登录态文件时返回 false 且不写目标', () => {
    const source = join(workRoot, 'empty-src');
    const target = join(workRoot, 'empty-target');
    mkdirSync(source, { recursive: true });

    const ok = copySnapshotAuthFiles(source, target);

    expect(ok).toBe(false);
    expect(existsSync(join(target, 'Default'))).toBe(false);
  });
});

describe('seed marker', () => {
  it('未播种读取返回 null，写入后可读回源路径', () => {
    const profile = join(workRoot, 'seeded-profile');
    mkdirSync(profile, { recursive: true });

    expect(readSeedMarker(profile)).toBeNull();

    writeSeedMarker(profile, workRoot);
    expect(readSeedMarker(profile)).toBe(workRoot);
  });

  it('标记内容含换行等杂散空白时读取结果被裁剪', () => {
    const profile = join(workRoot, 'trimmed-profile');
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, '.cdt-profile-seeded'), `${workRoot}\n`);

    expect(readSeedMarker(profile)).toBe(workRoot);
  });
});
