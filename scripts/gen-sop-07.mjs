#!/usr/bin/env node
/**
 * gen-sop-07.mjs —— 将 docs/method.idx.json 转换为 SOP _07 分片方法索引
 * 分片规则(_03_tech_stack/ADR 与 references/team-scale.md):_07/<layer>-<module>.idx.json + _07/_index.json
 * id 规则:m-<module-slug>-<seq>,序号在分片内自增
 * 分类映射:逻辑控制→orchestration,数据处理→data,通用算法→algorithm
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'docs', 'method.idx.json');
const OUT = path.join(ROOT, '_07');

const CATEGORY = { 逻辑控制: 'orchestration', 数据处理: 'data', 通用算法: 'algorithm' };
const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
// frontend-spec:UI 组件与视图不入 _07(组件在 _00.code.modules 登记);hooks/api/utils 为逻辑单元,登记
const EXCLUDE_SHARDS = new Set(['frontend-components', 'frontend-views']);

const idx = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const shards = new Map();
for (const m of idx.methods) {
  const layer = String(m.layer || 'Unknown');
  const module = String(m.module || 'misc');
  const key = `${slug(layer)}-${slug(module)}`;
  if (!shards.has(key)) shards.set(key, { layer, module, key, methods: [] });
  shards.get(key).methods.push(m);
}

fs.mkdirSync(OUT, { recursive: true });
const shardEntries = [];
let globalSeq = 0;
for (const [key, shard] of [...shards.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (EXCLUDE_SHARDS.has(key)) continue;
  const methods = shard.methods
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    .map((m) => {
      globalSeq += 1;
      return {
        id: `m-${slug(shard.module)}-${String(shard.methods.indexOf(m) + 1).padStart(4, '0')}`,
        signature: `boolean ${m.signature}`,
        name: m.methodName,
        category: CATEGORY[m.type] || 'data',
        layer: shard.layer,
        module: shard.module,
        location: m.file,
        description: m.desc || m.methodName,
        reusable: (m.refCount ?? 0) >= 2,
        deprecated: false,
        replaced_by: null,
      };
    });
  const byCategory = { algorithm: 0, orchestration: 0, data: 0 };
  for (const mm of methods) byCategory[mm.category] += 1;
  const doc = {
    schema_version: '1.0',
    updated_at: new Date().toISOString(),
    shard: key,
    layer: shard.layer,
    module: shard.module,
    methods,
    stats: { total: methods.length, by_category: byCategory },
  };
  fs.writeFileSync(path.join(OUT, `${key}.idx.json`), JSON.stringify(doc, null, 2));
  shardEntries.push({ shard: key, layer: shard.layer, module: shard.module, total: methods.length });
}

const totals = { algorithm: 0, orchestration: 0, data: 0 };
const cat = { algorithm: 0, orchestration: 0, data: 0 };
for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.idx.json'))) {
  const s = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')).stats;
  for (const k of Object.keys(totals)) totals[k] += s.by_category[k] || 0;
}
Object.assign(cat, totals);
const indexDoc = {
  schema_version: '1.0',
  updated_at: new Date().toISOString(),
  source: 'docs/method.idx.json (scripts/generate-method-index.mjs)',
  id_rule: 'm-<module-slug>-<seq>(分片内自增)',
  signature_note: '项目五参签名 (input, output, context, metrics?, report?) 经 ADR-007 映射 SOP 五段;登记时统一加 boolean 前缀表示执行成败契约',
  category_mapping: CATEGORY,
  shards: shardEntries.sort((a, b) => a.shard.localeCompare(b.shard)),
  stats: { total: globalSeq, by_category: cat },
};
fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(indexDoc, null, 2));
console.log(`shards=${shardEntries.length} methods=${globalSeq} by_category=${JSON.stringify(cat)}`);
