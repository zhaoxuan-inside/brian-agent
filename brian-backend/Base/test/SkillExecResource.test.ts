import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  SkillAccess,
  AddSkillOutput,
  SkillContext,
  ExecSkillInput,
  ExecSkillOutput,
  SKILL_USAGE_TABLE,
} from '@brian-agent/base';
import { Operator } from '@brian-agent/base';

/**
 * SkillProvider.execSkill 真机资源采集验证：
 * addSkill（含 scripts/collect.py）→ execSkill → LocalSandbox 真实 Python 执行 →
 * stdout JSON 解析为本机资源使用情况（CPU/内存/磁盘/负载）→ usage 记录落库。
 */

/** 资源采集脚本（仅标准库；只向 stdout 输出一段 JSON，stderr 静默） */
const COLLECT_PY = [
  'import json, os, shutil, time',
  '',
  'def read_mem():',
  "    mem = {}",
  "    with open('/proc/meminfo') as f:",
  '        for line in f:',
  "            k, v = line.split(':', 1)",
  "            mem[k.strip()] = int(v.strip().split()[0])",
  "    total, available = mem['MemTotal'], mem['MemAvailable']",
  '    return {',
  "        'mem_total_mb': round(total / 1024, 1),",
  "        'mem_available_mb': round(available / 1024, 1),",
  "        'mem_used_mb': round((total - available) / 1024, 1),",
  "        'mem_used_percent': round((total - available) * 100.0 / total, 1),",
  '    }',
  '',
  'def cpu_busy_percent():',
  '    def times():',
  "        with open('/proc/stat') as f:",
  '            vals = list(map(int, f.readline().split()[1:]))',
  '        idle = vals[3] + (vals[4] if len(vals) > 4 else 0)',
  '        return idle, sum(vals)',
  '    idle1, total1 = times()',
  '    time.sleep(0.3)',
  '    idle2, total2 = times()',
  '    dt = total2 - total1',
  '    return round((dt - (idle2 - idle1)) * 100.0 / dt, 1) if dt > 0 else 0.0',
  '',
  'result = {',
  "    'skill': 'system-resource-report',",
  "    'timestamp': int(time.time()),",
  "    'hostname': os.uname().nodename,",
  "    'platform': os.uname().sysname + ' ' + os.uname().release,",
  "    'cpu_count': os.cpu_count(),",
  "    'load_avg_1m_5m_15m': [round(float(x), 2) for x in os.getloadavg()],",
  "    'cpu_busy_percent': cpu_busy_percent(),",
  '}',
  'result.update(read_mem())',
  "du = shutil.disk_usage('/')",
  "result['disk_total_gb'] = round(du.total / 1024 ** 3, 1)",
  "result['disk_free_gb'] = round(du.free / 1024 ** 3, 1)",
  "result['disk_used_percent'] = round(du.used * 100.0 / du.total, 1)",
  'print(json.dumps(result, ensure_ascii=False))',
].join('\n');

const LINUX = fs.existsSync('/proc/meminfo') && fs.existsSync('/proc/stat');

describe('SkillProvider.execSkill 真机资源采集（system-resource-report）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let skillAccess: SkillAccess;
  let skillId: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-skill-res-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db') });
    await relationDb.initialize();
    skillAccess = new SkillAccess(relationDb);
    await skillAccess.initialize();
    const addOut = new AddSkillOutput();
    await skillAccess.addSkill(
      {
        data: {
          name: 'system-resource-report',
          skill_brief: '采集本机资源使用情况（CPU/内存/磁盘/负载），输出 JSON',
          skill_md: '# system-resource-report\n执行 scripts/collect.py 输出本机资源 JSON。',
          enable: true,
          scripts: [{ name: 'collect.py', content: COLLECT_PY }],
        },
      } as never,
      addOut,
      new SkillContext(),
    );
    skillId = addOut.id;
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it.skipIf(!LINUX)('execSkill 真机执行 Python 脚本，返回本机资源使用情况并记录 usage', async () => {
    const input = new ExecSkillInput();
    input.id = skillId;
    input.params = {};
    const output = new ExecSkillOutput();
    const ok = await skillAccess.execSkill(input, output, new SkillContext());
    expect(ok).toBe(true);

    // stdout 为一段可解析 JSON（LocalSandbox 契约：py 脚本 stdout 即结果）
    const usage = JSON.parse(String(output.result)) as Record<string, unknown>;
    console.log('[本机资源使用情况]', JSON.stringify(usage, null, 2));

    expect(usage['skill']).toBe('system-resource-report');
    expect(Number(usage['cpu_count'])).toBeGreaterThanOrEqual(1);
    expect(Number(usage['mem_total_mb'])).toBeGreaterThan(0);
    expect(Number(usage['mem_used_percent'])).toBeGreaterThan(0);
    expect(Number(usage['mem_used_percent'])).toBeLessThanOrEqual(100);
    expect(Number(usage['cpu_busy_percent'])).toBeGreaterThanOrEqual(0);
    expect(Number(usage['cpu_busy_percent'])).toBeLessThanOrEqual(100);
    expect(Number(usage['disk_used_percent'])).toBeGreaterThan(0);
    expect(Number(usage['disk_used_percent'])).toBeLessThanOrEqual(100);
    expect((usage['load_avg_1m_5m_15m'] as number[])).toHaveLength(3);
    expect(String(usage['hostname'])).toBe(os.hostname());

    // execSkill 副作用：SKILL_USAGE_TABLE 当日 usage_count = 1
    const row = await relationDb.selectOne(SKILL_USAGE_TABLE, [
      { field: 'skill_id', operator: Operator.EQ, value: skillId },
    ]);
    expect(row).not.toBeNull();
    expect(Number(row?.usage_count)).toBe(1);
  });

  it('行级 enable=false 的 Skill 执行被拒绝（updateSkill 禁用后 execSkill 抛错）', async () => {
    const input = new ExecSkillInput();
    input.id = skillId;
    input.params = {};
    const output = new ExecSkillOutput();
    await skillAccess.updateSkill({ id: skillId, data: { enable: false } } as never, {} as never, new SkillContext());
    await expect(skillAccess.execSkill(input, output, new SkillContext())).rejects.toThrow(/已禁用/);
  });
});
