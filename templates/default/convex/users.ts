import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import {
  SESSION_MAX_AGE_MS,
  authComponent,
  authUserValidator,
  getUserByAuthId,
  purgeAppUser,
} from "./auth";
import { validationError } from "./errors";
import { authMutation, optionalAuthQuery } from "./functions";
import { rateLimitWithThrow } from "./rateLimit";
import { publicUserProfileValidator, userProfileUpdateFields, validateBio } from "./validators";

export const getMe = optionalAuthQuery({
  args: {},
  returns: v.union(authUserValidator, v.null()),
  handler: async (ctx) => {
    return ctx.user ?? null;
  },
});

/**
 * Accepts an arbitrary string and normalizes it via `ctx.db.normalizeId`,
 * so untrusted inputs can be passed straight through.
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

export const generateAvatarUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "avatarUpload", ctx.user._id.toString());
    return await ctx.storage.generateUploadUrl();
  },
});

/**
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
 * Moves a guest's rows onto the account they just signed in or signed up with.
 *
 * Called from the anonymous plugin's `onLinkAccount`, which runs in the same
 * request as the sign-in, after the real account exists and before Better Auth
 * deletes the guest user. That delete fires the `onDelete` trigger, which drops
 * the guest `users` row and frees whatever `_storage` blob it still points at,
 * so anything worth keeping has to move (and be un-pointed on the guest row)
 * here.
 *
 * Scaffold note: `bio`, the avatar blob, and push tokens are all this template
 * owns. Add your own tables to the same mutation as you add them.
 */
export const mergeGuestData = internalMutation({
  args: { guestAuthId: v.string(), authId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.guestAuthId === args.authId) return null;

    const target = await getUserByAuthId(ctx, args.authId);
    // The trigger that creates this row runs inside the same adapter mutation
    // that created the auth user, so a missing row is a broken invariant, not
    // a race. Silently dropping the merge would lose the guest's data.
    if (!target) throw new Error(`mergeGuestData: no users row for authId ${args.authId}`);

    const guest = await getUserByAuthId(ctx, args.guestAuthId);
    if (!guest) return null;

    const now = Date.now();
    const patch: { bio?: string; avatar?: Id<"_storage">; updatedAt: number } = { updatedAt: now };

    // Never clobber. Someone signing in to an existing account keeps the
    // profile they already had, and the guest's copy falls away with the row.
    if (guest.bio !== undefined && target.bio === undefined) patch.bio = guest.bio;
    if (guest.avatar !== undefined && target.avatar === undefined) {
      patch.avatar = guest.avatar;
      await ctx.db.patch(guest._id, { avatar: undefined });
    }

    // Same device, so the guest's push token can already be on the target
    // account from an earlier session. Repoint what is new, drop the duplicate.
    const guestTokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", guest._id))
      .collect();
    for (const token of guestTokens) {
      const sameToken = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", token.token))
        .collect();
      const duplicate = sameToken.some((r) => r._id !== token._id && r.userId === target._id);
      if (duplicate) await ctx.db.delete(token._id);
      else await ctx.db.patch(token._id, { userId: target._id, updatedAt: now });
    }

    await ctx.db.patch(target._id, patch);
    return null;
  },
});

/**
 * A guest has no email, so there is nothing to sign back in with and the
 * 30-day restore window in `deleteAccount` would be a window onto nothing.
 * This purges immediately instead. The client signs out straight after.
 */
export const discardGuest = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    if (!ctx.user.isAnonymous) throw validationError("This is not a guest session");
    await rateLimitWithThrow(ctx, "criticalAction", ctx.user._id.toString());
    await purgeUser(ctx, ctx.user.authUserId, ctx.user._id, { audit: false });
    return { success: true };
  },
});

/**
 * Guests that can never come back.
 *
 * A guest has no credentials, so the session cookie on their device is the
 * only way back to their row. Better Auth refreshes `expiresAt` on use and
 * lets it lapse after `session.expiresIn` idle, so "every session expired" is
 * exactly "unreachable", and that is the purge rule: no cap from creation, a
 * daily guest is kept forever and a one-visit install is gone a week later.
 *
 * Guests younger than the session lifetime are skipped by index range, since
 * their session cannot have expired yet. Everyone older gets one component
 * read per sweep. A cursor walks the range so old guests with live sessions
 * (which stay at the head of the index) never starve the ones behind them.
 */
