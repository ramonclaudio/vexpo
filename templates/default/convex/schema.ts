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

    // We expire unused challenges after the TTL so a stolen App Attest
    // challenge can't be replayed later.
    appAttestChallenges: defineTable({
      nonce: v.string(),
      expiresAt: v.number(),
      used: v.optional(v.boolean()),
    })
      .index("by_nonce", ["nonce"])
      .index("by_expiresAt", ["expiresAt"]),

    appAttestKeys: defineTable({
      // Apple's keyId (base64-encoded SHA256 of the public key per
      // App Attest spec).
      keyId: v.string(),
      publicKey: v.string(),
      // Monotonic counter from the most recent assertion. Reject any
      // assertion with a counter not strictly greater than this.
      counter: v.number(),
      // Dev attestations (`appattestdevelop`) are allowed in non-production
      // Convex env but should never appear in a production app's signed binary.
      environment: v.union(v.literal("development"), v.literal("production")),
      attestedAt: v.number(),
      userId: v.optional(v.id("users")),
    })
      .index("by_keyId", ["keyId"])
      .index("by_user", ["userId"]),
  },
  { strictTableNameTypes: true },
);
