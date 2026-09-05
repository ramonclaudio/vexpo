/// <reference types="vite/client" />
/**
 * The receipt parking lot. Expo accepts a push at send time (an "ok" ticket)
 * and only reports a dead device later, in the RECEIPT, so each ok ticket is
 * parked with the token it went to and `pushSender.reconcileReceipts` polls
 * for it. These three are that table's whole surface.
 *
 * `listPendingReceipts` is oldest-first on purpose: receipts expire on Expo's
 * side, so the batch has to drain from the front or the oldest never resolve.
 */
import { describe, expect, test } from "vitest";

import { internal } from "@/convex/_generated/api";

import { initConvexTest, seedToken, seedUser } from "./_harness";

describe("pushTokens receipts", () => {
  test("records a batch, pages it oldest-first, then deletes it", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const tokenId = await seedToken(t, userId, "ExponentPushToken[a]");

    const written = await t.mutation(internal.pushTokens.recordReceipts, {
      receipts: [
        { ticketId: "ticket-1", tokenId },
        { ticketId: "ticket-2", tokenId },
        { ticketId: "ticket-3", tokenId },
      ],
    });
    expect(written).toBe(3);

    // Age them apart so the ordering assertion means something. Rows written
    // in one mutation share a timestamp otherwise.
    const rows = await t.run(async (ctx) => ctx.db.query("pushReceipts").collect());
    const base = Date.now() - 10_000;
    await t.run(async (ctx) => {
      for (const [i, row] of rows.entries()) {
        await ctx.db.patch(row._id, { createdAt: base + i });
      }
    });

    const firstPage = await t.query(internal.pushTokens.listPendingReceipts, { limit: 2 });
    expect(firstPage.map((r) => r.ticketId)).toEqual(["ticket-1", "ticket-2"]);
    expect(firstPage[0].tokenId).toBe(tokenId);

    expect(
      await t.mutation(internal.pushTokens.deleteReceipts, { ids: firstPage.map((r) => r._id) }),
    ).toBe(2);

    const rest = await t.query(internal.pushTokens.listPendingReceipts, { limit: 10 });
    expect(rest.map((r) => r.ticketId)).toEqual(["ticket-3"]);
  });

  test("deleting an id twice reports only what it actually removed", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const tokenId = await seedToken(t, userId, "ExponentPushToken[a]");
    await t.mutation(internal.pushTokens.recordReceipts, {
      receipts: [{ ticketId: "ticket-1", tokenId }],
    });
    const [row] = await t.query(internal.pushTokens.listPendingReceipts, { limit: 10 });

    expect(await t.mutation(internal.pushTokens.deleteReceipts, { ids: [row._id] })).toBe(1);
    expect(await t.mutation(internal.pushTokens.deleteReceipts, { ids: [row._id] })).toBe(0);
  });

  test("an empty batch is a no-op, not an error", async () => {
    const t = initConvexTest();
    expect(await t.mutation(internal.pushTokens.recordReceipts, { receipts: [] })).toBe(0);
    expect(await t.query(internal.pushTokens.listPendingReceipts, { limit: 10 })).toEqual([]);
  });
});
