import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { authMutation, authQuery } from "./functions";
import { rateLimitWithThrow } from "./rateLimit";
import { deviceTypeValidator } from "./validators";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH = 200;

export const upsert = authMutation({
  args: { token: v.string(), deviceType: deviceTypeValidator },
  returns: v.id("pushTokens"),
  handler: async (ctx, { token, deviceType }) => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());
    const now = Date.now();
    // Token may belong to a different user (device transferred), so read it
    // by token first and reassign if needed.
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (existing) {
      if (existing.userId === ctx.user._id) {
        await ctx.db.patch(existing._id, { updatedAt: now });
        return existing._id;
      }
      // Reassign token to current user (device changed owners)
      await ctx.db.patch(existing._id, {
        userId: ctx.user._id,
        deviceType,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("pushTokens", {
      userId: ctx.user._id,
      token,
      deviceType,
      createdAt: now,
      updatedAt: now,
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

/**
 * Delete push tokens older than 30 days, in bounded batches. Reschedules
 * itself when more rows remain so we never load an unbounded set into memory.
 */
export const cleanupStale = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    const batch = await ctx.db.query("pushTokens").order("asc").take(CLEANUP_BATCH);
    const stale = batch.filter((t) => t._creationTime < cutoff);
    await Promise.all(stale.map((t) => ctx.db.delete(t._id)));
    if (batch.length === CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.pushTokens.cleanupStale, {});
    }
    return stale.length;
  },
});
