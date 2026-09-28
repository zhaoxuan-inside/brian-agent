#!/usr/bin/env node

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BACKEND = path.join(ROOT, 'brian-backend');
const THRESHOLD = Number(process.argv[2] || 30);
const layerArg = process.argv.find((a) => a.startsWith('--layer='));
const LAYERS = layerArg ? layerArg.split('=')[1].split(',') : ['Base', 'Core', 'Runtime', 'Agent', 'Orchestration', 'Application'];

function walk(dir, files = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (/node_modules|dist|test|prebuilt|\/data\/|logs/.test(p)) continue;
      walk(p, files);
    } else if (/\.ts$/.test(p)) files.push(p);
  }
  return files;
}

const offenders = [];
const all = [];
const mergeCandidates = [];
for (const layer of LAYERS) {
  const layerPath = path.join(BACKEND, layer);
  if (!fs.existsSync(layerPath)) continue;
  for (const file of walk(layerPath)) {
    const rel = path.relative(BACKEND, file);
    const src = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) && node.body) {
        const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const end = sf.getEndLineNumber ?? null;
        const endLine = sf.getLineAndCharacterOfPosition(node.getEnd(sf)).line + 1;
        const len = endLine - start + 1;
        let name = '?';
        if (ts.isIdentifier(node.name)) name = node.name.text;
        else if (ts.isComputedPropertyName(node.name)) name = '[computed]';
        const cls = (() => {
          let p = node.parent;
          while (p && !ts.isClassDeclaration(p)) p = p.parent;
          return p?.name?.text ?? '';
        })();
        all.push({ layer, rel, cls, name, len, start });
        if (len > THRESHOLD) offenders.push({ layer, rel, cls, name, len, start });
        
        const isPrivate = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword) || name.startsWith('_');
        if (isPrivate && len <= 11) {
          const callRe = new RegExp(`\\b${name}\\b`, 'g');
          const occurrences = (src.match(callRe) || []).length;
          if (occurrences === 2) {
            
            mergeCandidates.push({ layer, rel, cls, name, len, start });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

const buckets = [0, 10, 20, 30, 50, 80, 120, Infinity];
const dist = {};
for (const m of all) {
  const b = buckets.find((t) => m.len <= t);
  const key = b === Infinity ? '120+' : `<=${b}`;
  dist[key] = (dist[key] || 0) + 1;
}
console.log(`方法总数：${all.length}（阈值 ${THRESHOLD} 行）`);
console.log('分布：', dist);

offenders.sort((a, b) => b.len - a.len);
console.log(`\n超过 ${THRESHOLD} 行的方法：${offenders.length} 个（Top 50）\n`);
for (const o of offenders.slice(0, 50)) {
  console.log(`${String(o.len).padStart(4)} 行  ${o.rel}:${o.start}  ${o.cls}.${o.name}`);
}

let mc = '';
if (mergeCandidates.length) {
  mc = [
    '', `## 合并候选（私有碎片方法，单一调用点，建议回并）`, '',
    '| 行数 | 位置 | 方法 |', '|------|------|------|',
    ...mergeCandidates.slice(0, 100).map((o) => `| ${o.len} | \`brian-backend/${o.rel}:${o.start}\` | \`${o.cls}.${o.name}\` |`),
  ].join('\n');
}
const outPath = path.join(ROOT, 'docs', 'MethodIndex', 'method-length-report.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const md = [
  '# 后端方法长度分析报告',
  '',
  `> 由 \`node scripts/analyze-method-length.mjs\` 自动生成；阈值 ${THRESHOLD} 行。`,
  `> 方法总数 ${all.length}；超阈值 ${offenders.length} 个。分布：\`{${Object.entries(dist).map(([k, v]) => `${k}:${v}`).join(', ')}}\``,
  '',
  '| 行数 | 位置 | 方法 |',
  '|------|------|------|',
  ...offenders.map((o) => `| ${o.len} | \`brian-backend/${o.rel}:${o.start}\` | \`${o.cls}.${o.name}\` |`),
  ].join('\n') + mc;
fs.writeFileSync(outPath, md);
console.log(`\n完整清单：${path.relative(ROOT, outPath)}`);
