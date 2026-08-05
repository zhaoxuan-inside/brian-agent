/**
 * @fileoverview CDTProvider 领域层类型定义（Chrome DevTools Protocol）。
 */

import { Input, Context, Output } from '../../shared/base';

// ============================================================
// CDT 上下文
// ============================================================

export class CDTContext extends Context {}

// ============================================================
// 配置常量
// ============================================================

export const CDT_CONFIG_TABLE = 'cdt_config';

/** 默认 CDT 调试端口 */
export const CDT_DEFAULT_PORT = 9222;

/** 默认用户数据目录（相对于 data 目录） */
export const CDT_DEFAULT_PROFILE_DIR = 'cdt-profile';

/** Chrome 各平台可执行文件搜索路径 */
export const CDT_CHROME_PATHS: Record<string, string[]> = {
  linux: [
    'google-chrome',
    'google-chrome-stable',
    'chromium-browser',
    'chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ],
  macos: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  windows: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
  ],
};

/** 用于 listCDT 的默认配置记录 */
export const CDT_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'boolean',
    description: '是否启用 CDT（Chrome DevTools）',
  },
  {
    config_key: 'port',
    config_value: String(CDT_DEFAULT_PORT),
    value_type: 'integer',
    description: 'CDT 远程调试端口',
  },
  {
    config_key: 'chrome_path',
    config_value: '',
    value_type: 'string',
    description: 'Chrome 可执行文件路径（留空则自动检测）',
  },
  {
    config_key: 'headless',
    config_value: 'false',
    value_type: 'boolean',
    description: '是否以无头模式运行 Chrome',
  },
  {
    config_key: 'profile_dir',
    config_value: CDT_DEFAULT_PROFILE_DIR,
    value_type: 'string',
    description: 'Chrome 用户数据目录（相对于 data 目录）',
  },
  {
    config_key: 'window_width',
    config_value: '1920',
    value_type: 'integer',
    description: '浏览器窗口宽度',
  },
  {
    config_key: 'window_height',
    config_value: '1080',
    value_type: 'integer',
    description: '浏览器窗口高度',
  },
];

// ============================================================
// CDT 配置表记录
// ============================================================

export interface CDTConfigRecord {
  config_key: string;
  config_value: string;
  value_type: string;
  description?: string;
  updated: number;
}

// ============================================================
// startCDT
// ============================================================

export class StartCDTInput extends Input {}
export class StartCDTOutput extends Output {
  endpoint = '';
  port = 0;
  pid = 0;
}

// ============================================================
// stopCDT
// ============================================================

export class StopCDTInput extends Input {}
export class StopCDTOutput extends Output {}

// ============================================================
// getCDTEndpoint
// ============================================================

export class GetCDTEndpointInput extends Input {}
export class GetCDTEndpointOutput extends Output {
  endpoint = '';
}

// ============================================================
// execCDP
// ============================================================

export class ExecCDPInput extends Input {
  method!: string;
  params?: Record<string, unknown>;
}

export class ExecCDPOutput extends Output {
  result: unknown = null;
}

// ============================================================
// isCDTRunning
// ============================================================

export class IsCDTRunningInput extends Input {}
export class IsCDTRunningOutput extends Output {
  running = false;
  pid = 0;
  port = 0;
}

// ============================================================
// 前端环境信息（用于反检测伪装）
// ============================================================

export interface CDTEnv {
  platform?: string;
  userAgent?: string;
  acceptLang?: string;
  acceptLangFull?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  languages?: string[];
}
