export {
  ProviderError,
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from '@brian-agent/base';

import { ProviderError } from '@brian-agent/base';

export class ProcessingError extends ProviderError {
  constructor(message: string) {
    super(message, 'PROCESSING_ERROR');
  }
}
