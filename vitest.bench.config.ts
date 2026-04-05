import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    reporter: 'verbose',
    include: ['tests/benchmarks/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    mockReset: true,
    restoreMocks: true,
    testTimeout: 60000,
  },
});
