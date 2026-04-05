import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    reporter: "verbose",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/benchmarks/**", "node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/core/types.ts",
        "src/plugins/index.ts",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
    setupFiles: [],
    mockReset: true,
    restoreMocks: true,
  },
});
