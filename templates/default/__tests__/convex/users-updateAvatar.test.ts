/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { initConvexTest, seedAuthedUser, identityFor, type AuthedTest } from "./_harness";

async function storeBlob(t: AuthedTest, body: string) {
  return await t.run(async (ctx) => ctx.storage.store(new Blob([body])));
}

describe("users.updateAvatar", () => {
  test("authed: patches avatar to the storage id and returns its url", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    const storageId = await storeBlob(t, "new-avatar-bytes");

    const before = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(before?.avatar).toBeUndefined();

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.users.updateAvatar, { storageId });

    expect(result.avatarUrl).toEqual(expect.any(String));

    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after?.avatar).toBe(storageId);
    expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);

    const url = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
    expect(url).not.toBeNull();
  });

  test("authed: replacing an avatar deletes the previous blob from storage", async () => {
    const t = initConvexTest();
    const oldStorageId = await storeBlob(t, "original-bytes");
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    await t.run(async (ctx) => ctx.db.patch(appUserId, { avatar: oldStorageId }));

    expect(await t.run(async (ctx) => ctx.storage.getUrl(oldStorageId))).not.toBeNull();

    const newStorageId = await storeBlob(t, "replacement-bytes");
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    await asUser.mutation(api.users.updateAvatar, { storageId: newStorageId });

    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after?.avatar).toBe(newStorageId);

    expect(await t.run(async (ctx) => ctx.storage.getUrl(oldStorageId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.storage.getUrl(newStorageId))).not.toBeNull();
  });

  test("unauthenticated: throws ConvexError and writes nothing", async () => {
    const t = initConvexTest();
    const { appUserId } = await seedAuthedUser(t);
    const storageId = await storeBlob(t, "orphan-bytes");

    await expect(t.mutation(api.users.updateAvatar, { storageId })).rejects.toThrowError(
      ConvexError,
    );

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.avatar).toBeUndefined();
  });
});
