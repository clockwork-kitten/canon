import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      // Exclude test files and the pure re-export barrel.
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
