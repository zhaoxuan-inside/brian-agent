import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface PlatformInfo {
  platform: string;
  arch: string;
  abi: string;
  nodeVersion: string;
}

export interface LoadResult {

  exports: unknown;

  resolvedPath: string;

  matchType: 'abi' | 'platform' | 'legacy';
}

function getPlatformInfo(): PlatformInfo {
  return {
    platform: process.platform,
    arch: process.arch,
    abi: process.versions.modules,
    nodeVersion: process.version,
  };
}

export class NativeLoader {
  private static readonly info = getPlatformInfo();

  static get platformTag(): string {
    return `${NativeLoader.info.platform}-${NativeLoader.info.arch}`;
  }

  static get abiTag(): string {
    return NativeLoader.info.abi;
  }

  static get platformInfo(): PlatformInfo {
    return { ...NativeLoader.info };
  }

  static load(moduleName: string, basePath: string): LoadResult {
    const platformDir = NativeLoader.platformTag;
    const abiDir = `node${NativeLoader.abiTag}`;
    const fileName = `${moduleName}.node`;

    const candidates: Array<{ path: string; matchType: LoadResult['matchType'] }> = [
      { path: join(basePath, 'prebuilt', platformDir, abiDir, fileName), matchType: 'abi' },
      { path: join(basePath, 'prebuilt', platformDir, fileName), matchType: 'platform' },
      { path: join(basePath, 'out', fileName), matchType: 'legacy' },
    ];

    for (const c of candidates) {
      if (existsSync(c.path)) return NativeLoader.requireNative(c.path, c.matchType);
    }

    throw new Error(
      `Native module "${moduleName}" not found for platform "${platformDir}" (ABI ${NativeLoader.abiTag}). ` +
      `Checked: ${candidates.map((c) => c.path).join(', ')}. ` +
      `Please add the prebuilt binary to the appropriate directory.`
    );
  }

  private static requireNative(
    modulePath: string,
    matchType: LoadResult['matchType'],
  ): LoadResult {

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return { exports: require(modulePath), resolvedPath: modulePath, matchType };
  }}
