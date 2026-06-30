import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

// getReceipts caps at 1000 ids per call; we stay well under and reschedule
// when a full page comes back so a backlog drains without unbounded reads.
const RECEIPT_PAGE = 100;

// Expo keeps receipts for about a day. A row with no receipt by then is a
// lost cause, so drop it instead of polling forever.
const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Permanent failure codes from the Expo Push Service. A receipt or ticket
// with one of these means the device or app install will never accept a
// push again, so the token is tombstoned. Transient codes (rate limit,
// message-too-big, server error) are not in this set; those just log.
//
// https://docs.expo.dev/push-notifications/sending-notifications/#individual-push-notification-errors
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
  // `content-available: 1`-style silent push. Wakes the background task
  // without showing a banner. Pair with `priority: "high"` so iOS doesn't
  // throttle delivery.
  _contentAvailable?: boolean;
  priority?: "default" | "normal" | "high";
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

type ExpoResponse = { data?: ExpoTicket[]; errors?: Array<{ code?: string; message?: string }> };

type ExpoReceipt =
  | { status: "ok" }
  | { status: "error"; message?: string; details?: { error?: string } };

type ExpoReceiptsResponse = {
  data?: Record<string, ExpoReceipt>;
  errors?: Array<{ code?: string; message?: string }>;
};

/**
 * Fan out a push to every active token of `userId`. Tickets returned with
 * a permanent error code mark the originating token revoked so subsequent
 * sends skip it. Transient errors are logged but kept.
 *
 * Best-effort: a single network failure logs and returns; the caller is
 * always a mutation that already committed (account-event hook, scheduled
 * job, etc.), so we never want a push send to surface as a user-facing
 * error.
 */
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
      userId: args.userId as Id<"users">,
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

    let payload: ExpoResponse | null = null;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(messages),
      });
      payload = (await res.json()) as ExpoResponse;
      if (!res.ok) {
        console.warn(`[push] send non-2xx ${res.status}: ${JSON.stringify(payload?.errors)}`);
      }
    } catch (err) {
      console.warn(`[push] send threw: ${err instanceof Error ? err.message : String(err)}`);
      return { sent: 0, revoked: 0 };
    }

    const tickets = payload?.data ?? [];
    const revoked = await reconcileTickets(ctx, tokens, tickets);

    // Park accepted tickets so `reconcileReceipts` can poll for the receipt
    // that reveals a dead device. Order is preserved: tickets[i] -> tokens[i].
    const receipts = tickets.flatMap((ticket, index) => {
      if (ticket.status !== "ok") return [];
      const tokenId = tokens[index]?._id;
      if (!tokenId) return [];
      return [{ ticketId: ticket.id, tokenId }];
    });
    if (receipts.length > 0) {
      await ctx.runMutation(internal.pushTokens.recordReceipts, { receipts });
    }

    return { sent: tickets.length, revoked };
  },
});

/**
 * Poll Expo for the receipts of earlier sends. A ticket accepted at send
 * time (status ok) only reveals a dead device later, in the receipt. So we
 * stored each ok ticket id against its token; here we batch them to
 * getReceipts and tombstone any token whose receipt carries a permanent
 * error code.
 *
 * Scheduled from crons. Best-effort like the send path: a network failure
 * logs and returns, leaving the rows for the next run.
 */
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

    // A full page back means more may be queued; drain on the next tick.
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

/**
 * Decide each pending row's fate from Expo's getReceipts response. A row is
 * "settled" (safe to delete) once Expo returns its receipt, or once it has
 * aged past RECEIPT_MAX_AGE_MS with no receipt. Permanent-error receipts also
 * bucket their token id by error code for revocation. Receipts are keyed by
 * ticket id, so position doesn't matter here.
 */
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
      // Not ready yet. Give up only once it's too old to keep retrying.
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

/**
 * Match each ticket back to its originating token and tombstone tokens
 * whose ticket reported a permanent error. The Expo API preserves order:
 * `tickets[i]` corresponds to `messages[i]`, which corresponds to
 * `tokens[i]`.
 */
async function reconcileTickets(
  ctx: {
    runMutation: (
      ref: typeof internal.pushTokens.markRevoked,
      args: { tokenIds: Id<"pushTokens">[]; errorCode: string },
    ) => Promise<number>;
  },
  tokens: Array<{ _id: Id<"pushTokens">; token: string }>,
  tickets: ExpoTicket[],
): Promise<number> {
  const buckets = new Map<string, Id<"pushTokens">[]>();
  tickets.forEach((ticket, index) => {
    if (ticket.status !== "error") return;
    const code = ticket.details?.error;
    if (!code || !PERMANENT_ERROR_CODES.has(code)) return;
    const tokenId = tokens[index]?._id;
    if (!tokenId) return;
    const list = buckets.get(code) ?? [];
    list.push(tokenId);
    buckets.set(code, list);
  });

  let revoked = 0;
  for (const [code, tokenIds] of buckets) {
    revoked += await ctx.runMutation(internal.pushTokens.markRevoked, {
      tokenIds,
      errorCode: code,
    });
  }
  return revoked;
}
