/// <reference types="vite/client" />
/**
 * The two ways a guest row leaves the database.
 *
 * `users.discardGuest` is the in-app one. A guest has no email and no
 * password, so the 30-day restore window `deleteAccount` opens would open onto
 * nothing; this purges on the spot instead, which is also what makes leaving
 * guest mode count as in-app account deletion (Apple 5.1.1(v)).
 *
 * `users.purgeAbandonedGuests` is the cron. A guest has no credentials, so once
 * every session of theirs has expired nothing can reach the row again, and
 * nothing in the normal flow deletes it. The rule is "all sessions expired",
 * not an age cap, so a guest who keeps coming back is never swept.
 *
 * Neither writes an `accountDeletionAudit` row: that table records what users
 * asked for, not every row the system drops.
 */
import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "@/convex/_generated/api";
import { SESSION_MAX_AGE_MS } from "@/convex/auth";
import { HARD_DELETE_BATCH } from "@/convex/users";

import { auditRowsFor, identityFor, initConvexTest, seedAuthedUser, seedToken } from "./_harness";

describe("users.discardGuest", () => {
  test("purges the guest, its push tokens and its Better Auth user", async () => {
    const t = initConvexTest();
    const guest = await seedAuthedUser(t, { isAnonymous: true });
    const tokenId = await seedToken(t, guest.appUserId, "ExponentPushToken[guest]");

    const asGuest = t.withIdentity(identityFor(guest.authUserId, guest.sessionId));
    expect(await asGuest.mutation(api.users.discardGuest, {})).toEqual({ success: true });

    // The onDelete trigger drops the users row when the auth user goes.
    expect(await t.run(async (ctx) => ctx.db.get(guest.appUserId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(tokenId))).toBeNull();
    expect(await auditRowsFor(t, guest.appUserId)).toHaveLength(0);
  });

  test("refuses a real account, so it can't be used to skip the grace window", async () => {
    const t = initConvexTest();
    const account = await seedAuthedUser(t);

    const asUser = t.withIdentity(identityFor(account.authUserId, account.sessionId));
    await expect(asUser.mutation(api.users.discardGuest, {})).rejects.toThrow(ConvexError);

    expect(await t.run(async (ctx) => ctx.db.get(account.appUserId))).not.toBeNull();
  });

  test("requires a session", async () => {
    const t = initConvexTest();
    await seedAuthedUser(t, { isAnonymous: true });
    await expect(t.mutation(api.users.discardGuest, {})).rejects.toThrow(ConvexError);
  });
});

describe("users.purgeAbandonedGuests", () => {
  const OLD = Date.now() - SESSION_MAX_AGE_MS - 1000;

  test("purges a guest whose session expired and keeps one who is still coming back", async () => {
    const t = initConvexTest();
    const gone = await seedAuthedUser(t, {
      isAnonymous: true,
      guestSince: OLD,
      expiresAt: Date.now() - 1000,
    });
    // Same age, but the session was refreshed by use. This is the row an
    // age cap would have thrown away.
    const active = await seedAuthedUser(t, { isAnonymous: true, guestSince: OLD });
    const goneToken = await seedToken(t, gone.appUserId, "ExponentPushToken[gone]");

    expect(await t.mutation(internal.users.purgeAbandonedGuests, {})).toBe(1);

    expect(await t.run(async (ctx) => ctx.db.get(gone.appUserId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(goneToken))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(active.appUserId))).not.toBeNull();
    expect(await auditRowsFor(t, gone.appUserId)).toHaveLength(0);
  });

  test("skips guests younger than the session lifetime without reading their sessions", async () => {
    const t = initConvexTest();
    // An expired session on a fresh row cannot happen in production. Seeding
    // one proves the index range is doing the skipping, not the session check.
    const fresh = await seedAuthedUser(t, { isAnonymous: true, expiresAt: Date.now() - 1000 });

    expect(await t.mutation(internal.users.purgeAbandonedGuests, {})).toBe(0);
    expect(await t.run(async (ctx) => ctx.db.get(fresh.appUserId))).not.toBeNull();
  });

  test("never touches a real account, however old or signed out", async () => {
    const t = initConvexTest();
    const account = await seedAuthedUser(t, { expiresAt: Date.now() - 1000 });
    await t.run(async (ctx) =>
      ctx.db.patch(account.appUserId, { createdAt: Date.now() - SESSION_MAX_AGE_MS * 10 }),
    );

    expect(await t.mutation(internal.users.purgeAbandonedGuests, {})).toBe(0);
    expect(await t.run(async (ctx) => ctx.db.get(account.appUserId))).not.toBeNull();
  });

  test("walks past a full page of live old guests to reach the dead ones behind them", async () => {
    const t = initConvexTest();
    // Live guests sort first (older guestSince). With `.take(batch)` and a
    // "stop when nothing purged" rule, these would shadow the dead one forever.
    for (let i = 0; i <= HARD_DELETE_BATCH; i++) {
      await seedAuthedUser(t, { isAnonymous: true, guestSince: OLD - HARD_DELETE_BATCH + i });
    }
    const dead = await seedAuthedUser(t, {
      isAnonymous: true,
      guestSince: OLD,
      expiresAt: Date.now() - 1000,
    });

    // First page purges nothing and schedules the continuation.
    vi.useFakeTimers();
    try {
      expect(await t.mutation(internal.users.purgeAbandonedGuests, {})).toBe(0);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    expect(await t.run(async (ctx) => ctx.db.get(dead.appUserId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.query("users").collect())).toHaveLength(
      HARD_DELETE_BATCH + 1,
    );
  });
});
