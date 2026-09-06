/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser, type AuthedTest } from "./_harness";

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

    const caller = await seedAuthedUser(t, {
      name: "Caller One",
      email: "caller@example.com",
    });

    const target = await seedAuthedUser(t, {
      name: "Grace Hopper",
      email: "grace@example.com",
    });
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
    expect(profile!._id).toBe(target.appUserId);
    expect(profile!.name).toBe(target.name);
    expect(profile!.username).toBe("GraceH");
    expect(profile!.bio).toBe("Compiler pioneer.");
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
    });

    const profile = await t.query(api.users.getUser, { userId: target.appUserId });
    expect(profile).not.toBeNull();
    expect(profile!.username).toBe("plainuser");
    expect(profile!.avatarUrl).toBeNull();
  });

  test("returns null for a malformed user id (normalizeId miss)", async () => {
    const t = initConvexTest();
    await seedAuthedUser(t);
    const profile = await t.query(api.users.getUser, {
      userId: "not-a-valid-convex-id",
    });
    expect(profile).toBeNull();
  });

  test("returns null when the app users row was deleted (ctx.db.get miss)", async () => {
    const t = initConvexTest();
    const target = await seedAuthedUser(t);

    await t.run(async (ctx) => ctx.db.delete(target.appUserId));

    const profile = await t.query(api.users.getUser, {
      userId: target.appUserId,
    });
    expect(profile).toBeNull();
  });
});
