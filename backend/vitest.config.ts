import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    timeout: 30000,
    hookTimeout: 30000,
    singleFork: true,
    threads: false,
  },
});