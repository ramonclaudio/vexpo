/**
 * User Queries and Mutations
 *
 * CRUD operations for the app users table.
 * Identity fields (name, email, username, image) live on the Better Auth user
 * and are merged in at read time by safeGetAuthenticatedUser in auth.ts.
 */

import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { authComponent, authUserValidator } from "./auth";
import { validationError } from "./errors";
import { authMutation, optionalAuthQuery } from "./functions";
import { rateLimitWithThrow } from "./rateLimit";
import {
  paginatedUsersValidator,
  publicUserProfileValidator,
  userProfileUpdateFields,
  validateBio,
} from "./validators";

// ============================================================================
// Queries
// ============================================================================

/**
 * Get the current authenticated user's profile with resolved avatar URL.
 * Returns null when unauthenticated.
 */
export const getMe = optionalAuthQuery({
  args: {},
  returns: v.union(authUserValidator, v.null()),
  handler: async (ctx) => {
    return ctx.user ?? null;
  },
});

/**
 * Get a user by app user id with Better Auth identity fields merged in.
 * Accepts an arbitrary string and normalizes it via `ctx.db.normalizeId`,
 * so untrusted inputs can be passed straight through. Returns null when the
 * id is malformed or either record is missing.
 */
export const getUser = optionalAuthQuery({
  args: { userId: v.string() },
  returns: v.union(publicUserProfileValidator, v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("users", args.userId);
    if (!id) return null;

    const user = await ctx.db.get(id);
    if (!user) return null;

    const authUser = await authComponent.getAnyUserById(ctx, user.authId);
    if (!authUser) return null;

    const avatarUrl = user.avatar
      ? await ctx.storage.getUrl(user.avatar)
      : (authUser.image ?? null);

    return {
      _id: user._id,
      _creationTime: user._creationTime,
      name: authUser.name,
      username:
        (authUser as { displayUsername?: string | null }).displayUsername ??
        (authUser as { username?: string | null }).username ??
        null,
      avatarUrl,
      bio: user.bio,
    };
  },
});

/**
 * List users (paginated) with Better Auth identity fields merged in.
 * Entries with a missing Better Auth record are skipped.
 */
export const listUsers = optionalAuthQuery({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: paginatedUsersValidator,
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);

    const results = await ctx.db
      .query("users")
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });

    const page = await Promise.all(
      results.page.map(async (user) => {
        const authUser = await authComponent.getAnyUserById(ctx, user.authId);
        if (!authUser) return null;
        const avatarUrl = user.avatar
          ? await ctx.storage.getUrl(user.avatar)
          : (authUser.image ?? null);
        return {
          _id: user._id,
          _creationTime: user._creationTime,
          name: authUser.name,
          username:
            (authUser as { displayUsername?: string | null }).displayUsername ??
            (authUser as { username?: string | null }).username ??
            null,
          avatarUrl,
          bio: user.bio,
        };
      }),
    );

    return {
      page: page.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      continueCursor: results.continueCursor,
      isDone: results.isDone,
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Update the current user's bio. Name and username changes go through
 * Better Auth directly via authClient.updateUser on the client.
 */
export const updateProfile = authMutation({
  args: userProfileUpdateFields,
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    if (args.bio !== undefined) {
      const result = validateBio(args.bio);
      if (!result.valid) throw validationError(result.error!, "bio");
    }

    await ctx.db.patch(ctx.user._id, {
      bio: args.bio,
      updatedAt: Date.now(),
    });

    return ctx.user._id;
  },
});

/**
 * Generate an upload URL for avatar images.
 * The URL expires in 1 hour.
 */
export const generateAvatarUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "avatarUpload", ctx.user._id.toString());
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Update the current user's avatar with a storage id.
 * Deletes the previous uploaded avatar from storage if one exists.
 * Does not touch Better Auth's image field - that's for provider-supplied URLs.
 */
