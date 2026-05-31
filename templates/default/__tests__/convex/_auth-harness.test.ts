/// <reference types="vite/client" />
/**
 * Authenticated convexTest harness.
 *
 * Proves we can drive the authed Convex functions (authMutation/authQuery)
 * end to end under convex-test by seeding a Better Auth session + user and
 * setting a matching identity.
 *
 * How auth resolves (convex/auth.ts -> @convex-dev/better-auth):
 *   safeGetAuthUser(ctx):
 *     1. identity = ctx.auth.getUserIdentity()            (root ctx)
 *     2. component.adapter.findOne(session) where
 *          _id == identity.sessionId AND expiresAt > now  (betterAuth db)
 *     3. component.adapter.findOne(user) where
 *          _id == identity.subject                        (betterAuth db)
 *   Both findOne calls resolve `_id` via ctx.db.get(value), so the values
 *   MUST be the REAL component doc ids we seed. Then auth.ts looks up the app
 *   `users` row by index "authId" == authUser._id.
 *
 * So three rows + one identity:
 *   - betterAuth `user`    (real id -> identity.subject)
 *   - betterAuth `session` (real id -> identity.sessionId, expiresAt future)
 *   - app `users`          (authId == betterAuth user id)
 */
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
    expect(me!.name).toBe(name); // merged from better-auth user record
    expect(me!.email).toBe(email);
    expect(me!.emailVerified).toBe(true);
  });

  test("getMe returns null when unauthenticated", async () => {
    const t = initConvexTest();
    await seedAuthedUser(t); // data exists, but we call without identity
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

    // Assert the REAL DB effect, read straight from the users table.
    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.bio).toBe("Countess of computing.");

    // And it surfaces through the authed read path too.
    const me = await asUser.query(api.users.getMe, {});
    expect(me!.bio).toBe("Countess of computing.");
  });

  test("authMutation throws ConvexError when unauthenticated", async () => {
    const t = initConvexTest();
    await expect(t.mutation(api.users.updateProfile, { bio: "nope" })).rejects.toThrowError(
      ConvexError,
    );
  });

  // The next two prove the harness genuinely traverses the Better Auth
  // session lookup (expiresAt > now, _id == sessionId) rather than short
  // circuiting on identity.subject alone.

  test("expired session resolves to no user (getMe null)", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId } = await seedAuthedUser(t, {
      expiresAt: Date.now() - 1000, // already expired
    });

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    expect(await asUser.query(api.users.getMe, {})).toBeNull();
  });

  test("identity with a bogus sessionId resolves to no user", async () => {
    const t = initConvexTest();
    const { authUserId } = await seedAuthedUser(t);
    // Real user/session exist, but the identity points at a session id that
    // isn't in the table. safeGetAuthUser's session findOne returns null.
    const asUser = t.withIdentity(identityFor(authUserId, "nonexistent_session_id"));
    expect(await asUser.query(api.users.getMe, {})).toBeNull();
  });
});
