/// <reference types="vite/client" />
/**
 * Real convexTest coverage for `users.restoreAccount` (authMutation).
 *
 * restoreAccount lifts a pending soft-delete: when the authed user's app row
 * carries a `deletedAt` tombstone, it clears `deletedAt`, bumps `updatedAt`,
 * and writes an `accountDeletionAudit` row with event "restored". When the
 * row has no tombstone it's a no-op (returns success, writes nothing).
 *
 * The auth harness mirrors __tests__/convex/_auth-harness.test.ts: seed a
 * Better Auth `user` + unexpired `session` in the component db, capture their
 * REAL component ids, seed the mirrored app `users` row keyed by authId, then
 * drive the mutation with a matching identity. restoreAccount rate-limits via
 * the `criticalAction` bucket, so the rateLimiter component must be registered.
 */
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { auditRowsFor, identityFor, initConvexTest, seedAuthedUser } from "./_harness";

describe("users.restoreAccount", () => {
  test("clears deletedAt and writes a 'restored' audit row for a tombstoned user", async () => {
    const t = initConvexTest();
    const tombstonedAt = Date.now() - 60_000;
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t, {
      deletedAt: tombstonedAt,
    });

    // Precondition: row really is tombstoned before we restore.
    const before = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(before?.deletedAt).toBe(tombstonedAt);

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.users.restoreAccount, {});
    expect(result).toEqual({ success: true });

    // Real DB effect: the tombstone is gone and updatedAt advanced past it.
    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after).not.toBeNull();
    expect(after!.deletedAt).toBeUndefined();
    expect(after!.updatedAt).toBeGreaterThan(tombstonedAt);

    // Exactly one audit row, event "restored", keyed to this user.
    const audit = await auditRowsFor(t, appUserId);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.event).toBe("restored");
    expect(audit[0]!.userId).toBe(appUserId);
    expect(audit[0]!.authId).toBe(authUserId);
  });

  test("no-op for a user without a tombstone: no audit row, row untouched", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t); // no deletedAt

    const beforeUpdatedAt = (await t.run(async (ctx) => ctx.db.get(appUserId)))!.updatedAt;

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.users.restoreAccount, {});
    expect(result).toEqual({ success: true });

    // Early return: updatedAt is NOT bumped and no audit row is written.
    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after!.deletedAt).toBeUndefined();
    expect(after!.updatedAt).toBe(beforeUpdatedAt);

    const audit = await auditRowsFor(t, appUserId);
    expect(audit).toHaveLength(0);
  });

  test("throws ConvexError when unauthenticated (no identity)", async () => {
    const t = initConvexTest();
    await seedAuthedUser(t, { deletedAt: Date.now() - 60_000 });

    // authMutation -> requireAuthenticatedUser -> authenticationRequired().
    await expect(t.mutation(api.users.restoreAccount, {})).rejects.toThrowError(ConvexError);
  });

  test("throttles the criticalAction bucket: the call past capacity throws", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId } = await seedAuthedUser(t); // no tombstone
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));

    // criticalAction is a capacity-5 token bucket. restoreAccount runs the rate
    // check before its idempotent early-return and (unlike deleteAccount) never
    // revokes the session, so it's safely repeatable with one identity. The
    // first 5 rapid calls consume the bucket; the 6th has no token and throws.
    // Guards rateLimitWithThrow against a dropped `throws`, a wrong bucket name,
    // or a removed call. (A throttled real user just retries after refill.)
    for (let i = 0; i < 5; i++) {
      await asUser.mutation(api.users.restoreAccount, {});
    }
    await expect(asUser.mutation(api.users.restoreAccount, {})).rejects.toThrowError(ConvexError);
  });
});
