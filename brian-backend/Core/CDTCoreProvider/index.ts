/**
 * @fileoverview CDTCoreProvider 模块统一导出。
 */

export { CDTCoreAccess } from './access/CDTCoreAccess';
export {
  CDTCoreContext,
  CDTCoreNavigateInput,
  CDTCoreNavigateOutput,
  CDTCoreTypeTextInput,
  CDTCoreTypeTextOutput,
  CDTCoreClickInput,
  CDTCoreClickOutput,
  CDTCoreScrollInput,
  CDTCoreScrollOutput,
  CDTCoreEvaluateInput,
  CDTCoreEvaluateOutput,
  CDTCoreLoginInput,
  CDTCoreLoginOutput,
  CDTCoreGetLoginStateInput,
  CDTCoreGetLoginStateOutput,
  CDTCoreGetCookiesInput,
  CDTCoreGetCookiesOutput,
  CDTCoreSaveSessionInput,
  CDTCoreSaveSessionOutput,
  CDTCoreRestoreSessionInput,
  CDTCoreRestoreSessionOutput,
  CDT_HUMAN_DELAYS,
  CDT_PAGE_SESSION_TABLE,
  CDT_LOGIN_CREDENTIAL_TABLE,
} from './domain/types';
export type {
  CDTPageSessionRecord,
  CDTLoginCredentialRecord,
} from './domain/types';
