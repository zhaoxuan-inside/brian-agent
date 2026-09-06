/**
 * @fileoverview Session 模块统一导出（Runtime v2 · 阶段1）。
 */

// access 层
export { SessionAccess } from './access/SessionAccess';

// infrastructure 层
export { SessionSchemaInitializer } from './infrastructure/SessionSchemaInitializer';

// domain 层
export {
  SessionContext,
  AddSessionInput,
  AddSessionOutput,
  AddMessageInput,
  AddMessageOutput,
  AddPartInput,
  AddPartOutput,
  UpdatePartInput,
  UpdatePartOutput,
  SoMessagesInput,
  SoMessagesOutput,
  ConfigSessionInput,
  ConfigSessionOutput,
  MessageRole,
  SessionStatus,
  PartType,
  PartStatus,
  RUNTIME_SESSION_TABLE,
  RUNTIME_MESSAGE_TABLE,
  RUNTIME_MESSAGE_PART_TABLE,
  RUNTIME_SESSION_CONFIG_TABLE,
} from './domain/types';

export type {
  MessageWithParts,
  PartRecord,
} from './domain/types';
