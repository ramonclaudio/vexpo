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
 *   - a row with no receipt yet is kept for the next run.
 *
 * We stub `global.fetch` so no network is touched and assert the real DB
 * effects, mirroring the ticket-path coverage in the pushTokens tests.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

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
});
