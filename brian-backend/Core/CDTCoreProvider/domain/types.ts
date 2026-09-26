import { Input, Context, Output } from '@brian-agent/base';

export class CDTCoreContext extends Context {}

export const CDT_PAGE_SESSION_TABLE = 'cdt_page_session';
export const CDT_LOGIN_CREDENTIAL_TABLE = 'cdt_login_credential';

export interface CDTPageSessionRecord {
  id: string;
  created: number;
  updated: number;
  session_name: string;
  cookies_json: string;
  local_storage_json: string;
  last_url: string;
  last_access_time: number;
}

export interface CDTLoginCredentialRecord {
  id: string;
  created: number;
  updated: number;
  domain: string;
  login_url: string;
  username_field: string;
  password_field: string;
  submit_selector: string;
  logged_in_indicator: string;
  captcha_selector: string;
  username: string;
  password: string;
  cookies_json: string;
  session_id: string;
  last_login_time: number;
  login_success: number;
}

export const CDT_HUMAN_DELAYS = {
  typeMinMs: 50,
  typeMaxMs: 200,
  clickMinMs: 200,
  clickMaxMs: 800,
  scrollMinMs: 300,
  scrollMaxMs: 1000,
  pageLoadWaitMs: 2000,
  betweenActionMinMs: 300,
  betweenActionMaxMs: 1500,
};

export class CDTCoreNavigateInput extends Input {
  url!: string;
  waitForLoad?: boolean;
}

export class CDTCoreNavigateOutput extends Output {}

export class CDTCoreTypeTextInput extends Input {
  selector!: string;
  text!: string;
}

export class CDTCoreTypeTextOutput extends Output {}

export class CDTCoreClickInput extends Input {
  selector!: string;
}

export class CDTCoreClickOutput extends Output {}

export class CDTCoreScrollInput extends Input {
  pixels?: number;
  toBottom?: boolean;
}

export class CDTCoreScrollOutput extends Output {}

export class CDTCoreEvaluateInput extends Input {
  expression!: string;
}

export class CDTCoreEvaluateOutput extends Output {
  result: unknown = null;
}

export class CDTCoreLoginInput extends Input {
  domain!: string;
  loginUrl!: string;
  usernameField!: string;
  passwordField!: string;
  submitSelector!: string;
  loggedInIndicator!: string;
  captchaSelector?: string;
  username!: string;
  password!: string;
  captchaTimeoutSeconds?: number;
}

export class CDTCoreLoginOutput extends Output {
  sessionId = '';
}

export class CDTCoreGetLoginStateInput extends Input {
  domain!: string;
}

export class CDTCoreGetLoginStateOutput extends Output {
  loggedIn = false;
  cookiesJson = '';
  lastLoginTime = 0;
}

export class CDTCoreGetCookiesInput extends Input {}

export class CDTCoreGetCookiesOutput extends Output {
  cookiesJson = '';
}

export class CDTCoreSaveSessionInput extends Input {
  sessionName!: string;
  cookiesJson!: string;
  localStorageJson?: string;
  url?: string;
}

export class CDTCoreSaveSessionOutput extends Output {
  sessionId = '';
}

export class CDTCoreRestoreSessionInput extends Input {
  sessionName!: string;
}

export class CDTCoreRestoreSessionOutput extends Output {}
