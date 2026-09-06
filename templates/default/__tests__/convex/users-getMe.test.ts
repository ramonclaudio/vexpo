/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser } from "./_harness";

describe("users.getMe", () => {
  test("returns the merged user from real seeded rows when authenticated", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId, name, email } = await seedAuthedUser(t, {
      name: "Grace Hopper",
    });
    await t.run(async (ctx) => ctx.db.patch(appUserId, { bio: "Compiler pioneer." }));

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const me = await asUser.query(api.users.getMe, {});

    expect(me).not.toBeNull();
    expect(me!._id).toBe(appUserId);
    expect(me!.authId).toBe(authUserId);
    expect(me!.authUserId).toBe(authUserId);
    expect(me!.bio).toBe("Compiler pioneer.");
    expect(me!.name).toBe(name);
    expect(me!.email).toBe(email);
    expect(me!.emailVerified).toBe(true);
    expect(me!.hasUploadedAvatar).toBe(false);
    expect(me!.avatarUrl).toBeNull();
  });

  test("returns null when unauthenticated", async () => {
    const t = initConvexTest();
    await seedAuthedUser(t);
    expect(await t.query(api.users.getMe, {})).toBeNull();
  });

  test("returns null when the session is expired", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId } = await seedAuthedUser(t, {
      expiresAt: Date.now() - 1000,
    });
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    expect(await asUser.query(api.users.getMe, {})).toBeNull();
  });

  test("updateProfile rejects an over-long bio and leaves the row unchanged", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    await t.run(async (ctx) => ctx.db.patch(appUserId, { bio: "original" }));
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));

    const tooLong = "x".repeat(501);
    await expect(asUser.mutation(api.users.updateProfile, { bio: tooLong })).rejects.toThrow(
      ConvexError,
    );

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.bio).toBe("original");
    const me = await asUser.query(api.users.getMe, {});
    expect(me!.bio).toBe("original");
  });
});
