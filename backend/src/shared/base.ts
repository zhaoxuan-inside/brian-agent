import { v4 as uuidv4 } from 'uuid';

export class Input {
  traceId?: string;
  constructor(data?: Partial<Input>) {
    this.traceId = data?.traceId || uuidv4();
  }
}

export class Context {
  userId?: string;
  sessionId?: string;
  workId?: string;
  timestamp: number;
  constructor(data?: Partial<Context>) {
    this.userId = data?.userId;
    this.sessionId = data?.sessionId;
    this.workId = data?.workId;
    this.timestamp = data?.timestamp || Date.now();
  }
}

export class Output {
  success: boolean = true;
  error?: string;
  constructor(data?: Partial<Output>) {
    if (data) Object.assign(this, data);
  }
}
