import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    include: ['test/**/*.e2e.test.ts'],
    server: {
      deps: {
        inline: [],
      },
    },
  },
  resolve: {
    conditions: ['import', 'node'],
    mainFields: ['module', 'main'],
    alias: {
      'graphdblite': path.resolve(__dirname, 'test/__mocks__/congraphdb.ts'),
      'tiny-graph-db': path.resolve(__dirname, 'test/__mocks__/congraphdb.ts'),
      '@brian-agent/base': path.resolve(__dirname, '../brian-backend/Base/index.ts'),
      '@brian-agent/core': path.resolve(__dirname, '../brian-backend/Core/index.ts'),
      '@brian-agent/agent': path.resolve(__dirname, '../brian-backend/Agent/index.ts'),
      '@brian-agent/orchestration': path.resolve(__dirname, '../brian-backend/Orchestration/index.ts'),
    },
  },
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, '.'),
        path.resolve(__dirname, '../brian-backend'),
      ],
    },
  },
});
