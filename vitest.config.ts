import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    coverage: {
      // A floor, not a target: the measured line coverage, rounded down, so it
      // cannot slip. Raise it when the number rises. The bar is 90.
      thresholds: { lines: 82 },
    },
  },
});
