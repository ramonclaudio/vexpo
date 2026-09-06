/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser } from "./_harness";

describe("users.deleteAvatar", () => {
  test("clears the avatar field and frees the storage blob", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    const { storageId, updatedAtBefore } = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["avatar-bytes"], { type: "image/png" }));
      await ctx.db.patch(appUserId, { avatar: id, updatedAt: 1 });
      const row = await ctx.db.get(appUserId);
      return { storageId: id, updatedAtBefore: row!.updatedAt };
    });

    const urlBefore = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
    expect(urlBefore).not.toBeNull();
    expect(updatedAtBefore).toBe(1);

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.users.deleteAvatar, {});
    expect(result).toEqual({ success: true });

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row!.avatar).toBeUndefined();
    expect(row!.updatedAt).toBeGreaterThan(updatedAtBefore);

    const urlAfter = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
    expect(urlAfter).toBeNull();
  });

  test("is a no-op on storage when there is no avatar, still returns success", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    const bystanderId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["someone-elses-file"], { type: "image/png" })),
    );

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.users.deleteAvatar, {});
    expect(result).toEqual({ success: true });

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row!.avatar).toBeUndefined();

    const bystanderUrl = await t.run(async (ctx) => ctx.storage.getUrl(bystanderId));
    expect(bystanderUrl).not.toBeNull();
  });

  test("throws ConvexError when called unauthenticated", async () => {
    const t = initConvexTest();
    await seedAuthedUser(t);
    await expect(t.mutation(api.users.deleteAvatar, {})).rejects.toThrowError(ConvexError);
  });

  test("an identity with an expired session is treated as unauthenticated", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t, {
      expiresAt: Date.now() - 1000,
    });

    const updatedAtBefore = await t.run(async (ctx) => {
      const row = await ctx.db.get(appUserId);
      return row!.updatedAt;
    });

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    await expect(asUser.mutation(api.users.deleteAvatar, {})).rejects.toThrowError(ConvexError);

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row!.updatedAt).toBe(updatedAtBefore);
  });
});
