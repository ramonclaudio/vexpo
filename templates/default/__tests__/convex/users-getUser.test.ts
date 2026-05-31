/// <reference types="vite/client" />
/**
 * Real convexTest coverage for `api.users.getUser` (optionalAuthQuery).
 *
 * getUser merges an app `users` row with its Better Auth identity record:
 *   1. ctx.db.normalizeId("users", userId)  -> null on malformed input
 *   2. ctx.db.get(id)                         -> null when the app row is gone
 *   3. authComponent.getAnyUserById(authId)   -> null when the auth record is gone
 *   4. returns { _id, _creationTime, name, username, avatarUrl, bio }
 *      name/username come from Better Auth; bio from the app row; avatarUrl
 *      falls back to the Better Auth `image` when no uploaded avatar exists.
 *
 * Auth seeding uses the shared harness (./_harness): seed a Better Auth `user`
 * + unexpired `session` and the mirrored app `users` row, then patch in the
 * identity fields getUser merges (bio on the app row; image/username/
 * displayUsername on the Better Auth record) using the returned ids.
 */
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser, type AuthedTest } from "./_harness";

/** Patch Better Auth identity fields (image/username/displayUsername) onto a seeded user. */
async function patchAuthFields(
  t: AuthedTest,
  authUserId: string,
  fields: { image?: string; username?: string; displayUsername?: string },
) {
  await t.runInComponent("betterAuth", async (ctx) => {
    const db = ctx.db as unknown as {
      patch: (id: string, doc: Record<string, unknown>) => Promise<void>;
    };
    await db.patch(authUserId, fields);
  });
}

describe("api.users.getUser", () => {
  test("returns the merged profile for an existing user (authed caller)", async () => {
    const t = initConvexTest();

    // Caller is one authed user; they fetch a different target user's profile.
    const caller = await seedAuthedUser(t, {
      name: "Caller One",
      email: "caller@example.com",
    });

    const target = await seedAuthedUser(t, {
      name: "Grace Hopper",
      email: "grace@example.com",
    });
    // bio lives on the app row; image/username/displayUsername on the auth record.
    await t.run(async (ctx) => ctx.db.patch(target.appUserId, { bio: "Compiler pioneer." }));
    await patchAuthFields(t, target.authUserId, {
      image: "https://cdn.example.com/grace.png",
      username: "ghopper",
      displayUsername: "GraceH",
    });

    const asCaller = t.withIdentity(identityFor(caller.authUserId, caller.sessionId));
    const profile = await asCaller.query(api.users.getUser, {
      userId: target.appUserId,
    });

    expect(profile).not.toBeNull();
    // _id is the app users row id, not the Better Auth id.
    expect(profile!._id).toBe(target.appUserId);
    // name comes from the Better Auth record, not the app row.
    expect(profile!.name).toBe(target.name);
    // username prefers displayUsername over username.
    expect(profile!.username).toBe("GraceH");
    // bio comes from the app users row.
    expect(profile!.bio).toBe("Compiler pioneer.");
    // No uploaded avatar -> falls back to the Better Auth image.
    expect(profile!.avatarUrl).toBe("https://cdn.example.com/grace.png");
    expect(typeof profile!._creationTime).toBe("number");
  });

  test("username falls back to `username` when displayUsername is absent", async () => {
    const t = initConvexTest();
    const target = await seedAuthedUser(t, {
      name: "No Display Name",
    });
    await patchAuthFields(t, target.authUserId, {
      username: "plainuser",
      // displayUsername intentionally omitted
    });

    const profile = await t.query(api.users.getUser, { userId: target.appUserId });
    expect(profile).not.toBeNull();
    expect(profile!.username).toBe("plainuser");
    // No image and no avatar -> null.
    expect(profile!.avatarUrl).toBeNull();
  });

  test("returns null for a malformed user id (normalizeId miss)", async () => {
    const t = initConvexTest();
    // Seed a real user so the table exists, then ask for a garbage id.
    await seedAuthedUser(t);
    const profile = await t.query(api.users.getUser, {
      userId: "not-a-valid-convex-id",
    });
    expect(profile).toBeNull();
  });

  test("returns null when the app users row was deleted (ctx.db.get miss)", async () => {
    const t = initConvexTest();
    const target = await seedAuthedUser(t);

    // Capture a well-formed id, then delete the row so normalizeId succeeds
    // but the get() misses. This proves the guard is the missing-row branch,
    // not a malformed-id rejection.
    await t.run(async (ctx) => ctx.db.delete(target.appUserId));

    const profile = await t.query(api.users.getUser, {
      userId: target.appUserId,
    });
    expect(profile).toBeNull();
  });
});
