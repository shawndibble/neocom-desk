import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'rules',
    environment: 'node',
    include: ['rules-tests/**/*.test.ts'],
    testTimeout: 10000,
    fileParallelism: false,
  },
});
