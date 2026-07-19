import bcrypt from 'bcryptjs';
import type { IHashProvider } from '../IHashProvider';

export class BcryptJsProvider implements IHashProvider {
  async hash(password: string, rounds: number = 10): Promise<string> {
    return bcrypt.hash(password, rounds);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}