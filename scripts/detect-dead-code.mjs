#!/usr/bin/env node
// 检测残留的无标记注释死代码块：连续 >=6 行、形如代码的 // 注释（排除 ===== 标记与说明性文字）。
// 用法：node scripts/detect-dead-code.mjs [minLines]
import fs from 'node:fs';
import path from 'node:path';

const MIN = Number(process.argv[2] || 6);
const files = [];
(function walk(p) {
  if (/node_modules|dist|test|TestResult|prebuilt|\/data\/|logs/.test(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const f of fs.readdirSync(p)) walk(path.join(p, f)); }
  else if (/\.(ts)$/.test(p)) files.push(p);
})('brian-backend');

const codeish = /^\/\/\s*(const |let |var |await |return |if \(|for \(|while \(|async |function |class |export |\}|\{|this\.|[a-zA-Z_]+\()/;
const hits = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let run = [];
  const flush = (end) => {
    if (run.length >= MIN) hits.push({ f, start: end - run.length + 1, n: run.length, first: run[0].trim().slice(0, 90) });
    run = [];
  };
  lines.forEach((l, idx) => {
    const t = l.trim();
    if (t.startsWith('//') && codeish.test(t) && !t.includes('=====')) run.push(l);
    else flush(idx);
  });
  flush(lines.length);
}
hits.sort((a, b) => b.n - a.n).forEach((h) => console.log(`${h.n}行  ${h.f}:${h.start}  ${h.first}`));
console.log(`blocks: ${hits.length}, lines: ${hits.reduce((s, h) => s + h.n, 0)}`);
