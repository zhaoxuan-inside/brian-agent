import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { logger } from '../infrastructure/logger';

const execAsync = promisify(exec);

async function getSystemProxyEnv(): Promise<Record<string, string>> {
  const proxyEnv: Record<string, string> = {};
  
  logger.info('MCP', '[Network] Detecting system proxy configuration...');
  
  const envProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const envHttpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  
  logger.info('MCP', `[Network] Environment variables - HTTP_PROXY: ${envProxy || 'not set'}, HTTPS_PROXY: ${envHttpsProxy || 'not set'}`);
  
  if (envProxy) {
    proxyEnv.http_proxy = envProxy;
    proxyEnv.HTTP_PROXY = envProxy;
    logger.info('MCP', `[Network] Using proxy from environment: HTTP_PROXY=${envProxy}`);
  }
  if (envHttpsProxy) {
    proxyEnv.https_proxy = envHttpsProxy;
    proxyEnv.HTTPS_PROXY = envHttpsProxy;
    logger.info('MCP', `[Network] Using proxy from environment: HTTPS_PROXY=${envHttpsProxy}`);
  }
  
  if (Object.keys(proxyEnv).length > 0) {
    return proxyEnv;
  }
  
  try {
    const result = await execAsync('gsettings get org.gnome.system.proxy.http host 2>/dev/null || echo ""');
    const host = result.stdout.trim().replace(/'/g, '');
    if (host) {
      const portResult = await execAsync('gsettings get org.gnome.system.proxy.http port 2>/dev/null || echo "8080"');
      const port = portResult.stdout.trim();
      const proxyUrl = `http://${host}:${port}`;
      proxyEnv.http_proxy = proxyUrl;
      proxyEnv.HTTP_PROXY = proxyUrl;
      proxyEnv.https_proxy = proxyUrl;
      proxyEnv.HTTPS_PROXY = proxyUrl;
      logger.info('MCP', `[Network] Using proxy from GNOME settings: ${proxyUrl}`);
    } else {
      logger.info('MCP', '[Network] GNOME proxy not configured');
    }
  } catch (_err) {
    logger.info('MCP', '[Network] GNOME proxy detection skipped (not a GNOME environment)');
  }
  
  if (Object.keys(proxyEnv).length > 0) {
    return proxyEnv;
  }
  
  try {
    const gitProxy = await execAsync('git config --global --get http.proxy 2>/dev/null || git config --get http.proxy 2>/dev/null');
    const gitHttpsProxy = await execAsync('git config --global --get https.proxy 2>/dev/null || git config --get https.proxy 2>/dev/null');
    logger.info('MCP', `[Network] Git config proxy - http.proxy: ${gitProxy.stdout.trim() || 'not set'}, https.proxy: ${gitHttpsProxy.stdout.trim() || 'not set'}`);
    if (gitProxy.stdout.trim()) {
      proxyEnv.http_proxy = gitProxy.stdout.trim();
      proxyEnv.HTTP_PROXY = gitProxy.stdout.trim();
      logger.info('MCP', `[Network] Using proxy from git config: http.proxy=${gitProxy.stdout.trim()}`);
    }
    if (gitHttpsProxy.stdout.trim()) {
      proxyEnv.https_proxy = gitHttpsProxy.stdout.trim();
      proxyEnv.HTTPS_PROXY = gitHttpsProxy.stdout.trim();
      logger.info('MCP', `[Network] Using proxy from git config: https.proxy=${gitHttpsProxy.stdout.trim()}`);
    }
  } catch {
    logger.info('MCP', '[Network] Git proxy detection failed');
  }
  
  if (Object.keys(proxyEnv).length === 0) {
    logger.info('MCP', '[Network] No proxy configuration detected, using direct connection');
  }
  
  return proxyEnv;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPInstallationResult {
  success: boolean;
  packageName: string;
  displayName: string;
  version: string;
  installPath: string;
  startCommand: string;
  tools: McpTool[];
  error?: string;
}

export interface MCPTestResult {
  success: boolean;
  message: string;
  toolList?: McpTool[];
}

export interface MCPInstaller {
  install(packageName: string, displayName: string, options?: Record<string, unknown>): Promise<MCPInstallationResult>;
  uninstall(mcpId: string, installPath: string): Promise<boolean>;
  test(installPath: string, startCommand: string): Promise<MCPTestResult>;
  start(installPath: string, startCommand: string): Promise<{ success: boolean; port: number; processId?: number }>;
  stop(processId: number): Promise<boolean>;
}

export class MCPStrategyFactory {
  static getProjectRoot(): string {
    return path.resolve(__dirname, '../../..');
  }

  static getMcpsDir(): string {
    return path.join(this.getProjectRoot(), 'mcps');
  }

  static getInstallDir(packageName: string): string {
    const cleanName = packageName.replace(/[@/]/g, '-');
    return path.join(this.getMcpsDir(), cleanName);
  }

  static getNpmPath(): string {
    const nodePath = process.execPath;
    const nodeDir = path.dirname(nodePath);
    const npmPath = path.join(nodeDir, process.platform === 'win32' ? 'npm.cmd' : 'npm');
    if (fs.existsSync(npmPath)) {
      return npmPath;
    }
    return 'npm';
  }

  static async isGitAvailable(): Promise<boolean> {
    try {
      await execAsync('git --version');
      return true;
    } catch {
      return false;
    }
  }

  static async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker --version');
      return true;
    } catch {
      return false;
    }
  }

  static getInstaller(installType: 'npm' | 'git' | 'docker'): MCPInstaller {
    switch (installType) {
      case 'npm':
        return new NpmMcpInstaller();
      case 'git':
        return new GitMcpInstaller();
      case 'docker':
        return new DockerMcpInstaller();
      default:
        return new NpmMcpInstaller();
    }
  }
}

