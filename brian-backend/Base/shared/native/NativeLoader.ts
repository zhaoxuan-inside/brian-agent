/**
 * @fileoverview 跨平台原生模块加载器。
 *
 * 自动检测当前操作系统、CPU 架构和 Node.js ABI 版本，
 * 从预编译目录中加载匹配的原生模块（.node 文件）。
 *
 * 目录结构约定：
 * ```
 * {basePath}/
 *   prebuilt/
 *     win32-x64/
 *       node{abi}/          # 按 ABI 版本精确匹配
 *         module.node
 *     linux-x64/
 *       node{abi}/
 *         module.node
 *     darwin-x64/
 *       node{abi}/
 *         module.node
 *     darwin-arm64/
 *       node{abi}/
 *         module.node
 * ```
 *
 * 优先级：
 * 1. prebuilt/{platform}-{arch}/node{abi}/module.node （精确 ABI 匹配）
 * 2. prebuilt/{platform}-{arch}/module.node （不区分 ABI 的兜底）
 * 3. out/module.node （传统路径兜底）
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface PlatformInfo {
  platform: string;
  arch: string;
  abi: string;
  nodeVersion: string;
}

export interface LoadResult {
  /** 加载成功的原生模块导出 */
  exports: unknown;
  /** 实际加载的文件路径 */
  resolvedPath: string;
  /** 匹配方式：abi | platform | legacy */
  matchType: 'abi' | 'platform' | 'legacy';
}

/**
 * 获取当前平台信息。
 */
function getPlatformInfo(): PlatformInfo {
  return {
    platform: process.platform,       // 'win32' | 'linux' | 'darwin'
    arch: process.arch,               // 'x64' | 'arm64'
    abi: process.versions.modules,    // e.g. '127'
    nodeVersion: process.version,     // e.g. 'v22.15.0'
  };
}

/**
 * 跨平台原生模块加载器。
 */
export class NativeLoader {
  private static readonly info = getPlatformInfo();

  /**
   * 获取当前平台标识字符串。
   * 例如: "win32-x64"
   */
  static get platformTag(): string {
    return `${NativeLoader.info.platform}-${NativeLoader.info.arch}`;
  }

  /**
   * 获取当前 Node ABI 版本字符串。
   * 例如: "127"
   */
  static get abiTag(): string {
    return NativeLoader.info.abi;
  }

  /**
   * 获取当前平台完整信息。
   */
  static get platformInfo(): PlatformInfo {
    return { ...NativeLoader.info };
  }

  /**
   * 加载原生模块。
   *
   * 从 basePath 下的预编译目录中查找匹配当前平台的原生模块并加载。
   *
   * @param moduleName 模块文件名（如 "isolated_vm"）
   * @param basePath   模块根目录（应包含 prebuilt/ 和 out/ 子目录）
   * @returns 加载结果，包含模块导出和加载路径
   * @throws  当所有路径都无法找到匹配的原生模块时抛出错误
   */
  static load(moduleName: string, basePath: string): LoadResult {
    const platformDir = NativeLoader.platformTag;
    const abiDir = `node${NativeLoader.abiTag}`;
    const fileName = `${moduleName}.node`;

    // 优先级 1: prebuilt/{platform}-{arch}/node{abi}/module.node
    const abiMatchPath = join(basePath, 'prebuilt', platformDir, abiDir, fileName);
    if (existsSync(abiMatchPath)) {
      return {
        exports: require(abiMatchPath),
        resolvedPath: abiMatchPath,
        matchType: 'abi',
      };
    }

    // 优先级 2: prebuilt/{platform}-{arch}/module.node
    const platformMatchPath = join(basePath, 'prebuilt', platformDir, fileName);
    if (existsSync(platformMatchPath)) {
      return {
        exports: require(platformMatchPath),
        resolvedPath: platformMatchPath,
        matchType: 'platform',
      };
    }

    // 优先级 3: out/module.node（传统路径）
    const legacyPath = join(basePath, 'out', fileName);
    if (existsSync(legacyPath)) {
      return {
        exports: require(legacyPath),
        resolvedPath: legacyPath,
        matchType: 'legacy',
      };
    }

    throw new Error(
      `Native module "${moduleName}" not found for platform "${platformDir}" (ABI ${NativeLoader.abiTag}). ` +
      `Checked: ${abiMatchPath}, ${platformMatchPath}, ${legacyPath}. ` +
      `Please add the prebuilt binary to the appropriate directory.`
    );
  }
}
