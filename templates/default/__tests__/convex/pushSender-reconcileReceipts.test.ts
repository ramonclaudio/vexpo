/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest";

import { internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { RECEIPT_PAGE } from "@/convex/pushSender";

import { type AuthedTest, initConvexTest, seedToken, seedUser } from "./_harness";

afterEach(() => vi.unstubAllGlobals());

async function seedReceipt(
  t: AuthedTest,
  tokenId: Id<"pushTokens">,
  ticketId: string,
  createdAt = Date.now(),
) {
  return t.run((ctx) => ctx.db.insert("pushReceipts", { ticketId, tokenId, createdAt }));
}

function stubReceipts(data: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data }) })),
  );
}

describe("pushSender.reconcileReceipts", () => {
  test("tombstones the token on a permanent-error receipt and drops the row", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const tokenId = await seedToken(t, userId, "ExponentPushToken[dead]");
    await seedReceipt(t, tokenId, "ticket-dead");

    stubReceipts({
      "ticket-dead": {
        status: "error",
        message: "not registered",
        details: { error: "DeviceNotRegistered" },
      },
    });

    const res = await t.action(internal.pushSender.reconcileReceipts, {});
    expect(res).toEqual({ checked: 1, revoked: 1, pruned: 1 });

    const token = await t.run((ctx) => ctx.db.get(tokenId));
    expect(token?.revoked).toBe(true);
    expect(token?.lastErrorCode).toBe("DeviceNotRegistered");
    expect(await t.run((ctx) => ctx.db.query("pushReceipts").collect())).toHaveLength(0);
  });

  test("keeps the token on ok and transient receipts but still clears the rows", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const okToken = await seedToken(t, userId, "ExponentPushToken[ok]");
    const busyToken = await seedToken(t, userId, "ExponentPushToken[busy]");
    await seedReceipt(t, okToken, "ticket-ok");
    await seedReceipt(t, busyToken, "ticket-busy");

    stubReceipts({
      "ticket-ok": { status: "ok" },
      "ticket-busy": {
        status: "error",
        message: "rate limited",
        details: { error: "MessageRateExceeded" },
      },
    });

    const res = await t.action(internal.pushSender.reconcileReceipts, {});
    expect(res).toEqual({ checked: 2, revoked: 0, pruned: 2 });

    expect((await t.run((ctx) => ctx.db.get(okToken)))?.revoked).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(busyToken)))?.revoked).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("pushReceipts").collect())).toHaveLength(0);
  });

  test("keeps a row whose receipt is not ready yet", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const tokenId = await seedToken(t, userId, "ExponentPushToken[pending]");
    await seedReceipt(t, tokenId, "ticket-pending");

    stubReceipts({});

    const res = await t.action(internal.pushSender.reconcileReceipts, {});
    expect(res).toEqual({ checked: 1, revoked: 0, pruned: 0 });

    expect((await t.run((ctx) => ctx.db.get(tokenId)))?.revoked).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("pushReceipts").collect())).toHaveLength(1);
  });

  test("prunes a receiptless row aged past RECEIPT_MAX_AGE_MS instead of polling forever", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const tokenId = await seedToken(t, userId, "ExponentPushToken[stale]");
    await seedReceipt(t, tokenId, "ticket-stale", Date.now() - 30 * 24 * 60 * 60 * 1000);

    stubReceipts({});

    const res = await t.action(internal.pushSender.reconcileReceipts, {});
    expect(res).toEqual({ checked: 1, revoked: 0, pruned: 1 });

    expect((await t.run((ctx) => ctx.db.get(tokenId)))?.revoked).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("pushReceipts").collect())).toHaveLength(0);
  });

  test("reschedules itself when a full page comes back", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < RECEIPT_PAGE; i++) {
        const tokenId = await ctx.db.insert("pushTokens", {
          userId,
          token: `ExponentPushToken[${i}]`,
          deviceType: "ios" as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastSeenAt: Date.now(),
          revoked: false,
        });
        await ctx.db.insert("pushReceipts", {
          ticketId: `ticket-${i}`,
          tokenId,
          createdAt: Date.now(),
        });
      }
    });

    stubReceipts(
      Object.fromEntries(
        Array.from({ length: RECEIPT_PAGE }, (_, i) => [`ticket-${i}`, { status: "ok" }]),
      ),
    );

    const res = await t.action(internal.pushSender.reconcileReceipts, {});
    expect(res).toEqual({ checked: RECEIPT_PAGE, revoked: 0, pruned: RECEIPT_PAGE });

    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((s) => s.name.includes("reconcileReceipts"))).toBe(true);
  });
});