export class NpmMcpInstaller implements MCPInstaller {
  async install(packageName: string, displayName: string, _options?: Record<string, unknown>): Promise<MCPInstallationResult> {
    const installDir = MCPStrategyFactory.getInstallDir(packageName);
    
    logger.info('MCP', `Installing MCP: ${packageName}, installDir: ${installDir}`);
    
    if (fs.existsSync(installDir)) {
      const pkgJsonPath = path.join(installDir, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        logger.info('MCP', `Package already installed: ${pkgJson.name} ${pkgJson.version}`);
        return {
          success: true,
          packageName,
          displayName: displayName || pkgJson.name || packageName,
          version: pkgJson.version || '',
          installPath: installDir,
          startCommand: this.getStartCommand(pkgJson),
          tools: [],
        };
      }
    }

    fs.mkdirSync(installDir, { recursive: true });

    try {
      const npmPath = MCPStrategyFactory.getNpmPath();
      logger.info('MCP', `Using npm path: ${npmPath}`);
      logger.info('MCP', `Running npm install: ${packageName}`);
      
      let installPackageName = packageName;
      let isGitHubRepo = false;
      
      if (packageName.includes('/') && !packageName.startsWith('@') && !packageName.startsWith('http')) {
        installPackageName = `https://github.com/${packageName}.git`;
        isGitHubRepo = true;
        logger.info('MCP', `[Network] Converting GitHub package name to HTTPS URL: ${packageName} -> ${installPackageName}`);
      }
      
      if (isGitHubRepo) {
        logger.info('MCP', `[Network] Using git clone directly for GitHub repository`);
        await this.runCommand('git', ['clone', '--depth', '1', installPackageName, '.'], { cwd: installDir });
      } else {
        await this.runCommand(npmPath, ['install', installPackageName], { cwd: installDir });
      }

      let pkgJsonPath = path.join(installDir, 'node_modules', packageName, 'package.json');
      
      if (isGitHubRepo) {
        pkgJsonPath = path.join(installDir, 'package.json');
        logger.info('MCP', `[Network] Running npm install for dependencies in ${installDir}`);
        await this.runCommand(npmPath, ['install'], { cwd: installDir });
      }
      
      let version = '0.0.0';
      let startCommand = '';
      
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        version = pkgJson.version || '0.0.0';
        startCommand = this.getStartCommand(pkgJson);
        logger.info('MCP', `Installed successfully: ${packageName} ${version}`);
      } else {
        logger.warn('MCP', `Warning: package.json not found at ${pkgJsonPath}`);
      }

      return {
        success: true,
        packageName,
        displayName: displayName || packageName,
        version,
        installPath: installDir,
        startCommand,
        tools: [],
      };
    } catch (err: any) {
      logger.error('MCP', `Installation failed: ${err.message}`);
      return {
        success: false,
        packageName,
        displayName: displayName || packageName,
        version: '',
        installPath: installDir,
        startCommand: '',
        tools: [],
        error: err.message,
      };
    }
  }

  private getStartCommand(pkgJson: any): string {
    if (pkgJson.bin) {
      if (typeof pkgJson.bin === 'string') {
        return path.basename(pkgJson.bin);
      } else if (typeof pkgJson.bin === 'object') {
        return Object.keys(pkgJson.bin)[0];
      }
    }
    if (pkgJson.scripts?.start) {
      return `npm start`;
    }
    return '';
  }

  async uninstall(_mcpId: string, installPath: string): Promise<boolean> {
    try {
      if (fs.existsSync(installPath)) {
        fs.rmSync(installPath, { recursive: true, force: true });
      }
      return true;
    } catch {
      return false;
    }
  }

  async test(installPath: string, startCommand: string): Promise<MCPTestResult> {
    if (!startCommand) {
      return { success: true, message: 'No start command defined, skipping test' };
    }

    try {
      const { port } = await this.start(installPath, startCommand);
      await new Promise(r => setTimeout(r, 2000));
      
      try {
        const response = await fetch(`http://localhost:${port}/tools/list`);
        if (response.ok) {
          const data = await response.json();
          await this.stop(0);
          return {
            success: true,
            message: 'MCP test passed',
            toolList: Array.isArray(data) ? data.map((t: any) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema || {},
            })) : [],
          };
        }
      } catch {
        await this.stop(0);
      }
      
      return { success: false, message: 'Failed to connect to MCP server' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async start(installPath: string, startCommand: string): Promise<{ success: boolean; port: number; processId?: number }> {
    const port = this.getAvailablePort();
    
    let command: string;
    let args: string[];
    
    if (startCommand.startsWith('npm ')) {
      command = MCPStrategyFactory.getNpmPath();
      args = startCommand.split(' ').slice(1);
    } else {
      command = startCommand;
      args = [];
    }

    const env = {
      ...process.env,
      PORT: String(port),
    };

    const child = spawn(command, args, {
      cwd: installPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return new Promise((resolve) => {
      const timeoutMs = 5 * 60 * 1000;
      logger.info('MCP', `Starting MCP server, timeout: ${timeoutMs / 1000}s, port: ${port}`);
      
      const timeout = setTimeout(() => {
        logger.error('MCP', `Start timeout after ${timeoutMs / 1000}s, port: ${port}`);
        child.kill();
        resolve({ success: false, port });
      }, timeoutMs);

      child.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('MCP', `Start error: ${err.message}`);
        resolve({ success: false, port });
      });

      child.stdout.on('data', (data) => {
        logger.debug('MCP', `Server stdout: ${data.toString().trim()}`);
      });

      child.stderr.on('data', (data) => {
        logger.debug('MCP', `Server stderr: ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        logger.info('MCP', `Server closed, exit code: ${code}`);
        if (code !== 0) {
          resolve({ success: false, port });
        }
      });

      setTimeout(() => {
        clearTimeout(timeout);
        logger.info('MCP', `Server started successfully, port: ${port}, pid: ${child.pid}`);
        resolve({ success: true, port, processId: child.pid });
      }, 5000);
    });
  }

  async stop(_processId: number): Promise<boolean> {
    return true;
  }

  private getAvailablePort(): number {
    return 10000 + Math.floor(Math.random() * 10000);
  }

  private async runCommand(command: string, args: string[], options?: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = 5 * 60 * 1000;
    const systemProxyEnv = await getSystemProxyEnv();
    
    logger.info('MCP', `[Network] Executing network command: ${command} ${args.join(' ')}`);
    logger.info('MCP', `[Network] Working directory: ${options?.cwd || process.cwd()}`);
    logger.info('MCP', `[Network] Timeout: ${timeoutMs / 1000} seconds`);
    logger.info('MCP', `[Network] Available environment proxies - http_proxy: ${process.env.http_proxy || 'not set'}, https_proxy: ${process.env.https_proxy || 'not set'}`);
    logger.info('MCP', `[Network] Detected system proxy - ${Object.keys(systemProxyEnv).length > 0 ? systemProxyEnv.http_proxy : 'none'}`);
    
    return new Promise((resolve, reject) => {
      logger.info('MCP', `[Network] Spawning child process with PID tracking`);
      const child = spawn(command, args, {
        ...options,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          ...systemProxyEnv,
          ...(options?.env || {}),
        },
      });
      
      logger.info('MCP', `[Network] Child process PID: ${child.pid}`);
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        logger.debug('MCP', `[Network] stdout chunk (${chunk.length} chars): ${chunk.trim()}`);
      });
      
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        logger.debug('MCP', `[Network] stderr chunk (${chunk.length} chars): ${chunk.trim()}`);
        
        if (chunk.includes('Failed to connect') || chunk.includes('Connection refused') || chunk.includes('timed out')) {
          logger.error('MCP', `[Network] Connection error detected: ${chunk.trim()}`);
        }
        if (chunk.includes('Permission denied')) {
          logger.error('MCP', `[Network] Permission error detected: ${chunk.trim()}`);
        }
        if (chunk.includes('not found') || chunk.includes('No such file')) {
          logger.error('MCP', `[Network] File not found error detected: ${chunk.trim()}`);
        }
      });
      
      const timeout = setTimeout(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.error('MCP', `[Network] Command TIMEOUT after ${elapsed}s (max: ${timeoutMs / 1000}s)`);
        logger.error('MCP', `[Network] Command: ${command} ${args.join(' ')}`);
        logger.error('MCP', `[Network] Working directory: ${options?.cwd || process.cwd()}`);
        logger.error('MCP', `[Network] Last stdout (${stdout.length} chars): ${stdout.slice(-1000)}`);
        logger.error('MCP', `[Network] Last stderr (${stderr.length} chars): ${stderr.slice(-1000)}`);
        logger.error('MCP', `[Network] Possible causes: network timeout, proxy not working, or remote server unreachable`);
        child.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeoutMs / 1000} seconds: ${command} ${args.join(' ')}\n${stderr}`));
      }, timeoutMs);
      
      child.on('close', (code) => {
        clearTimeout(timeout);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info('MCP', `[Network] Command completed, exit code: ${code}, duration: ${duration}s`);
        if (code === 0) {
          logger.info('MCP', `[Network] Command succeeded, stdout length: ${stdout.length} chars`);
          resolve();
        } else {
          logger.error('MCP', `[Network] Command FAILED with exit code ${code}`);
          logger.error('MCP', `[Network] Full stdout: ${stdout || '(empty)'}`);
          logger.error('MCP', `[Network] Full stderr: ${stderr || '(empty)'}`);
          
          if (command === 'git' && args[0] === 'clone') {
            logger.error('MCP', `[Network] Git clone failed - check network connectivity, proxy settings, or repository URL`);
          }
          if (command.includes('npm') && args[0] === 'install') {
            logger.error('MCP', `[Network] npm install failed - check npm registry configuration or network`);
          }
          
          reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}\n${stderr}`));
        }
      });
      
      child.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('MCP', `[Network] Process execution ERROR: ${err.message}`);
        const error = err as NodeJS.ErrnoException;
        logger.error('MCP', `[Network] Error code: ${error.code}`);
        if (error.code === 'ENOENT') {
          logger.error('MCP', `[Network] Command not found: ${command} - ensure the tool is installed`);
        }
        if (error.code === 'EACCES') {
          logger.error('MCP', `[Network] Permission denied: ${command} - check file permissions`);
        }
        reject(new Error(`Command execution error: ${err.message}`));
      });
    });
  }
}

export class GitMcpInstaller implements MCPInstaller {
  async install(packageName: string, displayName: string, options?: Record<string, unknown>): Promise<MCPInstallationResult> {
    const available = await MCPStrategyFactory.isGitAvailable();
    if (!available) {
      return {
        success: false,
        packageName,
        displayName,
        version: '',
        installPath: '',
        startCommand: '',
        tools: [],
        error: 'Git is not installed. Please install Git first.',
      };
    }

    const repoName = this.getRepoNameFromUrl(packageName);
    const installDir = MCPStrategyFactory.getInstallDir(repoName);
    
    if (fs.existsSync(installDir)) {
      const hasGitDir = fs.existsSync(path.join(installDir, '.git'));
      const hasPackageJson = fs.existsSync(path.join(installDir, 'package.json'));
      if (hasGitDir || hasPackageJson) {
        logger.info('MCP', `Directory already exists with valid content: ${installDir}`);
        const pkgJsonPath = path.join(installDir, 'package.json');
        let version = '';
        let startCommand = '';
        if (hasPackageJson) {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
          version = pkgJson.version || '';
          startCommand = this.getStartCommand(pkgJson);
        }
        return {
          success: true,
          packageName,
          displayName: displayName || packageName,
          version,
          installPath: installDir,
          startCommand,
          tools: [],
        };
      } else {
        logger.info('MCP', `Directory exists but is empty, removing and reinstalling: ${installDir}`);
        fs.rmSync(installDir, { recursive: true, force: true });
      }
    }

    fs.mkdirSync(path.dirname(installDir), { recursive: true });

    const repoUrl = (options?.repoUrl as string) || this.getGitHubUrl(packageName);
    try {
      const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy || 'none';
      const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || 'none';
      
      logger.info('MCP', `[HTTPS Clone] ==================== CLONE START ====================`);
      logger.info('MCP', `[HTTPS Clone] Operation: Git repository clone`);
      logger.info('MCP', `[HTTPS Clone] Target URL: ${repoUrl}`);
      logger.info('MCP', `[HTTPS Clone] Protocol: ${repoUrl.startsWith('https://') ? 'HTTPS' : (repoUrl.startsWith('git@') ? 'SSH' : 'Unknown')}`);
      logger.info('MCP', `[HTTPS Clone] Install directory: ${installDir}`);
      logger.info('MCP', `[HTTPS Clone] Clone depth: 1 (shallow clone)`);
      logger.info('MCP', `[HTTPS Clone] Environment proxy - HTTP_PROXY: ${httpProxy}, HTTPS_PROXY: ${httpsProxy}`);
      logger.info('MCP', `[HTTPS Clone] Timestamp: ${new Date().toISOString()}`);
      logger.info('MCP', `[HTTPS Clone] ======================================================`);
      
      await this.runCommand('git', ['clone', '--depth', '1', repoUrl, installDir]);
      
      logger.info('MCP', `[HTTPS Clone] ==================== CLONE SUCCESS ====================`);
      logger.info('MCP', `[HTTPS Clone] Repository successfully cloned from: ${repoUrl}`);
      logger.info('MCP', `[HTTPS Clone] Installed to: ${installDir}`);
      logger.info('MCP', `[HTTPS Clone] ========================================================`);

      const pkgJsonPath = path.join(installDir, 'package.json');
      let version = '0.0.0';
      let startCommand = '';
      
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        version = pkgJson.version || '0.0.0';
        
        const npmPath = MCPStrategyFactory.getNpmPath();
        await this.runCommand(npmPath, ['install'], { cwd: installDir });
        
        startCommand = this.getStartCommand(pkgJson);
      }

      return {
        success: true,
        packageName,
        displayName: displayName || packageName,
        version,
        installPath: installDir,
        startCommand,
        tools: [],
      };
    } catch (err: any) {
      logger.error('MCP', `[HTTPS Clone] ==================== CLONE FAILED ====================`);
      logger.error('MCP', `[HTTPS Clone] Repository: ${repoUrl}`);
      logger.error('MCP', `[HTTPS Clone] Error message: ${err.message}`);
      logger.error('MCP', `[HTTPS Clone] Error stack: ${err.stack || '(no stack)'}`);
      logger.error('MCP', `[HTTPS Clone] Timestamp: ${new Date().toISOString()}`);
      logger.error('MCP', `[HTTPS Clone] ======================================================`);
      logger.error('MCP', `[HTTPS Clone] Troubleshooting Guide:`);
      logger.error('MCP', `[HTTPS Clone] 1. Check network connectivity: ping github.com`);
      logger.error('MCP', `[HTTPS Clone] 2. Verify repository URL is correct: ${repoUrl}`);
      logger.error('MCP', `[HTTPS Clone] 3. Check proxy configuration: HTTP_PROXY=${process.env.HTTP_PROXY || 'not set'}, HTTPS_PROXY=${process.env.HTTPS_PROXY || 'not set'}`);
      logger.error('MCP', `[HTTPS Clone] 4. Ensure system proxy (GNOME/WIN) is properly configured`);
      logger.error('MCP', `[HTTPS Clone] 5. Check firewall settings that may block outbound connections`);
      logger.error('MCP', `[HTTPS Clone] ======================================================`);
      return {
        success: false,
        packageName,
        displayName: displayName || packageName,
        version: '',
        installPath: installDir,
        startCommand: '',
        tools: [],
        error: err.message,
      };
    }
  }

  private getGitHubUrl(packageName: string): string {
    if (packageName.startsWith('git@')) {
      const repoPath = packageName.replace('git@github.com:', '');
      return `https://github.com/${repoPath}`;
    }
    let httpsUrl: string;
    if (packageName.startsWith('https://github.com/')) {
      httpsUrl = packageName.endsWith('.git') ? packageName : `${packageName}.git`;
    } else if (packageName.startsWith('http://github.com/')) {
      httpsUrl = `https://github.com/${packageName.replace('http://github.com/', '')}.git`;
    } else if (packageName.startsWith('github.com/')) {
      httpsUrl = `https://github.com/${packageName.replace('github.com/', '')}.git`;
    } else {
      httpsUrl = `https://github.com/${packageName}.git`;
    }
    return httpsUrl;
  }

  private getRepoNameFromUrl(url: string): string {
    let name = url;
    if (name.startsWith('https://github.com/')) {
      name = name.replace('https://github.com/', '');
    } else if (name.startsWith('http://github.com/')) {
      name = name.replace('http://github.com/', '');
    } else if (name.startsWith('git@github.com:')) {
      name = name.replace('git@github.com:', '');
    }
    if (name.endsWith('.git')) {
      name = name.slice(0, -4);
    }
    const parts = name.split('/');
    return parts[parts.length - 1];
  }

  private getStartCommand(pkgJson: any): string {
    if (pkgJson.scripts?.start) {
      return `npm start`;
    }
    return '';
  }

  async uninstall(_mcpId: string, installPath: string): Promise<boolean> {
    try {
      if (fs.existsSync(installPath)) {
        fs.rmSync(installPath, { recursive: true, force: true });
      }
      return true;
    } catch {
      return false;
    }
  }

  async test(_installPath: string, _startCommand: string): Promise<MCPTestResult> {
    return { success: true, message: 'Git MCP test skipped' };
  }

  async start(installPath: string, startCommand: string): Promise<{ success: boolean; port: number; processId?: number }> {
    if (!startCommand) {
      return { success: false, port: 0 };
    }

    const port = 10000 + Math.floor(Math.random() * 10000);
    const npmPath = MCPStrategyFactory.getNpmPath();
    
    const child = spawn(npmPath, ['start'], {
      cwd: installPath,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, port, processId: child.pid });
      }, 3000);
    });
  }

  async stop(_processId: number): Promise<boolean> {
    return true;
  }

  private async runCommand(command: string, args: string[], options?: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = 5 * 60 * 1000;
    const systemProxyEnv = await getSystemProxyEnv();
    
    logger.info('MCP', `[Network] Executing network command: ${command} ${args.join(' ')}`);
    logger.info('MCP', `[Network] Working directory: ${options?.cwd || process.cwd()}`);
    logger.info('MCP', `[Network] Timeout: ${timeoutMs / 1000} seconds`);
    logger.info('MCP', `[Network] Available environment proxies - http_proxy: ${process.env.http_proxy || 'not set'}, https_proxy: ${process.env.https_proxy || 'not set'}`);
    logger.info('MCP', `[Network] Detected system proxy - ${Object.keys(systemProxyEnv).length > 0 ? systemProxyEnv.http_proxy : 'none'}`);
    
    return new Promise((resolve, reject) => {
      logger.info('MCP', `[Network] Spawning child process with PID tracking`);
      const child = spawn(command, args, {
        ...options,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          ...systemProxyEnv,
          ...(options?.env || {}),
        },
      });
      
      logger.info('MCP', `[Network] Child process PID: ${child.pid}`);
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        logger.debug('MCP', `[Network] stdout chunk (${chunk.length} chars): ${chunk.trim()}`);
      });
      
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        logger.debug('MCP', `[Network] stderr chunk (${chunk.length} chars): ${chunk.trim()}`);
        
        if (chunk.includes('Failed to connect') || chunk.includes('Connection refused') || chunk.includes('timed out')) {
          logger.error('MCP', `[Network] Connection error detected: ${chunk.trim()}`);
        }
        if (chunk.includes('Permission denied')) {
          logger.error('MCP', `[Network] Permission error detected: ${chunk.trim()}`);
        }
        if (chunk.includes('not found') || chunk.includes('No such file')) {
          logger.error('MCP', `[Network] File not found error detected: ${chunk.trim()}`);
        }
      });
      
      const timeout = setTimeout(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.error('MCP', `[Network] Command TIMEOUT after ${elapsed}s (max: ${timeoutMs / 1000}s)`);
        logger.error('MCP', `[Network] Command: ${command} ${args.join(' ')}`);
        logger.error('MCP', `[Network] Working directory: ${options?.cwd || process.cwd()}`);
        logger.error('MCP', `[Network] Last stdout (${stdout.length} chars): ${stdout.slice(-1000)}`);
        logger.error('MCP', `[Network] Last stderr (${stderr.length} chars): ${stderr.slice(-1000)}`);
        logger.error('MCP', `[Network] Possible causes: network timeout, proxy not working, or remote server unreachable`);
        child.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeoutMs / 1000} seconds: ${command} ${args.join(' ')}\n${stderr}`));
      }, timeoutMs);
      
      child.on('close', (code) => {
        clearTimeout(timeout);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info('MCP', `[Network] Command completed, exit code: ${code}, duration: ${duration}s`);
        if (code === 0) {
          logger.info('MCP', `[Network] Command succeeded, stdout length: ${stdout.length} chars`);
          resolve();
        } else {
          logger.error('MCP', `[Network] Command FAILED with exit code ${code}`);
          logger.error('MCP', `[Network] Full stdout: ${stdout || '(empty)'}`);
          logger.error('MCP', `[Network] Full stderr: ${stderr || '(empty)'}`);
          
          if (command === 'git' && args[0] === 'clone') {
            logger.error('MCP', `[Network] Git clone failed - check network connectivity, proxy settings, or repository URL`);
          }
          if (command.includes('npm') && args[0] === 'install') {
            logger.error('MCP', `[Network] npm install failed - check npm registry configuration or network`);
          }
          
          reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}\n${stderr}`));
        }
      });
      
      child.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('MCP', `[Network] Process execution ERROR: ${err.message}`);
        const error = err as NodeJS.ErrnoException;
        logger.error('MCP', `[Network] Error code: ${error.code}`);
        if (error.code === 'ENOENT') {
          logger.error('MCP', `[Network] Command not found: ${command} - ensure the tool is installed`);
        }
        if (error.code === 'EACCES') {
          logger.error('MCP', `[Network] Permission denied: ${command} - check file permissions`);
        }
        reject(new Error(`Command execution error: ${err.message}`));
      });
    });
  }
}

