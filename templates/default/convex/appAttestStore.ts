import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

const CLEANUP_BATCH = 200;

export const createChallenge = internalMutation({
  args: { nonce: v.string(), expiresAt: v.number() },
  returns: v.id("appAttestChallenges"),
  handler: async (ctx, args) => {
    return ctx.db.insert("appAttestChallenges", {
      nonce: args.nonce,
      expiresAt: args.expiresAt,
      used: false,
    });
  },
});

/**
 * Single-use challenge consumption. Returns true if the nonce existed,
 * hadn't been used, and hadn't expired. Marks it consumed atomically
 * inside the mutation so a concurrent attempt can't double-spend it.
 */
export const consumeChallenge = internalMutation({
  args: { nonce: v.string(), now: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("appAttestChallenges")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique();
    if (!row) return false;
    if (row.used) return false;
    if (row.expiresAt < args.now) return false;
    await ctx.db.patch(row._id, { used: true });
    return true;
  },
});

export const storeKey = internalMutation({
  args: {
    keyId: v.string(),
    publicKey: v.string(),
    environment: v.union(v.literal("development"), v.literal("production")),
    userId: v.optional(v.id("users")),
    now: v.number(),
  },
  returns: v.id("appAttestKeys"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("appAttestKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", args.keyId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        publicKey: args.publicKey,
        environment: args.environment,
        userId: args.userId ?? existing.userId,
        counter: 0,
        attestedAt: args.now,
      });
      return existing._id;
    }
    return ctx.db.insert("appAttestKeys", {
      keyId: args.keyId,
      publicKey: args.publicKey,
      environment: args.environment,
      userId: args.userId,
      counter: 0,
      attestedAt: args.now,
    });
  },
});

export const findKey = internalQuery({
  args: { keyId: v.string() },
  returns: v.union(
    v.object({
      keyId: v.string(),
      publicKey: v.string(),
      counter: v.number(),
      environment: v.union(v.literal("development"), v.literal("production")),
      userId: v.optional(v.id("users")),
    }),
    v.null(),
  ),
  handler: async (ctx, { keyId }) => {
    const row = await ctx.db
      .query("appAttestKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", keyId))
      .unique();
    if (!row) return null;
    return {
      keyId: row.keyId,
      publicKey: row.publicKey,
      counter: row.counter,
      environment: row.environment,
      userId: row.userId,
    };
  },
});

export const bumpCounter = internalMutation({
  args: { keyId: v.string(), counter: v.number() },
  returns: v.null(),
  handler: async (ctx, { keyId, counter }) => {
    const row = await ctx.db
      .query("appAttestKeys")
      .withIndex("by_keyId", (q) => q.eq("keyId", keyId))
      .unique();
    if (!row) throw new Error("app-attest: bumpCounter against unknown keyId");
    // Re-check monotonicity inside the mutation transaction so two
    // assertions racing through different action invocations can't
    // both win.
    if (counter <= row.counter) {
      throw new Error("app-attest: assertion counter regressed");
    }
    await ctx.db.patch(row._id, { counter });
    return null;
  },
});

export const cleanupChallenges = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const batch = await ctx.db
      .query("appAttestChallenges")
      .withIndex("by_expiresAt")
      .order("asc")
      .take(CLEANUP_BATCH);
    const expired = batch.filter((r) => r.expiresAt < now);
    await Promise.all(expired.map((r) => ctx.db.delete(r._id)));
    if (batch.length === CLEANUP_BATCH && expired.length > 0) {
      await ctx.scheduler.runAfter(0, internal.appAttestStore.cleanupChallenges, {});
    }
    return expired.length;
  },
});
