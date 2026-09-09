/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";

import { internal } from "@/convex/_generated/api";
import { ACCOUNT_DELETION_GRACE_MS, HARD_DELETE_BATCH } from "@/convex/users";

import { auditRowsFor, initConvexTest, seedAuthedUser } from "./_harness";

describe("users.hardDeleteExpired", () => {
  test("purges only tombstones past the grace window, even behind a full batch of active users", async () => {
    const t = initConvexTest();
    const now = Date.now();

    // Overfill the batch. Unset deletedAt sorts before any tombstone in Convex's index order.
    await t.run(async (ctx) => {
      for (let i = 0; i <= HARD_DELETE_BATCH; i++) {
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

    const expiredAudit = await auditRowsFor(t, expired.appUserId);
    expect(expiredAudit.some((r) => r.event === "permanent")).toBe(true);

    expect(await t.run(async (ctx) => ctx.db.get(expired.appUserId))).toBeNull();

    const inGraceRow = await t.run(async (ctx) => ctx.db.get(inGrace.appUserId));
    expect(inGraceRow?.deletedAt).toBe(now - 60_000);
    const inGraceAudit = await auditRowsFor(t, inGrace.appUserId);
    expect(inGraceAudit.some((r) => r.event === "permanent")).toBe(false);
  });

  test("purges nothing when every tombstone is still inside the grace window", async () => {
    const t = initConvexTest();
    const now = Date.now();
    await seedAuthedUser(t, { deletedAt: now - 60_000, email: "recent@example.com" });
    await seedAuthedUser(t, { email: "active@example.com" });

    const purged = await t.mutation(internal.users.hardDeleteExpired, {});
    expect(purged).toBe(0);
  });
});
