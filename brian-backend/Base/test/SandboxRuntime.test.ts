/**
 * @fileoverview 沙箱运行时契约单元测试（Sandbox Runtime Contract）。
 *
 * 覆盖（SkillProvider-PRD §5）：
 * - 平台候选定位序列（win32/darwin/linux）与环境变量覆盖；
 * - WSL bash shim 拒绝（纯函数）；
 * - 启动期解析成功（版本字段）与 fail-fast（坏覆盖 → SandboxRuntimeError，零降级）；
 * - LocalSandbox 注入运行时后的真实 .py/.sh 执行与超时终止。
 */

import { describe, it, expect } from 'vitest';
import {
  pythonCandidates,
  bashCandidates,
  isWslBashShim,
  resolveSandboxRuntime,
  SandboxRuntimeError,
} from '../SkillProvider/infrastructure/sandbox/SandboxRuntime';
import { LocalSandbox } from '../SkillProvider/infrastructure/sandbox/LocalSandbox';

describe('SandboxRuntime 候选定位序列', () => {
  it('win32 Python 自动候选：py -3 → python；覆盖即唯一候选（不落回自动定位）', () => {
    expect(pythonCandidates('win32', {}).map((c) => c.prefix)).toEqual(['py -3', 'python']);
    const withEnv = pythonCandidates('win32', { BRIAN_SANDBOX_PYTHON: 'C:\\Program Files\\Python312\\python.exe -3' });
    expect(withEnv.map((c) => c.prefix)).toEqual(['"C:\\Program Files\\Python312\\python.exe -3"']);
  });

  it('POSIX Python 自动候选：python3；覆盖即唯一候选', () => {
    expect(pythonCandidates('linux', {}).map((c) => c.prefix)).toEqual(['python3']);
    expect(pythonCandidates('darwin', { BRIAN_SANDBOX_PYTHON: '/opt/py/bin/python3' }).map((c) => c.prefix))
      .toEqual(['/opt/py/bin/python3']);
  });

  it('win32 Bash 自动候选：Git Bash 标准安装点 → PATH；覆盖即唯一候选', () => {
    const seq = bashCandidates('win32', { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }).map((c) => c.prefix);
    expect(seq).toEqual([
      '"C:\\Program Files\\Git\\bin\\bash.exe"',
      '"C:\\Program Files (x86)\\Git\\bin\\bash.exe"',
      'C:\\Users\\u\\AppData\\Local\\Programs\\Git\\bin\\bash.exe',
      'bash',
    ]);
    const withEnv = bashCandidates('win32', { BRIAN_SANDBOX_BASH: 'D:\\tools\\bash.exe' }).map((c) => c.prefix);
    expect(withEnv).toEqual(['D:\\tools\\bash.exe']);
  });

  it('WSL bash shim 必须被拒绝（cwd/env 语义与沙箱契约不兼容）', () => {
    expect(isWslBashShim('C:\\Windows\\System32\\bash.exe')).toBe(true);
    expect(isWslBashShim('/mnt/c/Windows/System32/bash.exe')).toBe(true);
    expect(isWslBashShim('C:\\Program Files\\Git\\bin\\bash.exe')).toBe(false);
  });
});

describe('resolveSandboxRuntime（启动期契约）', () => {
  it('当前平台应解析成功并带版本信息', () => {
    const rt = resolveSandboxRuntime();
    expect(rt.python).toBeTruthy();
    expect(rt.bash).toBeTruthy();
    expect(rt.pythonVersion).toMatch(/Python 3\./);
    expect(rt.bashVersion).toMatch(/bash/i);
  });

  it('覆盖指向不存在的解释器时应 fail-fast（零降级，错误含修复指引）', () => {
    expect(() => resolveSandboxRuntime('linux', { BRIAN_SANDBOX_PYTHON: '/nonexistent/python-x' }))
      .toThrow(SandboxRuntimeError);
    try {
      resolveSandboxRuntime('linux', { BRIAN_SANDBOX_PYTHON: '/nonexistent/python-x' });
    } catch (e) {
      expect((e as Error).message).toContain('不做任何降级');
      expect((e as Error).message).toContain('BRIAN_SANDBOX_PYTHON');
    }
  });

  it('win32 平台的 Bash 缺失指引应指向 Git Bash 部署前置', () => {
    // Python 用覆盖指向宿主可用解释器，隔离出 Bash 解析失败路径
    try {
      resolveSandboxRuntime('win32', { BRIAN_SANDBOX_PYTHON: 'python3', BRIAN_SANDBOX_BASH: 'C:\\nonexistent\\bash.exe' });
      throw new Error('should not reach');
    } catch (e) {
      expect(e).toBeInstanceOf(SandboxRuntimeError);
      expect((e as Error).message).toContain('Git for Windows');
    }
  });
});

describe('LocalSandbox（注入运行时后真实执行）', () => {
  it('py/sh 脚本应正确执行且参数注入', () => {
    const sandbox = new LocalSandbox(resolveSandboxRuntime(), 15000);
    const py = sandbox.execute('import os\nprint("py-ok", os.environ.get("SKILL_PARAM_X", ""))', 'py', { x: 'v1' });
    expect(py.stdout).toContain('py-ok v1');
    const sh = sandbox.execute('echo "sh-ok $SKILL_PARAM_X"', 'sh', { x: 'v2' });
    expect(sh.stdout).toContain('sh-ok v2');
  });

  it('超时脚本应被终止并返回明确超时信息', () => {
    const sandbox = new LocalSandbox(resolveSandboxRuntime(), 2000);
    const r = sandbox.execute('sleep 30', 'sh', {});
    expect(r.stdout).toContain('执行超时');
  });
});
