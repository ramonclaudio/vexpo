import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema(
  {
    users: defineTable({
      authId: v.string(),
      bio: v.optional(v.string()),
      avatar: v.optional(v.id("_storage")),
      createdAt: v.number(),
      updatedAt: v.number(),
      deletedAt: v.optional(v.number()),
      // Set when the row mirrors an anonymous (guest) Better Auth user, and
      // only then. Linking a guest to a real account deletes this row, so a
      // row that still has the field is a guest who has not signed up yet.
      // `purgeAbandonedGuests` walks the index and drops the ones whose
      // sessions have all expired, since nothing can reach those again.
      guestSince: v.optional(v.number()),
    })
      .index("by_authId", ["authId"])
      .index("by_deletedAt", ["deletedAt"])
      .index("by_guestSince", ["guestSince"]),

    accountDeletionAudit: defineTable({
      userId: v.id("users"),
      authId: v.string(),
      event: v.union(v.literal("requested"), v.literal("restored"), v.literal("permanent")),
      at: v.number(),
    })
      .index("by_userId", ["userId"])
      .index("by_event_and_at", ["event", "at"]),

    // On a permanent Expo Push error we tombstone (set `revoked`) instead of
    // deleting, so a race-condition re-upsert doesn't resurrect a dead token.
    pushTokens: defineTable({
      userId: v.id("users"),
      token: v.string(),
      deviceType: v.literal("ios"),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastSeenAt: v.optional(v.number()),
      // Required, not optional. `cleanupStale` covers the table with two exact
      // ranges, eq(true) and eq(false), so a row written without the field
      // matches neither and can never be cleaned up.
      revoked: v.boolean(),
      revokedAt: v.optional(v.number()),
      lastErrorCode: v.optional(v.string()),
    })
      .index("by_userId", ["userId"])
      .index("by_token", ["token"])
      .index("by_revoked_and_updatedAt", ["revoked", "updatedAt"]),

    // Expo accepts a push at send time (an "ok" ticket) but only reports a
    // dead device later, in the RECEIPT. Each ok ticket id is parked here
    // with the token it was sent to; `pushSender.reconcileReceipts` polls
    // Expo's getReceipts, tombstones the token on a permanent-error receipt,
    // then drops the row. Rows that never get a receipt expire on age.
    pushReceipts: defineTable({
      ticketId: v.string(),
      tokenId: v.id("pushTokens"),
      createdAt: v.number(),
    }).index("by_createdAt", ["createdAt"]),
  },
  { strictTableNameTypes: true },
);