export class DockerMcpInstaller implements MCPInstaller {
  async install(packageName: string, displayName: string, options?: Record<string, unknown>): Promise<MCPInstallationResult> {
    const available = await MCPStrategyFactory.isDockerAvailable();
    if (!available) {
      return {
        success: false,
        packageName,
        displayName,
        version: '',
        installPath: '',
        startCommand: '',
        tools: [],
        error: 'Docker is not installed. Please install Docker first.',
      };
    }

    const installDir = MCPStrategyFactory.getInstallDir(packageName);
    fs.mkdirSync(installDir, { recursive: true });

    try {
      const imageName = (options?.imageName as string) || packageName;
      await this.runCommand('docker', ['pull', imageName]);

      return {
        success: true,
        packageName,
        displayName: displayName || packageName,
        version: '',
        installPath: installDir,
        startCommand: imageName,
        tools: [],
      };
    } catch (err: any) {
      return {
        success: false,
        packageName,
        displayName: displayName || packageName,
        version: '',
        installPath: installDir,
        startCommand: '',
        tools: [],
        error: err.message,
      };
    }
  }

  async uninstall(_mcpId: string, _installPath: string): Promise<boolean> {
    return true;
  }

  async test(_installPath: string, _startCommand: string): Promise<MCPTestResult> {
    return { success: true, message: 'Docker MCP test skipped' };
  }

