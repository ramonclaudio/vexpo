import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema(
  {
    // App-specific user row mirrored from Better Auth via auth triggers.
    // Identity fields (name, email, username, image) live on the Better Auth
    // user component and are merged in at read time by safeGetAuthenticatedUser.
    //
    // `deletedAt` is the soft-delete tombstone. Set when the user calls
    // `users.deleteAccount`. The daily `users.hardDeleteExpired` cron
    // permanently removes the row 30 days after this timestamp. Within
    // the window, the user can sign back in and restore the account.
    users: defineTable({
      authId: v.string(),
      bio: v.optional(v.string()),
      avatar: v.optional(v.id("_storage")),
      createdAt: v.number(),
      updatedAt: v.number(),
      deletedAt: v.optional(v.number()),
    })
      .index("authId", ["authId"])
      // Cron scan ordered by tombstone time so the hard-delete pass walks
      // the smallest set possible.
      .index("by_deletedAt", ["deletedAt"]),

    // Audit log for the account-deletion lifecycle. One row per state
    // transition (`requested`, `restored`, `permanent`) per user. Kept
    // around after the underlying user row is purged so compliance can
    // reconstruct who requested deletion and when it was honored.
    accountDeletionAudit: defineTable({
      userId: v.id("users"),
      authId: v.string(),
      event: v.union(v.literal("requested"), v.literal("restored"), v.literal("permanent")),
      at: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_event_at", ["event", "at"]),

    // Expo push tokens. One row per device per user; tokens can transfer
    // ownership when a device is signed into a different account.
    //
    // Lifecycle:
    //   - Active token: `revoked` falsy, `lastSeenAt` close to now.
    //   - Stale token: client never re-upserted. Eligible for cleanup
    //     once `updatedAt` is older than 90 days (token may still be
    //     valid; the user just hasn't opened the app).
    //   - Revoked token: the Expo Push receipt returned a permanent error
    //     (`DeviceNotRegistered`, `InvalidCredentials`). We tombstone
    //     instead of deleting so a race-condition re-upsert doesn't
    //     resurrect a dead token; the daily cleanup cron hard-deletes
    //     revoked rows after 30 days.
    pushTokens: defineTable({
      userId: v.id("users"),
      token: v.string(),
      deviceType: v.literal("ios"),
      createdAt: v.number(),
      updatedAt: v.number(),
      // Most-recent successful upsert from the client. Distinct from
      // `updatedAt`, which also moves on revoke / error patches.
      lastSeenAt: v.optional(v.number()),
      // Set when the Expo Push Service returns a permanent error. Excluded
      // from fan-out and dropped from the table 30 days after revocation.
      revoked: v.optional(v.boolean()),
      revokedAt: v.optional(v.number()),
      lastErrorCode: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_token", ["token"])
      // Cleanup scan: walk rows ordered by (revoked, updatedAt) so the
      // daily cron picks up revoked + stale tokens without loading the
      // whole table.
      .index("by_revoked_updatedAt", ["revoked", "updatedAt"]),

    // Apple App Attest challenges. The client requests a fresh nonce
    // before generating an attestation or assertion; we verify the same
    // nonce was used and expire any unused ones after the TTL so a
    // stolen challenge can't be replayed later.
    //
    // Nonces are 32 bytes, base64url-encoded for transport.
    appAttestChallenges: defineTable({
      nonce: v.string(),
      expiresAt: v.number(),
      // Whether this challenge has been consumed. Single-use.
      used: v.optional(v.boolean()),
    })
      .index("by_nonce", ["nonce"])
      .index("by_expiresAt", ["expiresAt"]),

    // Verified App Attest keys. Created on first `verifyAttestation` and
    // referenced by every subsequent `verifyAssertion`. `publicKey` is
    // the DER-encoded SubjectPublicKeyInfo, `counter` is the monotonic
    // signCount from authenticatorData.
    appAttestKeys: defineTable({
      // Apple's keyId (base64-encoded SHA256 of the public key per
      // App Attest spec).
      keyId: v.string(),
      // SubjectPublicKeyInfo, DER-encoded, base64url-encoded for storage.
      publicKey: v.string(),
      // Monotonic counter from the most recent assertion. Increments on
      // each successful verifyAssertion. Reject any assertion with a
      // counter not strictly greater than this.
      counter: v.number(),
      // Whether this key was attested with the production AAGUID. Dev
      // attestations (`appattestdevelop`) are allowed in non-production
      // Convex env but should never appear in a production app's
      // signed binary.
      environment: v.union(v.literal("development"), v.literal("production")),
      attestedAt: v.number(),
      // Optional: link the key to a user once they sign in. Lets the
      // server bind subsequent assertions to a session.
      userId: v.optional(v.id("users")),
    })
      .index("by_keyId", ["keyId"])
      .index("by_user", ["userId"]),
  },
  { strictTableNameTypes: true },
);
