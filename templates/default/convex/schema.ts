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

    pushTokens: defineTable({
      userId: v.id("users"),
      token: v.string(),
      deviceType: v.literal("ios"),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastSeenAt: v.optional(v.number()),
      revoked: v.boolean(),
      revokedAt: v.optional(v.number()),
      lastErrorCode: v.optional(v.string()),
    })
      .index("by_userId", ["userId"])
      .index("by_token", ["token"])
      .index("by_revoked_and_updatedAt", ["revoked", "updatedAt"]),

    pushReceipts: defineTable({
      ticketId: v.string(),
      tokenId: v.id("pushTokens"),
      createdAt: v.number(),
    }).index("by_createdAt", ["createdAt"]),
  },
  { strictTableNameTypes: true },
);
