/// <reference types="vite/client" />
// convex/env.ts reads GUEST_MODE once at module load, so this must stay in its own file.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "@/convex/_generated/api";

import { AUTH_ENV, initConvexTest, stubAuthEnv } from "./_harness";

describe("GUEST_MODE=false", () => {
  beforeEach(() => {
    stubAuthEnv({ GUEST_MODE: "false" });
  });
  afterEach(() => vi.unstubAllEnvs());

  test("the anonymous plugin is not registered, so no guest can be created", async () => {
    const t = initConvexTest();

    const response = await t.fetch("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: AUTH_ENV.SITE_URL },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);
    expect(await t.run(async (ctx) => ctx.db.query("users").collect())).toHaveLength(0);
  });

  test("getEnabledProviders reports guest: false so the button is hidden", async () => {
    const t = initConvexTest();
    expect(await t.query(api.auth.getEnabledProviders, {})).toMatchObject({ guest: false });
  });
});
