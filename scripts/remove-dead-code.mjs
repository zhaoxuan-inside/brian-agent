#!/usr/bin/env node
/**
 * 注释保留的死代码清理（精确边界版）。
 * 模式：`// ===== 原始... =====` 标记行之后，删除紧随其后的一个完整 `/* ... *​/` 块注释，
 * 或连续的 `//` 注释行；随后跳过一个空行。其余内容一律不动。
 * 用法：node scripts/remove-dead-code.mjs <file-or-dir>...
 */
import fs from 'node:fs';
import path from 'node:path';

const MARKER = /\/\/ ===== 原始/;

function walk(p, files = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    if (/node_modules|dist|test|prebuilt|\/data\/|logs/.test(p)) return files;
    for (const f of fs.readdirSync(p)) walk(path.join(p, f), files);
  } else if (/\.(ts|vue)$/.test(p)) files.push(p);
  return files;
}

function processFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  let removed = 0;
  // 「===== 修改后」是设计决策记录（why 注释），即使紧跟在原始代码块内也必须保留
  const isModifiedBoundary = (l) => l.includes('===== 修改后');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!MARKER.test(line)) { out.push(line); continue; }
    removed++; // 标记行
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') { removed++; j++; } // 空行
    if (j < lines.length && lines[j].trim().startsWith('/*')) {
      // 块注释：若内含「修改后」说明则整体保留，仅标记行删除
      let k = j; let hasModified = false;
      while (k < lines.length && !lines[k].trim().endsWith('*/')) {
        if (isModifiedBoundary(lines[k])) { hasModified = true; break; }
        k++;
      }
      if (lines[k] && isModifiedBoundary(lines[k])) hasModified = true;
      if (hasModified) { i = j - 1; continue; }
      removed++; j++;
      while (j < lines.length && !lines[j].trim().endsWith('*/')) { removed++; j++; }
      if (j < lines.length) { removed++; j++; } // */ 行
    } else if (j < lines.length && lines[j].trim().startsWith('//')) {
      while (j < lines.length && lines[j].trim().startsWith('//')) {
        if (isModifiedBoundary(lines[j])) break; // 保留「修改后」及之后内容
        removed++; j++;
      }
    }
    if (j < lines.length && lines[j].trim() === '') { removed++; j++; } // 尾部空行
    i = j - 1;
  }
  if (removed > 0) {
    fs.writeFileSync(file, out.join('\n'));
    return removed;
  }
  return 0;
}

let total = 0, n = 0;
for (const target of process.argv.slice(2)) {
  for (const file of walk(target)) {
    const r = processFile(file);
    if (r) { total += r; n++; console.log(`${path.relative(process.cwd(), file)}: -${r} lines`); }
  }
}
console.log(`${n} files, ${total} dead lines removed`);
