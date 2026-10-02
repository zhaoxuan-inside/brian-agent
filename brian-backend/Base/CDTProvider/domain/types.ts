import { Input, Context, Output } from '../../shared/base';

export class CDTContext extends Context {}

export const CDT_CONFIG_TABLE = 'cdt_config_record';

export const CDT_DEFAULT_PORT = 9222;

export const CDT_DEFAULT_PROFILE_DIR = 'cdt-profile';

export const CDT_PROFILE_SNAPSHOT_SOURCE = 'profile_snapshot_source';

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

export interface CDTConfigRecord {
  config_key: string;
  config_value: string;
  value_type: string;
  description?: string;
  updated: number;
}

export class StartCDTInput extends Input {}
export class StartCDTOutput extends Output {
  endpoint = '';
  port = 0;
  pid = 0;
}

export class StopCDTInput extends Input {}
export class StopCDTOutput extends Output {}

export class GetCDTEndpointInput extends Input {}
export class GetCDTEndpointOutput extends Output {
  endpoint = '';
}

export class ExecCDPInput extends Input {
  method!: string;
  params?: Record<string, unknown>;
}

export class ExecCDPOutput extends Output {
  result: unknown = null;
}

export class IsCDTRunningInput extends Input {}
export class IsCDTRunningOutput extends Output {
  running = false;
  pid = 0;
  port = 0;
}

export interface CDTEnv {
  platform?: string;
  userAgent?: string;
  acceptLang?: string;
  acceptLangFull?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  languages?: string[];
}
