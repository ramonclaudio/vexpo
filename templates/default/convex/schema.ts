import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
});