export const updateAvatar = authMutation({
  args: { storageId: v.id("_storage") },
  returns: v.object({ avatarUrl: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    if (ctx.user.avatar) await ctx.storage.delete(ctx.user.avatar);

    await ctx.db.patch(ctx.user._id, {
      avatar: args.storageId,
      updatedAt: Date.now(),
    });

    return { avatarUrl: await ctx.storage.getUrl(args.storageId) };
  },
});

/**
 * Delete the current user's uploaded avatar.
 * Removes the file from storage and clears the avatar field. After deletion,
 * Better Auth's image (e.g. OAuth provider avatar) is used as the fallback.
 */
export const deleteAvatar = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    if (ctx.user.avatar) await ctx.storage.delete(ctx.user.avatar);

    await ctx.db.patch(ctx.user._id, {
      avatar: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// 30-day grace window between a user requesting deletion and the row
// being permanently purged. Apple's 5.1.1(v) requires deletability from
// within the app; the window itself is industry convention so a confused
// tap can be recovered. After it expires, `internal.users.hardDeleteExpired`
// purges everything irreversibly.
export const ACCOUNT_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const HARD_DELETE_BATCH = 50;

/**
 * Tombstone the current user's account.
 *
 * Signs the user out everywhere, drops push tokens so notifications stop,
 * marks the user row with `deletedAt`. Better Auth credentials (the user
 * record + email/password account, Apple account) stay intact until the
 * 30-day window expires so a returning user can call `restoreAccount`
 * to undo the request.
 *
 * Apple `revokeRefreshToken` runs at the hard-delete pass, not here, so
 * a user who restores within the window can still use Sign in with Apple
 * without re-granting authorization in iOS Settings.
 */
export const deleteAccount = authMutation({
  args: {},
  returns: v.object({ success: v.boolean(), deletedAt: v.number() }),
  handler: async (ctx) => {
    // Reversible within the window, but still a destructive action by
    // intent. Strictest rate limit bucket. Reserves let a legitimate
    // single call succeed even if the bucket is empty from earlier writes.
    await rateLimitWithThrow(ctx, "criticalAction", ctx.user._id.toString());
    const authUserId = ctx.user.authUserId;
    const userId = ctx.user._id;
    const now = Date.now();

    // Already tombstoned: no-op. Idempotent in case the client retries.
    if (ctx.user.deletedAt) {
      return { success: true, deletedAt: ctx.user.deletedAt };
    }

    // Stop notifications immediately. Push tokens carry no recovery value,
    // and a re-signed-in client re-registers via `pushTokens.upsert`.
    const pushTokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(pushTokens.map((t) => ctx.db.delete(t._id)));

    // Sign the user out everywhere. Better Auth keeps the user record so
    // the account can be restored.
    await deleteAllByUserId(ctx, "session", authUserId);

    await ctx.db.patch(userId, { deletedAt: now, updatedAt: now });

    await ctx.db.insert("accountDeletionAudit", {
      userId,
      authId: authUserId,
      event: "requested",
      at: now,
    });

    return { success: true, deletedAt: now };
  },
});

/**
 * Lift a pending deletion. Called when a tombstoned user signs back in
 * within the grace window and chooses to restore.
 */
export const restoreAccount = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "criticalAction", ctx.user._id.toString());
    const now = Date.now();
    if (!ctx.user.deletedAt) return { success: true };

    await ctx.db.patch(ctx.user._id, { deletedAt: undefined, updatedAt: now });
    await ctx.db.insert("accountDeletionAudit", {
      userId: ctx.user._id,
      authId: ctx.user.authUserId,
      event: "restored",
      at: now,
    });

    return { success: true };
  },
});

