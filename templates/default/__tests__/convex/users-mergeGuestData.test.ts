/// <reference types="vite/client" />
/**
 * `users.mergeGuestData` is what makes "continue as guest" safe to accept: it
 * runs from the anonymous plugin's `onLinkAccount`, in the same request as the
 * sign-in, after the real account exists and before Better Auth deletes the
 * guest user. The delete fires the `user.onDelete` trigger, which drops the
 * guest `users` row and frees whatever `_storage` blob it points at, so
 * anything the merge leaves behind is gone for good.
 *
 * What has to hold:
 *   - bio and avatar move onto an account that doesn't have them
 *   - neither one overwrites an account that does
 *   - a moved avatar is un-pointed on the guest row so onDelete can't free it
 *   - push tokens repoint, and a token the account already has is dropped
 *     rather than duplicated (same device, so this is the common case)
 *   - a missing target row throws instead of losing the guest's data quietly
 */
import { describe, expect, test } from "vitest";

import { internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { initConvexTest, seedAuthedUser, seedToken } from "./_harness";

/** A fake storage id. The merge only moves the reference, it never reads it. */
async function seedBlob(t: ReturnType<typeof initConvexTest>, body: string) {
  return t.run(async (ctx) => ctx.storage.store(new Blob([body])));
}

describe("users.mergeGuestData", () => {
  test("moves bio, avatar and push tokens onto an empty account", async () => {
    const t = initConvexTest();
    const guest = await seedAuthedUser(t, { isAnonymous: true });
    const account = await seedAuthedUser(t);

    const blob = await seedBlob(t, "guest-avatar");
    await t.run(async (ctx) => {
      await ctx.db.patch(guest.appUserId, { bio: "wrote this as a guest", avatar: blob });
    });
    const tokenId = await seedToken(t, guest.appUserId, "ExponentPushToken[guest]");

    await t.mutation(internal.users.mergeGuestData, {
      guestAuthId: guest.authUserId,
      authId: account.authUserId,
    });

    const target = await t.run(async (ctx) => ctx.db.get(account.appUserId));
    expect(target?.bio).toBe("wrote this as a guest");
    expect(target?.avatar).toBe(blob);

    // Un-pointed on the guest row, so the onDelete trigger that runs next
    // frees nothing. Without this the account's avatar 404s minutes later.
    const guestRow = await t.run(async (ctx) => ctx.db.get(guest.appUserId));
    expect(guestRow?.avatar).toBeUndefined();

    const token = await t.run(async (ctx) => ctx.db.get(tokenId));
    expect(token?.userId).toBe(account.appUserId);
  });

  test("never overwrites a profile the account already has", async () => {
    const t = initConvexTest();
    const guest = await seedAuthedUser(t, { isAnonymous: true });
    const account = await seedAuthedUser(t);

    const guestBlob = await seedBlob(t, "guest-avatar");
    const accountBlob = await seedBlob(t, "account-avatar");
    await t.run(async (ctx) => {
      await ctx.db.patch(guest.appUserId, { bio: "guest bio", avatar: guestBlob });
      await ctx.db.patch(account.appUserId, { bio: "account bio", avatar: accountBlob });
    });

    await t.mutation(internal.users.mergeGuestData, {
      guestAuthId: guest.authUserId,
      authId: account.authUserId,
    });

    const target = await t.run(async (ctx) => ctx.db.get(account.appUserId));
    expect(target?.bio).toBe("account bio");
    expect(target?.avatar).toBe(accountBlob);

    // The guest's blob stays on the guest row, so onDelete frees it.
    const guestRow = await t.run(async (ctx) => ctx.db.get(guest.appUserId));
    expect(guestRow?.avatar).toBe(guestBlob);
  });

  test("drops a push token the account already holds instead of duplicating it", async () => {
    const t = initConvexTest();
    const guest = await seedAuthedUser(t, { isAnonymous: true });
    const account = await seedAuthedUser(t);

    // Same device: the account signed in here before, so it already owns the
    // token the guest session re-registered.
    const guestTokenId = await seedToken(t, guest.appUserId, "ExponentPushToken[same]");
    const accountTokenId = await seedToken(t, account.appUserId, "ExponentPushToken[same]");

    await t.mutation(internal.users.mergeGuestData, {
      guestAuthId: guest.authUserId,
      authId: account.authUserId,
    });

    expect(await t.run(async (ctx) => ctx.db.get(guestTokenId))).toBeNull();
    const kept = await t.run(async (ctx) => ctx.db.get(accountTokenId));
    expect(kept?.userId).toBe(account.appUserId);
  });

  test("no-ops when the guest row is already gone", async () => {
    const t = initConvexTest();
    const account = await seedAuthedUser(t);

    await expect(
      t.mutation(internal.users.mergeGuestData, {
        guestAuthId: "auth-that-never-existed",
        authId: account.authUserId,
      }),
    ).resolves.toBeNull();
  });

  test("throws when the account row is missing, rather than dropping the data", async () => {
    const t = initConvexTest();
    const guest = await seedAuthedUser(t, { isAnonymous: true });

    await expect(
      t.mutation(internal.users.mergeGuestData, {
        guestAuthId: guest.authUserId,
        authId: "auth-with-no-users-row",
      }),
    ).rejects.toThrow(/no users row/);
  });

  test("no-ops when the guest and the account are the same user", async () => {
    const t = initConvexTest();
    const account = await seedAuthedUser(t);
    await t.run(async (ctx) => ctx.db.patch(account.appUserId, { bio: "unchanged" }));

    await t.mutation(internal.users.mergeGuestData, {
      guestAuthId: account.authUserId,
      authId: account.authUserId,
    });

    const row = await t.run(async (ctx) => ctx.db.get(account.appUserId as Id<"users">));
    expect(row?.bio).toBe("unchanged");
  });
});
