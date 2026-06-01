/// <reference types="vite/client" />
/**
 * Authenticated convexTest coverage for `users.deleteAccount`.
 *
 * `deleteAccount` is an authMutation that soft-deletes the current user:
 *   - rate-limits on the `criticalAction` bucket (rateLimiter component)
 *   - drops the user's push tokens so notifications stop
 *   - revokes Better Auth sessions for the user
 *   - patches the app users row with `deletedAt`
 *   - writes a `requested` row to `accountDeletionAudit`
 *   - is idempotent: a second call no-ops and returns the original deletedAt
 *
 * Auth resolution mirrors the proven harness at
 * __tests__/convex/_auth-harness.test.ts: seed a Better Auth user + unexpired
 * session in the component db, seed the mirrored app `users` row keyed by
 * authId, then drive calls with an identity whose subject == better-auth user
 * id and sessionId == better-auth session id (both REAL component doc ids).
 */
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import {
  auditRowsFor,
  componentSessionsFor,
  identityFor,
  initConvexTest,
  seedAuthedUser,
} from "./_harness";

const FAR_FUTURE = Date.now() + 7 * 24 * 60 * 60 * 1000;

describe("users.deleteAccount", () => {
  test("happy path: tombstones the user, drops push tokens, writes an audit row", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    // Give the user a push token so we can prove deleteAccount removes it.
    const tokenNow = Date.now();
    const pushTokenId = await t.run(async (ctx) =>
      ctx.db.insert("pushTokens", {
        userId: appUserId,
        token: "ExponentPushToken[abc123]",
        deviceType: "ios",
        createdAt: tokenNow,
        updatedAt: tokenNow,
      }),
    );

    // Sanity: the row starts un-tombstoned with one live session.
    const before = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(before?.deletedAt).toBeUndefined();
    expect(await componentSessionsFor(t, authUserId)).toHaveLength(1);

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const beforeCall = Date.now();
    const result = await asUser.mutation(api.users.deleteAccount, {});
    const afterCall = Date.now();

    // Return value: success + a deletedAt timestamp inside the call window.
    expect(result.success).toBe(true);
    expect(result.deletedAt).toBeGreaterThanOrEqual(beforeCall);
    expect(result.deletedAt).toBeLessThanOrEqual(afterCall);

    // Real DB effect: the users row now carries the same deletedAt.
    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after?.deletedAt).toBe(result.deletedAt);
    expect(after?.updatedAt).toBe(result.deletedAt);

    // Push token deleted so notifications stop.
    const tokenGone = await t.run(async (ctx) => ctx.db.get(pushTokenId));
    expect(tokenGone).toBeNull();

    // Better Auth sessions revoked so the user's other devices are signed out.
    // Without this assertion, dropping the session-revocation line would leave
    // every deleteAccount test green.
    expect(await componentSessionsFor(t, authUserId)).toHaveLength(0);

    // Exactly one "requested" audit row keyed to this user.
    const audit = await auditRowsFor(t, appUserId);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.event).toBe("requested");
    expect(audit[0]!.authId).toBe(authUserId);
    expect(audit[0]!.at).toBe(result.deletedAt);
  });

  test("idempotent: a second call no-ops and does not write a duplicate audit row", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    const first = await t
      .withIdentity(identityFor(authUserId, sessionId))
      .mutation(api.users.deleteAccount, {});

    // deleteAccount revoked every session for this user, so the first
    // identity no longer resolves. A returning user signs back in within the
    // grace window (fresh session) before the client retries. Seed that
    // session and drive the retry through it, same user, already tombstoned.
    const retryNow = Date.now();
    const retrySessionId = await t.runInComponent("betterAuth", async (ctx) => {
      const session = await ctx.db.insert("session", {
        userId: authUserId,
        token: `tok_retry_${authUserId}`,
        expiresAt: FAR_FUTURE,
        createdAt: retryNow,
        updatedAt: retryNow,
      });
      return session as string;
    });
    const asUser = t.withIdentity(identityFor(authUserId, retrySessionId));

    // Second call returns the ORIGINAL deletedAt and touches nothing new.
    const second = await asUser.mutation(api.users.deleteAccount, {});
    expect(second.success).toBe(true);
    expect(second.deletedAt).toBe(first.deletedAt);

    // deletedAt unchanged on the row.
    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.deletedAt).toBe(first.deletedAt);

    // Still exactly one audit row: the no-op path inserts nothing.
    const audit = await auditRowsFor(t, appUserId);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.event).toBe("requested");
  });

  test("authMutation guard: rejects with ConvexError when unauthenticated", async () => {
    const t = initConvexTest();
    // Seed a real user so the table is non-empty; we just never pass identity.
    const { appUserId } = await seedAuthedUser(t);

    await expect(t.mutation(api.users.deleteAccount, {})).rejects.toThrowError(ConvexError);

    // And the guard ran before any write: the row is untouched, no audit row.
    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.deletedAt).toBeUndefined();
    expect(await auditRowsFor(t, appUserId)).toHaveLength(0);
  });
});
