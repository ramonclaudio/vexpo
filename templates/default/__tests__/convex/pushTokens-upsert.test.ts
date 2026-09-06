/// <reference types="vite/client" />
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

    const rows = await t.run(async (ctx) => ctx.db.query("pushTokens").collect());
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row._id).toBe(tokenId);
    expect(row.userId).toBe(appUserId);
    expect(row.token).toBe("ExponentPushToken[aaa]");
    expect(row.deviceType).toBe("ios");
    expect(row.createdAt).toBeGreaterThanOrEqual(before);
    expect(row.createdAt).toBeLessThanOrEqual(after);
    expect(row.updatedAt).toBe(row.createdAt);
    expect(row.lastSeenAt).toBe(row.createdAt);
    expect(row.revoked).toBe(false);
    expect(row.revokedAt).toBeUndefined();
    expect(row.lastErrorCode).toBeUndefined();
  });

  test("re-upserting the same token patches the row instead of duplicating, and clears revocation", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));

    const firstId = await asUser.mutation(api.pushTokens.upsert, {
      token: "ExponentPushToken[dup]",
      deviceType: "ios",
    });

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

    const before = Date.now();
    const secondId = await asUser.mutation(api.pushTokens.upsert, {
      token: "ExponentPushToken[dup]",
      deviceType: "ios",
    });

    expect(secondId).toBe(firstId);
    const rows = await t.run(async (ctx) => ctx.db.query("pushTokens").collect());
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.userId).toBe(appUserId);
    expect(row.createdAt).toBe(stale);
    expect(row.updatedAt).toBeGreaterThanOrEqual(before);
    expect(row.lastSeenAt).toBeGreaterThanOrEqual(before);
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

    const ownerTokenId = await asOwner.mutation(api.pushTokens.upsert, {
      token: "ExponentPushToken[shared]",
      deviceType: "ios",
    });

    const takerTokenId = await asTaker.mutation(api.pushTokens.upsert, {
      token: "ExponentPushToken[shared]",
      deviceType: "ios",
    });

    expect(takerTokenId).toBe(ownerTokenId);
    const rows = await t.run(async (ctx) => ctx.db.query("pushTokens").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(taker.appUserId);
    expect(rows[0].userId).not.toBe(owner.appUserId);
  });

  test("throws ConvexError when called without authentication", async () => {
    const t = initConvexTest();
    await expect(
      t.mutation(api.pushTokens.upsert, { token: "ExponentPushToken[anon]", deviceType: "ios" }),
    ).rejects.toThrowError(ConvexError);

    const rows = await t.run(async (ctx) => ctx.db.query("pushTokens").collect());
    expect(rows).toHaveLength(0);
  });
});
