import type { ISandbox, SandboxResult } from './ISandbox';

type IvmModule = typeof import('isolated-vm');

export class IsolatedVMSandbox implements ISandbox {
  private isolate: InstanceType<IvmModule['Isolate']>;

  

  constructor(memoryLimitMB = 128) {
    
    
    
    
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const ivm = require('isolated-vm') as IvmModule;
    this.isolate = new ivm.Isolate({ memoryLimit: memoryLimitMB });
  }

  

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

  

  dispose(): void {
    this.isolate.dispose();
  }
}
