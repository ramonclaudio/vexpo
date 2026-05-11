import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    // Several tests use `process.chdir()` to sandbox their work in a tmpdir;
    // workers (the default in vitest 4) don't permit that. Forks support it
    // but spawn per-file processes, which is fine at this scale.
    pool: "forks",
  },
});
