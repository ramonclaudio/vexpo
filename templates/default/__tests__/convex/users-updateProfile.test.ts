/// <reference types="vite/client" />
/**
 * Real convexTest coverage for the authed mutation `users.updateProfile`.
 *
 * updateProfile is an authMutation that:
 *   - rate-limits on the "userAction" bucket,
 *   - validates bio (<= 500 chars) and throws a VAL_3001 ConvexError otherwise,
 *   - patches the app `users` row's bio + updatedAt,
 *   - returns the app user _id.
 *
 * Auth resolves through Better Auth: ctx.auth.getUserIdentity() (root ctx) ->
 * betterAuth component session findOne (_id == identity.sessionId, expiresAt >
 * now) -> betterAuth user findOne (_id == identity.subject) -> app `users` row
 * by index "authId" == betterAuth user id. So we seed three rows and hand
 * t.withIdentity an identity whose subject/sessionId are the REAL component
 * doc ids. (Same harness shape proven in `_auth-harness.test.ts`.)
 */
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser, type AuthedTest } from "./_harness";

type SeededAppUserId = Awaited<ReturnType<typeof seedAuthedUser>>["appUserId"];

/** The shared seedAuthedUser doesn't seed bio, so set it directly on the row. */
async function setBio(t: AuthedTest, appUserId: SeededAppUserId, bio: string) {
  await t.run(async (ctx) => ctx.db.patch(appUserId, { bio }));
}

describe("users.updateProfile", () => {
  test("authenticated: patches bio on the real users row and returns its id", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    await setBio(t, appUserId, "old bio");

    // Snapshot updatedAt before so we can prove the patch moved it.
    const before = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(before?.bio).toBe("old bio");
    const updatedAtBefore = before!.updatedAt;

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const returnedId = await asUser.mutation(api.users.updateProfile, {
      bio: "Countess of computing.",
    });
    expect(returnedId).toBe(appUserId);

    // Real DB effect: read the row straight from the table.
    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after?.bio).toBe("Countess of computing.");
    // updatedAt is bumped by the handler (Date.now()), never backwards.
    expect(after!.updatedAt).toBeGreaterThanOrEqual(updatedAtBefore);

    // Surfaces through the authed read path too.
    const me = await asUser.query(api.users.getMe, {});
    expect(me!.bio).toBe("Countess of computing.");
  });

  test("authenticated: bio at the 500-char limit is accepted", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    const maxBio = "a".repeat(500);
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    await asUser.mutation(api.users.updateProfile, { bio: maxBio });

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.bio).toBe(maxBio);
    expect(row?.bio?.length).toBe(500);
  });

  test("authenticated: bio over 500 chars is rejected as a VAL_3001 ConvexError, no write", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    await setBio(t, appUserId, "untouched");

    const tooLong = "a".repeat(501);
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));

    // One call: assert it's a ConvexError with the structured code + field, and
    // that the bad write was rejected before touching the row (rolled back).
    let caught: unknown;
    try {
      await asUser.mutation(api.users.updateProfile, { bio: tooLong });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConvexError);
    const data = (caught as ConvexError<{ code: string; field?: string }>).data;
    expect(data.code).toBe("VAL_3001");
    expect(data.field).toBe("bio");

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.bio).toBe("untouched");
  });

  test("unauthenticated: the authMutation throws a ConvexError and writes nothing", async () => {
    const t = initConvexTest();
    // Seed the data, but call WITHOUT an identity. requireAuthenticatedUser
    // throws authenticationRequired() (AUTH_1001) before the handler runs.
    const { appUserId } = await seedAuthedUser(t);
    await setBio(t, appUserId, "before");

    let caught: unknown;
    try {
      await t.mutation(api.users.updateProfile, { bio: "after" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConvexError);
    expect((caught as ConvexError<{ code: string }>).data.code).toBe("AUTH_1001");

    // No write happened.
    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.bio).toBe("before");
  });
});
