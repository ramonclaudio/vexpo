import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

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
    return { sent: tickets.length, revoked };
  },
});

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
