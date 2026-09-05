/// <reference types="vite/client" />
/**
 * `GUEST_MODE=false` takes the guest path off the deployment, not just out of
 * the UI. `convex/env.ts` reads the flag once at module load, so this lives in
 * its own file: stubbing it after another test has already pulled the module
 * in would assert nothing.
 *
 * The client half (`getEnabledProviders().guest`) only hides the button. This
 * is the half that matters, because a hidden button is not a closed endpoint.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "@/convex/_generated/api";

import { initConvexTest } from "./_harness";

const SITE_URL = "vexpo://";

describe("GUEST_MODE=false", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
    vi.stubEnv("SITE_URL", SITE_URL);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
    vi.stubEnv("GUEST_MODE", "false");
  });
  afterEach(() => vi.unstubAllEnvs());

  test("the anonymous plugin is not registered, so no guest can be created", async () => {
    const t = initConvexTest();

    const response = await t.fetch("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: SITE_URL },
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
