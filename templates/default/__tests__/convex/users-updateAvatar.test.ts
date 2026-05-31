/// <reference types="vite/client" />
/**
 * Real convexTest coverage for users.updateAvatar (authMutation).
 *
 * updateAvatar(storageId):
 *   - rate-limits on the "userAction" bucket (needs rateLimiter component)
 *   - deletes the previous uploaded avatar from storage if one exists
 *   - patches the app users row: avatar = storageId, bumps updatedAt
 *   - returns { avatarUrl } resolved via ctx.storage.getUrl(storageId)
 *
 * Auth is driven the same way as _auth-harness.test.ts: seed a Better Auth
 * user + unexpired session in the component db, seed the mirrored app users
 * row keyed by authId, then call with a matching identity (subject == auth
 * user id, sessionId == session id, both REAL component doc ids).
 */
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { initConvexTest, seedAuthedUser, identityFor, type AuthedTest } from "./_harness";

/** Store a real blob and return its _storage id, the same shape the handler patches. */
async function storeBlob(t: AuthedTest, body: string) {
  return await t.run(async (ctx) => ctx.storage.store(new Blob([body])));
}

describe("users.updateAvatar", () => {
  test("authed: patches avatar to the storage id and returns its url", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    const storageId = await storeBlob(t, "new-avatar-bytes");

    const before = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(before?.avatar).toBeUndefined(); // no avatar to start

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.users.updateAvatar, { storageId });

    // Return shape: a resolvable url for the stored blob (not null).
    expect(result.avatarUrl).toEqual(expect.any(String));

    // Real DB effect: the app users row now points at the new storage id
    // and updatedAt was bumped past its seed value.
    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after?.avatar).toBe(storageId);
    expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);

    // The stored blob is still reachable (it's the current avatar).
    const url = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
    expect(url).not.toBeNull();
  });

  test("authed: replacing an avatar deletes the previous blob from storage", async () => {
    const t = initConvexTest();
    const oldStorageId = await storeBlob(t, "original-bytes");
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    // Start the app row with an existing avatar so the handler deletes the old blob.
    await t.run(async (ctx) => ctx.db.patch(appUserId, { avatar: oldStorageId }));

    // Sanity: the old blob exists before we replace it.
    expect(await t.run(async (ctx) => ctx.storage.getUrl(oldStorageId))).not.toBeNull();

    const newStorageId = await storeBlob(t, "replacement-bytes");
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    await asUser.mutation(api.users.updateAvatar, { storageId: newStorageId });

    // The row now points at the new blob...
    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after?.avatar).toBe(newStorageId);

    // ...and the OLD blob was deleted from storage (getUrl returns null).
    expect(await t.run(async (ctx) => ctx.storage.getUrl(oldStorageId))).toBeNull();
    // New blob is still present.
    expect(await t.run(async (ctx) => ctx.storage.getUrl(newStorageId))).not.toBeNull();
  });

  test("unauthenticated: throws ConvexError and writes nothing", async () => {
    const t = initConvexTest();
    const { appUserId } = await seedAuthedUser(t); // data exists; we just don't authenticate
    const storageId = await storeBlob(t, "orphan-bytes");

    // authMutation requires a user -> authenticationRequired() (a ConvexError).
    await expect(t.mutation(api.users.updateAvatar, { storageId })).rejects.toThrowError(
      ConvexError,
    );

    // The guarded write never landed.
    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.avatar).toBeUndefined();
  });
});
