#!/usr/bin/env node

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
  
  const isModifiedBoundary = (l) => l.includes('===== 修改后');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!MARKER.test(line)) { out.push(line); continue; }
    removed++;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') { removed++; j++; }
    if (j < lines.length && lines[j].trim().startsWith('/*')) {
      
      let k = j; let hasModified = false;
      while (k < lines.length && !lines[k].trim().endsWith('*/')) {
        if (isModifiedBoundary(lines[k])) { hasModified = true; break; }
        k++;
      }
      if (lines[k] && isModifiedBoundary(lines[k])) hasModified = true;
      if (hasModified) { i = j - 1; continue; }
      removed++; j++;
      while (j < lines.length && !lines[j].trim().endsWith('*/')) { removed++; j++; }
      if (j < lines.length) { removed++; j++; }
    } else if (j < lines.length && lines[j].trim().startsWith('//')) {
      while (j < lines.length && lines[j].trim().startsWith('//')) {
        if (isModifiedBoundary(lines[j])) break;
        removed++; j++;
      }
    }
    if (j < lines.length && lines[j].trim() === '') { removed++; j++; }
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
