/// <reference types="vite/client" />
/**
 * convexTest coverage for `internal.pushSender.reconcileReceipts`.
 *
 * Expo accepts a push at send time (an "ok" ticket) but only reports a dead
 * device later, in the RECEIPT. `sendToUser` parks each ok ticket id in
 * `pushReceipts` keyed to its token; this action polls Expo's getReceipts and:
 *   - a permanent-error receipt (e.g. DeviceNotRegistered) tombstones the token,
 *   - an ok or transient-error receipt leaves the token alone,
 *   - every returned receipt's row is cleaned up,
 *   - a row with no receipt yet is kept, but one aged past RECEIPT_MAX_AGE_MS is
 *     pruned instead of polled forever,
 *   - a full page reschedules the action to drain the backlog.
 *
 * We stub `global.fetch` so no network is touched and assert the real DB
 * effects. The send/ticket path is covered in `pushSender-sendToUser`.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { RECEIPT_PAGE } from "@/convex/pushSender";

import { type AuthedTest, initConvexTest } from "./_harness";

afterEach(() => vi.unstubAllGlobals());

async function seedUser(t: AuthedTest) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("users", {
      authId: `auth-${now}-${Math.random()}`,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function seedToken(t: AuthedTest, userId: Id<"users">, token: string) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("pushTokens", {
      userId,
      token,
      deviceType: "ios" as const,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      revoked: false,
    }),
  );
}

async function seedReceipt(
  t: AuthedTest,
  tokenId: Id<"pushTokens">,
  ticketId: string,
  createdAt = Date.now(),
) {
  return t.run((ctx) => ctx.db.insert("pushReceipts", { ticketId, tokenId, createdAt }));
}

/** Stub getReceipts to return `data` keyed by ticket id, like the Expo API. */
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
    // Row reconciled away.
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
      // Transient: not in PERMANENT_ERROR_CODES, so the token survives.
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

    // Expo hasn't produced the receipt yet: ticket id absent from the response.
    stubReceipts({});

    const res = await t.action(internal.pushSender.reconcileReceipts, {});
    expect(res).toEqual({ checked: 1, revoked: 0, pruned: 0 });

    expect((await t.run((ctx) => ctx.db.get(tokenId)))?.revoked).toBe(false);
    // Row survives for the next poll.
    expect(await t.run((ctx) => ctx.db.query("pushReceipts").collect())).toHaveLength(1);
  });

  test("prunes a receiptless row aged past RECEIPT_MAX_AGE_MS instead of polling forever", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const tokenId = await seedToken(t, userId, "ExponentPushToken[stale]");
    // A month old: well past the ~1-day receipt retention, so it's a lost cause.
    await seedReceipt(t, tokenId, "ticket-stale", Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Expo still has no receipt for it (aged out on their side too).
    stubReceipts({});

    const res = await t.action(internal.pushSender.reconcileReceipts, {});
    expect(res).toEqual({ checked: 1, revoked: 0, pruned: 1 });

    // Token untouched, but the dead row is gone.
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

    // A full page means more may be queued, so the action reschedules a drain.
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((s) => s.name.includes("reconcileReceipts"))).toBe(true);
  });
});
