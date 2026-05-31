/// <reference types="vite/client" />
/**
 * REAL convexTest coverage for pushTokens.upsert (authMutation).
 *
 * upsert insert-or-updates a single Expo push token row for the current user.
 * It rate-limits on "userAction" (so the rateLimiter component must be
 * registered) and reads existing rows by the "by_token" index, so the same
 * token never duplicates: same owner -> patch + un-revoke; different owner ->
 * reassign to the caller.
 *
 * Auth is driven exactly like _auth-harness.test.ts: seed a Better Auth
 * user + session in the component db (capturing their REAL component ids),
 * seed the mirrored app `users` row keyed by authId, then call with an
 * identity whose subject == better-auth user id and sessionId == session id.
 */
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser } from "./_harness";

describe("pushTokens.upsert", () => {
  test("inserts a new token row owned by the authenticated user", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));

    const before = Date.now();
    const tokenId = await asUser.mutation(api.pushTokens.upsert, {
      token: "ExponentPushToken[aaa]",
      deviceType: "ios",
    });
    const after = Date.now();

    // Real DB effect: exactly one row, keyed to the app user, with the values
    // the handler wrote.
    const rows = await t.run(async (ctx) => ctx.db.query("pushTokens").collect());
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row._id).toBe(tokenId);
    expect(row.userId).toBe(appUserId);
    expect(row.token).toBe("ExponentPushToken[aaa]");
    expect(row.deviceType).toBe("ios");
    // Insert path sets createdAt == updatedAt == lastSeenAt to "now".
    expect(row.createdAt).toBeGreaterThanOrEqual(before);
    expect(row.createdAt).toBeLessThanOrEqual(after);
    expect(row.updatedAt).toBe(row.createdAt);
    expect(row.lastSeenAt).toBe(row.createdAt);
    // Fresh insert is not revoked and carries no error code.
    expect(row.revoked).toBeUndefined();
    expect(row.revokedAt).toBeUndefined();
    expect(row.lastErrorCode).toBeUndefined();
  });

  test("re-upserting the same token patches the row instead of duplicating, and clears revocation", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));

    // First upsert creates the row.
    const firstId = await asUser.mutation(api.pushTokens.upsert, {
      token: "ExponentPushToken[dup]",
      deviceType: "ios",
    });

    // Simulate a revoked/dead token the way markRevoked would: set the
    // tombstone fields and a stale createdAt so we can prove createdAt is
    // preserved across the patch path while updatedAt/lastSeenAt advance.
    const stale = Date.now() - 60_000;
    await t.run(async (ctx) => {
      await ctx.db.patch(firstId, {
        createdAt: stale,
        updatedAt: stale,
        lastSeenAt: stale,
        revoked: true,
        revokedAt: stale,
        lastErrorCode: "DeviceNotRegistered",
      });
    });

    // Second upsert of the SAME token by the SAME user.
    const before = Date.now();
    const secondId = await asUser.mutation(api.pushTokens.upsert, {
      token: "ExponentPushToken[dup]",
      deviceType: "ios",
    });

    // Idempotent: same row id back, still exactly one row in the table.
    expect(secondId).toBe(firstId);
    const rows = await t.run(async (ctx) => ctx.db.query("pushTokens").collect());
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.userId).toBe(appUserId);
    // createdAt preserved, updatedAt + lastSeenAt refreshed forward.
    expect(row.createdAt).toBe(stale);
    expect(row.updatedAt).toBeGreaterThanOrEqual(before);
    expect(row.lastSeenAt).toBeGreaterThanOrEqual(before);
    // Revocation cleared: the same-user patch un-revokes and drops the error.
    expect(row.revoked).toBe(false);
    expect(row.revokedAt).toBeUndefined();
    expect(row.lastErrorCode).toBeUndefined();
  });

  test("reassigns a token to the current user when it was owned by someone else", async () => {
    const t = initConvexTest();
    const owner = await seedAuthedUser(t);
    const taker = await seedAuthedUser(t);

    const asOwner = t.withIdentity(identityFor(owner.authUserId, owner.sessionId));
    const asTaker = t.withIdentity(identityFor(taker.authUserId, taker.sessionId));

    // Owner registers the token first.
    const ownerTokenId = await asOwner.mutation(api.pushTokens.upsert, {
      token: "ExponentPushToken[shared]",
      deviceType: "ios",
    });

    // Same physical token now upserted by a different signed-in user (device
    // changed hands). Handler reassigns the existing row rather than inserting.
    const takerTokenId = await asTaker.mutation(api.pushTokens.upsert, {
      token: "ExponentPushToken[shared]",
      deviceType: "ios",
    });

    expect(takerTokenId).toBe(ownerTokenId); // reused, not a new row
    const rows = await t.run(async (ctx) => ctx.db.query("pushTokens").collect());
    expect(rows).toHaveLength(1);
    // Ownership transferred to the taker's app user id.
    expect(rows[0].userId).toBe(taker.appUserId);
    expect(rows[0].userId).not.toBe(owner.appUserId);
  });

  test("throws ConvexError when called without authentication", async () => {
    const t = initConvexTest();
    await expect(
      t.mutation(api.pushTokens.upsert, { token: "ExponentPushToken[anon]", deviceType: "ios" }),
    ).rejects.toThrowError(ConvexError);

    // And no row leaked into the table from the rejected call.
    const rows = await t.run(async (ctx) => ctx.db.query("pushTokens").collect());
    expect(rows).toHaveLength(0);
  });
});