export const purgeAbandonedGuests = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const oldEnough = now - SESSION_MAX_AGE_MS;
    const page = await ctx.db
      .query("users")
      .withIndex("by_guestSince", (q) => q.gt("guestSince", undefined).lt("guestSince", oldEnough))
      .paginate({ numItems: HARD_DELETE_BATCH, cursor: args.cursor ?? null });

    let purged = 0;
    for (const guest of page.page) {
      if (await hasLiveSession(ctx, guest.authId, now)) continue;
      await purgeUser(ctx, guest.authId, guest._id, { audit: false });
      purged++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.users.purgeAbandonedGuests, {
        cursor: page.continueCursor,
      });
    }

    return purged;
  },
});

async function hasLiveSession(ctx: MutationCtx, authUserId: string, now: number) {
  const sessions = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "session",
    where: [{ field: "userId", value: authUserId }],
    paginationOpts: { numItems: 100, cursor: null },
  })) as { page: Array<{ expiresAt: number }> };
  return sessions.page.some((s) => s.expiresAt > now);
}

// 30-day grace window between a user requesting deletion and the row
// being permanently purged. Apple's 5.1.1(v) requires deletability from
// within the app; the window lets a confused tap be recovered. After it
// expires, `internal.users.hardDeleteExpired` purges everything irreversibly.
export const ACCOUNT_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const HARD_DELETE_BATCH = 50;

/**
 * Better Auth credentials stay intact until the 30-day window expires so a
 * returning user can call `restoreAccount` to undo the request.
 *
 * Apple `revokeRefreshToken` runs at the hard-delete pass, not here, so
 * a user who restores within the window can still use Sign in with Apple
 * without re-granting authorization in iOS Settings.
 */
export const deleteAccount = authMutation({
  args: {},
  returns: v.object({ success: v.boolean(), deletedAt: v.number() }),
  handler: async (ctx) => {
    await rateLimitWithThrow(ctx, "criticalAction", ctx.user._id.toString());
    const authUserId = ctx.user.authUserId;
    const userId = ctx.user._id;
    const now = Date.now();

    if (ctx.user.deletedAt) {
      return { success: true, deletedAt: ctx.user.deletedAt };
    }

    const pushTokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(pushTokens.map((t) => ctx.db.delete(t._id)));

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
 * Revokes Apple Sign In refresh tokens per Apple App Store guideline
 * 5.1.1(v): "If people used Sign in with Apple to create an account
 * within your app, you revoke the associated tokens when they delete
 * their account."
 *
 * Purging tears down the Better Auth rows and then the app row and its
 * avatar blob, which `purgeUser` does by hand: see the note there.
 */
export const hardDeleteExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - ACCOUNT_DELETION_GRACE_MS;
    // Range to rows that have `deletedAt` set. Convex orders
    // `undefined < null < numbers`, so an unbounded scan returns every active
    // user (deletedAt unset) before any tombstone, and the purge would never
    // reach a soft-deleted row once active users exceed the batch size.
    const expired = await ctx.db
      .query("users")
      .withIndex("by_deletedAt", (q) => q.gt("deletedAt", undefined))
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

async function purgeUser(
  ctx: MutationCtx,
  authUserId: string,
  userId: Id<"users">,
  { audit = true }: { audit?: boolean } = {},
): Promise<void> {
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

  await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
    input: { model: "user", where: [{ field: "_id", value: authUserId }] },
  });

  // The `user.onDelete` trigger only runs when Better Auth itself drives the
  // delete: the component attaches the trigger handle, and calling its adapter
  // straight from here (which is the only way to purge a user with no live
  // session) doesn't. Drop this and every hard-deleted account leaves an
  // orphan row and a blob that nothing ever collects.
  await purgeAppUser(ctx, authUserId);

  // Guests are swept, not deleted on request, so they leave no audit trail.
  // The table is a record of what users asked for, not of every row we drop.
  if (audit) {
    await ctx.db.insert("accountDeletionAudit", {
      userId,
      authId: authUserId,
      event: "permanent",
      at: Date.now(),
    });
  }
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
