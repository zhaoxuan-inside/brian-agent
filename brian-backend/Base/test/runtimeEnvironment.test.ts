import { describe, it, expect } from 'vitest';
import {
  collectRuntimeEnvironment,
  detectRuntimeOs,
  formatRuntimeEnvironment,
  mergePromptContext,
} from '../PromptCatalog/runtimeEnvironment';

describe('runtimeEnvironment', () => {
  it('detectRuntimeOs 识别常见平台', () => {
    expect(detectRuntimeOs('darwin')).toBe('macos');
    expect(detectRuntimeOs('win32')).toBe('windows');
    expect(detectRuntimeOs('linux')).toBe('linux');
  });

  it('collectRuntimeEnvironment 给出本机路径', () => {
    const env = collectRuntimeEnvironment();
    expect(env.os).toMatch(/macos|windows|linux/);
    expect(env.homedir.length).toBeGreaterThan(0);
    expect(env.downloads_dir.endsWith('Downloads') || env.downloads_dir.includes('Downloads')).toBe(true);
  });

  it('formatRuntimeEnvironment 要求只交付当前系统的最终结果', () => {
    const text = formatRuntimeEnvironment({
      os: 'macos',
      os_label: 'macOS',
      platform: 'darwin',
      arch: 'arm64',
      homedir: '/Users/demo',
      cwd: '/Users/demo/app',
      downloads_dir: '/Users/demo/Downloads',
      username: 'demo',
      shell: '/bin/zsh',
    });
    expect(text).toContain('macOS');
    expect(text).toContain('/Users/demo/Downloads');
    expect(text).toContain('不要输出其他操作系统的对照方案');
    expect(text).toContain('直接给出本机结果');
  });

  it('mergePromptContext 跳过空段', () => {
    expect(mergePromptContext('', 'A', null, 'B')).toBe('A\n\nB');
  });
});
