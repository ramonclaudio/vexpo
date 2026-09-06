/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { api } from "@/convex/_generated/api";

import { auditRowsFor, identityFor, initConvexTest, seedAuthedUser } from "./_harness";

describe("users.restoreAccount", () => {
  test("clears deletedAt and writes a 'restored' audit row for a tombstoned user", async () => {
    const t = initConvexTest();
    const tombstonedAt = Date.now() - 60_000;
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t, {
      deletedAt: tombstonedAt,
    });

    const before = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(before?.deletedAt).toBe(tombstonedAt);

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.users.restoreAccount, {});
    expect(result).toEqual({ success: true });

    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after).not.toBeNull();
    expect(after!.deletedAt).toBeUndefined();
    expect(after!.updatedAt).toBeGreaterThan(tombstonedAt);

    const audit = await auditRowsFor(t, appUserId);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.event).toBe("restored");
    expect(audit[0]!.userId).toBe(appUserId);
    expect(audit[0]!.authId).toBe(authUserId);
  });

  test("no-op for a user without a tombstone: no audit row, row untouched", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId, appUserId } = await seedAuthedUser(t);

    const beforeUpdatedAt = (await t.run(async (ctx) => ctx.db.get(appUserId)))!.updatedAt;

    const asUser = t.withIdentity(identityFor(authUserId, sessionId));
    const result = await asUser.mutation(api.users.restoreAccount, {});
    expect(result).toEqual({ success: true });

    const after = await t.run(async (ctx) => ctx.db.get(appUserId));
    expect(after!.deletedAt).toBeUndefined();
    expect(after!.updatedAt).toBe(beforeUpdatedAt);

    const audit = await auditRowsFor(t, appUserId);
    expect(audit).toHaveLength(0);
  });

  test("throws ConvexError when unauthenticated (no identity)", async () => {
    const t = initConvexTest();
    await seedAuthedUser(t, { deletedAt: Date.now() - 60_000 });

    await expect(t.mutation(api.users.restoreAccount, {})).rejects.toThrowError(ConvexError);
  });

  test("throttles the criticalAction bucket: the call past capacity throws", async () => {
    const t = initConvexTest();
    const { authUserId, sessionId } = await seedAuthedUser(t);
    const asUser = t.withIdentity(identityFor(authUserId, sessionId));

    for (let i = 0; i < 5; i++) {
      await asUser.mutation(api.users.restoreAccount, {});
    }
    await expect(asUser.mutation(api.users.restoreAccount, {})).rejects.toThrowError(ConvexError);
  });
});
