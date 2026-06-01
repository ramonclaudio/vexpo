import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./functions";
import { rateLimitWithThrow } from "./rateLimit";
import { deviceTypeValidator } from "./validators";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH = 200;

export const upsert = authMutation({
  args: { token: v.string(), deviceType: deviceTypeValidator },
  returns: v.id("pushTokens"),
  handler: async (ctx, { token, deviceType }) => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());
    const now = Date.now();
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (existing) {
      // Same user: refresh timestamps and clear any prior revocation. The
      // client only re-upserts after `getExpoPushTokenAsync` succeeds, so
      // if we get here the token is alive again.
      if (existing.userId === ctx.user._id) {
        await ctx.db.patch(existing._id, {
          updatedAt: now,
          lastSeenAt: now,
          revoked: false,
          revokedAt: undefined,
          lastErrorCode: undefined,
        });
        return existing._id;
      }
      await ctx.db.patch(existing._id, {
        userId: ctx.user._id,
        deviceType,
        updatedAt: now,
        lastSeenAt: now,
        revoked: false,
        revokedAt: undefined,
        lastErrorCode: undefined,
      });
      return existing._id;
    }

    return ctx.db.insert("pushTokens", {
      userId: ctx.user._id,
      token,
      deviceType,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
  },
});

export const remove = authMutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, { token }) => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (existing && existing.userId === ctx.user._id) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

export const list = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("pushTokens"),
      _creationTime: v.number(),
      userId: v.string(),
      token: v.string(),
      deviceType: deviceTypeValidator,
      createdAt: v.number(),
      updatedAt: v.number(),
      lastSeenAt: v.optional(v.number()),
      revoked: v.optional(v.boolean()),
      revokedAt: v.optional(v.number()),
      lastErrorCode: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    return ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();
  },
});

export const removeAll = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();
    await Promise.all(tokens.map((t) => ctx.db.delete(t._id)));
    return null;
  },
});

export const listActiveByUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("pushTokens"),
      token: v.string(),
    }),
  ),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.filter((r) => !r.revoked).map((r) => ({ _id: r._id, token: r.token }));
  },
});

/**
 * Tombstone tokens whose Expo Push receipts came back with a permanent
 * error. The row sticks around for 30 days so a transient client retry
 * doesn't resurrect a dead device, then `cleanupStale` drops it.
 *
 * `errorCode` is one of Expo's documented values: `DeviceNotRegistered`,
 * `InvalidCredentials`, `MismatchSenderId`, etc. Only the permanent codes
 * are passed here; transient errors stay active.
 *
 * https://docs.expo.dev/push-notifications/sending-notifications/#individual-push-notification-errors
 */
export const markRevoked = internalMutation({
  args: {
    tokenIds: v.array(v.id("pushTokens")),
    errorCode: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, { tokenIds, errorCode }) => {
    const now = Date.now();
    let revoked = 0;
    for (const id of tokenIds) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      await ctx.db.patch(id, {
        revoked: true,
        revokedAt: now,
        updatedAt: now,
        lastErrorCode: errorCode,
      });
      revoked++;
    }
    return revoked;
  },
});

/**
 * Daily cleanup. Drops revoked rows older than 30 days and stale rows
 * never re-upserted in 90 days. Bounded batches; reschedules when more
 * rows remain so we never load an unbounded set into memory.
 *
 * The old behavior keyed on `_creationTime`, which deleted long-lived
 * rows even when the device was active. The correct signal is
 * `updatedAt`, which the client touches on every successful re-upsert.
 */
export const cleanupStale = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const revokedCutoff = now - THIRTY_DAYS_MS;
    const staleCutoff = now - NINETY_DAYS_MS;

    const batch = await ctx.db
      .query("pushTokens")
      .withIndex("by_revoked_updatedAt")
      .order("asc")
      .take(CLEANUP_BATCH);

    const removable = batch.filter((t) =>
      t.revoked ? t.updatedAt < revokedCutoff : t.updatedAt < staleCutoff,
    );
    await Promise.all(removable.map((t) => ctx.db.delete(t._id)));

    if (batch.length === CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.pushTokens.cleanupStale, {});
    }
    return removable.length;
  },
});
