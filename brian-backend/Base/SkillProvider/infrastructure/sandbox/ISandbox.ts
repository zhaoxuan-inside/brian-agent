/**
 * @fileoverview 沙箱执行抽象接口。
 *
 * 将 Skill 的沙箱执行能力抽象为接口，便于后续灵活切换不同沙箱实现
 * （如 isolated-vm、Node.js vm、WebAssembly 等）。
 */

/**
 * 沙箱执行结果。
 */
export interface SandboxResult {
  /** 沙箱中脚本执行后的 result 变量值 */
  result: unknown;
}

/**
 * 沙箱执行接口。
 *
 * 所有沙箱实现需遵循此契约，提供代码执行与资源释放能力。
 */
export interface ISandbox {
  /**
   * 在沙箱中执行指定代码。
   *
   * @param code JavaScript 代码字符串，沙箱内通过 `params` 访问传入参数，
   *  通过 `result` 变量返回执行结果。
   * @param params 沙箱中可用的参数对象，通过结构化克隆拷贝进沙箱。
   * @param timeoutMs 执行超时时间（毫秒），超时后终止执行并抛出错误。
   * @returns 沙箱执行结果，包含 `result` 字段。
   */
  execute(
    code: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<SandboxResult>;

  /**
   * 销毁沙箱实例，释放所有相关资源（内存、句柄等）。
   */
  dispose(): void;
}
