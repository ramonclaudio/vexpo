/// <reference types="vite/client" />
/**
 * convexTest coverage for `internal.users.hardDeleteExpired`, the irreversible
 * 30-day account purge (the highest-stakes data-loss path in the template).
 *
 * It scans the `by_deletedAt` index for tombstoned users past the grace window
 * and permanently purges them. The index is on the OPTIONAL `deletedAt` field,
 * and Convex sorts `undefined < null < numbers`, so an unbounded scan returns
 * every ACTIVE user (deletedAt unset) before any tombstone. These tests seed
 * MORE active users than the batch size: a regression to an unbounded scan
 * would starve the tombstone and purge nothing, failing the first test.
 */
import { describe, expect, test } from "vitest";

import { internal } from "@/convex/_generated/api";
import { ACCOUNT_DELETION_GRACE_MS } from "@/convex/users";

import { auditRowsFor, initConvexTest, seedAuthedUser } from "./_harness";

const HARD_DELETE_BATCH = 50;

describe("users.hardDeleteExpired", () => {
  test("purges only tombstones past the grace window, even behind a full batch of active users", async () => {
    const t = initConvexTest();
    const now = Date.now();

    // Active (deletedAt unset) users filling the batch. Under an unbounded
    // `by_deletedAt` scan these sort ahead of any tombstone and crowd it out.
    await t.run(async (ctx) => {
      for (let i = 0; i < HARD_DELETE_BATCH; i++) {
        await ctx.db.insert("users", { authId: `active_${i}`, createdAt: now, updatedAt: now });
      }
    });

    const expired = await seedAuthedUser(t, {
      deletedAt: now - ACCOUNT_DELETION_GRACE_MS - 60_000,
      email: "expired@example.com",
    });
    const inGrace = await seedAuthedUser(t, {
      deletedAt: now - 60_000,
      email: "ingrace@example.com",
    });

    const purged = await t.mutation(internal.users.hardDeleteExpired, {});
    expect(purged).toBe(1);

    // Expired tombstone: a "permanent" audit row was written.
    const expiredAudit = await auditRowsFor(t, expired.appUserId);
    expect(expiredAudit.some((r) => r.event === "permanent")).toBe(true);

    // In-grace tombstone: untouched, no permanent purge.
    const inGraceRow = await t.run(async (ctx) => ctx.db.get(inGrace.appUserId));
    expect(inGraceRow?.deletedAt).toBe(now - 60_000);
    const inGraceAudit = await auditRowsFor(t, inGrace.appUserId);
    expect(inGraceAudit.some((r) => r.event === "permanent")).toBe(false);
  });

  test("purges nothing when every tombstone is still inside the grace window", async () => {
    const t = initConvexTest();
    const now = Date.now();
    await seedAuthedUser(t, { deletedAt: now - 60_000, email: "recent@example.com" });
    await seedAuthedUser(t, { email: "active@example.com" }); // not tombstoned

    const purged = await t.mutation(internal.users.hardDeleteExpired, {});
    expect(purged).toBe(0);
  });
});
