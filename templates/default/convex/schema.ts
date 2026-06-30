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
    })
      .index("authId", ["authId"])
      .index("by_deletedAt", ["deletedAt"]),

    accountDeletionAudit: defineTable({
      userId: v.id("users"),
      authId: v.string(),
      event: v.union(v.literal("requested"), v.literal("restored"), v.literal("permanent")),
      at: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_event_at", ["event", "at"]),

    // On a permanent Expo Push error we tombstone (set `revoked`) instead of
    // deleting, so a race-condition re-upsert doesn't resurrect a dead token.
    pushTokens: defineTable({
      userId: v.id("users"),
      token: v.string(),
      deviceType: v.literal("ios"),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastSeenAt: v.optional(v.number()),
      revoked: v.optional(v.boolean()),
      revokedAt: v.optional(v.number()),
      lastErrorCode: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_token", ["token"])
      .index("by_revoked_updatedAt", ["revoked", "updatedAt"]),

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
