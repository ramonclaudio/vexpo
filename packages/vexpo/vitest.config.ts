import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    // Several tests use `process.chdir()` to sandbox their work in a tmpdir;
    // workers (the default in vitest 4) don't permit that. Forks support it
    // but spawn per-file processes, which is fine at this scale.
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**"],
      // Thresholds sit a few points under measured coverage so the gate is a
      // ratchet against regressions, not an aspirational target. Bump them up
      // as coverage climbs; never set them above what the suite actually hits.
      thresholds: {
        statements: 45,
        branches: 40,
        functions: 50,
        lines: 45,
      },
    },
  },
});
