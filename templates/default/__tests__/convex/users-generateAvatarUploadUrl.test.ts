/// <reference types="vite/client" />
/**
 * `users.generateAvatarUploadUrl` hands the client a one-shot Convex storage
 * URL to POST a photo to. It is the only mutation on the `avatarUpload` bucket
 * (30/hour, capacity 10), which is what stops a loop in the picker from
 * filling storage.
 */
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser } from "./_harness";

describe("users.generateAvatarUploadUrl", () => {
  test("returns an upload URL for a signed-in user", async () => {
    const t = initConvexTest();
    const user = await seedAuthedUser(t);
    const asUser = t.withIdentity(identityFor(user.authUserId, user.sessionId));

    const url = await asUser.mutation(api.users.generateAvatarUploadUrl, {});
    expect(url).toEqual(expect.any(String));
    expect(() => new URL(url)).not.toThrow();
  });

  test("works for a guest, since their avatar is what the merge carries over", async () => {
    const t = initConvexTest();
    const guest = await seedAuthedUser(t, { isAnonymous: true });
    const asGuest = t.withIdentity(identityFor(guest.authUserId, guest.sessionId));

    expect(await asGuest.mutation(api.users.generateAvatarUploadUrl, {})).toEqual(
      expect.any(String),
    );
  });

  test("requires a session", async () => {
    const t = initConvexTest();
    await expect(t.mutation(api.users.generateAvatarUploadUrl, {})).rejects.toThrow(ConvexError);
  });

  test("rate-limits on the avatarUpload bucket, capacity 10", async () => {
    const t = initConvexTest();
    const user = await seedAuthedUser(t);
    const asUser = t.withIdentity(identityFor(user.authUserId, user.sessionId));

    for (let i = 0; i < 10; i++) {
      await asUser.mutation(api.users.generateAvatarUploadUrl, {});
    }
    await expect(asUser.mutation(api.users.generateAvatarUploadUrl, {})).rejects.toThrow();
  });
});
