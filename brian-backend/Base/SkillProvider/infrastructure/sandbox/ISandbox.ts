export interface SandboxResult {
  
  result: unknown;
}

export interface ISandbox {
  

  execute(
    code: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<SandboxResult>;

  

  dispose(): void;
}
