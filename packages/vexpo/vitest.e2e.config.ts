import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/e2e/**/*.e2e.test.ts"],
    pool: "forks",
  },
});
