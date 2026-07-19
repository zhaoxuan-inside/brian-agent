export interface IHashProvider {
  hash(password: string, rounds?: number): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
}