/**
 * @fileoverview CDTCoreProvider 应用服务层。
 *
 * 基于 CDTProvider 提供拟人化浏览器操作、登录支持与会话持久化。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator, ValidationError, NotFoundError, Operator } from '@brian-agent/base';
import type { CDTAccess } from '@brian-agent/base';
import {
  ExecCDPInput, ExecCDPOutput, CDTContext,
  StartCDTInput, StartCDTOutput,
} from '@brian-agent/base';
import {
  CDTCoreContext,
  CDTCoreNavigateInput, CDTCoreNavigateOutput,
  CDTCoreTypeTextInput, CDTCoreTypeTextOutput,
  CDTCoreClickInput, CDTCoreClickOutput,
  CDTCoreScrollInput, CDTCoreScrollOutput,
  CDTCoreEvaluateInput, CDTCoreEvaluateOutput,
  CDTCoreLoginInput, CDTCoreLoginOutput,
  CDTCoreGetLoginStateInput, CDTCoreGetLoginStateOutput,
  CDTCoreGetCookiesInput, CDTCoreGetCookiesOutput,
  CDTCoreSaveSessionInput, CDTCoreSaveSessionOutput,
  CDTCoreRestoreSessionInput, CDTCoreRestoreSessionOutput,
  CDT_HUMAN_DELAYS,
  CDT_PAGE_SESSION_TABLE,
  CDT_LOGIN_CREDENTIAL_TABLE,
  type CDTLoginCredentialRecord,
} from '../domain/types';

export class CDTCoreService {
  private readonly cdtContext = new CDTContext();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly cdtAccess: CDTAccess,
  ) {}

  // ============================================================
  // 拟人化工具方法
  // ============================================================

  /** 随机延迟（毫秒） */
  private async humanDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /** 确保 CDT 已启动 */
  private async ensureCDT(): Promise<boolean> {
    const startOutput = new StartCDTOutput();
    await this.cdtAccess.startCDT(new StartCDTInput(), this.cdtContext, startOutput);
    return !startOutput.error;
  }

  /** 执行 CDP 命令 */
  private async exec(method: string, params?: Record<string, unknown>): Promise<ExecCDPOutput> {
    const input = Object.assign(new ExecCDPInput(), { method, params });
    const output = new ExecCDPOutput();
    await this.cdtAccess.execCDP(input, this.cdtContext, output);
    return output;
  }

  // ============================================================
  // 页面导航
  // ============================================================

  async navigate(
    input: CDTCoreNavigateInput,
    _ctx: CDTCoreContext,
    output: CDTCoreNavigateOutput,
  ): Promise<boolean> {
    if (!input.url) throw new ValidationError('url 不能为空');

    await this.ensureCDT();
    await this.exec('Page.enable');
    const navResult = await this.exec('Page.navigate', { url: input.url });
    if (navResult.error) {
      output.error = navResult.error;
      return false;
    }

    if (input.waitForLoad !== false) {
      await this.humanDelay(CDT_HUMAN_DELAYS.pageLoadWaitMs, CDT_HUMAN_DELAYS.pageLoadWaitMs + 3000);
    }

    return true;
  }

  // ============================================================
  // 拟人化输入
  // ============================================================

  async typeText(
    input: CDTCoreTypeTextInput,
    _ctx: CDTCoreContext,
    output: CDTCoreTypeTextOutput,
  ): Promise<boolean> {
    if (!input.selector) throw new ValidationError('selector 不能为空');
    if (!input.text) throw new ValidationError('text 不能为空');

    await this.ensureCDT();

    // 先聚焦目标元素
    const focusResult = await this.exec('Runtime.evaluate', {
      expression: `document.querySelector('${input.selector.replace(/'/g, "\\'")}')?.focus()`,
    });
    if (focusResult.error) {
      output.error = `无法聚焦元素: ${focusResult.error}`;
      return false;
    }

    // 逐字输入，模拟人类打字速度
    for (let i = 0; i < input.text.length; i++) {
      const char = input.text[i];
      await this.exec('Input.dispatchKeyEvent', {
        type: 'char',
        text: char,
        unmodifiedText: char,
      });
      await this.humanDelay(CDT_HUMAN_DELAYS.typeMinMs, CDT_HUMAN_DELAYS.typeMaxMs);

      // 随机额外的停顿（模拟思考）
      if (Math.random() < 0.05) {
        await this.humanDelay(200, 600);
      }
    }

    return true;
  }

  // ============================================================
  // 拟人化点击
  // ============================================================

  async click(
    input: CDTCoreClickInput,
    _ctx: CDTCoreContext,
    output: CDTCoreClickOutput,
  ): Promise<boolean> {
    if (!input.selector) throw new ValidationError('selector 不能为空');

    await this.ensureCDT();

    // 滚动到元素可见
    await this.exec('Runtime.evaluate', {
      expression: `document.querySelector('${input.selector.replace(/'/g, "\\'")}')?.scrollIntoView({ behavior: 'smooth', block: 'center' })`,
    });

    await this.humanDelay(CDT_HUMAN_DELAYS.scrollMinMs, CDT_HUMAN_DELAYS.scrollMaxMs);

    // 获取元素坐标
    const boxResult = await this.exec('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector('${input.selector.replace(/'/g, "\\'")}'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
    });

    if (boxResult.error || !(boxResult.result as { result?: { value?: { x: number; y: number } } })?.result?.value) {
      output.error = `未找到元素: ${input.selector}`;
      return false;
    }

    const coords = (boxResult.result as { result: { value: { x: number; y: number } } }).result.value;

    // 模拟人类点击（先移动再点击，带随机偏移）
    const offsetX = (Math.random() - 0.5) * 4;
    const offsetY = (Math.random() - 0.5) * 4;

    await this.exec('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: coords.x + offsetX,
      y: coords.y + offsetY,
      button: 'left',
      clickCount: 1,
    });

    await this.humanDelay(CDT_HUMAN_DELAYS.clickMinMs, CDT_HUMAN_DELAYS.clickMaxMs);

    await this.exec('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: coords.x + offsetX,
      y: coords.y + offsetY,
      button: 'left',
      clickCount: 1,
    });

    await this.humanDelay(CDT_HUMAN_DELAYS.betweenActionMinMs, CDT_HUMAN_DELAYS.betweenActionMaxMs);

    return true;
  }

  // ============================================================
  // 滚动
  // ============================================================

  async scroll(
    input: CDTCoreScrollInput,
    _ctx: CDTCoreContext,
    output: CDTCoreScrollOutput,
  ): Promise<boolean> {
    await this.ensureCDT();

    if (input.toBottom) {
      await this.exec('Runtime.evaluate', {
        expression: 'window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })',
      });
    } else if (input.pixels) {
      await this.exec('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: 0,
        y: 0,
        deltaX: 0,
        deltaY: input.pixels,
      });
    }

    await this.humanDelay(CDT_HUMAN_DELAYS.scrollMinMs, CDT_HUMAN_DELAYS.scrollMaxMs);
    return true;
  }

  // ============================================================
  // 执行 JavaScript
  // ============================================================

  async evaluate(
    input: CDTCoreEvaluateInput,
    _ctx: CDTCoreContext,
    output: CDTCoreEvaluateOutput,
  ): Promise<boolean> {
    if (!input.expression) throw new ValidationError('expression 不能为空');

    await this.ensureCDT();

    const result = await this.exec('Runtime.evaluate', {
      expression: input.expression,
      returnByValue: true,
    });

    if (result.error) {
      output.error = result.error;
      return false;
    }

    output.result = result.result;
    return true;
  }

  // ============================================================
  // 登录（含验证码支持）
  // ============================================================

  async login(
    input: CDTCoreLoginInput,
    _ctx: CDTCoreContext,
    output: CDTCoreLoginOutput,
  ): Promise<boolean> {
    if (!input.domain) throw new ValidationError('domain 不能为空');
    if (!input.loginUrl) throw new ValidationError('loginUrl 不能为空');

    await this.ensureCDT();

    // 导航到登录页面
    await this.navigate(
      Object.assign(new CDTCoreNavigateInput(), { url: input.loginUrl }),
      new CDTCoreContext(),
      new CDTCoreNavigateOutput(),
    );

    await this.humanDelay(1000, 2000);

    // 检查是否有验证码
    let hasCaptcha = false;
    if (input.captchaSelector) {
      const captchaCheck = await this.exec('Runtime.evaluate', {
        expression: `!!document.querySelector('${input.captchaSelector.replace(/'/g, "\\'")}')`,
      });
      hasCaptcha = !!(captchaCheck.result as { result?: { value?: boolean } })?.result?.value;
    }

    if (hasCaptcha) {
      // 弹窗提示：聚焦到 Chrome 窗口，让用户手动填写验证码
      await this.exec('Runtime.evaluate', {
        expression: `alert('请在本窗口中填写验证码，完成后程序将继续执行')`,
      });

      // 弹窗只阻塞当前 tab；持续轮询检测验证码是否完成
      const timeout = (input.captchaTimeoutSeconds || 120) * 1000;
      const start = Date.now();
      let solvable = false;

      while (Date.now() - start < timeout) {
        const checkResult = await this.exec('Runtime.evaluate', {
          expression: `!!document.querySelector('${input.captchaSelector!.replace(/'/g, "\\'")}')`,
        });
        const stillVisible = !!(checkResult.result as { result?: { value?: boolean } })?.result?.value;

        if (!stillVisible) {
          solvable = true;
          break;
        }

        await this.humanDelay(2000, 3000);
      }

      if (!solvable) {
        output.error = '验证码填写超时';
        return false;
      }
    }

    // 填写用户名
    if (input.usernameField && input.username) {
      await this.typeText(
        Object.assign(new CDTCoreTypeTextInput(), { selector: input.usernameField, text: input.username }),
        new CDTCoreContext(),
        new CDTCoreTypeTextOutput(),
      );
      await this.humanDelay(500, 1000);
    }

    // 填写密码
    if (input.passwordField && input.password) {
      await this.typeText(
        Object.assign(new CDTCoreTypeTextInput(), { selector: input.passwordField, text: input.password }),
        new CDTCoreContext(),
        new CDTCoreTypeTextOutput(),
      );
      await this.humanDelay(500, 1500);
    }

    // 提交
    if (input.submitSelector) {
      await this.click(
        Object.assign(new CDTCoreClickInput(), { selector: input.submitSelector }),
        new CDTCoreContext(),
        new CDTCoreClickOutput(),
      );
    }

    // 等待登录完成
    await this.humanDelay(2000, 5000);

    // 检测登录成功指示器
    if (input.loggedInIndicator) {
      const indicatorResult = await this.exec('Runtime.evaluate', {
        expression: `!!document.querySelector('${input.loggedInIndicator.replace(/'/g, "\\'")}')`,
      });
      const loggedIn = !!(indicatorResult.result as { result?: { value?: boolean } })?.result?.value;

      if (!loggedIn) {
        output.error = '登录失败，未检测到登录成功标识';
        return false;
      }
    }

    // 保存 Cookies
    const cookiesOut = new CDTCoreGetCookiesOutput();
    await this.getCookies(
      new CDTCoreGetCookiesInput(),
      new CDTCoreContext(),
      cookiesOut,
    );

    const sessionId = IdGenerator.generate();

    // 保存或更新登录凭证
    const existing = this.relationDb.queryRaw<CDTLoginCredentialRecord>(
      `SELECT "id" FROM "${CDT_LOGIN_CREDENTIAL_TABLE}" WHERE "domain" = ?`,
      [input.domain],
    );

    const now = IdGenerator.now();
    if (existing.length > 0) {
      this.relationDb.update(
        CDT_LOGIN_CREDENTIAL_TABLE,
        [
          { field: 'updated', value: now },
          { field: 'login_url', value: input.loginUrl },
          { field: 'username_field', value: input.usernameField },
          { field: 'password_field', value: input.passwordField },
          { field: 'submit_selector', value: input.submitSelector },
          { field: 'logged_in_indicator', value: input.loggedInIndicator },
          { field: 'captcha_selector', value: input.captchaSelector || '' },
          { field: 'username', value: input.username },
          { field: 'password', value: input.password },
          { field: 'cookies_json', value: cookiesOut.cookiesJson },
          { field: 'session_id', value: sessionId },
          { field: 'last_login_time', value: now },
          { field: 'login_success', value: 1 },
        ],
        [{ field: 'id', operator: Operator.EQ, value: existing[0].id }],
      );
    } else {
      this.relationDb.insert(CDT_LOGIN_CREDENTIAL_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'domain', value: input.domain },
        { field: 'login_url', value: input.loginUrl },
        { field: 'username_field', value: input.usernameField },
        { field: 'password_field', value: input.passwordField },
        { field: 'submit_selector', value: input.submitSelector },
        { field: 'logged_in_indicator', value: input.loggedInIndicator },
        { field: 'captcha_selector', value: input.captchaSelector || '' },
        { field: 'username', value: input.username },
        { field: 'password', value: input.password },
        { field: 'cookies_json', value: cookiesOut.cookiesJson },
        { field: 'session_id', value: sessionId },
        { field: 'last_login_time', value: now },
        { field: 'login_success', value: 1 },
      ]);
    }

    output.sessionId = sessionId;
    return true;
  }

  // ============================================================
  // 登录状态查询
  // ============================================================

  async getLoginState(
    input: CDTCoreGetLoginStateInput,
    _ctx: CDTCoreContext,
    output: CDTCoreGetLoginStateOutput,
  ): Promise<boolean> {
    const rows = this.relationDb.queryRaw<CDTLoginCredentialRecord>(
      `SELECT * FROM "${CDT_LOGIN_CREDENTIAL_TABLE}" WHERE "domain" = ? ORDER BY "last_login_time" DESC LIMIT 1`,
      [input.domain],
    );

    if (rows.length === 0) {
      output.loggedIn = false;
      return true;
    }

    const record = rows[0];
    output.loggedIn = record.login_success === 1;
    output.cookiesJson = record.cookies_json;
    output.lastLoginTime = record.last_login_time;
    return true;
  }

  // ============================================================
  // Cookies 管理
  // ============================================================

  async getCookies(
    _input: CDTCoreGetCookiesInput,
    _ctx: CDTCoreContext,
    output: CDTCoreGetCookiesOutput,
  ): Promise<boolean> {
    await this.ensureCDT();

    const result = await this.exec('Runtime.evaluate', {
      expression: `document.cookie`,
      returnByValue: true,
    });

    if (!result.error) {
      output.cookiesJson = JSON.stringify((result.result as { result?: { value?: string } })?.result?.value || '');
    }

    return true;
  }

  // ============================================================
  // 会话保存
  // ============================================================

  async saveSession(
    input: CDTCoreSaveSessionInput,
    _ctx: CDTCoreContext,
    output: CDTCoreSaveSessionOutput,
  ): Promise<boolean> {
    if (!input.sessionName) throw new ValidationError('sessionName 不能为空');

    const now = IdGenerator.now();
    const sessionId = IdGenerator.generate();

    const existing = this.relationDb.queryRaw<{ id: string }>(
      `SELECT "id" FROM "${CDT_PAGE_SESSION_TABLE}" WHERE "session_name" = ?`,
      [input.sessionName],
    );

    if (existing.length > 0) {
      this.relationDb.update(
        CDT_PAGE_SESSION_TABLE,
        [
          { field: 'updated', value: now },
          { field: 'cookies_json', value: input.cookiesJson },
          { field: 'local_storage_json', value: input.localStorageJson || '{}' },
          { field: 'last_url', value: input.url || '' },
          { field: 'last_access_time', value: now },
        ],
        [{ field: 'id', operator: Operator.EQ, value: existing[0].id }],
      );
    } else {
      this.relationDb.insert(CDT_PAGE_SESSION_TABLE, [
        { field: 'id', value: sessionId },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'session_name', value: input.sessionName },
        { field: 'cookies_json', value: input.cookiesJson },
        { field: 'local_storage_json', value: input.localStorageJson || '{}' },
        { field: 'last_url', value: input.url || '' },
        { field: 'last_access_time', value: now },
      ]);
    }

    output.sessionId = sessionId;
    return true;
  }

  // ============================================================
  // 会话恢复
  // ============================================================

  async restoreSession(
    input: CDTCoreRestoreSessionInput,
    _ctx: CDTCoreContext,
    output: CDTCoreRestoreSessionOutput,
  ): Promise<boolean> {
    if (!input.sessionName) throw new ValidationError('sessionName 不能为空');

    const rows = this.relationDb.queryRaw<{ cookies_json: string; local_storage_json: string; last_url: string }>(
      `SELECT "cookies_json", "local_storage_json", "last_url" FROM "${CDT_PAGE_SESSION_TABLE}" WHERE "session_name" = ?`,
      [input.sessionName],
    );

    if (rows.length === 0) {
      output.error = `会话 "${input.sessionName}" 不存在`;
      return false;
    }

    await this.ensureCDT();

    const record = rows[0];

    // 如果有关联 URL，先导航
    if (record.last_url) {
      await this.navigate(
        Object.assign(new CDTCoreNavigateInput(), { url: record.last_url, waitForLoad: true }),
        new CDTCoreContext(),
        new CDTCoreNavigateOutput(),
      );
    }

    // 恢复 Cookies
    try {
      const cookies: Array<{ name: string; value: string; domain?: string }> = JSON.parse(record.cookies_json);
      for (const cookie of cookies) {
        if (cookie.name && cookie.value) {
          await this.exec('Runtime.evaluate', {
            expression: `document.cookie = '${cookie.name}=${cookie.value}; path=/'`,
          });
        }
      }
    } catch {
      /* cookies 格式无效，跳过 */
    }

    // 恢复 LocalStorage
    try {
      const storage: Record<string, string> = JSON.parse(record.local_storage_json);
      for (const [key, value] of Object.entries(storage)) {
        await this.exec('Runtime.evaluate', {
          expression: `localStorage.setItem('${key.replace(/'/g, "\\'")}', '${value.replace(/'/g, "\\'")}')`,
        });
      }
    } catch {
      /* localStorage 格式无效，跳过 */
    }

    return true;
  }
}
