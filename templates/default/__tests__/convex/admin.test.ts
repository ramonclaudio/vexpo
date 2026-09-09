/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "@/convex/_generated/api";

import { AUTH_ENV, identityFor, initConvexTest, seedAuthedUser, stubAuthEnv } from "./_harness";

afterEach(() => vi.unstubAllEnvs());

describe("admin.resetRateLimit", () => {
  test("clears one caller's bucket so a locked-out user can act again", async () => {
    const t = initConvexTest();
    const user = await seedAuthedUser(t);
    const asUser = t.withIdentity(identityFor(user.authUserId, user.sessionId));

    for (let i = 0; i < 5; i++) {
      await asUser.mutation(api.users.restoreAccount, {});
    }
    await expect(asUser.mutation(api.users.restoreAccount, {})).rejects.toThrow();

    const key = user.appUserId.toString();
    expect(
      await t.mutation(internal.admin.resetRateLimit, { name: "criticalAction", key }),
    ).toEqual({ reset: true, name: "criticalAction", key });

    await expect(asUser.mutation(api.users.restoreAccount, {})).resolves.toEqual({ success: true });
  });

  test("reports a null key when clearing the whole named limit", async () => {
    const t = initConvexTest();
    expect(await t.mutation(internal.admin.resetRateLimit, { name: "userAction" })).toEqual({
      reset: true,
      name: "userAction",
      key: null,
    });
  });
});

describe("admin.createReviewAccount", () => {
  test("creates the account verified, and a re-run is a no-op that keeps it verified", async () => {
    const t = initConvexTest();
    stubAuthEnv();

    const first = await t.action(internal.admin.createReviewAccount, {
      email: "review@example.com",
      password: "correct-horse-battery",
      name: "App Review",
    });
    expect(first).toMatchObject({
      email: "review@example.com",
      created: true,
      verified: true,
      passwordReset: false,
    });
    expect(first.userId).toEqual(expect.any(String));

    expect(await t.run(async (ctx) => ctx.db.query("users").collect())).toHaveLength(1);

    const second = await t.action(internal.admin.createReviewAccount, {
      email: "review@example.com",
      password: "correct-horse-battery",
      name: "App Review",
    });
    expect(second).toMatchObject({ created: false, verified: true, passwordReset: false });
    expect(second.userId).toBe(first.userId);
    expect(await t.run(async (ctx) => ctx.db.query("users").collect())).toHaveLength(1);
  });

  test("reset rotates the password on an existing account", async () => {
    const t = initConvexTest();
    stubAuthEnv();

    await t.action(internal.admin.createReviewAccount, {
      email: "review2@example.com",
      password: "correct-horse-battery",
      name: "App Review",
    });

    const rotated = await t.action(internal.admin.createReviewAccount, {
      email: "review2@example.com",
      password: "a-different-password",
      name: "App Review",
      reset: true,
    });
    expect(rotated).toMatchObject({ created: false, passwordReset: true });

    const response = await t.fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: AUTH_ENV.SITE_URL },
      body: JSON.stringify({ email: "review2@example.com", password: "a-different-password" }),
    });
    expect(response.status).toBe(200);
  });
});
