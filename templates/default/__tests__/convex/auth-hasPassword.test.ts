/// <reference types="vite/client" />
/**
 * `auth.hasPassword` drives whether the profile screen offers "Change
 * password". It has to be false for an account created through Sign in with
 * Apple (no credential row at all), and the client skips the query entirely
 * for a guest, who has no `account` row of any kind.
 *
 * `auth.rotateKeys` is here too: a manual ops tool with no cron and no caller,
 * so nothing else would catch it breaking.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser } from "./_harness";

const ENV: Record<string, string> = {
  CONVEX_SITE_URL: "https://test.convex.site",
  SITE_URL: "vexpo://",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
};

const ACCOUNT = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct-horse-battery",
};

describe("auth.hasPassword", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  });
  afterEach(() => vi.unstubAllEnvs());

  test("false with no session at all", async () => {
    const t = initConvexTest();
    expect(await t.query(api.auth.hasPassword, {})).toBe(false);
  });

  test("true for an account signed up with email and password", async () => {
    const t = initConvexTest();
    const response = await t.fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: ENV.SITE_URL },
      body: JSON.stringify(ACCOUNT),
    });
    expect(response.status).toBe(200);

    const [appUser] = await t.run(async (ctx) => ctx.db.query("users").collect());
    const session = await t.runInComponent("betterAuth", async (ctx) => {
      const db = ctx.db as unknown as {
        query: (table: string) => { collect: () => Promise<Array<{ _id: string }>> };
      };
      return (await db.query("session").collect())[0];
    });

    const asUser = t.withIdentity(identityFor(appUser.authId, session._id));
    expect(await asUser.query(api.auth.hasPassword, {})).toBe(true);
  });

  test("false for a session whose user has no credential account", async () => {
    // A hand-seeded user has a Better Auth user and session but no `account`
    // row: the same shape Sign in with Apple and the anonymous plugin leave.
    const t = initConvexTest();
    const user = await seedAuthedUser(t);
    const asUser = t.withIdentity(identityFor(user.authUserId, user.sessionId));
    expect(await asUser.query(api.auth.hasPassword, {})).toBe(false);
  });

  test("false for a guest, which is why the client skips the query for them", async () => {
    const t = initConvexTest();
    const guest = await seedAuthedUser(t, { isAnonymous: true });
    const asGuest = t.withIdentity(identityFor(guest.authUserId, guest.sessionId));
    expect(await asGuest.query(api.auth.hasPassword, {})).toBe(false);
  });
});

describe("auth.rotateKeys", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  });
  afterEach(() => vi.unstubAllEnvs());

  test("replaces the JWKS, which is why it is deliberately not on a cron", async () => {
    const t = initConvexTest();

    // Mint a key by asking for the JWKS, so there is something to rotate.
    const before = await t.fetch("/api/auth/convex/jwks", { method: "GET" });
    expect(before.status).toBe(200);
    const beforeKeys = (await before.json()) as { keys: Array<{ kid: string }> };
    expect(beforeKeys.keys.length).toBeGreaterThan(0);

    await t.action(internal.auth.rotateKeys, {});

    const after = await t.fetch("/api/auth/convex/jwks", { method: "GET" });
    const afterKeys = (await after.json()) as { keys: Array<{ kid: string }> };
    expect(afterKeys.keys.length).toBeGreaterThan(0);
    // No grace period: every old key is gone, which is the whole reason a
    // scheduled run would sign every active session out.
    const beforeKids = new Set(beforeKeys.keys.map((k) => k.kid));
    expect(afterKeys.keys.every((k) => !beforeKids.has(k.kid))).toBe(true);
  });
});
