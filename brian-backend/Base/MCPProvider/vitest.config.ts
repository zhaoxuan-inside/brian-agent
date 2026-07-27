import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    root: path.resolve(__dirname),
    timeout: 60000,
    hookTimeout: 60000,
    singleFork: true,
    threads: false,
    include: ['tests/**/*.test.ts'],
  },
});
