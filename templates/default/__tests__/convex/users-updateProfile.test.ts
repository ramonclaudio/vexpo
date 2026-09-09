/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser, type AuthedTest } from "./_harness";

type SeededAppUserId = Awaited<ReturnType<typeof seedAuthedUser>>["appUserId"];

async function setBio(t: AuthedTest, appUserId: SeededAppUserId, bio: string) {
  await t.run(async (ctx) => ctx.db.patch(appUserId, { bio }));
}

describe("users.updateProfile", () => {
  test("authenticated: patches bio on the real users row and returns its id", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);
    await setBio(t, appUserId, "old bio");

    const before = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(before?.bio).toBe("old bio");
    const updatedAtBefore = before!.updatedAt;

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const returnedId = await asUser.mutation(api.users.updateProfile, {
      bio: "Countess of computing.",
    });
    expect(returnedId).toBe(appUserId);

    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after?.bio).toBe("Countess of computing.");
    expect(after!.updatedAt).toBeGreaterThanOrEqual(updatedAtBefore);

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

    const row = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(row?.bio).toBe("before");
  });
});
