import { describe, expect, it } from "vitest";

import { selectMigratableEnv } from "../../src/commands/convex-migrate.ts";

describe("selectMigratableEnv", () => {
  it("skips Convex-auto-provided CONVEX_* keys", () => {
    const src = new Map([
      ["CONVEX_SITE_URL", "https://old.convex.site"],
      ["CONVEX_CLOUD_URL", "https://old.convex.cloud"],
      ["BETTER_AUTH_SECRET", "abc"],
    ]);
    expect(selectMigratableEnv(src, new Map()).map(([k]) => k)).toEqual(["BETTER_AUTH_SECRET"]);
  });

  it("skips values already equal on the target", () => {
    const src = new Map([
      ["APP_NAME", "Vexpo"],
      ["BETTER_AUTH_SECRET", "new"],
    ]);
    const dst = new Map([["APP_NAME", "Vexpo"]]);
    expect(selectMigratableEnv(src, dst)).toEqual([["BETTER_AUTH_SECRET", "new"]]);
  });

  it("copies changed values and keys missing from the target, in source order", () => {
    const src = new Map([
      ["APP_NAME", "Vexpo"],
      ["RESEND_API_KEY", "re_new"],
      ["APPLE_CLIENT_SECRET", "jwt2"],
    ]);
    const dst = new Map([
      ["APP_NAME", "Old"],
      ["APPLE_CLIENT_SECRET", "jwt2"],
    ]);
    expect(selectMigratableEnv(src, dst)).toEqual([
      ["APP_NAME", "Vexpo"],
      ["RESEND_API_KEY", "re_new"],
    ]);
  });

  it("returns empty when the target already matches the source", () => {
    const m = new Map([["BETTER_AUTH_SECRET", "x"]]);
    expect(selectMigratableEnv(m, new Map(m))).toEqual([]);
  });
});
