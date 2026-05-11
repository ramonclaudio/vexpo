/**
 * User Queries and Mutations
 *
 * CRUD operations for the app users table.
 * Identity fields (name, email, username, image) live on the Better Auth user
 * and are merged in at read time by safeGetAuthenticatedUser in auth.ts.
 */

import { v } from "convex/values";

import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
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

/**
 * Delete the current user's account.
 * Removes app-owned data (push tokens) and all Better Auth records.
 * The `users` row is dropped by the auth `onDelete` trigger.
 */
export const deleteAccount = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    const authUserId = ctx.user.authUserId;

    const pushTokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .collect();
    await Promise.all(pushTokens.map((t) => ctx.db.delete(t._id)));

    const authUser = await authComponent.safeGetAuthUser(ctx);

    await deleteAllByUserId(ctx, "session", authUserId);
    await deleteAllByUserId(ctx, "account", authUserId);
    await deleteAllByUserId(ctx, "twoFactor", authUserId);
    await deleteAllByUserId(ctx, "oauthAccessToken", authUserId);
    await deleteAllByUserId(ctx, "oauthConsent", authUserId);
    await deleteAllByUserId(ctx, "oauthApplication", authUserId);
    if (authUser?.email) await deleteVerificationByIdentifier(ctx, authUser.email);

    // Deleting the Better Auth user fires the `onDelete` trigger which
    // removes the matching app users row and frees the avatar blob.
    await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: { model: "user", where: [{ field: "_id", value: authUserId }] },
    });

    return { success: true };
  },
});

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
