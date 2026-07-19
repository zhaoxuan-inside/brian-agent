import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import type { IIdGenerator } from '../IIdGenerator';

export class UuidGenerator implements IIdGenerator {
  generate(): string {
    return uuidv4();
  }

  validate(id: string): boolean {
    return uuidValidate(id);
  }
}