  async start(_installPath: string, startCommand: string): Promise<{ success: boolean; port: number; processId?: number }> {
    const port = 10000 + Math.floor(Math.random() * 10000);
    
    try {
      await this.runCommand('docker', ['run', '-d', '-p', `${port}:${port}`, '-e', `PORT=${port}`, startCommand]);
      return { success: true, port };
    } catch {
      return { success: false, port };
    }
  }

  async stop(_processId: number): Promise<boolean> {
    return true;
  }

  private async runCommand(command: string, args: string[], options?: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = 5 * 60 * 1000;
    const systemProxyEnv = await getSystemProxyEnv();
    
    logger.info('MCP', `[Network] Executing network command: ${command} ${args.join(' ')}`);
    logger.info('MCP', `[Network] Working directory: ${options?.cwd || process.cwd()}`);
    logger.info('MCP', `[Network] Timeout: ${timeoutMs / 1000} seconds`);
    logger.info('MCP', `[Network] Available environment proxies - http_proxy: ${process.env.http_proxy || 'not set'}, https_proxy: ${process.env.https_proxy || 'not set'}`);
    logger.info('MCP', `[Network] Detected system proxy - ${Object.keys(systemProxyEnv).length > 0 ? systemProxyEnv.http_proxy : 'none'}`);
    
    return new Promise((resolve, reject) => {
      logger.info('MCP', `[Network] Spawning child process with PID tracking`);
      const child = spawn(command, args, {
        ...options,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          ...systemProxyEnv,
          ...(options?.env || {}),
        },
      });
      
      logger.info('MCP', `[Network] Child process PID: ${child.pid}`);
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        logger.debug('MCP', `[Network] stdout chunk (${chunk.length} chars): ${chunk.trim()}`);
      });
      
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        logger.debug('MCP', `[Network] stderr chunk (${chunk.length} chars): ${chunk.trim()}`);
        
