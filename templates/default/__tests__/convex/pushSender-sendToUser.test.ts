/// <reference types="vite/client" />
/**
 * convexTest coverage for `internal.pushSender.sendToUser`, the send path that
 * fans a push out to every active token of a user.
 *
 * Expo caps `/push/send` at 100 messages per POST, so the action slices tokens
 * into chunks and pairs each returned ticket with its own token slice. This
 * file asserts, against a stubbed `global.fetch`:
 *   - >100 tokens split into multiple POSTs, each ticket parked against its own
 *     token when every chunk returns full data,
 *   - a middle chunk failing (non-2xx, no data) doesn't slide a later chunk's
 *     tickets onto the wrong tokens,
 *   - an ok ticket is parked in `pushReceipts` and counted as sent,
 *   - a permanent-error ticket (DeviceNotRegistered) revokes its token and is
 *     excluded from both `sent` and the parked receipts,
 *   - a silent push carries `_contentAvailable` and no banner fields.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { type AuthedTest, initConvexTest } from "./_harness";

afterEach(() => vi.unstubAllGlobals());

type Msg = {
  to: string;
  title?: string;
  body?: string;
  sound?: unknown;
  priority?: string;
  data?: unknown;
  _contentAvailable?: boolean;
};

type Ticket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details: { error: string } };

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

type FetchResult = { ok: boolean; status: number; json: () => Promise<unknown> };

/** Stub /push/send with a per-chunk responder, recording each POSTed chunk. */
function stubFetch(respond: (chunk: Msg[], index: number) => FetchResult) {
  const chunks: Msg[][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const chunk = JSON.parse(init.body) as Msg[];
      const res = respond(chunk, chunks.length);
      chunks.push(chunk);
      return res;
    }),
  );
  return chunks;
}

/** Stub /push/send to echo one ok ticket per message via `ticketFor`. */
function stubSend(ticketFor: (msg: Msg) => Ticket) {
  return stubFetch((chunk) => ({
    ok: true,
    status: 200,
    json: async () => ({ data: chunk.map(ticketFor) }),
  }));
}

