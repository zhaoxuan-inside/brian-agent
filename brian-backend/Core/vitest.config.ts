import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      congraphdb: path.resolve(__dirname, 'test/__mocks__/congraphdb.js'),
      graphdblite: path.resolve(__dirname, 'test/__mocks__/graphdblite.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
  },
});
