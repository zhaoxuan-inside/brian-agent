/**
 * @fileoverview 基于 isolated-vm 的沙箱实现。
 *
 * 使用 isolated-vm 提供真正的进程级隔离：
 * - 独立 V8 Isolate：拥有自己的堆内存空间，与宿主 Node.js 主 Isolate 完全隔离；
 * - 内存限制：通过 memoryLimit 限制沙箱可用内存，防止恶意脚本耗尽系统内存；
 * - 超时控制：通过 timeout 机制限制脚本执行时间；
 * - console.log 空实现：避免沙箱输出污染主进程。
 *
 * isolated-vm 为 C++ 原生扩展，通过 node-gyp 预编译为 .node 文件，
 * 随离线包一起集成到 SkillProvider 模块中。
 */

import ivm from 'isolated-vm';
import type { ISandbox, SandboxResult } from './ISandbox';

/**
 * isolated-vm 沙箱实现。
 *
 * 每次 execute 调用会创建新的 Context 并在其中执行代码，
 * 执行完毕后自动释放 Context。Isolate 实例在 dispose 时销毁。
 */
export class IsolatedVMSandbox implements ISandbox {
  private isolate: ivm.Isolate;

  /**
   * @param memoryLimitMB 沙箱可用内存上限（MB），默认 128MB。
   *  该值影响 v8 堆大小与外部分配内存的总和。
   */
  constructor(memoryLimitMB = 128) {
    this.isolate = new ivm.Isolate({ memoryLimit: memoryLimitMB });
  }

  /**
   * 在 isolated-vm 沙箱中执行 Skill 的操作指南（work）。
   *
   * 处理流程：
   * 1. 创建 Context（独立的全局作用域）；
   * 2. 将 params 通过 ExternalCopy 拷贝进沙箱全局作用域；
   * 3. 将 result 初始化为 null；
   * 4. 在沙箱代码头部注入 no-op console 定义，避免 console.log 污染主进程；
   * 5. 编译并执行代码（带超时限制，超时抛出错误）；
   * 6. 从沙箱全局作用域读取 result 并拷贝回主进程；
   * 7. 释放 Context 资源。
   */
  async execute(
    code: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<SandboxResult> {
    const context = await this.isolate.createContext();
    try {
      const jail = context.global;

      await jail.set('params', params, { copy: true });
      await jail.set('result', null);

      const wrappedCode = `var console={log:function(){}};\n${code}`;
      const script = await this.isolate.compileScript(wrappedCode);
      await script.run(context, { timeout: timeoutMs });

      const result = await jail.get('result', { copy: true });
      return { result };
    } finally {
      context.release();
    }
  }

  /**
   * 销毁 Isolate 实例，释放 V8 堆及所有关联资源。
   */
  dispose(): void {
    this.isolate.dispose();
  }
}
