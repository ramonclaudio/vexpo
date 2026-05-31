/// <reference types="vite/client" />
/**
 * Real convexTest coverage for `users.deleteAvatar` (authMutation).
 *
 * deleteAvatar (convex/users.ts):
 *   1. rateLimitWithThrow(ctx, "userAction", ...)   -> needs rateLimiter component
 *   2. if (ctx.user.avatar) ctx.storage.delete(ctx.user.avatar)
 *   3. ctx.db.patch(ctx.user._id, { avatar: undefined, updatedAt: now })
 *   4. return { success: true }
 *
 * Auth resolves exactly as the harness in `_auth-harness.test.ts` documents:
 * better-auth `user` + unexpired `session` rows whose REAL component ids match
 * identity.subject / identity.sessionId, plus the mirrored app `users` row keyed
 * by authId. See that file for the full walkthrough.
 */
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser } from "./_harness";

describe("users.deleteAvatar", () => {
  test("clears the avatar field and frees the storage blob", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    // Store a real avatar blob and attach it to the app users row, then
    // capture the row's updatedAt so we can prove the patch bumps it.
    const { storageId, updatedAtBefore } = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["avatar-bytes"], { type: "image/png" }));
      await ctx.db.patch(appUserId, { avatar: id, updatedAt: 1 });
      const row = await ctx.db.get(appUserId);
      return { storageId: id, updatedAtBefore: row!.updatedAt };
    });

    // Precondition: the blob is actually retrievable before deletion.
    const urlBefore = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
    expect(urlBefore).not.toBeNull();
    expect(updatedAtBefore).toBe(1);

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.users.deleteAvatar, {});
    expect(result).toEqual({ success: true });

    // DB effect: avatar field is cleared and updatedAt moved off the stale 1.
    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row!.avatar).toBeUndefined();
    expect(row!.updatedAt).toBeGreaterThan(updatedAtBefore);

    // Storage effect: the blob is gone (deleted ids resolve to a null url).
    const urlAfter = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
    expect(urlAfter).toBeNull();
  });

  test("is a no-op on storage when there is no avatar, still returns success", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    // Seed an unrelated stored blob to prove the no-avatar path doesn't touch
    // storage indiscriminately (the `if (ctx.user.avatar)` guard).
    const bystanderId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["someone-elses-file"], { type: "image/png" })),
    );

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.users.deleteAvatar, {});
    expect(result).toEqual({ success: true });

    // The users row never had an avatar; it stays cleared.
    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row!.avatar).toBeUndefined();

    // The unrelated blob is untouched.
    const bystanderUrl = await t.run(async (ctx) => ctx.storage.getUrl(bystanderId));
    expect(bystanderUrl).not.toBeNull();
  });

  test("throws ConvexError when called unauthenticated", async () => {
    const t = initConvexTest();
    await seedAuthedUser(t); // data exists; we just don't present an identity
    await expect(t.mutation(api.users.deleteAvatar, {})).rejects.toThrowError(ConvexError);
  });

  test("an identity with an expired session is treated as unauthenticated", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t, {
      expiresAt: Date.now() - 1000, // already expired
    });

    // Capture the seeded updatedAt so we can prove no patch ran.
    const updatedAtBefore = await t.run(async (ctx) => {
      const row = await ctx.db.get(appUserId);
      return row!.updatedAt;
    });

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    await expect(asUser.mutation(api.users.deleteAvatar, {})).rejects.toThrowError(ConvexError);

    // And the row is untouched: no patch ran, so updatedAt is still the seed value.
    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row!.updatedAt).toBe(updatedAtBefore);
  });
});
