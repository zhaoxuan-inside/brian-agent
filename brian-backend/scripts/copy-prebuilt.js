'use strict';

const fs = require('fs');
const path = require('path');

const platform = process.platform;
const arch = process.arch;
const abi = process.versions.modules;
const repoRoot = path.resolve(__dirname, '..');
const PREBUILT_DIR = path.join(repoRoot, 'prebuilt');
const NODE_MODULES = path.resolve(repoRoot, '..', 'node_modules');

const platformDir = `${platform}-${arch}`;
const abiDir = `node${abi}`;

const LANCEDB_FILENAMES = {
  'win32-x64':   'lancedb.win32-x64-msvc.node',
  'linux-x64':   'lancedb.linux-x64-gnu.node',
  'linux-arm64': 'lancedb.linux-arm64-gnu.node',
  'darwin-x64':  'lancedb.darwin-x64.node',
  'darwin-arm64':'lancedb.darwin-arm64.node',
};

function copyIfNeeded(src, dest, label) {
  if (fs.existsSync(dest)) {
    console.log(`[prebuilt] ${label}: already exists at ${dest}`);
    return true;
  }
  if (!fs.existsSync(src)) {
    console.error(`[prebuilt] ${label}: MISSING prebuilt binary at ${src}`);
    return false;
  }
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  console.log(`[prebuilt] ${label}: copied ${src} -> ${dest}`);
  return true;
}

function resolvePrebuilt(moduleName, fileName) {
  return path.join(PREBUILT_DIR, moduleName, platformDir, abiDir, fileName);
}

let allOk = true;

{
  const src = resolvePrebuilt('better-sqlite3', 'better_sqlite3.node');
  const dest = path.join(NODE_MODULES, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  if (!copyIfNeeded(src, dest, 'better-sqlite3')) allOk = false;
}

{
  const fileName = LANCEDB_FILENAMES[platformDir];
  if (!fileName) {
    console.error(`[prebuilt] lancedb: unsupported platform ${platformDir}`);
    allOk = false;
  } else {
    const src = resolvePrebuilt('lancedb', fileName);
    const dest = path.join(NODE_MODULES, '@lancedb', 'lancedb', 'dist', fileName);
    if (!copyIfNeeded(src, dest, 'lancedb')) allOk = false;
  }
}

{
  const vendorDir = path.join(repoRoot, 'Base', 'SkillProvider', 'infrastructure', 'sandbox', 'vendor', 'isolated-vm');
  const src = resolvePrebuilt('isolated-vm', 'isolated_vm.node');
  const dest = path.join(vendorDir, 'out', 'isolated_vm.node');
  
  
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log('[prebuilt] isolated-vm: already exists in vendor out/');
  } else if (fs.existsSync(src)) {
    copyIfNeeded(src, dest, 'isolated-vm');
  }
}

if (!allOk) {
  console.error('');
  console.error('[prebuilt] WARNING: Some native modules are missing prebuilt binaries for this platform.');
  console.error(`[prebuilt] Platform: ${platformDir} (ABI ${abi})`);
  console.error('[prebuilt] The server may fail to start. Add the missing prebuilt binaries to:');
  console.error(`[prebuilt]   ${PREBUILT_DIR}/`);
  console.error('');
} else {
  console.log('[prebuilt] All native modules ready.');
}
