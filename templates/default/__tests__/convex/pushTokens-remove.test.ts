/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser, seedToken } from "./_harness";

describe("pushTokens.remove (authMutation)", () => {
  test("deletes the caller's own token and returns null", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    const tokenId = await seedToken(t, appUserId, "ExponentPushToken[own-device]");

    expect(await t.run((ctx) => ctx.db.get(tokenId))).not.toBeNull();

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.pushTokens.remove, {
      token: "ExponentPushToken[own-device]",
    });

    expect(result).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(tokenId))).toBeNull();
  });

  test("does NOT delete a token owned by another user", async () => {
    const t = initConvexTest();
    const caller = await seedAuthedUser(t);
    const other = await seedAuthedUser(t);

    const sharedToken = "ExponentPushToken[other-device]";
    const otherTokenId = await seedToken(t, other.appUserId, sharedToken);

    const asCaller = t.withIdentity(identityFor(caller.authUserId, caller.sessionId));
    const result = await asCaller.mutation(api.pushTokens.remove, { token: sharedToken });

    expect(result).toBeNull();
    const surviving = await t.run((ctx) => ctx.db.get(otherTokenId));
    expect(surviving).not.toBeNull();
    expect(surviving?.userId).toBe(other.appUserId);
  });

  test("removing a non-existent token is a no-op returning null", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    const keepId = await seedToken(t, appUserId, "ExponentPushToken[keep]");

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
    const tokenId = await seedToken(t, appUserId, "ExponentPushToken[guarded]");

    await expect(
      t.mutation(api.pushTokens.remove, { token: "ExponentPushToken[guarded]" }),
    ).rejects.toThrowError(ConvexError);

    expect(await t.run((ctx) => ctx.db.get(tokenId))).not.toBeNull();
  });
});
