/**
 * isolated-vm 跨平台入口文件。
 *
 * 自动检测当前平台（OS + CPU 架构 + Node.js ABI 版本），
 * 从 prebuilt/ 目录加载匹配的原生模块。
 *
 * 查找顺序：
 * 1. prebuilt/{platform}-{arch}/node{abi}/isolated_vm.node
 * 2. prebuilt/{platform}-{arch}/isolated_vm.node
 * 3. out/isolated_vm.node（传统路径）
 */

'use strict';

const path = require('path');
const fs = require('fs');

const platform = process.platform;
const arch = process.arch;
const abi = process.versions.modules;
const baseDir = __dirname;
const fileName = 'isolated_vm.node';

const searchPaths = [
  path.join(baseDir, 'prebuilt', `${platform}-${arch}`, `node${abi}`, fileName),
  path.join(baseDir, 'prebuilt', `${platform}-${arch}`, fileName),
  path.join(baseDir, 'out', fileName),
];

let loadedPath = null;
let lastError = null;

for (const p of searchPaths) {
  if (fs.existsSync(p)) {
    try {
      const mod = require(p);
      loadedPath = p;
      module.exports = mod.ivm;
      break;
    } catch (e) {
      lastError = e;
    }
  }
}

if (!loadedPath) {
  const errMsg =
    `[isolated-vm] 当前平台 (${platform}-${arch}, ABI ${abi}) 缺少预编译的原生模块。\n` +
    `已查找以下路径（均未找到或加载失败）:\n` +
    searchPaths.map((p) => `  - ${p}`).join('\n') +
    (lastError ? `\n最后尝试加载的错误: ${lastError.message}` : '');
  throw new Error(errMsg);
}
