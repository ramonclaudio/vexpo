/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser } from "./_harness";

describe("authenticated convexTest harness", () => {
  test("baseline: an unauthed public query still works", async () => {
    const t = initConvexTest();
    const providers = await t.query(api.auth.getEnabledProviders, {});
    expect(providers).toMatchObject({ apple: expect.any(Boolean) });
  });

  test("getMe returns the seeded user when authenticated", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId, name, email } = await seedAuthedUser(t, {
      name: "Grace Hopper",
      email: "grace@example.com",
    });

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const me = await asUser.query(api.users.getMe, {});

    expect(me).not.toBeNull();
    expect(me!._id).toBe(appUserId);
    expect(me!.authUserId).toBe(authUserId);
    expect(me!.name).toBe(name);
    expect(me!.email).toBe(email);
    expect(me!.emailVerified).toBe(true);
  });

  test("getMe returns null when unauthenticated", async () => {
    const t = initConvexTest();
    await seedAuthedUser(t);
    const me = await t.query(api.users.getMe, {});
    expect(me).toBeNull();
  });

  test("updateProfile writes bio to the real app users row", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const returnedId = await asUser.mutation(api.users.updateProfile, {
      bio: "Countess of computing.",
    });
    expect(returnedId).toBe(appUserId);

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.bio).toBe("Countess of computing.");

    const me = await asUser.query(api.users.getMe, {});
    expect(me!.bio).toBe("Countess of computing.");
  });

  test("authMutation throws ConvexError when unauthenticated", async () => {
    const t = initConvexTest();
    await expect(t.mutation(api.users.updateProfile, { bio: "nope" })).rejects.toThrowError(
      ConvexError,
    );
  });

  test("expired session resolves to no user (getMe null)", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId } = await seedAuthedUser(t, {
      expiresAt: Date.now() - 1000,
    });

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    expect(await asUser.query(api.users.getMe, {})).toBeNull();
  });

  test("identity with a bogus sessionId resolves to no user", async () => {
    const t = initConvexTest();
    const { authUserId } = await seedAuthedUser(t);
    const asUser = t.withIdentity(identityFor(authUserId, "nonexistent_session_id"));
    expect(await asUser.query(api.users.getMe, {})).toBeNull();
  });
});
