export interface IIdGenerator {
  generate(): string;
  validate(id: string): boolean;
}