import { defineConfig } from "vitest/config";

// Opt-in, live Platform-API e2e (the main config excludes `**/e2e/**`). The
// tests self-skip unless logged in + VEXPO_E2E_CONVEX=1 + VEXPO_E2E_DEPLOYMENT
// is set, and every mutation is reversed. Run with:
//   VEXPO_E2E_CONVEX=1 VEXPO_E2E_DEPLOYMENT=<dev-slug> npm run test:e2e:api -w @ramonclaudio/vexpo
export default defineConfig({
  test: {
    include: ["__tests__/e2e/**/*.e2e.test.ts"],
    pool: "forks",
  },
});
