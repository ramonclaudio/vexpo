/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest";

import { internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { initConvexTest, seedToken, seedUser } from "./_harness";

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

type FetchResult = { ok: boolean; status: number; json: () => Promise<unknown> };

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

    const chunks = stubSend((m) => ({ status: "ok", id: `rcpt-${m.to}` }));

    const res = await t.action(internal.pushSender.sendToUser, {
      userId,
      title: "Hi",
      body: "there",
    });
    expect(res).toEqual({ sent: total, revoked: 0 });

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
    expect(res).toEqual({ sent: 149, revoked: 1 });

    expect((await t.run((ctx) => ctx.db.get(tokenIds[200]!)))?.revoked).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(tokenIds[200]!)))?.lastErrorCode).toBe(
      "DeviceNotRegistered",
    );
    expect((await t.run((ctx) => ctx.db.get(tokenIds[100]!)))?.revoked).toBe(false);

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
