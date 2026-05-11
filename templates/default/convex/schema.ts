import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema(
  {
    // App-specific user row mirrored from Better Auth via auth triggers.
    // Identity fields (name, email, username, image) live on the Better Auth
    // user component and are merged in at read time by safeGetAuthenticatedUser.
    users: defineTable({
      authId: v.string(),
      bio: v.optional(v.string()),
      avatar: v.optional(v.id("_storage")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("authId", ["authId"]),

    pushTokens: defineTable({
      userId: v.id("users"),
      token: v.string(),
      deviceType: v.literal("ios"),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_token", ["token"]),
  },
  { strictTableNameTypes: true },
);
