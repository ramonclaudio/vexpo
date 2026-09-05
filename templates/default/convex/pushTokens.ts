import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation } from "./functions";
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
      revoked: false,
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

export const removeAll = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.user._id))
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
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return rows.filter((r) => !r.revoked).map((r) => ({ _id: r._id, token: r.token }));
  },
});

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

export const recordReceipts = internalMutation({
  args: {
    receipts: v.array(v.object({ ticketId: v.string(), tokenId: v.id("pushTokens") })),
  },
  returns: v.number(),
  handler: async (ctx, { receipts }) => {
    const now = Date.now();
    for (const r of receipts) {
      await ctx.db.insert("pushReceipts", {
        ticketId: r.ticketId,
        tokenId: r.tokenId,
        createdAt: now,
      });
    }
    return receipts.length;
  },
});

export const listPendingReceipts = internalQuery({
  args: { limit: v.number() },
  returns: v.array(
    v.object({
      _id: v.id("pushReceipts"),
      ticketId: v.string(),
      tokenId: v.id("pushTokens"),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("pushReceipts")
      .withIndex("by_createdAt")
      .order("asc")
      .take(limit);
    return rows.map((r) => ({
      _id: r._id,
      ticketId: r.ticketId,
      tokenId: r.tokenId,
      createdAt: r.createdAt,
    }));
  },
});

export const deleteReceipts = internalMutation({
  args: { ids: v.array(v.id("pushReceipts")) },
  returns: v.number(),
  handler: async (ctx, { ids }) => {
    let deleted = 0;
    for (const id of ids) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      await ctx.db.delete(id);
      deleted++;
    }
    return deleted;
  },
});

export const cleanupStale = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const revokedCutoff = now - THIRTY_DAYS_MS;
    const staleCutoff = now - NINETY_DAYS_MS;

    const revoked = await ctx.db
      .query("pushTokens")
      .withIndex("by_revoked_and_updatedAt", (q) =>
        q.eq("revoked", true).lt("updatedAt", revokedCutoff),
      )
      .take(CLEANUP_BATCH);
    const stale = await ctx.db
      .query("pushTokens")
      .withIndex("by_revoked_and_updatedAt", (q) =>
        q.eq("revoked", false).lt("updatedAt", staleCutoff),
      )
      .take(CLEANUP_BATCH);

    const removable = [...revoked, ...stale];
    await Promise.all(removable.map((t) => ctx.db.delete(t._id)));

    if (revoked.length === CLEANUP_BATCH || stale.length === CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.pushTokens.cleanupStale, {});
    }
    return removable.length;
  },
});