        if (chunk.includes('Failed to connect') || chunk.includes('Connection refused') || chunk.includes('timed out')) {
          logger.error('MCP', `[Network] Connection error detected: ${chunk.trim()}`);
        }
        if (chunk.includes('Permission denied')) {
          logger.error('MCP', `[Network] Permission error detected: ${chunk.trim()}`);
        }
        if (chunk.includes('not found') || chunk.includes('No such file')) {
          logger.error('MCP', `[Network] File not found error detected: ${chunk.trim()}`);
        }
      });
      
      const timeout = setTimeout(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.error('MCP', `[Network] Command TIMEOUT after ${elapsed}s (max: ${timeoutMs / 1000}s)`);
        logger.error('MCP', `[Network] Command: ${command} ${args.join(' ')}`);
        logger.error('MCP', `[Network] Working directory: ${options?.cwd || process.cwd()}`);
        logger.error('MCP', `[Network] Last stdout (${stdout.length} chars): ${stdout.slice(-1000)}`);
        logger.error('MCP', `[Network] Last stderr (${stderr.length} chars): ${stderr.slice(-1000)}`);
        logger.error('MCP', `[Network] Possible causes: network timeout, proxy not working, or remote server unreachable`);
        child.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeoutMs / 1000} seconds: ${command} ${args.join(' ')}\n${stderr}`));
      }, timeoutMs);
      
      child.on('close', (code) => {
        clearTimeout(timeout);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info('MCP', `[Network] Command completed, exit code: ${code}, duration: ${duration}s`);
        if (code === 0) {
          logger.info('MCP', `[Network] Command succeeded, stdout length: ${stdout.length} chars`);
          resolve();
        } else {
          logger.error('MCP', `[Network] Command FAILED with exit code ${code}`);
          logger.error('MCP', `[Network] Full stdout: ${stdout || '(empty)'}`);
          logger.error('MCP', `[Network] Full stderr: ${stderr || '(empty)'}`);
          
          if (command === 'git' && args[0] === 'clone') {
            logger.error('MCP', `[Network] Git clone failed - check network connectivity, proxy settings, or repository URL`);
          }
          if (command.includes('npm') && args[0] === 'install') {
            logger.error('MCP', `[Network] npm install failed - check npm registry configuration or network`);
          }
          
          reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}\n${stderr}`));
        }
      });
      
      child.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('MCP', `[Network] Process execution ERROR: ${err.message}`);
        const error = err as NodeJS.ErrnoException;
        logger.error('MCP', `[Network] Error code: ${error.code}`);
        if (error.code === 'ENOENT') {
          logger.error('MCP', `[Network] Command not found: ${command} - ensure the tool is installed`);
        }
        if (error.code === 'EACCES') {
          logger.error('MCP', `[Network] Permission denied: ${command} - check file permissions`);
        }
        reject(new Error(`Command execution error: ${err.message}`));
      });
    });
  }
}