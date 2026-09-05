/// <reference types="vite/client" />
/**
 * The rest of the push-token surface: the sign-out sweep, the daily cleanup,
 * the tombstoning a bad receipt triggers, and the query the sender reads.
 *
 * The cleanup is the one with a trap in it. `by_revoked_and_updatedAt` is a
 * two-field index and Convex orders `false < true`, so an unbounded ascending
 * scan returns every active row before any tombstone: at scale the revoked
 * rows would never be reached. The handler ranges each partition explicitly,
 * and the first test here seeds more active rows than the batch size so a
 * regression to one unbounded scan fails it.
 */
import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "@/convex/_generated/api";

import { identityFor, initConvexTest, seedAuthedUser, seedToken, seedUser } from "./_harness";

const DAY = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH = 200;

describe("pushTokens.removeAll", () => {
  test("drops every token for the caller and nobody else's", async () => {
    const t = initConvexTest();
    const me = await seedAuthedUser(t);
    const other = await seedUser(t);
    const mine = await seedToken(t, me.appUserId, "ExponentPushToken[mine]");
    const theirs = await seedToken(t, other, "ExponentPushToken[theirs]");

    const asUser = t.withIdentity(identityFor(me.authUserId, me.sessionId));
    expect(await asUser.mutation(api.pushTokens.removeAll, {})).toBeNull();

    expect(await t.run(async (ctx) => ctx.db.get(mine))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(theirs))).not.toBeNull();
  });

  test("requires a session", async () => {
    const t = initConvexTest();
    await expect(t.mutation(api.pushTokens.removeAll, {})).rejects.toThrow(ConvexError);
  });
});

describe("pushTokens.listActiveByUser", () => {
  test("returns live tokens and skips tombstones", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    await seedToken(t, userId, "ExponentPushToken[live]");
    await seedToken(t, userId, "ExponentPushToken[dead]", { revoked: true });

    const rows = await t.query(internal.pushTokens.listActiveByUser, { userId });
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe("ExponentPushToken[live]");
  });
});

describe("pushTokens.markRevoked", () => {
  test("tombstones with the error code and counts what it touched", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const live = await seedToken(t, userId, "ExponentPushToken[a]");

    const count = await t.mutation(internal.pushTokens.markRevoked, {
      tokenIds: [live],
      errorCode: "DeviceNotRegistered",
    });
    expect(count).toBe(1);

    const row = await t.run(async (ctx) => ctx.db.get(live));
    expect(row?.revoked).toBe(true);
    expect(row?.lastErrorCode).toBe("DeviceNotRegistered");
    expect(row?.revokedAt).toEqual(expect.any(Number));
  });

  test("skips ids that are already gone instead of throwing", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const gone = await seedToken(t, userId, "ExponentPushToken[gone]");
    await t.run(async (ctx) => ctx.db.delete(gone));

    expect(
      await t.mutation(internal.pushTokens.markRevoked, {
        tokenIds: [gone],
        errorCode: "DeviceNotRegistered",
      }),
    ).toBe(0);
  });
});

describe("pushTokens.cleanupStale", () => {
  test("drops old tombstones and 90-day-stale rows, behind a full batch of fresh ones", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);

    // Fresh active rows overfilling the batch. Under one unbounded ascending
    // scan of [revoked, updatedAt] these sort ahead of every tombstone.
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i <= CLEANUP_BATCH; i++) {
        await ctx.db.insert("pushTokens", {
          userId,
          token: `ExponentPushToken[fresh${i}]`,
          deviceType: "ios" as const,
          createdAt: now,
          updatedAt: now,
          revoked: false,
        });
      }
    });

    const oldTombstone = await seedToken(t, userId, "ExponentPushToken[old-dead]", {
      revoked: true,
      updatedAt: Date.now() - 31 * DAY,
    });
    const recentTombstone = await seedToken(t, userId, "ExponentPushToken[new-dead]", {
      revoked: true,
      updatedAt: Date.now() - 2 * DAY,
    });
    const stale = await seedToken(t, userId, "ExponentPushToken[stale]", {
      updatedAt: Date.now() - 91 * DAY,
    });

    expect(await t.mutation(internal.pushTokens.cleanupStale, {})).toBe(2);

    expect(await t.run(async (ctx) => ctx.db.get(oldTombstone))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(stale))).toBeNull();
    // Inside the 30-day window: a client retry can still resurrect it.
    expect(await t.run(async (ctx) => ctx.db.get(recentTombstone))).not.toBeNull();
  });

  test("reschedules itself when a partition fills the batch", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const old = Date.now() - 91 * DAY;
    await t.run(async (ctx) => {
      for (let i = 0; i < CLEANUP_BATCH + 5; i++) {
        await ctx.db.insert("pushTokens", {
          userId,
          token: `ExponentPushToken[stale${i}]`,
          deviceType: "ios" as const,
          createdAt: old,
          updatedAt: old,
          revoked: false,
        });
      }
    });

    vi.useFakeTimers();
    try {
      expect(await t.mutation(internal.pushTokens.cleanupStale, {})).toBe(CLEANUP_BATCH);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    expect(await t.run(async (ctx) => ctx.db.query("pushTokens").collect())).toHaveLength(0);
  });

  test("purges nothing when every row is current", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    await seedToken(t, userId, "ExponentPushToken[a]");
    await seedToken(t, userId, "ExponentPushToken[b]", { revoked: true });

    expect(await t.mutation(internal.pushTokens.cleanupStale, {})).toBe(0);
  });
});