describe("pushSender.sendToUser", () => {
  test("splits >100 tokens into multiple POSTs, keeping tickets aligned to tokens", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const total = 150;
    for (let i = 0; i < total; i++) await seedToken(t, userId, `ExponentPushToken[${i}]`);

    // Every chunk returns full data here, so this only covers the aligned case.
    // The middle-chunk-failure test below covers the shift a flat array missed.
    const chunks = stubSend((m) => ({ status: "ok", id: `rcpt-${m.to}` }));

    const res = await t.action(internal.pushSender.sendToUser, {
      userId,
      title: "Hi",
      body: "there",
    });
    expect(res).toEqual({ sent: total, revoked: 0 });

    // 150 tokens -> a 100-message POST then a 50-message POST.
    expect(chunks.map((c) => c.length)).toEqual([100, 50]);

    const receipts = await t.run((ctx) => ctx.db.query("pushReceipts").collect());
    expect(receipts).toHaveLength(total);
    for (const r of receipts) {
      const token = await t.run((ctx) => ctx.db.get(r.tokenId));
      expect(r.ticketId).toBe(`rcpt-${token?.token}`);
    }
  });

  test("a failed middle chunk doesn't slide a later chunk's tickets onto the wrong tokens", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const tokenIds: Id<"pushTokens">[] = [];
    const total = 250;
    for (let i = 0; i < total; i++) {
      tokenIds.push(await seedToken(t, userId, `ExponentPushToken[${i}]`));
    }

    // 250 tokens -> chunks of 100, 100, 50. The middle chunk (index 1) fails
    // with a non-2xx and no `data`, so it contributes zero tickets. Token 200
    // heads the third chunk and comes back DeviceNotRegistered. A flat ticket
    // array would land that error at index 100 and revoke token 100 instead.
    const deadToken = "ExponentPushToken[200]";
    const chunks = stubFetch((chunk, index) => {
      if (index === 1) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ errors: [{ code: "InternalServerError" }] }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: chunk.map((m) =>
            m.to === deadToken
              ? {
                  status: "error",
                  message: "not registered",
                  details: { error: "DeviceNotRegistered" },
                }
              : { status: "ok", id: `rcpt-${m.to}` },
          ),
        }),
      };
    });

    const res = await t.action(internal.pushSender.sendToUser, { userId, title: "Hi" });

    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    // 100 (chunk 0) + 0 (failed chunk 1) + 49 (chunk 2 minus the dead token).
    expect(res).toEqual({ sent: 149, revoked: 1 });

    // The dead token, and only it, is revoked. The token a flat array would
    // have wrongly hit (index 100) stays healthy.
    expect((await t.run((ctx) => ctx.db.get(tokenIds[200]!)))?.revoked).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(tokenIds[200]!)))?.lastErrorCode).toBe(
      "DeviceNotRegistered",
    );
    expect((await t.run((ctx) => ctx.db.get(tokenIds[100]!)))?.revoked).toBe(false);

    // The failed chunk's tokens park no receipt, and every parked receipt still
    // maps to its own token.
    const receipts = await t.run((ctx) => ctx.db.query("pushReceipts").collect());
    expect(receipts).toHaveLength(149);
    for (const r of receipts) {
      const token = await t.run((ctx) => ctx.db.get(r.tokenId));
      expect(r.ticketId).toBe(`rcpt-${token?.token}`);
    }
    const parked = new Set(receipts.map((r) => r.tokenId));
    expect(parked.has(tokenIds[150]!)).toBe(false);
  });

  test("revokes a token on a permanent-error ticket, excluding it from sent and receipts", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    const okId = await seedToken(t, userId, "ExponentPushToken[ok]");
    const deadId = await seedToken(t, userId, "ExponentPushToken[dead]");
    const ok2Id = await seedToken(t, userId, "ExponentPushToken[ok2]");

    stubSend((m) =>
      m.to === "ExponentPushToken[dead]"
        ? { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }
        : { status: "ok", id: `rcpt-${m.to}` },
    );

    const res = await t.action(internal.pushSender.sendToUser, { userId, title: "Hi" });
    expect(res).toEqual({ sent: 2, revoked: 1 });

    const dead = await t.run((ctx) => ctx.db.get(deadId));
    expect(dead?.revoked).toBe(true);
    expect(dead?.lastErrorCode).toBe("DeviceNotRegistered");
    expect((await t.run((ctx) => ctx.db.get(okId)))?.revoked).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(ok2Id)))?.revoked).toBe(false);

    // Only the two ok tickets are parked; the dead token's ticket is not.
    const receipts = await t.run((ctx) => ctx.db.query("pushReceipts").collect());
    expect(receipts.map((r) => r.tokenId).toSorted()).toEqual([okId, ok2Id].toSorted());
  });

  test("shapes a silent push with _contentAvailable and no banner fields", async () => {
    const t = initConvexTest();
    const userId = await seedUser(t);
    await seedToken(t, userId, "ExponentPushToken[silent]");

    const chunks = stubSend((m) => ({ status: "ok", id: `rcpt-${m.to}` }));

    const res = await t.action(internal.pushSender.sendToUser, {
      userId,
      title: "ignored",
      body: "ignored",
      data: { kind: "sync" },
      silent: true,
    });
    expect(res).toEqual({ sent: 1, revoked: 0 });

    const msg = chunks[0]![0]!;
    expect(msg._contentAvailable).toBe(true);
    expect(msg.priority).toBe("high");
    expect(msg.data).toEqual({ kind: "sync" });
    expect(msg.title).toBeUndefined();
    expect(msg.body).toBeUndefined();
    expect(msg.sound).toBeUndefined();
  });
});
