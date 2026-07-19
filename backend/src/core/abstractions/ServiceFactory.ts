import type { IIdGenerator } from './IIdGenerator';
import type { IHashProvider } from './IHashProvider';
import type { ILogger } from './ILogger';
import type { IVectorStorage } from './IVectorStorage';
import { UuidGenerator } from './implementations/UuidGenerator';
import { BcryptJsProvider } from './implementations/BcryptJsProvider';
import { logger } from '../../infrastructure/logger';
import { VectorStorage } from '../storage/vector';

class ServiceFactory {
  private idGenerator: IIdGenerator;
  private hashProvider: IHashProvider;
  private vectorStorage: IVectorStorage;

  constructor() {
    this.idGenerator = this.createIdGenerator();
    this.hashProvider = this.createHashProvider();
    this.vectorStorage = this.createVectorStorage();
  }

  private createIdGenerator(): IIdGenerator {
    const provider = process.env.BRIAN_ID_GENERATOR || 'uuid';
    switch (provider) {
      case 'uuid':
        return new UuidGenerator();
      default:
        return new UuidGenerator();
    }
  }

  private createHashProvider(): IHashProvider {
    const provider = process.env.BRIAN_HASH_PROVIDER || 'bcryptjs';
    switch (provider) {
      case 'bcryptjs':
        return new BcryptJsProvider();
      default:
        return new BcryptJsProvider();
    }
  }

  private createVectorStorage(): IVectorStorage {
    const provider = process.env.BRIAN_VECTOR_STORAGE || 'local';
    switch (provider) {
      case 'local':
        return new VectorStorage();
      default:
        return new VectorStorage();
    }
  }

  getIdGenerator(): IIdGenerator {
    return this.idGenerator;
  }

  getHashProvider(): IHashProvider {
    return this.hashProvider;
  }

  getLogger(): ILogger {
    return logger;
  }

  getVectorStorage(): IVectorStorage {
    return this.vectorStorage;
  }
}

export const serviceFactory = new ServiceFactory();
export type { IIdGenerator, IHashProvider, ILogger, IVectorStorage };