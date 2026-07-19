export interface ILogger {
  info(module: string, message: string, data?: unknown): void;
  warn(module: string, message: string, data?: unknown): void;
  error(module: string, message: string, data?: unknown): void;
  debug(module: string, message: string, data?: unknown): void;
}