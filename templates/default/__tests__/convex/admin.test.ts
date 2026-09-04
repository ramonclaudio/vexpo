/// <reference types="vite/client" />
/**
 * The two ops tools. Neither is wired to a cron or reachable from the client;
 * both are run by hand with `npx convex run`, which is exactly why they need a
 * test: nothing else exercises them and a rename would go unnoticed until the
 * day someone needs them.
 *
 * `resetRateLimit` is the support escape hatch for a user the limiter locked
 * out. `createReviewAccount` seeds the App Review demo account and has to be
 * idempotent, because `vexpo full` re-runs it on every setup.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser } from "./_harness";

const ENV: Record<string, string> = {
  CONVEX_SITE_URL: "https://test.convex.site",
  SITE_URL: "vexpo://",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
};

afterEach(() => vi.unstubAllEnvs());

describe("admin.resetRateLimit", () => {
  test("clears one caller's bucket so a locked-out user can act again", async () => {
    const t = initConvexTest();
    const user = await seedAuthedUser(t);
    const asUser = t.withIdentity(identityFor(user.authUserId, user.sessionId));

    // `criticalAction` is a capacity-5 token bucket. `restoreAccount` spends
    // from it and is a no-op on an account that was never deleted, so it
    // drains the bucket without changing anything else.
    for (let i = 0; i < 5; i++) {
      await asUser.mutation(api.users.restoreAccount, {});
    }
    await expect(asUser.mutation(api.users.restoreAccount, {})).rejects.toThrow();

    const key = user.appUserId.toString();
    expect(
      await t.mutation(internal.admin.resetRateLimit, { name: "criticalAction", key }),
    ).toEqual({ reset: true, name: "criticalAction", key });

    // The bucket is clear, so the same call goes through again.
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
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);

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

    // The users row was mirrored by the onCreate trigger.
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
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);

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

    // The new password is what signs in, hashed through Better Auth's own
    // hasher rather than written raw.
    const response = await t.fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: ENV.SITE_URL },
      body: JSON.stringify({ email: "review2@example.com", password: "a-different-password" }),
    });
    expect(response.status).toBe(200);
  });
});
