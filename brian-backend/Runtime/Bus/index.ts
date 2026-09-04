/**
 * @fileoverview Bus 模块统一导出（Runtime v2 · 阶段1）。
 */

// access 层
export { EventBusAccess } from './access/EventBusAccess';

// infrastructure 层
export { BusSchemaInitializer } from './infrastructure/BusSchemaInitializer';

// domain 层类型
export {
  EventBusContext,
  PublishEventInput,
  PublishEventOutput,
  SoEventReplayInput,
  SoEventReplayOutput,
  RegisterProjectionInput,
  RegisterProjectionOutput,
  UnregisterProjectionInput,
  UnregisterProjectionOutput,
  ConfigBusInput,
  ConfigBusOutput,
  RUNTIME_EVENT_TABLE,
  RUNTIME_BUS_CONFIG_TABLE,
} from './domain/types';

export type {
  EventType,
  RuntimeEvent,
  EventSubscriber,
  EventSubscription,
} from './domain/types';
