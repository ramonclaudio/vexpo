/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "@/convex/_generated/api";

import { AUTH_ENV, identityFor, initConvexTest, seedAuthedUser, stubAuthEnv } from "./_harness";

const ACCOUNT = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct-horse-battery",
};

describe("auth.hasPassword", () => {
  beforeEach(() => {
    stubAuthEnv();
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
      headers: { "Content-Type": "application/json", origin: AUTH_ENV.SITE_URL },
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
    stubAuthEnv();
  });
  afterEach(() => vi.unstubAllEnvs());

  test("replaces the JWKS, which is why it is deliberately not on a cron", async () => {
    const t = initConvexTest();

    const before = await t.fetch("/api/auth/convex/jwks", { method: "GET" });
    expect(before.status).toBe(200);
    const beforeKeys = (await before.json()) as { keys: Array<{ kid: string }> };
    expect(beforeKeys.keys.length).toBeGreaterThan(0);

    await t.action(internal.auth.rotateKeys, {});

    const after = await t.fetch("/api/auth/convex/jwks", { method: "GET" });
    const afterKeys = (await after.json()) as { keys: Array<{ kid: string }> };
    expect(afterKeys.keys.length).toBeGreaterThan(0);
    const beforeKids = new Set(beforeKeys.keys.map((k) => k.kid));
    expect(afterKeys.keys.every((k) => !beforeKids.has(k.kid))).toBe(true);
  });
});
