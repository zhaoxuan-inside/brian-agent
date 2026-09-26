import type { MessageData } from '../types';
import { ValidationError } from '../../../shared/errors';

export function validateSendMessage(data: MessageData | undefined): void {
  if (!data) {
    throw new ValidationError('data 不能为空');
  }
  if (!data.queue || typeof data.queue !== 'string') {
    throw new ValidationError('queue 不能为空');
  }
  if (data.payload === undefined || data.payload === null) {
    throw new ValidationError('payload 不能为空');
  }
}

export function validatePriority(priority: number): void {
  if (typeof priority !== 'number' || priority < 0 || priority > 10) {
    throw new ValidationError('priority 必须为 0-10 之间的整数');
  }
}
