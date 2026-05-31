/// <reference types="vite/client" />
/**
 * Real convexTest coverage for the authed `users.getMe` query.
 *
 * `getMe` is an optionalAuthQuery returning the merged AuthUser when authed
 * (app `users` row + Better Auth name/email/emailVerified) and null otherwise.
 *
 * Auth resolves through @convex-dev/better-auth's safeGetAuthUser:
 *   1. identity = ctx.auth.getUserIdentity()                    (root ctx)
 *   2. component.adapter.findOne(session) where
 *        _id == identity.sessionId AND expiresAt > now          (betterAuth db)
 *   3. component.adapter.findOne(user) where _id == identity.subject
 *   4. auth.ts getUserByAuthId: app `users` row .withIndex("authId").
 * The adapter resolves `_id` where-clauses via ctx.db.get, so the identity's
 * subject/sessionId MUST be the real seeded component doc ids.
 *
 * Three seeded rows + one identity drive the authed path:
 *   - betterAuth `user`    (real id -> identity.subject)
 *   - betterAuth `session` (real id -> identity.sessionId, expiresAt future)
 *   - app `users`          (authId == betterAuth user id)
 */
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser } from "./_harness";

describe("users.getMe", () => {
  // HAPPY PATH: authed read returns the merged AuthUser reflecting real DB state.
  test("returns the merged user from real seeded rows when authenticated", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId, name, email } = await seedAuthedUser(t, {
      name: "Grace Hopper",
    });
    await t.run(async (ctx) => ctx.db.patch(appUserId, { bio: "Compiler pioneer." }));

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const me = await asUser.query(api.users.getMe, {});

    expect(me).not.toBeNull();
    // App-owned fields come from the users row we seeded.
    expect(me!._id).toBe(appUserId);
    expect(me!.authId).toBe(authUserId);
    expect(me!.authUserId).toBe(authUserId);
    expect(me!.bio).toBe("Compiler pioneer.");
    // Identity fields are merged from the Better Auth user record.
    expect(me!.name).toBe(name);
    expect(me!.email).toBe(email);
    expect(me!.emailVerified).toBe(true);
    // No uploaded avatar and no provider image -> resolved avatarUrl is null.
    expect(me!.hasUploadedAvatar).toBe(false);
    expect(me!.avatarUrl).toBeNull();
  });

  // GUARD: getMe is optional-auth, so an unauthed call returns null, not a throw,
  // even though the seeded data exists. Proves the auth lookup actually gates the
  // result rather than leaking the row to anonymous callers.
  test("returns null when unauthenticated", async () => {
    const t = initConvexTest();
    await seedAuthedUser(t); // data exists; we just don't attach an identity
    expect(await t.query(api.users.getMe, {})).toBeNull();
  });

  // GUARD: the session findOne enforces expiresAt > now. An expired session
  // resolves to no auth user, so getMe falls back to null. This proves the
  // harness traverses the real session lookup, not just identity.subject.
  test("returns null when the session is expired", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId } = await seedAuthedUser(t, {
      expiresAt: Date.now() - 1000, // already expired
    });
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    expect(await asUser.query(api.users.getMe, {})).toBeNull();
  });

  // GUARD on the write path that feeds getMe: updateProfile validates bio length
  // (max 500). A 501-char bio throws ConvexError(VAL_3001) and must NOT patch the
  // row, so a follow-up getMe still shows the original bio.
  test("updateProfile rejects an over-long bio and leaves the row unchanged", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    await t.run(async (ctx) => ctx.db.patch(appUserId, { bio: "original" }));
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));

    const tooLong = "x".repeat(501);
    await expect(asUser.mutation(api.users.updateProfile, { bio: tooLong })).rejects.toThrow(
      ConvexError,
    );

    // The patch never ran: the persisted bio is untouched.
    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.bio).toBe("original");
    // And it surfaces unchanged through the authed read path.
    const me = await asUser.query(api.users.getMe, {});
    expect(me!.bio).toBe("original");
  });
});
