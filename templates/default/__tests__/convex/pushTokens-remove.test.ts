/// <reference types="vite/client" />
/**
 * Real convexTest coverage for the authed `pushTokens.remove` mutation.
 *
 * `remove` (convex/pushTokens.ts) is an authMutation that:
 *   1. rate-limits on "userAction" (needs the rateLimiter component),
 *   2. finds the row by the "by_token" index,
 *   3. deletes it ONLY when it exists AND row.userId === ctx.user._id,
 *   4. returns null.
 *
 * Auth is seeded the same way as _auth-harness.test.ts: a Better Auth
 * component user + unexpired session whose real ids back the identity, plus
 * the mirrored app `users` row keyed by authId. pushTokens.userId is the app
 * users _id, so we seed rows pointing at it.
 */
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { type AuthedTest, identityFor, initConvexTest, seedAuthedUser } from "./_harness";

/** Insert a pushTokens row owned by `userId` and return its id. */
async function seedPushToken(t: AuthedTest, userId: Id<"users">, token: string) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("pushTokens", {
      userId,
      token,
      deviceType: "ios" as const,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    }),
  );
}

describe("pushTokens.remove (authMutation)", () => {
  test("deletes the caller's own token and returns null", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    const tokenId = await seedPushToken(t, appUserId, "ExponentPushToken[own-device]");

    // Sanity: the row exists before we call remove.
    expect(await t.run((ctx) => ctx.db.get(tokenId))).not.toBeNull();

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.pushTokens.remove, {
      token: "ExponentPushToken[own-device]",
    });

    expect(result).toBeNull();
    // Real DB effect: the row is gone.
    expect(await t.run((ctx) => ctx.db.get(tokenId))).toBeNull();
  });

  test("does NOT delete a token owned by another user", async () => {
    const t = initConvexTest();
    const caller = await seedAuthedUser(t);
    const other = await seedAuthedUser(t);

    // A token that belongs to `other`, but `caller` knows the string and asks
    // to remove it. The userId guard must leave it untouched.
    const sharedToken = "ExponentPushToken[other-device]";
    const otherTokenId = await seedPushToken(t, other.appUserId, sharedToken);

    const asCaller = t.withIdentity(identityFor(caller.authUserId, caller.sessionId));
    const result = await asCaller.mutation(api.pushTokens.remove, { token: sharedToken });

    expect(result).toBeNull(); // no error, just a no-op
    // The other user's row survives.
    const surviving = await t.run((ctx) => ctx.db.get(otherTokenId));
    expect(surviving).not.toBeNull();
    expect(surviving?.userId).toBe(other.appUserId);
  });

  test("removing a non-existent token is a no-op returning null", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    // Seed an unrelated token to prove remove() doesn't nuke the table.
    const keepId = await seedPushToken(t, appUserId, "ExponentPushToken[keep]");

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.pushTokens.remove, {
      token: "ExponentPushToken[never-registered]",
    });

    expect(result).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(keepId))).not.toBeNull();
  });

  test("throws ConvexError when called unauthenticated", async () => {
    const t = initConvexTest();
    const { appUserId } = await seedAuthedUser(t);
    const tokenId = await seedPushToken(t, appUserId, "ExponentPushToken[guarded]");

    // No identity -> requireAuthenticatedUser throws before any delete.
    await expect(
      t.mutation(api.pushTokens.remove, { token: "ExponentPushToken[guarded]" }),
    ).rejects.toThrowError(ConvexError);

    // And nothing was deleted.
    expect(await t.run((ctx) => ctx.db.get(tokenId))).not.toBeNull();
  });
});