/**
 * Daily cron pass: irreversibly purge users whose tombstone is older
 * than the grace window.
 *
 * For each expired user:
 *   - revoke any Apple Sign In refresh tokens (Apple App Store guideline
 *     5.1.1(v): "If people used Sign in with Apple to create an account
 *     within your app, you revoke the associated tokens when they delete
 *     their account.")
 *   - drop every Better Auth row keyed to the user (sessions, accounts,
 *     twoFactor, oauth, verification)
 *   - delete the Better Auth user, which fires the `onDelete` trigger
 *     that drops the app users row and frees the avatar blob
 *   - write an audit row for compliance
 *
 * Processed in bounded batches; reschedules itself when more rows remain
 * so the mutation never holds an unbounded set in memory.
 */
export const hardDeleteExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - ACCOUNT_DELETION_GRACE_MS;
    const expired = await ctx.db
      .query("users")
      .withIndex("by_deletedAt")
      .order("asc")
      .take(HARD_DELETE_BATCH);

    const purgeable = expired.filter(
      (u) => typeof u.deletedAt === "number" && u.deletedAt < cutoff,
    );

    for (const user of purgeable) {
      await purgeUser(ctx, user.authId, user._id);
    }

    if (expired.length === HARD_DELETE_BATCH && purgeable.length > 0) {
      await ctx.scheduler.runAfter(0, internal.users.hardDeleteExpired, {});
    }

    return purgeable.length;
  },
});

async function purgeUser(ctx: MutationCtx, authUserId: string, userId: Id<"users">): Promise<void> {
  // Snapshot the email before tearing down Better Auth so we can also
  // drop any pending verification rows keyed on it.
  const authUser = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: authUserId }],
  })) as { email?: string } | null;

  // Revoke Apple Sign In refresh tokens before deleting the account rows.
  // Schedule (not await) so a slow Apple endpoint doesn't hold the
  // mutation transaction open.
  const appleAccounts = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "account",
    where: [
      { field: "userId", value: authUserId },
      { field: "providerId", value: "apple", connector: "AND" },
    ],
    paginationOpts: { numItems: 100, cursor: null },
  })) as { page: Array<Record<string, unknown>> };
  for (const account of appleAccounts.page) {
    const token = account.refreshToken;
    if (typeof token === "string" && token.length > 0) {
      await ctx.scheduler.runAfter(0, internal.apple.revokeRefreshToken, {
        refreshToken: token,
      });
    }
  }

  await deleteAllByUserId(ctx, "session", authUserId);
  await deleteAllByUserId(ctx, "account", authUserId);
  await deleteAllByUserId(ctx, "twoFactor", authUserId);
  await deleteAllByUserId(ctx, "oauthAccessToken", authUserId);
  await deleteAllByUserId(ctx, "oauthConsent", authUserId);
  await deleteAllByUserId(ctx, "oauthApplication", authUserId);
  if (authUser?.email) await deleteVerificationByIdentifier(ctx, authUser.email);

  // Deleting the Better Auth user fires the `onDelete` trigger which
  // drops the matching app users row and frees the avatar blob.
  await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
    input: { model: "user", where: [{ field: "_id", value: authUserId }] },
  });

  await ctx.db.insert("accountDeletionAudit", {
    userId,
    authId: authUserId,
    event: "permanent",
    at: Date.now(),
  });
}

type UserIdModel =
  | "session"
  | "account"
  | "twoFactor"
  | "oauthAccessToken"
  | "oauthConsent"
  | "oauthApplication";

const deleteAllByUserId = async (ctx: MutationCtx, model: UserIdModel, userId: string) => {
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const result = (await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: { model, where: [{ field: "userId", value: userId }] },
      paginationOpts: { numItems: 100, cursor },
    })) as { isDone: boolean; continueCursor: string };
    isDone = result.isDone;
    cursor = result.continueCursor;
  }
};

const deleteVerificationByIdentifier = async (ctx: MutationCtx, identifier: string) => {
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const result = (await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: { model: "verification", where: [{ field: "identifier", value: identifier }] },
      paginationOpts: { numItems: 100, cursor },
    })) as { isDone: boolean; continueCursor: string };
    isDone = result.isDone;
    cursor = result.continueCursor;
  }
};
