#!/usr/bin/env node
/**
 * 方法索引生成器：解析 brian-backend 5 层全部 access 文件（TS AST），
 * 生成 docs/MethodIndex/ 下的分模块方法索引 Markdown。
 *
 * - 提取：模块名、access 类名、公开方法名、参数类型签名、返回类型、JSDoc 首行摘要
 * - 输出：docs/MethodIndex/README.md（总览）+ docs/MethodIndex/{layer}/{Module}.md
 * - 用法：node scripts/generate-method-index.mjs （或 npm run docs:index）
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BACKEND = path.join(ROOT, 'brian-backend');
const OUT = path.join(ROOT, 'docs', 'MethodIndex');
const LAYERS = ['Base', 'Core', 'Runtime', 'Agent', 'Orchestration', 'Application'];

/** 递归收集目录下的 access/*.ts */
function collectAccessFiles(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (/node_modules|dist|test/.test(f)) continue;
      collectAccessFiles(p, out);
    } else if (/access\/[^/]+\.ts$/.test(p)) out.push(p);
  }
  return out;
}

/** 提取一个 access 文件的方法信息 */
function parseAccessFile(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const methods = [];
  let className = '';
  const visit = (node) => {
    if (ts.isClassDeclaration(node) && node.name) className = node.name.text;
    if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      // 跳过构造/私有/生命周期
      if (name === 'constructor' || node.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) return;
      const sig = node.parameters
        .map((p) => {
          const t = p.type ? p.type.getText(sf).replace(/\s+/g, ' ') : 'unknown';
          const opt = p.questionToken ? '?' : '';
          return `${p.name.getText(sf)}${opt}: ${t}`;
        })
        .join(', ');
      const ret = node.type ? node.type.getText(sf) : 'void';
      // JSDoc 首行
      const docs = ts.getJSDocCommentsAndTags(node);
      let summary = '';
      for (const d of docs) {
        if (ts.isJSDoc(d) && d.comment) {
          summary = String(d.comment).split('\n')[0].replace(/\*\//g, '').trim();
          break;
        }
      }
      methods.push({ name, sig, ret, summary, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { className, methods, file };
}

const layerData = [];
for (const layer of LAYERS) {
  const layerDir = path.join(BACKEND, layer);
  const modules = {};
  for (const file of collectAccessFiles(layerDir)) {
    const rel = path.relative(layerDir, file);
    const mod = rel.split(path.sep)[0]; // Provider/模块目录名
    const info = parseAccessFile(file);
    if (!info.methods.length) continue;
    (modules[mod] ??= []).push({ ...info, rel });
  }
  layerData.push({ layer, modules });
}

// 输出
fs.rmSync(OUT, { recursive: true, force: true });
let totalMethods = 0;
const toc = [];
for (const { layer, modules } of layerData) {
  const layerDir = path.join(OUT, layer);
  fs.mkdirSync(layerDir, { recursive: true });
  const layerEntries = [];
  for (const mod of Object.keys(modules).sort()) {
    const files = modules[mod];
    const md = [`# ${layer} / ${mod} 方法索引`, '', `> 由 \`npm run docs:index\` 自动生成，请勿手工编辑。`, ''];
    let count = 0;
    for (const f of files) {
      md.push(`## ${f.className}`, '', `源码：\`brian-backend/${layer}/${f.rel.split(path.sep).join('/')}\``, '');
      md.push('| 方法 | 签名 | 返回 | 说明 |', '|------|------|------|------|');
      for (const m of f.methods) {
        const sig = m.sig.length > 90 ? m.sig.slice(0, 87) + '...' : m.sig;
        md.push(`| \`${m.name}\` | \`${sig}\` | \`${m.ret}\` | ${m.summary || '—'} |`);
        count++;
      }
      md.push('');
    }
    totalMethods += count;
    layerEntries.push({ mod, count });
    fs.writeFileSync(path.join(layerDir, `${mod}.md`), md.join('\n'));
  }
  toc.push({ layer, entries: layerEntries, total: layerEntries.reduce((s, e) => s + e.count, 0) });
}

const readme = [
  '# Brian-Agent 方法索引',
  '',
  '> 由 `npm run docs:index` 自动生成（TS AST 解析各层 access 层公开方法），请勿手工编辑。',
  `> 生成时间：${new Date().toISOString()}；方法总数：${totalMethods}`,
  '',
  '方法命名规范见 `docs/_1_DevStandards/DevStandards.md`；分层与复用规范见 `docs/_1_DevStandards/DDDStandards.md`。',
  '',
  '| 层 | 模块 | 方法数 |',
  '|----|------|--------|',
];
for (const { layer, entries, total } of toc) {
  for (const e of entries) readme.push(`| ${layer} | [${e.mod}](./${layer}/${e.mod}.md) | ${e.count} |`);
  readme.push(`| **${layer} 小计** | | **${total}** |`);
}
readme.push(`| **总计** | | **${totalMethods}** |`);
fs.writeFileSync(path.join(OUT, 'README.md'), readme.join('\n'));
console.log(`生成完成：${totalMethods} 个方法 → docs/MethodIndex/`);
