/**
 * BusinessEvent → ADR-013 起为 shared 契约 TaskEventType 的后端别名（单一事实源）。
 * 旧死事件（plan.updated/message.block）与裸通道已删除。
 */
import { TaskEventType } from '@brian-agent/shared';

export const BusinessEvent = TaskEventType;
export type BusinessEventKind = TaskEventType | string;

export enum SseTransportEvent {
  Connected = 'session.connected',
  Loading = 'session.loading',
  Done = 'session.done',
}
