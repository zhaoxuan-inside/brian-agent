import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      congraphdb: path.resolve(__dirname, 'test/__mocks__/congraphdb.js'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
  },
});
