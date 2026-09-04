import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

const PUSH_CHUNK = 100;

export const RECEIPT_PAGE = 100;

const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PERMANENT_ERROR_CODES = new Set([
  "DeviceNotRegistered",
  "InvalidCredentials",
  "MismatchSenderId",
]);

type ExpoMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  _contentAvailable?: boolean;
  priority?: "default" | "normal" | "high";
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

type PushToken = { _id: Id<"pushTokens">; token: string };

type TicketEntry = { ticket: ExpoTicket; token: PushToken };

type ExpoResponse = { data?: ExpoTicket[]; errors?: Array<{ code?: string; message?: string }> };

type ExpoReceipt =
  | { status: "ok" }
  | { status: "error"; message?: string; details?: { error?: string } };

type ExpoReceiptsResponse = {
  data?: Record<string, ExpoReceipt>;
  errors?: Array<{ code?: string; message?: string }>;
};

export const sendToUser = internalAction({
  args: {
    userId: v.id("users"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    data: v.optional(v.record(v.string(), v.any())),
    silent: v.optional(v.boolean()),
  },
  returns: v.object({
    sent: v.number(),
    revoked: v.number(),
  }),
  handler: async (ctx, args) => {
    const tokens = await ctx.runQuery(internal.pushTokens.listActiveByUser, {
      userId: args.userId,
    });
    if (tokens.length === 0) return { sent: 0, revoked: 0 };

    const messages: ExpoMessage[] = tokens.map((t) => {
      const m: ExpoMessage = { to: t.token, priority: "high" };
      if (args.silent) {
        m._contentAvailable = true;
        if (args.data) m.data = args.data;
      } else {
        if (args.title) m.title = args.title;
        if (args.body) m.body = args.body;
        if (args.data) m.data = args.data;
        m.sound = "default";
      }
      return m;
    });

    const entries: TicketEntry[] = [];
    for (let i = 0; i < messages.length; i += PUSH_CHUNK) {
      const chunk = messages.slice(i, i + PUSH_CHUNK);
      const slice = tokens.slice(i, i + PUSH_CHUNK);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(chunk),
        });
        const payload = (await res.json()) as ExpoResponse;
        if (!res.ok) {
          console.warn(`[push] send non-2xx ${res.status}: ${JSON.stringify(payload?.errors)}`);
          continue;
        }
        (payload?.data ?? []).forEach((ticket, j) => {
          const token = slice[j];
          if (token) entries.push({ ticket, token });
        });
      } catch (err) {
        console.warn(`[push] send threw: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
    }
    const revoked = await reconcileTickets(ctx, entries);

    const receipts = entries.flatMap(({ ticket, token }) =>
      ticket.status === "ok" ? [{ ticketId: ticket.id, tokenId: token._id }] : [],
    );
    if (receipts.length > 0) {
      await ctx.runMutation(internal.pushTokens.recordReceipts, { receipts });
    }

    return { sent: entries.filter((e) => e.ticket.status === "ok").length, revoked };
  },
});

export const reconcileReceipts = internalAction({
  args: {},
  returns: v.object({ checked: v.number(), revoked: v.number(), pruned: v.number() }),
  handler: async (ctx): Promise<{ checked: number; revoked: number; pruned: number }> => {
    const pending = await ctx.runQuery(internal.pushTokens.listPendingReceipts, {
      limit: RECEIPT_PAGE,
    });
    if (pending.length === 0) return { checked: 0, revoked: 0, pruned: 0 };

    let receipts: Record<string, ExpoReceipt> = {};
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify({ ids: pending.map((p) => p.ticketId) }),
      });
      const payload = (await res.json()) as ExpoReceiptsResponse;
      if (!res.ok) {
        console.warn(
          `[push] getReceipts non-2xx ${res.status}: ${JSON.stringify(payload?.errors)}`,
        );
      }
      receipts = payload?.data ?? {};
    } catch (err) {
      console.warn(`[push] getReceipts threw: ${err instanceof Error ? err.message : String(err)}`);
      return { checked: 0, revoked: 0, pruned: 0 };
    }

    const { revoke, settled } = planReceiptReconciliation(pending, receipts, Date.now());
    let revoked = 0;
    for (const [code, tokenIds] of revoke) {
      revoked += await ctx.runMutation(internal.pushTokens.markRevoked, {
        tokenIds,
        errorCode: code,
      });
    }
    if (settled.length > 0) {
      await ctx.runMutation(internal.pushTokens.deleteReceipts, { ids: settled });
    }

    if (pending.length === RECEIPT_PAGE) {
      await ctx.scheduler.runAfter(0, internal.pushSender.reconcileReceipts, {});
    }
    return { checked: pending.length, revoked, pruned: settled.length };
  },
});

type PendingReceipt = {
  _id: Id<"pushReceipts">;
  ticketId: string;
  tokenId: Id<"pushTokens">;
  createdAt: number;
};

function planReceiptReconciliation(
  pending: PendingReceipt[],
  receipts: Record<string, ExpoReceipt>,
  now: number,
): { revoke: Map<string, Id<"pushTokens">[]>; settled: Id<"pushReceipts">[] } {
  const revoke = new Map<string, Id<"pushTokens">[]>();
  const settled: Id<"pushReceipts">[] = [];
  for (const row of pending) {
    const receipt = receipts[row.ticketId];
    if (!receipt) {
      if (now - row.createdAt >= RECEIPT_MAX_AGE_MS) settled.push(row._id);
      continue;
    }
    settled.push(row._id);
    if (receipt.status !== "error") continue;
    const code = receipt.details?.error;
    if (!code || !PERMANENT_ERROR_CODES.has(code)) continue;
    const list = revoke.get(code) ?? [];
    list.push(row.tokenId);
    revoke.set(code, list);
  }
  return { revoke, settled };
}

async function reconcileTickets(ctx: ActionCtx, entries: TicketEntry[]): Promise<number> {
  const buckets = new Map<string, Id<"pushTokens">[]>();
  for (const { ticket, token } of entries) {
    if (ticket.status !== "error") continue;
    const code = ticket.details?.error;
    if (!code || !PERMANENT_ERROR_CODES.has(code)) continue;
    const list = buckets.get(code) ?? [];
    list.push(token._id);
    buckets.set(code, list);
  }

  let revoked = 0;
  for (const [code, tokenIds] of buckets) {
    revoked += await ctx.runMutation(internal.pushTokens.markRevoked, {
      tokenIds,
      errorCode: code,
    });
  }
  return revoked;
}
